'use client';

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

type NavProps = {
  onOpenDm?: () => void;
};

export function Nav({ onOpenDm }: NavProps) {
  const pathname = usePathname();
  const isHomePage = pathname === '/';

  const isActive = (path: string) => {
    return pathname === path;
  };

  return (
    <nav className="bg-black border-b-2 border-green-600 p-3 md:p-4">
      {/* Mobile layout */}
      <div className="flex flex-col gap-3 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 text-green-400 text-xl   ">
            <Image src="/iq_logo.svg" alt="IQ Labs" width={32} height={32} />
            <LogoText>SOLCHAT</LogoText>
          </Link>
          <WalletButton />
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
            <Image src="/iq_logo.svg" alt="IQ Labs" width={40} height={40} />
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

        <WalletButton />
      </div>
    </nav>
  );
}
