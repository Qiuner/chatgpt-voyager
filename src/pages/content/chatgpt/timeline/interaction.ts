/**
 * interaction.ts
 * 合并自以下模块：
 * - scroll/*：滚动同步与 active 计算
 * - slider/*：外置 slider（显示/隐藏/拖拽）逻辑
 * - stars/*：星标读写与跨 tab 同步
 * - tooltip/*：tooltip 三行截断与展示/定位逻辑
 * Created: 2026-03-13
 */

import type { Marker, PlacementInfo, TooltipPlacement } from './types';
import { getStars, onStarsChange, setStars } from './storage';

// --- scroll/scrollSync.ts ---
export const createScrollSync = (params: { isDisabled?: () => boolean; onFrame: () => void }) => {
  const { isDisabled, onFrame } = params;
  let rafId: number | null = null;

  const schedule = () => {
    if (rafId !== null) return;
    if (isDisabled && isDisabled()) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      onFrame();
    });
  };

  const destroy = () => {
    if (rafId === null) return;
    try {
      cancelAnimationFrame(rafId);
    } catch {}
    rafId = null;
  };

  return { schedule, destroy };
};

// --- scroll/activeByScroll.ts ---
export const createActiveByScrollController = (params: {
  getScrollContainer: () => HTMLElement | null;
  getMarkers: () => Marker[];
  getActiveTurnId: () => string | null;
  onActiveChange: (nextActiveId: string) => void;
  minIntervalMs?: number;
}) => {
  const { getScrollContainer, getMarkers, getActiveTurnId, onActiveChange } = params;

  let lastActiveChangeTime = 0;
  let pendingActiveId: string | null = null;
  let activeChangeTimer: number | null = null;
  let minIntervalMs = typeof params.minIntervalMs === 'number' ? params.minIntervalMs : 120;

  const nowMs = () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const clearTimer = () => {
    if (activeChangeTimer === null) return;
    try {
      window.clearTimeout(activeChangeTimer);
    } catch {}
    activeChangeTimer = null;
  };

  const computeActiveId = () => {
    const scrollContainer = getScrollContainer();
    const markers = getMarkers();
    if (!scrollContainer) return null;
    if (markers.length === 0) return null;

    const containerRect = scrollContainer.getBoundingClientRect();
    const scrollTop = scrollContainer.scrollTop;
    const ref = scrollTop + scrollContainer.clientHeight * 0.45;

    let activeId = markers[0].id;
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const top = m.element.getBoundingClientRect().top - containerRect.top + scrollTop;
      if (top <= ref) activeId = m.id;
      else break;
    }
    return activeId;
  };

  const compute = () => {
    const nextActiveId = computeActiveId();
    if (!nextActiveId) return;

    const current = getActiveTurnId();
    if (current === nextActiveId) return;

    const now = nowMs();
    const since = now - lastActiveChangeTime;
    if (since < minIntervalMs) {
      pendingActiveId = nextActiveId;
      if (activeChangeTimer === null) {
        const delay = Math.max(minIntervalMs - since, 0);
        activeChangeTimer = window.setTimeout(() => {
          activeChangeTimer = null;
          const id = pendingActiveId;
          pendingActiveId = null;
          const cur = getActiveTurnId();
          if (!id) return;
          if (cur === id) return;
          onActiveChange(id);
          lastActiveChangeTime = nowMs();
        }, delay);
      }
      return;
    }

    pendingActiveId = null;
    clearTimer();
    onActiveChange(nextActiveId);
    lastActiveChangeTime = now;
  };

  const destroy = () => {
    pendingActiveId = null;
    clearTimer();
  };

  return {
    compute,
    destroy,
    setMinIntervalMs: (ms: number) => {
      if (!Number.isFinite(ms)) return;
      minIntervalMs = Math.max(0, ms);
    },
  };
};

// --- slider/sliderController.ts ---
export const createSliderController = (params: {
  sliderEl: HTMLDivElement;
  handleEl: HTMLDivElement;
  timelineBarEl: HTMLDivElement;
  trackEl: HTMLDivElement;
  getTrackPadding: () => number;
  getContentHeight: () => number;
  isDraggingRef: { value: boolean };
  onTrackScrollBySlider: () => void;
}) => {
  const {
    sliderEl,
    handleEl,
    timelineBarEl,
    trackEl,
    getTrackPadding,
    getContentHeight,
    isDraggingRef,
    onTrackScrollBySlider,
  } = params;

  let sliderFadeDelay = 1000;
  let sliderFadeTimer: number | null = null;
  let sliderAlwaysVisible = false;
  let sliderStartClientY = 0;
  let sliderStartTop = 0;

  let onSliderMove: ((e: PointerEvent) => void) | null = null;
  let onSliderUp: ((e: PointerEvent) => void) | null = null;
  let onSliderDown: ((e: PointerEvent) => void) | null = null;

  const clearFadeTimer = () => {
    if (!sliderFadeTimer) return;
    try {
      window.clearTimeout(sliderFadeTimer);
    } catch {}
    sliderFadeTimer = null;
  };

  const update = () => {
    const contentHeight = getContentHeight();
    if (!contentHeight) return;

    const barRect = timelineBarEl.getBoundingClientRect();
    const barH = barRect.height || 0;
    const pad = getTrackPadding();
    const innerH = Math.max(0, barH - 2 * pad);

    if (contentHeight <= barH + 1 || innerH <= 0) {
      sliderAlwaysVisible = false;
      try {
        sliderEl.classList.remove('visible');
        sliderEl.style.opacity = '';
      } catch {}
      return;
    }

    sliderAlwaysVisible = true;

    const railLen = Math.max(120, Math.min(240, Math.floor(barH * 0.45)));
    const railTop = Math.round(barRect.top + pad + (innerH - railLen) / 2);
    const railLeftGap = 8;
    const sliderWidth = 12;
    const left = Math.round(barRect.left - railLeftGap - sliderWidth);
    sliderEl.style.left = `${left}px`;
    sliderEl.style.top = `${railTop}px`;
    sliderEl.style.height = `${railLen}px`;

    const handleH = 22;
    const maxTop = Math.max(0, railLen - handleH);
    const range = Math.max(1, contentHeight - barH);
    const st = trackEl.scrollTop || 0;
    const r = Math.max(0, Math.min(1, st / range));
    const top = Math.round(r * maxTop);
    handleEl.style.height = `${handleH}px`;
    handleEl.style.top = `${top}px`;
    try {
      sliderEl.classList.add('visible');
      sliderEl.style.opacity = '';
    } catch {}
  };

  const show = () => {
    try {
      sliderEl.classList.add('visible');
    } catch {}
    clearFadeTimer();
    update();
  };

  const hideDeferred = () => {
    if (isDraggingRef.value || sliderAlwaysVisible) return;
    clearFadeTimer();
    sliderFadeTimer = window.setTimeout(() => {
      sliderFadeTimer = null;
      try {
        sliderEl.classList.remove('visible');
      } catch {}
    }, sliderFadeDelay);
  };

  const handleSliderDrag = (e: PointerEvent) => {
    if (!isDraggingRef.value) return;

    const barRect = timelineBarEl.getBoundingClientRect();
    const barH = barRect.height || 0;
    const railLen =
      parseFloat(sliderEl.style.height || '0') || Math.max(120, Math.min(240, Math.floor(barH * 0.45)));
    const handleH = handleEl.getBoundingClientRect().height || 22;
    const maxTop = Math.max(0, railLen - handleH);
    const delta = e.clientY - sliderStartClientY;
    const railTop = parseFloat(sliderEl.style.top || '0') || 0;
    const top = Math.max(0, Math.min(maxTop, sliderStartTop + delta - railTop));
    const r = maxTop > 0 ? top / maxTop : 0;

    const contentHeight = getContentHeight();
    const range = Math.max(1, contentHeight - barH);
    trackEl.scrollTop = Math.round(r * range);
    onTrackScrollBySlider();
    show();
    update();
  };

  const endSliderDrag = (e: PointerEvent) => {
    isDraggingRef.value = false;
    try {
      if (onSliderMove) window.removeEventListener('pointermove', onSliderMove);
    } catch {}
    onSliderMove = null;
    onSliderUp = null;
    hideDeferred();
    try {
      handleEl.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const attach = () => {
    onSliderDown = (ev) => {
      try {
        handleEl.setPointerCapture(ev.pointerId);
      } catch {}
      isDraggingRef.value = true;
      show();
      sliderStartClientY = ev.clientY;
      const rect = handleEl.getBoundingClientRect();
      sliderStartTop = rect.top;
      onSliderMove = (e) => handleSliderDrag(e);
      onSliderUp = (e) => endSliderDrag(e);
      window.addEventListener('pointermove', onSliderMove);
      window.addEventListener('pointerup', onSliderUp, { once: true });
    };

    try {
      handleEl.addEventListener('pointerdown', onSliderDown);
    } catch {}
  };

  const destroy = () => {
    clearFadeTimer();
    if (onSliderDown) {
      try {
        handleEl.removeEventListener('pointerdown', onSliderDown);
      } catch {}
    }
    if (onSliderMove) {
      try {
        window.removeEventListener('pointermove', onSliderMove);
      } catch {}
    }
    onSliderDown = null;
    onSliderMove = null;
    onSliderUp = null;
  };

  attach();

  return {
    update,
    show,
    hideDeferred,
    setFadeDelay: (ms: number) => {
      sliderFadeDelay = ms;
    },
    setAlwaysVisible: (v: boolean) => {
      sliderAlwaysVisible = v;
    },
    getAlwaysVisible: () => sliderAlwaysVisible,
    destroy,
  };
};

// --- stars/starsController.ts ---
export const createStarsController = (params: {
  conversationId: string | null;
  markersRef: { get: () => Marker[] };
  markerMapRef: { get: () => Map<string, Marker> };
  onTooltipMaybeRefresh: (dot: HTMLButtonElement) => void;
  getHoveredOrFocusedDot: () => HTMLButtonElement | null;
}) => {
  const { conversationId, markersRef, markerMapRef, onTooltipMaybeRefresh, getHoveredOrFocusedDot } =
    params;

  let cid: string | null = conversationId;
  let starred = new Set<string>();
  let unsubscribe: (() => void) | null = null;

  const load = () => {
    starred.clear();
    if (!cid) return;
    try {
      getStars(cid).forEach((id) => starred.add(String(id)));
    } catch {}
  };

  const save = () => {
    if (!cid) return;
    try {
      setStars(cid, Array.from(starred));
    } catch {}
  };

  const has = (turnId: string) => {
    const id = String(turnId || '');
    if (!id) return false;
    return starred.has(id);
  };

  const applyStarStateToMarkers = () => {
    const markers = markersRef.get();
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const want = starred.has(m.id);
      if (m.starred !== want) {
        m.starred = want;
        if (m.dotElement) {
          try {
            m.dotElement.classList.toggle('starred', m.starred);
            m.dotElement.setAttribute('aria-pressed', m.starred ? 'true' : 'false');
          } catch {}
        }
      }
    }

    try {
      const currentDot = getHoveredOrFocusedDot();
      if (currentDot) onTooltipMaybeRefresh(currentDot);
    } catch {}
  };

  const toggle = (turnId: string) => {
    const id = String(turnId || '');
    if (!id) return;
    if (starred.has(id)) starred.delete(id);
    else starred.add(id);
    save();

    const m = markerMapRef.get().get(id);
    if (m) {
      m.starred = starred.has(id);
      if (m.dotElement) {
        try {
          m.dotElement.classList.toggle('starred', m.starred);
          m.dotElement.setAttribute('aria-pressed', m.starred ? 'true' : 'false');
        } catch {}
        try {
          onTooltipMaybeRefresh(m.dotElement);
        } catch {}
      }
    }
  };

  const subscribeCrossTab = () => {
    if (!cid) return;
    unsubscribe?.();
    unsubscribe = onStarsChange(cid, (ids) => {
      try {
        const nextSet = new Set(ids.map((x) => String(x)));
        if (nextSet.size === starred.size) {
          let same = true;
          for (const id of starred) {
            if (!nextSet.has(id)) {
              same = false;
              break;
            }
          }
          if (same) return;
        }
        starred = nextSet;
        applyStarStateToMarkers();
      } catch {}
    });
  };

  const setConversationId = (nextConversationId: string | null) => {
    cid = nextConversationId;
    unsubscribe?.();
    unsubscribe = null;
    load();
    subscribeCrossTab();
  };

  const destroy = () => {
    unsubscribe?.();
    unsubscribe = null;
  };

  load();
  subscribeCrossTab();

  return { has, toggle, load, save, setConversationId, destroy, applyStarStateToMarkers };
};

// --- tooltip/truncate.ts ---
const getCSSVarNumberForTruncate = (el: Element, name: string, fallback: number) => {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export function truncateToThreeLines(params: {
  text: string;
  targetWidth: number;
  measureEl: HTMLDivElement;
  tooltipEl: HTMLDivElement;
  wantLayout: true;
}): { text: string; height: number };
export function truncateToThreeLines(params: {
  text: string;
  targetWidth: number;
  measureEl: HTMLDivElement;
  tooltipEl: HTMLDivElement;
  wantLayout?: false;
}): string;
export function truncateToThreeLines(params: {
  text: string;
  targetWidth: number;
  measureEl: HTMLDivElement;
  tooltipEl: HTMLDivElement;
  wantLayout?: boolean;
}): string | { text: string; height: number } {
  const { text, targetWidth, measureEl, tooltipEl } = params;
  const wantLayout = Boolean(params.wantLayout);

  try {
    const lineH = getCSSVarNumberForTruncate(tooltipEl, '--timeline-tooltip-lh', 18);
    const padY = getCSSVarNumberForTruncate(tooltipEl, '--timeline-tooltip-pad-y', 10);
    const borderW = getCSSVarNumberForTruncate(tooltipEl, '--timeline-tooltip-border-w', 1);
    const maxH = Math.round(3 * lineH + 2 * padY + 2 * borderW);
    const ell = '…';
    const el = measureEl;
    el.style.width = `${Math.max(0, Math.floor(targetWidth))}px`;

    el.textContent = String(text || '').replace(/\s+/g, ' ').trim();
    let h = el.offsetHeight;
    if (h <= maxH) return wantLayout ? { text: el.textContent || '', height: h } : el.textContent || '';

    const raw = el.textContent || '';
    let lo = 0;
    let hi = raw.length;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      el.textContent = raw.slice(0, mid).trimEnd() + ell;
      h = el.offsetHeight;
      if (h <= maxH) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    const out = ans >= raw.length ? raw : raw.slice(0, ans).trimEnd() + ell;
    el.textContent = out;
    h = el.offsetHeight;
    return wantLayout ? { text: out, height: Math.min(h, maxH) } : out;
  } catch {
    return wantLayout ? { text, height: 0 } : text;
  }
}

// --- tooltip/tooltipController.ts ---
const getCSSVarNumberForTooltip = (el: Element, name: string, fallback: number) => {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const computePlacementInfo = (tooltipEl: HTMLDivElement, dot: HTMLButtonElement): PlacementInfo => {
  const dotRect = dot.getBoundingClientRect();
  const vw = window.innerWidth;
  const arrowOut = getCSSVarNumberForTooltip(tooltipEl, '--timeline-tooltip-arrow-outside', 6);
  const baseGap = getCSSVarNumberForTooltip(tooltipEl, '--timeline-tooltip-gap-visual', 12);
  const boxGap = getCSSVarNumberForTooltip(tooltipEl, '--timeline-tooltip-gap-box', 8);
  const gap = baseGap + Math.max(0, arrowOut) + Math.max(0, boxGap);
  const viewportPad = 8;
  const maxW = getCSSVarNumberForTooltip(tooltipEl, '--timeline-tooltip-max', 288);
  const minW = 160;
  const leftAvail = Math.max(0, dotRect.left - gap - viewportPad);
  const rightAvail = Math.max(0, vw - dotRect.right - gap - viewportPad);
  let placement: TooltipPlacement = rightAvail > leftAvail ? 'right' : 'left';
  let avail = placement === 'right' ? rightAvail : leftAvail;
  const tiers = [280, 240, 200, 160];
  const hardMax = Math.max(minW, Math.min(maxW, Math.floor(avail)));
  let width = tiers.find((t) => t <= hardMax) || Math.max(minW, Math.min(hardMax, 160));

  if (width < minW && placement === 'left' && rightAvail > leftAvail) {
    placement = 'right';
    avail = rightAvail;
    const hardMax2 = Math.max(minW, Math.min(maxW, Math.floor(avail)));
    width = tiers.find((t) => t <= hardMax2) || Math.max(120, Math.min(hardMax2, minW));
  } else if (width < minW && placement === 'right' && leftAvail >= rightAvail) {
    placement = 'left';
    avail = leftAvail;
    const hardMax2 = Math.max(minW, Math.min(maxW, Math.floor(avail)));
    width = tiers.find((t) => t <= hardMax2) || Math.max(120, Math.min(hardMax2, minW));
  }

  width = Math.max(120, Math.min(width, maxW));
  return { placement, width };
};

const placeTooltipAt = (
  tooltipEl: HTMLDivElement,
  dot: HTMLButtonElement,
  placement: TooltipPlacement,
  width: number,
  height: number,
) => {
  const dotRect = dot.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const arrowOut = getCSSVarNumberForTooltip(tooltipEl, '--timeline-tooltip-arrow-outside', 6);
  const baseGap = getCSSVarNumberForTooltip(tooltipEl, '--timeline-tooltip-gap-visual', 12);
  const boxGap = getCSSVarNumberForTooltip(tooltipEl, '--timeline-tooltip-gap-box', 8);
  const gap = baseGap + Math.max(0, arrowOut) + Math.max(0, boxGap);
  const viewportPad = 8;

  let left: number;
  let finalPlacement: TooltipPlacement = placement;
  let finalWidth = width;

  if (finalPlacement === 'left') {
    left = Math.round(dotRect.left - gap - finalWidth);
    if (left < viewportPad) {
      const altLeft = Math.round(dotRect.right + gap);
      if (altLeft + finalWidth <= vw - viewportPad) {
        finalPlacement = 'right';
        left = altLeft;
      } else {
        const fitWidth = Math.max(120, vw - viewportPad - altLeft);
        left = altLeft;
        finalWidth = fitWidth;
      }
    }
  } else {
    left = Math.round(dotRect.right + gap);
    if (left + finalWidth > vw - viewportPad) {
      const altLeft = Math.round(dotRect.left - gap - finalWidth);
      if (altLeft >= viewportPad) {
        finalPlacement = 'left';
        left = altLeft;
      } else {
        const fitWidth = Math.max(120, vw - viewportPad - left);
        finalWidth = fitWidth;
      }
    }
  }

  let top = Math.round(dotRect.top + dotRect.height / 2 - height / 2);
  top = Math.max(viewportPad, Math.min(vh - height - viewportPad, top));

  tooltipEl.style.width = `${Math.floor(finalWidth)}px`;
  tooltipEl.style.height = `${Math.floor(height)}px`;
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
  tooltipEl.setAttribute('data-placement', finalPlacement);
};

export const createTooltipController = (params: {
  tooltipEl: HTMLDivElement;
  measureEl: HTMLDivElement;
  isStarred: (turnId: string) => boolean;
}) => {
  const { tooltipEl, measureEl, isStarred } = params;
  let tooltipHideDelay = 100;
  let tooltipHideTimer: number | null = null;
  let showRafId: number | null = null;

  const clearHideTimer = () => {
    if (!tooltipHideTimer) return;
    try {
      window.clearTimeout(tooltipHideTimer);
    } catch {}
    tooltipHideTimer = null;
  };

  const cancelShowRaf = () => {
    if (showRafId === null) return;
    try {
      cancelAnimationFrame(showRafId);
    } catch {}
    showRafId = null;
  };

  const applyTextAndPlace = (dot: HTMLButtonElement, fullText: string) => {
    const p = computePlacementInfo(tooltipEl, dot);
    const layout = truncateToThreeLines({
      text: fullText,
      targetWidth: p.width,
      measureEl,
      tooltipEl,
      wantLayout: true,
    });
    tooltipEl.textContent = layout.text;
    placeTooltipAt(tooltipEl, dot, p.placement, p.width, layout.height);
  };

  const getTextForDot = (dot: HTMLButtonElement) => {
    let fullText = String(dot.getAttribute('aria-label') || '').trim();
    try {
      const id = String(dot.dataset.targetTurnId || '');
      if (id && isStarred(id)) fullText = `★ ${fullText}`;
    } catch {}
    return fullText;
  };

  const show = (dot: HTMLButtonElement) => {
    clearHideTimer();
    tooltipEl.classList.remove('visible');
    const fullText = getTextForDot(dot);
    applyTextAndPlace(dot, fullText);
    tooltipEl.setAttribute('aria-hidden', 'false');
    cancelShowRaf();
    showRafId = requestAnimationFrame(() => {
      showRafId = null;
      tooltipEl.classList.add('visible');
    });
  };

  const hide = (opts?: { immediate?: boolean }) => {
    const immediate = Boolean(opts?.immediate);
    const doHide = () => {
      tooltipEl.classList.remove('visible');
      tooltipEl.setAttribute('aria-hidden', 'true');
      tooltipHideTimer = null;
    };
    if (immediate) return doHide();
    clearHideTimer();
    tooltipHideTimer = window.setTimeout(doHide, tooltipHideDelay);
  };

  const refresh = (dot: HTMLButtonElement) => {
    const isVisible = tooltipEl.classList.contains('visible');
    if (!isVisible) return;
    const fullText = getTextForDot(dot);
    applyTextAndPlace(dot, fullText);
  };

  const repositionIfVisible = (rootEl: HTMLElement) => {
    if (!tooltipEl.classList.contains('visible')) return;
    const activeDot = rootEl.querySelector('.timeline-dot:hover, .timeline-dot:focus') as
      | HTMLButtonElement
      | null;
    if (!activeDot) return;
    tooltipEl.classList.remove('visible');
    const fullText = getTextForDot(activeDot);
    applyTextAndPlace(activeDot, fullText);
    cancelShowRaf();
    showRafId = requestAnimationFrame(() => {
      showRafId = null;
      tooltipEl.classList.add('visible');
    });
  };

  const setHideDelay = (delayMs: number) => {
    tooltipHideDelay = delayMs;
  };

  const destroy = () => {
    clearHideTimer();
    cancelShowRaf();
  };

  return { show, hide, refresh, repositionIfVisible, setHideDelay, destroy };
};

