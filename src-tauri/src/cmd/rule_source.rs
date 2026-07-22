use super::{CmdResult, StringifyErr as _};
use crate::{
    config::{Config, IRuleSource},
    utils::{dirs, help},
};
use anyhow::{Context as _, Result, bail};
use serde_yaml_ng::Value;
use std::path::{Path, PathBuf};
use tokio::fs;

fn validate_rule_source_document(document: &str) -> Result<()> {
    let value: Value = serde_yaml_ng::from_str(document).context("invalid YAML rule source")?;
    match value {
        Value::Sequence(_) => Ok(()),
        Value::Mapping(ref mapping)
            if mapping.get("rules").is_some_and(Value::is_sequence)
                || mapping.get("payload").is_some_and(Value::is_sequence)
                || mapping.get("rule-providers").is_some_and(Value::is_mapping)
                || mapping.get("sub-rules").is_some_and(Value::is_mapping) =>
        {
            Ok(())
        }
        _ => bail!("rule source must be a YAML sequence or contain rules, payload, rule-providers, or sub-rules"),
    }
}

fn checked_source_path(source: &IRuleSource) -> Result<PathBuf> {
    let relative = Path::new(source.file.as_str());
    if relative.components().count() != 1 || relative.file_name().is_none() {
        bail!("invalid rule source path");
    }
    Ok(dirs::app_rule_sources_dir()?.join(relative))
}

async fn get_source(uid: &str) -> Result<IRuleSource> {
    let verge = Config::verge().await;
    let data = verge.latest_arc();
    let source = data
        .rule_sources
        .as_deref()
        .unwrap_or_default()
        .iter()
        .find(|source| source.uid == uid)
        .cloned()
        .with_context(|| format!("rule source not found: {uid}"))?;
    drop(data);
    drop(verge);
    Ok(source)
}

async fn write_new_source(name: &str, document: &str) -> Result<IRuleSource> {
    validate_rule_source_document(document)?;
    let name = name.trim();
    if name.is_empty() {
        bail!("rule source name cannot be empty");
    }

    let uid = help::get_uid("rs");
    let file = format!("{uid}.yaml");
    let directory = dirs::app_rule_sources_dir()?;
    fs::create_dir_all(&directory)
        .await
        .with_context(|| format!("failed to create rule source directory: {}", directory.display()))?;
    fs::write(directory.join(file.as_str()), document)
        .await
        .context("failed to save rule source")?;

    Ok(IRuleSource {
        uid: uid.into(),
        name: name.into(),
        file: file.into(),
        enabled: true,
    })
}

#[tauri::command]
pub async fn create_rule_source(name: String) -> CmdResult<IRuleSource> {
    write_new_source(name.as_str(), "rules: []\n").await.stringify_err()
}

#[tauri::command]
pub async fn import_rule_source(path: String) -> CmdResult<IRuleSource> {
    async move {
        let path = PathBuf::from(path.as_str());
        let document = fs::read_to_string(&path)
            .await
            .with_context(|| format!("failed to read rule source: {}", path.display()))?;
        let name = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Imported Rules");
        write_new_source(name, document.as_str()).await
    }
    .await
    .stringify_err()
}

#[tauri::command]
pub async fn read_rule_source_file(uid: String) -> CmdResult<String> {
    async move {
        let source = get_source(uid.as_str()).await?;
        let path = checked_source_path(&source)?;
        fs::read_to_string(&path)
            .await
            .with_context(|| format!("failed to read rule source: {}", path.display()))
    }
    .await
    .stringify_err()
}

#[tauri::command]
pub async fn save_rule_source_file(uid: String, file_data: String) -> CmdResult {
    async move {
        validate_rule_source_document(file_data.as_str())?;
        let source = get_source(uid.as_str()).await?;
        let path = checked_source_path(&source)?;
        fs::write(&path, file_data.as_bytes())
            .await
            .with_context(|| format!("failed to save rule source: {}", path.display()))
    }
    .await
    .stringify_err()
}

#[tauri::command]
pub async fn delete_rule_source_file(uid: String) -> CmdResult {
    async move {
        if !uid.starts_with("rs") || !uid.chars().all(|character| character.is_ascii_alphanumeric()) {
            bail!("invalid rule source UID");
        }
        let path = dirs::app_rule_sources_dir()?.join(format!("{uid}.yaml"));
        if fs::try_exists(&path).await.unwrap_or(false) {
            fs::remove_file(&path)
                .await
                .with_context(|| format!("failed to delete rule source: {}", path.display()))?;
        }
        Ok::<(), anyhow::Error>(())
    }
    .await
    .stringify_err()
}
