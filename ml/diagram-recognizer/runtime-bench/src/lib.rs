use std::time::Instant;

/// Reads a raw little-endian f32 file written by tools/export_probe.py.
pub fn read_f32(path: &str) -> Vec<f32> {
    std::fs::read(path)
        .unwrap_or_else(|e| panic!("{path}: {e}"))
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect()
}

/// Turns each square 180° (the decoder also reads the board upside down).
pub fn rotated_batch(squares: &[f32], size: usize) -> Vec<f32> {
    let n = size * size;
    let mut out = squares.to_vec();
    for sq in squares.chunks_exact(n) {
        out.extend(sq.iter().rev());
    }
    out
}

pub fn median_ms(mut f: impl FnMut(), runs: usize) -> f64 {
    f();
    let mut t: Vec<f64> = (0..runs)
        .map(|_| {
            let t0 = Instant::now();
            f();
            t0.elapsed().as_secs_f64() * 1000.0
        })
        .collect();
    t.sort_by(|a, b| a.partial_cmp(b).unwrap());
    t[runs / 2]
}

pub fn max_diff(a: &[f32], b: &[f32]) -> f32 {
    assert_eq!(a.len(), b.len());
    a.iter().zip(b).map(|(x, y)| (x - y).abs()).fold(0.0, f32::max)
}

/// Args: <dir> <size>. Returns (model path, input, expected output, size).
pub fn probe_args() -> (String, Vec<f32>, Vec<f32>, usize) {
    let args: Vec<String> = std::env::args().collect();
    let dir = args.get(1).map(String::as_str).unwrap_or("../runs/probe");
    let size: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(48);
    (
        format!("{dir}/probe-{size}.onnx"),
        read_f32(&format!("{dir}/probe-{size}.input.f32")),
        read_f32(&format!("{dir}/probe-{size}.output.f32")),
        size,
    )
}
