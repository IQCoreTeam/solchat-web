type TransferType = 'entry' | 'exit';
type TransferStatus = 'pending' | 'completed' | 'failed';

export interface CloakTransferRecord {
  id: string;
  type: TransferType;
  amount: number;
  createdAt: string;
  status: TransferStatus;
  recipient: string;
  signature?: string;
  delayedWithdrawalId?: number;
  executeAt?: string;
  note?: string;
}

const STORAGE_PREFIX = 'cloak-transfer:';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function getKey(address: string) {
  return `${STORAGE_PREFIX}${address}`;
}

export function listCloakRecords(address: string): CloakTransferRecord[] {
  const storage = getStorage();
  if (!storage) return [];
  const raw = storage.getItem(getKey(address));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CloakTransferRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecords(address: string, records: CloakTransferRecord[]) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(getKey(address), JSON.stringify(records));
}

export function addCloakRecord(address: string, record: CloakTransferRecord) {
  const next = [record, ...listCloakRecords(address)].slice(0, 25);
  saveRecords(address, next);
}

export function updateCloakRecord(address: string, id: string, patch: Partial<CloakTransferRecord>) {
  const records = listCloakRecords(address).map((rec) =>
    rec.id === id ? { ...rec, ...patch } : rec
  );
  saveRecords(address, records);
}
