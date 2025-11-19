/**
 * Friends Page
 * - Main friends/DM management page
 */

import { FriendsList } from '@/components/friends/friends-list';
import { Nav } from '@/components/layout/nav';

export default function FriendsPage() {
  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-black via-[#001a00] to-[#002100]">
      <Nav />
      <FriendsList />
    </div>
  );
}
