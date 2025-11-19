/**
 * Loading Spinner Component
 * Reusable loading indicators with different variants
 */

'use client';

import { CSSProperties } from 'react';

type SpinnerVariant = 'spinner' | 'progress-bar';

interface LoadingSpinnerProps {
    variant?: SpinnerVariant;
    message?: string;
    color?: string;
    className?: string;
}

export function LoadingSpinner({
    variant = 'spinner',
    message = 'Loading',
    color = 'rgb(65, 255, 0)',
    className = ''
}: LoadingSpinnerProps) {
    if (variant === 'progress-bar') {
        return (
            <div className={`flex flex-col items-center justify-center h-full px-8 ${className}`}>
                <p className="text-green-400 text-sm mb-4">{message}...</p>
                <div style={{ width: '100%', maxWidth: '400px' }}>
                    <div style={{
                        height: '24px',
                        background: '#000000',
                        border: '2px solid #00ff00',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        position: 'relative',
                        boxShadow: '0 0 10px rgba(0, 255, 0, 0.3)'
                    }}>
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            height: '100%',
                            width: '25%',
                            background: 'linear-gradient(90deg, rgba(0, 255, 0, 0) 0%, rgba(0, 255, 0, 0.6) 50%, rgba(0, 255, 0, 0) 100%)',
                            animation: 'slide 2s linear infinite',
                            willChange: 'transform'
                        }}></div>
                    </div>
                </div>
                <style jsx>{`
          @keyframes slide {
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(400%);
            }
          }
        `}</style>
            </div>
        );
    }

    // Default spinner variant
    return (
        <div className={`flex flex-col items-center justify-center h-full ${className}`}>
            <div className="relative">
                <div
                    className="w-12 h-12 border-4 rounded-full animate-spin"
                    style={{
                        borderColor: `${color}33`,
                        borderTopColor: color
                    }}
                ></div>
                <div
                    className="absolute inset-0 w-12 h-12 border-4 border-transparent rounded-full animate-spin"
                    style={{
                        borderRightColor: `${color}66`,
                        animationDuration: '1.5s',
                        animationDirection: 'reverse'
                    }}
                ></div>
            </div>
            <div className="mt-4 flex items-center gap-1">
                <span className="text-sm" style={{ color }}>{message.toUpperCase()}</span>
                <span className="flex gap-0.5">
                    <span
                        className="w-1 h-1 rounded-full animate-bounce"
                        style={{ backgroundColor: color, animationDelay: '0ms' }}
                    ></span>
                    <span
                        className="w-1 h-1 rounded-full animate-bounce"
                        style={{ backgroundColor: color, animationDelay: '150ms' }}
                    ></span>
                    <span
                        className="w-1 h-1 rounded-full animate-bounce"
                        style={{ backgroundColor: color, animationDelay: '300ms' }}
                    ></span>
                </span>
            </div>
        </div>
    );
}
