import { PublicKey } from '@solana/web3.js'

const DEFAULT_PROGRAM_ID = '56chGT6U3fvbYQwFcNJcygg7nBngvuC8Zr5FztzSfd44'
const DEFAULT_ROOT_ID = 'solchat-root'

export const configs = {
  network:
    process.env.NEXT_PUBLIC_RPC_URL ||
    process.env.NETWORK_URL ||
      "https://api.devnet.solana.com",
  programId:
    process.env.NEXT_PUBLIC_PROGRAM_ID ||
    process.env.PROGRAM_ID ||
    DEFAULT_PROGRAM_ID,
  /**
   * PDA seeds (must stay in sync with on-chain program definitions)
   */
  rootSeed: 'solchat-root',
  tableSeed: 'iqdb-table',
  dmTableSeed: 'solchat-dm-table',
  dmListSeed: 'solchat-dmlist',
  userSeed: 'solchat-user',
  txRefSeed: 'iqdb-txref',
  instructionSeed: 'instruction',
  targetSeed: 'target',
  /**
   * Application-level root identifier (can be overridden via env)
   */
  defaultRootId:
    process.env.NEXT_PUBLIC_ROOT_ID ||
    process.env.ROOT_ID ||
    DEFAULT_ROOT_ID,
}

export const constants = {
  iqDataBaseContractId: new PublicKey(
    process.env.NEXT_PUBLIC_PROGRAM_ID ||
      process.env.PROGRAM_ID ||
      DEFAULT_PROGRAM_ID
  ),
}
