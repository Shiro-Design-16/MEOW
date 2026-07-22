use super::CmdResult;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacApplication {
    pub name: String,
    pub bundle_id: Option<String>,
    pub app_path: String,
    pub executable_path: String,
    pub process_names: Vec<String>,
}

#[cfg(target_os = "macos")]
fn bundle_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}

#[cfg(target_os = "macos")]
fn bundle_executable(bundle: &Path) -> Option<(String, Option<String>, Option<String>)> {
    let value = plist::Value::from_file(bundle.join("Contents/Info.plist")).ok()?;
    let dictionary = value.as_dictionary()?;
    let executable = dictionary.get("CFBundleExecutable")?.as_string()?.trim();
    if executable.is_empty() {
        return None;
    }

    let bundle_id = dictionary
        .get("CFBundleIdentifier")
        .and_then(plist::Value::as_string)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    let display_name = ["CFBundleDisplayName", "CFBundleName"]
        .into_iter()
        .find_map(|key| dictionary.get(key).and_then(plist::Value::as_string))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    Some((executable.to_owned(), bundle_id, display_name))
}

#[cfg(target_os = "macos")]
fn collect_related_processes(path: &Path, depth: usize, names: &mut HashSet<String>) {
    if depth == 0 {
        return;
    }

    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let child = entry.path();
        if !child.is_dir() {
            continue;
        }

        let extension = bundle_extension(&child);
        if matches!(extension.as_deref(), Some("app" | "xpc")) {
            if let Some((executable, _, _)) = bundle_executable(&child) {
                names.insert(executable);
            }
            continue;
        }

        collect_related_processes(&child, depth - 1, names);
    }
}

#[cfg(target_os = "macos")]
fn read_application(bundle: &Path) -> Option<MacApplication> {
    let (executable, bundle_id, display_name) = bundle_executable(bundle)?;
    let executable_path = bundle.join("Contents/MacOS").join(&executable);
    if !executable_path.is_file() {
        return None;
    }

    let mut process_names = HashSet::from([executable]);
    collect_related_processes(&bundle.join("Contents/Frameworks"), 5, &mut process_names);
    collect_related_processes(&bundle.join("Contents/XPCServices"), 5, &mut process_names);
    let mut process_names = process_names.into_iter().collect::<Vec<_>>();
    process_names.sort_by_key(|name| name.to_ascii_lowercase());

    let name = display_name.unwrap_or_else(|| {
        bundle
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("Unknown Application")
            .to_owned()
    });

    Some(MacApplication {
        name,
        bundle_id,
        app_path: bundle.to_string_lossy().into_owned(),
        executable_path: executable_path.to_string_lossy().into_owned(),
        process_names,
    })
}

#[cfg(target_os = "macos")]
fn collect_applications(path: &Path, depth: usize, applications: &mut Vec<MacApplication>) {
    if depth == 0 {
        return;
    }

    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let child = entry.path();
        if !child.is_dir() {
            continue;
        }

        if bundle_extension(&child).as_deref() == Some("app") {
            if let Some(application) = read_application(&child) {
                applications.push(application);
            }
            continue;
        }

        collect_applications(&child, depth - 1, applications);
    }
}

#[cfg(target_os = "macos")]
fn discover_macos_applications() -> Vec<MacApplication> {
    let mut roots = vec![PathBuf::from("/Applications"), PathBuf::from("/System/Applications")];
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }

    let mut applications = Vec::new();
    for root in roots {
        collect_applications(&root, 4, &mut applications);
    }

    let mut seen = HashSet::new();
    applications.retain(|application| seen.insert(application.app_path.clone()));
    applications.sort_by_key(|application| application.name.to_ascii_lowercase());
    applications
}

#[tauri::command]
pub async fn list_macos_applications() -> CmdResult<Vec<MacApplication>> {
    #[cfg(target_os = "macos")]
    {
        tokio::task::spawn_blocking(discover_macos_applications)
            .await
            .map_err(|error| error.to_string().into())
    }

    #[cfg(not(target_os = "macos"))]
    Err("Application discovery is currently available only on macOS".into())
}
