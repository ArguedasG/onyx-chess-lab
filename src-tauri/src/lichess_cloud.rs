//! Evaluations of the opening from the Lichess cloud (idea I-14, optional and off by default).
//!
//! Opening positions are usually in the cloud, analyzed far deeper than a report can afford, so a
//! report may take them from there instead of running the engine. Only the start of the game is
//! asked for, one request at a time, with a short pause between requests and a total time budget;
//! the first position missing from the cloud, or a `429`, ends it. It sends positions to Lichess, so the user turns
//! it on explicitly.

use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

use serde::Deserialize;
use tokio::sync::Mutex;

/// Plies of the game whose positions may come from the cloud.
pub const MAX_CLOUD_PLIES: usize = 36;
/// Cloud evaluations shallower than this are not used.
pub const MIN_CLOUD_DEPTH: u32 = 20;
const TIME_BUDGET: Duration = Duration::from_secs(12);
const PAUSE: Duration = Duration::from_millis(80);
const URL: &str = "https://lichess.org/api/cloud-eval";

/// One request at a time across the whole application, like the other Lichess requests.
static REQUESTS: Mutex<()> = Mutex::const_new(());

#[derive(Debug, Clone, Deserialize)]
pub struct CloudPv {
    pub moves: String,
    #[serde(default)]
    pub cp: Option<i32>,
    #[serde(default)]
    pub mate: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CloudEval {
    pub depth: u32,
    pub pvs: Vec<CloudPv>,
}

/// Cloud evaluations of the first positions, in order, stopping at the first one missing: the
/// report then analyzes the rest with the engine. Scores are from White's side, like the engine's.
pub async fn opening_prefix(fens: &[String], lines: u16, cancelled: &AtomicBool) -> Vec<CloudEval> {
    let _turn = REQUESTS.lock().await;
    let Ok(client) = reqwest::Client::builder()
        .user_agent(concat!("OnyxChessLab/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(5))
        .build()
    else {
        return Vec::new();
    };
    let started = Instant::now();
    let mut found = Vec::new();
    for fen in fens.iter().take(MAX_CLOUD_PLIES + 1) {
        if cancelled.load(Ordering::Relaxed) || started.elapsed() > TIME_BUDGET {
            break;
        }
        if !found.is_empty() {
            tokio::time::sleep(PAUSE).await;
        }
        let response = client
            .get(URL)
            .query(&[("fen", fen.as_str()), ("multiPv", &lines.to_string())])
            .send()
            .await;
        let evaluation = match response {
            Ok(response) if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS => break,
            Ok(response) if response.status().is_success() => {
                response.json::<CloudEval>().await.ok()
            }
            _ => None,
        };
        // A prefix only: from the first position missing (or too shallow) on, the engine decides.
        match evaluation.filter(|eval| eval.depth >= MIN_CLOUD_DEPTH && !eval.pvs.is_empty()) {
            Some(eval) => found.push(eval),
            None => break,
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real request: `cargo test lichess_cloud -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore = "network"]
    async fn asks_lichess_for_a_common_opening() {
        let fens = [
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string(),
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1".to_string(),
            "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2".to_string(),
        ];
        let found = opening_prefix(&fens, 2, &AtomicBool::new(false)).await;
        println!("{found:?}");
        assert_eq!(found.len(), 3);
        assert!(found.iter().all(|eval| eval.depth >= MIN_CLOUD_DEPTH));
    }

    #[test]
    fn reads_the_cloud_format() {
        let eval: CloudEval = serde_json::from_str(
            r#"{"fen":"x","knodes":1,"depth":45,"pvs":[{"moves":"e2e4 e7e5","cp":18},{"moves":"d2d4","mate":-3}]}"#,
        )
        .unwrap();
        assert_eq!(eval.depth, 45);
        assert_eq!(eval.pvs[0].cp, Some(18));
        assert_eq!(eval.pvs[1].mate, Some(-3));
    }
}
