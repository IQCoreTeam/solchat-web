'use client';

import { useRef, useEffect } from 'react';

interface TerminalProps {
  lines: string[];
  className?: string;
}

export function Terminal({ lines, className = '' }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={terminalRef}
      className={`bg-black text-green-400 font-mono text-sm p-4 overflow-y-auto border-2 border-green-600 ${className}`}
      style={{ fontFamily: 'monospace' }}
    >
      {lines.map((line, index) => (
        <div key={index} className="whitespace-pre-wrap break-words">
          {line}
        </div>
      ))}
    </div>
  );
}
