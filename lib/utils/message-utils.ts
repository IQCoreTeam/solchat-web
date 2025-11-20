/**
 * Message Utilities
 * Shared utility functions for message handling and display
 */

/**
 * Shortens an address for display
 * @param address - The address to shorten
 * @param chars - Number of characters to show at start/end (default: 4)
 */
export function shorten(address: string, chars = 4): string {
    if (!address) return '';
    if (address.length <= chars * 2) return address;
    return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/**
 * Derives a consistent avatar hue from an address
 * @param address - The address to derive color from
 */
export function deriveAvatarHue(address: string): number {
    if (!address) return 160;
    let hash = 0;
    for (let i = 0; i < address.length; i += 1) {
        hash = (hash << 5) - hash + address.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 360;
}

/**
 * Formats a timestamp for display
 * @param ts - Unix timestamp in milliseconds
 */
export function formatTimestamp(ts?: number): string {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formats a full timestamp with date
 * @param ts - Unix timestamp in milliseconds
 */
export function formatFullTimestamp(ts?: number): string {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleString();
}

/**
 * Normalizes a file URL
 * @param value - The URL string to normalize
 */
export function normalizeFileUrl(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
        const url = new URL(trimmed);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return url.toString();
        }
    } catch {
        return null;
    }
    return null;
}

/**
 * File type detection by extension
 */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov', 'm4v'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a'];

export type AttachmentType = 'image' | 'video' | 'audio' | 'other';

/**
 * Detects the type of attachment from URL
 * @param url - The attachment URL
 */
export function detectAttachmentType(url: string): AttachmentType {
    try {
        const { pathname } = new URL(url);
        const ext = pathname.split('.').pop()?.toLowerCase() ?? '';
        if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
        if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
        if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
    } catch {
        // ignore
    }
    return 'other';
}
