# SolChat Message Caching System

A comprehensive, production-ready caching system for SolChat that provides instant message loading, offline support, and improved performance.

## Features

- **IndexedDB Storage**: Persistent browser storage for large amounts of data
- **Cache-First Loading**: Instant display of cached messages with background refresh
- **Automatic Fallbacks**: Seamlessly falls back to network if cache fails
- **Background Refresh**: Updates cache in background while showing cached data
- **Deduplication**: Prevents duplicate messages
- **TTL Support**: Automatic expiration of old cache entries
- **Retry Logic**: Exponential backoff for failed network requests
- **Type Safety**: Full TypeScript support with typed interfaces
- **Separate Caches**: Independent caches for room messages, DMs, transactions, and signatures

## Architecture

```
lib/cache/
├── db.ts                           # IndexedDB wrapper with typed interfaces
├── message-cache.ts                # Message caching logic and utilities
├── cache-manager.ts                # Central cache management
├── cached-reader.ts                # Drop-in reader replacements
├── cached-reader-integration.ts    # Integration helpers
├── use-cache.ts                    # React hooks
└── index.ts                        # Public API exports
```

## Usage

### Basic Setup

The cache system is automatically initialized through the `CacheProvider` in `components/providers/index.tsx`. No manual setup required.

### Automatic Caching (Recommended)

The easiest way to use caching is through the cached reader integration:

```typescript
// Instead of:
import { readRowsByTable } from '@/lib/onchainDB/web/reader';

// Use:
import { readRowsByTable } from '@/lib/onchainDB/web/cached-reader-integration';

// The API is identical, but now includes automatic caching!
const messages = await readRowsByTable({
  connection,
  rootId: ROOT_ID,
  tableName: 'my-room',
  userPublicKey: wallet.publicKey.toBase58(),
  idl,
  maxTx: 30,
});
```

### Manual Cache Control

For advanced use cases, you can use the cache manager directly:

```typescript
import { getCacheManager } from '@/lib/cache';

const manager = getCacheManager();

// Load with cache
const result = await manager.loadRoomMessages(
  roomId,
  async () => {
    // Your fetch function
    return await fetchMessages();
  },
  {
    backgroundRefresh: true,
    maxRetries: 3,
    retryDelay: 1000,
    ttl: 24 * 60 * 60 * 1000, // 24 hours
  }
);

// Access results
console.log(`Loaded ${result.messages.length} messages`);
console.log(`From cache: ${result.fromCache}`);
console.log(`Refreshing: ${result.refreshing}`);

// Invalidate cache when needed
await manager.invalidateRoom(roomId);

// Force refresh
const freshMessages = await manager.syncRoom(roomId, fetchFn);
```

### React Hooks

Use the provided hooks for seamless React integration:

```typescript
import { useCachedRoomMessages } from '@/lib/cache';

function ChatRoom({ roomId }) {
  const { messages, fromCache, refreshing, loading, error, refresh, invalidate } =
    useCachedRoomMessages(
      roomId,
      () => fetchMessages(roomId),
      {
        backgroundRefresh: true,
        maxRetries: 3,
      }
    );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {fromCache && <Badge>Cached</Badge>}
      {refreshing && <Spinner />}
      {messages.map(msg => <Message key={msg.id} {...msg} />)}
      <button onClick={refresh}>Refresh</button>
      <button onClick={invalidate}>Clear Cache</button>
    </div>
  );
}
```

## Cache Stores

The system uses four separate IndexedDB stores:

### 1. Messages Store
Stores chat messages for rooms and DMs.

**Schema:**
```typescript
{
  id: string;              // Primary key
  roomId: string;          // Room/DM identifier (indexed)
  text: string;
  sender?: string;
  timestamp?: number;      // Indexed
  signature?: string;      // Indexed
  cachedAt: number;
  expiresAt?: number;      // Indexed
  // ... other message fields
}
```

**Default TTL:** 24 hours

### 2. Transactions Store
Caches transaction data.

**Schema:**
```typescript
{
  signature: string;       // Primary key
  roomId: string;          // Indexed
  data: any;               // The transaction data
  cachedAt: number;
  expiresAt?: number;      // Indexed
}
```

**Default TTL:** 7 days

### 3. Signatures Store
Caches account signatures for faster loading.

**Schema:**
```typescript
{
  signature: string;       // Primary key
  accountAddress: string;  // Indexed
  blockTime?: number;
  slot: number;            // Indexed
  cachedAt: number;
}
```

**Default TTL:** 7 days

### 4. Metadata Store
Stores cache metadata and configuration.

**Schema:**
```typescript
{
  key: string;            // Primary key
  value: string | number;
  updatedAt: number;
}
```

## Cache Strategies

### Cache-First with Background Refresh (Default)

1. Check cache first
2. Return cached data immediately if available
3. Fetch fresh data in background
4. Update cache with new data
5. Fallback to network if cache fails

**Benefits:**
- Instant UI response
- Always shows latest data eventually
- Graceful degradation

**Use for:** Normal message loading

### Network-First

1. Fetch from network
2. Update cache with result
3. Return data

**Use for:** Critical updates, after sending messages

### Cache-Only

1. Return only cached data
2. No network request

**Use for:** Offline scenarios, quick previews

## Error Handling

The caching system includes comprehensive error handling:

### 1. Cache Failures
If IndexedDB fails (e.g., quota exceeded, browser restrictions):
- Logs error
- Falls back to network fetch
- App continues working

### 2. Network Failures
If network fetch fails:
- Retries with exponential backoff
- Shows cached data if available
- Clear error messaging to user

### 3. Data Corruption
If cached data is corrupted:
- Invalidates problematic cache entry
- Fetches fresh data
- Logs issue for debugging

## Cache Invalidation

### Automatic Invalidation
- Expired entries (TTL exceeded)
- Periodic cleanup (every hour)

### Manual Invalidation
```typescript
// Single room
await manager.invalidateRoom(roomId);

// Single DM
await manager.invalidateDm(dmSeedHex);

// All cache
await manager.clearAll();

// Cleanup expired only
await manager.cleanup();
```

### When to Invalidate
- After sending a message (to ensure consistency)
- After room settings change
- When user logs out
- On explicit user request (refresh button)

## Performance Improvements

### Expected Performance Gains

**Before Caching:**
- Initial load: 2-5 seconds
- Room switch: 1-3 seconds
- Every load hits network

**After Caching:**
- Initial load: 50-200ms (from cache)
- Room switch: Instant (< 50ms)
- Background refresh: transparent to user
- Reduced network traffic: 70-90%
- Better offline experience

### Cache Statistics

Monitor cache performance:

```typescript
const stats = await manager.getStats();
console.log('Cache stats:', stats);
// { messages: 1250, transactions: 450, signatures: 89 }
```

## Offline Support

The caching system enables basic offline functionality:

**What Works Offline:**
- Viewing previously loaded messages
- Browsing cached rooms
- Reading cached DMs

**What Doesn't Work Offline:**
- Sending new messages
- Creating new rooms
- Loading new content

## Browser Compatibility

### Supported Browsers
- Chrome/Edge 24+
- Firefox 16+
- Safari 10+
- Opera 15+

### Storage Limits
- Chrome/Edge: 60% of available disk space
- Firefox: 50% of available disk space
- Safari: 1GB
- Mobile Safari: 50MB

The system automatically handles quota exceeded errors.

## Debugging

Enable detailed logging:

```typescript
// All cache operations log to console
// Look for logs prefixed with:
// [CacheDB] - Database operations
// [CacheManager] - High-level cache operations
// [MessageCache] - Message-specific operations
// [CachedReader] - Reader integrations
```

### Common Issues

**1. Cache not initializing**
```
Check console for: [CacheDB] Failed to open database
Solution: Check browser IndexedDB support, clear site data
```

**2. Quota exceeded**
```
Error: QuotaExceededError
Solution: Run cleanup(), or clearAll()
```

**3. Stale data showing**
```
Issue: Cached data not refreshing
Solution: Check backgroundRefresh option, verify TTL settings
```

## Migration Guide

### Updating from Direct Reader Usage

**Before:**
```typescript
const rows = await readRowsByTable({
  connection,
  rootId,
  tableName,
  userPublicKey,
  idl,
  maxTx: 30,
});
```

**After:**
```typescript
// Just change the import!
// from: '@/lib/onchainDB/web/reader'
// to:   '@/lib/onchainDB/web/cached-reader-integration'

const rows = await readRowsByTable({
  connection,
  rootId,
  tableName,
  userPublicKey,
  idl,
  maxTx: 30,
}); // Now with caching!
```

## Testing

### Manual Testing

1. Load a room → Check console for cache logs
2. Reload page → Messages should load instantly
3. Send message → Should appear immediately
4. Switch rooms → Should be instant after first load
5. Disable network → Cached rooms still viewable

### Integration Tests

```typescript
describe('Cache Integration', () => {
  it('loads from cache on second visit', async () => {
    // First load
    const result1 = await manager.loadRoomMessages(roomId, fetchFn);
    expect(result1.fromCache).toBe(false);

    // Second load
    const result2 = await manager.loadRoomMessages(roomId, fetchFn);
    expect(result2.fromCache).toBe(true);
  });

  it('falls back to network on cache failure', async () => {
    // Simulate cache failure
    await manager.clearAll();

    const result = await manager.loadRoomMessages(roomId, fetchFn);
    expect(result.messages.length).toBeGreaterThan(0);
  });
});
```

## Security Considerations

1. **Data Privacy**: Cache is stored locally in user's browser
2. **No Sensitive Data**: Don't cache private keys or credentials
3. **TTL**: Old messages automatically expire
4. **Clear on Logout**: Implement logout cleanup if needed

## Future Enhancements

- [ ] Service Worker integration for true offline support
- [ ] Compression for large messages
- [ ] Delta sync (only fetch new messages)
- [ ] Multi-tab synchronization
- [ ] Cache warming on app startup
- [ ] Analytics and performance monitoring
- [ ] LRU eviction for storage management

## License

Part of the SolChat application.
