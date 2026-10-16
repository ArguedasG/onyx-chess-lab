//! How often a human-like engine (Maia) plays each move in a position.
//!
//! Maia's UCI interface orders its candidate moves but does not print their probabilities, so the
//! move distribution is estimated by asking for a move several times with sampling on
//! (`Temperature` 1, `TopP` 1). Maia takes seconds to start, so the process of a session (`id`)
//! stays alive between requests until `close_engine_sampler` is called.

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock,
    },
    time::Instant,
};

use log::info;
use serde::Serialize;
use specta::Type;
use tokio::sync::Mutex;

use crate::{
    engine::{BaseEngine, EngineOption, GoMode},
    error::Error,
    progress::update_progress,
    AppState,
};

/// Bounds of one request: enough samples for a useful estimate, few enough to stay quick.
const MAX_SAMPLES: u32 = 64;
const MAX_POSITIONS: usize = 400;
/// Live sampler sessions; older ones are closed first beyond this.
const MAX_SESSIONS: usize = 2;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SampledMove {
    pub uci: String,
    pub count: u32,
}

struct Session {
    /// Engine path, arguments and options the process was started with.
    identity: String,
    process: BaseEngine,
    last_used: Instant,
}

static SESSIONS: LazyLock<Mutex<HashMap<String, Session>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

async fn start(
    engine: &str,
    engine_args: &[String],
    uci_options: &[EngineOption],
) -> Result<BaseEngine, Error> {
    let mut process = BaseEngine::spawn(PathBuf::from(engine), engine_args).await?;
    process.init_uci().await?;
    for option in uci_options {
        process
            .set_option_if_supported(&option.name, &option.value)
            .await?;
    }
    // Pure sampling from the policy, one candidate line (the others are not needed).
    process.set_option_if_supported("Temperature", "1").await?;
    process.set_option_if_supported("TopP", "1").await?;
    process.set_option_if_supported("MultiPV", 1).await?;
    Ok(process)
}

/// Samples per position, most frequent first. Options such as Maia's `Elo` come from the caller.
#[tauri::command]
#[specta::specta]
pub async fn sample_engine_moves(
    id: String,
    engine: String,
    engine_args: Vec<String>,
    fens: Vec<String>,
    samples: u32,
    uci_options: Vec<EngineOption>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<Vec<SampledMove>>, Error> {
    if fens.is_empty() {
        return Ok(Vec::new());
    }
    if fens.len() > MAX_POSITIONS {
        return Err(Error::InvalidRequest(format!(
            "At most {MAX_POSITIONS} positions per request"
        )));
    }
    let samples = samples.clamp(1, MAX_SAMPLES);
    let cancelled = Arc::new(AtomicBool::new(false));
    if let Some(previous) = state
        .analysis_cancel_flags
        .insert(id.clone(), cancelled.clone())
    {
        previous.store(true, Ordering::SeqCst);
    }
    let identity = format!(
        "{engine}|{}|{}",
        engine_args.join(" "),
        uci_options
            .iter()
            .map(|option| format!("{}={}", option.name, option.value))
            .collect::<Vec<_>>()
            .join(";")
    );
    let result = async {
        let mut sessions = SESSIONS.lock().await;
        let reuse = sessions
            .get(&id)
            .is_some_and(|session| session.identity == identity);
        if !reuse {
            if let Some(mut old) = sessions.remove(&id) {
                old.process.kill_sync();
            }
            while sessions.len() >= MAX_SESSIONS {
                let oldest = sessions
                    .iter()
                    .min_by_key(|(_, session)| session.last_used)
                    .map(|(key, _)| key.clone());
                match oldest.and_then(|key| sessions.remove(&key)) {
                    Some(mut session) => session.process.kill_sync(),
                    None => break,
                }
            }
            let process = start(&engine, &engine_args, &uci_options).await?;
            sessions.insert(
                id.clone(),
                Session {
                    identity: identity.clone(),
                    process,
                    last_used: Instant::now(),
                },
            );
        }
        let session = sessions.get_mut(&id).expect("inserted above");
        session.last_used = Instant::now();
        let outcome = sample(&mut session.process, &fens, samples, &cancelled, |done| {
            let _ = update_progress(
                &state.progress_state,
                &app,
                id.clone(),
                done as f32 / fens.len() as f32 * 100.0,
                false,
            );
        })
        .await;
        if outcome.is_err() {
            // A cancelled or broken process is not reused.
            if let Some(mut session) = sessions.remove(&id) {
                session.process.kill_sync();
            }
        }
        outcome
    }
    .await;
    state
        .analysis_cancel_flags
        .remove_if(&id, |_, current| Arc::ptr_eq(current, &cancelled));
    let _ = update_progress(&state.progress_state, &app, id, 100.0, true);
    result
}

/// Ends the sampler process of a session.
#[tauri::command]
#[specta::specta]
pub async fn close_engine_sampler(id: String) -> Result<(), Error> {
    if let Some(mut session) = SESSIONS.lock().await.remove(&id) {
        let _ = session.process.quit().await;
        session.process.kill_sync();
    }
    Ok(())
}

async fn sample(
    process: &mut BaseEngine,
    fens: &[String],
    samples: u32,
    cancelled: &AtomicBool,
    progress: impl Fn(usize),
) -> Result<Vec<Vec<SampledMove>>, Error> {
    let started = Instant::now();
    let mut result = Vec::with_capacity(fens.len());
    for (index, fen) in fens.iter().enumerate() {
        progress(index);
        let mut counts: HashMap<String, u32> = HashMap::new();
        for _ in 0..samples {
            if cancelled.load(Ordering::SeqCst) {
                return Err(Error::AnalysisCancelled);
            }
            process.set_position(fen, &[]).await?;
            process.go(&GoMode::Nodes(1)).await?;
            let best = process.wait_for_bestmove().await?;
            if best != "0000" && best != "(none)" {
                *counts.entry(best).or_default() += 1;
            }
        }
        let mut moves: Vec<SampledMove> = counts
            .into_iter()
            .map(|(uci, count)| SampledMove { uci, count })
            .collect();
        moves.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.uci.cmp(&b.uci)));
        result.push(moves);
    }
    info!(
        "Move sampling: {} positions × {samples} samples in {} ms",
        fens.len(),
        started.elapsed().as_millis()
    );
    Ok(result)
}
