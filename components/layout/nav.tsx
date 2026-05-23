'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { WalletButton } from '@/components/ui/wallet-button';
import styled from 'styled-components';

const LogoText = styled.span.attrs({ title: 'SOLCHAT' })`
  color: #333333;
  -webkit-text-fill-color: transparent;
  position: relative;
  display: inline-block;
  font-weight: bold;
  letter-spacing: 0.05em;
  font-size: inherit;

  &::before {
    content: attr(title);
    position: absolute;
    left: 0;
    top: 0;
    z-index: 2;
    background: linear-gradient(to right, #10b981 0%, #22c55e 20%, #4ade80 40%, #86efac 60%, #4ade80 80%, #16a34a 100%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  &::after {
    content: attr(title);
    position: absolute;
    left: -4px;
    bottom: -6px;
    z-index: 1;
    -webkit-text-fill-color: rgba(0, 100, 0, 0.4);
    transform: skew(40deg, 0deg) scaleY(0.5);
  }
`;

const StyledButton = styled.button.attrs({ type: 'button' })`
  background-color: black;
  color: #4ade80;
  border: 2px solid #16a34a;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  width: 100%;
  font-family: inherit;
  font-weight: bold;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.1s ease;

  &:hover:not(:disabled) {
    border-color: #4ade80;
  }

  &:active:not(:disabled) {
    transform: translateY(1px);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (min-width: 768px) {
    width: auto;
  }
`;

const GearButton = styled.button.attrs({ type: 'button', title: 'Gateway Settings' })`
  background-color: black;
  border: 2px solid #16a34a;
  color: #4ade80;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: bold;
  letter-spacing: 0.05em;
  height: 100%;
  padding: 0.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.1s ease;
  &:hover { border-color: #4ade80; }
  &:active { transform: translateY(1px); }
`;

function GatewaySettings({ open }: { open: boolean }) {
  if (!open) return null;
  const saved = typeof window !== 'undefined' ? localStorage.getItem('solchat_gateway') || '' : '';
  return (
    <div className="bg-black border-b-2 border-green-600 px-4 py-2 text-xs text-green-400 flex flex-wrap items-center gap-2">
      <span className="text-green-600 uppercase tracking-wider">Gateway</span>
      <input
        id="gw-input"
        defaultValue={saved}
        placeholder="https://gateway.iqlabs.dev"
        className="flex-1 min-w-0 bg-black border border-green-800 text-green-400 px-2 py-1 text-xs font-mono outline-none focus:border-green-400"
      />
      <button
        type="button"
        onClick={() => {
          const v = (document.getElementById('gw-input') as HTMLInputElement).value.trim();
          if (v) localStorage.setItem('solchat_gateway', v);
          else localStorage.removeItem('solchat_gateway');
          window.location.reload();
        }}
        className="border border-green-800 text-green-400 px-2 py-1 text-xs uppercase tracking-wider hover:border-green-400 cursor-pointer bg-transparent"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => { localStorage.removeItem('solchat_gateway'); window.location.reload(); }}
        className="border border-green-800 text-green-400 px-2 py-1 text-xs uppercase tracking-wider hover:border-green-400 cursor-pointer bg-transparent"
      >
        Reset
      </button>
      <span className="text-green-800 text-xs ml-auto">
        Run your own: <a href="https://github.com/IQCoreTeam/iq-gateway" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-400">iq-gateway</a>
      </span>
    </div>
  );
}

type NavProps = {
  onOpenDm?: () => void;
};

export function Nav({ onOpenDm }: NavProps) {
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isActive = (path: string) => {
    return pathname === path;
  };

  return (
    <nav className="bg-black border-b-2 border-green-600 p-3 md:p-4">
      {/* Mobile layout */}
      <div className="flex flex-col gap-3 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 text-green-400 text-xl   ">
            <Image src="/iq_logo.svg" alt="IQ Labs" width={32} height={32} style={{ width: 'auto', height: '32px' }} />
            <LogoText>SOLCHAT</LogoText>
          </Link>
          <div className="flex items-center gap-2">
            <WalletButton />
            <GearButton onClick={() => setSettingsOpen(!settingsOpen)}>⚙</GearButton>
          </div>
        </div>
        {!isHomePage && (
          <div className="flex gap-2">
            <Link href="/chat" style={{ flex: 1 }}>
              <StyledButton
                style={{
                  borderColor: isActive('/chat') ? '#4ade80' : '#16a34a'
                }}
              >
                [CHAT]
              </StyledButton>
            </Link>
            <Link href="/friends" style={{ flex: 1 }}>
              <StyledButton
                style={{
                  borderColor: isActive('/friends') ? '#4ade80' : '#16a34a'
                }}
              >
                [FRIENDS]
              </StyledButton>
            </Link>
            <a
              href="https://profile.iqlabs.dev"
              target="_blank"
              rel="noopener noreferrer"
              style={{ flex: 1 }}
            >
              <StyledButton style={{ borderColor: '#16a34a' }}>
                [PROFILE]
              </StyledButton>
            </a>
            <Link href="/account" style={{ flex: 1 }}>
              <StyledButton
                style={{
                  borderColor: isActive('/account') ? '#4ade80' : '#16a34a'
                }}
              >
                [ACCOUNT]
              </StyledButton>
            </Link>
            {onOpenDm && (
              <button type="button" onClick={onOpenDm} style={{ flex: 1 }}>
                <StyledButton
                  style={{
                    borderColor: '#16a34a'
                  }}
                >
                  [DM]
                </StyledButton>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex items-center justify-between gap-4 w-full">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 text-green-400 text-2xl   ">
            <Image src="/iq_logo.svg" alt="IQ Labs" width={40} height={40} style={{ width: 'auto', height: '40px' }} />
            <LogoText>SOLCHAT</LogoText>
          </Link>

          {!isHomePage && (
            <div className="flex gap-4">
              <Link href="/chat">
                <StyledButton
                  style={{
                    borderColor: isActive('/chat') ? '#4ade80' : '#16a34a'
                  }}
                >
                  [CHAT]
                </StyledButton>
              </Link>

              <Link href="/friends">
                <StyledButton
                  style={{
                    borderColor: isActive('/friends') ? '#4ade80' : '#16a34a'
                  }}
                >
                  [FRIENDS]
                </StyledButton>
              </Link>

              <a
                href="https://profile.iqlabs.dev"
                target="_blank"
                rel="noopener noreferrer"
              >
                <StyledButton style={{ borderColor: '#16a34a' }}>
                  [PROFILE]
                </StyledButton>
              </a>

              <Link href="/account">
                <StyledButton
                  style={{
                    borderColor: isActive('/account') ? '#4ade80' : '#16a34a'
                  }}
                >
                  [ACCOUNT]
                </StyledButton>
              </Link>

              {onOpenDm && (
                <button type="button" onClick={onOpenDm}>
                  <StyledButton
                    style={{
                      borderColor: '#16a34a'
                    }}
                  >
                    [DM]
                  </StyledButton>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <WalletButton />
          <GearButton onClick={() => setSettingsOpen(!settingsOpen)}>⚙</GearButton>
        </div>
      </div>
      <GatewaySettings open={settingsOpen} />
    </nav>
  );
}
