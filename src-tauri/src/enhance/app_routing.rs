use crate::config::IAppRoutingRule;
use serde_yaml_ng::{Mapping, Sequence, Value};
use std::collections::HashSet;

fn is_safe_rule_part(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty() && !value.chars().any(|character| matches!(character, ',' | '\n' | '\r'))
}

fn push_rule(rules: &mut Sequence, seen: &mut HashSet<String>, kind: &str, value: &str, policy: &str) {
    if !is_safe_rule_part(value) || !is_safe_rule_part(policy) {
        return;
    }

    let raw = format!("{kind},{},{policy}", value.trim());
    if seen.insert(raw.clone()) {
        rules.push(Value::String(raw));
    }
}

/// Inject MEOW-managed process rules before every subscription/user rule.
///
/// The overlay is deliberately inactive when TUN is disabled. Configuration is
/// still persisted in `verge.yaml`, so turning TUN back on restores the rules.
pub fn use_app_routing(
    mut config: Mapping,
    enable_tun: bool,
    enable_app_routing: bool,
    app_rules: &[IAppRoutingRule],
) -> Mapping {
    if !enable_tun || !enable_app_routing {
        return config;
    }

    let mut injected = Sequence::new();
    let mut seen = HashSet::new();

    for rule in app_rules.iter().filter(|rule| rule.enabled) {
        if let Some(path) = rule.process_path.as_deref() {
            push_rule(&mut injected, &mut seen, "PROCESS-PATH", path, &rule.policy);
        }

        for name in &rule.process_names {
            push_rule(&mut injected, &mut seen, "PROCESS-NAME", name.as_str(), &rule.policy);
        }
    }

    if injected.is_empty() {
        return config;
    }

    if let Some(Value::Sequence(existing)) = config.remove("rules") {
        injected.extend(existing);
    }

    config.insert(Value::String("rules".into()), Value::Sequence(injected));
    config.insert(
        Value::String("find-process-mode".into()),
        Value::String("strict".into()),
    );
    config
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;
    use smartstring::alias::String;

    fn rule(path: &str, names: &[&str], policy: &str) -> IAppRoutingRule {
        IAppRoutingRule {
            app_name: "Example".into(),
            bundle_id: Some("com.example.app".into()),
            process_path: Some(path.into()),
            process_names: names.iter().map(|name| String::from(*name)).collect(),
            policy: policy.into(),
            enabled: true,
        }
    }

    fn mapping(yaml: &str) -> Mapping {
        serde_yaml_ng::from_str(yaml).expect("test config should be valid")
    }

    #[test]
    fn injects_process_rules_before_existing_rules() {
        let config = mapping(r#"rules: ["DOMAIN,example.com,DIRECT", "MATCH,DIRECT"]"#);
        let result = use_app_routing(
            config,
            true,
            true,
            &[rule(
                "/Applications/Example.app/Contents/MacOS/Example",
                &["Example", "Example Helper"],
                "Proxy",
            )],
        );

        let rules = result
            .get("rules")
            .and_then(Value::as_sequence)
            .expect("rules should be a sequence");
        let values = rules.iter().filter_map(Value::as_str).collect::<Vec<_>>();
        assert_eq!(
            values,
            vec![
                "PROCESS-PATH,/Applications/Example.app/Contents/MacOS/Example,Proxy",
                "PROCESS-NAME,Example,Proxy",
                "PROCESS-NAME,Example Helper,Proxy",
                "DOMAIN,example.com,DIRECT",
                "MATCH,DIRECT",
            ]
        );
        assert_eq!(result.get("find-process-mode").and_then(Value::as_str), Some("strict"));
    }

    #[test]
    fn remains_inactive_without_tun() {
        let config = mapping(r#"rules: ["MATCH,DIRECT"]"#);
        let expected = config.clone();
        let result = use_app_routing(
            config,
            false,
            true,
            &[rule(
                "/Applications/Example.app/Contents/MacOS/Example",
                &["Example"],
                "Proxy",
            )],
        );

        assert_eq!(result, expected);
        assert!(!result.contains_key("find-process-mode"));
    }

    #[test]
    fn ignores_disabled_invalid_and_duplicate_rules() {
        let mut duplicate = rule(
            "/Applications/Example.app/Contents/MacOS/Example",
            &["Example", "Example"],
            "DIRECT",
        );
        let mut disabled = duplicate.clone();
        disabled.enabled = false;
        duplicate.process_names.push("Bad,Process".into());

        let result = use_app_routing(
            mapping(r#"rules: ["MATCH,DIRECT"]"#),
            true,
            true,
            &[disabled, duplicate],
        );
        let rules = result
            .get("rules")
            .and_then(Value::as_sequence)
            .expect("rules should be a sequence");
        let values = rules.iter().filter_map(Value::as_str).collect::<Vec<_>>();

        assert_eq!(
            values,
            vec![
                "PROCESS-PATH,/Applications/Example.app/Contents/MacOS/Example,DIRECT",
                "PROCESS-NAME,Example,DIRECT",
                "MATCH,DIRECT",
            ]
        );
    }
}
