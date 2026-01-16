/**
 * Friends Page
 * - Main friends/DM management page
 */

import { FriendsList } from '@/components/friends/friends-list';
import { Nav } from '@/components/layout/nav';

type FriendsPageProps = {
  searchParams: { [key: string]: string | string[] | undefined };
};

export default function FriendsPage({ searchParams }: FriendsPageProps) {
  const params = searchParams;
  const dm = typeof params?.dm === 'string' ? params.dm : undefined;

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-black via-[#001a00] to-[#002100]">
      <Nav />
      <FriendsList dmQueryAddress={dm} />
    </div>
  );
}
