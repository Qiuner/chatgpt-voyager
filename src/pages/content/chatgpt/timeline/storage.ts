/**
 * @module pages/content/chatgpt/timeline/storage.ts
 * 职责：封装时间轴本地存储读写与开关监听。
 * 主要导出：本文件导出的 stars 与 timeline enabled 存储 API。
 */
/**
 * storage.ts
 * ChatGPT 时间轴的本地存储封装：stars(localStorage) 与开关(chrome.storage)。
 * Created: 2026-03-13
 */

type TimelineProviders = {
  chatgpt?: boolean;
  [key: string]: unknown;
};

const starsKey = (conversationId: string) => `chatgptTimelineStars:${conversationId}`;

export const getStars = (conversationId: string): string[] => {
  const cid = String(conversationId || '');
  if (!cid) return [];

  try {
    const raw = localStorage.getItem(starsKey(cid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x));
  } catch {
    return [];
  }
};

export const setStars = (conversationId: string, ids: string[]): void => {
  const cid = String(conversationId || '');
  if (!cid) return;

  try {
    localStorage.setItem(starsKey(cid), JSON.stringify((ids || []).map((x) => String(x))));
  } catch {
    // noop
  }
};

export const onStarsChange = (
  conversationId: string,
  cb: (ids: string[]) => void,
): (() => void) => {
  const cid = String(conversationId || '');
  if (!cid) return () => {};

  const expectedKey = starsKey(cid);

  const handler = (e: StorageEvent) => {
    try {
      if (!e || e.storageArea !== localStorage) return;
      if (e.key !== expectedKey) return;
      let nextArr: unknown = [];
      try {
        nextArr = JSON.parse(e.newValue || '[]');
      } catch {
        nextArr = [];
      }
      const ids = Array.isArray(nextArr) ? nextArr.map((x) => String(x)) : [];
      cb(ids);
    } catch {
      // noop
    }
  };

  try {
    window.addEventListener('storage', handler);
  } catch {
    return () => {};
  }

  return () => {
    try {
      window.removeEventListener('storage', handler);
    } catch {
      // noop
    }
  };
};

export const getTimelineEnabled = async (): Promise<boolean> => {
  const storageApi = chrome?.storage?.local;
  if (!storageApi) return true;

  return await new Promise<boolean>((resolve) => {
    try {
      storageApi.get({ timelineActive: true, timelineProviders: {} }, (res) => {
        try {
          const timelineActive = Boolean((res as { timelineActive?: unknown }).timelineActive);
          const providers = (res as { timelineProviders?: TimelineProviders }).timelineProviders ?? {};
          const providerEnabled =
            typeof providers.chatgpt === 'boolean' ? providers.chatgpt : true;
          resolve(timelineActive && providerEnabled);
        } catch {
          resolve(true);
        }
      });
    } catch {
      resolve(true);
    }
  });
};

export const onTimelineEnabledChange = (cb: (enabled: boolean) => void): (() => void) => {
  const storageApi = chrome?.storage;
  if (!storageApi?.onChanged) return () => {};

  let timelineActive = true;
  let providerEnabled = true;

  try {
    chrome?.storage?.local?.get({ timelineActive: true, timelineProviders: {} }, (res) => {
      try {
        timelineActive = Boolean((res as { timelineActive?: unknown }).timelineActive);
      } catch {
        timelineActive = true;
      }
      try {
        const providers = (res as { timelineProviders?: TimelineProviders }).timelineProviders ?? {};
        providerEnabled = typeof providers.chatgpt === 'boolean' ? providers.chatgpt : true;
      } catch {
        providerEnabled = true;
      }
    });
  } catch {
    // noop
  }

  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string,
  ) => {
    if (areaName !== 'local' || !changes) return;

    let changed = false;

    if ('timelineActive' in changes) {
      try {
        timelineActive = Boolean(changes.timelineActive.newValue);
      } catch {
        timelineActive = true;
      }
      changed = true;
    }

    if ('timelineProviders' in changes) {
      try {
        const providers = (changes.timelineProviders.newValue || {}) as TimelineProviders;
        providerEnabled = typeof providers.chatgpt === 'boolean' ? providers.chatgpt : true;
      } catch {
        providerEnabled = true;
      }
      changed = true;
    }

    if (!changed) return;
    cb(Boolean(timelineActive && providerEnabled));
  };

  try {
    storageApi.onChanged.addListener(listener);
  } catch {
    return () => {};
  }

  return () => {
    try {
      storageApi.onChanged.removeListener(listener);
    } catch {
      // noop
    }
  };
};
