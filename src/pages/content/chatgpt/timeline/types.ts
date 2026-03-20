/**
 * @module pages/content/chatgpt/timeline/types.ts
 * 职责：定义时间轴渲染与交互使用的类型。
 * 主要导出：Marker、TimelineUI、VisibleRange 等类型定义。
 */
export type Marker = {
  id: string;
  element: HTMLElement;
  summary: string;
  n: number;
  baseN: number;
  dotElement: HTMLButtonElement | null;
  starred: boolean;
};

export type VisibleRange = { start: number; end: number };

export type TimelineUI = {
  timelineBar: HTMLDivElement;
  tooltip: HTMLDivElement;
  track: HTMLDivElement;
  trackContent: HTMLDivElement;
  slider: HTMLDivElement;
  sliderHandle: HTMLDivElement;
};

export type TooltipPlacement = 'left' | 'right';

export type PlacementInfo = {
  placement: TooltipPlacement;
  width: number;
};
