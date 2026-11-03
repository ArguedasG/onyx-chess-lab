// Same I/O as the benches without a runtime, to measure the binary size each runtime adds.
fn main() {
    let (path, input, expected, size) = runtime_bench::probe_args();
    println!("{path} {} {} {size}", input.len(), expected.len());
}
