'use client';

import styled from 'styled-components';

const FooterContainer = styled.footer`
  background-color: black;
  border-top: 2px solid #16a34a;
  padding: 0.5rem 1rem;
  font-family: 'Courier New', monospace;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const FooterText = styled.div`
  color: #10b981;
  font-size: 0.75rem;
  text-align: center;
`;

export function Footer() {
  return (
    <FooterContainer>
      <FooterText>
        © 2025 SOLCHAT All Rights Reserved
      </FooterText>
    </FooterContainer>
  );
}
