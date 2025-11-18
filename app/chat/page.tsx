'use client';

import { useCallback, useState } from 'react';
import { Nav } from '@/components/layout/nav';
import { Footer } from '@/components/layout/footer';
import { ChatClient } from '@/components/chat/chat-client';

export default function ChatPage() {
  const [dmOpen, setDmOpen] = useState(false);

  const handleOpenDm = useCallback(() => setDmOpen(true), []);
  const handleCloseDm = useCallback(() => setDmOpen(false), []);

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden">
      <Nav onOpenDm={handleOpenDm} />
      <main className="flex-1 flex flex-col max-w-7xl w-full mx-auto overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <ChatClient dmModalOpen={dmOpen} onCloseDm={handleCloseDm} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
