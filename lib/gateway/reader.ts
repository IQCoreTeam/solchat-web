/**
 * Gateway-backed reader — tries local gateway first, falls back to SDK/RPC.
 */

import iqlabs from 'iqlabs-sdk';
import { GATEWAY_URL } from '@/lib/constants';

/** Read a single transaction's data via gateway, fallback to SDK. */
export async function readCodeIn(signature: string): Promise<{ data: string | null; metadata: string }> {
  if (GATEWAY_URL) {
    try {
      const res = await fetch(`${GATEWAY_URL}/data/${signature}`);
      if (res.ok) {
        const json = await res.json();
        return { data: json.data ?? null, metadata: json.metadata ?? '' };
      }
    } catch { /* gateway down, fall through */ }
  }
  return iqlabs.reader.readCodeIn(signature);
}

/** Read table rows via gateway, fallback to SDK. */
export async function readTableRows(tablePda: string, limit = 50): Promise<any[]> {
  if (GATEWAY_URL) {
    try {
      const res = await fetch(`${GATEWAY_URL}/table/${tablePda}/rows?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : data.rows || [];
      }
    } catch { /* gateway down, fall through */ }
  }
  return iqlabs.reader.readTableRows(tablePda, { limit });
}

/** Fetch signature index for a table via gateway, fallback to SDK. */
export async function getSignaturesForTable(tablePda: string, limit = 200, before?: string): Promise<string[]> {
  if (GATEWAY_URL) {
    try {
      const url = new URL(`${GATEWAY_URL}/table/${tablePda}/index`);
      if (limit) url.searchParams.set('limit', String(limit));
      if (before) url.searchParams.set('before', before);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const sigs = data.signatures || data;
        if (Array.isArray(sigs)) return sigs;
      }
    } catch { /* gateway down, fall through */ }
  }
  return iqlabs.reader.collectSignatures(tablePda, limit);
}
