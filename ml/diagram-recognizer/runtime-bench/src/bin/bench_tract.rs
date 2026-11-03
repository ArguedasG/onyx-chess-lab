use runtime_bench::*;
use std::time::Instant;
use tract_onnx::prelude::*;

fn main() -> TractResult<()> {
    let (path, input, expected, size) = probe_args();
    let t0 = Instant::now();
    let load = |n: usize| -> TractResult<_> {
        tract_onnx::onnx()
            .model_for_path(&path)?
            .with_input_fact(0, f32::fact([n, 1, size, size]).into())?
            .into_optimized()?
            .into_runnable()
    };
    let model64 = load(64)?;
    let load_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let model128 = load(128)?;

    let run = |model: &Arc<TypedRunnableModel>, data: &[f32]| -> Vec<f32> {
        let n = data.len() / (size * size);
        let x: Tensor = tract_ndarray::Array4::from_shape_vec((n, 1, size, size), data.to_vec())
            .unwrap()
            .into();
        let out = model.run(tvec!(x.into())).unwrap();
        out[0].to_plain_array_view::<f32>().unwrap().iter().copied().collect()
    };

    let t0 = Instant::now();
    let first = run(&model64, &input);
    let first_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let both = rotated_batch(&input, size);
    println!(
        "tract size={size} load={load_ms:.1}ms first={first_ms:.1}ms board64={:.2}ms board128={:.2}ms maxdiff={:.2e}",
        median_ms(|| { run(&model64, &input); }, 30),
        median_ms(|| { run(&model128, &both); }, 30),
        max_diff(&first, &expected),
    );
    Ok(())
}
