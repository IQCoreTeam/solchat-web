/**
 * Confirmation Dialog Component
 * Generic confirmation modal for user actions
 */

'use client';

import { Window, WindowHeader, WindowContent, Button } from 'react95';

interface ConfirmationDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmPrimary?: boolean;
}

export function ConfirmationDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    confirmPrimary = true,
}: ConfirmationDialogProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6">
            <Window style={{ width: '100%', maxWidth: '400px' }}>
                <WindowHeader>
                    <span>{title}</span>
                </WindowHeader>
                <WindowContent>
                    <div style={{ padding: '16px' }}>
                        <p style={{ color: '#00ff00',  fontSize: '12px', marginBottom: '16px' }}>
                            {message}
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <Button onClick={onCancel}>
                                {cancelLabel}
                            </Button>
                            <Button onClick={onConfirm} primary={confirmPrimary}>
                                {confirmLabel}
                            </Button>
                        </div>
                    </div>
                </WindowContent>
            </Window>
        </div>
    );
}
