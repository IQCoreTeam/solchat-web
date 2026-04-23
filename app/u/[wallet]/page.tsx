/**
 * Profile deep-link route.
 * Visiting /u/<walletAddress> renders the chat page with the profile modal
 * opened for that wallet. Closing the modal returns to "/chat".
 */

import ChatPage from '../../chat/page';
import { ProfileRouteModal } from './profile-route-modal';

type ProfileRouteProps = {
  params: Promise<{ wallet: string }>;
};

export default async function ProfilePage({ params }: ProfileRouteProps) {
  const { wallet } = await params;
  return (
    <>
      <ChatPage />
      <ProfileRouteModal walletAddress={wallet} />
    </>
  );
}
