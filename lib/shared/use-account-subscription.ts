/**
 * Account Subscription Hook with Signature Tracking
 * - Based on CLI example pattern from iqlabs-sdk-cli-example
 * - Tracks seen signatures to avoid processing duplicates
 * - Fetches new transaction signatures when account changes
 * - More efficient than re-fetching all messages
 */

import { useEffect, useRef } from 'react';
import { PublicKey, type Connection } from '@solana/web3.js';
import iqlabs from 'iqlabs-sdk/src';
import { invalidateSignatureCache, updateAccountCache } from '@/lib/rpc/cache';

export interface UseAccountSubscriptionParams {
  /**
   * Solana connection instance
   */
  connection: Connection;

  /**
   * Account to subscribe to (e.g., table address)
   */
  account: PublicKey | null;

  /**
   * Handler called with new signatures when account changes
   * Receives array of new signatures in chronological order (oldest first)
   */
  onNewSignatures: (signatures: string[]) => void | Promise<void>;

  /**
   * Commitment level for the subscription
   */
  commitment?: 'processed' | 'confirmed' | 'finalized';

  /**
   * Whether the subscription is enabled
   */
  enabled?: boolean;

  /**
   * Number of recent signatures to fetch on each change
   */
  fetchLimit?: number;

  /**
   * Component name for logging
   */
  logPrefix?: string;
}

/**
 * Subscribe to account changes and track new transaction signatures
 *
 * Based on CLI example's subscribeToAccount pattern:
 * - Maintains a Set of seen signatures
 * - On account change, fetches recent transactions
 * - Filters out already-seen signatures
 * - Calls handler with only new signatures
 *
 * This is more efficient than re-fetching all messages when using
 * signature-targeted decoding.
 */
export function useAccountSubscription({
  connection,
  account,
  onNewSignatures,
  commitment = 'confirmed',
  enabled = true,
  fetchLimit = 10,
  logPrefix = 'AccountSub',
}: UseAccountSubscriptionParams) {
  const subscriptionRef = useRef<number | null>(null);
  const seenSignaturesRef = useRef<Set<string>>(new Set());
  const handlerRef = useRef(onNewSignatures);
  const accountKey = account?.toBase58() ?? null;

  // Update handler ref when it changes
  useEffect(() => {
    handlerRef.current = onNewSignatures;
  }, [onNewSignatures]);

  useEffect(() => {
    if (!enabled || !account || !accountKey) {
      seenSignaturesRef.current.clear();
      return;
    }

    let subscriptionId: number | null = null;
    let isActive = true;

    const subscribe = async () => {
      try {
        // Initial fetch to populate seen signatures
        const initial = await iqlabs.reader.fetchAccountTransactions(account, {
          limit: fetchLimit,
        });
        for (const sig of initial) {
          seenSignaturesRef.current.add(sig.signature);
        }
        console.log(`[${logPrefix}] Initial seen signatures: ${seenSignaturesRef.current.size}`);

        // Subscribe to account changes
        const id = connection.onAccountChange(
          account,
          async (info, context) => {
            if (!isActive) return;

            // Update cache
            updateAccountCache(accountKey, info);
            invalidateSignatureCache(accountKey);

            console.log(`[${logPrefix}] Account changed, fetching new signatures...`);

            try {
              // Fetch recent signatures
              const signatures = await iqlabs.reader.fetchAccountTransactions(account, {
                limit: fetchLimit,
              });

              // Filter out already-seen signatures
              const fresh = signatures.filter((sig) => !seenSignaturesRef.current.has(sig.signature));

              if (fresh.length === 0) {
                console.log(`[${logPrefix}] No new signatures found`);
                return;
              }

              console.log(`[${logPrefix}] Found ${fresh.length} new signatures`);

              // Mark as seen and reverse to get chronological order (oldest first)
              const newSigs: string[] = [];
              for (const sig of fresh.reverse()) {
                seenSignaturesRef.current.add(sig.signature);
                newSigs.push(sig.signature);
              }

              // Call handler with new signatures
              await handlerRef.current(newSigs);
            } catch (error) {
              console.error(`[${logPrefix}] Failed to process account change:`, error);
            }
          },
          commitment
        );

        subscriptionId = id;
        subscriptionRef.current = id;
        console.log(`[${logPrefix}] Subscribed to ${accountKey.slice(0, 8)}... (id: ${id})`);
      } catch (error) {
        console.warn(`[${logPrefix}] Failed to subscribe:`, error);
      }
    };

    subscribe();

    return () => {
      isActive = false;
      if (subscriptionId !== null) {
        console.log(`[${logPrefix}] Unsubscribing from ${accountKey.slice(0, 8)}... (id: ${subscriptionId})`);
        connection.removeAccountChangeListener(subscriptionId).catch(() => undefined);
        subscriptionRef.current = null;
      }
      seenSignaturesRef.current.clear();
    };
  }, [connection, accountKey, commitment, enabled, fetchLimit, logPrefix]);
}
