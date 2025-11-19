import { PublicKey } from '@solana/web3.js'

const DEFAULT_PROGRAM_ID = 'Ame1MLzQwrrSeTjgfM5HH4a9gDwTJXySFjz3LBpQpwkN'
const DEFAULT_ROOT_ID = 'solchat-root'

export const configs = {
  network:
    process.env.NEXT_PUBLIC_RPC_URL ||
    process.env.NETWORK_URL ||
    'https://devnet.helius-rpc.com/?api-key=fbb113ce-eeb4-4277-8c44-7153632d175a',
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
