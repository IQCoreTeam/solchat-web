import { Buffer } from 'buffer';

export const ROOT_ID = process.env.NEXT_PUBLIC_ROOT_ID || 'solchat-root';

export const ROOT_ID_BYTES: Buffer = Buffer.from(ROOT_ID, 'utf8');

export const MESSAGE_COLUMNS = ['id', 'text', 'file', 'sender', 'timestamp'] as const;

export const DM_TABLE_NAME = 'dm';

export const GLOBAL_USER_LIST_TABLE = 'global_user_list';

/** On-chain fee receiver for request_connection (HARD_RECEIVER in Rust contract) */
export const FEE_RECEIVER = 'EWNSTD8tikwqHMcRNuuNbZrnYJUiJdKq9UXLXSEU4wZ1';
