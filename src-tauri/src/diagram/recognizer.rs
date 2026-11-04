//! Square classifier (diagram-squares, ONNX run with `rten`) and the board decoder.

use std::path::Path;

use rten::{Model, NodeId};
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
    /// Per-book adaptation constants, tied to this model's feature space (from 1.2.0).
    adaptation: Option<Adaptation>,
}

/// How the squares of the user's corrections in a book adjust its readings
/// (`ml/diagram-recognizer/tools/sim_adapt.py`, `adapt_board`).
#[derive(Deserialize, Clone, Debug)]
pub struct Adaptation {
    pub k: usize,
    pub min_similarity: f32,
    pub span: f32,
    pub sharpness: f32,
    pub empty_per_board: usize,
    pub changed_confidence_cap: f32,
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
    input: NodeId,
    logits_output: NodeId,
    /// The 128 pooled features (models from 1.2.0); without them there is no adaptation.
    features_output: Option<NodeId>,
    pub adaptation: Option<Adaptation>,
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
        let node = |name: &str| {
            model
                .find_node(name)
                .ok_or_else(|| Error::InvalidRequest(format!("diagram model: no node {name}")))
        };
        let input = node("squares")?;
        let logits_output = node("logits")?;
        let features_output = model.find_node("features");
        Ok(Recognizer {
            input,
            logits_output,
            features_output,
            adaptation: manifest.adaptation.filter(|_| features_output.is_some()),
            model,
            symbols,
            temperature: manifest.calibration.temperature,
            review_threshold: manifest.calibration.review_threshold,
            version: manifest.version,
        })
    }

    /// Raw logits [n × 13] for n squares of 48 × 48 bytes.
    #[cfg(test)]
    pub fn logits(&self, squares: &[u8]) -> Result<Vec<f32>, Error> {
        Ok(self.run(squares)?.0)
    }

    /// Logits [n × 13] and, when the model has them, features [n × 128].
    pub fn run(&self, squares: &[u8]) -> Result<(Vec<f32>, Option<Vec<f32>>), Error> {
        let n = squares.len() / (SQUARE * SQUARE);
        let input = NdTensor::from_data(
            [n, 1, SQUARE, SQUARE],
            squares
                .iter()
                .map(|&v| v as f32 / 255.0)
                .collect::<Vec<_>>(),
        );
        let mut outputs = vec![self.logits_output];
        outputs.extend(self.features_output);
        let mut values = self
            .model
            .run(vec![(self.input, input.view().into())], &outputs, None)
            .map_err(|e| Error::InvalidRequest(format!("diagram model: {e}")))?
            .into_iter();
        let mut next = || -> Result<Vec<f32>, Error> {
            let value: NdTensor<f32, 2> = values
                .next()
                .ok_or_else(|| Error::InvalidRequest("diagram model: missing output".into()))?
                .try_into()
                .map_err(|_| Error::InvalidRequest("diagram model: unexpected output".into()))?;
            Ok(value.to_vec())
        };
        let logits = next()?;
        let features = match self.features_output {
            Some(_) => Some(next()?),
            None => None,
        };
        Ok((logits, features))
    }

    /// Calibrated probabilities [n × 13] (softmax of logits / T).
    pub fn probabilities(&self, logits: &[f32]) -> Vec<f32> {
        logits
            .chunks_exact(self.symbols.len())
            .flat_map(|row| {
                let scaled: Vec<f32> = row.iter().map(|v| v / self.temperature).collect();
                let max = scaled.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
                let exp: Vec<f32> = scaled.iter().map(|v| (v - max).exp()).collect();
                let total: f32 = exp.iter().sum();
                exp.into_iter().map(move |e| e / total)
            })
            .collect()
    }

    /// Most likely symbol and its probability, from probabilities [n × 13].
    pub fn decide(&self, probabilities: &[f32]) -> Vec<(char, f32)> {
        probabilities
            .chunks_exact(self.symbols.len())
            .map(|row| {
                let (best, p) =
                    row.iter().enumerate().fold(
                        (0, 0.0f32),
                        |acc, (i, &p)| {
                            if p > acc.1 {
                                (i, p)
                            } else {
                                acc
                            }
                        },
                    );
                (self.symbols[best], p)
            })
            .collect()
    }

    /// FEN letter ('.' for empty) of a class index.
    pub fn symbol(&self, class: usize) -> char {
        self.symbols[class]
    }

    /// Class index of a FEN letter ('.' for empty).
    pub fn class_of(&self, symbol: char) -> Option<usize> {
        self.symbols.iter().position(|&s| s == symbol)
    }

    pub fn classes(&self) -> usize {
        self.symbols.len()
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
