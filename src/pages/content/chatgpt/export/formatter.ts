/**
 * formatter.ts
 * 基于提取到的消息生成 Markdown / JSON 导出内容（参考 claude-exporter 的 formatContent 思路）。
 * Created: 2026-03-13
 */

import type { ChatMessage } from './extractor';

export type ExportFormat = 'markdown' | 'json';

export const formatMessages = (messages: ChatMessage[], format: ExportFormat): string => {
  if (format === 'json') {
    return JSON.stringify({ messages }, null, 2);
  }

  return messages
    .map(({ role, content }) => `### ${role === 'assistant' ? 'Assistant' : 'User'}\n\n${content}\n\n`)
    .join('');
};

