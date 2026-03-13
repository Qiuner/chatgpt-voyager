/**
 * extractor.ts
 * 从 ChatGPT 对话页 DOM 提取消息列表，返回 { role, content }[]。
 * Created: 2026-03-13
 */

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

const normalizeChatGPTText = (text: string) => {
  const raw = String(text ?? '');
  const unix = raw.replace(/\r\n?/g, '\n');
  const noTrailingSpaces = unix.replace(/[ \t]+\n/g, '\n').replace(/[ \t]+$/g, '');
  const collapsed = noTrailingSpaces.replace(/\n{3,}/g, '\n\n');
  return collapsed.trim();
};

const getInnerTextSafely = (el: Element | null) => {
  if (!el) return '';
  try {
    return (el as HTMLElement).innerText ?? el.textContent ?? '';
  } catch {
    return el.textContent ?? '';
  }
};

export const extractChatGPTMessages = (): ChatMessage[] => {
  const articles = document.querySelectorAll<HTMLElement>('#thread article[data-turn]');
  if (!articles.length) return [];

  const messages: ChatMessage[] = [];

  articles.forEach((article) => {
    const role = String(article.getAttribute('data-turn') || '');
    if (role !== 'user' && role !== 'assistant') return;

    if (role === 'user') {
      const contentEl = article.querySelector('.whitespace-pre-wrap');
      const text = normalizeChatGPTText(getInnerTextSafely(contentEl));
      if (!text) return;
      messages.push({ role: 'user', content: text });
      return;
    }

    const contentEl = article.querySelector('.markdown');
    const text = normalizeChatGPTText(getInnerTextSafely(contentEl));
    if (!text) return;
    messages.push({ role: 'assistant', content: text });
  });

  return messages;
};

