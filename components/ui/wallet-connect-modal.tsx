'use client';

import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Window, WindowHeader, WindowContent } from 'react95';
import styled from 'styled-components';
import { useWalletMode } from '@/lib/wallet/wallet-mode';

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;

const ModalWindow = styled(Window)`
  width: 100%;
  max-width: 460px;
  box-shadow: 0 10px 25px -5px rgba(74, 222, 128, 0.3);
`;

const StyledWindowHeader = styled(WindowHeader)`
  background: linear-gradient(to right, #16a34a, #4ade80);
  color: black;
  font-size: 0.8rem;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const CloseButton = styled.button.attrs({ type: 'button' })`
  background: #c0c0c0;
  border-top: 2px solid #fff;
  border-left: 2px solid #fff;
  border-right: 2px solid #000;
  border-bottom: 2px solid #000;
  color: #000;
  font-family: inherit;
  font-weight: bold;
  font-size: 0.85rem;
  line-height: 1;
  width: 1.4rem;
  height: 1.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  &:active {
    border-top: 2px solid #000;
    border-left: 2px solid #000;
    border-right: 2px solid #fff;
    border-bottom: 2px solid #fff;
  }
`;

const StyledWindowContent = styled(WindowContent)`
  background-color: #c0c0c0;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const Card = styled.button.attrs({ type: 'button' })`
  text-align: left;
  background-color: black;
  color: #4ade80;
  border: 2px solid #16a34a;
  padding: 0.75rem 0.9rem;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;

  &:hover:not(:disabled) { border-color: #4ade80; }
  &:active:not(:disabled) { transform: translateY(1px); }
  &:disabled { cursor: not-allowed; opacity: 0.6; }
`;

const CardTitle = styled.div`
  font-size: 0.85rem;
  font-weight: bold;
  letter-spacing: 0.05em;
`;

const CardBody = styled.div`
  font-size: 0.7rem;
  color: #86efac;
  line-height: 1.4;
`;

const CardBadge = styled.span`
  display: inline-block;
  font-size: 0.6rem;
  background: #16a34a;
  color: black;
  padding: 0.1rem 0.4rem;
  margin-left: 0.4rem;
  font-weight: bold;
`;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function WalletConnectModal({ open, onClose }: Props) {
  const { ready, login } = usePrivy();
  const { setVisible } = useWalletModal();
  const { setMode } = useWalletMode();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handlePrivy = async () => {
    if (!ready) return;
    setMode('privy');
    onClose();
    try {
      await login();
    } catch (error) {
      console.error('Failed to start Privy login:', error);
    }
  };

  const handleSolanaWallet = () => {
    setMode('wallet');
    onClose();
    setVisible(true);
  };

  return (
    <Backdrop onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        <ModalWindow>
          <StyledWindowHeader>
            <span>[CONNECT WALLET]</span>
            <CloseButton onClick={onClose} aria-label="Close">×</CloseButton>
          </StyledWindowHeader>
          <StyledWindowContent>
            <Card onClick={handleSolanaWallet}>
              <CardTitle>[SOLANA WALLET]</CardTitle>
              <CardBody>
                Connect Phantom, Solflare, Torus or Ledger. Your wallet signs every
                transaction and message (one popup per action).
              </CardBody>
            </Card>

            <Card onClick={handlePrivy} disabled={!ready}>
              <CardTitle>
                [PRIVY WALLET]
                <CardBadge>NO SIGNING POPUP</CardBadge>
              </CardTitle>
              <CardBody>
                Sign in with email or SMS. An embedded Solana wallet is created for you,
                and transactions are auto-signed — no per-action signature popup.
              </CardBody>
            </Card>
          </StyledWindowContent>
        </ModalWindow>
      </div>
    </Backdrop>
  );
}
