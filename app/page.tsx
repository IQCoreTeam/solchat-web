'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Footer } from '@/components/layout/footer';
import { ThemeProvider } from 'styled-components';
import { Window, WindowHeader, WindowContent, Button, Panel, Frame, GroupBox, Fieldset, Monitor, Tooltip } from 'react95';
import styled from 'styled-components';
import matrix from 'react95/dist/themes/matrix';
import toner from 'react95/dist/themes/toner';

const DesktopBackground = styled.div`
  background: linear-gradient(135deg, #002100 0%, #001a00 100%);
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 2rem 1rem;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 0, 0.03) 2px, rgba(0, 255, 0, 0.03) 4px);
    pointer-events: none;
  }
`;

const CenteredContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  z-index: 1;
`;

const StyledWindow = styled(Window)`
  max-width: 600px;
  width: 100%;
  box-shadow: 4px 4px 20px rgba(0, 0, 0, 0.8);
  border: 2px solid #16a34a;
`;

const StyledWindowHeader = styled(WindowHeader)`
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  font-family: 'MS Sans Serif', sans-serif;
  font-weight: bold;
  background: linear-gradient(to right, #16a34a, #4ade80);
  color: black;
  padding: 0;
  gap: 2px;
  height: 24px;
`;

const WindowButton = styled.button`
  width: 24px;
  height: 100%;
  background: #c0c0c0;
  border: 2px solid;
  border-color: #ffffff #000000 #000000 #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  padding: 0;
  margin: 0;
  line-height: 0;
  font-family: 'MS Sans Serif', sans-serif;

  &:active {
    border-color: #000000 #ffffff #ffffff #000000;
  }
`;

const StyledWindowContent = styled(WindowContent)`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  padding: 2rem 2rem 0.5rem 2rem;
  background: #1a1a1a;

  > *:last-child {
    margin-top: -1rem;
  }
`;

const WelcomeText = styled.div`
  font-family: 'MS Sans Serif', 'Microsoft Sans Serif', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-size: 1.5rem;
  font-weight: bold;
  text-align: center;
  color: #4ade80;
  margin-bottom: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.3);
`;

const RainbowText = styled.span.attrs({ title: 'SolChat' })`
  color: #333333;
  -webkit-text-fill-color: transparent;
  position: relative;
  display: inline-block;
  font-weight: bold;
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
    left: -6px;
    bottom: -10px;
    z-index: 1;
    -webkit-text-fill-color: #000000;
    transform: skew(40deg, 0deg) scaleY(0.5);
    opacity: 0.3;
  }
`;

const MonitorScreen = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.15rem 1.4rem;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0.4rem;
    bottom: 0.7rem;
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 0, 0.1) 2px, rgba(0, 255, 0, 0.1) 4px);
    pointer-events: none;
    animation: scanlines 8s linear infinite;
    z-index: 1;
  }

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0.4rem;
    bottom: 0.7rem;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgba(0, 255, 0, 0.15) 50%,
      transparent 100%
    );
    background-size: 100% 100px;
    animation: scan 3s linear infinite;
    pointer-events: none;
    z-index: 1;
  }

  img {
    position: relative;
    z-index: 2;
  }

  @keyframes scanlines {
    0% {
      background-position: 0 0;
    }
    100% {
      background-position: 0 4px;
    }
  }

  @keyframes scan {
    0% {
      background-position: 0 -100px;
    }
    100% {
      background-position: 0 200px;
    }
  }
`;

const DescriptionText = styled.div`
  font-family: 'Courier New', 'Courier', monospace;
  font-size: 0.9rem;
  text-align: center;
  color: #10b981;
  max-width: 450px;
  line-height: 1.6;
  letter-spacing: 0.02em;
`;

const ButtonContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  width: 100%;
  max-width: 300px;

  @media (min-width: 640px) {
    flex-direction: row;
  }
`;

const PopupOverlay = styled.div<{ isOpen: boolean }>`
  display: ${props => props.isOpen ? 'flex' : 'none'};
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  z-index: 1000;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;

const PopupContent = styled.div`
  background: #c0c0c0;
  border: 2px solid;
  border-color: #ffffff #000000 #000000 #ffffff;
  box-shadow: inset 1px 1px 0px 1px #dfdfdf, inset -1px -1px 0px 1px #808080;
  padding: 0;
  max-width: 500px;
  width: 100%;
  position: relative;
`;

const PopupHeader = styled.div`
  background: linear-gradient(to right, #16a34a, #4ade80);
  color: black;
  padding: 0.25rem 0.5rem;
  font-family: 'MS Sans Serif', sans-serif;
  font-weight: bold;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const PopupClose = styled.button`
  width: 20px;
  height: 20px;
  background: #c0c0c0;
  border: 2px solid;
  border-color: #ffffff #000000 #000000 #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  padding: 0;
  margin: 0;
  line-height: 0;
  font-family: 'MS Sans Serif', sans-serif;

  &:active {
    border-color: #000000 #ffffff #ffffff #000000;
  }
`;

const PopupBody = styled.div`
  padding: 1.5rem;
  background: #c0c0c0;
`;

const PopupText = styled.p`
  color: #000000;
  font-family: 'MS Sans Serif', sans-serif;
  font-size: 0.875rem;
  line-height: 1.6;
  margin: 0;
`;

export default function Home() {
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  return (
    <ThemeProvider theme={matrix}>
      <div className="flex flex-col" style={{ minHeight: '100vh' }}>
        <DesktopBackground>
          <CenteredContainer>
            <StyledWindow>
              <StyledWindowHeader>
                <WindowButton aria-label="Minimize" style={{ paddingBottom: '4px' }}>_</WindowButton>
                <WindowButton aria-label="Maximize">□</WindowButton>
                <WindowButton aria-label="Close">×</WindowButton>
              </StyledWindowHeader>
              <StyledWindowContent>
                <Monitor backgroundStyles={{ background: '#1a1a1a' }}>
                  <MonitorScreen>
                    <Image
                      src="/iq_logo.svg"
                      alt="IQ Labs Logo"
                      width={120}
                      height={120}
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </MonitorScreen>
                </Monitor>

                <Panel variant="well" style={{ padding: '1rem 2rem', width: '100%', background: '#2a2a2a' }}>
                  <WelcomeText style={{ fontSize: '2rem', marginBottom: 0 }}>
                    Welcome to <RainbowText>SolChat</RainbowText>
                  </WelcomeText>
                </Panel>

                <ButtonContainer>
                  <Link href="/chat" passHref legacyBehavior>
                    <Button
                      as="a"
                      primary
                      size="lg"
                      className="inline-flex items-center justify-center gap-2 px-20 py-6 font-bold m-0 cursor-pointer transition-all hover:opacity-90 active:scale-95"
                      style={{
                        fontFamily: 'monospace',
                        minWidth: '280px',
                        fontSize: '1.25rem'
                      }}
                    >
                      <span className="flex items-center gap-2">&gt; [CHAT]</span>
                    </Button>
                  </Link>

                  <Link href="/account" passHref legacyBehavior>
                    <Button
                      as="a"
                      primary
                      size="lg"
                      className="inline-flex items-center justify-center gap-2 px-20 py-6 font-bold cursor-pointer transition-all hover:opacity-90 active:scale-95"
                      style={{
                        fontFamily: 'monospace',
                        minWidth: '280px',
                        fontSize: '1.25rem'
                      }}
                    >
                      &gt; [ACCOUNT]
                    </Button>
                  </Link>
                </ButtonContainer>

                <div className="hidden md:block">
                  <ThemeProvider theme={toner}>
                    <Tooltip text='The decentralized, on-chain messaging platform built on Solana. Connect your wallet and start chatting on the blockchain.' enterDelay={100} leaveDelay={500}>
                      <Button
                        size="sm"
                        className="cursor-pointer"
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          background: '#2a2a2a',
                          color: '#10b981'
                        }}
                      >
                        ? Learn More
                      </Button>
                    </Tooltip>
                  </ThemeProvider>
                </div>

                <div className="md:hidden">
                  <Button
                    size="sm"
                    onClick={() => setIsPopupOpen(true)}
                    className="cursor-pointer"
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      background: '#2a2a2a',
                      color: '#10b981'
                    }}
                  >
                    ? Learn More
                  </Button>
                </div>
              </StyledWindowContent>
            </StyledWindow>
          </CenteredContainer>
        </DesktopBackground>

        <Footer />

        <PopupOverlay isOpen={isPopupOpen} onClick={() => setIsPopupOpen(false)}>
          <PopupContent onClick={(e) => e.stopPropagation()}>
            <PopupHeader>
              <span>About SolChat</span>
              <PopupClose onClick={() => setIsPopupOpen(false)}>×</PopupClose>
            </PopupHeader>
            <PopupBody>
              <PopupText>
                The decentralized, on-chain messaging platform built on Solana.
                Connect your wallet and start chatting on the blockchain.
              </PopupText>
            </PopupBody>
          </PopupContent>
        </PopupOverlay>
      </div>
    </ThemeProvider>
  );
}
