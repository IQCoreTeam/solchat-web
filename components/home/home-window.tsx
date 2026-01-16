'use client';

import {useState} from 'react';
import Image from 'next/image';
import {Window, WindowHeader, WindowContent, Button, Monitor, Tooltip, Frame} from 'react95';
import {useRouter} from "next/navigation";
import {
    DesktopBackground,
    CenteredContainer,
    WelcomeText,
    RainbowText,
    MonitorScreen,
    ButtonContainer,
    PopupOverlay
} from './home-styles';

export function HomeWindow() {
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const router = useRouter();

    return (
        <>
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
        </>
    );
}
