<h1 align="center">
  <img src="../src-tauri/icons/icon.png" alt="MEOW" width="128" />
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
> The `MEOW-0.0.1` baseline changed only brand presentation and project declarations. The current development branch has begun adding independently maintained experimental features. MEOW is not affiliated with or endorsed by Clash Verge, Clash Verge Rev, or their maintainers. Report MEOW-specific issues in the [MEOW repository](https://github.com/Shiro-Design-16/MEOW/issues), not to upstream maintainers.

## Preview

| Dark                                | Light                                 |
| ----------------------------------- | ------------------------------------- |
| ![Dark Preview](./preview_dark.png) | ![Light Preview](./preview_light.png) |

> Screenshots and icons may still contain upstream visual elements while the MEOW brand design is in progress.

## Install

MEOW 0.0.1 remains in development, with source updates on the repository's `dev` branch. The first formal Release will be created after the icon replacement and release preparation are complete.

The repository does not currently provide formally signed installers. Locally built macOS packages are for development testing only; official packages will follow after independent update signing and release workflows are ready.

## Features

MEOW currently inherits the complete Clash Verge Rev v2.5.2 feature set:

- High-performance Rust and Tauri 2 foundation
- Embedded [Clash.Meta (mihomo)](https://github.com/MetaCubeX/mihomo) core with optional `Alpha` core switching
- Theme colors, proxy group/tray icons, and `CSS Injection` customization
- Enhanced profile management with Merge and Script helpers and configuration syntax hints
- System proxy controls, guard mode, and `TUN` virtual network adapter support
- Visual node and rule editors
- WebDAV configuration backup and sync

The current development branch also includes experimental macOS per-app routing. All application traffic still enters TUN; selected processes use a chosen policy, while other applications continue through the existing rules. Both TUN and Rule mode are required.

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

MEOW is based on [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev), which continues [Clash Verge](https://github.com/zzzgydi/clash-verge). Upstream version history is retained in [Changelog.md](../Changelog.md) and [Changelog.history.md](./Changelog.history.md).

We also thank these projects and their contributors:

- [tauri-apps/tauri](https://github.com/tauri-apps/tauri)
- [Dreamacro/clash](https://github.com/Dreamacro/clash)
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo)
- [Fndroid/clash_for_windows_pkg](https://github.com/Fndroid/clash_for_windows_pkg)
- [vitejs/vite](https://github.com/vitejs/vite)

## License

MEOW remains licensed under the GNU General Public License v3.0. See [LICENSE](../LICENSE). When distributing a modified version, follow the GPL-3.0 requirements for source availability, license notices, and identification of modifications.
