/**
 * Chat Header Component
 * Main header with authentication status and mobile menu
 */

'use client';

import { MobileMenuButton } from '@/components/ui/mobile-menu-button';
import { NotificationToggle } from '@/components/ui/notification-toggle';

interface RoomMeta {
    seedHex: string;
    seedBytes: Uint8Array;
    name: string;
    tableAddress: string;
    instructionAddress: string;
    columns: string[];
}

interface ChatHeaderProps {
    // Wallet & Auth
    walletAddress: string | null;
    needsInit: boolean;
    userInitError: Error | null;
    rootStatus: 'checking' | 'missing' | 'creating' | 'ready' | 'error';
    rootStatusText: string;
    userInitStatus: string;

    // Actions
    onRetryUserInit: () => void;
    onDisconnect: () => Promise<void>;
    disconnecting: boolean;

    // Mobile
    isSidebarOpen: boolean;
    onToggleSidebar: () => void;

    // Room info
    selectedRoom: RoomMeta | null;
    notificationsEnabled: boolean;
    onToggleNotifications: () => void;
}

export function ChatHeader({
                               walletAddress,
                               needsInit,
                               userInitError,
                               rootStatus,
                               rootStatusText,
                               userInitStatus,
                               onRetryUserInit,
                               onDisconnect,
                               disconnecting,
                               isSidebarOpen,
                               onToggleSidebar,
                               selectedRoom,
                               notificationsEnabled,
                               onToggleNotifications,
                           }: ChatHeaderProps) {
    return (
        <header className="border-b-2 border-green-600 bg-black px-3 py-3 md:px-6">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1">
                    <MobileMenuButton
                        isOpen={isSidebarOpen}
                        onClick={onToggleSidebar}
                        ariaLabel="Toggle sidebar"
                    />
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-xl md:text-2xl font-bold text-green-400 leading-tight uppercase">
                            {selectedRoom ? `ROOM: ${selectedRoom.name}` : 'ON-CHAIN ROOMS'}
                        </h1>
                        <NotificationToggle
                            enabled={notificationsEnabled}
                            onToggle={onToggleNotifications}
                            label="NOTI"
                            size="sm"
                        />
                    </div>
                </div>

                {walletAddress ? (
                    <div className="flex flex-col gap-2 items-end ml-auto">
                        {!needsInit ? (
                            <div className="border-2 border-green-500 bg-black/70 px-3 py-2 text-xs text-green-200">
                                <span className="text-green-300 text-xs uppercase">STATUS: OK</span>
                            </div>
                        ) : (
                            <div className="border-2 border-yellow-400 bg-black/70 px-4 py-3 text-xs text-yellow-100 w-full">
                                <p className="text-yellow-200 text-sm tracking-[0.3em] uppercase">[STATUS: INIT]</p>
                                <div className="mt-2 space-y-1">
                                    {rootStatus !== 'ready' && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-yellow-300">ROOT</span>
                                            <span className="text-[11px]">{rootStatusText.toUpperCase()}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <span className="text-yellow-300">USER</span>
                                        <span className="text-[11px]">{userInitStatus.toUpperCase()}</span>
                                    </div>
                                    {userInitError && (
                                        <button
                                            type="button"
                                            onClick={onRetryUserInit}
                                            className="mt-1 text-[11px] text-yellow-100 underline decoration-dotted underline-offset-2 hover:text-yellow-200"
                                        >
                                            [RETRY]
                                        </button>
                                    )}
                                    <p className="pt-2 text-[11px] text-yellow-200/70">
                                        complete setup to unlock realtime room updates
                                    </p>
                                </div>
                                <div className="mt-3 flex justify-end sm:justify-start">
                                    <button
                                        type="button"
                                        onClick={onDisconnect}
                                        className="text-[11px] text-red-300 underline decoration-dotted underline-offset-2 transition hover:text-red-200 disabled:opacity-50"
                                        disabled={disconnecting}
                                    >
                                        {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 bg-black/60 border border-green-600/50 rounded px-3 py-1.5 shadow-lg shadow-green-600/10">
                        <span className="text-xs text-green-400">
                            [CONNECT PRIVY WALLET TO START VISIT ACCOUNT TAB]
                        </span>
                    </div>
                )}
            </div>
        </header>
    );
}
