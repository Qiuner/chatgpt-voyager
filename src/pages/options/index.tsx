/**
 * @module pages/options/index.tsx
 * 职责：options 页面 React 挂载入口。
 * 主要导出：无（入口副作用初始化）。
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import Options from '@pages/options/Options';
import '@pages/options/index.css';

function init() {
  const rootContainer = document.querySelector("#__root");
  if (!rootContainer) throw new Error("Can't find Options root element");
  const root = createRoot(rootContainer);
  root.render(<Options />);
}

init();
