import { Nav } from '@/components/layout/nav';
import { ChatClient } from '@/components/chat/chat-client';
import { MobileWalletBanner } from '@/components/mobile/mobile-wallet-banner';

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Nav />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4">
        <MobileWalletBanner />
        <ChatClient />
      </main>
    </div>
  );
}
