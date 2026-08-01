use anyhow::Result;
use percent_encoding::percent_decode_str;
use smartstring::alias::String;
use tauri::Url;

use crate::{
    config::{Config, PrfItem, profiles},
    core::{CoreManager, handle, timer::Timer},
    utils::{help, window_manager::WindowManager},
};
use clash_verge_logging::{Type, logging, logging_error};

const SUPPORTED_SCHEMES: &[&str] = &["meow", "clash", "clash-verge"];

#[cfg(any(not(target_os = "macos"), test))]
pub(crate) fn is_supported_deep_link(param: &str) -> bool {
    Url::parse(param)
        .ok()
        .is_some_and(|url| SUPPORTED_SCHEMES.contains(&url.scheme()))
}

pub(super) async fn resolve_scheme(param: &str) -> Result<()> {
    let param_str = if param.starts_with("[") && param.len() > 4 {
        param
            .get(2..param.len() - 2)
            .ok_or_else(|| anyhow::anyhow!("Invalid string slice boundaries"))?
    } else {
        param
    };
    let masked_deep_link = help::mask_url(param_str);

    logging!(debug, Type::Config, "received deep link: {masked_deep_link}");

    let link_parsed = Url::parse(param_str)
        .map_err(|e| anyhow::anyhow!("failed to parse deep link: {e:?}, param: {masked_deep_link}"))?;

    let Some((url, name)) = extract_subscription_info(&link_parsed) else {
        logging!(
            warn,
            Type::Config,
            "missing url parameter in deep link: {masked_deep_link}"
        );
        return Ok(());
    };

    WindowManager::show_main_window().await;
    import_subscription(&url, name.as_ref()).await;
    Ok(())
}

fn extract_subscription_info(link_parsed: &Url) -> Option<(std::string::String, Option<String>)> {
    if !SUPPORTED_SCHEMES.contains(&link_parsed.scheme()) {
        return None;
    }

    let name = link_parsed
        .query_pairs()
        .find(|(key, _)| key == "name")
        .map(|(_, value)| value.into_owned().into());
    let url = extract_subscription_url(link_parsed)?;
    Some((url, name))
}

fn extract_subscription_url(link_parsed: &Url) -> Option<std::string::String> {
    let query = link_parsed.query()?;
    let value_start = if let Some(rest) = query.strip_prefix("url=") {
        rest
    } else {
        let pos = query.find("&url=")?;
        query.get(pos + "&url=".len()..)?
    };

    // `name` is the only top-level parameter used by Clash import links. Keeping
    // every other ampersand intact preserves subscription URLs whose own query
    // parameters were not percent-encoded by the website.
    let raw_url = value_start
        .rfind("&name=")
        .and_then(|pos| value_start.get(..pos))
        .unwrap_or(value_start)
        .trim();
    let decoded = decode_subscription_url(raw_url);
    Url::parse(&decoded)
        .ok()
        .filter(|url| matches!(url.scheme(), "http" | "https"))?;
    Some(decoded)
}

fn decode_subscription_url(raw_url: &str) -> std::string::String {
    // Avoid double-decoding nested subscription URLs; decode only when needed.
    if Url::parse(raw_url).is_ok() {
        return raw_url.to_string();
    }

    let mut candidate = raw_url.to_string();
    for _ in 0..2 {
        let next = percent_decode_str(&candidate).decode_utf8_lossy().to_string();
        if next == candidate {
            break;
        }
        candidate = next;
        if Url::parse(&candidate).is_ok() {
            break;
        }
    }
    candidate
}

async fn import_subscription(url: &str, name: Option<&String>) {
    let had_current_profile = {
        let profiles = Config::profiles().await;
        profiles.latest_arc().current.is_some()
    };

    let Some(mut item) = fetch_profile_item(url, name).await else {
        return;
    };

    let uid = item.uid.clone().unwrap_or_default();
    if let Err(e) = profiles::profiles_append_item_safe(&mut item).await {
        logging!(error, Type::Config, "failed to import subscription url: {:?}", e);
        Config::profiles().await.discard();
        handle::Handle::notice_message("import_sub_url::error", e.to_string());
        return;
    }

    if let Err(e) = Config::profiles().await.data_arc().save_file().await {
        logging!(error, Type::Config, "failed to save imported subscription: {}", e);
        handle::Handle::notice_message("import_sub_url::error", e.to_string());
        return;
    }
    logging_error!(Type::Timer, Timer::global().refresh().await);
    handle::Handle::notice_message(
        "import_sub_url::ok",
        "", // 空 msg 传入，我们不希望导致 后端-前端-后端 死循环，这里只做提醒。
    );

    post_import_updates(&uid, had_current_profile).await;
}

async fn fetch_profile_item(url: &str, name: Option<&String>) -> Option<PrfItem> {
    match PrfItem::from_url(url, name, None, None).await {
        Ok(item) => Some(item),
        Err(e) => {
            logging!(error, Type::Config, "failed to parse profile from url: {:?}", e);
            handle::Handle::notice_message("import_sub_url::error", e.to_string());
            None
        }
    }
}

async fn post_import_updates(uid: &String, had_current_profile: bool) {
    handle::Handle::refresh_verge();
    handle::Handle::notify_profile_changed(uid);

    let should_update_core = if uid.is_empty() || had_current_profile {
        false
    } else {
        let profiles = Config::profiles().await;
        profiles.latest_arc().is_current_profile_index(uid)
    };

    if should_update_core {
        refresh_core_config().await;
    }
}

async fn refresh_core_config() {
    logging!(
        info,
        Type::Config,
        "Deep link import set current profile; refreshing core config"
    );
    match CoreManager::global().update_config_forced().await {
        Ok(outcome) if outcome.is_valid() => handle::Handle::refresh_clash(),
        Ok(outcome) => {
            let message = outcome.to_string();
            logging!(warn, Type::Config, "Apply config failed: {}", message);
            handle::Handle::notice_message("config_validate::error", message);
        }
        Err(err) => {
            logging!(error, Type::Config, "Apply config error: {}", err);
            handle::Handle::notice_message("update_failed", format!("{err}"));
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_all_supported_import_schemes() {
        for scheme in SUPPORTED_SCHEMES {
            assert!(is_supported_deep_link(&format!(
                "{scheme}://install-config?url=https%3A%2F%2Fexample.com%2Fprofile.yaml"
            )));
        }
        assert!(!is_supported_deep_link(
            "https://example.com/?url=https://example.com/profile.yaml"
        ));
    }

    #[test]
    fn extracts_encoded_subscription_and_name() {
        let link = Url::parse(
            "clash://install-config?url=https%3A%2F%2Fexample.com%2Fprofile.yaml%3Ftoken%3Da%26mode%3Db&name=Example",
        )
        .unwrap();
        let (url, name) = extract_subscription_info(&link).unwrap();
        assert_eq!(url, "https://example.com/profile.yaml?token=a&mode=b");
        assert_eq!(name.as_deref(), Some("Example"));
    }

    #[test]
    fn preserves_unescaped_subscription_query_parameters() {
        let link = Url::parse("meow://install-config?url=https://example.com/profile.yaml?token=a&mode=b&name=Example")
            .unwrap();
        let (url, _) = extract_subscription_info(&link).unwrap();
        assert_eq!(url, "https://example.com/profile.yaml?token=a&mode=b");
    }

    #[test]
    fn rejects_non_http_subscription_targets() {
        let link = Url::parse("clash://install-config?url=file%3A%2F%2F%2Ftmp%2Fprofile.yaml").unwrap();
        assert!(extract_subscription_info(&link).is_none());
    }
}
