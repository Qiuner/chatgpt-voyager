<div align="center">
<img src="public/icon-128.png" width="96" alt="chatgpt-voyager logo" />

# ChatGPT-Voyager

### ChatGPT 的“缺失增强包”

在 ChatGPT 的长对话中，用时间轴快速定位消息；并支持导出对话（Markdown / JSON / 含图片的 ZIP）。

[![Chrome](https://img.shields.io/badge/Chrome-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](#-installation)
[![Edge](https://img.shields.io/badge/Edge-MV3-0078D7?style=flat-square&logo=microsoftedge&logoColor=white)](#-installation)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639?style=flat-square)](LICENSE)
[![Built with React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=0B1220)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

[English](.github/README.md) · [中文](#)

</div>

---

> 长对话最痛的不是内容多，而是“找不到你刚刚看到的那条”。  
> ChatGPT-Voyager 的目标是把定位、预览、导出做得更顺手。

## ✨ Features

### 📍 Timeline Navigation（时间轴导航）

**长对话不迷路。**  
在 `https://chatgpt.com/*` 与 `https://chat.openai.com/*` 的对话页注入时间轴，支持点击跳转与滚动同步高亮当前 active turn。

- **Virtualized dots**：仅渲染可见范围的 dots，降低长对话 DOM 压力
- **Hover / Focus preview**：支持 tooltip 摘要预览
- **Slider**：对话很长时出现外置滑块，便于快速定位
- **Stars**：长按 dot 切换星标，localStorage 持久化并跨 tab 同步

### 💾 Chat Export（对话导出）

**你的数据，你来保存。**  
在 ChatGPT 顶部 header（分享按钮左侧）注入“导出”按钮，可导出：

- **Markdown**
- **JSON**
- **Images in ZIP**：当对话包含 AI 生成图片时，自动打包为 ZIP（`conversation.* + images/`）

## 📥 Installation

### Manual Installation (Development)

1. 安装依赖

```bash
npm i --legacy-peer-deps
```

2. 构建扩展

```bash
npm run build:chrome
```

3. 在 Chrome / Edge 加载

- Chrome：打开 `chrome://extensions`
- Edge：打开 `edge://extensions`
- 开启 **Developer mode**
- 点击 **Load unpacked**
- 选择本项目 `dist_chrome/` 目录

### Chrome Web Store / Edge Add-ons

`TBD`

---

## 🛠️ Development

```bash
# Start development mode with auto-rebuild
npm run dev:chrome

# After each rebuild:
# 1. Open chrome://extensions or edge://extensions
# 2. Click the refresh button on ChatGPT-Voyager
# 3. Refresh the ChatGPT page
```

### Project Structure

```text
public/
  icon-16.png
  icon-32.png
  icon-48.png
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

- `src/pages/content/chatgpt/`：ChatGPT 页面 content script（时间轴、导出功能）
- `src/pages/popup/`：扩展 Popup（当前为基础骨架）
- `src/pages/options/`：扩展 Options（当前为基础骨架）
- `manifest.json`：Manifest V3 配置（matches、注入脚本与权限）

### Tech Stack

- **Framework**: React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Build**: Vite + @crxjs/vite-plugin
- **Platform**: Chrome Extension Manifest V3

---

## 🤝 Contributing

欢迎提交 Issue / PR：

1. Fork 仓库
2. 创建分支（例如 `feat/export-images`）
3. 保持改动小而清晰，并确保 `npm run build:chrome` 可通过
4. 提交 PR 并说明改动动机与影响范围

---

## 🌟 Credits

时间轴交互灵感来源：chatgpt-conversation-timeline  
https://github.com/Reborn14/chatgpt-conversation-timeline

---

## 📄 License

MIT License © 2026
