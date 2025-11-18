'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletButton } from '@/components/ui/wallet-button';
import { Moon } from 'lucide-react';
import { Button } from 'react95';
import styled from 'styled-components';

const LogoText = styled.span`
  color: #7A8CFF;
  font-weight: bold;
  letter-spacing: 0.05em;
  font-size: inherit;
  font-family: var(--font-space-grotesk), sans-serif;
  text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.3);
`;

const StyledButton = styled(Button)`
  background-color: #11121A;
  color: #7A8CFF;
  border: 2px solid;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  width: 100%;

  &:active {
    padding: 0.5rem 1rem;
  }

  @media (min-width: 768px) {
    width: auto;
  }
`;

export function Nav() {
  const pathname = usePathname();
  const isHomePage = pathname === '/';

  const isActive = (path: string) => {
    return pathname === path;
  };

  return (
    <nav style={{ backgroundColor: '#0A0A0F', borderBottom: '2px solid #6C4DFF', padding: '0.75rem 1rem' }}>
      {/* Mobile layout */}
      <div className="flex flex-col gap-3 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 text-xl" style={{ color: '#F2F3F7' }}>
            <Moon size={32} strokeWidth={1.5} color="#7A8CFF" />
            <LogoText>WHISPER</LogoText>
          </Link>
          <WalletButton />
        </div>
        {!isHomePage && (
          <div className="flex gap-2">
            <Link href="/chat" style={{ flex: 1 }}>
              <StyledButton
                style={{
                  borderColor: isActive('/chat') ? '#7A8CFF' : '#6C4DFF'
                }}
              >
                [CHAT]
              </StyledButton>
            </Link>
            <Link href="/account" style={{ flex: 1 }}>
              <StyledButton
                style={{
                  borderColor: isActive('/account') ? '#7A8CFF' : '#6C4DFF'
                }}
              >
                [ACCOUNT]
              </StyledButton>
            </Link>
          </div>
        )}
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex items-center justify-between gap-4 w-full">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 text-2xl" style={{ color: '#F2F3F7' }}>
            <Moon size={40} strokeWidth={1.5} color="#7A8CFF" />
            <LogoText>WHISPER</LogoText>
          </Link>

          {!isHomePage && (
            <div className="flex gap-4">
              <Link href="/chat">
                <StyledButton
                  style={{
                    borderColor: isActive('/chat') ? '#7A8CFF' : '#6C4DFF'
                  }}
                >
                  [CHAT]
                </StyledButton>
              </Link>

              <Link href="/account">
                <StyledButton
                  style={{
                    borderColor: isActive('/account') ? '#7A8CFF' : '#6C4DFF'
                  }}
                >
                  [ACCOUNT]
                </StyledButton>
              </Link>
            </div>
          )}
        </div>

        <WalletButton />
      </div>
    </nav>
  );
}
