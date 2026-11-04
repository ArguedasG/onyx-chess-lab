//! Position from an image (phase 9.4, I-56/I-57): finds the board grid, classifies the 64 squares
//! with the bundled diagram-squares model and checks the result with chess rules. A reading is
//! never presented as sure when a square is doubtful or the position breaks a rule.

pub mod detect;
pub mod locate;
pub mod memory;
pub mod preprocess;
pub mod recognizer;

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use base64::Engine;
use once_cell::sync::{Lazy, OnceCell};
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager};

use crate::error::Error;
use memory::BookMemory;
use preprocess::{crop_squares, resize_box, to_gray, Gray};
use recognizer::{looks_flipped, rule_problems, Recognizer};

const MODEL: &str = "models/diagram-squares-1.2.0.onnx";
const MANIFEST: &str = "models/diagram-squares-1.2.0.json";
/// Below this locator score there is probably no board in the image.
const NO_BOARD_SCORE: f64 = 0.15;
/// Larger images are reduced first: the fine pass grows with the square of the resolution.
const MAX_SIDE: usize = 1600;

static RECOGNIZER: OnceCell<Arc<Recognizer>> = OnceCell::new();

/// What a reading needs to be adapted to a book later without the image: the model's
/// probabilities and features of its 64 squares (display order) and the printed turn mark.
struct CachedReading {
    reading: BoardReading,
    probabilities: Vec<f32>,
    features: Vec<f32>,
    mark: Option<char>,
}

/// Readings kept for adaptation and learning (about 9 MB at most).
const CACHED_READINGS: usize = 256;
type ReadingCache = VecDeque<(u32, Arc<CachedReading>)>;
static READINGS: Lazy<Mutex<ReadingCache>> = Lazy::new(|| Mutex::new(VecDeque::new()));
static NEXT_READING: AtomicU32 = AtomicU32::new(1);
/// Book memories already read from disk, by book id.
static MEMORIES: Lazy<Mutex<HashMap<String, Arc<BookMemory>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Serialize, Type, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReadingStatus {
    /// Every square is confident and the position follows the chess rules.
    Accepted,
    /// Some square is doubtful or a rule is broken: the user must check it.
    Review,
    /// No board was found in the image.
    NoBoard,
}

#[derive(Serialize, Type, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SquareReading {
    pub square: String,
    /// FEN letter, or `None` for an empty square.
    pub piece: Option<String>,
    pub confidence: f32,
}

#[derive(Serialize, Type, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BoardReading {
    /// Handle to adapt this reading to a book or learn from its correction (0: not kept).
    pub id: u32,
    pub status: ReadingStatus,
    /// Board field of the FEN, from White's side (after the orientation guess).
    pub placement: Option<String>,
    /// Whether the image shows the board from Black's side (guessed from the pieces).
    pub flipped: bool,
    /// Grid box in the image's pixels.
    pub grid: Option<[f64; 4]>,
    pub image_width: u32,
    pub image_height: u32,
    pub locate_score: f64,
    /// The 64 squares from a8 to h1.
    pub squares: Vec<SquareReading>,
    /// Squares below the confidence threshold.
    pub doubtful: Vec<String>,
    /// Broken chess rules: `kings`, `pawnOnEdge`, `tooManyPawns`, `tooManyPieces`.
    pub problems: Vec<String>,
    /// Side to move from a mark printed next to the board ("w" or "b"), if any.
    pub turn_mark: Option<String>,
    pub model_version: String,
    pub elapsed_ms: u32,
    /// Squares whose answer the book's memory changed (always left doubtful).
    pub adapted: u32,
}

fn recognizer(app: &AppHandle) -> Result<Arc<Recognizer>, Error> {
    RECOGNIZER
        .get_or_try_init(|| {
            let resolve = |p: &str| {
                app.path()
                    .resolve(p, tauri::path::BaseDirectory::Resource)
                    .map_err(|e| Error::InvalidRequest(format!("diagram model: {e}")))
            };
            Recognizer::load(&resolve(MODEL)?, &resolve(MANIFEST)?).map(Arc::new)
        })
        .cloned()
}

fn square_name(index: usize) -> String {
    format!("{}{}", (b'a' + (index % 8) as u8) as char, 8 - index / 8)
}

fn placement(board: &[char]) -> String {
    board
        .chunks(8)
        .map(|rank| {
            let mut out = String::new();
            let mut empty = 0;
            for &c in rank {
                if c == '.' {
                    empty += 1;
                } else {
                    if empty > 0 {
                        out.push_str(&empty.to_string());
                        empty = 0;
                    }
                    out.push(c);
                }
            }
            if empty > 0 {
                out.push_str(&empty.to_string());
            }
            out
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// The image in gray, reduced if it is larger than `MAX_SIDE`, and the factor back to its pixels.
fn prepare(image: &image::DynamicImage) -> (Gray, f64) {
    let full = to_gray(image);
    if full.width.max(full.height) <= MAX_SIDE {
        return (full, 1.0);
    }
    let s = MAX_SIDE as f64 / full.width.max(full.height) as f64;
    let (w, h) = (
        ((full.width as f64 * s).round() as usize).max(1),
        ((full.height as f64 * s).round() as usize).max(1),
    );
    let reduced = resize_box(
        &full,
        [0.0, 0.0, full.width as f32, full.height as f32],
        w,
        h,
    );
    (reduced, full.width as f64 / w as f64)
}

fn empty_reading(recognizer: &Recognizer, image: &image::DynamicImage) -> BoardReading {
    BoardReading {
        id: 0,
        status: ReadingStatus::NoBoard,
        placement: None,
        flipped: false,
        grid: None,
        image_width: image.width(),
        image_height: image.height(),
        locate_score: 0.0,
        squares: Vec::new(),
        doubtful: Vec::new(),
        problems: Vec::new(),
        turn_mark: None,
        model_version: recognizer.version.clone(),
        elapsed_ms: 0,
        adapted: 0,
    }
}

/// Builds the reading from the class and confidence of each square (display order) and the turn
/// mark as printed: orientation, rules, doubtful squares, status and placement.
fn decode(
    recognizer: &Recognizer,
    classified: Vec<(char, f32)>,
    mark: Option<char>,
    mut reading: BoardReading,
) -> BoardReading {
    let labels: Vec<char> = classified.iter().map(|(s, _)| *s).collect();
    let flipped = looks_flipped(&labels);
    // From White's side: a board seen from Black's side is the same list reversed.
    let ordered: Vec<(char, f32)> = if flipped {
        classified.iter().rev().cloned().collect()
    } else {
        classified
    };
    let board: Vec<char> = ordered.iter().map(|(s, _)| *s).collect();

    reading.problems = rule_problems(&labels);
    reading.squares = ordered
        .iter()
        .enumerate()
        .map(|(i, (s, p))| SquareReading {
            square: square_name(i),
            piece: (*s != '.').then(|| s.to_string()),
            confidence: *p,
        })
        .collect();
    reading.doubtful = reading
        .squares
        .iter()
        .filter(|s| s.confidence < recognizer.review_threshold)
        .map(|s| s.square.clone())
        .collect();
    reading.status = if reading.problems.is_empty() && reading.doubtful.is_empty() {
        ReadingStatus::Accepted
    } else {
        ReadingStatus::Review
    };
    reading.placement = Some(placement(&board));
    reading.flipped = flipped;
    // The mark is printed beside the board as the book shows it: with the board turned, top
    // and bottom swap sides.
    reading.turn_mark = mark.map(|side| {
        let side = match (flipped, side) {
            (true, 'w') => 'b',
            (true, _) => 'w',
            (false, side) => side,
        };
        side.to_string()
    });
    reading
}

/// Keeps a reading for later adaptation and returns its id.
fn remember(cached: CachedReading) -> u32 {
    let id = NEXT_READING.fetch_add(1, Ordering::Relaxed);
    let mut readings = READINGS.lock().unwrap_or_else(|e| e.into_inner());
    readings.push_back((id, Arc::new(cached)));
    while readings.len() > CACHED_READINGS {
        readings.pop_front();
    }
    id
}

fn cached_reading(id: u32) -> Option<Arc<CachedReading>> {
    let readings = READINGS.lock().unwrap_or_else(|e| e.into_inner());
    readings
        .iter()
        .find(|(i, _)| *i == id)
        .map(|(_, c)| c.clone())
}

/// Classifies the 64 squares of a grid already found and checks the position.
fn read_grid(
    recognizer: &Recognizer,
    gray: &Gray,
    grid: [f64; 4],
    mut reading: BoardReading,
    scale: f64,
) -> Result<BoardReading, Error> {
    let squares = crop_squares(gray, grid);
    let (logits, features) = recognizer.run(&squares)?;
    let probabilities = recognizer.probabilities(&logits);
    let mark = detect::turn_mark(gray, grid);
    reading.grid = Some(grid.map(|v| v * scale));
    let mut reading = decode(recognizer, recognizer.decide(&probabilities), mark, reading);
    if let Some(mut features) = features {
        memory::normalize(&mut features);
        reading.id = remember(CachedReading {
            reading: reading.clone(),
            probabilities,
            features,
            mark,
        });
    }
    Ok(reading)
}

/// A kept reading adjusted with a book's memory (unchanged when the memory is empty).
fn adapt_reading(
    recognizer: &Recognizer,
    cached: &CachedReading,
    memory: &BookMemory,
) -> BoardReading {
    let Some(rule) = recognizer.adaptation.as_ref() else {
        return cached.reading.clone();
    };
    if memory.boards.is_empty() {
        return cached.reading.clone();
    }
    let (classes, confidence, changed) = memory.adapt(
        &cached.probabilities,
        &cached.features,
        recognizer.classes(),
        rule,
    );
    let classified = classes
        .iter()
        .zip(confidence)
        .map(|(&c, p)| (recognizer.symbol(c), p))
        .collect();
    let mut reading = decode(recognizer, classified, cached.mark, cached.reading.clone());
    reading.adapted = changed;
    reading
}

/// The whole pipeline on a decoded image with one board (a diagram or a screenshot).
pub fn read_board(
    recognizer: &Recognizer,
    image: &image::DynamicImage,
) -> Result<BoardReading, Error> {
    let started = Instant::now();
    let (gray, scale) = prepare(image);
    let reading = empty_reading(recognizer, image);
    let located = locate::find_grid(&gray);
    let mut reading = match located.filter(|l| l.score >= NO_BOARD_SCORE) {
        Some(located) => {
            let score = located.score;
            let mut r = read_grid(recognizer, &gray, located.grid, reading, scale)?;
            r.locate_score = score;
            r
        }
        None => reading,
    };
    reading.elapsed_ms = started.elapsed().as_millis() as u32;
    Ok(reading)
}

/// Every board found on a page image (scanned books, pages with many diagrams), best first.
/// `locate_score` holds the detector's neighbour agreement (0.8–1).
pub fn read_page(
    recognizer: &Recognizer,
    image: &image::DynamicImage,
) -> Result<Vec<BoardReading>, Error> {
    let started = Instant::now();
    let (gray, scale) = prepare(image);
    let mut out = Vec::new();
    for found in detect::detect_boards(&gray) {
        let mut reading = read_grid(
            recognizer,
            &gray,
            found.grid,
            empty_reading(recognizer, image),
            scale,
        )?;
        reading.locate_score = found.agreement;
        out.push(reading);
    }
    let elapsed = started.elapsed().as_millis() as u32;
    for reading in out.iter_mut() {
        reading.elapsed_ms = elapsed;
    }
    Ok(out)
}

async fn read_bytes(app: AppHandle, bytes: Vec<u8>) -> Result<BoardReading, Error> {
    tokio::task::spawn_blocking(move || {
        let image = image::load_from_memory(&bytes)
            .map_err(|e| Error::InvalidRequest(format!("image: {e}")))?;
        read_board(&*recognizer(&app)?, &image)
    })
    .await
    .map_err(|e| Error::InvalidRequest(format!("diagram reader: {e}")))?
}

/// Reads every board on a page image given as base64 (a page of a book).
#[tauri::command]
#[specta::specta]
pub async fn detect_board_images(
    app: AppHandle,
    data_base64: String,
) -> Result<Vec<BoardReading>, Error> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.trim())
        .map_err(|e| Error::InvalidRequest(format!("image: {e}")))?;
    tokio::task::spawn_blocking(move || {
        let image = image::load_from_memory(&bytes)
            .map_err(|e| Error::InvalidRequest(format!("image: {e}")))?;
        read_page(&*recognizer(&app)?, &image)
    })
    .await
    .map_err(|e| Error::InvalidRequest(format!("diagram reader: {e}")))?
}

/// Reads a position from an image given as base64 (pasted from the clipboard).
#[tauri::command]
#[specta::specta]
pub async fn recognize_board_image(
    app: AppHandle,
    data_base64: String,
) -> Result<BoardReading, Error> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.trim())
        .map_err(|e| Error::InvalidRequest(format!("image: {e}")))?;
    read_bytes(app, bytes).await
}

/// Reads a position from an image file (opened or dropped by the user).
#[tauri::command]
#[specta::specta]
pub async fn recognize_board_image_file(
    app: AppHandle,
    path: String,
) -> Result<BoardReading, Error> {
    let bytes = tokio::fs::read(&path).await?;
    read_bytes(app, bytes).await
}

/// A book's memory file, next to its notes (`books/<id>.json` in the app data folder).
fn memory_path(app: &AppHandle, book_id: &str) -> Result<PathBuf, Error> {
    let valid = !book_id.is_empty()
        && book_id.len() <= 64
        && book_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err(Error::InvalidRequest(format!("book id: {book_id}")));
    }
    Ok(app
        .path()
        .app_data_dir()?
        .join("books")
        .join(format!("{book_id}.memory.bin")))
}

fn book_memory(
    app: &AppHandle,
    recognizer: &Recognizer,
    book_id: &str,
) -> Result<Arc<BookMemory>, Error> {
    let path = memory_path(app, book_id)?;
    let mut memories = MEMORIES.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(memory) = memories.get(book_id) {
        return Ok(memory.clone());
    }
    let memory = Arc::new(BookMemory::load(&path, &recognizer.version));
    memories.insert(book_id.to_string(), memory.clone());
    Ok(memory)
}

/// 64 FEN letters ('.' empty) from a8 to h1, from the board field of a FEN.
fn expand_placement(placement: &str) -> Option<Vec<char>> {
    let mut out = Vec::with_capacity(64);
    for rank in placement.split(' ').next()?.split('/') {
        for c in rank.chars() {
            match c.to_digit(10) {
                Some(n) if (1..=8).contains(&n) => out.extend(std::iter::repeat_n('.', n as usize)),
                _ => out.push(c),
            }
        }
    }
    (out.len() == 64).then_some(out)
}

/// The reading `reading_id` adapted to what was learned in that book; `None` when the reading
/// is no longer kept (the caller keeps the one it has).
#[tauri::command]
#[specta::specta]
pub async fn adapt_board_reading(
    app: AppHandle,
    reading_id: u32,
    book_id: String,
) -> Result<Option<BoardReading>, Error> {
    tokio::task::spawn_blocking(move || {
        let recognizer = recognizer(&app)?;
        let Some(cached) = cached_reading(reading_id) else {
            return Ok(None);
        };
        let memory = book_memory(&app, &recognizer, &book_id)?;
        Ok(Some(adapt_reading(&recognizer, &cached, &memory)))
    })
    .await
    .map_err(|e| Error::InvalidRequest(format!("diagram reader: {e}")))?
}

/// Learns from a corrected diagram of a book: the squares of reading `reading_id` with the
/// position the user saved (`placement`, from White's side; `image_flipped` when the picture
/// shows the board from Black's side). `key` identifies the diagram, so saving it again
/// replaces what was learned from it. Returns the boards in the memory, or `None` when the
/// reading is no longer kept and nothing was learned.
#[tauri::command]
#[specta::specta]
pub async fn learn_board_reading(
    app: AppHandle,
    reading_id: u32,
    book_id: String,
    key: String,
    placement: String,
    image_flipped: bool,
) -> Result<Option<u32>, Error> {
    tokio::task::spawn_blocking(move || {
        let recognizer = recognizer(&app)?;
        let Some(rule) = recognizer.adaptation.clone() else {
            return Ok(None);
        };
        let Some(cached) = cached_reading(reading_id) else {
            return Ok(None);
        };
        let mut squares = expand_placement(&placement)
            .ok_or_else(|| Error::InvalidRequest(format!("placement: {placement}")))?;
        if image_flipped {
            squares.reverse();
        }
        let classes = squares
            .iter()
            .map(|&s| recognizer.class_of(s))
            .collect::<Option<Vec<usize>>>()
            .ok_or_else(|| Error::InvalidRequest(format!("placement: {placement}")))?;
        let path = memory_path(&app, &book_id)?;
        let mut memory = (*book_memory(&app, &recognizer, &book_id)?).clone();
        memory.learn(&key, &cached.features, &classes, rule.empty_per_board);
        memory.save(&path)?;
        let boards = memory.boards.len() as u32;
        MEMORIES
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(book_id, Arc::new(memory));
        Ok(Some(boards))
    })
    .await
    .map_err(|e| Error::InvalidRequest(format!("diagram reader: {e}")))?
}

/// Corrected boards remembered for a book (with the current model).
#[tauri::command]
#[specta::specta]
pub async fn book_memory_size(app: AppHandle, book_id: String) -> Result<u32, Error> {
    tokio::task::spawn_blocking(move || {
        let recognizer = recognizer(&app)?;
        Ok(book_memory(&app, &recognizer, &book_id)?.boards.len() as u32)
    })
    .await
    .map_err(|e| Error::InvalidRequest(format!("diagram reader: {e}")))?
}

/// Forgets everything learned in a book (its corrections themselves are kept).
#[tauri::command]
#[specta::specta]
pub async fn forget_book_memory(app: AppHandle, book_id: String) -> Result<(), Error> {
    let path = memory_path(&app, &book_id)?;
    MEMORIES
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&book_id);
    match tokio::fs::remove_file(&path).await {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests;
