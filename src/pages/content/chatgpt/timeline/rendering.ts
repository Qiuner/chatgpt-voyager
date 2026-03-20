/**
 * rendering.ts
 * 合并自以下模块：
 * - ui/*：时间轴 DOM 注入/复用与移除
 * - markers/*：markers 构建、几何/排布计算、虚拟化渲染 dots
 * Created: 2026-03-13
 */

import {
  TIMELINE_BAR_SELECTOR,
  TIMELINE_LEFT_SLIDER_SELECTOR,
  TIMELINE_TOOLTIP_ID,
  applyMinGap,
  lowerBound,
  normalizeText,
  upperBound,
} from './core';
import type { Marker, TimelineUI, VisibleRange } from './types';

const VOYAGER_TIMELINE_SELECTOR = '[data-chatgpt-voyager-timeline]';

// --- ui/createTimelineUI.ts ---
export type TimelineMeasure = {
  measureEl: HTMLDivElement;
  measureCanvas: HTMLCanvasElement;
  measureCtx: CanvasRenderingContext2D | null;
};

export const createTimelineUI = (): { ui: TimelineUI; measure: TimelineMeasure } => {
  let timelineBar = document.querySelector(VOYAGER_TIMELINE_SELECTOR) as HTMLDivElement | null;
  if (!timelineBar) {
    timelineBar = document.createElement('div');
    timelineBar.className = 'chatgpt-timeline-bar';
    timelineBar.setAttribute('data-chatgpt-voyager-timeline', '1');
    document.body.appendChild(timelineBar);
  } else {
    timelineBar.setAttribute('data-chatgpt-voyager-timeline', '1');
  }

  let track = timelineBar.querySelector('.timeline-track') as HTMLDivElement | null;
  if (!track) {
    track = document.createElement('div');
    track.className = 'timeline-track';
    timelineBar.appendChild(track);
  }

  let trackContent = track.querySelector('.timeline-track-content') as HTMLDivElement | null;
  if (!trackContent) {
    trackContent = document.createElement('div');
    trackContent.className = 'timeline-track-content';
    track.appendChild(trackContent);
  }

  let slider = document.querySelector(TIMELINE_LEFT_SLIDER_SELECTOR) as HTMLDivElement | null;
  if (!slider) {
    slider = document.createElement('div');
    slider.className = 'timeline-left-slider';
    const handle = document.createElement('div');
    handle.className = 'timeline-left-handle';
    slider.appendChild(handle);
    document.body.appendChild(slider);
  }
  const sliderHandle = slider.querySelector('.timeline-left-handle') as HTMLDivElement | null;
  if (!sliderHandle) {
    const handle = document.createElement('div');
    handle.className = 'timeline-left-handle';
    slider.appendChild(handle);
  }

  let tooltip = document.getElementById(TIMELINE_TOOLTIP_ID) as HTMLDivElement | null;
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'timeline-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.id = TIMELINE_TOOLTIP_ID;
    tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltip);
  }

  let measureEl = document.querySelector(
    `div[data-chatgpt-timeline-measure="1"]`,
  ) as HTMLDivElement | null;
  if (!measureEl) {
    measureEl = document.createElement('div');
    measureEl.setAttribute('data-chatgpt-timeline-measure', '1');
    measureEl.setAttribute('aria-hidden', 'true');
    measureEl.style.position = 'fixed';
    measureEl.style.left = '-9999px';
    measureEl.style.top = '0px';
    measureEl.style.visibility = 'hidden';
    measureEl.style.pointerEvents = 'none';
    const cs = getComputedStyle(tooltip);
    Object.assign(measureEl.style, {
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      padding: cs.padding,
      border: cs.border,
      borderRadius: cs.borderRadius,
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      maxWidth: 'none',
      display: 'block',
      transform: 'none',
      transition: 'none',
    } as Partial<CSSStyleDeclaration>);
    try {
      (measureEl.style as unknown as { webkitLineClamp?: string }).webkitLineClamp = 'unset';
    } catch {}
    document.body.appendChild(measureEl);
  }

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');

  return {
    ui: {
      timelineBar,
      tooltip,
      track,
      trackContent,
      slider,
      sliderHandle: (slider.querySelector('.timeline-left-handle') as HTMLDivElement) ?? slider,
    },
    measure: { measureEl, measureCanvas, measureCtx },
  };
};

// --- ui/removeTimelineUI.ts ---
export const removeTimelineUI = () => {
  try {
    document.querySelectorAll(VOYAGER_TIMELINE_SELECTOR).forEach((el) => el.remove());
  } catch {}
  try {
    document.querySelector(TIMELINE_BAR_SELECTOR)?.remove();
  } catch {}
  try {
    document.getElementById(TIMELINE_TOOLTIP_ID)?.remove();
  } catch {}
  try {
    const measureEl = document.querySelector(`div[data-chatgpt-timeline-measure="1"]`) as
      | HTMLElement
      | null;
    measureEl?.remove();
  } catch {}

  try {
    const slider = document.querySelector(TIMELINE_LEFT_SLIDER_SELECTOR) as HTMLElement | null;
    if (slider) {
      try {
        slider.style.pointerEvents = 'none';
      } catch {}
      try {
        slider.remove();
      } catch {}
    }

    const straySlider = document.querySelector(TIMELINE_LEFT_SLIDER_SELECTOR) as HTMLElement | null;
    if (straySlider) {
      try {
        straySlider.style.pointerEvents = 'none';
      } catch {}
      try {
        straySlider.remove();
      } catch {}
    }
  } catch {}
};

// --- markers/buildMarkers.ts ---
export const buildMarkers = (params: {
  userTurnElements: HTMLElement[];
  starred: Set<string>;
}): {
  markers: Marker[];
  markerMap: Map<string, Marker>;
  firstUserTurnOffset: number;
  contentSpanPx: number;
} => {
  const { userTurnElements, starred } = params;

  const firstTurnOffset = userTurnElements[0]?.offsetTop ?? 0;
  let contentSpan: number;

  if (userTurnElements.length < 2) {
    contentSpan = 1;
  } else {
    const lastTurnOffset = userTurnElements[userTurnElements.length - 1].offsetTop;
    contentSpan = lastTurnOffset - firstTurnOffset;
  }
  if (contentSpan <= 0) contentSpan = 1;

  const markerMap = new Map<string, Marker>();
  const markers = userTurnElements.map((el) => {
    const offsetFromStart = el.offsetTop - firstTurnOffset;
    let n = offsetFromStart / contentSpan;
    n = Math.max(0, Math.min(1, n));

    const id = String(el.dataset.turnId || '');
    const m: Marker = {
      id,
      element: el,
      summary: normalizeText(el.textContent || ''),
      n,
      baseN: n,
      dotElement: null,
      starred: false,
    };

    try {
      m.starred = starred.has(m.id);
    } catch {}

    markerMap.set(m.id, m);
    return m;
  });

  return {
    markers,
    markerMap,
    firstUserTurnOffset: firstTurnOffset,
    contentSpanPx: contentSpan,
  };
};

// --- markers/geometry.ts ---
const getCSSVarNumber = (el: Element, name: string, fallback: number) => {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const detectCssVarTopSupport = (params: {
  trackContentEl: HTMLDivElement;
  pad: number;
  usableC: number;
}) => {
  const { trackContentEl, pad, usableC } = params;
  try {
    const test = document.createElement('button');
    test.className = 'timeline-dot';
    test.style.visibility = 'hidden';
    test.style.pointerEvents = 'none';
    test.setAttribute('aria-hidden', 'true');
    const expected = pad + 0.5 * usableC;
    test.style.setProperty('--n', '0.5');
    trackContentEl.appendChild(test);
    const cs = getComputedStyle(test);
    const topStr = cs.top || '';
    const px = parseFloat(topStr);
    test.remove();
    if (!Number.isFinite(px)) return false;
    return Math.abs(px - expected) <= 2;
  } catch {
    return false;
  }
};

export const computeGeometry = (params: {
  timelineBarEl: HTMLDivElement;
  trackContentEl: HTMLDivElement;
  markers: Marker[];
  cssVarTopSupported: boolean | null;
}): {
  contentHeight: number;
  scale: number;
  yPositions: number[];
  usePixelTop: boolean;
  cssVarTopSupported: boolean;
  sliderAlwaysVisible: boolean;
} => {
  const { timelineBarEl, trackContentEl, markers } = params;

  const H = timelineBarEl.clientHeight || 0;
  const pad = getCSSVarNumber(timelineBarEl, '--timeline-track-padding', 12);
  const minGap = getCSSVarNumber(timelineBarEl, '--timeline-min-gap', 12);
  const N = markers.length;

  const desired = Math.max(H, N > 0 ? 2 * pad + Math.max(0, N - 1) * minGap : H);
  const contentHeight = Math.ceil(desired);
  const scale = H > 0 ? contentHeight / H : 1;
  try {
    trackContentEl.style.height = `${contentHeight}px`;
  } catch {}

  const usableC = Math.max(1, contentHeight - 2 * pad);
  const desiredY = markers.map((m) => pad + Math.max(0, Math.min(1, (m.baseN ?? m.n ?? 0))) * usableC);
  const yPositions = applyMinGap(desiredY, pad, pad + usableC, minGap);

  for (let i = 0; i < N; i++) {
    const top = yPositions[i];
    const n = (top - pad) / usableC;
    markers[i].n = Math.max(0, Math.min(1, n));
    if (markers[i].dotElement) {
      try {
        markers[i].dotElement!.style.setProperty('--n', String(markers[i].n));
      } catch {}
    }
  }

  let supported = params.cssVarTopSupported;
  if (supported === null) supported = detectCssVarTopSupport({ trackContentEl, pad, usableC });
  const usePixelTop = !supported;

  const sliderAlwaysVisible = contentHeight > (timelineBarEl.clientHeight || 0) + 1;

  return {
    contentHeight,
    scale,
    yPositions,
    usePixelTop,
    cssVarTopSupported: supported,
    sliderAlwaysVisible,
  };
};

// --- markers/virtualRender.ts ---
export const renderVirtualDots = (params: {
  trackEl: HTMLDivElement;
  trackContentEl: HTMLDivElement;
  timelineBarEl: HTMLDivElement;
  markers: Marker[];
  yPositions: number[];
  usePixelTop: boolean;
  activeTurnId: string | null;
  visibleRange: VisibleRange;
}): { visibleRange: VisibleRange } => {
  const {
    trackEl,
    trackContentEl,
    timelineBarEl,
    markers,
    yPositions,
    usePixelTop,
    activeTurnId,
  } = params;
  const localVersionMarkersLen = markers.length;
  if (localVersionMarkersLen === 0) return { visibleRange: { start: 0, end: -1 } };

  const st = trackEl.scrollTop || 0;
  const vh = trackEl.clientHeight || 0;
  const buffer = Math.max(100, vh);
  const minY = st - buffer;
  const maxY = st + vh + buffer;
  const start = lowerBound(yPositions, minY);
  const end = Math.max(start - 1, upperBound(yPositions, maxY));

  let prevStart = params.visibleRange.start;
  let prevEnd = params.visibleRange.end;
  const len = markers.length;
  if (len > 0) {
    prevStart = Math.max(0, Math.min(prevStart, len - 1));
    prevEnd = Math.max(-1, Math.min(prevEnd, len - 1));
  }

  if (prevEnd >= prevStart) {
    for (let i = prevStart; i < Math.min(start, prevEnd + 1); i++) {
      const m = markers[i];
      if (m?.dotElement) {
        try {
          m.dotElement.remove();
        } catch {}
        m.dotElement = null;
      }
    }
    for (let i = Math.max(end + 1, prevStart); i <= prevEnd; i++) {
      const m = markers[i];
      if (m?.dotElement) {
        try {
          m.dotElement.remove();
        } catch {}
        m.dotElement = null;
      }
    }
  } else {
    (trackContentEl || timelineBarEl).querySelectorAll('.timeline-dot').forEach((n) => n.remove());
    markers.forEach((m) => {
      m.dotElement = null;
    });
  }

  const frag = document.createDocumentFragment();
  for (let i = start; i <= end; i++) {
    const marker = markers[i];
    if (!marker) continue;

    if (!marker.dotElement) {
      const dot = document.createElement('button');
      dot.className = 'timeline-dot';
      dot.dataset.targetTurnId = marker.id;
      dot.setAttribute('aria-label', marker.summary);
      dot.setAttribute('tabindex', '0');
      try {
        dot.setAttribute('aria-describedby', TIMELINE_TOOLTIP_ID);
      } catch {}
      try {
        dot.style.setProperty('--n', String(marker.n || 0));
      } catch {}
      if (usePixelTop) dot.style.top = `${Math.round(yPositions[i])}px`;
      try {
        dot.classList.toggle('active', marker.id === activeTurnId);
      } catch {}
      try {
        dot.classList.toggle('starred', Boolean(marker.starred));
        dot.setAttribute('aria-pressed', marker.starred ? 'true' : 'false');
      } catch {}
      marker.dotElement = dot;
      frag.appendChild(dot);
    } else {
      try {
        marker.dotElement.style.setProperty('--n', String(marker.n || 0));
      } catch {}
      if (usePixelTop) marker.dotElement.style.top = `${Math.round(yPositions[i])}px`;
      try {
        marker.dotElement.classList.toggle('starred', Boolean(marker.starred));
        marker.dotElement.setAttribute('aria-pressed', marker.starred ? 'true' : 'false');
      } catch {}
    }
  }

  if (frag.childNodes.length) trackContentEl.appendChild(frag);
  return { visibleRange: { start, end } };
};

