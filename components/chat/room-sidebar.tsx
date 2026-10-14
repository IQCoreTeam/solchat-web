/**
 * Room Sidebar Component
 * Left sidebar with room creation and room list
 */

'use client';

import { FormEvent } from 'react';
import { shorten } from '@/lib/utils/message-utils';
import type { RootStatus } from '@/lib/chat/use-root-account';
import type { RoomMeta } from '@/lib/chat/use-rooms';

interface RoomSidebarProps {
    // Room creation
    newRoomName: string;
    setNewRoomName: (name: string) => void;
    newRoomGateEnabled: boolean;
    setNewRoomGateEnabled: (enabled: boolean) => void;
    newRoomGateMint: string;
    setNewRoomGateMint: (mint: string) => void;
    newRoomGateAmount: string;
    setNewRoomGateAmount: (amount: string) => void;
    newRoomGateType: 0 | 1;
    setNewRoomGateType: (gateType: 0 | 1) => void;
    creatingRoom: boolean;
    createRoomError: string | null;
    onCreateRoom: (e: FormEvent) => void;

    // Room list
    rooms: RoomMeta[];
    selectedSeed: string | null;
    onSelectRoom: (seedHex: string) => void;
    rootStatus: RootStatus;
    rootError: string | null;
    roomsLoaded: boolean;
    onRetryRooms: () => void;
    roomsLoading: boolean;
    roomsError: string | null;

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
                                newRoomGateEnabled,
                                setNewRoomGateEnabled,
                                newRoomGateMint,
                                setNewRoomGateMint,
                                newRoomGateAmount,
                                setNewRoomGateAmount,
                                newRoomGateType,
                                setNewRoomGateType,
                                creatingRoom,
                                createRoomError,
                                onCreateRoom,
                                rooms,
                                selectedSeed,
                                onSelectRoom,
                                rootStatus,
                                rootError,
                                roomsLoaded,
                                onRetryRooms,
                                roomsLoading,
    roomsError,
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
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/70 select-none">
                        <input
                            type="checkbox"
                            checked={newRoomGateEnabled}
                            onChange={(event) => setNewRoomGateEnabled(event.target.checked)}
                            disabled={creatingRoom || !hasWallet}
                            className="h-4 w-4 accent-green-400"
                        />
                        Token gate
                    </label>
                    {newRoomGateEnabled && (
                        <div className="space-y-2 rounded border border-white/10 bg-white/5 p-2">
                            <input
                                type="text"
                                value={newRoomGateMint}
                                onChange={(event) => setNewRoomGateMint(event.target.value)}
                                placeholder="Gate mint address"
                                className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2"
                                style={{ '--tw-ring-color': 'rgb(65, 255, 0)' } as React.CSSProperties}
                                disabled={creatingRoom || !hasWallet}
                            />
                            <input
                                type="text"
                                inputMode="numeric"
                                value={newRoomGateAmount}
                                onChange={(event) => setNewRoomGateAmount(event.target.value)}
                                placeholder="Minimum amount (raw units)"
                                className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2"
                                style={{ '--tw-ring-color': 'rgb(65, 255, 0)' } as React.CSSProperties}
                                disabled={creatingRoom || !hasWallet}
                            />
                            <select
                                value={newRoomGateType}
                                onChange={(event) => setNewRoomGateType(Number(event.target.value) as 0 | 1)}
                                disabled={creatingRoom || !hasWallet}
                                className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-2"
                                style={{ '--tw-ring-color': 'rgb(65, 255, 0)' } as React.CSSProperties}
                            >
                                <option value={0} className="bg-black text-white">Token (SPL mint)</option>
                                <option value={1} className="bg-black text-white">Collection (NFT)</option>
                            </select>
                        </div>
                    )}
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
                    {createRoomError && <p role="alert" className="text-xs text-red-400">Couldn’t create room. {createRoomError}</p>}
                </form>
            </div>

            {/* Room list */}
            <div className="flex-1 overflow-y-auto px-2 py-3">
                <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-white/60">
                    Rooms
                </div>
                {rootError && (
                    <div role="alert" className="px-2 py-2 text-sm text-red-400">
                        Couldn’t load rooms. Check your RPC connection and retry.
                    </div>
                )}
                {rootError && (
                    <button type="button" onClick={() => window.dispatchEvent(new Event('solchat:rpc-error'))}
                        className="mx-2 my-2 min-h-11 rounded border border-green-600 px-3 py-2 text-sm text-green-400">
                        Change RPC
                    </button>
                )}
                {(rootError || roomsError) && (
                    <button type="button" onClick={onRetryRooms} disabled={rootStatus === 'checking' || roomsLoading}
                        className="mx-2 my-2 min-h-11 rounded border border-green-600 px-3 py-2 text-sm text-green-400 disabled:opacity-50">
                        Retry loading rooms
                    </button>
                )}
                {(rootStatus === 'checking' || roomsLoading || (rootStatus === 'ready' && !roomsLoaded)) && (
                    <div role="status" className="px-2 py-2 text-sm text-white/60">Loading rooms…</div>
                )}
                {rootStatus === 'missing' && (
                    <div className="px-2 py-2 text-sm text-white/60">Chat is not set up yet.</div>
                )}
                {rootStatus === 'ready' && roomsLoaded && !rootError && !roomsError && !roomsLoading && rooms.length === 0 && (
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
