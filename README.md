# chatgpt-voyager

ChatGPT 的浏览器扩展增强插件：在对话页面提供时间轴导航，帮助你在长对话里更快定位与回看关键消息。

[![Chrome](https://img.shields.io/badge/Chrome-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
![License](https://img.shields.io/badge/License-MIT-3DA639?style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=0B1220)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)

## 功能列表

- 🧭 ChatGPT 对话时间轴导航  
  在 `https://chatgpt.com/*` 与 `https://chat.openai.com/*` 的对话页自动注入一条时间轴。  
  通过 markers + 虚拟化渲染（仅渲染可见 dots）降低长对话的 DOM 压力，并在滚动时同步高亮当前 active turn。

- 🪟 Tooltip 摘要预览  
  Hover / Focus 时间轴 dot 时显示 tooltip，内容来自对应 turn 的文本摘要。  
  Tooltip 支持三行截断与动态宽度/左右侧放置，窗口 resize 时会重新计算位置与尺寸。

- 🎚️ 左侧快速滑块（Slider）  
  当对话足够长导致时间轴内容高度超过视窗时显示外置 slider，便于快速拖拽定位时间轴位置。  
  拖拽只影响时间轴 track 的滚动，并通过同步逻辑更新可见 dots 与 active 计算。

- ⭐ 星标关键消息（localStorage）  
  支持对 dot 长按切换星标状态，将重要 turn “钉住”便于回看。  
  星标以 `localStorage` 按 conversationId 存储，并通过 `storage` 事件实现跨 tab 同步。

- ⚙️ 运行开关（chrome.storage.local）  
  content script 会读取 `chrome.storage.local` 中的 `timelineActive` 与 `timelineProviders.chatgpt` 作为启用开关。  
  当前仓库提供了底层开关读取/订阅封装，方便后续在 Popup / Options 接入 UI 控制。

## 安装方式

### 手动安装（Chrome）

1. 构建产物：

```bash
npm run build:chrome
```

2. 打开 `chrome://extensions`
3. 打开右上角 `Developer mode`
4. 点击 `Load unpacked`
5. 选择本项目的 `dist_chrome` 目录

### Chrome Web Store

`TBD`

## 开发指南

### Clone

```bash
git clone <your-repo-url>
cd chatgpt-voyager
```

### Install

```bash
npm i
```

### Dev

```bash
npm run dev:chrome
```

开发模式会监听源码变更并更新 `dist_chrome`，在 `chrome://extensions` 中点击扩展卡片上的刷新按钮即可加载最新版本。

### Build

```bash
npm run build:chrome
```

## 项目结构

```text
public/
  icon-32.png
  icon-128.png
src/
  assets/
  pages/
    background/
    content/
    options/
    popup/
manifest.json
```

- `src/pages/content/chatgpt/`：ChatGPT 对话页 content script（入口、样式、timeline 模块）
- `src/pages/popup/`：扩展 Popup 页面（当前为基础骨架）
- `src/pages/options/`：扩展 Options 页面（当前为基础骨架）
- `manifest.json`：Manifest V3 配置（matches、注入脚本与权限）

## 技术栈

- React 19
- TypeScript
- Tailwind CSS
- Vite
- Chrome Extension Manifest V3

## Contributing

欢迎提交 Issue / PR：

1. Fork 仓库并创建分支
2. 保持改动小而清晰，附带必要的验证方式（例如 build 通过）
3. 提交 PR 并描述改动动机与影响范围

## Credits

时间轴交互灵感来源：chatgpt-conversation-timeline  
https://github.com/Reborn14/chatgpt-conversation-timeline

## License

MIT，详见 [LICENSE](LICENSE)。
