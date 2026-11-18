# Tráth

A small work-log timer for macOS. It sits in the menu bar, times one session at a time and keeps
a plain file of what you worked on.

Tráth is Irish for "a time, a period".

## What it does

- One timer with start, pause, resume and stop.
- Three modes:

  | Mode      | Work              | Break      |
  | --------- | ----------------- | ---------- |
  | Pomodoro  | 25 minutes        | 5 minutes  |
  | Deep work | 90 minutes        | 20 minutes |
  | Stopwatch | Until you stop it | None       |

- An optional 20-20-20 eye-break reminder: after every 20 minutes of work, a notification asks you
  to look 20 feet away for 20 seconds. It counts work time only, so a pause delays it.
- Each finished session is saved with its start, end, length, mode, an optional one-line note and
  an optional project tag.
- A "Today" list with a total.
- Export of a day or a date range to Markdown or CSV.
- The timer keeps going when the window is closed, and picks up where it was after a restart.
  Example: start a Pomodoro at 09:00, quit at 09:10, reopen at 09:15. The clock shows 10:00 left.
- Light and dark, following the system.
- No accounts, no network calls, no telemetry.

## Keys

| Key       | Action                 |
| --------- | ---------------------- |
| Space     | Start, pause or resume |
| Cmd+Enter | Stop and save          |

Space types a space as usual inside the note and project fields.

## Where the data lives

Everything is local, under `~/Library/Application Support/ie.cteic.trath/`. Debug builds use the
`dev` subfolder so they never touch the real log.

| File             | Contents                                                              |
| ---------------- | --------------------------------------------------------------------- |
| `sessions.jsonl` | The log. JSON Lines: one finished session per line, only appended to. |
| `state.json`     | The running session and the settings. Replaced whole on each change.  |

One line of the log:

```json
{
  "id": "0c6c…",
  "startedAt": 1795000800000,
  "endedAt": 1795002300000,
  "durationMs": 1500000,
  "mode": "pomodoro",
  "note": "Write retry tests",
  "project": "billing"
}
```

Times are epoch milliseconds. `durationMs` is work time, so it is less than `endedAt - startedAt`
when the session was paused.

How writes stay safe:

- A session goes down as one line in one write and is flushed to disk before the save returns.
- A line cut short by a crash is skipped on read, and the app says how many lines it skipped.
- Saving the same session id twice writes it once, so a retry after a failed save is safe.
- `state.json` and exports are written to a sibling file and renamed into place, so a reader sees
  the old file or the new one, never half of either.

Set `TRATH_DATA_DIR` to use another folder. Example: `TRATH_DATA_DIR=/tmp/trath-test` leaves the
real log untouched.

## How it is built

A pnpm workspace run by Turborepo.

| Path                     | What it holds                                                                 |
| ------------------------ | ----------------------------------------------------------------------------- |
| `packages/core`          | The timer as a pure function, day maths and the exports. No platform imports. |
| `apps/desktop`           | The React window. It talks to the outside through one `Backend` interface.    |
| `apps/desktop/src-tauri` | The Tauri 2 shell in Rust: files, menu-bar icon, notifications, a tick.       |
| `packages/*-config`      | Shared ESLint, Prettier and TypeScript settings.                              |

The timer in `packages/core` is `transition(state, event, settings)`. It holds no timers and reads
no clock: every timed event carries its own time. Elapsed time is always worked out from the saved
start time and the clock, never from counting ticks. That is why a restart, a closed window or a
late tick cannot make it drift. Example: a test starts a Pomodoro at 09:00, sends one tick stamped
09:27 and checks the session was closed at 09:25.

Rust holds no product rules. It does not know what a Pomodoro is. It stores what it is given,
checks it, and sends the window an event once a second, because a hidden webview may slow its own
timers.

## Develop

You need Node 24, pnpm 12, Rust 1.90 or later and the Xcode Command Line Tools. With
[mise](https://mise.jdx.dev), `mise install` picks up Node and pnpm from `.mise.toml`.

```sh
pnpm install
pnpm tauri dev            # run the app with hot reload
pnpm check                # format check, lint, typecheck and unit tests
pnpm build                # build the frontend
pnpm check:rust           # cargo fmt, clippy and tests (needs the built frontend)
pnpm tauri build --debug  # build a debug app bundle
pnpm tauri build          # build a release app bundle
```

The bundle lands in `apps/desktop/src-tauri/target/<profile>/bundle/macos/`.

Two launch options help when checking a build:

| Option          | Effect                                                                        |
| --------------- | ----------------------------------------------------------------------------- |
| `--hidden`      | Start in the menu bar with the window hidden.                                 |
| `TRATH_QUIET=1` | Never take keyboard focus, and print notifications to standard error instead. |

The icons are drawn by `apps/desktop/scripts/make-icons.py`.

## Licence

AGPL-3.0-only. See [LICENSE](LICENSE).
