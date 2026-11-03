//! Parity with the Python training code, on fixtures written by
//! `ml/diagram-recognizer/tools/make_parity_fixtures.py`.

use std::path::PathBuf;

use base64::Engine;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use super::locate::find_grid;
use super::preprocess::{crop_squares, resize_box, to_gray};
use super::read_board;
use super::recognizer::Recognizer;

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/diagram")
}

fn model_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../ml/diagram-recognizer/models/1.1.0")
}

fn load(name: &str) -> image::DynamicImage {
    image::open(fixtures().join(name)).expect("fixture image")
}

fn sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn recognizer() -> Recognizer {
    let dir = model_dir();
    Recognizer::load(
        &dir.join("diagram-squares-1.1.0.onnx"),
        &dir.join("diagram-squares-1.1.0.json"),
    )
    .expect("model")
}

#[test]
fn gray_matches_pillow() {
    #[derive(Deserialize)]
    struct Expected {
        sha256: String,
    }
    let expected: Expected =
        serde_json::from_slice(&std::fs::read(fixtures().join("gray.json")).unwrap()).unwrap();
    assert_eq!(sha256(&to_gray(&load("gray.png")).pixels), expected.sha256);
}

#[test]
fn box_resize_matches_pillow() {
    #[derive(Deserialize)]
    struct Case {
        #[serde(rename = "box")]
        box_: [f32; 4],
        size: [usize; 2],
        bytes: String,
    }
    let cases: Vec<Case> =
        serde_json::from_slice(&std::fs::read(fixtures().join("resample.json")).unwrap()).unwrap();
    let image = to_gray(&load("resample.png"));
    for case in cases {
        let out = resize_box(&image, case.box_, case.size[0], case.size[1]);
        let expected = base64::engine::general_purpose::STANDARD
            .decode(&case.bytes)
            .unwrap();
        assert_eq!(
            out.pixels, expected,
            "box {:?} → {:?}",
            case.box_, case.size
        );
    }
}

#[derive(Deserialize)]
struct Board {
    file: String,
    grid: [f64; 4],
    score: f64,
    squares_sha256: String,
    logits: Vec<f32>,
}

fn boards() -> Vec<Board> {
    serde_json::from_slice(&std::fs::read(fixtures().join("boards.json")).unwrap()).unwrap()
}

#[test]
fn grid_and_squares_match_python() {
    for board in boards() {
        let gray = to_gray(&load(&board.file));
        let located = find_grid(&gray).expect("board found");
        for (a, b) in located.grid.iter().zip(board.grid) {
            assert!(
                (a - b).abs() < 1e-9,
                "{}: grid {:?} vs {:?}",
                board.file,
                located.grid,
                board.grid
            );
        }
        assert!(
            (located.score - board.score).abs() < 1e-6 * board.score.abs().max(1.0),
            "{}: score {} vs {}",
            board.file,
            located.score,
            board.score
        );
        let squares = crop_squares(&gray, located.grid);
        assert_eq!(
            sha256(&squares),
            board.squares_sha256,
            "{}: squares",
            board.file
        );
    }
}

#[test]
fn logits_match_onnxruntime() {
    let recognizer = recognizer();
    for board in boards() {
        let gray = to_gray(&load(&board.file));
        let squares = crop_squares(&gray, board.grid);
        let logits = recognizer.logits(&squares).unwrap();
        let diff = logits
            .iter()
            .zip(&board.logits)
            .map(|(a, b)| (a - b).abs())
            .fold(0.0f32, f32::max);
        // The fixture rounds to 6 decimals; the manifest tolerance is 1e-4.
        assert!(diff <= 1e-4, "{}: max logit diff {diff}", board.file);
    }
}

#[test]
fn parity_reference_of_the_manifest() {
    let dir = model_dir();
    let input = std::fs::read(dir.join("parity.input.u8")).unwrap();
    let expected: Vec<f32> = std::fs::read(dir.join("parity.logits.f32"))
        .unwrap()
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect();
    let logits = recognizer().logits(&input).unwrap();
    let diff = logits
        .iter()
        .zip(&expected)
        .map(|(a, b)| (a - b).abs())
        .fold(0.0f32, f32::max);
    assert!(diff <= 1e-4, "max logit diff {diff}");
}

#[test]
fn reads_synthetic_boards() {
    let recognizer = recognizer();
    for board in boards() {
        let reading = read_board(&recognizer, &load(&board.file)).unwrap();
        assert!(reading.placement.is_some(), "{}", board.file);
        assert_eq!(reading.squares.len(), 64);
    }
    let blank = image::DynamicImage::new_luma8(300, 200);
    let reading = read_board(&recognizer, &blank).unwrap();
    assert_eq!(reading.status, super::ReadingStatus::NoBoard);
}

/// Runs the whole pipeline on the author's private diagrams and compares with the Python report.
/// `ONYX_DIAGRAM_EVAL=<ml/diagram-recognizer/private-eval> cargo test --release -- --ignored private_books`
#[test]
#[ignore = "needs the author's private evaluation set"]
fn private_books() {
    let Ok(dir) = std::env::var("ONYX_DIAGRAM_EVAL") else {
        return;
    };
    let dir = PathBuf::from(dir);
    let report: serde_json::Value =
        serde_json::from_slice(&std::fs::read(dir.join("report-v7/results.json")).unwrap())
            .unwrap();
    let recognizer = recognizer();
    let (mut same, mut total, mut times) = (0, 0, Vec::new());
    for boards in report["boards"].as_object().unwrap().values() {
        for board in boards.as_array().unwrap() {
            let file = board["file"].as_str().unwrap();
            let image = image::open(dir.join("books").join(file)).unwrap();
            let started = std::time::Instant::now();
            let reading = read_board(&recognizer, &image).unwrap();
            times.push(started.elapsed().as_secs_f64() * 1000.0);
            let status = match reading.status {
                super::ReadingStatus::Accepted => "accepted",
                super::ReadingStatus::Review => "review",
                super::ReadingStatus::NoBoard => "no board",
            };
            total += 1;
            if status == board["status"].as_str().unwrap() {
                same += 1;
            } else {
                println!("{file}: rust {status}, python {}", board["status"]);
            }
        }
    }
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    println!(
        "{same}/{total} same status; ms median {:.0}, p90 {:.0}, max {:.0}",
        times[times.len() / 2],
        times[times.len() * 9 / 10],
        times[times.len() - 1]
    );
}

#[derive(Deserialize)]
struct PageBoard {
    grid: [f64; 4],
    agreement: f64,
}

#[derive(Deserialize)]
struct Page {
    file: String,
    boards: Vec<PageBoard>,
}

fn same_detections(dir: &std::path::Path, pages: Vec<Page>) {
    for page in pages {
        let gray = to_gray(&image::open(dir.join(&page.file)).unwrap());
        let found = super::detect::detect_boards(&gray);
        assert_eq!(
            found.len(),
            page.boards.len(),
            "{}: number of boards",
            page.file
        );
        for (a, b) in found.iter().zip(&page.boards) {
            assert!(
                (a.agreement - b.agreement).abs() < 1e-12,
                "{}: agreement",
                page.file
            );
            for (x, y) in a.grid.iter().zip(b.grid) {
                assert!(
                    (x - y).abs() < 1e-9,
                    "{}: grid {:?} vs {:?}",
                    page.file,
                    a.grid,
                    b.grid
                );
            }
        }
    }
}

#[test]
fn page_detector_matches_python() {
    let pages: Vec<Page> =
        serde_json::from_slice(&std::fs::read(fixtures().join("pages.json")).unwrap()).unwrap();
    same_detections(&fixtures(), pages);
}

/// Detector parity on rendered pages of the author's books (private).
/// `ONYX_DIAGRAM_EVAL=<ml/diagram-recognizer/private-eval> cargo test --release -- --ignored private_pages`
#[test]
#[ignore = "needs the author's private evaluation set"]
fn private_pages() {
    let Ok(dir) = std::env::var("ONYX_DIAGRAM_EVAL") else {
        return;
    };
    let dir = PathBuf::from(dir).join("pages");
    let pages: Vec<Page> =
        serde_json::from_slice(&std::fs::read(dir.join("detections.json")).unwrap()).unwrap();
    for page in &pages {
        let gray = to_gray(&image::open(dir.join(&page.file)).unwrap());
        let marks: String = super::detect::detect_boards(&gray)
            .iter()
            .map(|d| super::detect::turn_mark(&gray, d.grid).unwrap_or('-'))
            .collect();
        println!("{}: turn marks {marks}", page.file);
    }
    let started = std::time::Instant::now();
    let n = pages.len();
    same_detections(&dir, pages);
    println!(
        "{n} pages, {:.0} ms per page",
        started.elapsed().as_secs_f64() * 1000.0 / n as f64
    );
}
