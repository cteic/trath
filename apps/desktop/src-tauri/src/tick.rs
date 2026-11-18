//! A once-a-second event for the window. A hidden webview may throttle its
//! own timers, and an event from outside wakes it. The event only says "look
//! at the clock": elapsed time is always worked out from timestamps.

use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const TICK_EVENT: &str = "clock:tick";

#[derive(Clone, Serialize)]
struct Tick {
    /// Epoch milliseconds.
    at: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| u64::try_from(since.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

/// How long to sleep so the next tick lands just after a whole second.
pub fn until_next_second(now_ms: u64) -> Duration {
    Duration::from_millis(1_000 - now_ms % 1_000)
}

pub fn spawn(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(until_next_second(now_ms()));
        let _ = app.emit(TICK_EVENT, Tick { at: now_ms() });
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sleep_ends_on_the_next_whole_second() {
        assert_eq!(until_next_second(12_000), Duration::from_millis(1_000));
        assert_eq!(until_next_second(12_250), Duration::from_millis(750));
        assert_eq!(until_next_second(12_999), Duration::from_millis(1));
    }
}
