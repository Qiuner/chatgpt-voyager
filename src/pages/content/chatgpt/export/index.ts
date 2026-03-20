/**
 * @module pages/content/chatgpt/export/index.ts
 * 职责：导出模块入口，组装导出能力初始化与销毁。
 * 主要导出：本文件导出的导出模块入口函数。
 */
/**
 * index.ts
 * ChatGPT 导出功能入口：等待注入点就绪、注入导出按钮与菜单、绑定事件，并暴露 destroy()。
 * 修复：下拉菜单样式改为“显式颜色 + 内联重置”，避免被 ChatGPT 全局样式污染导致不可读。
 * Created: 2026-03-13
 */

import { downloadExportFile } from './downloader';
import { extractChatGPTMessages } from './extractor';
import { formatMessages, type ExportFormat } from './formatter';

const EXPORT_ATTR = 'data-chatgpt-voyager-export';
const SHARE_BUTTON_SELECTOR = '#conversation-header-actions > button[data-testid="share-chat-button"]';

const waitForElement = async <T extends Element>(selector: string, timeoutMs = 8000) => {
  const existing = document.querySelector(selector);
  if (existing) return existing as T;

  return await new Promise<T | null>((resolve) => {
    let settled = false;

    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      try {
        observer.disconnect();
      } catch {}
      try {
        if (timeoutId) window.clearTimeout(timeoutId);
      } catch {}
      resolve(value);
    };

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) finish(el as T);
    });

    try {
      observer.observe(document.body, { childList: true, subtree: true });
    } catch {
      finish(null);
      return;
    }

    const timeoutId = window.setTimeout(() => finish(null), timeoutMs);
  });
};

type MenuTheme = {
  menuBg: string;
  menuText: string;
  itemHoverBg: string;
};

const getMenuTheme = (): MenuTheme => {
  const isDark = document.documentElement.classList.contains('dark');
  return isDark
    ? { menuBg: '#2f2f2f', menuText: '#ffffff', itemHoverBg: '#3a3a3a' }
    : { menuBg: '#ffffff', menuText: '#000000', itemHoverBg: '#f3f4f6' };
};

const applyMenuBaseStyle = (menu: HTMLDivElement, theme: MenuTheme) => {
  // 关键修复：显式设置样式，并用 `all: initial` 断开 ChatGPT 站点的全局样式/选择器污染。
  menu.style.setProperty('all', 'initial');
  menu.style.position = 'fixed';
  menu.style.zIndex = '99999';
  menu.style.display = 'none';
  menu.style.width = '180px';
  menu.style.boxSizing = 'border-box';
  menu.style.borderRadius = '8px';
  menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  menu.style.backgroundColor = theme.menuBg;
  menu.style.color = theme.menuText;
  menu.style.padding = '6px 0';
  menu.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  menu.style.fontSize = '14px';
  menu.style.lineHeight = '20px';
};

const applyMenuItemBaseStyle = (item: HTMLButtonElement, theme: MenuTheme) => {
  // 关键修复：显式颜色，不依赖 ChatGPT 的 CSS 变量；同时重置继承样式，保证主题下可见。
  item.style.setProperty('all', 'initial');
  item.style.display = 'block';
  item.style.width = '100%';
  item.style.boxSizing = 'border-box';
  item.style.padding = '10px 12px';
  item.style.cursor = 'pointer';
  item.style.userSelect = 'none';
  item.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  item.style.fontSize = '14px';
  item.style.lineHeight = '20px';
  item.style.color = theme.menuText;
  item.style.backgroundColor = theme.menuBg;
};

const createMenuItem = (label: string) => {
  const item = document.createElement('button');
  item.type = 'button';
  item.setAttribute(EXPORT_ATTR, '1');
  item.setAttribute('role', 'menuitem');
  item.textContent = label;
  const theme = getMenuTheme();
  applyMenuItemBaseStyle(item, theme);
  item.addEventListener('mouseenter', () => {
    item.style.backgroundColor = theme.itemHoverBg;
  });
  item.addEventListener('mouseleave', () => {
    item.style.backgroundColor = theme.menuBg;
  });
  return item;
};

const createMenu = () => {
  const menu = document.createElement('div');
  menu.setAttribute(EXPORT_ATTR, '1');
  menu.setAttribute('role', 'menu');
  const theme = getMenuTheme();
  applyMenuBaseStyle(menu, theme);
  return menu;
};

export const initChatGPTExport = () => {
  const existing = document.querySelector(`[${EXPORT_ATTR}="1"]`);
  if (existing) return { destroy: () => {} };

  let destroyed = false;
  let container: HTMLDivElement | null = null;
  let exportButton: HTMLButtonElement | null = null;
  let menu: HTMLDivElement | null = null;

  let onDocumentPointerDown: ((e: PointerEvent) => void) | null = null;
  let onExportButtonClick: ((e: MouseEvent) => void) | null = null;

  const closeMenu = () => {
    if (!menu) return;
    menu.style.display = 'none';
  };

  const openMenuAtButton = () => {
    if (!menu || !exportButton) return;
    const rect = exportButton.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;
    // 关键修复：打开菜单时按当前主题重新应用显式颜色，避免主题切换后仍沿用旧色值。
    applyMenuBaseStyle(menu, getMenuTheme());
    menu.style.display = 'block';
  };

  const toggleMenu = () => {
    if (!menu) return;
    if (menu.style.display === 'none' || menu.style.display === '') openMenuAtButton();
    else closeMenu();
  };

  const getConversationIdFromUrl = () =>
    window.location.pathname.split('/c/')[1]?.split('/')[0] ?? 'unknown';

  const getTimestampForFilename = () => new Date().toISOString().replace(/[:.]/g, '-');

  const getFilename = (format: ExportFormat) => {
    const ext = format === 'json' ? 'json' : 'md';
    const conversationId = getConversationIdFromUrl();
    const timestamp = getTimestampForFilename();
    return `chatgpt-export-${conversationId}-${timestamp}.${ext}`;
  };

  const handleExport = (format: ExportFormat) => {
    const messages = extractChatGPTMessages();
    if (!messages.length) return;
    const content = formatMessages(messages, format);
    downloadExportFile({ content, format, filename: getFilename(format) });
  };

  const setup = async () => {
    const shareButton = await waitForElement<HTMLButtonElement>(SHARE_BUTTON_SELECTOR);
    if (!shareButton) return;
    if (destroyed) return;
    if (document.querySelector(`[${EXPORT_ATTR}="1"]`)) return;

    container = document.createElement('div');
    container.setAttribute(EXPORT_ATTR, '1');
    container.style.display = 'inline-flex';
    container.style.alignItems = 'center';

    exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.setAttribute(EXPORT_ATTR, '1');
    exportButton.setAttribute('aria-label', '导出');
    exportButton.className =
      'btn btn-ghost text-token-text-primary hover:bg-token-surface-hover rounded-lg max-sm:hidden';
    exportButton.textContent = '导出';

    menu = createMenu();
    const md = createMenuItem('Markdown');
    const js = createMenuItem('JSON');

    md.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      handleExport('markdown');
    });
    js.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      handleExport('json');
    });

    menu.appendChild(md);
    menu.appendChild(js);
    document.body.appendChild(menu);

    onExportButtonClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    };
    exportButton.addEventListener('click', onExportButtonClick);

    container.appendChild(exportButton);

    shareButton.insertAdjacentElement('beforebegin', container);

    onDocumentPointerDown = (e) => {
      if (!menu) return;
      const t = e.target as Node | null;
      if (t && (menu.contains(t) || container?.contains(t))) return;
      closeMenu();
    };
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
  };

  void setup();

  const destroy = () => {
    destroyed = true;

    if (onDocumentPointerDown) {
      try {
        document.removeEventListener('pointerdown', onDocumentPointerDown, true);
      } catch {}
    }
    onDocumentPointerDown = null;

    if (exportButton && onExportButtonClick) {
      try {
        exportButton.removeEventListener('click', onExportButtonClick);
      } catch {}
    }
    onExportButtonClick = null;

    try {
      menu?.remove();
    } catch {}
    menu = null;

    try {
      container?.remove();
    } catch {}
    container = null;
    exportButton = null;
  };

  return { destroy };
};
