/**
 * Friends Page
 * - Main friends/DM management page
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { FriendsList } from '@/components/friends/friends-list';
import { Nav } from '@/components/layout/nav';

function FriendsContent() {
  const searchParams = useSearchParams();
  const dm = searchParams.get('dm') ?? undefined;

  return <FriendsList dmQueryAddress={dm} />;
}

export default function FriendsPage() {
  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-black via-[#001a00] to-[#002100]">
      <Nav />
      <Suspense fallback={<div className="flex-1" />}>
        <FriendsContent />
      </Suspense>
    </div>
  );
}
