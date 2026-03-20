/**
 * @module pages/content/chatgpt/index.ts
 * 职责：ChatGPT 页面内容脚本入口，负责时间轴与导出功能初始化。
 * 主要导出：无（入口副作用初始化）。
 */
/**
 * index.ts
 * ChatGPT 时间轴 content script 入口：路由检测、初始化/销毁、幂等防重、SPA 导航监听。
 * Created: 2026-03-13
 */

import './style.css';
import { TimelineManager } from './timeline/TimelineManager';
import { initChatGPTExport } from './export';
import {
  TIMELINE_LEFT_SLIDER_SELECTOR,
  TIMELINE_TOOLTIP_ID,
  TURN_ARTICLE_SELECTOR,
} from './timeline/core';
import { getTimelineEnabled, onTimelineEnabledChange } from './timeline/storage';

declare global {
  interface Window {
    __chatgptTimelineInjected?: boolean;
  }
}

if (window.__chatgptTimelineInjected) {
  // HMR / 重复注入保护：同一页面只允许入口执行一次
} else {
  window.__chatgptTimelineInjected = true;

  let timelineManagerInstance: TimelineManager | null = null;
  let exportController: { destroy: () => void } | null = null;
  let currentUrl = location.href;
  let initTimerId: number | null = null;
  let pageObserver: MutationObserver | null = null;
  let routeCheckIntervalId: number | null = null;
  let routeListenersAttached = false;
  let timelineEnabled = true;
  let unsubscribeEnabled: (() => void) | null = null;
  let initialObserver: MutationObserver | null = null;
  let isInitializing = false;

  const VOYAGER_TIMELINE_SELECTOR = '[data-chatgpt-voyager-timeline]';

  const isConversationRoute = (pathname: string = location.pathname) => {
    const segs = pathname.split('/').filter(Boolean);
    const i = segs.indexOf('c');
    if (i === -1) return false;
    const slug = segs[i + 1];
    return typeof slug === 'string' && slug.length > 0 && /^[A-Za-z0-9_-]+$/.test(slug);
  };

  const removeInjectedUI = () => {
    try {
      document.querySelectorAll(VOYAGER_TIMELINE_SELECTOR).forEach((el) => el.remove());
    } catch {
      // noop
    }
    try {
      document.querySelector('.chatgpt-timeline-bar')?.remove();
    } catch {
      // noop
    }
    try {
      document.querySelectorAll(TIMELINE_LEFT_SLIDER_SELECTOR).forEach((el) => el.remove());
    } catch {
      // noop
    }
    try {
      document.getElementById(TIMELINE_TOOLTIP_ID)?.remove();
    } catch {
      // noop
    }
    try {
      document.querySelectorAll(`div[data-chatgpt-timeline-measure="1"]`).forEach((el) => el.remove());
    } catch {
      // noop
    }
  };

  const cleanupGlobalObservers = () => {
    try {
      pageObserver?.disconnect();
    } catch {
      // noop
    }
    pageObserver = null;
  };

  const attachRouteListenersOnce = () => {
    if (routeListenersAttached) return;
    routeListenersAttached = true;
    try {
      window.addEventListener('popstate', handleUrlChange);
    } catch {
      // noop
    }
    try {
      window.addEventListener('hashchange', handleUrlChange);
    } catch {
      // noop
    }
    try {
      routeCheckIntervalId = window.setInterval(() => {
        if (location.href !== currentUrl) handleUrlChange();
      }, 800);
    } catch {
      // noop
    }
  };

  const detachRouteListeners = () => {
    if (!routeListenersAttached) return;
    routeListenersAttached = false;
    try {
      window.removeEventListener('popstate', handleUrlChange);
    } catch {
      // noop
    }
    try {
      window.removeEventListener('hashchange', handleUrlChange);
    } catch {
      // noop
    }
    try {
      if (routeCheckIntervalId) window.clearInterval(routeCheckIntervalId);
    } catch {
      // noop
    }
    routeCheckIntervalId = null;
  };

  const shouldRunOnThisRoute = () => timelineEnabled && isConversationRoute();

  const initializeTimeline = () => {
    if (isInitializing) return;
    isInitializing = true;
    try {
      if (timelineManagerInstance) {
        try {
          timelineManagerInstance.destroy();
        } catch {
          // noop
        }
        timelineManagerInstance = null;
      }

      removeInjectedUI();

      timelineManagerInstance = new TimelineManager();
      void timelineManagerInstance.init().catch((err: any) => {
        try {
          console.error('Timeline initialization failed:', err);
        } catch {
          // noop
        }
      });

      if (exportController) {
        try {
          exportController.destroy();
        } catch {
          // noop
        }
        exportController = null;
      }
      exportController = initChatGPTExport();
    } finally {
      isInitializing = false;
    }
  };

  const ensureInitialObserver = () => {
    if (initialObserver) return;
    initialObserver = new MutationObserver(() => {
      if (!document.querySelector(TURN_ARTICLE_SELECTOR)) return;
      if (shouldRunOnThisRoute()) initializeTimeline();
      try {
        initialObserver?.disconnect();
      } catch {
        // noop
      }
      initialObserver = null;

      pageObserver = new MutationObserver(handleUrlChange);
      try {
        pageObserver.observe(document.body, { childList: true, subtree: true });
      } catch {
        cleanupGlobalObservers();
      }
      attachRouteListenersOnce();
    });
    try {
      initialObserver.observe(document.body, { childList: true, subtree: true });
    } catch {
      try {
        initialObserver.disconnect();
      } catch {
        // noop
      }
      initialObserver = null;
    }
  };

  function handleUrlChange() {
    if (location.href === currentUrl) return;
    currentUrl = location.href;

    try {
      if (initTimerId) window.clearTimeout(initTimerId);
    } catch {
      // noop
    }
    initTimerId = null;

    if (shouldRunOnThisRoute()) {
      initTimerId = window.setTimeout(() => {
        initTimerId = null;
        if (shouldRunOnThisRoute()) initializeTimeline();
      }, 300);
      return;
    }

    if (timelineManagerInstance) {
      try {
        timelineManagerInstance.destroy();
      } catch {
        // noop
      }
      timelineManagerInstance = null;
    }
    if (exportController) {
      try {
        exportController.destroy();
      } catch {
        // noop
      }
      exportController = null;
    }
    removeInjectedUI();
    cleanupGlobalObservers();
  }

  const handleEnabledChanged = (enabled: boolean) => {
    timelineEnabled = enabled;

    const shouldRun = shouldRunOnThisRoute();
    if (!shouldRun) {
      if (timelineManagerInstance) {
        try {
          timelineManagerInstance.destroy();
        } catch {
          // noop
        }
        timelineManagerInstance = null;
      }
      if (exportController) {
        try {
          exportController.destroy();
        } catch {
          // noop
        }
        exportController = null;
      }
      removeInjectedUI();
      cleanupGlobalObservers();
      detachRouteListeners();
      try {
        initialObserver?.disconnect();
      } catch {
        // noop
      }
      initialObserver = null;
      return;
    }

    attachRouteListenersOnce();

    if (document.querySelector(TURN_ARTICLE_SELECTOR)) {
      initializeTimeline();
      if (!pageObserver) {
        pageObserver = new MutationObserver(handleUrlChange);
        try {
          pageObserver.observe(document.body, { childList: true, subtree: true });
        } catch {
          cleanupGlobalObservers();
        }
      }
      return;
    }

    ensureInitialObserver();
  };

  void (async () => {
    timelineEnabled = await getTimelineEnabled();
    unsubscribeEnabled = onTimelineEnabledChange(handleEnabledChanged);

    if (!timelineEnabled) {
      handleEnabledChanged(false);
      return;
    }

    attachRouteListenersOnce();
    if (shouldRunOnThisRoute()) {
      if (document.querySelector(TURN_ARTICLE_SELECTOR)) initializeTimeline();
      else ensureInitialObserver();
    } else {
      ensureInitialObserver();
    }
  })();

  try {
    window.addEventListener('beforeunload', () => {
      try {
        if (initTimerId) window.clearTimeout(initTimerId);
      } catch {
        // noop
      }
      initTimerId = null;

      try {
        initialObserver?.disconnect();
      } catch {
        // noop
      }
      initialObserver = null;

      cleanupGlobalObservers();
      detachRouteListeners();

      try {
        unsubscribeEnabled?.();
      } catch {
        // noop
      }
      unsubscribeEnabled = null;

      if (timelineManagerInstance) {
        try {
          timelineManagerInstance.destroy();
        } catch {
          // noop
        }
        timelineManagerInstance = null;
      }

      removeInjectedUI();
    });
  } catch {
    // noop
  }
}

export {};
