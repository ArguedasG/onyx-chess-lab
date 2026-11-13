//! The pattern index of a base: each game's main line as ready-to-play moves (two bytes per ply).
//!
//! The position index stores a move as its number in the list of legal moves, so replaying a game
//! generates every legal move at every ply. Exact and pawn searches rarely replay a whole game, but
//! a piece pattern can almost never rule a game out early, and generating moves is ~17× slower than
//! playing them. This file, built the first time a pattern is searched in a base, avoids that.
//!
//! It is derived data: built from the position index, tied to the base's revision, rebuilt when
//! the base changes and deleted with it. Removing it by hand loses nothing.
//!
//! Layout: magic, version, revision (length + bytes), the moves of every game one after another
//! (u16 each), the offset of each game's moves in moves (count + 1 u64), then the game count and
//! the byte position of the offsets (u64 each). All little-endian.

use std::{
    collections::HashMap,
    fs::{self, File},
    io::{self, BufWriter, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, LazyLock, Mutex,
    },
};

use memmap2::Mmap;
use rayon::prelude::*;
use shakmaty::{Chess, FromSetup, Move, Position, Role, Square};

use super::encoding::{decode_move, iter_mainline_move_bytes};
use super::search_index::MmapSearchIndex;

const MAGIC: &[u8; 4] = b"ECSP";
const VERSION: u32 = 1;
const BATCH: usize = 4096;
/// Written after the last good move of a game whose stored moves could not be read.
pub const BROKEN: u16 = u16::MAX;

const FLAG_CASTLE: u16 = 5;
const FLAG_EN_PASSANT: u16 = 6;

pub fn get_pattern_index_path(db_path: &Path) -> PathBuf {
    db_path.with_extension("ecsp")
}

/// From and to squares in 12 bits; the top 4 say promotion (1-4), castling or en passant.
pub fn encode(m: &Move) -> u16 {
    let (from, to, flag) = match m {
        Move::Normal {
            from,
            to,
            promotion,
            ..
        } => {
            let flag = match promotion {
                None => 0,
                Some(Role::Knight) => 1,
                Some(Role::Bishop) => 2,
                Some(Role::Rook) => 3,
                Some(_) => 4,
            };
            (*from, *to, flag)
        }
        Move::EnPassant { from, to } => (*from, *to, FLAG_EN_PASSANT),
        Move::Castle { king, rook } => (*king, *rook, FLAG_CASTLE),
        // Crazyhouse drops never reach a chess base.
        Move::Put { to, .. } => (*to, *to, 0),
    };
    u16::from(from) | (u16::from(to) << 6) | (flag << 12)
}

/// The move of `code` in `chess`, read from the board instead of generating the legal moves.
/// The codes come from moves that were legal when the index was built.
pub fn decode(code: u16, chess: &Chess) -> Option<Move> {
    if code == BROKEN {
        return None;
    }
    let from = Square::new(u32::from(code & 0x3f));
    let to = Square::new(u32::from((code >> 6) & 0x3f));
    let flag = code >> 12;
    match flag {
        FLAG_CASTLE => Some(Move::Castle {
            king: from,
            rook: to,
        }),
        FLAG_EN_PASSANT => Some(Move::EnPassant { from, to }),
        _ => {
            let board = chess.board();
            let role = board.role_at(from)?;
            let promotion = match flag {
                0 => None,
                1 => Some(Role::Knight),
                2 => Some(Role::Bishop),
                3 => Some(Role::Rook),
                4 => Some(Role::Queen),
                _ => return None,
            };
            Some(Move::Normal {
                role,
                from,
                capture: board.role_at(to),
                to,
                promotion,
            })
        }
    }
}

/// The main line of one game as codes; a move that cannot be read ends it with `BROKEN`.
fn game_codes(moves: &[u8], fen: &Option<&str>) -> Vec<u16> {
    let mut codes = Vec::new();
    let mut chess = match fen {
        None => Chess::default(),
        Some(fen) => {
            let Ok(fen) = shakmaty::fen::Fen::from_ascii(fen.as_bytes()) else {
                return vec![BROKEN];
            };
            let setup = fen.into_setup();
            let mode = shakmaty::CastlingMode::detect(&setup);
            match Chess::from_setup(setup, mode) {
                Ok(chess) => chess,
                Err(_) => return vec![BROKEN],
            }
        }
    };
    for byte in iter_mainline_move_bytes(moves) {
        let Some(m) = decode_move(byte, &chess) else {
            codes.push(BROKEN);
            break;
        };
        codes.push(encode(&m));
        chess.play_unchecked(&m);
    }
    codes
}

/// Builds the pattern index of the base whose position index is `index`. `processed` counts the
/// games done, for progress. Writes to a temporary file first, so a stopped build leaves nothing.
pub fn build(
    index: &MmapSearchIndex,
    path: &Path,
    revision: &str,
    processed: &AtomicUsize,
) -> io::Result<()> {
    let temporary = path.with_extension("ecsp.tmp");
    let result = (|| {
        let mut out = BufWriter::with_capacity(1 << 20, File::create(&temporary)?);
        out.write_all(MAGIC)?;
        out.write_all(&VERSION.to_le_bytes())?;
        out.write_all(&(revision.len() as u32).to_le_bytes())?;
        out.write_all(revision.as_bytes())?;
        let mut offsets = Vec::with_capacity(index.len() + 1);
        let mut position = 0u64;
        offsets.push(position);
        for start in (0..index.len()).step_by(BATCH) {
            let end = (start + BATCH).min(index.len());
            let games: Vec<Vec<u16>> = (start..end)
                .into_par_iter()
                .map(|i| {
                    let entry = index.get_entry_ref(i).expect("index entry in range");
                    game_codes(entry.moves, &entry.fen)
                })
                .collect();
            for codes in games {
                for code in &codes {
                    out.write_all(&code.to_le_bytes())?;
                }
                position += codes.len() as u64;
                offsets.push(position);
            }
            processed.store(end, Ordering::Relaxed);
        }
        let header = 12 + revision.len() as u64;
        let offsets_at = header + position * 2;
        for offset in &offsets {
            out.write_all(&offset.to_le_bytes())?;
        }
        out.write_all(&(index.len() as u64).to_le_bytes())?;
        out.write_all(&offsets_at.to_le_bytes())?;
        out.flush()?;
        drop(out);
        fs::rename(&temporary, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub struct PatternIndex {
    mmap: Mmap,
    moves_at: usize,
    offsets_at: usize,
    count: usize,
}

impl PatternIndex {
    /// The pattern index at `path` if it belongs to this revision of the base and has its games;
    /// None when it is missing or stale (it is then rebuilt).
    pub fn open(path: &Path, revision: &str, games: usize) -> io::Result<Option<Self>> {
        let file = match File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        // SAFETY: the file is only replaced by renaming a new one over it, never written in place.
        let mmap = unsafe { Mmap::map(&file)? };
        let read_u32 = |at: usize| -> Option<u32> {
            Some(u32::from_le_bytes(mmap.get(at..at + 4)?.try_into().ok()?))
        };
        let read_u64 = |at: usize| -> Option<u64> {
            Some(u64::from_le_bytes(mmap.get(at..at + 8)?.try_into().ok()?))
        };
        if mmap.len() < 28 || &mmap[0..4] != MAGIC || read_u32(4) != Some(VERSION) {
            return Ok(None);
        }
        let Some(revision_len) = read_u32(8).map(|len| len as usize) else {
            return Ok(None);
        };
        if mmap.get(12..12 + revision_len) != Some(revision.as_bytes()) {
            return Ok(None);
        }
        let footer = mmap.len() - 16;
        let (Some(count), Some(offsets_at)) = (read_u64(footer), read_u64(footer + 8)) else {
            return Ok(None);
        };
        let (count, offsets_at) = (count as usize, offsets_at as usize);
        if count != games || offsets_at + (count + 1) * 8 != footer {
            return Ok(None);
        }
        Ok(Some(Self {
            mmap,
            moves_at: 12 + revision_len,
            offsets_at,
            count,
        }))
    }

    /// The main line of game `index` as codes, two little-endian bytes each.
    pub fn moves(&self, index: usize) -> &[u8] {
        if index >= self.count {
            return &[];
        }
        let offset = |i: usize| {
            let at = self.offsets_at + i * 8;
            u64::from_le_bytes(self.mmap[at..at + 8].try_into().unwrap()) as usize
        };
        let (start, end) = (offset(index), offset(index + 1));
        &self.mmap[self.moves_at + start * 2..self.moves_at + end * 2]
    }
}

/// A build in progress. Searches wait for it instead of starting their own, so changing the
/// pattern while the index is being built does not throw the work away.
pub struct Build {
    pub processed: AtomicUsize,
    pub total: usize,
    /// Set when the build ends: Ok, or the error that stopped it.
    pub outcome: Mutex<Option<Result<(), String>>>,
}

static BUILDS: LazyLock<Mutex<HashMap<PathBuf, Arc<Build>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// The build of this base's pattern index, starting it on its own thread if none is running.
pub fn ensure_build(index: &MmapSearchIndex, db_path: &Path, revision: &str) -> Arc<Build> {
    let path = get_pattern_index_path(db_path);
    let mut builds = BUILDS.lock().unwrap();
    if let Some(build) = builds.get(&path) {
        return build.clone();
    }
    let build = Arc::new(Build {
        processed: AtomicUsize::new(0),
        total: index.len(),
        outcome: Mutex::new(None),
    });
    builds.insert(path.clone(), build.clone());
    let (index, revision, running) = (index.clone(), revision.to_string(), build.clone());
    std::thread::spawn(move || {
        let started = std::time::Instant::now();
        let result = self::build(&index, &path, &revision, &running.processed);
        log::info!(
            "pattern index {} games in {:?}: {:?}",
            index.len(),
            started.elapsed(),
            result.as_ref().map(|_| ())
        );
        *running.outcome.lock().unwrap() = Some(result.map_err(|error| error.to_string()));
        BUILDS.lock().unwrap().remove(&path);
    });
    build
}

pub fn remove(db_path: &Path) -> io::Result<()> {
    match fs::remove_file(get_pattern_index_path(db_path)) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shakmaty::{fen::Fen, CastlingMode};

    fn replay(fen: &str, uci: &[&str]) {
        let setup = Fen::from_ascii(fen.as_bytes()).unwrap().into_setup();
        let mut legal = Chess::from_setup(setup.clone(), CastlingMode::Chess960).unwrap();
        let mut direct = legal.clone();
        for text in uci {
            let m = text
                .parse::<shakmaty::uci::UciMove>()
                .unwrap()
                .to_move(&legal)
                .unwrap();
            let decoded = decode(encode(&m), &direct).unwrap();
            assert_eq!(decoded, m, "{text}");
            legal.play_unchecked(&m);
            direct.play_unchecked(&decoded);
            assert_eq!(legal, direct);
        }
    }

    #[test]
    fn codes_replay_every_kind_of_move() {
        // Captures, castling both ways.
        replay(
            "r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1",
            &["e1g1", "e8c8", "c4e6", "f7e6"],
        );
        // En passant and promotions.
        replay(
            "4k3/1P6/8/3pP3/8/8/8/4K3 w - d6 0 1",
            &["e5d6", "e8d7", "b7b8n"],
        );
        replay("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1", &["b7b8q"]);
    }

    #[test]
    fn a_broken_code_reads_as_no_move() {
        assert!(decode(BROKEN, &Chess::default()).is_none());
    }
}
