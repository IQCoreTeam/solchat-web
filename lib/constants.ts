export const IQ_BACKEND_HOST = process.env.NEXT_PUBLIC_IQ_BACKEND_HOST || 'https://iq-testbackend-381334931214.asia-northeast3.run.app';
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://devnet.helius-rpc.com/?api-key=061e5a39-abc0-439d-90ce-c4e2b3260dff';
export const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';

// Privy Configuration
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

// BONK token mint address on Devnet
export const BONK_MINT = '3jV8jHCeqkgfK4Y7hSNbt4dCM3aFG3Rp7LkyqRYJWfRJ';

// App configuration
export const APP_NAME = 'SolChat';
export const APP_DESCRIPTION = 'Decentralized messaging on Solana';

// Transaction configuration
export const TRANSACTION_SIZE_LIMIT = 900; // bytes
export const COMMITMENT_LEVEL = 'processed';

// Chat configuration
export const MAX_MESSAGE_HISTORY = 50;
export const DEFAULT_MESSAGE_COLOR = '#1e90ff';
