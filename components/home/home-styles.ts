import styled from 'styled-components';
import solchatTheme from '../styles/solchatTheme';

export const DesktopBackground = styled.div`
    background: ${() => solchatTheme.desktopBackground};
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

export const CenteredContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    z-index: 1;
`;

export const WelcomeText = styled.div`
    font-size: 1.5rem;
    font-weight: bold;
    text-align: center;
    margin-bottom: 0.75rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.3);
`;

export const RainbowText = styled.span.attrs({title: 'SolChat'})`

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

export const MonitorScreen = styled.div`
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

export const ButtonContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;

    @media (min-width: 640px) {
        flex-direction: row;
    }
`;

export const PopupOverlay = styled.div<{ $isOpen: boolean }>`
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
