//! Finds the 8 × 8 grid of a board in an image, without a model.
//!
//! Port of `ml/diagram-recognizer/onyx_diagrams/locate.py`, operation by operation, so both give
//! the same grid: the board is the square whose cells show the strongest checkerboard contrast
//! (dark cells minus light cells, where "dark" is darkness plus texture, so hatched squares count),
//! with the top-left square light whatever the orientation. Coarse search on a copy reduced to
//! 160 px, then a fine pass at full resolution. Cell sums come from an integral image in f64,
//! where every sum is an exact integer.

use super::preprocess::{resize_box, Gray};

const COARSE: f64 = 160.0;
const MIN_SIDE: f64 = 0.45;
const MIN_SPREAD: f64 = 5.0;

/// Grid box (x0, y0, x1, y1) in image pixels and the normalized contrast score.
pub struct Located {
    pub grid: [f64; 4],
    pub score: f64,
}

/// Darkness plus texture (|horizontal| + |vertical| differences), as f64.
fn signal(image: &Gray) -> Vec<f64> {
    let (w, h) = (image.width, image.height);
    let mut out = vec![0.0; w * h];
    for y in 0..h {
        for x in 0..w {
            let g = image.at(x, y) as f64;
            let mut tex = 0.0;
            if x > 0 {
                tex += (g - image.at(x - 1, y) as f64).abs();
            }
            if y > 0 {
                tex += (g - image.at(x, y - 1) as f64).abs();
            }
            out[y * w + x] = (255.0 - g) + tex;
        }
    }
    out
}

struct Integral {
    stride: usize,
    data: Vec<f64>,
}

impl Integral {
    fn new(values: &[f64], w: usize, h: usize) -> Self {
        let stride = w + 1;
        let mut data = vec![0.0; stride * (h + 1)];
        for y in 0..h {
            let mut row = 0.0;
            for x in 0..w {
                row += values[y * w + x];
                data[(y + 1) * stride + x + 1] = data[y * stride + x + 1] + row;
            }
        }
        Integral { stride, data }
    }

    fn sum(&self, x0: usize, y0: usize, x1: usize, y1: usize) -> f64 {
        let s = self.stride;
        self.data[y1 * s + x1] - self.data[y0 * s + x1] - self.data[y1 * s + x0]
            + self.data[y0 * s + x0]
    }
}

/// `np.round(np.arange(9) * side / 8).astype(int)`.
fn edges(side: f64) -> [usize; 9] {
    std::array::from_fn(|k| ((k as f64 * side) / 8.0).round_ties_even() as usize)
}

/// Checkerboard contrast of the grid with top-left corner (x, y).
fn contrast(
    i: &Integral,
    x: usize,
    y: usize,
    ex: &[usize; 9],
    ey: &[usize; 9],
    side: f64,
    side_y: f64,
) -> f64 {
    let mut score = 0.0;
    for r in 0..8 {
        for c in 0..8 {
            let total = i.sum(x + ex[c], y + ey[r], x + ex[c + 1], y + ey[r + 1]);
            score += if (r + c) % 2 == 1 { total } else { -total };
        }
    }
    score / (32.0 * side * side_y / 64.0)
}

/// `np.arange(start, stop, step)` for floats, value by value as NumPy fills it.
fn arange(start: f64, stop: f64, step: f64) -> Vec<f64> {
    let len = ((stop - start) / step).ceil();
    if !(len > 0.0) {
        return Vec::new();
    }
    let len = len as usize;
    let second = start + step;
    let delta = second - start;
    (0..len)
        .map(|i| match i {
            0 => start,
            1 => second,
            _ => start + i as f64 * delta,
        })
        .collect()
}

pub fn find_grid(image: &Gray) -> Option<Located> {
    let (w, h) = (image.width, image.height);
    if w < 8 || h < 8 {
        return None;
    }
    let dark = signal(image);
    let n = dark.len() as f64;
    let mean = dark.iter().sum::<f64>() / n;
    let spread = (dark.iter().map(|v| (v - mean) * (v - mean)).sum::<f64>() / n).sqrt() + 1e-6;
    // A nearly uniform image has no board (and its tiny contrast would be divided by ~0).
    if spread < MIN_SPREAD {
        return None;
    }

    // Coarse pass.
    let s = (COARSE / w.max(h) as f64).min(1.0);
    let sw = ((w as f64 * s).round_ties_even() as usize).max(8);
    let sh = ((h as f64 * s).round_ties_even() as usize).max(8);
    let small = resize_box(image, [0.0, 0.0, w as f32, h as f32], sw, sh);
    let small_integral = Integral::new(&signal(&small), sw, sh);
    let mut best = (f64::NEG_INFINITY, 0usize, 0usize, 0usize);
    let min_side = ((MIN_SIDE * sh.min(sw) as f64) as usize).max(8);
    for side in min_side..=sh.min(sw) {
        let e = edges(side as f64);
        for y in 0..=(sh - side) {
            for x in 0..=(sw - side) {
                let c = contrast(&small_integral, x, y, &e, &e, side as f64, side as f64);
                if c > best.0 {
                    best = (c, y, x, side);
                }
            }
        }
    }
    if best.0 == f64::NEG_INFINITY {
        return None;
    }

    // Fine pass at full resolution: position ± one coarse pixel, each side ± 2 coarse pixels.
    let (_, y0, x0, side) = best;
    let integral = Integral::new(&dark, w, h);
    let (fy, fx, fside) = (y0 as f64 / s, x0 as f64 / s, side as f64 / s);
    let r = (1.0 / s).ceil() as i64 + 1;
    let mut best_full = (f64::NEG_INFINITY, 0.0, 0.0, 0.0, 0.0);
    for sx in arange(fside - 2.0 / s, fside + 2.0 / s + 1.0, 1.0) {
        for sy in arange(sx * 0.97, sx * 1.03 + 1.0, (sx * 0.005).max(1.0)) {
            if sx < 8.0 {
                continue;
            }
            let y_lo = (fy as i64 - r).max(0);
            let y_hi = (h as i64 - sy.ceil() as i64).min(fy as i64 + r);
            let x_lo = (fx as i64 - r).max(0);
            let x_hi = (w as i64 - sx.ceil() as i64).min(fx as i64 + r);
            if y_hi < y_lo || x_hi < x_lo {
                continue;
            }
            let (ex, ey) = (edges(sx), edges(sy));
            // The first maximum in row-major order wins, as with `np.argmax`.
            let mut local = (f64::NEG_INFINITY, 0i64, 0i64);
            for y in y_lo..=y_hi {
                for x in x_lo..=x_hi {
                    let c = contrast(&integral, x as usize, y as usize, &ex, &ey, sx, sy);
                    if c > local.0 {
                        local = (c, x, y);
                    }
                }
            }
            if local.0 > best_full.0 {
                best_full = (local.0, local.1 as f64, local.2 as f64, sx, sy);
            }
        }
    }
    let (score, gx, gy, sx, sy) = best_full;
    if score == f64::NEG_INFINITY {
        return None;
    }
    Some(Located {
        grid: [gx, gy, gx + sx, gy + sy],
        score: score / spread,
    })
}
