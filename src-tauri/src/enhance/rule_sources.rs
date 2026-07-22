use crate::{config::IRuleSource, utils::dirs};
use anyhow::{Context as _, Result, bail};
use clash_verge_logging::{Type, logging};
use serde_yaml_ng::{Mapping, Sequence, Value};
use std::{collections::HashSet, path::Path};
use tokio::fs;

pub const ACTIVE_RULE_SOURCE_UID: &str = "__active_profile__";

#[derive(Clone, Default)]
struct RuleLayer {
    rules: Sequence,
    rule_providers: Mapping,
    sub_rules: Mapping,
}

fn mapping_value(mapping: &Mapping, key: &str) -> Mapping {
    mapping
        .get(key)
        .and_then(Value::as_mapping)
        .cloned()
        .unwrap_or_default()
}

fn parse_rule_layer(mut value: Value) -> Result<RuleLayer> {
    value.apply_merge().context("failed to apply YAML merge keys")?;
    match value {
        Value::Sequence(rules) => Ok(RuleLayer {
            rules,
            ..RuleLayer::default()
        }),
        Value::Mapping(mapping) => {
            let has_supported_data = mapping.get("rules").is_some_and(Value::is_sequence)
                || mapping.get("payload").is_some_and(Value::is_sequence)
                || mapping.get("rule-providers").is_some_and(Value::is_mapping)
                || mapping.get("sub-rules").is_some_and(Value::is_mapping);
            if !has_supported_data {
                bail!("rule source contains no supported rule data");
            }
            let rules = mapping
                .get("rules")
                .or_else(|| mapping.get("payload"))
                .and_then(Value::as_sequence)
                .cloned()
                .unwrap_or_default();
            let rule_providers = mapping_value(&mapping, "rule-providers");
            let sub_rules = mapping_value(&mapping, "sub-rules");
            Ok(RuleLayer {
                rules,
                rule_providers,
                sub_rules,
            })
        }
        _ => bail!("rule source is not a YAML mapping or sequence"),
    }
}

fn active_profile_layer(config: &Mapping) -> RuleLayer {
    RuleLayer {
        rules: config
            .get("rules")
            .and_then(Value::as_sequence)
            .cloned()
            .unwrap_or_default(),
        rule_providers: mapping_value(config, "rule-providers"),
        sub_rules: mapping_value(config, "sub-rules"),
    }
}

async fn load_source(source: &IRuleSource) -> Result<RuleLayer> {
    let relative = Path::new(source.file.as_str());
    if relative.components().count() != 1 || relative.file_name().is_none() {
        bail!("invalid rule source path");
    }
    let path = dirs::app_rule_sources_dir()?.join(relative);
    let document = fs::read_to_string(&path)
        .await
        .with_context(|| format!("failed to read {}", path.display()))?;
    let value = serde_yaml_ng::from_str(document.as_str()).context("invalid YAML")?;
    parse_rule_layer(value)
}

fn is_terminal_rule(value: &Value) -> bool {
    value
        .as_str()
        .and_then(|rule| rule.split(',').next())
        .is_some_and(|kind| matches!(kind.trim().to_ascii_uppercase().as_str(), "MATCH" | "FINAL"))
}

fn merge_mapping_by_priority(target: &mut Mapping, source: Mapping) {
    for (key, value) in source {
        if !target.contains_key(&key) {
            target.insert(key, value);
        }
    }
}

fn compile_layers(layers: Vec<RuleLayer>, mut config: Mapping) -> Mapping {
    let mut rules = Sequence::new();
    let mut terminal_rule = None;
    let mut rule_providers = Mapping::new();
    let mut sub_rules = Mapping::new();

    for layer in layers {
        for rule in layer.rules {
            if is_terminal_rule(&rule) {
                if terminal_rule.is_none() {
                    terminal_rule = Some(rule);
                }
            } else {
                rules.push(rule);
            }
        }
        merge_mapping_by_priority(&mut rule_providers, layer.rule_providers);
        merge_mapping_by_priority(&mut sub_rules, layer.sub_rules);
    }

    if let Some(terminal_rule) = terminal_rule {
        rules.push(terminal_rule);
    }
    config.insert(Value::String("rules".into()), Value::Sequence(rules));

    if rule_providers.is_empty() {
        config.remove("rule-providers");
    } else {
        config.insert(Value::String("rule-providers".into()), Value::Mapping(rule_providers));
    }
    if sub_rules.is_empty() {
        config.remove("sub-rules");
    } else {
        config.insert(Value::String("sub-rules".into()), Value::Mapping(sub_rules));
    }
    config
}

/// Compile the active subscription and every enabled user source in UI priority order.
///
/// Terminal rules are kept at the end so a high-priority source cannot make every
/// lower source unreachable merely because it contains its own `MATCH` rule.
pub async fn use_rule_sources(
    config: Mapping,
    sources: &[IRuleSource],
    order: &[smartstring::alias::String],
) -> Mapping {
    let active = active_profile_layer(&config);
    let mut resolved_order = Vec::new();
    let mut seen = HashSet::new();
    for uid in order {
        if seen.insert(uid.to_string()) {
            resolved_order.push(uid.as_str());
        }
    }
    if seen.insert(ACTIVE_RULE_SOURCE_UID.to_owned()) {
        resolved_order.push(ACTIVE_RULE_SOURCE_UID);
    }
    for source in sources {
        if seen.insert(source.uid.to_string()) {
            resolved_order.push(source.uid.as_str());
        }
    }

    let mut layers = Vec::new();
    for uid in resolved_order {
        if uid == ACTIVE_RULE_SOURCE_UID {
            layers.push(active.clone());
            continue;
        }
        let Some(source) = sources.iter().find(|source| source.uid == uid) else {
            continue;
        };
        if !source.enabled {
            continue;
        }
        match load_source(source).await {
            Ok(layer) => layers.push(layer),
            Err(error) => logging!(
                warn,
                Type::Config,
                "Skipping invalid rule source '{}': {error:#}",
                source.name
            ),
        }
    }

    compile_layers(layers, config)
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;

    fn layer(yaml: &str) -> RuleLayer {
        parse_rule_layer(serde_yaml_ng::from_str(yaml).expect("valid test YAML")).expect("valid rule layer")
    }

    #[test]
    fn preserves_priority_and_moves_terminal_rule_to_the_end() {
        let config = Mapping::new();
        let result = compile_layers(
            vec![
                layer(r#"rules: ["DOMAIN,high.example,DIRECT", "MATCH,REJECT"]"#),
                layer(r#"rules: ["DOMAIN,low.example,Proxy", "MATCH,DIRECT"]"#),
            ],
            config,
        );
        let rules = result
            .get("rules")
            .and_then(Value::as_sequence)
            .expect("rules sequence");
        let values = rules.iter().filter_map(Value::as_str).collect::<Vec<_>>();
        assert_eq!(
            values,
            vec!["DOMAIN,high.example,DIRECT", "DOMAIN,low.example,Proxy", "MATCH,REJECT"]
        );
    }

    #[test]
    fn higher_priority_provider_definition_wins() {
        let result = compile_layers(
            vec![
                layer("rule-providers: { shared: { url: high } }"),
                layer("rule-providers: { shared: { url: low }, other: { url: other } }"),
            ],
            Mapping::new(),
        );
        let providers = result
            .get("rule-providers")
            .and_then(Value::as_mapping)
            .expect("provider mapping");
        assert_eq!(
            providers
                .get("shared")
                .and_then(Value::as_mapping)
                .and_then(|provider| provider.get("url"))
                .and_then(Value::as_str),
            Some("high")
        );
        assert!(providers.contains_key("other"));
    }
}
