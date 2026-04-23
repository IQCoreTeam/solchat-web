/**
 * Profile deep-link route.
 * Visiting /u/<walletAddress> renders the home page with the profile modal
 * opened for that wallet. Closing the modal returns to "/".
 */

import { Footer } from '@/components/layout/footer';
import { HomeWindow } from '@/components/home/home-window';
import { ProfileRouteModal } from './profile-route-modal';

type ProfileRouteProps = {
  params: Promise<{ wallet: string }>;
};

export default async function ProfilePage({ params }: ProfileRouteProps) {
  const { wallet } = await params;
  return (
    <div className="flex flex-col" style={{ minHeight: '100vh' }}>
      <HomeWindow />
      <Footer />
      <ProfileRouteModal walletAddress={wallet} />
    </div>
  );
}
