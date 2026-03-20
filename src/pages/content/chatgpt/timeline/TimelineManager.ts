/**
 * TimelineManager.ts
 * ChatGPT 时间轴编排层：维护状态并接线 rendering/interaction/core 三个模块。
 * Created: 2026-03-13
 */

import {
  TURN_ARTICLE_SELECTOR,
  USER_TURN_ARTICLE_SELECTOR,
  createObserversController,
  debounce,
  findScrollContainer,
  perfEnd,
  perfStart,
  waitForElement,
} from './core';
import type { Marker, VisibleRange } from './types';
import { buildMarkers, computeGeometry, createTimelineUI, removeTimelineUI, renderVirtualDots } from './rendering';
import {
  createActiveByScrollController,
  createScrollSync,
  createSliderController,
  createStarsController,
  createTooltipController,
} from './interaction';

export class TimelineManager {
  private scrollContainer: HTMLElement | null = null;
  private conversationContainer: HTMLElement | null = null;

  private markers: Marker[] = [];
  private markerMap = new Map<string, Marker>();
  private activeTurnId: string | null = null;

  private ui: ReturnType<typeof createTimelineUI>['ui'] | null = null;
  private measure: ReturnType<typeof createTimelineUI>['measure'] | null = null;

  private contentHeight = 0;
  private yPositions: number[] = [];
  private visibleRange: VisibleRange = { start: 0, end: -1 };
  private firstUserTurnOffset = 0;
  private contentSpanPx = 1;
  private usePixelTop = false;
  private cssVarTopSupported: boolean | null = null;

  private isScrolling = false;
  private sliderDraggingRef = { value: false };

  private tooltip: ReturnType<typeof createTooltipController> | null = null;
  private slider: ReturnType<typeof createSliderController> | null = null;
  private scrollSync: ReturnType<typeof createScrollSync> | null = null;
  private activeByScroll: ReturnType<typeof createActiveByScrollController> | null = null;
  private stars: ReturnType<typeof createStarsController> | null = null;
  private observers: ReturnType<typeof createObserversController> | null = null;

  private debugPerf = false;
  private conversationId: string | null = null;

  private debouncedRecalculateAndRender = debounce(() => this.recalculateAndRenderMarkers(), 350);

  private onTimelineBarClick: ((e: MouseEvent) => void) | null = null;
  private onScroll: (() => void) | null = null;
  private onTimelineBarOver: ((e: MouseEvent) => void) | null = null;
  private onTimelineBarOut: ((e: MouseEvent) => void) | null = null;
  private onTimelineBarFocusIn: ((e: FocusEvent) => void) | null = null;
  private onTimelineBarFocusOut: ((e: FocusEvent) => void) | null = null;
  private onWindowResize: (() => void) | null = null;
  private onTimelineWheel: ((e: WheelEvent) => void) | null = null;
  private onVisualViewportResize: (() => void) | null = null;
  private onPointerDown: ((e: PointerEvent) => void) | null = null;
  private onPointerMove: ((e: PointerEvent) => void) | null = null;
  private onPointerUp: (() => void) | null = null;
  private onPointerCancel: (() => void) | null = null;
  private onPointerLeave: ((e: PointerEvent) => void) | null = null;
  private onBarEnter: (() => void) | null = null;
  private onBarLeave: (() => void) | null = null;
  private onSliderEnter: (() => void) | null = null;
  private onSliderLeave: (() => void) | null = null;

  private zeroTurnsTimer: number | null = null;

  private longPressDuration = 550;
  private longPressMoveTolerance = 6;
  private longPressTimer: number | null = null;
  private longPressTriggered = false;
  private pressStartPos: { x: number; y: number } | null = null;
  private pressTargetDot: HTMLButtonElement | null = null;
  private suppressClickUntil = 0;

  public constructor() {
    try {
      this.debugPerf = localStorage.getItem('chatgptTimelineDebugPerf') === '1';
    } catch {}
    this.conversationId = this.extractConversationIdFromPath(location.pathname);
  }

  public async init(): Promise<void> {
    const elementsFound = await this.findCriticalElements();
    if (!elementsFound) return;

    const { ui, measure } = createTimelineUI();
    this.ui = ui;
    this.measure = measure;

    this.conversationId = this.extractConversationIdFromPath(location.pathname);
    this.stars = createStarsController({
      conversationId: this.conversationId,
      markersRef: { get: () => this.markers },
      markerMapRef: { get: () => this.markerMap },
      onTooltipMaybeRefresh: (dot) => this.tooltip?.refresh(dot),
      getHoveredOrFocusedDot: () => this.getHoveredOrFocusedDot(),
    });

    this.tooltip = createTooltipController({
      tooltipEl: ui.tooltip,
      measureEl: measure.measureEl,
      isStarred: (turnId) => Boolean(this.stars?.has(turnId)),
    });

    this.slider = createSliderController({
      sliderEl: ui.slider,
      handleEl: ui.sliderHandle,
      timelineBarEl: ui.timelineBar,
      trackEl: ui.track,
      getTrackPadding: () => this.getTrackPadding(),
      getContentHeight: () => this.contentHeight,
      isDraggingRef: this.sliderDraggingRef,
      onTrackScrollBySlider: () => this.handleTrackScrollBySlider(),
    });

    this.activeByScroll = createActiveByScrollController({
      getScrollContainer: () => this.scrollContainer,
      getMarkers: () => this.markers,
      getActiveTurnId: () => this.activeTurnId,
      onActiveChange: (nextActiveId) => {
        this.activeTurnId = nextActiveId;
        this.updateActiveDotUI();
      },
    });

    this.scrollSync = createScrollSync({
      onFrame: () => {
        this.syncTimelineTrackToMain();
        this.updateVirtualRangeAndRender();
        this.activeByScroll?.compute();
        this.slider?.update();
      },
    });

    this.setupEventListeners();
    this.setupObservers();

    this.conversationId = this.extractConversationIdFromPath(location.pathname);
    this.stars?.setConversationId(this.conversationId);

    try {
      this.recalculateAndRenderMarkers();
    } catch {}
  }

  private async findCriticalElements(): Promise<boolean> {
    const firstTurn = await waitForElement<HTMLElement>(TURN_ARTICLE_SELECTOR);
    if (!firstTurn) return false;

    this.conversationContainer = firstTurn.parentElement as HTMLElement | null;
    if (!this.conversationContainer) return false;

    this.scrollContainer = findScrollContainer(this.conversationContainer);
    return Boolean(this.scrollContainer);
  }

  private getTrackPadding() {
    const bar = this.ui?.timelineBar;
    if (!bar) return 12;
    const v = getComputedStyle(bar).getPropertyValue('--timeline-track-padding').trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 12;
  }

  private recalculateAndRenderMarkers() {
    perfStart(this.debugPerf, 'recalc');
    const conversationContainer = this.conversationContainer;
    const ui = this.ui;
    if (!conversationContainer || !ui || !this.scrollContainer) return;

    const userTurnElements = conversationContainer.querySelectorAll<HTMLElement>(USER_TURN_ARTICLE_SELECTOR);
    this.visibleRange = { start: 0, end: -1 };

    if (userTurnElements.length === 0) {
      if (this.zeroTurnsTimer === null) {
        this.zeroTurnsTimer = window.setTimeout(() => {
          this.zeroTurnsTimer = null;
          this.recalculateAndRenderMarkers();
        }, 350);
      }
      return;
    }

    if (this.zeroTurnsTimer !== null) {
      try {
        window.clearTimeout(this.zeroTurnsTimer);
      } catch {}
      this.zeroTurnsTimer = null;
    }

    (ui.trackContent || ui.timelineBar).querySelectorAll('.timeline-dot').forEach((n) => n.remove());
    this.markers.forEach((m) => {
      m.dotElement = null;
    });

    const built = buildMarkers({
      userTurnElements: Array.from(userTurnElements),
      starred: new Set<string>(),
    });
    this.markers = built.markers;
    this.markerMap = built.markerMap;
    this.firstUserTurnOffset = built.firstUserTurnOffset;
    this.contentSpanPx = built.contentSpanPx;

    this.stars?.applyStarStateToMarkers();

    const g = computeGeometry({
      timelineBarEl: ui.timelineBar,
      trackContentEl: ui.trackContent,
      markers: this.markers,
      cssVarTopSupported: this.cssVarTopSupported,
    });
    this.contentHeight = g.contentHeight;
    this.yPositions = g.yPositions;
    this.usePixelTop = g.usePixelTop;
    this.cssVarTopSupported = g.cssVarTopSupported;

    if (!this.activeTurnId && this.markers.length > 0) {
      this.activeTurnId = this.markers[this.markers.length - 1].id;
    }

    this.syncTimelineTrackToMain();
    this.updateVirtualRangeAndRender();
    this.updateActiveDotUI();
    this.scrollSync?.schedule();
    perfEnd(this.debugPerf, 'recalc');
  }

  private recalculateGeometryAndRender() {
    const ui = this.ui;
    if (!ui) return;
    if (this.markers.length === 0) return;

    const g = computeGeometry({
      timelineBarEl: ui.timelineBar,
      trackContentEl: ui.trackContent,
      markers: this.markers,
      cssVarTopSupported: this.cssVarTopSupported,
    });
    this.contentHeight = g.contentHeight;
    this.yPositions = g.yPositions;
    this.usePixelTop = g.usePixelTop;
    this.cssVarTopSupported = g.cssVarTopSupported;

    this.syncTimelineTrackToMain();
    this.updateVirtualRangeAndRender();
    this.tooltip?.repositionIfVisible(ui.timelineBar);
    this.slider?.update();
  }

  private syncTimelineTrackToMain() {
    if (this.sliderDraggingRef.value) return;
    const ui = this.ui;
    const scrollContainer = this.scrollContainer;
    if (!ui || !scrollContainer || !this.contentHeight) return;

    const scrollTop = scrollContainer.scrollTop;
    const ref = scrollTop + scrollContainer.clientHeight * 0.45;
    const span = Math.max(1, this.contentSpanPx || 1);
    const r = Math.max(0, Math.min(1, (ref - (this.firstUserTurnOffset || 0)) / span));
    const maxScroll = Math.max(0, this.contentHeight - (ui.track.clientHeight || 0));
    const target = Math.round(r * maxScroll);
    if (Math.abs((ui.track.scrollTop || 0) - target) > 1) ui.track.scrollTop = target;
  }

  private updateVirtualRangeAndRender() {
    const ui = this.ui;
    if (!ui) return;
    if (this.markers.length === 0) return;

    const out = renderVirtualDots({
      trackEl: ui.track,
      trackContentEl: ui.trackContent,
      timelineBarEl: ui.timelineBar,
      markers: this.markers,
      yPositions: this.yPositions,
      usePixelTop: this.usePixelTop,
      activeTurnId: this.activeTurnId,
      visibleRange: this.visibleRange,
    });
    this.visibleRange = out.visibleRange;
  }

  private updateActiveDotUI() {
    const activeId = this.activeTurnId;
    for (const marker of this.markers) {
      try {
        marker.dotElement?.classList.toggle('active', marker.id === activeId);
      } catch {}
    }
  }

  private setupObservers() {
    const ui = this.ui;
    if (!ui) return;

    this.observers = createObserversController({
      getConversationContainer: () => this.conversationContainer,
      getScrollContainer: () => this.scrollContainer,
      timelineBarEl: ui.timelineBar,
      onMutate: () => this.debouncedRecalculateAndRender(),
      onResize: () => this.recalculateGeometryAndRender(),
      onThemeChange: () => this.recalculateGeometryAndRender(),
      onIntersectionChange: () => this.scrollSync?.schedule(),
      onRebind: (nextConversationContainer, nextScrollContainer) => {
        this.handleContainerRebind(nextConversationContainer, nextScrollContainer);
      },
    });
    this.observers.start();
  }

  private handleContainerRebind(
    nextConversationContainer: HTMLElement,
    nextScrollContainer: HTMLElement | null,
  ) {
    if (this.scrollContainer && this.onScroll) {
      try {
        this.scrollContainer.removeEventListener('scroll', this.onScroll);
      } catch {}
    }

    this.conversationContainer = nextConversationContainer;
    this.scrollContainer = nextScrollContainer || findScrollContainer(nextConversationContainer);

    if (this.scrollContainer) {
      this.onScroll = () => this.scrollSync?.schedule();
      try {
        this.scrollContainer.addEventListener('scroll', this.onScroll, { passive: true });
      } catch {}
    }

    this.observers?.reobserve();
    try {
      this.recalculateAndRenderMarkers();
    } catch {}
  }

  private setupEventListeners() {
    const ui = this.ui;
    if (!ui || !this.scrollContainer || !this.conversationContainer) return;

    this.onTimelineBarClick = (e) => {
      const dot = (e.target as HTMLElement | null)?.closest?.('.timeline-dot') as HTMLButtonElement | null;
      if (!dot) return;

      const now = Date.now();
      if (now < (this.suppressClickUntil || 0)) {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch {}
        return;
      }

      const targetId = String(dot.dataset.targetTurnId || '');
      const targetElement = this.conversationContainer?.querySelector(
        `section[data-turn-id="${targetId}"]`,
      ) as HTMLElement | null;
      if (targetElement) this.smoothScrollTo(targetElement);
    };
    ui.timelineBar.addEventListener('click', this.onTimelineBarClick);

    this.onPointerDown = (ev) => {
      const dot = (ev.target as HTMLElement | null)?.closest?.('.timeline-dot') as HTMLButtonElement | null;
      if (!dot) return;
      if (typeof ev.button === 'number' && ev.button !== 0) return;

      this.cancelLongPress();
      this.pressTargetDot = dot;
      this.pressStartPos = { x: ev.clientX, y: ev.clientY };
      try {
        dot.classList.add('holding');
      } catch {}
      this.longPressTriggered = false;

      this.longPressTimer = window.setTimeout(() => {
        this.longPressTimer = null;
        if (!this.pressTargetDot) return;
        const id = String(this.pressTargetDot.dataset.targetTurnId || '');
        this.stars?.toggle(id);
        this.longPressTriggered = true;
        this.suppressClickUntil = Date.now() + 350;
        try {
          this.tooltip?.refresh(this.pressTargetDot);
        } catch {}
        try {
          this.pressTargetDot.classList.remove('holding');
        } catch {}
      }, this.longPressDuration);
    };

    this.onPointerMove = (ev) => {
      if (!this.pressTargetDot || !this.pressStartPos) return;
      const dx = ev.clientX - this.pressStartPos.x;
      const dy = ev.clientY - this.pressStartPos.y;
      if (dx * dx + dy * dy > this.longPressMoveTolerance * this.longPressMoveTolerance) {
        this.cancelLongPress();
      }
    };

    this.onPointerUp = () => this.cancelLongPress();
    this.onPointerCancel = () => this.cancelLongPress();
    this.onPointerLeave = (ev) => {
      const dot = (ev.target as HTMLElement | null)?.closest?.('.timeline-dot') as HTMLButtonElement | null;
      if (dot && dot === this.pressTargetDot) this.cancelLongPress();
    };

    try {
      ui.timelineBar.addEventListener('pointerdown', this.onPointerDown);
      window.addEventListener('pointermove', this.onPointerMove, { passive: true });
      window.addEventListener('pointerup', this.onPointerUp, { passive: true });
      window.addEventListener('pointercancel', this.onPointerCancel, { passive: true });
      ui.timelineBar.addEventListener('pointerleave', this.onPointerLeave);
    } catch {}

    this.onScroll = () => this.scrollSync?.schedule();
    try {
      this.scrollContainer.addEventListener('scroll', this.onScroll, { passive: true });
    } catch {}

    this.onTimelineBarOver = (e) => {
      const dot = (e.target as HTMLElement | null)?.closest?.('.timeline-dot') as HTMLButtonElement | null;
      if (dot) this.tooltip?.show(dot);
    };

    this.onTimelineBarOut = (e) => {
      const fromDot = (e.target as HTMLElement | null)?.closest?.('.timeline-dot');
      const toDot = (e.relatedTarget as HTMLElement | null)?.closest?.('.timeline-dot');
      if (fromDot && !toDot) this.tooltip?.hide();
    };

    this.onTimelineBarFocusIn = (e) => {
      const dot = (e.target as HTMLElement | null)?.closest?.('.timeline-dot') as HTMLButtonElement | null;
      if (dot) this.tooltip?.show(dot);
    };

    this.onTimelineBarFocusOut = (e) => {
      const dot = (e.target as HTMLElement | null)?.closest?.('.timeline-dot');
      if (dot) this.tooltip?.hide();
    };

    ui.timelineBar.addEventListener('mouseover', this.onTimelineBarOver);
    ui.timelineBar.addEventListener('mouseout', this.onTimelineBarOut);
    ui.timelineBar.addEventListener('focusin', this.onTimelineBarFocusIn);
    ui.timelineBar.addEventListener('focusout', this.onTimelineBarFocusOut);

    this.onBarEnter = () => this.slider?.show();
    this.onBarLeave = () => this.slider?.hideDeferred();
    this.onSliderEnter = () => this.slider?.show();
    this.onSliderLeave = () => this.slider?.hideDeferred();

    try {
      ui.timelineBar.addEventListener('pointerenter', this.onBarEnter);
      ui.timelineBar.addEventListener('pointerleave', this.onBarLeave);
      ui.slider.addEventListener('pointerenter', this.onSliderEnter);
      ui.slider.addEventListener('pointerleave', this.onSliderLeave);
    } catch {}

    this.onWindowResize = () => {
      this.recalculateGeometryAndRender();
    };
    window.addEventListener('resize', this.onWindowResize);

    if (window.visualViewport) {
      this.onVisualViewportResize = () => {
        this.recalculateGeometryAndRender();
      };
      try {
        window.visualViewport.addEventListener('resize', this.onVisualViewportResize);
      } catch {}
    }

    this.onTimelineWheel = (e) => {
      try {
        e.preventDefault();
      } catch {}
      const delta = e.deltaY || 0;
      if (this.scrollContainer) this.scrollContainer.scrollTop += delta;
      this.scrollSync?.schedule();
      this.slider?.show();
    };
    ui.timelineBar.addEventListener('wheel', this.onTimelineWheel, { passive: false });
  }

  private handleTrackScrollBySlider() {
    this.scrollSync?.schedule();
    this.slider?.show();
  }

  private getHoveredOrFocusedDot() {
    const bar = this.ui?.timelineBar;
    if (!bar) return null;
    return bar.querySelector('.timeline-dot:hover, .timeline-dot:focus') as HTMLButtonElement | null;
  }

  private cancelLongPress() {
    if (this.longPressTimer !== null) {
      try {
        window.clearTimeout(this.longPressTimer);
      } catch {}
      this.longPressTimer = null;
    }
    if (this.pressTargetDot) {
      try {
        this.pressTargetDot.classList.remove('holding');
      } catch {}
    }
    this.pressTargetDot = null;
    this.pressStartPos = null;
    this.longPressTriggered = false;
  }

  private smoothScrollTo(targetElement: HTMLElement, duration = 600) {
    const scrollContainer = this.scrollContainer;
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    const targetPosition = targetRect.top - containerRect.top + scrollContainer.scrollTop;
    const startPosition = scrollContainer.scrollTop;
    const distance = targetPosition - startPosition;
    let startTime: number | null = null;

    const animation = (currentTime: number) => {
      this.isScrolling = true;
      if (startTime === null) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const run = this.easeInOutQuad(timeElapsed, startPosition, distance, duration);
      scrollContainer.scrollTop = run;
      if (timeElapsed < duration) {
        requestAnimationFrame(animation);
      } else {
        scrollContainer.scrollTop = targetPosition;
        this.isScrolling = false;
      }
    };

    requestAnimationFrame(animation);
  }

  private easeInOutQuad(t: number, b: number, c: number, d: number) {
    let tt = t / (d / 2);
    if (tt < 1) return (c / 2) * tt * tt + b;
    tt--;
    return (-c / 2) * (tt * (tt - 2) - 1) + b;
  }

  private extractConversationIdFromPath(pathname: string) {
    try {
      const segs = pathname.split('/').filter(Boolean);
      const i = segs.indexOf('c');
      if (i === -1) return null;
      const slug = segs[i + 1];
      if (typeof slug !== 'string' || !slug) return null;
      if (!/^[A-Za-z0-9_-]+$/.test(slug)) return null;
      return slug;
    } catch {
      return null;
    }
  }

  public destroy() {
    try {
      this.observers?.destroy();
    } catch {}
    this.observers = null;

    try {
      this.scrollSync?.destroy();
    } catch {}
    this.scrollSync = null;

    try {
      this.tooltip?.destroy();
    } catch {}
    this.tooltip = null;

    try {
      this.slider?.destroy();
    } catch {}
    this.slider = null;

    try {
      this.stars?.destroy();
    } catch {}
    this.stars = null;

    try {
      this.activeByScroll?.destroy();
    } catch {}
    this.activeByScroll = null;

    if (this.ui?.timelineBar && this.onTimelineBarClick) {
      try {
        this.ui.timelineBar.removeEventListener('click', this.onTimelineBarClick);
      } catch {}
    }

    try {
      this.ui?.timelineBar.removeEventListener('pointerdown', this.onPointerDown as EventListener);
    } catch {}
    try {
      window.removeEventListener('pointermove', this.onPointerMove as EventListener);
    } catch {}
    try {
      window.removeEventListener('pointerup', this.onPointerUp as EventListener);
    } catch {}
    try {
      window.removeEventListener('pointercancel', this.onPointerCancel as EventListener);
    } catch {}
    try {
      this.ui?.timelineBar.removeEventListener('pointerleave', this.onPointerLeave as EventListener);
    } catch {}

    if (this.scrollContainer && this.onScroll) {
      try {
        this.scrollContainer.removeEventListener('scroll', this.onScroll);
      } catch {}
    }

    if (this.ui?.timelineBar) {
      try {
        this.ui.timelineBar.removeEventListener('mouseover', this.onTimelineBarOver as EventListener);
      } catch {}
      try {
        this.ui.timelineBar.removeEventListener('mouseout', this.onTimelineBarOut as EventListener);
      } catch {}
      try {
        this.ui.timelineBar.removeEventListener('focusin', this.onTimelineBarFocusIn as EventListener);
      } catch {}
      try {
        this.ui.timelineBar.removeEventListener('focusout', this.onTimelineBarFocusOut as EventListener);
      } catch {}
      try {
        this.ui.timelineBar.removeEventListener('wheel', this.onTimelineWheel as EventListener);
      } catch {}
      try {
        this.ui.timelineBar.removeEventListener('pointerenter', this.onBarEnter as EventListener);
      } catch {}
      try {
        this.ui.timelineBar.removeEventListener('pointerleave', this.onBarLeave as EventListener);
      } catch {}
    }

    try {
      this.ui?.slider.removeEventListener('pointerenter', this.onSliderEnter as EventListener);
    } catch {}
    try {
      this.ui?.slider.removeEventListener('pointerleave', this.onSliderLeave as EventListener);
    } catch {}

    if (this.onWindowResize) {
      try {
        window.removeEventListener('resize', this.onWindowResize);
      } catch {}
    }

    if (this.onVisualViewportResize && window.visualViewport) {
      try {
        window.visualViewport.removeEventListener('resize', this.onVisualViewportResize);
      } catch {}
    }

    if (this.zeroTurnsTimer !== null) {
      try {
        window.clearTimeout(this.zeroTurnsTimer);
      } catch {}
      this.zeroTurnsTimer = null;
    }

    this.cancelLongPress();

    this.markers = [];
    this.markerMap.clear();
    this.activeTurnId = null;

    this.scrollContainer = null;
    this.conversationContainer = null;

    this.ui = null;
    this.measure = null;

    try {
      removeTimelineUI();
    } catch {}
  }
}
