'use client';

import { useRouter } from 'next/navigation';
import { ProfileModal } from '@/components/users/profile-modal';

export function ProfileRouteModal({ walletAddress }: { walletAddress: string }) {
  const router = useRouter();
  return <ProfileModal walletAddress={walletAddress} onClose={() => router.push('/')} />;
}
