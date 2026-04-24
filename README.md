# aiooiv

aiooiv 是一个本地优先的 AI 图像生成与编辑桌面工作台。它通过 OpenAI 兼容接口创建文生图和图生图任务，在本机保存任务历史、生成结果和配置，适合把多次图像实验组织成可搜索、可重试、可追踪的工作流。

## 功能概览

- 文生图与图生图：支持通过提示词生成图片，也支持上传源图后进行编辑。
- 任务队列：任务会经历 pending、running、completed、failed 等状态，便于追踪批量生成进度。
- 参数控制：可配置图片尺寸、质量和生成数量。
- 历史管理：支持搜索任务、按状态过滤，并在列表视图和画廊视图之间切换。
- 失败恢复：失败任务会展示错误信息，并支持重试或删除。
- 本地持久化：任务元数据写入 SQLite，生成图片保存到应用数据目录。
- API 设置：可配置 OpenAI API Base URL 和 API Key，方便接入不同兼容服务。

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

Windows 打包 MSI 时需要 WiX Toolset；本地如遇到 WiX 相关错误，请先安装 WiX。
