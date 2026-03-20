/**
 * @module pages/popup/index.tsx
 * 职责：popup 页面 React 挂载入口。
 * 主要导出：无（入口副作用初始化）。
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@pages/popup/index.css';
import '@assets/styles/tailwind.css';
import Popup from '@pages/popup/Popup';

function init() {
  const rootContainer = document.querySelector("#__root");
  if (!rootContainer) throw new Error("Can't find Popup root element");
  const root = createRoot(rootContainer);
  root.render(<Popup />);
}

init();
