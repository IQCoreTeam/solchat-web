/**
 * Users Profile Page
 * Test Zo's theory - User profiles stored in onchain metadata
 */

'use client';

import { UserProfileManager } from '@/components/users/user-profile-manager';

export default function UsersPage() {
  return (
    <div className="min-h-screen bg-black">
      <UserProfileManager />
    </div>
  );
}
