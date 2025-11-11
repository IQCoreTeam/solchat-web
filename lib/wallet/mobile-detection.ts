/**
 * Mobile wallet detection and utilities
 */

/**
 * Check if running on mobile device
 */
export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Check if running in Phantom mobile in-app browser
 */
export function isPhantomMobile(): boolean {
  if (typeof window === 'undefined') return false;

  // Phantom injects window.phantom when in their mobile browser
  return isMobile() && 'phantom' in window && !!window.phantom?.solana;
}

/**
 * Check if running on Solana Saga/Seeker phone
 */
export function isSolanaMobilePhone(): boolean {
  if (typeof window === 'undefined') return false;

  // Solana Mobile Stack detection
  return (
    isMobile() &&
    /Android/i.test(navigator.userAgent) &&
    ('solana' in window || 'solflare' in window)
  );
}

/**
 * Get mobile wallet provider
 */
export function getMobileWalletProvider(): any {
  if (typeof window === 'undefined') return null;

  // Check for Phantom mobile
  if (window.phantom?.solana) {
    return window.phantom.solana;
  }

  // Check for Solflare mobile
  if (window.solflare) {
    return window.solflare;
  }

  // Check for generic Solana provider
  if (window.solana) {
    return window.solana;
  }

  return null;
}

/**
 * Check if a mobile wallet is available
 */
export function hasMobileWallet(): boolean {
  return getMobileWalletProvider() !== null;
}

/**
 * Get mobile browser info
 */
export function getMobileBrowserInfo(): {
  isMobile: boolean;
  isPhantom: boolean;
  isSolanaMobile: boolean;
  hasWallet: boolean;
  walletName?: string;
} {
  const provider = getMobileWalletProvider();

  return {
    isMobile: isMobile(),
    isPhantom: isPhantomMobile(),
    isSolanaMobile: isSolanaMobilePhone(),
    hasWallet: hasMobileWallet(),
    walletName: provider?.isPhantom
      ? 'Phantom'
      : provider?.isSolflare
      ? 'Solflare'
      : provider
      ? 'Mobile Wallet'
      : undefined,
  };
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    phantom?: {
      solana?: any;
    };
    solflare?: any;
    solana?: any;
  }
}
