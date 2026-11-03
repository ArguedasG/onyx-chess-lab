//! Image preprocessing of the diagram recognizer, bit-exact with the Python training code.
//!
//! The model was trained on squares produced by Pillow (`Image.convert("L")` and
//! `Image.resize(..., Resampling.BOX, box=...)`), so both operations are reimplemented here with
//! Pillow's own fixed-point arithmetic (`libImaging/Convert.c` and `Resample.c`). The parity
//! fixtures in `fixtures/diagram/` check it.

/// An 8-bit grayscale image, row by row.
#[derive(Clone)]
pub struct Gray {
    pub width: usize,
    pub height: usize,
    pub pixels: Vec<u8>,
}

impl Gray {
    pub fn at(&self, x: usize, y: usize) -> u8 {
        self.pixels[y * self.width + x]
    }
}

/// Pillow's RGB → L: `(R * 19595 + G * 38470 + B * 7471 + 0x8000) >> 16`. Alpha is ignored.
pub fn to_gray(image: &image::DynamicImage) -> Gray {
    let (width, height) = (image.width() as usize, image.height() as usize);
    let pixels = match image {
        image::DynamicImage::ImageLuma8(luma) => luma.as_raw().clone(),
        other => other
            .to_rgb8()
            .pixels()
            .map(|p| {
                let [r, g, b] = p.0;
                ((r as u32 * 19595 + g as u32 * 38470 + b as u32 * 7471 + 0x8000) >> 16) as u8
            })
            .collect(),
    };
    Gray {
        width,
        height,
        pixels,
    }
}

const PRECISION_BITS: u32 = 32 - 8 - 2;

struct Coefficients {
    /// (first source pixel, number of source pixels) per output pixel.
    bounds: Vec<(usize, usize)>,
    /// `ksize` fixed-point weights per output pixel.
    weights: Vec<i32>,
    ksize: usize,
}

/// `precompute_coeffs` + `normalize_coeffs_8bpc` for the box filter (support 0.5).
/// `in0` and `in1` are `f32` because Pillow parses the resize box as C floats.
fn coefficients(in_size: usize, in0: f32, in1: f32, out_size: usize) -> Coefficients {
    let scale = (in1 - in0) as f64 / out_size as f64;
    let filterscale = scale.max(1.0);
    let support = 0.5 * filterscale;
    let ksize = support.ceil() as usize * 2 + 1;
    let mut bounds = Vec::with_capacity(out_size);
    let mut weights = vec![0i32; out_size * ksize];
    let mut k = vec![0f64; ksize];
    for xx in 0..out_size {
        let center = in0 as f64 + (xx as f64 + 0.5) * scale;
        let ss = 1.0 / filterscale;
        // C casts truncate toward zero.
        let xmin = ((center - support + 0.5) as i64).max(0) as usize;
        let xmax = ((center + support + 0.5) as i64).min(in_size as i64) as usize;
        let count = xmax.saturating_sub(xmin);
        let mut ww = 0.0;
        for (x, kx) in k.iter_mut().enumerate().take(count) {
            let arg = (x as f64 + xmin as f64 - center + 0.5) * ss;
            let w = if arg > -0.5 && arg <= 0.5 { 1.0 } else { 0.0 };
            *kx = w;
            ww += w;
        }
        for x in 0..ksize {
            let v = if x < count && ww != 0.0 {
                k[x] / ww
            } else {
                0.0
            };
            let fixed = v * (1i64 << PRECISION_BITS) as f64;
            weights[xx * ksize + x] = if v < 0.0 {
                (-0.5 + fixed) as i32
            } else {
                (0.5 + fixed) as i32
            };
        }
        bounds.push((xmin, count));
    }
    Coefficients {
        bounds,
        weights,
        ksize,
    }
}

fn clip8(value: i64) -> u8 {
    if value >= (1i64 << PRECISION_BITS << 8) {
        255
    } else if value <= 0 {
        0
    } else {
        (value >> PRECISION_BITS) as u8
    }
}

/// Pillow's `Image.resize((out_w, out_h), Resampling.BOX, box=(x0, y0, x1, y1))` on an L image.
pub fn resize_box(image: &Gray, box_: [f32; 4], out_w: usize, out_h: usize) -> Gray {
    let [x0, y0, x1, y1] = box_;
    let horiz = coefficients(image.width, x0, x1, out_w);
    let mut vert = coefficients(image.height, y0, y1, out_h);
    let need_horizontal = out_w != image.width || x0 != 0.0 || x1 != image.width as f32;
    let need_vertical = out_h != image.height || y0 != 0.0 || y1 != image.height as f32;

    // Only the rows the vertical pass reads go through the horizontal pass.
    let ybox_first = vert.bounds[0].0;
    let (last_start, last_len) = vert.bounds[out_h - 1];
    let ybox_last = last_start + last_len;

    let temp = if need_horizontal {
        for b in vert.bounds.iter_mut() {
            b.0 -= ybox_first;
        }
        let rows = ybox_last - ybox_first;
        let mut out = vec![0u8; out_w * rows];
        for yy in 0..rows {
            let src = &image.pixels[(yy + ybox_first) * image.width..][..image.width];
            for xx in 0..out_w {
                let (xmin, count) = horiz.bounds[xx];
                let k = &horiz.weights[xx * horiz.ksize..];
                let mut ss: i64 = 1 << (PRECISION_BITS - 1);
                for x in 0..count {
                    ss += src[x + xmin] as i64 * k[x] as i64;
                }
                out[yy * out_w + xx] = clip8(ss);
            }
        }
        Gray {
            width: out_w,
            height: rows,
            pixels: out,
        }
    } else {
        image.clone()
    };

    if !need_vertical {
        return temp;
    }
    let mut out = vec![0u8; out_w * out_h];
    for yy in 0..out_h {
        let (ymin, count) = vert.bounds[yy];
        let k = &vert.weights[yy * vert.ksize..];
        for xx in 0..out_w {
            let mut ss: i64 = 1 << (PRECISION_BITS - 1);
            for y in 0..count {
                ss += temp.pixels[(y + ymin) * temp.width + xx] as i64 * k[y] as i64;
            }
            out[yy * out_w + xx] = clip8(ss);
        }
    }
    Gray {
        width: out_w,
        height: out_h,
        pixels: out,
    }
}

/// Size of the model input square.
pub const SQUARE: usize = 48;

/// The 64 squares of a grid box, row by row from the top-left, each resized to 48 × 48.
/// Boxes are clamped to the image, as in `onyx_diagrams/squares.py`.
pub fn crop_squares(image: &Gray, grid: [f64; 4]) -> Vec<u8> {
    let [x0, y0, x1, y1] = grid;
    let (w, h) = ((x1 - x0) / 8.0, (y1 - y0) / 8.0);
    let mut out = Vec::with_capacity(64 * SQUARE * SQUARE);
    for r in 0..8 {
        for c in 0..8 {
            let a = (x0 + c as f64 * w).max(0.0);
            let b = (y0 + r as f64 * h).max(0.0);
            let cc = (x0 + (c + 1) as f64 * w).min(image.width as f64);
            let d = (y0 + (r + 1) as f64 * h).min(image.height as f64);
            let square = resize_box(
                image,
                [a as f32, b as f32, cc as f32, d as f32],
                SQUARE,
                SQUARE,
            );
            out.extend_from_slice(&square.pixels);
        }
    }
    out
}
