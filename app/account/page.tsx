import { Nav } from '@/components/layout/nav';
import { Footer } from '@/components/layout/footer';
import { AccountClient } from '@/components/account/account-client';
import { PrivyDebug } from '@/components/debug/privy-debug';

export default function AccountPage() {
  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Nav />
      <main className="flex-1 max-w-7xl mx-auto px-4 pt-4 w-full">
        <AccountClient />
      </main>
      {process.env.NODE_ENV === 'development' && <PrivyDebug />}
      <Footer />
    </div>
  );
}
