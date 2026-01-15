export const ROOT_ID = process.env.NEXT_PUBLIC_ROOT_ID || 'solchat-root';

export const MESSAGE_COLUMNS = ['id', 'text', 'file', 'sender', 'timestamp'] as const;

export const DM_TABLE_NAME = 'dm';

export const GLOBAL_USER_LIST_TABLE = 'global_user_list';
