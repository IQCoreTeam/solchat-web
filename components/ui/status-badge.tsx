/**
 * Status Badge Component
 * Displays status indicators with consistent styling
 */

'use client';

type Status = 'pending' | 'sent' | 'confirmed' | 'failed' | 'approved' | 'blocked';

interface StatusBadgeProps {
    status: Status;
    className?: string;
}

const statusConfig: Record<Status, { color: string; label: string }> = {
    pending: { color: '#ffff00', label: 'PENDING' },
    sent: { color: '#00ff00', label: 'SENT' },
    confirmed: { color: '#00ff00', label: 'confirmed' },
    failed: { color: '#ff0000', label: 'FAILED' },
    approved: { color: '#00ff00', label: 'APPROVED' },
    blocked: { color: '#ff0000', label: 'BLOCKED' },
};

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
    const config = statusConfig[status] || statusConfig.confirmed;

    return (
        <span
            className={`text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 md:py-1 border uppercase ${className}`}
            style={{
                borderColor: config.color,
                color: config.color,
                backgroundColor: '#000000',
            }}
        >
            {config.label}
        </span>
    );
}
