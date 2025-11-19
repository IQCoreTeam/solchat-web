'use client'

import defaultIdl from '../idl.json'
import * as anchor from '@coral-xyz/anchor'
import type { Idl, AnchorProvider, Program } from '@coral-xyz/anchor'
import { Connection, PublicKey, Commitment } from '@solana/web3.js'
import { configs } from '../configs'

export type WalletAdapterLike = {
  publicKey: PublicKey | null
  signTransaction: (tx: any) => Promise<any>
  signAllTransactions?: (txs: any[]) => Promise<any[]>
}

/**
 * getAnchorProvider
 * - Build an AnchorProvider from a wallet-adapter wallet + connection
 */
export function getAnchorProvider(
  connection: Connection,
  wallet: WalletAdapterLike,
  opts?: { commitment?: Commitment }
): AnchorProvider {
  if (!wallet?.publicKey || !wallet?.signTransaction) {
    throw new Error('Wallet not connected or missing capabilities')
  }
  const w: { publicKey: PublicKey; signTransaction: any; signAllTransactions: any } = {
    publicKey: wallet.publicKey,

    signTransaction: wallet.signTransaction as any,
    signAllTransactions: wallet.signAllTransactions as any,
  }
  const provider = new anchor.AnchorProvider(
    connection,
    w,
    { preflightCommitment: opts?.commitment ?? 'processed' }
  )
  anchor.setProvider(provider)
  return provider
}



/**
 * getProgram
 * - Instantiate an Anchor Program from IDL and programId.
 */
export function getProgram(
  provider: AnchorProvider,
  idlOverride?: Idl,
  programIdOverride?: string | PublicKey
): Program {
  const candidateIdl = (idlOverride as Idl) ?? (defaultIdl as Idl)
  const resolvedIdl =
    candidateIdl && Array.isArray((candidateIdl as any).accounts) && (candidateIdl as any).types
      ? candidateIdl
      : (defaultIdl as Idl)
  const programAddress =
    programIdOverride ??
    (resolvedIdl as any)?.address ??
    configs.programId
  const programPublicKey =
    programAddress instanceof PublicKey
      ? programAddress
      : new PublicKey(programAddress)
  const idlWithAddress = {
    ...(resolvedIdl as any),
    address: programPublicKey.toBase58(),
  } as Idl
  return new anchor.Program(idlWithAddress, provider)
}
