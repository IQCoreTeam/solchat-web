/**
 * Room Header Component
 * Header showing current room information
 */

'use client';

import { shorten } from '@/lib/utils/message-utils';

interface RoomMeta {
    seedHex: string;
    seedBytes: Uint8Array;
    name: string;
    tableAddress: string;
    instructionAddress: string;
    columns: string[];
}

interface RoomHeaderProps {
    room: RoomMeta;
}

export function RoomHeader({ room }: RoomHeaderProps) {
    return (
        <div className="border-b border-white/10 px-3 py-3 md:px-6 md:py-4">
            <div className="text-xs uppercase tracking-wide text-white/60">Room</div>
            <h2 className="text-lg md:text-xl font-semibold">{room.name}</h2>
            <p className="text-xs text-white/50">
                Table: {shorten(room.tableAddress)} · Instruction: {shorten(room.instructionAddress)}
            </p>
        </div>
    );
}
