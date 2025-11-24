/**
 * Friends Feature Types
 * - Clean type definitions for the friends/DM system
 */

export type FriendStatus = 'pending' | 'approved' | 'blocked';

export interface Friend {
  /** Friend's wallet address */
  address: string;
  /** Current relationship status */
  status: FriendStatus;
  /** Who initiated the request (0 or 1) */
  requester: number;
  /** Who blocked (if any) (0, 1, or 255) */
  blocker: number;
  /** DM seed as Uint8Array */
  dmSeed: Uint8Array;
  /** DM seed as hex string */
  dmSeedHex: string;
  /** DMTable PDA address */
  tableAddress: string;
  /** Party A wallet */
  partyA: string;
  /** Party B wallet */
  partyB: string;
  /** Optional display name */
  name?: string;
  /** Last timestamp tracked on-chain */
  lastTimestamp?: number;
}

export const DM_STATUS = {
  PENDING: 0,
  APPROVED: 1,
  BLOCKED: 2,
} as const;

export const STATUS_LABELS: Record<number, FriendStatus> = {
  [DM_STATUS.PENDING]: 'pending',
  [DM_STATUS.APPROVED]: 'approved',
  [DM_STATUS.BLOCKED]: 'blocked',
};
