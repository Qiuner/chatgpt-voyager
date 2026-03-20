/**
 * core.ts
 * 合并自以下模块：
 * - dom.ts：DOM selector 常量、waitForElement、滚动容器探测
 * - utils/*：二分、minGap、debounce、perf、文本归一化等纯工具
 * - observers/observersController.ts：Mutation/Resize/Intersection/Theme 观察与容器重绑定
 * Created: 2026-03-13
 */

// --- dom.ts ---
export const TURN_ARTICLE_SELECTOR = 'section[data-turn-id]';
export const USER_TURN_ARTICLE_SELECTOR = 'section[data-turn="user"]';
export const USER_TURN_ARTICLE_WITH_ID_SELECTOR = 'section[data-turn="user"][data-turn-id]';

export const TIMELINE_BAR_SELECTOR = '.chatgpt-timeline-bar';
export const TIMELINE_LEFT_SLIDER_SELECTOR = '.timeline-left-slider';
export const TIMELINE_TOOLTIP_ID = 'chatgpt-timeline-tooltip';

export const waitForElement = async <T extends Element>(
  selector: string,
  timeoutMs = 5000,
): Promise<T | null> => {
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

export const findScrollContainer = (el: HTMLElement): HTMLElement => {
  let parent: HTMLElement | null = el;
  while (parent && parent !== document.body) {
    try {
      const style = window.getComputedStyle(parent);
      const oy = style.overflowY;
      if (oy === 'auto' || oy === 'scroll') return parent;
    } catch {}
    parent = parent.parentElement;
  }

  const fallback =
    (document.scrollingElement as HTMLElement | null) ||
    (document.documentElement as HTMLElement | null) ||
    (document.body as HTMLElement | null);
  return fallback ?? el;
};

// --- utils/binarySearch.ts ---
export const lowerBound = (arr: number[], x: number) => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

export const upperBound = (arr: number[], x: number) => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
};

// --- utils/minGap.ts ---
export const applyMinGap = (positions: number[], minTop: number, maxTop: number, gap: number) => {
  const n = positions.length;
  if (n === 0) return positions;
  const out = positions.slice();

  out[0] = Math.max(minTop, Math.min(positions[0], maxTop));
  for (let i = 1; i < n; i++) {
    const minAllowed = out[i - 1] + gap;
    out[i] = Math.max(positions[i], minAllowed);
  }

  if (out[n - 1] > maxTop) {
    out[n - 1] = maxTop;
    for (let i = n - 2; i >= 0; i--) {
      const maxAllowed = out[i + 1] - gap;
      out[i] = Math.min(out[i], maxAllowed);
    }

    if (out[0] < minTop) {
      out[0] = minTop;
      for (let i = 1; i < n; i++) {
        const minAllowed = out[i - 1] + gap;
        out[i] = Math.max(out[i], minAllowed);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (out[i] < minTop) out[i] = minTop;
    if (out[i] > maxTop) out[i] = maxTop;
  }

  return out;
};

// --- utils/debounce.ts ---
export const debounce = (fn: () => void, delayMs: number) => {
  let timeoutId: number | undefined;
  return () => {
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(), delayMs);
  };
};

// --- utils/perf.ts ---
export const perfStart = (enabled: boolean, name: string) => {
  if (!enabled) return;
  try {
    performance.mark(`tg-${name}-start`);
  } catch {}
};

export const perfEnd = (enabled: boolean, name: string) => {
  if (!enabled) return;
  try {
    performance.mark(`tg-${name}-end`);
    performance.measure(`tg-${name}`, `tg-${name}-start`, `tg-${name}-end`);
    const entries = performance.getEntriesByName(`tg-${name}`).slice(-1)[0];
    if (entries) console.debug(`[TimelinePerf] ${name}: ${Math.round(entries.duration)}ms`);
  } catch {}
};

// --- utils/text.ts ---
export const normalizeText = (text: string) => {
  try {
    let s = String(text || '').replace(/\s+/g, ' ').trim();
    s = s.replace(/^\s*(you\s*said\s*[:：]?\s*)/i, '');
    s = s.replace(/^\s*((你说|您说|你說|您說)\s*[:：]?\s*)/, '');
    return s;
  } catch {
    return '';
  }
};

// --- observers/observersController.ts ---
export const createObserversController = (params: {
  getConversationContainer: () => HTMLElement | null;
  getScrollContainer: () => HTMLElement | null;
  timelineBarEl: HTMLDivElement;
  onMutate: () => void;
  onResize: () => void;
  onThemeChange: () => void;
  onIntersectionChange: () => void;
  onRebind: (nextConversationContainer: HTMLElement, nextScrollContainer: HTMLElement | null) => void;
}) => {
  const {
    getConversationContainer,
    getScrollContainer,
    timelineBarEl,
    onMutate,
    onResize,
    onThemeChange,
    onIntersectionChange,
    onRebind,
  } = params;

  let mutationObserver: MutationObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  let themeObserver: MutationObserver | null = null;
  const visibleUserTurns = new Set<Element>();

  const disconnectIntersection = () => {
    try {
      intersectionObserver?.disconnect();
    } catch {}
    intersectionObserver = null;
    visibleUserTurns.clear();
  };

  const updateIntersectionTargets = () => {
    const conversationContainer = getConversationContainer();
    const scrollContainer = getScrollContainer();
    if (!conversationContainer || !scrollContainer) {
      disconnectIntersection();
      return;
    }

    try {
      intersectionObserver?.disconnect();
    } catch {}
    visibleUserTurns.clear();

    intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleUserTurns.add(entry.target);
          else visibleUserTurns.delete(entry.target);
        }
        onIntersectionChange();
      },
      { root: scrollContainer, threshold: 0.1, rootMargin: '-40% 0px -59% 0px' },
    );

    const userTurns = conversationContainer.querySelectorAll<HTMLElement>(
      USER_TURN_ARTICLE_WITH_ID_SELECTOR,
    );
    userTurns.forEach((el) => intersectionObserver?.observe(el));
  };

  const maybeRebindContainers = () => {
    const first = document.querySelector(TURN_ARTICLE_SELECTOR) as HTMLElement | null;
    if (!first) return;
    const nextConversationContainer = first.parentElement as HTMLElement | null;
    const currentConversationContainer = getConversationContainer();
    if (!nextConversationContainer) return;
    if (currentConversationContainer && nextConversationContainer === currentConversationContainer) return;
    const nextScrollContainer = findScrollContainer(nextConversationContainer);
    onRebind(nextConversationContainer, nextScrollContainer);
    updateIntersectionTargets();
  };

  const startMutationObserver = () => {
    const conversationContainer = getConversationContainer();
    if (!conversationContainer) return;
    mutationObserver = new MutationObserver(() => {
      try {
        maybeRebindContainers();
      } catch {}
      try {
        onMutate();
      } catch {}
      try {
        updateIntersectionTargets();
      } catch {}
    });
    mutationObserver.observe(conversationContainer, { childList: true, subtree: true });
  };

  const startResizeObserver = () => {
    resizeObserver = new ResizeObserver(() => {
      onResize();
    });
    resizeObserver.observe(timelineBarEl);
  };

  const startThemeObserver = () => {
    themeObserver = new MutationObserver(() => {
      onThemeChange();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  };

  const start = () => {
    startMutationObserver();
    startResizeObserver();
    updateIntersectionTargets();
    startThemeObserver();
  };

  const destroy = () => {
    try {
      mutationObserver?.disconnect();
    } catch {}
    mutationObserver = null;

    try {
      resizeObserver?.disconnect();
    } catch {}
    resizeObserver = null;

    disconnectIntersection();

    try {
      themeObserver?.disconnect();
    } catch {}
    themeObserver = null;
  };

  const reobserve = () => {
    try {
      mutationObserver?.disconnect();
    } catch {}
    mutationObserver = null;
    startMutationObserver();
    updateIntersectionTargets();
  };

  return { start, destroy, reobserve };
};

