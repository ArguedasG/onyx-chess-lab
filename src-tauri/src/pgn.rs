use std::{
    fs::{File, OpenOptions},
    io::{self, BufRead, BufReader, Read, Seek, SeekFrom, Write},
    path::PathBuf,
};

use crate::{error::Error, AppState};

const GAME_OFFSET_FREQ: usize = 100;

struct PgnParser {
    reader: BufReader<File>,
    line: String,
    game: String,
    start: u64,
}

impl PgnParser {
    fn new(file: File) -> Self {
        let mut reader = BufReader::new(file);
        let start = ignore_bom(&mut reader).unwrap_or(0);
        Self {
            reader,
            line: String::new(),
            game: String::new(),
            start,
        }
    }

    fn position(&mut self) -> io::Result<u64> {
        self.reader.stream_position()
    }

    fn offset_by_index(&mut self, n: usize, state: &AppState, file: &String) -> io::Result<()> {
        let offset_index = n / GAME_OFFSET_FREQ;
        let n_left = n % GAME_OFFSET_FREQ;
        let wrapped_pgn_offsets = state.pgn_offsets.get(file);
        if wrapped_pgn_offsets.is_none() {
            self.reader.seek(SeekFrom::Start(self.start))?;
            self.skip_games(n)?;
            return Ok(());
        }
        let pgn_offsets = wrapped_pgn_offsets.unwrap();

        if offset_index == 0 || offset_index < pgn_offsets.len() {
            let offset = match offset_index {
                0 => self.start,
                _ => pgn_offsets[offset_index - 1],
            };

            self.reader.seek(SeekFrom::Start(offset))?;

            self.skip_games(n_left)?;
        } else {
            self.reader.seek(SeekFrom::Start(self.start))?;
            self.skip_games(n)?;
        }

        Ok(())
    }

    /// Skip n games, and return the number of bytes read
    fn skip_games(&mut self, n: usize) -> io::Result<usize> {
        let mut new_game = false;
        let mut skipped = 0;
        let mut count = 0;
        let mut in_comment = false;

        if n == 0 {
            return Ok(0);
        }

        let mut line = String::new();
        loop {
            let bytes = read_pgn_line(&mut self.reader, &mut line)?;
            skipped += bytes;
            if bytes == 0 {
                break;
            }
            if !in_comment && is_neutral_line(&line) {
                line.clear();
                continue;
            }
            let is_header = !in_comment && line.starts_with('[');
            for c in line.chars() {
                match c {
                    '{' => in_comment = true,
                    '}' => in_comment = false,
                    _ => {}
                }
            }
            if is_header {
                if new_game {
                    count += 1;
                    if count == n {
                        self.reader.seek(SeekFrom::Current(-(bytes as i64)))?;
                        break;
                    }
                    new_game = false;
                }
            } else {
                new_game = true;
            }
            line.clear();
        }
        Ok(skipped)
    }

    fn read_game(&mut self) -> io::Result<String> {
        let mut new_game = false;
        let mut in_comment = false;
        self.game.clear();
        loop {
            let bytes = read_pgn_line(&mut self.reader, &mut self.line)?;
            if bytes == 0 {
                break;
            }
            if !in_comment && is_neutral_line(&self.line) {
                // Escape lines are not part of the game; blank lines are kept as they were.
                if !self.line.starts_with('%') {
                    self.game.push_str(&self.line);
                }
                self.line.clear();
                continue;
            }
            let is_header = !in_comment && self.line.starts_with('[');
            for c in self.line.chars() {
                match c {
                    '{' => in_comment = true,
                    '}' => in_comment = false,
                    _ => {}
                }
            }
            if is_header {
                if new_game {
                    break;
                }
            } else {
                new_game = true;
            }
            self.game.push_str(&self.line);
            self.line.clear();
        }
        Ok(self.game.clone())
    }
}

/// Blank lines and "%" escape lines (PGN standard 6) neither start nor end a
/// game, so a preamble such as "%BOOKTITLE" does not become an empty record.
fn is_neutral_line(line: &str) -> bool {
    line.starts_with('%') || line.trim().is_empty()
}

/// Reads one line ending in LF, CRLF or a lone CR (classic Mac files, as some
/// publishers' PGNs still are) and appends it to `out` ending in "\n".
/// Returns the raw bytes consumed so callers can seek back over the line.
/// A line that is not valid UTF-8 is decoded as Windows-1252, the usual
/// encoding of older PGN exports, instead of being dropped.
fn read_pgn_line<R: BufRead>(reader: &mut R, out: &mut String) -> io::Result<usize> {
    let mut raw: Vec<u8> = Vec::new();
    let mut consumed = 0;
    let mut ended = false;
    while !ended {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            break;
        }
        let (used, end) = match available.iter().position(|&b| b == b'\n' || b == b'\r') {
            Some(i) => {
                raw.extend_from_slice(&available[..i]);
                (i + 1, Some(available[i]))
            }
            None => {
                raw.extend_from_slice(available);
                (available.len(), None)
            }
        };
        reader.consume(used);
        consumed += used;
        if let Some(terminator) = end {
            ended = true;
            if terminator == b'\r' {
                let next = reader.fill_buf()?;
                if next.first() == Some(&b'\n') {
                    reader.consume(1);
                    consumed += 1;
                }
            }
        }
    }
    match std::str::from_utf8(&raw) {
        Ok(text) => out.push_str(text),
        Err(_) => out.extend(raw.iter().map(|&b| windows_1252_char(b))),
    }
    if ended {
        out.push('\n');
    }
    Ok(consumed)
}

fn windows_1252_char(byte: u8) -> char {
    const HIGH_CONTROL: [char; 32] = [
        '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8D}', 'Ž',
        '\u{8F}', '\u{90}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{9D}',
        'ž', 'Ÿ',
    ];
    match byte {
        0x80..=0x9F => HIGH_CONTROL[(byte - 0x80) as usize],
        _ => byte as char,
    }
}

fn ignore_bom(reader: &mut BufReader<File>) -> io::Result<u64> {
    let mut bom = [0; 3];
    reader.read_exact(&mut bom)?;
    if bom != [0xEF, 0xBB, 0xBF] {
        reader.seek(SeekFrom::Start(0))?;
        return Ok(0);
    }
    Ok(3)
}

#[tauri::command]
#[specta::specta]
pub async fn count_pgn_games(
    file: PathBuf,
    state: tauri::State<'_, AppState>,
) -> Result<i32, Error> {
    let files_string = file.to_string_lossy().to_string();

    let file = File::open(&file)?;

    let mut parser = PgnParser::new(file.try_clone()?);

    let mut offsets = Vec::new();

    let mut count = 0;

    while let Ok(skipped) = parser.skip_games(1) {
        if skipped == 0 {
            break;
        }
        count += 1;
        if count % GAME_OFFSET_FREQ as i32 == 0 {
            let cur_pos = parser.position()?;
            offsets.push(cur_pos);
        }
    }

    state.pgn_offsets.insert(files_string, offsets);
    Ok(count)
}

#[tauri::command]
#[specta::specta]
pub async fn read_games(
    file: PathBuf,
    start: i32,
    end: i32,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, Error> {
    let file_r = File::open(&file)?;

    let mut parser = PgnParser::new(file_r.try_clone()?);

    parser.offset_by_index(start as usize, &state, &file.to_string_lossy().to_string())?;

    let mut games: Vec<String> = Vec::with_capacity((end - start) as usize);

    for _ in start..=end {
        let game = parser.read_game()?;
        if game.is_empty() {
            break;
        }
        games.push(game);
    }
    Ok(games)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_game(
    file: PathBuf,
    n: i32,
    state: tauri::State<'_, AppState>,
) -> Result<(), Error> {
    let file_r = File::open(&file)?;

    let mut parser = PgnParser::new(file_r.try_clone()?);

    parser.offset_by_index(n as usize, &state, &file.to_string_lossy().to_string())?;

    let starting_bytes = parser.position()?;

    parser.skip_games(1)?;

    let mut file_w = OpenOptions::new().write(true).open(file)?;

    file_w.seek(SeekFrom::Start(starting_bytes))?;

    write_to_end(&mut parser.reader, &mut file_w)?;
    Ok(())
}

fn write_to_end<R: Read>(reader: &mut R, writer: &mut File) -> io::Result<()> {
    io::copy(reader, writer)?;
    let end = writer.stream_position()?;
    writer.set_len(end)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn write_game(
    file_path: String,
    n: i32,
    pgn: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), Error> {
    write_game_at(file_path, n, pgn, &state)
}

fn write_game_at(file_path: String, n: i32, pgn: String, state: &AppState) -> Result<(), Error> {
    // A saved or externally replaced PGN may no longer match cached byte offsets.
    state.pgn_offsets.remove(&file_path);
    let file = PathBuf::from(file_path);
    if !file.exists() {
        File::create(&file)?;
    }

    let mut file_r = File::open(&file)?;
    let mut file_w = OpenOptions::new().write(true).open(&file)?;

    let mut tmpf = tempfile::tempfile()?;
    io::copy(&mut file_r.try_clone()?, &mut tmpf)?;

    file_r.seek(SeekFrom::Start(0))?;
    let mut parser = PgnParser::new(file_r.try_clone()?);

    parser.offset_by_index(n as usize, state, &file.to_string_lossy().to_string())?;

    tmpf.seek(SeekFrom::Start(parser.position()?))?;
    tmpf.write_all(pgn.as_bytes())?;

    parser.skip_games(1)?;

    write_to_end(&mut parser.reader, &mut tmpf)?;

    tmpf.seek(SeekFrom::Start(0))?;

    write_to_end(&mut tmpf, &mut file_w)?;

    state
        .pgn_offsets
        .remove(&file.to_string_lossy().to_string());

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn game(index: usize) -> String {
        format!("[Event \"Game {index}\"]\n[Result \"*\"]\n\n1. e4 e5 *\n\n")
    }

    #[test]
    fn save_selected_game_discards_stale_offsets_and_preserves_neighbours() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("many.pgn");
        std::fs::write(&file, (0..225).map(game).collect::<String>()).unwrap();
        let path = file.to_string_lossy().to_string();
        let state = AppState::default();
        state.pgn_offsets.insert(path.clone(), vec![1, 2, 3]);
        let replacement =
            "[Event \"Changed game\"]\n[Result \"*\"]\n\n1. d4 {A longer annotation} d5 *\n\n";

        write_game_at(path.clone(), 105, replacement.to_owned(), &state).unwrap();

        assert!(!state.pgn_offsets.contains_key(&path));
        let mut parser = PgnParser::new(File::open(file).unwrap());
        for index in 0..225 {
            let record = parser.read_game().unwrap();
            if index == 105 {
                assert!(record.contains("[Event \"Changed game\"]"));
                assert!(record.contains("A longer annotation"));
            } else {
                assert!(
                    record.contains(&format!("[Event \"Game {index}\"]")),
                    "record {index}"
                );
            }
        }
        assert!(parser.read_game().unwrap().is_empty());
    }

    #[test]
    fn reads_classic_mac_line_endings_and_latin1_text() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("mac.pgn");
        let mut bytes = b"%BOOKTITLE = Test\r".to_vec();
        for index in 0..3 {
            bytes.extend_from_slice(
                format!("[Event \"Game {index}\"]\r[Result \"*\"]\r\r{{Gr").as_bytes(),
            );
            bytes.push(0xFC); // ü in Latin-1, invalid UTF-8
            bytes.extend_from_slice(b"nfeld}\r1. d4 Nf6 *\r\r");
        }
        std::fs::write(&file, bytes).unwrap();

        let mut parser = PgnParser::new(File::open(&file).unwrap());
        let mut count = 0;
        while parser.skip_games(1).unwrap() > 0 {
            count += 1;
        }
        assert_eq!(count, 3);

        let mut parser = PgnParser::new(File::open(&file).unwrap());
        for index in 0..3 {
            let record = parser.read_game().unwrap();
            assert!(
                record.contains(&format!("[Event \"Game {index}\"]\n")),
                "{record}"
            );
            assert!(record.contains("{Grünfeld}\n1. d4 Nf6 *"), "{record}");
            assert!(!record.contains('\r'));
        }
        assert!(parser.read_game().unwrap().is_empty());
    }

    #[test]
    fn crlf_files_keep_working_after_skipping_by_offset() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("crlf.pgn");
        let text: String = (0..150).map(|i| game(i).replace('\n', "\r\n")).collect();
        std::fs::write(&file, text).unwrap();
        let mut parser = PgnParser::new(File::open(&file).unwrap());
        let mut count = 0;
        while parser.skip_games(1).unwrap() > 0 {
            count += 1;
        }
        assert_eq!(count, 150);
        let mut parser = PgnParser::new(File::open(&file).unwrap());
        parser.skip_games(120).unwrap();
        assert!(parser
            .read_game()
            .unwrap()
            .starts_with("[Event \"Game 120\"]\n"));
    }

    #[test]
    fn save_new_single_game_and_replace_it_without_leaving_old_text() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("single.pgn");
        let path = file.to_string_lossy().to_string();
        let state = AppState::default();
        write_game_at(path.clone(), 0, game(100_000), &state).unwrap();
        write_game_at(path, 0, game(1), &state).unwrap();
        assert_eq!(std::fs::read_to_string(file).unwrap(), game(1));
    }
}
