/**
 * Channel Key Utilities
 * - Common channel/room ID conversion functions
 * - Used by both DM (friends) and Chat (rooms) features
 */

// ============================================================================
// DM Channel Functions (from friends-list.tsx)
// ============================================================================

/**
 * Convert DM seed hex to channel key
 * @example "abc123" → "dm:abc123"
 */
export function makeDmChannelKey(seedHex: string): string {
  return `dm:${seedHex}`;
}

/**
 * Extract DM seed hex from channel key
 * @example "dm:abc123" → "abc123"
 */
export function dmChannelKeyToSeed(channelKey: string): string {
  return channelKey.replace(/^dm:/, '');
}

/**
 * Convert DM room ID to channel key
 * @example "dm:abc123" → "dm:abc123"
 */
export function dmRoomIdToChannelKey(roomId: string): string {
  return `dm:${roomId.replace(/^dm:/, '')}`;
}

// ============================================================================
// Chat Room Functions (from chat-client.tsx)
// ============================================================================

/**
 * Convert room seed hex to channel key
 * @example "xyz789" → "chat:xyz789"
 */
export function makeChannelKey(seedHex: string): string {
  return `chat:${seedHex}`;
}

/**
 * Extract room seed hex from channel key
 * @example "chat:xyz789" → "xyz789"
 */
export function channelKeyToSeed(channelKey: string): string {
  return channelKey.replace(/^chat:/, '');
}

/**
 * Convert room ID to channel key
 * Note: Depends on makeRoomTimestampKey from message-timestamp-cache
 * @example "room:xyz789" → "chat:xyz789"
 */
export function roomIdToChannelKey(roomId: string): string {
  return `chat:${roomId.replace(/^room:/, '')}`;
}
