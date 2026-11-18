//! Launch options, read once from the environment and the command line.

use std::path::PathBuf;

/// Overrides the data folder. Example: `TRATH_DATA_DIR=/tmp/x` leaves the
/// real log untouched.
pub const DATA_DIR_ENV: &str = "TRATH_DATA_DIR";

/// A quiet run never takes keyboard focus and prints notifications to
/// standard error instead of showing them. For checks run while someone else
/// is using the machine.
pub const QUIET_ENV: &str = "TRATH_QUIET";

/// Starts in the menu bar with the window hidden.
pub const HIDDEN_FLAG: &str = "--hidden";

/// Debug builds keep their data apart from the release app's.
const DEBUG_SUBDIR: &str = "dev";

fn flag_set(value: Option<String>) -> bool {
    value.is_some_and(|value| !value.is_empty() && value != "0")
}

pub fn quiet() -> bool {
    flag_set(std::env::var(QUIET_ENV).ok())
}

pub fn starts_hidden<I: IntoIterator<Item = String>>(args: I) -> bool {
    args.into_iter().skip(1).any(|arg| arg == HIDDEN_FLAG)
}

/// Picks the data folder: the override when set, else the app's own folder,
/// with a subfolder in debug builds.
pub fn data_dir_from(app_dir: PathBuf, override_dir: Option<String>, debug: bool) -> PathBuf {
    match override_dir.filter(|value| !value.is_empty()) {
        Some(value) => PathBuf::from(value),
        None if debug => app_dir.join(DEBUG_SUBDIR),
        None => app_dir,
    }
}

pub fn data_dir(app_dir: PathBuf) -> PathBuf {
    data_dir_from(
        app_dir,
        std::env::var(DATA_DIR_ENV).ok(),
        cfg!(debug_assertions),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_override_wins_over_the_app_folder() {
        let app = PathBuf::from("/app");
        assert_eq!(
            data_dir_from(app.clone(), Some(String::from("/tmp/x")), true),
            PathBuf::from("/tmp/x")
        );
        assert_eq!(data_dir_from(app.clone(), Some(String::new()), false), app);
    }

    #[test]
    fn debug_builds_use_a_subfolder() {
        let app = PathBuf::from("/app");
        assert_eq!(
            data_dir_from(app.clone(), None, true),
            PathBuf::from("/app/dev")
        );
        assert_eq!(data_dir_from(app.clone(), None, false), app);
    }

    #[test]
    fn a_flag_is_set_by_any_value_but_empty_or_zero() {
        assert!(flag_set(Some(String::from("1"))));
        assert!(flag_set(Some(String::from("yes"))));
        assert!(!flag_set(Some(String::from("0"))));
        assert!(!flag_set(Some(String::new())));
        assert!(!flag_set(None));
    }

    #[test]
    fn the_hidden_flag_is_read_from_the_arguments_after_the_program_name() {
        let args = |list: &[&str]| {
            list.iter()
                .map(|arg| String::from(*arg))
                .collect::<Vec<_>>()
        };
        assert!(starts_hidden(args(&["app", "--hidden"])));
        assert!(!starts_hidden(args(&["app"])));
        assert!(!starts_hidden(args(&["--hidden"])));
    }
}
