import { useCallback } from 'react';
import type { RefObject } from 'react';

type ScrollTrackerOptions = {
  listRef: RefObject<HTMLElement | null>;
  isAtBottomRef: RefObject<boolean>;
  setUiIsAtBottom: (isAtBottom: boolean) => void;
  selectedChannelKey: string | null;
  clearMarker: (channelKey: string | null) => void;
  markerClearTimeoutRef: RefObject<NodeJS.Timeout | null>;
  markerElRef?: RefObject<HTMLElement | null>;
  onMarkRead?: (channelKey: string) => void;
  onNearTop?: (channelKey: string) => void | Promise<void>;
};

export function useScrollTracker({
  listRef,
  isAtBottomRef,
  setUiIsAtBottom,
  selectedChannelKey,
  clearMarker,
  markerClearTimeoutRef,
  markerElRef,
  onMarkRead,
  onNearTop,
}: ScrollTrackerOptions) {
  const updateIsAtBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const threshold = 80;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < threshold;
    isAtBottomRef.current = atBottom;
    setUiIsAtBottom(atBottom);
    if (atBottom) {
      // hasNewMessages is now derived, no need to set
      if (selectedChannelKey && onMarkRead) {
        onMarkRead(selectedChannelKey);
      }
      if (markerClearTimeoutRef.current) {
        clearTimeout(markerClearTimeoutRef.current);
      }
      markerClearTimeoutRef.current = setTimeout(() => {
        if (selectedChannelKey) {
          clearMarker(selectedChannelKey);
        }
        markerClearTimeoutRef.current = null;
      }, 250);
    }

    if (markerElRef) {
      const markerEl = markerElRef.current;
      if (markerEl) {
        const markerRect = markerEl.getBoundingClientRect();
        const listRect = el.getBoundingClientRect();
        const markerVisible = markerRect.top >= listRect.top && markerRect.top <= listRect.bottom;
        const markerAbove = markerRect.top < listRect.top;
        if (markerVisible || markerAbove) {
          if (selectedChannelKey) {
            clearMarker(selectedChannelKey);
          }
          markerElRef.current = null;
        }
      }
    }

    if (onNearTop) {
      const nearTop = el.scrollTop < 120;
      if (nearTop && selectedChannelKey) {
        void onNearTop(selectedChannelKey);
      }
    }
  }, [
    clearMarker,
    isAtBottomRef,
    listRef,
    markerClearTimeoutRef,
    markerElRef,
    onMarkRead,
    onNearTop,
    selectedChannelKey,
    setUiIsAtBottom,
  ]);

  return { updateIsAtBottom };
}
