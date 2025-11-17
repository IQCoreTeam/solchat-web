import { Nav } from '@/components/layout/nav';
import { ChatClient } from '@/components/chat/chat-client';

export default function ChatPage() {
  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden">
      <Nav />
      <main className="flex-1 flex flex-col max-w-7xl w-full mx-auto overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <ChatClient />
        </div>
      </main>
    </div>
  );
}
