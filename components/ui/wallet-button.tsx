'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useEffect, useState, useRef } from 'react';
import { Button, Window, WindowHeader, WindowContent } from 'react95';
import styled from 'styled-components';

const PANEL_WIDTH_CLASS = 'w-full sm:w-[180px]';

const StyledButton = styled(Button)`
  background-color: #11121A;
  color: #7A8CFF;
  border: 2px solid #6C4DFF;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  width: auto;
  min-width: 140px;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    border-color: #7A8CFF;
  }

  &:active {
    padding: 0.5rem 1rem;
  }
`;

const DropdownWindow = styled(Window)`
  position: absolute;
  right: 0;
  margin-top: 0.5rem;
  width: 240px;
  z-index: 50;
  box-shadow: 0 10px 15px -3px rgba(108, 77, 255, 0.3);
`;

const StyledWindowHeader = styled(WindowHeader)`
  background: linear-gradient(to right, #6C4DFF, #7A8CFF);
  color: #F2F3F7;
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

const StyledButton95 = styled(Button)<{ $variant?: 'danger' }>`
  font-size: 0.875rem;
  width: 100%;
  margin-bottom: 0.5rem;
  background-color: ${props => props.$variant === 'danger' ? '#dc2626' : '#c0c0c0'};
  color: ${props => props.$variant === 'danger' ? 'white' : 'black'};
  font-weight: bold;

  &:last-child {
    margin-bottom: 0;
  }

  &:active {
    background-color: ${props => props.$variant === 'danger' ? '#b91c1c' : '#a0a0a0'};
  }
`;

export function WalletButton() {
  const { wallet, publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleCopyAddress = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setDropdownOpen(false);
  };

  if (!mounted) {
    return (
      <StyledButton disabled style={{ opacity: 0.5 }}>
        [LOADING...]
      </StyledButton>
    );
  }

  // Not connected - show connect button
  if (!publicKey || !wallet) {
    return (
      <StyledButton
        onClick={() => setVisible(true)}
        disabled={connecting}
        style={{ opacity: connecting ? 0.5 : 1 }}
      >
        {connecting ? '[CONNECTING...]' : '[CONNECT WALLET]'}
      </StyledButton>
    );
  }

  // Connected - show dropdown
  const shortAddress = `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`;

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
            <AddressBox>
              <AddressLabel>[ADDRESS]</AddressLabel>
              <AddressText>{shortAddress}</AddressText>
            </AddressBox>
            <StyledButton95 onClick={handleCopyAddress}>
              {copied ? '[✓ COPIED]' : '[COPY ADDRESS]'}
            </StyledButton95>
            <StyledButton95 $variant="danger" onClick={handleDisconnect}>
              [DISCONNECT]
            </StyledButton95>
          </StyledWindowContent>
        </DropdownWindow>
      )}
    </div>
  );
}
