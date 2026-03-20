/**
 * @module pages/content/index.tsx
 * 职责：通用 content 页面 React 挂载入口。
 * 主要导出：无（入口副作用初始化）。
 */
import { createRoot } from 'react-dom/client';
import './style.css' 
const div = document.createElement('div');
div.id = '__root';
document.body.appendChild(div);

const rootContainer = document.querySelector('#__root');
if (!rootContainer) throw new Error("Can't find Content root element");
const root = createRoot(rootContainer);
root.render(
  <div className='absolute bottom-0 left-0 text-lg text-black bg-amber-400 z-50'  >
    content script <span className='your-class'>loaded</span>
  </div>
);

try {
  console.log('content script loaded');
} catch (e) {
  console.error(e);
}
