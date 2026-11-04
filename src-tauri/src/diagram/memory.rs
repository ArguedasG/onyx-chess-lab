//! Per-book adaptation: the squares of the boards a user corrected in a book, kept on disk next
//! to the book's notes, adjust the next readings of that same book (fonts unlike every training
//! set, such as Alpha). Reference: `ml/diagram-recognizer/tools/sim_adapt.py` (`adapt_board`).
//!
//! The memory corrects readings but never makes a board accepted that the model alone would
//! flag: a square whose answer it changes is capped below the review threshold.

use std::io::{Read, Write};
use std::path::Path;

use super::recognizer::Adaptation;
use crate::error::Error;

const MAGIC: &[u8; 8] = b"ONYXMEM1";
/// Features per square (the model's pooled activations).
pub const DIM: usize = 128;
/// Oldest corrected boards are forgotten beyond this (about 12 MB on disk).
const MAX_BOARDS: usize = 500;

#[derive(Clone, Debug, PartialEq)]
pub struct MemoryBoard {
    /// Identifies the diagram (page and box), so a correction saved again replaces its squares.
    pub key: String,
    /// Class index of each remembered square.
    pub classes: Vec<u8>,
    /// L2-normalised features, `classes.len() × DIM`.
    pub features: Vec<f32>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct BookMemory {
    /// Model version the features come from; another model's memory is ignored.
    pub model_version: String,
    pub boards: Vec<MemoryBoard>,
}

pub fn normalize(features: &mut [f32]) {
    for row in features.chunks_exact_mut(DIM) {
        let norm = row.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-12);
        row.iter_mut().for_each(|v| *v /= norm);
    }
}

/// Up to `count` empty squares, evenly spread over the board's empty squares.
fn empty_sample(empty: &[usize], count: usize) -> Vec<usize> {
    if empty.len() <= count {
        return empty.to_vec();
    }
    let step = empty.len() as f64 / count as f64;
    (0..count)
        .map(|i| empty[(i as f64 * step) as usize])
        .collect()
}

impl BookMemory {
    pub fn new(model_version: &str) -> Self {
        BookMemory {
            model_version: model_version.to_string(),
            boards: Vec::new(),
        }
    }

    pub fn squares(&self) -> usize {
        self.boards.iter().map(|b| b.classes.len()).sum()
    }

    /// Remembers a corrected board: its 64 normalised features and the true class of each square
    /// (display order). Pieces are all kept; empty squares, a few evenly spread.
    pub fn learn(
        &mut self,
        key: &str,
        features: &[f32],
        classes: &[usize],
        empty_per_board: usize,
    ) {
        let empty: Vec<usize> = (0..classes.len()).filter(|&i| classes[i] == 0).collect();
        let mut keep: Vec<usize> = (0..classes.len()).filter(|&i| classes[i] != 0).collect();
        keep.extend(empty_sample(&empty, empty_per_board));
        let board = MemoryBoard {
            key: key.to_string(),
            classes: keep.iter().map(|&i| classes[i] as u8).collect(),
            features: keep
                .iter()
                .flat_map(|&i| features[i * DIM..(i + 1) * DIM].iter().copied())
                .collect(),
        };
        self.boards.retain(|b| b.key != key);
        self.boards.push(board);
        if self.boards.len() > MAX_BOARDS {
            let extra = self.boards.len() - MAX_BOARDS;
            self.boards.drain(..extra);
        }
    }

    /// Adjusts one board's reading. `probabilities` is [64 × classes], `features` [64 × DIM]
    /// normalised. Returns the class and confidence of each square and how many changed.
    pub fn adapt(
        &self,
        probabilities: &[f32],
        features: &[f32],
        classes: usize,
        rule: &Adaptation,
    ) -> (Vec<usize>, Vec<f32>, u32) {
        let argmax = |row: &[f32]| {
            row.iter()
                .enumerate()
                .fold(
                    (0, f32::NEG_INFINITY),
                    |acc, (i, &p)| {
                        if p > acc.1 {
                            (i, p)
                        } else {
                            acc
                        }
                    },
                )
        };
        let rows: Vec<&[f32]> = probabilities.chunks_exact(classes).collect();
        let mut labels: Vec<usize> = rows.iter().map(|r| argmax(r).0).collect();
        let mut confidence: Vec<f32> = rows.iter().map(|r| argmax(r).1).collect();
        let remembered: Vec<(u8, &[f32])> = self
            .boards
            .iter()
            .flat_map(|b| b.classes.iter().copied().zip(b.features.chunks_exact(DIM)))
            .collect();
        if remembered.is_empty() || rule.k == 0 {
            return (labels, confidence, 0);
        }
        let mut changed = 0;
        for (i, query) in features.chunks_exact(DIM).enumerate() {
            let mut sims: Vec<(f32, u8)> = remembered
                .iter()
                .map(|(class, f)| {
                    (
                        query.iter().zip(*f).map(|(a, b)| a * b).sum::<f32>(),
                        *class,
                    )
                })
                .collect();
            // The k most similar, highest first.
            if sims.len() > rule.k {
                sims.select_nth_unstable_by(rule.k - 1, |a, b| b.0.total_cmp(&a.0));
                sims.truncate(rule.k);
            }
            sims.sort_by(|a, b| b.0.total_cmp(&a.0));
            let best = sims[0].0;
            if best < rule.min_similarity {
                continue;
            }
            let mut vote = vec![0f32; classes];
            for (s, class) in &sims {
                vote[*class as usize] += (rule.sharpness * (s - best)).exp();
            }
            let total: f32 = vote.iter().sum();
            let weight = ((best - rule.min_similarity) / rule.span).min(1.0);
            let mixed: Vec<f32> = rows[i]
                .iter()
                .zip(&vote)
                .map(|(p, v)| (1.0 - weight) * p + weight * v / total)
                .collect();
            let (label, p) = argmax(&mixed);
            if label != labels[i] {
                labels[i] = label;
                confidence[i] = p.min(rule.changed_confidence_cap);
                changed += 1;
            }
        }
        (labels, confidence, changed)
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(16 + self.squares() * (1 + 4 * DIM));
        out.extend_from_slice(MAGIC);
        let put_str = |out: &mut Vec<u8>, s: &str| {
            out.extend_from_slice(&(s.len() as u32).to_le_bytes());
            out.extend_from_slice(s.as_bytes());
        };
        put_str(&mut out, &self.model_version);
        out.extend_from_slice(&(DIM as u32).to_le_bytes());
        out.extend_from_slice(&(self.boards.len() as u32).to_le_bytes());
        for board in &self.boards {
            put_str(&mut out, &board.key);
            out.extend_from_slice(&(board.classes.len() as u32).to_le_bytes());
            out.extend_from_slice(&board.classes);
            for v in &board.features {
                out.extend_from_slice(&v.to_le_bytes());
            }
        }
        out
    }

    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        let mut r = bytes;
        let mut magic = [0u8; 8];
        r.read_exact(&mut magic).ok()?;
        if &magic != MAGIC {
            return None;
        }
        let u32_ = |r: &mut &[u8]| -> Option<u32> {
            let mut b = [0u8; 4];
            r.read_exact(&mut b).ok()?;
            Some(u32::from_le_bytes(b))
        };
        let string = |r: &mut &[u8], len: u32| -> Option<String> {
            let len = len as usize;
            if r.len() < len {
                return None;
            }
            let (s, rest) = r.split_at(len);
            *r = rest;
            String::from_utf8(s.to_vec()).ok()
        };
        let len = u32_(&mut r)?;
        let model_version = string(&mut r, len)?;
        if u32_(&mut r)? as usize != DIM {
            return None;
        }
        let count = u32_(&mut r)? as usize;
        let mut boards = Vec::with_capacity(count.min(MAX_BOARDS));
        for _ in 0..count {
            let len = u32_(&mut r)?;
            let key = string(&mut r, len)?;
            let n = u32_(&mut r)? as usize;
            if r.len() < n + n * DIM * 4 {
                return None;
            }
            let (classes, rest) = r.split_at(n);
            let (features, rest) = rest.split_at(n * DIM * 4);
            r = rest;
            boards.push(MemoryBoard {
                key,
                classes: classes.to_vec(),
                features: features
                    .chunks_exact(4)
                    .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
                    .collect(),
            });
        }
        r.is_empty().then_some(BookMemory {
            model_version,
            boards,
        })
    }

    /// The memory saved at `path` for this model, or an empty one (missing file, another model,
    /// damaged file).
    pub fn load(path: &Path, model_version: &str) -> Self {
        std::fs::read(path)
            .ok()
            .and_then(|bytes| Self::from_bytes(&bytes))
            .filter(|m| m.model_version == model_version)
            .unwrap_or_else(|| Self::new(model_version))
    }

    /// Writes the memory atomically (temporary file, then rename).
    pub fn save(&self, path: &Path) -> Result<(), Error> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let tmp = path.with_extension("tmp");
        std::fs::File::create(&tmp)?.write_all(&self.to_bytes())?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }
}
