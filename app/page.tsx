'use client';

import {useState} from 'react';

import Image from 'next/image';
import {Footer} from '@/components/layout/footer';
import {Window, WindowHeader, WindowContent, Button, Monitor, Tooltip, Frame} from 'react95';
import styled from 'styled-components';
import {useRouter} from "next/navigation";
import solchatTheme from '../components/styles/solchatTheme'


const DesktopBackground = styled.div`
    background: ${({ theme }) => solchatTheme.desktopBackground};
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
        background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 0, 0.03) 2px, rgba(0, 255, 0, 0.03) 4px);
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


const WelcomeText = styled.div`
    font-size: 1.5rem;
    font-weight: bold;
    text-align: center;
    margin-bottom: 0.75rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.3);
`;

const RainbowText = styled.span.attrs({title: 'SolChat'})`

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
        background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 0, 0.1) 2px, rgba(0, 255, 0, 0.1) 4px);
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

const ButtonContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;

    @media (min-width: 640px) {
        flex-direction: row;
    }
`;

const PopupOverlay = styled.div<{ $isOpen: boolean }>`
    display: ${props => props.$isOpen ? 'flex' : 'none'};
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


export default function Home() {
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const router = useRouter();
    return (

            <div className="flex flex-col" style={{minHeight: '100vh'}}>
                <DesktopBackground>
                    <CenteredContainer>
                        <Window>
                            <WindowHeader style={{display: 'flex', alignItems: 'stretch', justifyContent: 'space-between'}}>
                               <p>Solchat.exe</p>
                                <Button> <span className='close-icon'/></Button>
                            </WindowHeader>

                            <WindowContent style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '2rem',
                                padding: '2rem 2rem 0.5rem 2rem',
                            }}>
                                <Monitor backgroundStyles={{background: '#1a1a1a'}}>
                                    <MonitorScreen>
                                        <Image
                                            src="/iq_logo.svg"
                                            alt="IQ Labs Logo"
                                            width={120}
                                            height={120}
                                            style={{imageRendering: 'pixelated'}}
                                        />
                                    </MonitorScreen>
                                </Monitor>

                                <Frame variant="well"
                                       style={{padding: '1rem 2rem', width: '100%',}}>
                                    <WelcomeText style={{fontSize: '2rem', marginBottom: 0}}>
                                        Welcome to <RainbowText>SolChat</RainbowText>
                                    </WelcomeText>
                                </Frame>

                                <ButtonContainer>

                                    <Button
                                        as="a"
                                        primary
                                        size="lg"
                                        className="inline-flex items-center justify-center gap-2 px-20 py-6    m-0 cursor-pointer transition-all hover:opacity-90"
                                        style={{

                                            minWidth: '280px',
                                            fontSize: '1.25rem'
                                        }}
                                        onClick={() => router.push("/chat")}
                                    >
                                        <span className="flex items-center gap-2">&gt; [CHAT]</span>
                                    </Button>


                                    <Button
                                        as="a"
                                        primary
                                        size="lg"
                                        className="inline-flex items-center justify-center gap-2 px-20 py-6    cursor-pointer transition-all hover:opacity-90 "
                                        style={{

                                            minWidth: '280px',
                                            fontSize: '1.25rem'
                                        }}
                                        onClick={() => router.push("/account")}
                                    >
                                        &gt; [ACCOUNT]
                                    </Button>

                                </ButtonContainer>

                                <div className="hidden md:block">

                                        <Tooltip
                                            text='The decentralized, on-chain messaging platform built on Solana. Connect your wallet and start chatting on the blockchain.'
                                            enterDelay={100} leaveDelay={500}>
                                            <Button
                                                onClick={() => setIsPopupOpen(true)}
                                                size="sm"
                                                className="cursor-pointer"
                                                style={{
                                                    fontSize: '0.875rem',
                                                }}
                                            >
                                                ? Learn More
                                            </Button>
                                        </Tooltip>

                                </div>

                            </WindowContent>
                        </Window>
                    </CenteredContainer>
                </DesktopBackground>

                <Footer/>

                <PopupOverlay $isOpen={isPopupOpen} onClick={() => setIsPopupOpen(false)}>
                    <Window onClick={(e) => e.stopPropagation()}>
                        <WindowHeader>
                            <span>About SolChat</span>
                        </WindowHeader>
                        <WindowContent>
                            <div>
                                <p>
                                    The decentralized, on-chain messaging platform built on Solana.
                                </p>
                                <p>
                                    Connect your wallet and start chatting on the blockchain.
                                </p>
                            </div>
                            <Button onClick={() => setIsPopupOpen(false)}>Close</Button>
                        </WindowContent>

                    </Window>
                </PopupOverlay>
            </div>

    );
}
