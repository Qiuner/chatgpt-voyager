/**
 * downloader.ts
 * 通用下载逻辑：将字符串内容写入 Blob 并触发浏览器下载。
 * Created: 2026-03-13
 */

import type { ExportFormat } from './formatter';

const getExtension = (format: ExportFormat) => (format === 'json' ? 'json' : 'md');

const getMimeType = (format: ExportFormat) =>
  format === 'json' ? 'application/json' : 'text/markdown';

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

  const blob = new Blob([content], { type: getMimeType(format) });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
};
