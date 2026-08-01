# 构建 MEOW 安装包

MEOW 0.0.2 暂时仅以源代码形式发布。仓库内的构建脚本会在本机生成安装包，但不会生成或直接运行裸程序：

- macOS：生成 `.dmg`，完成后自动挂载并打开，由用户决定是否将 MEOW 拖入“应用程序”。
- Windows：生成 NSIS `-setup.exe` 安装包，完成后打开安装向导，由用户决定继续安装或取消。

本地生成的安装包没有 MEOW 官方签名。请只构建和运行来自可信提交的源代码，也不要将未签名产物作为官方安装包重新分发。

## 通用环境

- Git
- Node.js 24.18.0
- pnpm 11.3.0（仓库已在 `package.json` 中固定包管理器版本）
- Rust 1.95.0（仓库已在 `rust-toolchain.toml` 中固定工具链）
- 可访问 npm、crates.io、GitHub Releases；预构建步骤需要下载 Mihomo 内核及相关资源

克隆代码并安装 JavaScript 依赖：

```shell
git clone https://github.com/Shiro-Design-16/MEOW.git
cd MEOW
git checkout MEOW-0.0.2
corepack enable
pnpm install --frozen-lockfile
```

## macOS

支持 Apple Silicon（ARM64）和 Intel（x86_64）Mac。请安装：

- Xcode 26 或更新版本
- Xcode Command Line Tools

首次安装后确认许可并完成组件初始化：

```shell
sudo xcodebuild -license accept
sudo xcodebuild -runFirstLaunch
```

生成并打开 DMG：

```shell
pnpm build:installer
```

产物位于：

```text
target/<Rust target>/release/bundle/dmg/
```

脚本会自动打开生成的 DMG，但不会把 MEOW 自动复制到“应用程序”。如只想构建、不自动打开：

```shell
pnpm build:installer -- --no-open
```

## Windows

支持 Windows 11 ARM64 和 x86_64。请安装：

- Visual Studio 2022 Build Tools
- “使用 C++ 的桌面开发”工作负载
- Windows 11 SDK
- Microsoft Edge WebView2 Runtime（Windows 11 通常已包含）

在 PowerShell 中生成并打开 NSIS 安装向导：

```powershell
pnpm build:installer
```

产物位于：

```text
target\<Rust target>\release\bundle\nsis\
```

脚本只会启动安装向导，不会自动确认或静默安装。如只想生成安装包、不打开向导：

```powershell
pnpm build:installer -- --no-open
```

## 架构说明

`build:installer` 根据当前电脑的系统与处理器自动选择 Rust target：

| 构建电脑 | Rust target | 产物 |
| --- | --- | --- |
| Apple Silicon Mac | `aarch64-apple-darwin` | DMG |
| Intel Mac | `x86_64-apple-darwin` | DMG |
| Windows ARM64 | `aarch64-pc-windows-msvc` | NSIS 安装包 |
| Windows x86_64 | `x86_64-pc-windows-msvc` | NSIS 安装包 |

该脚本以本机原生构建为目标，不负责在一台电脑上交叉生成其他平台或处理器架构的安装包。

## 常见问题

### 为什么仍然出现系统安全提醒？

本地构建没有 Developer ID 或 Authenticode 签名。签名只影响发布者身份和系统信任判断，不影响安装包本身是否成功生成。

### 为什么构建过程需要联网？

除首次安装 Node.js 和 Rust 依赖外，`prebuild` 还会下载与当前平台匹配的 Mihomo 稳定版和 Alpha 内核。已经缓存的依赖可能被复用。

### 可以直接运行 `target/.../release/meow` 或 `meow.exe` 吗？

不建议。MEOW 依赖 Tauri 打包资源、sidecar 和平台配置；请使用脚本生成的 DMG 或 NSIS 安装包完成安装。
