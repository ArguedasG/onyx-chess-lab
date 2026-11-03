use rten::Model;
use rten_tensor::prelude::*;
use rten_tensor::NdTensor;
use runtime_bench::*;
use std::time::Instant;

fn main() {
    let (path, input, expected, size) = probe_args();
    let t0 = Instant::now();
    let model = Model::load_file(&path).expect("load");
    let load_ms = t0.elapsed().as_secs_f64() * 1000.0;

    let run = |data: &[f32]| -> Vec<f32> {
        let n = data.len() / (size * size);
        let x = NdTensor::from_data([n, 1, size, size], data.to_vec());
        let out = model.run_one(x.view().into(), None).expect("run");
        let out: NdTensor<f32, 2> = out.try_into().expect("f32 [n, 13]");
        out.to_vec()
    };

    let t0 = Instant::now();
    let first = run(&input);
    let first_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let both = rotated_batch(&input, size);
    println!(
        "rten  size={size} load={load_ms:.1}ms first={first_ms:.1}ms board64={:.2}ms board128={:.2}ms maxdiff={:.2e}",
        median_ms(|| { run(&input); }, 30),
        median_ms(|| { run(&both); }, 30),
        max_diff(&first, &expected),
    );
}
