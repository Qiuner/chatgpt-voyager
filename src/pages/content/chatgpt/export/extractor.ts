/**
 * @module pages/content/chatgpt/export/extractor.ts
 * 职责：提取 ChatGPT 对话数据用于导出。
 * 主要导出：本文件导出的提取相关函数。
 */
/**
 * extractor.ts
 * 从 ChatGPT 对话页 DOM 提取消息列表。
 *
 * 关键说明：
 * - 仅做 DOM 数据提取，不做下载、不做格式化；
 * - AI 生成图片在同一张图的 DOM 内可能出现多个 <img>（主图/模糊层/loading），
 *   其中只有“主图”带有 alt（已生成图片 / Generated image），因此用 alt 前缀选择器提取并按 src 去重。
 * Created: 2026-03-13
 */

export type ChatImage = { src: string; alt: string };

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  images?: ChatImage[];
};

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

const normalizeAltText = (alt: string) => {
  const raw = String(alt ?? '').replace(/\s+/g, ' ').trim();
  return raw;
};

const extractAssistantImages = (article: HTMLElement): ChatImage[] => {
  const images: ChatImage[] = [];
  const seenSrc = new Set<string>();

  const candidates = article.querySelectorAll<HTMLImageElement>(
    `img[alt^="已生成图片"], img[alt^="Generated image"]`,
  );

  candidates.forEach((img) => {
    const src = String(img.getAttribute('src') || '').trim();
    if (!src) return;
    if (seenSrc.has(src)) return;
    seenSrc.add(src);

    const alt = normalizeAltText(String(img.getAttribute('alt') || ''));
    images.push({ src, alt });
  });

  return images;
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
    const images = extractAssistantImages(article);

    if (!text && images.length === 0) return;
    messages.push({ role: 'assistant', content: text, images: images.length ? images : undefined });
  });

  return messages;
};

