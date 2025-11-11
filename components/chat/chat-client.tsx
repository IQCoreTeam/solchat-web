'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import chat interface to avoid SSR wallet context issues
const ChatInterfaceDynamic = dynamic(
  () => import('./chat-interface').then((mod) => ({ default: mod.ChatInterface })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="text-green-400 font-mono">Loading chat...</div>
      </div>
    ),
  }
);

export function ChatClient() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-green-400 font-mono">Loading chat...</div>
      </div>
    );
  }

  return <ChatInterfaceDynamic />;
}
