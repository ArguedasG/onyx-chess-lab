//! Square classifier (diagram-squares, ONNX run with `rten`) and the board decoder.

use std::path::Path;

use rten::Model;
use rten_tensor::prelude::*;
use rten_tensor::NdTensor;
use serde::Deserialize;

use super::preprocess::SQUARE;
use crate::error::Error;

#[derive(Deserialize)]
struct Manifest {
    version: String,
    output: ManifestOutput,
    calibration: Calibration,
}

#[derive(Deserialize)]
struct ManifestOutput {
    classes: Vec<String>,
}

#[derive(Deserialize)]
struct Calibration {
    temperature: f32,
    review_threshold: f32,
}

pub struct Recognizer {
    model: Model,
    /// FEN letter per class ('.' for empty), in model output order.
    symbols: Vec<char>,
    temperature: f32,
    pub review_threshold: f32,
    pub version: String,
}

impl Recognizer {
    pub fn load(onnx: &Path, manifest: &Path) -> Result<Self, Error> {
        let manifest: Manifest = serde_json::from_slice(&std::fs::read(manifest)?)
            .map_err(|e| Error::InvalidRequest(format!("diagram model manifest: {e}")))?;
        let symbols = manifest
            .output
            .classes
            .iter()
            .map(|c| {
                if c == "empty" {
                    '.'
                } else {
                    c.chars().next().unwrap_or('?')
                }
            })
            .collect::<Vec<_>>();
        if symbols.len() != 13 {
            return Err(Error::InvalidRequest(
                "diagram model: expected 13 classes".into(),
            ));
        }
        let model = Model::load_file(onnx)
            .map_err(|e| Error::InvalidRequest(format!("diagram model: {e}")))?;
        Ok(Recognizer {
            model,
            symbols,
            temperature: manifest.calibration.temperature,
            review_threshold: manifest.calibration.review_threshold,
            version: manifest.version,
        })
    }

    /// Raw logits [64 × 13] for 64 squares of 48 × 48 bytes.
    pub fn logits(&self, squares: &[u8]) -> Result<Vec<f32>, Error> {
        let n = squares.len() / (SQUARE * SQUARE);
        let input = NdTensor::from_data(
            [n, 1, SQUARE, SQUARE],
            squares
                .iter()
                .map(|&v| v as f32 / 255.0)
                .collect::<Vec<_>>(),
        );
        let output = self
            .model
            .run_one(input.view().into(), None)
            .map_err(|e| Error::InvalidRequest(format!("diagram model: {e}")))?;
        let output: NdTensor<f32, 2> = output
            .try_into()
            .map_err(|_| Error::InvalidRequest("diagram model: unexpected output".into()))?;
        Ok(output.to_vec())
    }

    /// Most likely symbol and its calibrated confidence for each square.
    pub fn classify(&self, logits: &[f32]) -> Vec<(char, f32)> {
        logits
            .chunks_exact(self.symbols.len())
            .map(|row| {
                let scaled: Vec<f32> = row.iter().map(|v| v / self.temperature).collect();
                let max = scaled.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
                let exp: Vec<f32> = scaled.iter().map(|v| (v - max).exp()).collect();
                let total: f32 = exp.iter().sum();
                let (best, p) =
                    exp.iter().enumerate().fold(
                        (0, 0.0f32),
                        |acc, (i, &e)| if e > acc.1 { (i, e) } else { acc },
                    );
                (self.symbols[best], p / total)
            })
            .collect()
    }
}

/// Chess-rule problems of a board read in display order (top-left first).
pub fn rule_problems(labels: &[char]) -> Vec<String> {
    let count = |s: char| labels.iter().filter(|&&l| l == s).count();
    let mut problems = Vec::new();
    if count('K') != 1 || count('k') != 1 {
        problems.push("kings".to_string());
    }
    if labels[..8]
        .iter()
        .chain(&labels[56..])
        .any(|&l| l == 'P' || l == 'p')
    {
        problems.push("pawnOnEdge".to_string());
    }
    if count('P') > 8 || count('p') > 8 {
        problems.push("tooManyPawns".to_string());
    }
    let white = labels.iter().filter(|l| l.is_ascii_uppercase()).count();
    let black = labels.iter().filter(|l| l.is_ascii_lowercase()).count();
    if white > 16 || black > 16 {
        problems.push("tooManyPieces".to_string());
    }
    problems
}

/// Orientation guess: white pawns usually stand below black ones. Without pawns, the white king
/// below the black one; without either, White at the bottom.
pub fn looks_flipped(labels: &[char]) -> bool {
    let mean_row = |s: char| {
        let rows: Vec<f32> = labels
            .iter()
            .enumerate()
            .filter(|(_, &l)| l == s)
            .map(|(i, _)| (i / 8) as f32)
            .collect();
        (!rows.is_empty()).then(|| rows.iter().sum::<f32>() / rows.len() as f32)
    };
    match (mean_row('P'), mean_row('p')) {
        (Some(w), Some(b)) if w != b => w < b,
        _ => match (mean_row('K'), mean_row('k')) {
            (Some(w), Some(b)) => w < b,
            _ => false,
        },
    }
}
