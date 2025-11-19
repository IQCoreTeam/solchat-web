/**
 * Shared constants for onchain DB operations
 */

import { configs } from '@/lib/onchainDB';

export const ROOT_ID = configs.defaultRootId;

export const MESSAGE_COLUMNS = [
  'id',
  'text',
  'file',
  'sender',
  'displayName',
  'avatarHue',
  'timestamp',
  'status',
  'room',
] as const;
