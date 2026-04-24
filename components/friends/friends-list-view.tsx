'use client';

import type { Friend } from '@/lib/friends/types';
import { FriendCard } from './friend-card';
import { Button, Cutout, Window, WindowContent } from 'react95';

type Tab = 'all' | 'pending' | 'blocked';

type FriendsListViewProps = {
  error: string | null;
  friendsError: string | null;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onOpenAddFriend: () => void;
  userAddress: string | null;
  loading: boolean;
  filteredFriends: Friend[];
  onApprove: (friend: Friend) => void;
  onBlock: (friend: Friend) => void;
  onUnblock: (friend: Friend) => void;
  onOpenChat: (friend: Friend) => void;
};

export function FriendsListView({
  error,
  friendsError,
  activeTab,
  setActiveTab,
  onOpenAddFriend,
  userAddress,
  loading,
  filteredFriends,
  onApprove,
  onBlock,
  onUnblock,
  onOpenChat,
}: FriendsListViewProps) {
  const combinedError = error || friendsError;

  return (
    <Window style={{ width: '100%', marginBottom: '20px' }}>
      <WindowContent>
        <div style={{ padding: '8px' }}>
          {/* Error Banner */}
          {combinedError && (
            <Cutout style={{ padding: '8px', marginBottom: '16px', background: '#330000' }}>
              <p style={{ color: '#ff0000', fontSize: '12px' }}>
                ERROR: {combinedError}
              </p>
            </Cutout>
          )}

          {/* Tabs and Add Friend Button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {([
                { value: 'all', label: '[FRIENDS]' },
                { value: 'pending', label: '[REQUESTS]' },
                { value: 'blocked', label: '[BLOCKED]' },
              ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActiveTab(value)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    border: '2px solid',
                    borderColor: activeTab === value ? '#4ade80' : '#16a34a',
                    backgroundColor:
                      activeTab === value ? 'rgba(74, 222, 128, 0.15)' : 'rgba(0,0,0,0.6)',
                    color: activeTab === value ? '#4ade80' : '#d1fae5',
                    boxShadow:
                      activeTab === value ? '0 0 10px rgba(74, 222, 128, 0.35)' : 'none',
                    cursor: 'pointer',
                    transition:
                      'border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button
              onClick={onOpenAddFriend}
              disabled={!userAddress}
              primary
              style={{ fontSize: '11px', marginLeft: '12px' }}
            >
              [ADD FRIEND]
            </Button>
          </div>

          <div style={{ marginTop: '16px', minHeight: '300px' }}>
            {/* Loading state */}
            {loading && (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <p style={{ color: '#00ff00' }}>[LOADING...]</p>
              </div>
            )}

            {/* Empty state */}
            {!loading && filteredFriends.length === 0 && (
              <Cutout style={{ padding: '48px 16px', textAlign: 'center' }}>
                <p style={{ color: '#00ff00', fontSize: '12px' }}>
                  {activeTab === 'all' && '> NO FRIENDS YET. ADD SOMEONE ABOVE!'}
                  {activeTab === 'pending' && '> NO PENDING REQUESTS'}
                  {activeTab === 'blocked' && '> NO BLOCKED USERS'}
                </p>
              </Cutout>
            )}

            {/* Friends list */}
            {!loading && filteredFriends.length > 0 && (
              <div style={{ display: 'grid', gap: '12px' }}>
                {filteredFriends.map((friend) => (
                  <FriendCard
                    key={friend.tableAddress}
                    friend={friend}
                    currentUser={userAddress || ''}
                    onApprove={onApprove}
                    onBlock={onBlock}
                    onUnblock={onUnblock}
                    onOpenChat={onOpenChat}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </WindowContent>
    </Window>
  );
}
