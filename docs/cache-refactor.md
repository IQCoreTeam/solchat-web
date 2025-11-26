# Cache Refactor Plan

This document captures the architecture goals and implementation sequence for the upcoming chat cache overhaul so future contributors can work through it without relying on prior context.

## Goals

1. **Room-scoped cache object** – Each room maintains `{ txs: string[]; messages: Record<signature, { id; text; sender; timestamp }> }`.
2. **Fast entry path** – Entering a room fetches only the latest 100 transaction signatures via a single RPC call and immediately renders whatever messages are already cached.
3. **Diff + queue** – Compare those 100 signatures against the cache, enqueue only the missing ones, and let the queue drive tx→message decoding.
4. **Throttle-aware processing** – Run the queue through the existing RPC throttle helpers (default RPC: 1 tx/sec, custom RPC: up to 8 tx/sec).
5. **Incremental fill** – Each decoded message updates the cache so the UI naturally fills in message bubbles over time.
6. **Simple gap handling** – Rely on signature comparison rather than complex range tracking. If a user scrolls past the cached window and history still exists, trigger another 100-signature fetch starting from the oldest cached signature.
7. **UX feedback** – Surface a lightweight “sync in progress” indicator while the queue drains; deeper prioritization (e.g., viewport-adjacent messages first) can happen afterward.

## Current State

- `lib/cache/db.ts` exposes an IndexedDB wrapper named `CacheDB`. Stores today:
  - `messages` store keyed by message ID with assorted metadata (`file`, `displayName`, etc.).
  - `transactions`, `signatures`, `metadata` stores for future use.
- `lib/cache/cache-manager.ts` wraps `CacheDB` via helpers in `lib/cache/message-cache.ts` and currently operates on full message arrays per room.
- `lib/onchainDB/web/cached-reader-integration.ts` is the main consumer, so `ChatClient` ultimately just calls `readRowsByTable` and receives all messages at once.

## Planned Storage Changes

1. **Rename the storage file/class** – e.g., `lib/cache/room-cache-store.ts` exporting `RoomCacheStore` (instead of `db.ts`/`CacheDB`) to avoid confusion with real databases.
2. **Schema adjustments**:
   - Keep the existing `messages` store but trim `CachedMessage` down to `{ id, roomId, text, sender, timestamp, signature?, cachedAt, expiresAt? }`.
   - Add support for persisting the per-room signature list (options: dedicated `roomState` store or store-per-room documents). Exact shape TBD but must support quick lookups for “is signature cached?”.
   - Retain `expiresAt` for optional TTL policies, even if message entries themselves are minimal.
3. **API updates** – Expose helpers such as `getRoomCache(roomId)`, `updateRoomMessages(roomId, updates)`, `setRoomSignatures(roomId, sigs)`, etc.

## Loader & Queue Module

1. Build a dedicated loader (e.g., `lib/cache/room-loader.ts`) that:
   - Fetches the latest 100 signatures for a room.
   - Diffs them against the stored signature set.
   - Pushes missing signatures to a queue.
2. The queue should:
   - Pull one signature at a time (or batches) and use `runWithRpcRateLimit`/`lib/onchainDB/web/rpc-throttle` for pacing.
   - Decode each transaction into `{ id, text, sender, timestamp }`.
   - Write results into the message cache immediately.
3. Emit progress events or allow callers to subscribe so the UI/CacheManager knows when “sync in progress” should display.

## CacheManager & Reader Integration

1. Update `CacheManager` to depend on the new storage + loader instead of bulk `loadMessagesWithCache`.
2. Replace `loadRoomMessages` so it:
   - Returns cached messages instantly.
   - Triggers the loader to fetch/diff/queue in the background.
   - Provides status flags (`fromCache`, `refreshing`, `syncing`) for UI consumption.
3. `cached-reader-integration.ts` should keep the same API but internally rely on `CacheManager`’s new flow so downstream components (e.g., `ChatClient`, friends list) benefit automatically.

## UI Touchpoints

1. Show cached messages immediately (no spinner unless cache empty).
2. While the queue runs, display a subtle “syncing…” indicator in the messages list or header.
3. Later enhancement (tracked separately): prioritize filling messages around the current viewport and smooth out jumps.

## Migration Considerations

- Version the IndexedDB schema (e.g., bump `DB_VERSION` and migrate/remap to the new stores). For simplicity, a full cache wipe during migration is acceptable; the queue-based backfill will refill data quickly.
- Ensure SSR/Node contexts continue to no-op gracefully when IndexedDB is unavailable.

## Implementation Order

1. Rename the storage layer (`db.ts` → `room-cache-store.ts`, `CacheDB` → `RoomCacheStore`) and update exports/imports.
2. Adjust the schema + helper APIs to represent `{ txs; messages }` per room with lean message entries.
3. Implement the 100-signature loader and queue backed by the existing RPC throttle utilities.
4. Rewire `CacheManager` and `cached-reader-integration` to the new loader.
5. Add the UI “sync in progress” signal plus docs/tests as needed.

These steps mirror the TODO inside `CacheManager` but provide fuller context so any engineer can execute the refactor end-to-end.
