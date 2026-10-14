'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { WalletConnectionStatus } from './wallet-connection-status';
import { Window, WindowHeader, WindowContent } from 'react95';
import styled from 'styled-components';
import { useAppWallet } from '@/lib/wallet/use-app-wallet';
import { useWalletMode } from '@/lib/wallet/wallet-mode';
import { WalletConnectModal } from './wallet-connect-modal';

const formatShortAddress = (key: { toBase58(): string }) => {
  const address = key.toBase58();
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

const StyledButton = styled.button.attrs({ type: 'button' })`
  font-family: inherit;
  cursor: pointer;
  appearance: none;
  background-color: black;
  color: #4ade80;
  border: 2px solid #16a34a;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  width: auto;
  min-width: 180px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  &:hover:not(:disabled) {
    border-color: #4ade80;
  }

  &:active:not(:disabled) {
    transform: translateY(1px);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const DropdownWindow = styled(Window)`
  position: absolute;
  right: 0;
  margin-top: 0.5rem;
  width: 240px;
  z-index: 50;
  box-shadow: 0 10px 15px -3px rgba(74, 222, 128, 0.2);
`;

const StyledWindowHeader = styled(WindowHeader)`
  background: linear-gradient(to right, #16a34a, #4ade80);
  color: black;
  font-size: 0.75rem;
  font-weight: bold;
`;

const StyledWindowContent = styled(WindowContent)`
  background-color: #c0c0c0;
  padding: 0.5rem;
`;

const AddressBox = styled.div`
  background-color: white;
  border: 2px inset #808080;
  padding: 0.5rem;
  margin-bottom: 0.75rem;
`;

const AddressLabel = styled.div`
  font-size: 0.65rem;
  color: #000;
  font-weight: bold;
  margin-bottom: 0.25rem;
`;

const AddressText = styled.div`
  font-size: 0.75rem;
  color: #000;
  font-weight: bold;
`;

const StyledButton95 = styled.button.attrs({ type: 'button' })<{ $variant?: 'danger' }>`
  width: 100%;
  margin-bottom: 0.5rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.875rem;
  font-weight: bold;
  font-family: inherit;
  border: 2px solid ${props => (props.$variant === 'danger' ? '#7f1d1d' : '#6b7280')};
  color: ${props => (props.$variant === 'danger' ? '#fff' : '#000')};
  background-color: ${props => (props.$variant === 'danger' ? '#dc2626' : '#c0c0c0')};
  cursor: pointer;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  &:active:not(:disabled) {
    filter: brightness(0.95);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

export function WalletButton() {
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fundingCopied, setFundingCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { ready, authenticated, logout } = usePrivy();
  const { mode, setMode } = useWalletMode();
  const appWallet = useAppWallet();
  const externalWallet = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const handleCopyMain = async () => {
    if (!appWallet.publicKey) return;
    try {
      await navigator.clipboard.writeText(appWallet.publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const handleCopyFunding = async () => {
    if (!externalWallet.publicKey) return;
    try {
      await navigator.clipboard.writeText(externalWallet.publicKey.toBase58());
      setFundingCopied(true);
      setTimeout(() => setFundingCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy funding address:', error);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (mode === 'privy' && authenticated) {
        await logout();
      }
      if (mode === 'wallet' && externalWallet.connected) {
        await externalWallet.disconnect();
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
    } finally {
      setMode(null);
      setDropdownOpen(false);
    }
  };

  const handleOpenAccount = () => {
    setDropdownOpen(false);
    router.push('/account');
  };

  const handleManageFundingWallet = () => {
    setDropdownOpen(false);
    setWalletModalVisible(true);
  };

  if (!mounted || !ready) {
    return (
      <StyledButton disabled>
        [LOADING...]
      </StyledButton>
    );
  }

  if (!appWallet.connected) {
    return (
      <>
        <StyledButton disabled={mode === 'wallet' && externalWallet.connecting} onClick={() => setConnectModalOpen(true)}>
          {mode === 'wallet' && externalWallet.connecting ? '[CONNECTING…]' : '[CONNECT WALLET]'}
        </StyledButton>
        {mode === 'wallet' && <WalletConnectionStatus />}
        <WalletConnectModal open={connectModalOpen} onClose={() => setConnectModalOpen(false)} />
      </>
    );
  }

  // Privy authenticated but embedded wallet not yet provisioned
  if (mode === 'privy' && !appWallet.publicKey) {
    return (
      <StyledButton onClick={handleOpenAccount}>
        [CREATE PRIVY WALLET TO START]
      </StyledButton>
    );
  }

  if (!appWallet.publicKey) return null;

  const shortAddress = formatShortAddress(appWallet.publicKey);
  const fundingShortAddress = externalWallet.publicKey
    ? formatShortAddress(externalWallet.publicKey)
    : null;

  const isPrivyMode = mode === 'privy';
  const mainLabel = isPrivyMode ? '[PRIVY WALLET]' : '[SOLANA WALLET]';
  const copyMainLabel = isPrivyMode ? '[COPY PRIVY ADDRESS]' : '[COPY ADDRESS]';

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={dropdownRef}>
      <StyledButton onClick={() => setDropdownOpen(!dropdownOpen)}>
        <span>{shortAddress}</span>
        <svg
          style={{
            width: '1rem',
            height: '1rem',
            transition: 'transform 0.2s',
            transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)'
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </StyledButton>

      {dropdownOpen && (
        <DropdownWindow>
          <StyledWindowHeader>[WALLET]</StyledWindowHeader>
          <StyledWindowContent>
            <div className="space-y-2">
              <AddressLabel>{mainLabel}</AddressLabel>
              <AddressBox>
                <AddressLabel>[ADDRESS]</AddressLabel>
                <AddressText>{shortAddress}</AddressText>
              </AddressBox>
              <StyledButton95 onClick={handleCopyMain}>
                {copied ? '[✓ COPIED]' : copyMainLabel}
              </StyledButton95>
              {isPrivyMode && (
                <>
                  <StyledButton95 onClick={handleOpenAccount}>
                    [MANAGE PRIVY WALLET]
                  </StyledButton95>
                  <div style={{ height: '1px', background: '#6b7280', margin: '0.35rem 0' }} />
                  <AddressLabel>[FUNDING WALLET]</AddressLabel>
                  <AddressBox>
                    <AddressLabel>[ADDRESS]</AddressLabel>
                    <AddressText>{fundingShortAddress || 'Connect funding wallet'}</AddressText>
                  </AddressBox>
                  <StyledButton95 onClick={handleCopyFunding} disabled={!externalWallet.connected}>
                    {externalWallet.connected
                      ? (fundingCopied ? '[✓ COPIED]' : '[COPY FUNDING ADDRESS]')
                      : '[COPY FUNDING ADDRESS]'}
                  </StyledButton95>
                  <StyledButton95 onClick={handleManageFundingWallet}>
                    {externalWallet.connected ? '[MANAGE FUNDING WALLET]' : '[CONNECT FUNDING WALLET]'}
                  </StyledButton95>
                </>
              )}
            </div>
            <StyledButton95 $variant="danger" onClick={handleDisconnect}>
              [DISCONNECT]
            </StyledButton95>
          </StyledWindowContent>
        </DropdownWindow>
      )}
    </div>
  );
}
