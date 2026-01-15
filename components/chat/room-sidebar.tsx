/**
 * Room Sidebar Component
 * Left sidebar with room creation and room list
 */

'use client';

import { FormEvent } from 'react';
import { shorten } from '@/lib/utils/message-utils';

interface RoomMeta {
    seedHex: string;
    seedBytes: Uint8Array;
    name: string;
    tableAddress: string;
    instructionAddress: string;
    columns: string[];
    lastTimestamp: number;
}

interface RoomSidebarProps {
    // Room creation
    newRoomName: string;
    setNewRoomName: (name: string) => void;
    newRoomGateMint: string;
    setNewRoomGateMint: (mint: string) => void;
    creatingRoom: boolean;
    onCreateRoom: (e: FormEvent) => void;

    // Room list
    rooms: RoomMeta[];
    selectedSeed: string | null;
    onSelectRoom: (seedHex: string) => void;
    roomsLoading: boolean;
    roomsError: string | null;
    roomAlerts: Record<string, boolean>;

    // Auth state
    hasWallet: boolean;
    canWrite: boolean;
    isUserInitialized: boolean;
    isUserInitializing: boolean;
    userInitError: Error | null;

    // Mobile
    isSidebarOpen: boolean;
    onCloseSidebar: () => void;
}

export function RoomSidebar({
                                newRoomName,
                                setNewRoomName,
                                newRoomGateMint,
                                setNewRoomGateMint,
                                creatingRoom,
                                onCreateRoom,
                                rooms,
                                selectedSeed,
                                onSelectRoom,
                                roomsLoading,
    roomsError,
    roomAlerts,
    hasWallet,
    canWrite,
    isUserInitialized,
    isUserInitializing,
    userInitError,
    isSidebarOpen,
                                onCloseSidebar,
                            }: RoomSidebarProps) {
    return (
        <aside className={`
      flex w-72 flex-col border-r border-white/10 bg-black z-50
      absolute md:relative inset-y-0 left-0
      transform transition-transform duration-300 ease-in-out
      ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    `}>
            {/* Mobile close button */}
            <div className="md:hidden flex justify-start p-3 border-b border-white/10">
                <button
                    type="button"
                    onClick={onCloseSidebar}
                    className="flex items-center justify-center w-9 h-9 rounded border-2 border-green-600 bg-black text-green-400 hover:bg-green-600/10 transition-colors"
                    aria-label="Close sidebar"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Create room form */}
            <div className="border-b border-white/10 px-4 py-3">
                <form onSubmit={onCreateRoom} className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-white/70">Create room</div>
                    <input
                        type="text"
                        value={newRoomName}
                        onChange={(event) => setNewRoomName(event.target.value)}
                        placeholder="Room name"
                        className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2"
                        style={{ '--tw-ring-color': 'rgb(65, 255, 0)' } as React.CSSProperties}
                        disabled={creatingRoom || !hasWallet}
                    />
                    <input
                        type="text"
                        value={newRoomGateMint}
                        onChange={(event) => setNewRoomGateMint(event.target.value)}
                        placeholder="Gate mint (optional)"
                        className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2"
                        style={{ '--tw-ring-color': 'rgb(65, 255, 0)' } as React.CSSProperties}
                        disabled={creatingRoom || !hasWallet}
                    />
                    <button
                        type="submit"
                        disabled={creatingRoom || !canWrite || !newRoomName.trim()}
                        className="w-full rounded py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/60"
                        style={{
                            backgroundColor: creatingRoom || !canWrite || !newRoomName.trim() ? undefined : 'rgb(65, 255, 0)',
                            color: creatingRoom || !canWrite || !newRoomName.trim() ? undefined : 'rgb(0, 33, 0)',
                        }}
                        onMouseEnter={(e) => {
                            if (!creatingRoom && canWrite && newRoomName.trim()) {
                                e.currentTarget.style.opacity = '0.85';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '1';
                        }}
                    >
                        {creatingRoom ? 'Creating…' : 'Create'}
                    </button>
                    {!hasWallet && (
                        <p className="text-xs text-orange-300">Connect your wallet to create rooms.</p>
                    )}
                    {isUserInitializing && !isUserInitialized && !userInitError && (
                        <p className="text-xs text-yellow-300">Setting up your account…</p>
                    )}
                    {userInitError && (
                        <p className="text-xs text-red-400">
                            Failed to initialize your account. Please retry.
                        </p>
                    )}
                    {roomsError && <p className="text-xs text-red-400">{roomsError}</p>}
                </form>
            </div>

            {/* Room list */}
            <div className="flex-1 overflow-y-auto px-2 py-3">
                <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-white/60">
                    Rooms
                </div>
                {!roomsLoading && rooms.length === 0 && (
                    <div className="px-2 py-2 text-sm text-white/60">No chat room exists.</div>
                )}
                <div className="space-y-1">
                    {rooms.map((room) => (
                        <button
                            key={room.seedHex}
                            onClick={() => onSelectRoom(room.seedHex)}
                            className={`w-full rounded px-3 py-2 text-left transition ${selectedSeed === room.seedHex ? 'text-white' : 'bg-white/5 text-white/80 hover:bg-white/10'
                            }`}
                            style={selectedSeed === room.seedHex ? { backgroundColor: 'rgba(65, 255, 0, 0.2)' } : undefined}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold truncate">{room.name}</span>
                                {roomAlerts[room.seedHex] && (
                                    <span className="inline-block h-2 w-2 rounded-full bg-red-500" aria-label="Unread messages" />
                                )}
                            </div>
                            <div className="text-xs text-white/60 flex items-center justify-between gap-2">
                                <span className="truncate">{shorten(room.tableAddress)}</span>
                                {room.lastTimestamp > 0 && (
                                    <span className="text-[10px] text-white/40">
                                        {new Date(room.lastTimestamp).toLocaleTimeString()}
                                    </span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </aside>
    );
}
