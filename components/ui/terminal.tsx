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
      className={`bg-[#0A0A0F] text-[#7A8CFF]   text-sm p-4 overflow-y-auto border-2 border-[#6C4DFF] ${className}`}

    >
      {lines.map((line, index) => (
        <div key={index} className="whitespace-pre-wrap break-words">
          {line}
        </div>
      ))}
    </div>
  );
}
