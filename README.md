<h1 align="center">
  <img src="./src-tauri/icons/icon.png" alt="MEOW" width="128" />
  <br>
  MEOW
  <br>
</h1>

<h3 align="center">
基于 <a href="https://github.com/clash-verge-rev/clash-verge-rev">Clash Verge Rev</a> 的独立 fork，当前处于品牌重塑阶段。
</h3>

<p align="center">
  Languages:
  <a href="./README.md">简体中文</a> ·
  <a href="./docs/README_en.md">English</a> ·
  <a href="./docs/README_es.md">Español</a> ·
  <a href="./docs/README_ru.md">Русский</a> ·
  <a href="./docs/README_ja.md">日本語</a> ·
  <a href="./docs/README_ko.md">한국어</a> ·
  <a href="./docs/README_fa.md">فارسی</a>
</p>

> [!IMPORTANT]
> MEOW 是 Clash Verge Rev 的非官方 fork。`MEOW-0.0.1` 基线仅调整品牌与项目声明；当前开发分支已开始加入独立维护的实验功能。MEOW 与 Clash Verge、Clash Verge Rev 及其维护者不存在官方隶属或背书关系；MEOW 的问题请提交至 [MEOW 仓库](https://github.com/Shiro-Design-16/MEOW/issues)，请勿向上游项目反馈仅在 MEOW 中出现的问题。

## 预览

| 深色模式                         | 浅色模式                          |
| -------------------------------- | --------------------------------- |
| ![深色预览](./docs/preview_dark.png) | ![浅色预览](./docs/preview_light.png) |

> 当前截图与图标可能仍包含上游视觉元素，将随 MEOW 品牌设计逐步更新。

## 安装

MEOW 0.0.1 当前仍处于开发阶段，源码更新保存在仓库的 `dev` 分支；首个正式 Release 将在图标替换和发布准备完成后创建。

仓库目前不提供正式签名的安装包。本地生成的 macOS 包仅用于开发测试；正式安装包将在独立更新签名和发布流程准备完成后提供。

## 功能

MEOW 当前完整继承 Clash Verge Rev v2.5.2 的功能：

- 基于 Rust 和 Tauri 2
- 内置 [Clash.Meta（mihomo）](https://github.com/MetaCubeX/mihomo) 内核，并支持切换 `Alpha` 版本内核
- 自定义主题颜色、代理组/托盘图标及 `CSS Injection`
- 配置文件管理和增强（Merge 和 Script），以及配置文件语法提示
- 系统代理、守卫和 `TUN`（虚拟网卡）模式
- 可视化节点与规则编辑
- WebDAV 配置备份和同步

当前开发分支还包含实验性的 macOS 按应用路由：所有应用流量仍进入 TUN，选定应用按进程匹配到指定策略，其他应用继续执行原有规则。该功能要求同时开启 TUN 和规则模式。

功能使用与常见问题可参考 [Clash Verge Rev 文档](https://clash-verge-rev.github.io/)。请注意，该文档由上游维护，其中的项目名称、下载地址和社区入口均指向上游，而非 MEOW。

## 开发

详细说明请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。安装 **Tauri** 所需环境后，运行：

```shell
pnpm install
pnpm run prebuild
pnpm dev
```

## 贡献

欢迎提交 Issue 和 Pull Request。当前初始化阶段以品牌调整为主；后续涉及功能行为的改动应说明必要性及其与上游同步策略。

## 来源与致谢

MEOW 基于 [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev)，后者延续自 [Clash Verge](https://github.com/zzzgydi/clash-verge)。上游版本历史保留在 [Changelog.md](./Changelog.md) 和 [docs/Changelog.history.md](./docs/Changelog.history.md) 中。

同时感谢以下项目及其贡献者：

- [tauri-apps/tauri](https://github.com/tauri-apps/tauri)
- [Dreamacro/clash](https://github.com/Dreamacro/clash)
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo)
- [Fndroid/clash_for_windows_pkg](https://github.com/Fndroid/clash_for_windows_pkg)
- [vitejs/vite](https://github.com/vitejs/vite)

## 许可

本项目沿用 GNU General Public License v3.0。详情见 [LICENSE](./LICENSE)。分发修改版本时，请同时遵守 GPL-3.0 的源代码提供、许可告知及修改标识要求。
