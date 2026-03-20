/**
 * @module pages/content/chatgpt/export/downloader.ts
 * 职责：封装导出文件下载逻辑。
 * 主要导出：本文件导出的下载相关函数。
 */
/**
 * downloader.ts
 * 通用下载逻辑：将字符串内容写入 Blob 并触发浏览器下载。
 *
 * 图片导出策略：
 * - 如果 formatter 产出了图片计划（getLastImagePlan 非空），则自动切换为 zip 下载：
 *   chatgpt-export-{conversationId}-{timestamp}.zip
 *   └── chatgpt-export-{conversationId}-{timestamp}/
 *       ├── conversation.md / conversation.json
 *       └── images/
 * - 图片并发 fetch；单张失败时跳过该图片，并将占位引用替换为原始 URL，同时 console.warn。
 * - 占位符 `image-N.__ext__` 会在拿到 Content-Type 后替换为最终扩展名。
 * Created: 2026-03-13
 */

import JSZip from 'jszip';
import { getLastImagePlan, type ExportFormat } from './formatter';

const getExtension = (format: ExportFormat) => (format === 'json' ? 'json' : 'md');

const getMimeType = (format: ExportFormat) =>
  format === 'json' ? 'application/json' : 'text/markdown';

const inferImageExtension = (contentType: string | null): string => {
  const ct = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (ct === 'image/jpeg' || ct === 'image/jpg') return 'jpg';
  if (ct === 'image/png') return 'png';
  if (ct === 'image/webp') return 'webp';
  if (ct === 'image/gif') return 'gif';
  if (ct === 'image/svg+xml') return 'svg';
  return 'png';
};

const stripKnownExtension = (filename: string) => filename.replace(/\.(md|json|txt)$/i, '');

const replaceAll = (input: string, search: string, replacement: string) => {
  if (!search) return input;
  return input.split(search).join(replacement);
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const fetchImageBytes = async (src: string) => {
  const res = await fetch(src, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type');
  const ext = inferImageExtension(contentType);
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), ext };
};

export const downloadExportFile = (params: {
  content: string;
  format: ExportFormat;
  filename?: string;
}) => {
  const { content, format } = params;
  const ext = getExtension(format);
  const filename =
    params.filename && String(params.filename).trim()
      ? String(params.filename).trim()
      : `chatgpt-export-${new Date().toISOString().split('T')[0]}.${ext}`;

  const plan = getLastImagePlan();
  if (plan.length === 0) {
    const blob = new Blob([content], { type: getMimeType(format) });
    downloadBlob(blob, filename);
    return;
  }

  const baseName = stripKnownExtension(filename);
  const zipFilename = `${baseName}.zip`;
  const conversationFilename = `conversation.${ext}`;

  const zip = new JSZip();
  const root = zip.folder(baseName);
  if (!root) {
    const blob = new Blob([content], { type: getMimeType(format) });
    downloadBlob(blob, filename);
    return;
  }

  const imagesFolder = root.folder('images');
  if (!imagesFolder) {
    const blob = new Blob([content], { type: getMimeType(format) });
    downloadBlob(blob, filename);
    return;
  }

  const run = async () => {
    let conversationContent = content;

    const results = await Promise.allSettled(
      plan.map(async (item) => {
        const src = item.src;
        const placeholder = item.placeholderFilename;
        try {
          const { bytes, ext } = await fetchImageBytes(src);
          const finalFilename = placeholder.replace('__ext__', ext);
          imagesFolder.file(finalFilename, bytes);
          return { ok: true as const, placeholder, finalFilename, src };
        } catch (err) {
          console.warn('[ChatGPT-Voyager][export] Failed to fetch image, fallback to URL:', src, err);
          return { ok: false as const, placeholder, src };
        }
      }),
    );

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const v = r.value;
      if (v.ok) {
        conversationContent = replaceAll(conversationContent, v.placeholder, v.finalFilename);
        continue;
      }

      conversationContent = replaceAll(
        conversationContent,
        `./images/${v.placeholder}`,
        v.src,
      );
      conversationContent = replaceAll(conversationContent, `"${v.placeholder}"`, `"${v.src}"`);
    }

    root.file(conversationFilename, conversationContent);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, zipFilename);
  };

  void run();
};
