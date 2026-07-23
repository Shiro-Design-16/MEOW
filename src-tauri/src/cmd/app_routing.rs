use super::CmdResult;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
#[cfg(target_os = "macos")]
use std::hash::{DefaultHasher, Hash as _, Hasher as _};
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApplication {
    pub name: String,
    pub bundle_id: Option<String>,
    pub app_path: String,
    pub executable_path: String,
    pub process_names: Vec<String>,
    pub icon_path: Option<String>,
}

#[cfg(any(target_os = "linux", target_os = "windows"))]
fn process_names_for_path(path: &Path) -> Vec<String> {
    let mut names = HashSet::new();
    if let Some(file_name) = path.file_name().and_then(|value| value.to_str()) {
        names.insert(file_name.to_owned());
    }
    if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
        names.insert(stem.to_owned());
    }
    let mut names = names.into_iter().collect::<Vec<_>>();
    names.sort_by_key(|name| name.to_ascii_lowercase());
    names
}

fn normalize_applications(applications: &mut Vec<InstalledApplication>) {
    let mut seen = HashSet::new();
    applications.retain(|application| seen.insert(application.executable_path.to_ascii_lowercase()));
    applications.sort_by_key(|application| application.name.to_ascii_lowercase());
}

#[cfg(target_os = "macos")]
fn bundle_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}

#[cfg(target_os = "macos")]
fn bundle_metadata(bundle: &Path) -> Option<(String, Option<String>, Option<String>)> {
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
fn bundle_icon(bundle: &Path) -> Option<String> {
    let resources = bundle.join("Contents/Resources");
    let configured = plist::Value::from_file(bundle.join("Contents/Info.plist"))
        .ok()
        .and_then(|value| value.into_dictionary())
        .and_then(|dictionary| {
            dictionary
                .get("CFBundleIconFile")
                .and_then(plist::Value::as_string)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        })
        .and_then(|file_name| {
            let configured = resources.join(&file_name);
            if configured.is_file() {
                Some(configured)
            } else if Path::new(&file_name).extension().is_none() {
                let with_extension = resources.join(format!("{file_name}.icns"));
                with_extension.is_file().then_some(with_extension)
            } else {
                None
            }
        });

    configured
        .or_else(|| {
            fs::read_dir(resources).ok()?.flatten().find_map(|entry| {
                let path = entry.path();
                (path.extension().and_then(|value| value.to_str()) == Some("icns")).then_some(path)
            })
        })
        .map(|path| path.to_string_lossy().into_owned())
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
            if let Some((executable, _, _)) = bundle_metadata(&child) {
                names.insert(executable);
            }
            continue;
        }

        collect_related_processes(&child, depth - 1, names);
    }
}

#[cfg(target_os = "macos")]
fn read_macos_application(bundle: &Path) -> Option<InstalledApplication> {
    let (executable, bundle_id, display_name) = bundle_metadata(bundle)?;
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

    Some(InstalledApplication {
        name,
        bundle_id,
        app_path: bundle.to_string_lossy().into_owned(),
        executable_path: executable_path.to_string_lossy().into_owned(),
        process_names,
        icon_path: bundle_icon(bundle),
    })
}

#[cfg(target_os = "macos")]
fn collect_macos_applications(path: &Path, depth: usize, applications: &mut Vec<InstalledApplication>) {
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
            if let Some(application) = read_macos_application(&child) {
                applications.push(application);
            }
            continue;
        }

        collect_macos_applications(&child, depth - 1, applications);
    }
}

#[cfg(target_os = "macos")]
fn discover_macos_applications() -> Vec<InstalledApplication> {
    let mut roots = vec![PathBuf::from("/Applications"), PathBuf::from("/System/Applications")];
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }

    let mut applications = Vec::new();
    for root in roots {
        collect_macos_applications(&root, 4, &mut applications);
    }
    normalize_applications(&mut applications);
    applications
}

#[cfg(target_os = "linux")]
fn desktop_value<'a>(document: &'a str, key: &str) -> Option<&'a str> {
    let mut in_desktop_entry = false;
    for line in document.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_desktop_entry = line == "[Desktop Entry]";
            continue;
        }
        if in_desktop_entry {
            if let Some((candidate, value)) = line.split_once('=')
                && candidate == key
            {
                return Some(value.trim());
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn first_exec_token(command: &str) -> Option<String> {
    let mut tokens = Vec::new();
    let mut token = String::new();
    let mut quote = None;
    let mut escaped = false;
    for character in command.chars() {
        if escaped {
            token.push(character);
            escaped = false;
        } else if character == '\\' {
            escaped = true;
        } else if quote == Some(character) {
            quote = None;
        } else if quote.is_none() && matches!(character, '\'' | '"') {
            quote = Some(character);
        } else if quote.is_none() && character.is_whitespace() {
            if !token.is_empty() {
                tokens.push(std::mem::take(&mut token));
            }
        } else {
            token.push(character);
        }
    }
    if !token.is_empty() {
        tokens.push(token);
    }

    tokens
        .into_iter()
        .skip_while(|token| token == "env" || token.contains('='))
        .find(|token| !token.starts_with('%'))
}

#[cfg(target_os = "linux")]
fn resolve_linux_executable(value: &str) -> PathBuf {
    let path = PathBuf::from(value);
    if path.is_absolute() {
        return path;
    }
    std::env::var_os("PATH")
        .into_iter()
        .flat_map(|paths| std::env::split_paths(&paths).collect::<Vec<_>>())
        .map(|root| root.join(value))
        .find(|candidate| candidate.is_file())
        .unwrap_or(path)
}

#[cfg(target_os = "linux")]
fn resolve_linux_icon(value: &str) -> Option<String> {
    let path = PathBuf::from(value);
    if path.is_absolute() && path.is_file() {
        return Some(path.to_string_lossy().into_owned());
    }

    let mut roots = vec![
        PathBuf::from("/usr/share/pixmaps"),
        PathBuf::from("/usr/share/icons/hicolor/256x256/apps"),
        PathBuf::from("/usr/share/icons/hicolor/scalable/apps"),
        PathBuf::from("/usr/share/icons"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        roots.insert(0, PathBuf::from(home).join(".local/share/icons"));
    }
    for root in roots {
        for extension in ["png", "svg", "xpm"] {
            let candidate = root.join(format!("{value}.{extension}"));
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn read_linux_application(path: &Path) -> Option<InstalledApplication> {
    let document = fs::read_to_string(path).ok()?;
    if desktop_value(&document, "Type").is_some_and(|value| value != "Application")
        || desktop_value(&document, "Hidden") == Some("true")
        || desktop_value(&document, "NoDisplay") == Some("true")
    {
        return None;
    }
    let name = desktop_value(&document, "Name")?.to_owned();
    let executable = resolve_linux_executable(&first_exec_token(desktop_value(&document, "Exec")?)?);
    let icon_path = desktop_value(&document, "Icon").and_then(resolve_linux_icon);

    Some(InstalledApplication {
        name,
        bundle_id: path.file_stem().and_then(|value| value.to_str()).map(str::to_owned),
        app_path: path.to_string_lossy().into_owned(),
        executable_path: executable.to_string_lossy().into_owned(),
        process_names: process_names_for_path(&executable),
        icon_path,
    })
}

#[cfg(target_os = "linux")]
fn collect_linux_applications(path: &Path, depth: usize, applications: &mut Vec<InstalledApplication>) {
    if depth == 0 {
        return;
    }
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };
    for entry in entries.flatten() {
        let child = entry.path();
        if child.is_dir() {
            collect_linux_applications(&child, depth - 1, applications);
        } else if child.extension().and_then(|value| value.to_str()) == Some("desktop")
            && let Some(application) = read_linux_application(&child)
        {
            applications.push(application);
        }
    }
}

#[cfg(target_os = "linux")]
fn discover_linux_applications() -> Vec<InstalledApplication> {
    let mut roots = vec![
        PathBuf::from("/usr/share/applications"),
        PathBuf::from("/usr/local/share/applications"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(home).join(".local/share/applications"));
    }
    let mut applications = Vec::new();
    for root in roots {
        collect_linux_applications(&root, 4, &mut applications);
    }
    normalize_applications(&mut applications);
    applications
}

#[cfg(target_os = "windows")]
fn trim_windows_icon_path(value: &str) -> PathBuf {
    PathBuf::from(value.split(',').next().unwrap_or(value).trim().trim_matches('"'))
}

#[cfg(target_os = "windows")]
fn discover_windows_applications() -> Vec<InstalledApplication> {
    use winreg::{
        RegKey,
        enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY},
    };

    let mut applications = Vec::new();
    let roots = [RegKey::predef(HKEY_CURRENT_USER), RegKey::predef(HKEY_LOCAL_MACHINE)];
    for root in &roots {
        for flags in [KEY_READ | KEY_WOW64_64KEY, KEY_READ | KEY_WOW64_32KEY] {
            let Ok(app_paths) =
                root.open_subkey_with_flags(r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths", flags)
            else {
                continue;
            };
            for key_name in app_paths.enum_keys().flatten() {
                let Ok(key) = app_paths.open_subkey_with_flags(&key_name, flags) else {
                    continue;
                };
                let Ok(raw_path) = key.get_value::<String, _>("") else {
                    continue;
                };
                let executable = trim_windows_icon_path(&raw_path);
                if !executable.is_file() {
                    continue;
                }
                let name = executable
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .unwrap_or(&key_name)
                    .to_owned();
                applications.push(InstalledApplication {
                    name,
                    bundle_id: None,
                    app_path: executable.to_string_lossy().into_owned(),
                    executable_path: executable.to_string_lossy().into_owned(),
                    process_names: process_names_for_path(&executable),
                    icon_path: Some(executable.to_string_lossy().into_owned()),
                });
            }
        }
    }
    normalize_applications(&mut applications);
    applications
}

fn discover_installed_applications() -> Vec<InstalledApplication> {
    #[cfg(target_os = "macos")]
    return discover_macos_applications();

    #[cfg(target_os = "windows")]
    return discover_windows_applications();

    #[cfg(target_os = "linux")]
    return discover_linux_applications();

    #[allow(unreachable_code)]
    Vec::new()
}

#[cfg(target_os = "macos")]
fn resolve_macos_application_icon(icon_path: &Path) -> anyhow::Result<Option<String>> {
    if !icon_path.is_file() {
        return Ok(None);
    }
    if icon_path.extension().and_then(|value| value.to_str()) != Some("icns") {
        return Ok(Some(icon_path.to_string_lossy().into_owned()));
    }

    let metadata = fs::metadata(icon_path)?;
    let mut hasher = DefaultHasher::new();
    icon_path.hash(&mut hasher);
    metadata.len().hash(&mut hasher);
    metadata.modified().ok().hash(&mut hasher);

    let cache_dir = crate::utils::dirs::app_home_dir()?.join("application-icons");
    fs::create_dir_all(&cache_dir)?;
    let target = cache_dir.join(format!("{:016x}.png", hasher.finish()));
    if target.is_file() {
        return Ok(Some(target.to_string_lossy().into_owned()));
    }

    let output = Command::new("/usr/bin/sips")
        .args(["-s", "format", "png", "-Z", "96"])
        .arg(icon_path)
        .args(["--out"])
        .arg(&target)
        .output()?;
    if !output.status.success() || !target.is_file() {
        let _ = fs::remove_file(&target);
        return Ok(None);
    }

    Ok(Some(target.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn list_installed_applications() -> CmdResult<Vec<InstalledApplication>> {
    tokio::task::spawn_blocking(discover_installed_applications)
        .await
        .map_err(|error| error.to_string().into())
}

#[tauri::command]
pub async fn resolve_application_icon(icon_path: String) -> CmdResult<Option<String>> {
    tokio::task::spawn_blocking(move || -> CmdResult<Option<String>> {
        let icon_path = PathBuf::from(icon_path);

        #[cfg(target_os = "macos")]
        return resolve_macos_application_icon(&icon_path)
            .map_err(|error| smartstring::alias::String::from(error.to_string()));

        #[cfg(not(target_os = "macos"))]
        Ok(icon_path.is_file().then(|| icon_path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|error| smartstring::alias::String::from(error.to_string()))?
}
