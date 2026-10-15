//! How many engine processes Onyx runs at once for batch work, and with how many threads and how
//! much hash each, so batch analysis never saturates the machine.
//!
//! Batch analyses (Player Analysis, several games in a row) take a permit before starting their
//! engine, and their `Threads` and `Hash` are set from the budget instead of the engine's
//! settings, because those settings are meant for a single engine. Interactive work (the report of
//! the open game, live analysis) is started by the user one at a time and keeps the engine's own
//! settings; one core is left free for it and for the interface.

use std::sync::Arc;

use once_cell::sync::Lazy;
use serde::Serialize;
use specta::Type;
use sysinfo::SystemExt;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

/// Upper limits, whatever the machine: more processes stop paying off and use a lot of memory.
const MAX_BATCH_PROCESSES: u32 = 6;
const MAX_TOTAL_HASH_MB: u64 = 1024;
const MIN_HASH_MB: u32 = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EngineBudget {
    pub logical_cores: u32,
    pub physical_cores: u32,
    pub total_memory_mb: u64,
    /// Engine processes that batch analyses may run at the same time.
    pub batch_processes: u32,
    /// `Threads` of each batch engine.
    pub threads_per_process: u32,
    /// `Hash` (MB) of each batch engine.
    pub hash_mb_per_process: u32,
}

/// Largest power of two not above `value` (and at least `MIN_HASH_MB`).
fn hash_size(value: u64) -> u32 {
    let mut size = MIN_HASH_MB as u64;
    while size * 2 <= value {
        size *= 2;
    }
    size as u32
}

pub fn budget_for(logical_cores: u32, physical_cores: u32, total_memory_mb: u64) -> EngineBudget {
    let logical = logical_cores.max(1);
    let physical = physical_cores.clamp(1, logical);
    // One physical core stays free for the interface and an interactive engine.
    let batch_processes = physical.saturating_sub(1).clamp(1, MAX_BATCH_PROCESSES);
    let spare_threads = logical.saturating_sub(2).max(1);
    let threads_per_process = (spare_threads / batch_processes).max(1);
    let total_hash = (total_memory_mb / 16).clamp(MIN_HASH_MB as u64, MAX_TOTAL_HASH_MB);
    EngineBudget {
        logical_cores: logical,
        physical_cores: physical,
        total_memory_mb,
        batch_processes,
        threads_per_process,
        hash_mb_per_process: hash_size(total_hash / batch_processes as u64),
    }
}

pub static BUDGET: Lazy<EngineBudget> = Lazy::new(|| {
    let logical = std::thread::available_parallelism()
        .map(|cores| cores.get() as u32)
        .unwrap_or(2);
    let system = sysinfo::System::new_all();
    let physical = system
        .physical_core_count()
        .map(|cores| cores as u32)
        .unwrap_or(logical / 2);
    budget_for(logical, physical, system.total_memory() / (1024 * 1024))
});

static BATCH_PERMITS: Lazy<Arc<Semaphore>> =
    Lazy::new(|| Arc::new(Semaphore::new(BUDGET.batch_processes as usize)));

/// Batch slots allowed while `live` interactive engines are analyzing: each one takes a slot,
/// but batch work never stops completely.
pub fn allowed_batch_slots(budget: &EngineBudget, live: u32) -> u32 {
    budget.batch_processes.saturating_sub(live).max(1)
}

/// Waits for a free batch slot; the slot is released when the permit is dropped. `live` counts
/// the interactive engines analyzing right now (live analysis), which also use the machine, so
/// fewer batch engines start while they run.
pub async fn acquire_batch_slot(live: impl Fn() -> u32) -> OwnedSemaphorePermit {
    loop {
        let permit = BATCH_PERMITS
            .clone()
            .acquire_owned()
            .await
            .expect("the batch semaphore is never closed");
        let held = BUDGET.batch_processes - BATCH_PERMITS.available_permits() as u32;
        if held <= allowed_batch_slots(&BUDGET, live()) {
            return permit;
        }
        drop(permit);
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_engine_budget() -> EngineBudget {
    *BUDGET
}

/// When the process started, for the startup measurement of the performance budget (I-54).
pub static PROCESS_STARTED: Lazy<std::time::Instant> = Lazy::new(std::time::Instant::now);
/// Milliseconds from the process start until the main window was shown (0 until then).
pub static STARTUP_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Records the startup time once, when the main window is shown.
pub fn record_startup() -> u64 {
    let elapsed = PROCESS_STARTED.elapsed().as_millis() as u64;
    let _ = STARTUP_MS.compare_exchange(
        0,
        elapsed,
        std::sync::atomic::Ordering::AcqRel,
        std::sync::atomic::Ordering::Acquire,
    );
    STARTUP_MS.load(std::sync::atomic::Ordering::Acquire)
}

/// Startup of this session: milliseconds until the main window was shown, or null before that.
#[tauri::command]
#[specta::specta]
pub fn get_startup_ms() -> Option<u32> {
    match STARTUP_MS.load(std::sync::atomic::Ordering::Acquire) {
        0 => None,
        value => Some(value.min(u32::MAX as u64) as u32),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leaves_a_core_free_and_splits_threads_and_hash() {
        // The reference laptop: i5-1135G7, 4 cores / 8 threads, 16 GB.
        assert_eq!(
            budget_for(8, 4, 16_000),
            EngineBudget {
                logical_cores: 8,
                physical_cores: 4,
                total_memory_mb: 16_000,
                batch_processes: 3,
                threads_per_process: 2,
                hash_mb_per_process: 256,
            }
        );
        let small = budget_for(2, 1, 4_000);
        assert_eq!((small.batch_processes, small.threads_per_process), (1, 1));
        assert_eq!(small.hash_mb_per_process, 128);
        // Each live engine takes a slot; batch work keeps at least one.
        let laptop = budget_for(8, 4, 16_000);
        assert_eq!(allowed_batch_slots(&laptop, 0), 3);
        assert_eq!(allowed_batch_slots(&laptop, 1), 2);
        assert_eq!(allowed_batch_slots(&laptop, 5), 1);
        let big = budget_for(64, 32, 128_000);
        assert_eq!(big.batch_processes, MAX_BATCH_PROCESSES);
        assert_eq!(big.threads_per_process, 10);
        assert_eq!(big.hash_mb_per_process, 128);
    }
}
