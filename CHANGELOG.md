# Changelog

All notable changes to Tráth are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-26

The first release: a work-log timer for macOS that sits in the menu bar.

### Added

- One timer with start, pause, resume and stop.
- Three modes: Pomodoro (25 minutes of work, then a 5-minute break), Deep work (90 minutes, then 20) and Stopwatch (until you stop it).
- An optional 20-20-20 eye-break reminder that counts work time only, so a pause delays it.
- Each finished session is saved with its start, end, length, mode, an optional one-line note and
  an optional project tag.
- A Today list with a total.
- Export of a day or a date range to Markdown or CSV. CSV fields that a spreadsheet would run as a
  formula get a leading apostrophe.
- The timer keeps going when the window is closed, shows the time beside the menu-bar icon, and
  picks up where it was after a restart.
- Keys: Space starts, pauses or resumes. Cmd+Enter stops and saves.
- Light and dark, following the system.
- Local data only, under `~/Library/Application Support/ie.cteic.trath/`: a `sessions.jsonl` log
  that is only appended to, and a `state.json` for the running session and settings. Debug builds
  use a `dev` subfolder.
- Safe writes: each session goes down as one flushed line, a line cut short by a crash is skipped
  and reported, the same session id is written once, and `state.json` and exports are replaced in
  one step.
- `TRATH_DATA_DIR` to use another data folder, plus `--hidden` and `TRATH_QUIET=1` for checking a
  build.
- No accounts, no network calls, no telemetry.

[1.0.0]: https://github.com/cteic/trath/releases/tag/v1.0.0
