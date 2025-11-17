'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { WalletButton } from '@/components/ui/wallet-button';
import { Button } from 'react95';
import styled from 'styled-components';

const LogoText = styled.span`
  font-family: 'MS Sans Serif', 'Microsoft Sans Serif', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-weight: bold;
  letter-spacing: 0.05em;
  text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.3);
`;

const StyledButton = styled(Button)`
  font-family: 'Courier New', monospace;
  background-color: black;
  color: #4ade80;
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
    <nav className="bg-black border-b-2 border-green-600 p-3 md:p-4">
      {/* Mobile layout */}
      <div className="flex flex-col gap-3 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 text-green-400 text-xl font-bold">
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
            <Link href="/account" style={{ flex: 1 }}>
              <StyledButton
                style={{
                  borderColor: isActive('/account') ? '#4ade80' : '#16a34a'
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
          <Link href="/" className="flex items-center gap-3 text-green-400 text-2xl font-bold">
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

              <Link href="/account">
                <StyledButton
                  style={{
                    borderColor: isActive('/account') ? '#4ade80' : '#16a34a'
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
