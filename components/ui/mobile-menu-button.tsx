/**
 * Mobile Menu Button Component
 * Hamburger/close icon toggle button for mobile navigation
 */

'use client';

interface MobileMenuButtonProps {
    isOpen: boolean;
    onClick: () => void;
    className?: string;
    ariaLabel?: string;
}

export function MobileMenuButton({
    isOpen,
    onClick,
    className = '',
    ariaLabel = 'Toggle menu'
}: MobileMenuButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`md:hidden flex items-center justify-center w-9 h-9 rounded border-2 border-green-600 bg-black/50 text-green-400 hover:bg-green-600/10 transition-colors ${className}`}
            aria-label={ariaLabel}
        >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
            </svg>
        </button>
    );
}
