

export const BRAND_COLORS = {
  // Primary brand green
  green: 'rgb(65, 255, 0)',
  greenHex: '#41FF00',

  // Secondary greens
  greenDark: 'rgb(0, 255, 34)',
  greenDarker: 'rgb(0, 100, 0)',

  // Background
  bgDark: 'rgb(0, 33, 0)',

  // Helper function for rgba with custom opacity
  greenRgba: (opacity: number) => `rgba(65, 255, 0, ${opacity})`,
  greenDarkRgba: (opacity: number) => `rgba(0, 255, 34, ${opacity})`,
} as const;

/**
 * CSS Variable References
 * Use these to reference the CSS variables directly
 */
export const CSS_VARS = {
  brandGreen: 'var(--iq-green)',
  brandGreenRgb: 'var(--iq-green-rgb)',
  brandGreenDark: 'var(--iq-green-dark)',
  brandGreenDarker: 'var(--iq-green-darker)',
  brandBgDark: 'var(--brand-bg-dark)',
} as const;

/**
 * Tailwind Class Names
 * Common brand color classes for easy reference
 */
export const BRAND_CLASSES = {
  text: 'text-iq-green',
  bg: 'bg-iq-green',
  border: 'border-iq-green',
  textDark: 'text-iq-green-dark',
  textDarker: 'text-iq-green-darker',
} as const;
