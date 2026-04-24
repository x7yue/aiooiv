# aiooiv

aiooiv 是一个基于 [Tauri 2](https://tauri.app/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vite.dev/) 的桌面应用。

## 技术栈

- 桌面端框架：Tauri 2
- 前端：React 19、TypeScript、Vite
- 样式：Tailwind CSS
- 状态管理：Zustand
- 包管理器：Bun
- 后端能力：Rust、SQLite、Tauri commands

## 环境要求

本地开发前请安装：

- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install)
- Tauri 运行所需的系统依赖，参考 [Tauri prerequisites](https://tauri.app/start/prerequisites/)

推荐 IDE：

- [VS Code](https://code.visualstudio.com/)
- [Tauri VS Code extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 本地开发

安装依赖：

```bash
bun install
```

启动前端开发服务器：

```bash
bun run dev
```

启动 Tauri 桌面开发环境：

```bash
bun run tauri dev
```

## 构建

只构建前端资源：

```bash
bun run build
```

构建并打包当前平台的桌面应用：

```bash
bun run tauri build
```

构建产物位于：

```txt
src-tauri/target/release/bundle/
```

Windows 打包 MSI 时需要 WiX Toolset；GitHub Actions 中会自动安装，本地如遇到 WiX 相关错误，请先安装 WiX。

## CI

仓库包含日常构建验证工作流：

```txt
.github/workflows/desktop-ci.yml
```

触发方式：

- push 到 `main` / `master`
- pull request
- 手动 `workflow_dispatch`

CI 会在以下平台执行编译和打包验证：

- `windows-latest`
- `macos-latest`

CI 上传的是短期构建 artifact，主要用于开发检查，不作为正式发布产物。

## Release 发布流程

正式发布由独立工作流负责：

```txt
.github/workflows/release.yml
```

Release workflow 使用官方 `tauri-apps/tauri-action@v0`：

- 根据 tag 创建 GitHub Draft Release
- 构建 Windows x64 安装包
- 构建 macOS Apple Silicon 安装包
- 构建 macOS Intel 安装包
- 自动上传 Tauri bundle 产物到 Draft Release

### 发布新版本

1. 确认版本号一致：

   ```txt
   package.json
   src-tauri/tauri.conf.json
   ```

2. 从目标提交创建 semver tag：

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. 等待 GitHub Actions 中的 `Release` workflow 完成。

4. 在 GitHub Releases 页面检查 Draft Release 的产物。

5. 确认无误后手动发布 Release。

### 手动重跑某个 tag 的发布

也可以在 GitHub Actions 页面手动运行 `Release` workflow，并输入已有 tag，例如：

```txt
v0.1.0
```

## 签名与公证

当前 release workflow 支持生成未签名安装包。正式面向用户分发前，建议补充：

- Windows 代码签名证书
- macOS Developer ID 签名
- macOS notarization 公证
- 如需自动更新，再配置 Tauri updater 签名和更新清单

未签名包可以用于内部测试，但用户安装时可能看到系统安全警告。
