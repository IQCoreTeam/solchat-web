/**
 * React95 Dark Green Theme
 * Used for the friends list UI
 */

import { createGlobalStyle } from 'styled-components';

export const GlobalStyles = createGlobalStyle`
  @keyframes slide {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(400%);
    }
  }
  body {
  font-family: "bitArrayA2", serif;
  }
`;

// Custom dark theme - mostly black with green accents
export const darkGreenTheme = {
  material: '#0a0f0a',
  materialDark: '#050a05',
  materialText: '#00ff00',
  materialTextDisabled: '#006600',
  materialTextDisabledShadow: '#000000',
  materialTextInvert: '#000000',

  canvas: '#0a0f0a',
  canvasText: '#00ff00',
  canvasTextDisabled: '#006600',
  canvasTextDisabledShadow: '#000000',
  canvasTextInvert: '#000000',

  borderDark: '#00ff00',
  borderDarkest: '#050a05',
  borderLight: '#00ff00',
  borderLightest: '#00ff00',

  headerBackground: '#0a0f0a',
  headerNotActiveBackground: '#050a05',
  headerNotActiveText: '#006600',
  headerText: '#00ff00',

  progress: '#00ff00',
  progressBackground: '#001100',
  inputText: '#00ff00',
  inputTextInvert: '#000000',
  tooltip: '#0a0f0a',

  flatLight: '#0a0f0a',
  flatDark: '#050a05',

  hoverBackground: '#0d1a0d',
  checkmark: '#00ff00',
  checkmarkDisabled: '#003300',
};
