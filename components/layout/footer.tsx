'use client';

import styled from 'styled-components';

const FooterContainer = styled.footer`
  background: #11121A;
  border-top: 2px solid #6C4DFF;
  padding: 0.5rem 1rem;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(108, 77, 255, 0.03) 2px, rgba(108, 77, 255, 0.03) 4px);
    pointer-events: none;
  }
`;

const FooterText = styled.div`
  color: #7A8CFF;
  font-size: 0.75rem;
  text-align: center;
`;

export function Footer() {
  return (
    <FooterContainer>
      <FooterText>
        © 2025 WHISPER — Privacy Isn't Optional
      </FooterText>
    </FooterContainer>
  );
}
