import { IQ_CONFIG } from './config';

/**
 * Split data into chunks that fit in Solana transactions
 */
export function chunkData(data: string, chunkSize: number = IQ_CONFIG.transactionSizeLimit): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Reconstruct data from chunks
 */
export function reconstructData(chunks: string[]): string {
  return chunks.join('');
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString();
}

/**
 * Ellipsify address for display
 */
export function ellipsify(str: string = '', len: number = 4): string {
  if (str.length <= len * 2) {
    return str;
  }
  return `${str.slice(0, len)}...${str.slice(-len)}`;
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * 1_000_000_000);
}

/**
 * Validate Solana address
 */
export function isValidAddress(address: string): boolean {
  try {
    // Basic validation - should be base58 and 32-44 characters
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  } catch {
    return false;
  }
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        await sleep(delay * Math.pow(2, attempt - 1));
      }
    }
  }

  throw lastError!;
}
