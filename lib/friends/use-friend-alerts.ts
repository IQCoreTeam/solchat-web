import { useCallback, useEffect, useRef, useState } from 'react';
import type { Friend } from '@/lib/friends/types';
import { shortenAddress } from '@/lib/friends/utils';
import { getLastMessageTimestamp, makeDmTimestampKey } from '@/lib/cache/message-timestamp-cache';

type UseFriendAlertsOptions = {
  friends: Friend[];
  chatOpen: boolean;
  activeChatSeedHex: string | null;
};

export function useFriendAlerts({
  friends,
  chatOpen,
  activeChatSeedHex,
}: UseFriendAlertsOptions) {
  const [friendTimestamps, setFriendTimestamps] = useState<Record<string, number>>({});
  const [dmAlerts, setDmAlerts] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setFriendTimestamps((prev) => {
      const next: Record<string, number> = { ...prev };
      friends.forEach((friend) => {
        if (!friend.dmSeedHex) return;
        const candidate = friend.lastTimestamp ?? 0;
        if (!(friend.dmSeedHex in next) || candidate > next[friend.dmSeedHex]) {
          next[friend.dmSeedHex] = candidate;
        }
      });
      // Remove entries for friends that no longer exist
      Object.keys(next).forEach((key) => {
        if (!friends.some((friend) => friend.dmSeedHex === key)) {
          delete next[key];
        }
      });
      return next;
    });
  }, [friends]);

  useEffect(() => {
    const alerts: Record<string, boolean> = {};
    friends.forEach((friend) => {
      if (!friend.dmSeedHex) return;
      const latest = friendTimestamps[friend.dmSeedHex] ?? friend.lastTimestamp ?? 0;
      const cached = getLastMessageTimestamp(makeDmTimestampKey(friend.dmSeedHex)) ?? 0;
      alerts[friend.dmSeedHex] = Boolean(latest && latest > cached);
    });
    setDmAlerts(alerts);
  }, [friends, friendTimestamps]);

  const showToast = useCallback((text: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(text);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 1000);
  }, []);

  useEffect(() => {
    for (const friend of friends) {
      if (chatOpen && activeChatSeedHex === friend.dmSeedHex) continue;
      if (!friend.dmSeedHex) continue;
      const latest = friendTimestamps[friend.dmSeedHex] ?? friend.lastTimestamp ?? 0;
      const cached = getLastMessageTimestamp(makeDmTimestampKey(friend.dmSeedHex)) ?? 0;
      if (latest && latest > cached) {
        const label = shortenAddress(friend.address, 6);
        showToast(`New message available from ${label}`);
        break;
      }
    }
  }, [friends, friendTimestamps, showToast, chatOpen, activeChatSeedHex]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  return {
    friendTimestamps,
    setFriendTimestamps,
    dmAlerts,
    setDmAlerts,
    toastMessage,
    showToast,
  };
}
