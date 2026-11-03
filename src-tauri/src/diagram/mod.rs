//! Position from an image (phase 9.4, I-56/I-57): finds the board grid, classifies the 64 squares
//! with the bundled diagram-squares model and checks the result with chess rules. A reading is
//! never presented as sure when a square is doubtful or the position breaks a rule.

pub mod detect;
pub mod locate;
pub mod preprocess;
pub mod recognizer;

use std::sync::Arc;
use std::time::Instant;

use base64::Engine;
use once_cell::sync::OnceCell;
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager};

use crate::error::Error;
use preprocess::{crop_squares, resize_box, to_gray, Gray};
use recognizer::{looks_flipped, rule_problems, Recognizer};

const MODEL: &str = "models/diagram-squares-1.1.0.onnx";
const MANIFEST: &str = "models/diagram-squares-1.1.0.json";
/// Below this locator score there is probably no board in the image.
const NO_BOARD_SCORE: f64 = 0.15;
/// Larger images are reduced first: the fine pass grows with the square of the resolution.
const MAX_SIDE: usize = 1600;

static RECOGNIZER: OnceCell<Arc<Recognizer>> = OnceCell::new();

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
    }
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
    let classified = recognizer.classify(&recognizer.logits(&squares)?);
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
    reading.turn_mark = detect::turn_mark(gray, grid).map(|side| {
        let side = if flipped {
            if side == 'w' {
                'b'
            } else {
                'w'
            }
        } else {
            side
        };
        side.to_string()
    });
    reading.grid = Some(grid.map(|v| v * scale));
    Ok(reading)
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

#[cfg(test)]
mod tests;
