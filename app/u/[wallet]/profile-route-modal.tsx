'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProfileModal } from '@/components/users/profile-modal';

export function ProfileRouteModal({ walletAddress }: { walletAddress: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  if (!open) return null;

  return (
    <ProfileModal
      walletAddress={walletAddress}
      onClose={() => {
        setOpen(false);
        router.replace('/chat', { scroll: false });
      }}
    />
  );
}
