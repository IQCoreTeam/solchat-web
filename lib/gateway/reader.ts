/**
 * Gateway-backed reader — tries multiple gateways with fallback chain,
 * then falls back to SDK/RPC as last resort.
 * Same gateway list + pattern as iq-chan (BlockChan).
 */

import iqlabs from 'iqlabs-sdk';

const PRIMARY_GATEWAY = 'https://gateway.solanainternet.com';
const AKASH_DIRECT = 'https://fem4pe7sthdm5f9fkhc1fnmpos.ingress.akashprovid.com';
const BACKUP_GATEWAY = 'https://gateway.iqlabs.dev';
const GATEWAYS = [PRIMARY_GATEWAY, AKASH_DIRECT, BACKUP_GATEWAY];

function getGateways(): string[] {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('solchat_gateway');
    if (custom) return [custom, ...GATEWAYS];
  }
  return GATEWAYS;
}

async function gwFetch(path: string): Promise<Response> {
  for (const gw of getGateways()) {
    try {
      const res = await fetch(`${gw}${path}`);
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
    return Array.isArray(data) ? data : data.rows || [];
  } catch { /* all gateways failed */ }
  return iqlabs.reader.readTableRows(tablePda, { limit });
}

export async function getSignaturesForTable(tablePda: string, limit = 200, before?: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    const res = await gwFetch(`/table/${tablePda}/index?${params}`);
    const data = await res.json();
    const sigs = data.signatures || data;
    if (Array.isArray(sigs)) return sigs;
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

export async function getUserConnections(pubkey: string): Promise<any[]> {
  try {
    const res = await gwFetch(`/user/${pubkey}/connections`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { /* all gateways failed */ }
  return iqlabs.reader.fetchUserConnections(pubkey, { speed: 'medium' });
}
