'use client';

import { useConnection } from '@solana/wallet-adapter-react';
import { CloakSDK } from '@cloak-dev/sdk';
import type { CloakSDKConfig, TransactionSigner } from '@cloak-dev/sdk';
import type { Keypair } from '@solana/web3.js';
import { useCallback, useMemo, useRef } from 'react';
import { CLOAK_PROGRAM_ID, CLOAK_RELAYER_URL } from './config';
import { isUserInitialized, markUserInitialized, clearUserInitialization } from './initialization-storage';

type Signer = TransactionSigner | Keypair;

type CachedSdk = Promise<CloakSDK>;

export function useCloakSdk() {
  const { connection } = useConnection();
  const cacheRef = useRef<Map<string, CachedSdk>>(new Map());

  const getSdk = useCallback(
    async (signer: Signer) => {
      const userAddress = signer.publicKey.toBase58();
      
      // Check if we already have a cached SDK instance
      if (!cacheRef.current.has(userAddress)) {
        const cfg: CloakSDKConfig = {
          connection,
          signer,
          relayerUrl: CLOAK_RELAYER_URL,
          programId: CLOAK_PROGRAM_ID,
          verbose: process.env.NODE_ENV !== 'production',
        };
        
        const sdkPromise = (async () => {
          const sdk = new CloakSDK(cfg);
          
          // Initialize once per user
          if (!isUserInitialized(userAddress)) {
            await sdk.initialize();
            markUserInitialized(userAddress);
          } else {
            await sdk.initialize();
          }
          
          return sdk;
        })();
        
        cacheRef.current.set(userAddress, sdkPromise);
      }
      
      return cacheRef.current.get(userAddress)!;
    },
    [connection]
  );

  const reset = useCallback((signer?: Signer) => {
    if (!signer) {
      // Clear all cached SDKs
      cacheRef.current.clear();
      return;
    }
    
    const userAddress = signer.publicKey.toBase58();
    cacheRef.current.delete(userAddress);
    // Also clear initialization flag so next getSdk will reinitialize
    clearUserInitialization(userAddress);
  }, []);

  return useMemo(() => ({ getSdk, reset }), [getSdk, reset]);
}
