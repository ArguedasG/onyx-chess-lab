//! Finds every board on a page: port of `ml/diagram-recognizer/onyx_diagrams/detect.py`,
//! operation by operation, so both find the same boards.
//!
//! Every position and size from 8 % to 70 % of the page width (sizes 3 % apart) is tried on a copy
//! reduced to 400 px, and scored by neighbour agreement: of the 112 pairs of adjacent cells, the
//! share in which the dark cell is darker than the light one, each cell measured on its four
//! corners (pieces are round and stand in the middle). Text, blank paper and noise score about 0.5 whatever their
//! contrast; boards score 0.85–1. Local maxima are taken from the best down without overlaps and
//! refined at full resolution with the locator's fine pass.

use rayon::prelude::*;

use super::locate::{refine, signal, Integral};
use super::preprocess::Gray;

const COARSE: f64 = 400.0;
const MIN_FRACTION: f64 = 0.08;
const MAX_FRACTION: f64 = 0.7;
const SIDE_STEP: f64 = 1.03;
const MIN_AGREEMENT: f64 = 0.8;
const AGREEMENT_MARGIN: f64 = 3.0;
const CORNER: f64 = 0.25;

pub struct Detected {
    pub grid: [f64; 4],
    pub agreement: f64,
}

/// Area average to `s` times the size: block sums (exact) divided once by the block area.
fn reduce(values: &[f64], w: usize, h: usize, s: f64) -> (Vec<f64>, usize, usize) {
    let sh = ((h as f64 * s).round_ties_even() as usize).max(8);
    let sw = ((w as f64 * s).round_ties_even() as usize).max(8);
    let ys: Vec<usize> = (0..=sh)
        .map(|i| ((i * h) as f64 / sh as f64).round_ties_even() as usize)
        .collect();
    let xs: Vec<usize> = (0..=sw)
        .map(|i| ((i * w) as f64 / sw as f64).round_ties_even() as usize)
        .collect();
    let mut out = vec![0.0; sw * sh];
    for by in 0..sh {
        for bx in 0..sw {
            let mut sum = 0.0;
            for y in ys[by]..ys[by + 1] {
                for x in xs[bx]..xs[bx + 1] {
                    sum += values[y * w + x];
                }
            }
            let area = ((ys[by + 1] - ys[by]) * (xs[bx + 1] - xs[bx])) as f64;
            out[by * sw + bx] = sum / area;
        }
    }
    (out, sw, sh)
}

fn edges(side: usize) -> [usize; 9] {
    std::array::from_fn(|k| ((k * side) as f64 / 8.0).round_ties_even() as usize)
}

/// Neighbour agreement of the grid of that side for every top-left corner, row by row.
fn agreement_map(integral: &Integral, w: usize, h: usize, side: usize) -> (Vec<f64>, usize, usize) {
    let e = edges(side);
    let (nx, ny) = (w - side + 1, h - side + 1);
    // Per cell: (y0, y1, x0, x1, ky, kx), the cell and the size of its corner patches. The four
    // corners show the square itself: pieces are round and centred.
    let cells: Vec<[usize; 6]> = (0..64)
        .map(|i| {
            let (r, c) = (i / 8, i % 8);
            let (y0, y1, x0, x1) = (e[r], e[r + 1], e[c], e[c + 1]);
            let ky = ((CORNER * (y1 - y0) as f64).round_ties_even() as usize).max(1);
            let kx = ((CORNER * (x1 - x0) as f64).round_ties_even() as usize).max(1);
            [y0, y1, x0, x1, ky, kx]
        })
        .collect();
    // The 112 pairs of adjacent cells as (dark, light), in a fixed order.
    let pairs: Vec<(usize, usize)> = (0..8)
        .flat_map(|r| (0..8).map(move |c| (r, c)))
        .flat_map(|(r, c)| {
            [(0, 1), (1, 0)]
                .into_iter()
                .filter(move |(dr, dc)| r + dr <= 7 && c + dc <= 7)
                .map(move |(dr, dc)| {
                    let (a, b) = (r * 8 + c, (r + dr) * 8 + c + dc);
                    if (r + c) % 2 == 1 {
                        (a, b)
                    } else {
                        (b, a)
                    }
                })
        })
        .collect();
    // Below MIN_AGREEMENT a position can be neither a board nor block one (a qualifying local
    // maximum only competes with qualifying neighbours), so it stops early and scores 0: the
    // boards found are exactly those of the full computation.
    let max_disagree = pairs.len() - (MIN_AGREEMENT * pairs.len() as f64).ceil() as usize;
    let mut out = vec![0.0; nx * ny];
    let mut means = [0.0f64; 64];
    for y in 0..ny {
        for x in 0..nx {
            let mut known = [false; 64];
            let mean = |i: usize, means: &mut [f64; 64], known: &mut [bool; 64]| {
                if !known[i] {
                    let [y0, y1, x0, x1, ky, kx] = cells[i];
                    let (y0, y1, x0, x1) = (y + y0, y + y1, x + x0, x + x1);
                    let total = integral.sum(x0, y0, x0 + kx, y0 + ky)
                        + integral.sum(x1 - kx, y0, x1, y0 + ky)
                        + integral.sum(x0, y1 - ky, x0 + kx, y1)
                        + integral.sum(x1 - kx, y1 - ky, x1, y1);
                    means[i] = total / (4 * ky * kx) as f64;
                    known[i] = true;
                }
                means[i]
            };
            let (mut agree, mut disagree) = (0usize, 0usize);
            for &(dark, light) in &pairs {
                let d = mean(dark, &mut means, &mut known);
                let l = mean(light, &mut means, &mut known);
                if d - l > AGREEMENT_MARGIN {
                    agree += 1;
                } else {
                    disagree += 1;
                    if disagree > max_disagree {
                        break;
                    }
                }
            }
            out[y * nx + x] = if disagree > max_disagree {
                0.0
            } else {
                agree as f64 / 112.0
            };
        }
    }
    (out, nx, ny)
}

/// Positions not lower than any neighbour within `radius`, row by row (like `np.nonzero`).
fn local_maxima(score: &[f64], nx: usize, ny: usize, radius: usize) -> Vec<(f64, usize, usize)> {
    let mut out = Vec::new();
    for y in 0..ny {
        for x in 0..nx {
            let v = score[y * nx + x];
            // Only boards are wanted: lower positions are dropped right after anyway.
            if v < MIN_AGREEMENT {
                continue;
            }
            let mut neighbourhood = f64::NEG_INFINITY;
            for yy in y.saturating_sub(radius)..=(y + radius).min(ny - 1) {
                for xx in x.saturating_sub(radius)..=(x + radius).min(nx - 1) {
                    if xx != x || yy != y {
                        neighbourhood = neighbourhood.max(score[yy * nx + xx]);
                    }
                }
            }
            if v >= neighbourhood {
                out.push((v, x, y));
            }
        }
    }
    out
}

/// Intersection over the smaller area.
fn overlap(a: [usize; 4], b: [usize; 4]) -> f64 {
    let w = a[2].min(b[2]) as i64 - a[0].max(b[0]) as i64;
    let h = a[3].min(b[3]) as i64 - a[1].max(b[1]) as i64;
    if w <= 0 || h <= 0 {
        return 0.0;
    }
    let area = |r: [usize; 4]| ((r[2] - r[0]) * (r[3] - r[1])) as f64;
    (w * h) as f64 / area(a).min(area(b))
}

/// Every board on the page, best first, as grid boxes in the image's pixels.
pub fn detect_boards(image: &Gray) -> Vec<Detected> {
    let (w, h) = (image.width, image.height);
    if w < 16 || h < 16 {
        return Vec::new();
    }
    let s = (COARSE / w.max(h) as f64).min(1.0);
    let full = signal(image);
    let (small, sw, sh) = reduce(&full, w, h, s);
    let integral = Integral::new(&small, sw, sh);

    let mut sides = Vec::new();
    let mut side = (MIN_FRACTION * sw as f64).max(12.0);
    while side <= MAX_FRACTION * sh.min(sw) as f64 {
        let rounded = side.round_ties_even() as usize;
        if sides.last() != Some(&rounded) {
            sides.push(rounded);
        }
        side *= SIDE_STEP;
    }

    // Sizes run in parallel; results are gathered in size order, as in the sequential version.
    let per_side: Vec<Vec<(f64, usize, usize, usize)>> = sides
        .par_iter()
        .filter(|&&side| side <= sh.min(sw))
        .map(|&side| {
            let (agree, nx, ny) = agreement_map(&integral, sw, sh, side);
            local_maxima(&agree, nx, ny, (side / 16).max(1))
                .into_iter()
                .filter(|(value, _, _)| *value >= MIN_AGREEMENT)
                .map(|(value, x, y)| (value, side, x, y))
                .collect()
        })
        .collect();
    let mut candidates: Vec<(f64, usize, usize, usize)> = per_side.into_iter().flatten().collect();
    // Best agreement first; among equals, the larger board. Stable, like Python's sort.
    candidates.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap().then(b.1.cmp(&a.1)));

    let mut taken: Vec<([usize; 4], f64)> = Vec::new();
    for (value, side, x, y) in candidates {
        let bx = [x, y, x + side, y + side];
        if taken.iter().any(|(other, _)| overlap(bx, *other) > 0.15) {
            continue;
        }
        taken.push((bx, value));
    }

    let full_integral = Integral::new(&full, w, h);
    taken
        .into_iter()
        .filter_map(|(b, agreement)| {
            let (grid, _) = refine(
                &full_integral,
                h,
                w,
                b[0] as f64 / s,
                b[1] as f64 / s,
                (b[2] - b[0]) as f64 / s,
                s,
            )?;
            Some(Detected { grid, agreement })
        })
        .collect()
}

/// Side to move printed next to the board: a small solid mark (dot, triangle, square) in the
/// strip right of the board, level with its top rank (Black) or its bottom rank (White). The mark
/// must be compact and clear of the strip's edges, so a text box or a line beside the board does
/// not count; only one of the two places may have it.
pub fn turn_mark(image: &Gray, grid: [f64; 4]) -> Option<char> {
    let side = grid[2] - grid[0];
    let x0 = (grid[2] + 0.02 * side) as usize;
    let x1 = ((grid[2] + 0.14 * side) as usize).min(image.width);
    if x1 <= x0 + 4 {
        return None;
    }
    // (has a compact mark, is blank) for a band of rows.
    let band = |y0: f64, y1: f64| -> (bool, bool) {
        let (y0, y1) = (y0.max(0.0) as usize, (y1 as usize).min(image.height));
        if y1 <= y0 + 4 {
            return (false, false);
        }
        let dark: Vec<(usize, usize)> = (y0..y1)
            .flat_map(|y| (x0..x1).map(move |x| (x, y)))
            .filter(|&(x, y)| image.at(x, y) < 110)
            .collect();
        if dark.is_empty() {
            return (false, true);
        }
        let (bx0, bx1) = dark
            .iter()
            .fold((usize::MAX, 0), |(a, b), &(x, _)| (a.min(x), b.max(x)));
        let (by0, by1) = dark
            .iter()
            .fold((usize::MAX, 0), |(a, b), &(_, y)| (a.min(y), b.max(y)));
        let (bw, bh) = ((bx1 - bx0 + 1) as f64, (by1 - by0 + 1) as f64);
        let compact = bw <= 0.1 * side
            && bh <= 0.1 * side
            && bw >= 0.02 * side
            && bh >= 0.02 * side
            && dark.len() as f64 >= 0.3 * bw * bh
            && bx0 > x0
            && bx1 < x1 - 1
            && by0 > y0
            && by1 < y1 - 1;
        (compact, false)
    };
    let edge = 0.18 * side;
    let (top_mark, top_blank) = band(grid[1] - 0.02 * side, grid[1] + edge);
    let (bottom_mark, bottom_blank) = band(grid[3] - edge, grid[3] + 0.02 * side);
    match (top_mark, bottom_mark) {
        (true, false) if bottom_blank => Some('b'),
        (false, true) if top_blank => Some('w'),
        _ => None,
    }
}
