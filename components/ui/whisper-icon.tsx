export function WhisperIcon({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="whisperGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#6C4DFF', stopOpacity: 1 }} />
          <stop offset="50%" style={{ stopColor: '#7A8CFF', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#00E0E0', stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      {/* Crescent Moon */}
      <path
        d="M50 10 C 27.9 10 10 27.9 10 50 C 10 72.1 27.9 90 50 90 C 55 90 59.8 89.1 64.3 87.4 C 49.7 80.5 40 65.8 40 48.5 C 40 28.1 54.5 11.5 73 8.5 C 66.3 8.9 58.3 10 50 10 Z"
        fill="url(#whisperGradient)"
        style={{ filter: 'drop-shadow(0 0 10px rgba(108, 77, 255, 0.6))' }}
      />
    </svg>
  );
}
