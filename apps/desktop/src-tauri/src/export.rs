//! Writing an export to the place the user picked.

use std::path::Path;

use crate::store::write_atomic;

const EXTENSIONS: [&str; 2] = ["md", "csv"];
const CONTENTS_MAX_BYTES: usize = 32 * 1024 * 1024;

/// The extension of a suggested file name, when it is one this app exports.
/// A name with a folder in it is refused: the save dialog picks the folder.
pub fn export_extension(file_name: &str) -> Result<&'static str, String> {
    let plain = !file_name.is_empty()
        && !file_name.starts_with('.')
        && !file_name.contains(['/', '\\', '\0'])
        && file_name.len() <= 128;
    if !plain {
        return Err(String::from("the export needs a plain file name"));
    }
    let extension = Path::new(file_name)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default();
    EXTENSIONS
        .into_iter()
        .find(|known| *known == extension)
        .ok_or_else(|| String::from("an export is a .md or a .csv file"))
}

pub fn write_export(path: &Path, contents: &str) -> Result<(), String> {
    if contents.len() > CONTENTS_MAX_BYTES {
        return Err(String::from("the export is too large"));
    }
    write_atomic(path, contents.as_bytes()).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::test_support::TempDir;

    #[test]
    fn markdown_and_csv_names_are_accepted() {
        assert_eq!(export_extension("log-2026-11-18.md"), Ok("md"));
        assert_eq!(export_extension("log-2026-11-16_2026-11-18.csv"), Ok("csv"));
    }

    #[test]
    fn other_names_are_refused() {
        for name in [
            "",
            "log.txt",
            "log",
            ".md",
            "../log.md",
            "a/b.csv",
            "a\\b.csv",
            "log.MD",
        ] {
            assert!(export_extension(name).is_err(), "accepted {name:?}");
        }
        assert!(export_extension(&format!("{}.md", "a".repeat(200))).is_err());
    }

    #[test]
    fn an_export_is_written_whole_and_replaces_an_older_one() {
        let dir = TempDir::new();
        let path = dir.path().join("log.md");
        write_export(&path, "# One\n").unwrap();
        write_export(&path, "# Two\n").unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "# Two\n");
    }
}
