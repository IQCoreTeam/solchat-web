/**
 * Gateway-backed reader — tries multiple gateways with fallback chain,
 * then falls back to SDK/RPC as last resort.
 */

import iqlabs from 'iqlabs-sdk';

const GATEWAYS = [process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.iqlabs.dev'];

function getGateways(): string[] {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('solchat_gateway');
    if (custom) return [...new Set([custom, ...GATEWAYS])];
  }
  return GATEWAYS;
}

async function gwFetch(path: string): Promise<Response> {
  for (const gw of getGateways()) {
    try {
      const res = await fetch(`${gw}${path}`, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) return res;
    } catch { continue; }
  }
  throw new Error('all gateways unreachable');
}

export async function readCodeIn(signature: string): Promise<{ data: string | null; metadata: string }> {
  try {
    const res = await gwFetch(`/data/${signature}`);
    const json = await res.json();
    return { data: json.data ?? null, metadata: json.metadata ?? '' };
  } catch { /* all gateways failed */ }
  return iqlabs.reader.readCodeIn(signature);
}

export async function readTableRows(tablePda: string, limit = 50): Promise<any[]> {
  try {
    const res = await gwFetch(`/table/${tablePda}/rows?limit=${limit}`);
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.rows)) return data.rows;
    throw new Error('Invalid gateway rows response');
  } catch { /* all gateways failed */ }
  return iqlabs.reader.readTableRows(tablePda, { limit });
}

export async function getSignaturesForTable(tablePda: string, limit = 200, before?: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    const res = await gwFetch(`/table/${tablePda}/index?${params}`);
    const data = await res.json();
    const sigs = Array.isArray(data) ? data : data?.signatures;
    if (Array.isArray(sigs)) return sigs;
    throw new Error('Invalid gateway signatures response');
  } catch { /* all gateways failed */ }
  return iqlabs.reader.collectSignatures(tablePda, limit);
}

export async function getUserProfile(pubkey: string): Promise<Record<string, any> | null> {
  try {
    const res = await gwFetch(`/user/${pubkey}/profile`);
    return res.json();
  } catch { /* all gateways failed */ }
  const state = await iqlabs.reader.readUserState(pubkey);
  if (!state?.profileData) return null;
  try {
    return typeof state.profileData === 'string' ? JSON.parse(state.profileData) : state.profileData;
  } catch {
    return null;
  }
}

/** Notify gateway about a new tx so it caches it instantly. Fire and forget. */
export function notifyGateway(tablePda: string, txSignature: string, signer?: string): void {
  const gw = getGateways()[0];
  fetch(`${gw}/table/${tablePda}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txSignature, signer }),
  }).catch(() => {});
}

export async function getUserConnections(pubkey: string): Promise<any[]> {
  try {
    const res = await gwFetch(`/user/${pubkey}/connections`);
    const data = await res.json();
    if (Array.isArray(data)) return data;
    throw new Error('Invalid gateway connections response');
  } catch { /* all gateways failed */ }
  return iqlabs.reader.fetchUserConnections(pubkey, { speed: 'medium' });
}
