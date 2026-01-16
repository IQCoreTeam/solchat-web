/**
 * Friends Feature Utilities
 * - Helper functions for DM/friends operations
 */

/**
 * Shorten wallet address for display
 */
export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/**
 * Derive avatar color from wallet address
 * - Generates consistent color hue for each address
 */
export function deriveAvatarHue(address: string): number {
  if (!address) return 160;

  let hash = 0;
  for (let i = 0; i < address.length; i += 1) {
    hash = (hash << 5) - hash + address.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  return Math.abs(hash) % 360;
}
