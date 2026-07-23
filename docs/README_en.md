<h1 align="center">
  <img src="../resources/icon.svg" alt="MEOW" width="128" />
  <br>
  MEOW
  <br>
</h1>

<h3 align="center">
An independent fork of <a href="https://github.com/clash-verge-rev/clash-verge-rev">Clash Verge Rev</a>, currently in its initial brand redesign phase.
</h3>

<p align="center">
  Languages:
  <a href="../README.md">简体中文</a> ·
  <a href="./README_en.md">English</a> ·
  <a href="./README_es.md">Español</a> ·
  <a href="./README_ru.md">Русский</a> ·
  <a href="./README_ja.md">日本語</a> ·
  <a href="./README_ko.md">한국어</a> ·
  <a href="./README_fa.md">فارسی</a>
</p>

> [!IMPORTANT]
> MEOW 0.0.1 is the project's first public release and includes brand changes, interface restructuring, and experimental features. MEOW is not affiliated with or endorsed by Clash Verge, Clash Verge Rev, or their maintainers. Report MEOW-specific issues in the [MEOW repository](https://github.com/Shiro-Design-16/MEOW/issues), not to upstream maintainers.

## Install

Download the installer for your operating system and processor architecture from the [MEOW 0.0.1 Release](https://github.com/Shiro-Design-16/MEOW/releases/tag/MEOW-0.0.1). ARM64 and x86_64 builds are provided for macOS and Windows.

These installers are not yet Apple-notarized or commercially code-signed, so macOS Gatekeeper or Windows SmartScreen may display a security warning.

## Features

MEOW currently inherits the complete Clash Verge Rev v2.5.2 feature set:

- High-performance Rust and Tauri 2 foundation
- Embedded [Clash.Meta (mihomo)](https://github.com/MetaCubeX/mihomo) core with optional `Alpha` core switching
- Theme colors, proxy group/tray icons, and `CSS Injection` customization
- Enhanced profile management with Merge and Script helpers and configuration syntax hints
- System proxy controls, guard mode, and `TUN` virtual network adapter support
- Visual node and rule editors
- WebDAV configuration backup and sync

MEOW 0.0.1 also includes experimental cross-platform per-app routing. All application traffic still enters TUN; selected processes use a chosen policy, while other applications continue through the existing rules. Both TUN and Rule mode are required. macOS and Windows installers are currently provided; Linux builds will follow after further validation.

For usage and troubleshooting, refer to the [Clash Verge Rev documentation](https://clash-verge-rev.github.io/). That documentation is maintained upstream, so its project names, downloads, and community links refer to Clash Verge Rev rather than MEOW.

## Development

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed contribution guidelines. After installing all **Tauri** prerequisites, run:

```shell
pnpm install
pnpm run prebuild
pnpm dev
```

## Contributions

Issues and pull requests are welcome. MEOW is currently a branding-focused fork; proposals that change application behavior should explain why the change belongs in MEOW and how it will be maintained while syncing with upstream.

## Origin and acknowledgements

The current MEOW author is **SHIRO**. Project metadata will not use a generic “MEOW Contributors” attribution until additional contributors have made actual contributions.

MEOW is based on [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev), which continues [Clash Verge](https://github.com/zzzgydi/clash-verge). Upstream version history is retained in [Changelog.md](../Changelog.md) and [Changelog.history.md](./Changelog.history.md).

We also thank these projects and their contributors:

- [tauri-apps/tauri](https://github.com/tauri-apps/tauri)
- [Dreamacro/clash](https://github.com/Dreamacro/clash)
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo)
- [Fndroid/clash_for_windows_pkg](https://github.com/Fndroid/clash_for_windows_pkg)
- [vitejs/vite](https://github.com/vitejs/vite)

## License

MEOW remains licensed under the GNU General Public License v3.0. See [LICENSE](../LICENSE). When distributing a modified version, follow the GPL-3.0 requirements for source availability, license notices, and identification of modifications.
