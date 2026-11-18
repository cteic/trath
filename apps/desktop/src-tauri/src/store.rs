//! Files on disk: the session log and the saved timer state.
//!
//! The log is JSON Lines, one finished session per line, and is only ever
//! appended to. The timer state is one small JSON file, replaced whole.
//! Nothing here knows what a Pomodoro is. The rules live in TypeScript.

use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const SESSIONS_FILE: &str = "sessions.jsonl";
pub const STATE_FILE: &str = "state.json";

const ID_MAX: usize = 64;
const NOTE_MAX: usize = 280;
const PROJECT_MAX: usize = 64;
const STATE_MAX_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Pomodoro,
    Deep,
    Stopwatch,
}

/// One finished stretch of work. Times are epoch milliseconds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Session {
    pub id: String,
    pub started_at: u64,
    pub ended_at: u64,
    pub duration_ms: u64,
    pub mode: Mode,
    pub note: Option<String>,
    pub project: Option<String>,
}

/// What a read of the log found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLog {
    pub sessions: Vec<Session>,
    /// Lines that could not be read, for example one cut short by a crash.
    pub skipped: usize,
}

fn one_line(text: &str, max: usize, name: &str) -> Result<(), String> {
    if text.is_empty() {
        return Err(format!("{name} is empty; leave it out instead"));
    }
    if text.chars().count() > max {
        return Err(format!("{name} is longer than {max} characters"));
    }
    if text.chars().any(char::is_control) {
        return Err(format!("{name} must be one line of plain text"));
    }
    Ok(())
}

/// Checks a session before it is written. The frontend checks too, but the
/// file is the record, so the last check happens here.
pub fn validate(session: &Session) -> Result<(), String> {
    let id_ok = !session.id.is_empty()
        && session.id.len() <= ID_MAX
        && session
            .id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !id_ok {
        return Err(String::from(
            "id must be 1 to 64 letters, digits, hyphens or underscores",
        ));
    }
    if session.ended_at < session.started_at {
        return Err(String::from("a session cannot end before it starts"));
    }
    if session.duration_ms > session.ended_at - session.started_at {
        return Err(String::from(
            "work time cannot be longer than the time between start and end",
        ));
    }
    if let Some(note) = &session.note {
        one_line(note, NOTE_MAX, "note")?;
    }
    if let Some(project) = &session.project {
        one_line(project, PROJECT_MAX, "project")?;
    }
    Ok(())
}

fn parse_log(text: &str) -> SessionLog {
    let mut seen = HashSet::new();
    let mut sessions = Vec::new();
    let mut skipped = 0;
    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        match serde_json::from_str::<Session>(line) {
            Ok(session) if validate(&session).is_ok() => {
                if seen.insert(session.id.clone()) {
                    sessions.push(session);
                }
            }
            _ => skipped += 1,
        }
    }
    SessionLog { sessions, skipped }
}

fn read_log(path: &Path) -> io::Result<SessionLog> {
    match fs::read(path) {
        Ok(bytes) => Ok(parse_log(&String::from_utf8_lossy(&bytes))),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(SessionLog {
            sessions: Vec::new(),
            skipped: 0,
        }),
        Err(error) => Err(error),
    }
}

fn ends_mid_line(file: &mut File) -> io::Result<bool> {
    if file.metadata()?.len() == 0 {
        return Ok(false);
    }
    file.seek(SeekFrom::End(-1))?;
    let mut last = [0u8; 1];
    file.read_exact(&mut last)?;
    Ok(last[0] != b'\n')
}

/// Replaces a file in one step: write a sibling, flush it, rename it over the
/// target. A reader sees the old file or the new one, never half of either.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "the path has no parent folder")
    })?;
    let name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "the path has no file name"))?;
    fs::create_dir_all(parent)?;
    let mut temp_name = name.to_os_string();
    temp_name.push(format!(".{}.tmp", std::process::id()));
    let temp = parent.join(temp_name);
    let written = File::create(&temp).and_then(|mut file| {
        file.write_all(bytes)?;
        file.sync_all()
    });
    let renamed = written.and_then(|()| fs::rename(&temp, path));
    if renamed.is_err() {
        let _ = fs::remove_file(&temp);
    }
    renamed
}

/// The data folder and a lock, so two commands never write at once.
pub struct Store {
    dir: PathBuf,
    lock: Mutex<()>,
}

impl Store {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            lock: Mutex::new(()),
        }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    fn sessions_path(&self) -> PathBuf {
        self.dir.join(SESSIONS_FILE)
    }

    fn state_path(&self) -> PathBuf {
        self.dir.join(STATE_FILE)
    }

    fn guard(&self) -> std::sync::MutexGuard<'_, ()> {
        // A panic in another command must not lock the user out of their log.
        self.lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Adds one session as one line. The line goes down in a single write and
    /// is flushed to disk before this returns. Returns `false`, and writes
    /// nothing, when a session with the same id is already in the log, so a
    /// retry after a failed save is safe.
    pub fn append_session(&self, session: &Session) -> Result<bool, String> {
        validate(session)?;
        let _guard = self.guard();
        let path = self.sessions_path();
        let known = read_log(&path).map_err(|error| error.to_string())?;
        if known.sessions.iter().any(|other| other.id == session.id) {
            return Ok(false);
        }
        let mut line = serde_json::to_string(session).map_err(|error| error.to_string())?;
        line.push('\n');
        fs::create_dir_all(&self.dir).map_err(|error| error.to_string())?;
        let mut file = OpenOptions::new()
            .create(true)
            .read(true)
            .append(true)
            .open(&path)
            .map_err(|error| error.to_string())?;
        // A crash can leave a cut-off last line. Start a new line so the cut
        // one stays the only casualty.
        if ends_mid_line(&mut file).map_err(|error| error.to_string())? {
            line.insert(0, '\n');
        }
        file.write_all(line.as_bytes())
            .and_then(|()| file.sync_all())
            .map_err(|error| error.to_string())?;
        Ok(true)
    }

    /// Every readable session, in file order, each id once.
    pub fn list_sessions(&self) -> Result<SessionLog, String> {
        let _guard = self.guard();
        read_log(&self.sessions_path()).map_err(|error| error.to_string())
    }

    /// Saves the timer state. It must be a JSON object. Its fields are the
    /// frontend's business.
    pub fn save_state(&self, state: &Value) -> Result<(), String> {
        if !state.is_object() {
            return Err(String::from("state must be a JSON object"));
        }
        let bytes = serde_json::to_vec(state).map_err(|error| error.to_string())?;
        if bytes.len() > STATE_MAX_BYTES {
            return Err(String::from("state is too large"));
        }
        let _guard = self.guard();
        write_atomic(&self.state_path(), &bytes).map_err(|error| error.to_string())
    }

    /// The saved timer state, or `None` on a first run or an unreadable file.
    pub fn load_state(&self) -> Result<Option<Value>, String> {
        let _guard = self.guard();
        match fs::read(self.state_path()) {
            Ok(bytes) => Ok(serde_json::from_slice::<Value>(&bytes)
                .ok()
                .filter(Value::is_object)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }
}

#[cfg(test)]
pub mod test_support {
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU32, Ordering};

    static NEXT: AtomicU32 = AtomicU32::new(0);

    /// A fresh folder under the system temp folder, removed on drop.
    pub struct TempDir(PathBuf);

    impl TempDir {
        pub fn new() -> Self {
            let name = format!(
                "desktop-test-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::SeqCst)
            );
            let path = std::env::temp_dir().join(name);
            let _ = std::fs::remove_dir_all(&path);
            std::fs::create_dir_all(&path).expect("create the test folder");
            Self(path)
        }

        pub fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::TempDir;
    use super::*;
    use serde_json::json;

    fn session(id: &str) -> Session {
        Session {
            id: String::from(id),
            started_at: 1_000,
            ended_at: 61_000,
            duration_ms: 60_000,
            mode: Mode::Pomodoro,
            note: Some(String::from("Write the tests")),
            project: None,
        }
    }

    fn store(dir: &TempDir) -> Store {
        Store::new(dir.path().join("data"))
    }

    #[test]
    fn an_empty_store_lists_nothing() {
        let dir = TempDir::new();
        let log = store(&dir).list_sessions().unwrap();
        assert_eq!(log.sessions, Vec::new());
        assert_eq!(log.skipped, 0);
    }

    #[test]
    fn appended_sessions_come_back_in_order() {
        let dir = TempDir::new();
        let store = store(&dir);
        assert!(store.append_session(&session("a")).unwrap());
        assert!(store.append_session(&session("b")).unwrap());

        let log = store.list_sessions().unwrap();
        assert_eq!(log.sessions, vec![session("a"), session("b")]);
        assert_eq!(log.skipped, 0);
    }

    #[test]
    fn each_session_is_one_json_line_with_camel_case_keys() {
        let dir = TempDir::new();
        let store = store(&dir);
        store.append_session(&session("a")).unwrap();
        store.append_session(&session("b")).unwrap();

        let text = fs::read_to_string(dir.path().join("data").join(SESSIONS_FILE)).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(text.ends_with('\n'));
        assert_eq!(
            lines[0],
            r#"{"id":"a","startedAt":1000,"endedAt":61000,"durationMs":60000,"mode":"pomodoro","note":"Write the tests","project":null}"#
        );
    }

    #[test]
    fn appending_never_rewrites_earlier_lines() {
        let dir = TempDir::new();
        let store = store(&dir);
        store.append_session(&session("a")).unwrap();
        let path = dir.path().join("data").join(SESSIONS_FILE);
        let before = fs::read(&path).unwrap();
        store.append_session(&session("b")).unwrap();
        let after = fs::read(&path).unwrap();

        assert!(after.starts_with(&before));
        assert!(after.len() > before.len());
    }

    #[test]
    fn the_same_id_is_written_once() {
        let dir = TempDir::new();
        let store = store(&dir);
        assert!(store.append_session(&session("a")).unwrap());
        assert!(!store.append_session(&session("a")).unwrap());

        assert_eq!(store.list_sessions().unwrap().sessions.len(), 1);
    }

    #[test]
    fn a_cut_off_last_line_is_skipped_and_the_next_append_still_reads() {
        let dir = TempDir::new();
        let store = store(&dir);
        store.append_session(&session("a")).unwrap();
        let path = dir.path().join("data").join(SESSIONS_FILE);
        let mut file = OpenOptions::new().append(true).open(&path).unwrap();
        file.write_all(br#"{"id":"torn","startedAt":5"#).unwrap();
        drop(file);

        let log = store.list_sessions().unwrap();
        assert_eq!(log.sessions, vec![session("a")]);
        assert_eq!(log.skipped, 1);

        store.append_session(&session("b")).unwrap();
        let log = store.list_sessions().unwrap();
        assert_eq!(log.sessions, vec![session("a"), session("b")]);
        assert_eq!(log.skipped, 1);
    }

    #[test]
    fn lines_that_fail_the_checks_are_skipped_on_read() {
        let dir = TempDir::new();
        let store = store(&dir);
        fs::create_dir_all(store.dir()).unwrap();
        let ended_early = r#"{"id":"x","startedAt":9,"endedAt":1,"durationMs":0,"mode":"deep","note":null,"project":null}"#;
        let unknown_mode = r#"{"id":"y","startedAt":1,"endedAt":9,"durationMs":1,"mode":"sprint","note":null,"project":null}"#;
        let good = serde_json::to_string(&session("a")).unwrap();
        fs::write(
            store.dir().join(SESSIONS_FILE),
            format!("{ended_early}\n\n{unknown_mode}\nnot json\n{good}\n"),
        )
        .unwrap();

        let log = store.list_sessions().unwrap();
        assert_eq!(log.sessions, vec![session("a")]);
        assert_eq!(log.skipped, 3);
    }

    #[test]
    fn a_bad_session_is_refused_and_nothing_is_written() {
        let dir = TempDir::new();
        let store = store(&dir);
        let cases = [
            Session {
                id: String::new(),
                ..session("a")
            },
            Session {
                id: String::from("../x"),
                ..session("a")
            },
            Session {
                id: "a".repeat(65),
                ..session("a")
            },
            Session {
                ended_at: 500,
                ..session("a")
            },
            Session {
                duration_ms: 60_001,
                ..session("a")
            },
            Session {
                note: Some(String::from("two\nlines")),
                ..session("a")
            },
            Session {
                note: Some(String::new()),
                ..session("a")
            },
            Session {
                note: Some("n".repeat(281)),
                ..session("a")
            },
            Session {
                project: Some("p".repeat(65)),
                ..session("a")
            },
        ];
        for case in cases {
            assert!(store.append_session(&case).is_err(), "accepted {case:?}");
        }
        assert!(!store.dir().join(SESSIONS_FILE).exists());
    }

    #[test]
    fn note_length_counts_characters_not_bytes() {
        let accented = Session {
            note: Some("á".repeat(280)),
            ..session("a")
        };
        assert_eq!(validate(&accented), Ok(()));
    }

    #[test]
    fn a_session_with_an_unknown_field_does_not_parse() {
        let line = r#"{"id":"a","startedAt":1,"endedAt":2,"durationMs":1,"mode":"deep","note":null,"project":null,"extra":1}"#;
        assert!(serde_json::from_str::<Session>(line).is_err());
    }

    #[test]
    fn state_round_trips_and_replaces_the_old_file() {
        let dir = TempDir::new();
        let store = store(&dir);
        assert_eq!(store.load_state().unwrap(), None);

        store.save_state(&json!({ "version": 1, "n": 1 })).unwrap();
        store.save_state(&json!({ "version": 1, "n": 2 })).unwrap();

        assert_eq!(
            store.load_state().unwrap(),
            Some(json!({ "version": 1, "n": 2 }))
        );
        let names: Vec<String> = fs::read_dir(store.dir())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec![String::from(STATE_FILE)]);
    }

    #[test]
    fn state_must_be_an_object_of_a_sane_size() {
        let dir = TempDir::new();
        let store = store(&dir);
        assert!(store.save_state(&json!([1, 2])).is_err());
        assert!(store.save_state(&json!("text")).is_err());
        assert!(store
            .save_state(&json!({ "big": "x".repeat(STATE_MAX_BYTES) }))
            .is_err());
        assert!(!store.dir().join(STATE_FILE).exists());
    }

    #[test]
    fn an_unreadable_state_file_loads_as_none() {
        let dir = TempDir::new();
        let store = store(&dir);
        fs::create_dir_all(store.dir()).unwrap();
        fs::write(store.dir().join(STATE_FILE), b"{ not json").unwrap();
        assert_eq!(store.load_state().unwrap(), None);

        fs::write(store.dir().join(STATE_FILE), b"[1]").unwrap();
        assert_eq!(store.load_state().unwrap(), None);
    }

    #[test]
    fn an_atomic_write_creates_missing_folders_and_leaves_no_temp_file() {
        let dir = TempDir::new();
        let target = dir.path().join("deep").join("er").join("out.md");
        write_atomic(&target, b"one").unwrap();
        write_atomic(&target, b"two").unwrap();

        assert_eq!(fs::read(&target).unwrap(), b"two");
        assert_eq!(fs::read_dir(target.parent().unwrap()).unwrap().count(), 1);
    }
}
