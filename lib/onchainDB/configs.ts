import { PublicKey } from "@solana/web3.js";

export const configs = {
  network: process.env.NETWORK_URL || 'https://devnet.helius-rpc.com/?api-key=fbb113ce-eeb4-4277-8c44-7153632d175a',
  programId: process.env.PROGRAM_ID || 'Ame1MLzQwrrSeTjgfM5HH4a9gDwTJXySFjz3LBpQpwkN',
  /**
   * PDA seeds (must stay in sync with on-chain program definitions)
   */
  rootSeed: 'solchat-root',
  tableSeed: 'iqdb-table',
  txRefSeed: 'iqdb-txref',
  instructionSeed: 'instruction',
  targetSeed: 'target',
  /**
   * Application-level root identifier (can be overridden via env)
   */
  defaultRootId: process.env.ROOT_ID || 'solchat-root',
};

export const constants = {
  iqDataBaseContractId: new PublicKey('Ame1MLzQwrrSeTjgfM5HH4a9gDwTJXySFjz3LBpQpwkN'),
};
