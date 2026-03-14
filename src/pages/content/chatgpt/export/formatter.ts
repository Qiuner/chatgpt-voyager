/**
 * formatter.ts
 * 基于提取到的消息生成 Markdown / JSON 导出内容。
 *
 * 图片导出说明：
 * - 生成内容时为每张图片分配一个稳定的占位文件名 `image-N.__ext__`；
 * - 真正的扩展名在 downloader 里通过 fetch 响应的 Content-Type 推断，然后把占位符替换成最终文件名。
 * Created: 2026-03-13
 */

import type { ChatMessage } from './extractor';

export type ExportFormat = 'markdown' | 'json';

export type ImagePlanItem = {
  index: number;
  src: string;
  alt: string;
  placeholderFilename: string;
};

let lastImagePlan: ImagePlanItem[] = [];

export const getLastImagePlan = (): ImagePlanItem[] => lastImagePlan.slice();

const buildImagePlan = (messages: ChatMessage[]): ImagePlanItem[] => {
  const out: ImagePlanItem[] = [];
  const bySrc = new Map<string, ImagePlanItem>();

  for (const msg of messages) {
    const imgs = msg.role === 'assistant' ? msg.images : undefined;
    if (!imgs || imgs.length === 0) continue;
    for (const img of imgs) {
      const src = String(img.src || '').trim();
      if (!src) continue;
      const existing = bySrc.get(src);
      if (existing) continue;
      const index = out.length + 1;
      const alt = String(img.alt || '').trim();
      const placeholderFilename = `image-${index}.__ext__`;
      const item: ImagePlanItem = { index, src, alt, placeholderFilename };
      bySrc.set(src, item);
      out.push(item);
    }
  }

  return out;
};

const getImagePlaceholderForSrc = (plan: ImagePlanItem[], src: string) => {
  const s = String(src || '').trim();
  if (!s) return null;
  for (const item of plan) {
    if (item.src === s) return item.placeholderFilename;
  }
  return null;
};

export const formatMessages = (messages: ChatMessage[], format: ExportFormat): string => {
  lastImagePlan = buildImagePlan(messages);

  if (format === 'json') {
    const jsonMessages = messages.map((m) => {
      if (m.role !== 'assistant' || !m.images || m.images.length === 0) {
        return { role: m.role, content: m.content };
      }

      const images = m.images
        .map((img) => {
          const placeholder = getImagePlaceholderForSrc(lastImagePlan, img.src);
          if (!placeholder) return null;
          return { filename: placeholder, alt: img.alt };
        })
        .filter((x): x is { filename: string; alt: string } => Boolean(x));

      return { role: m.role, content: m.content, images };
    });

    return JSON.stringify({ messages: jsonMessages }, null, 2);
  }

  return messages
    .map(({ role, content, images }) => {
      const title = `### ${role === 'assistant' ? 'Assistant' : 'User'}`;
      const parts: string[] = [title, '', content || ''];

      if (role === 'assistant' && images && images.length) {
        for (const img of images) {
          const placeholder = getImagePlaceholderForSrc(lastImagePlan, img.src);
          if (!placeholder) continue;
          const alt = String(img.alt || '').trim();
          parts.push('', `![${alt}](./images/${placeholder})`);
        }
      }

      parts.push('', '');
      return parts.join('\n');
    })
    .join('');
};

