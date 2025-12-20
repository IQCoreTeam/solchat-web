'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Connection } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import { BorshAccountsCoder, type Idl } from '@coral-xyz/anchor';
import idl from '@/lib/onchainDB/idl.json';
import { ROOT_ID } from '@/lib/onchainDB/constants';
import { pdaRoot, pdaDmTable } from '@/lib/onchainDB';
import { deriveDmSeed } from '@/lib/friends/utils';
import { STATUS_LABELS, type FriendStatus } from '@/lib/friends/types';
import { getCachedAccountInfo } from '@/lib/rpc/cache';

type RelationshipStatus = FriendStatus | 'none';

interface DmRelationshipState {
  status: RelationshipStatus;
  loading: boolean;
  error: string | null;
  dmSeed: Uint8Array | null;
  dmTableAddress: string | null;
  partyA: string | null;
  partyB: string | null;
  requester: number | null;
  blocker: number | null;
  isRequester: boolean;
  isBlocker: boolean;
}

const initialState: DmRelationshipState = {
  status: 'none',
  loading: false,
  error: null,
  dmSeed: null,
  dmTableAddress: null,
  partyA: null,
  partyB: null,
  requester: null,
  blocker: null,
  isRequester: false,
  isBlocker: false,
};

const coder = new BorshAccountsCoder(idl as Idl);

export function useDmRelationship(
  connection: Connection | null,
  viewerAddress: string | null | undefined,
  otherAddress: string | null | undefined
) {
  const [state, setState] = useState<DmRelationshipState>(initialState);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!connection || !viewerAddress || !otherAddress) {
      setState((prev) => ({
        ...initialState,
        dmSeed: viewerAddress && otherAddress ? deriveDmSeed(viewerAddress, otherAddress) : null,
        dmTableAddress: null,
      }));
      return;
    }

    let cancelled = false;

    const load = async () => {
      const seed = deriveDmSeed(viewerAddress, otherAddress);
      const rootPk = pdaRoot(ROOT_ID);
      const dmTablePk = pdaDmTable(rootPk, seed);

      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
        dmSeed: seed,
        dmTableAddress: dmTablePk.toBase58(),
      }));

      try {
        const info = await getCachedAccountInfo(connection, dmTablePk);
        if (!info) {
          if (!cancelled) {
            setState({
              ...initialState,
              loading: false,
              dmSeed: seed,
              dmTableAddress: dmTablePk.toBase58(),
            });
          }
          return;
        }

        const decoded = coder.decode('DMTable', info.data);
        const partyA = new PublicKey(decoded.party_a).toBase58();
        const partyB = new PublicKey(decoded.party_b).toBase58();
        const status = STATUS_LABELS[decoded.status] ?? 'pending';
        const viewerRole = viewerAddress === partyA ? 0 : viewerAddress === partyB ? 1 : null;
        const isRequester = viewerRole !== null && decoded.requester === viewerRole;
        const isBlocker = viewerRole !== null && decoded.blocker === viewerRole;

        if (!cancelled) {
          setState({
            status,
            loading: false,
            error: null,
            dmSeed: seed,
            dmTableAddress: dmTablePk.toBase58(),
            partyA,
            partyB,
            requester: decoded.requester,
            blocker: decoded.blocker,
            isRequester,
            isBlocker,
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[useDmRelationship] Failed to fetch DM state:', err);
          setState({
            ...initialState,
            loading: false,
            dmSeed: seed,
            dmTableAddress: dmTablePk.toBase58(),
            error: err instanceof Error ? err.message : 'Failed to fetch DM status',
          });
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [connection, viewerAddress, otherAddress, version]);

  return {
    ...state,
    refresh,
  };
}
