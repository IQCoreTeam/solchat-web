import { Nav } from '@/components/layout/nav';
import { AccountClient } from '@/components/account/account-client';
import { PrivyDebug } from '@/components/debug/privy-debug';

export default function AccountPage() {
  return (
    <div className="min-h-screen bg-black">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 pt-4">
        <AccountClient />
      </main>
      {process.env.NODE_ENV === 'development' && <PrivyDebug />}
    </div>
  );
}
