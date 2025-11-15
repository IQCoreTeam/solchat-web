# Brand Colors Usage Guide

This guide shows you how to use the IQ Labs Matrix Green brand colors consistently throughout the application.

## Quick Reference

### Primary Brand Green
- **Hex**: `#41FF00`
- **RGB**: `rgb(65, 255, 0)`
- **Tailwind Class**: `text-iq-green`, `bg-iq-green`, `border-iq-green`

## Usage Methods

### 1. Tailwind Classes (Recommended)

```tsx
// Text color
<div className="text-iq-green">Green text</div>

// Background color
<div className="bg-iq-green">Green background</div>

// Border color
<div className="border-iq-green border-2">Green border</div>
```

### 2. CSS Variables

```tsx
// Direct variable
<div style={{ color: 'var(--iq-green)' }}>Green text</div>

// With opacity using RGB
<div style={{
  backgroundColor: 'rgba(var(--iq-green-rgb), 0.2)'
}}>Semi-transparent green</div>
```

### 3. TypeScript Constants

```tsx
import { BRAND_COLORS } from '@/lib/constants/colors';

// Direct color
<div style={{ color: BRAND_COLORS.green }}>Green text</div>

// With custom opacity
<div style={{
  backgroundColor: BRAND_COLORS.greenRgba(0.2)
}}>Semi-transparent green</div>
```

### 4. Class Name Constants

```tsx
import { BRAND_CLASSES } from '@/lib/constants/colors';

<div className={BRAND_CLASSES.text}>Green text</div>
```

## Examples

### Loading Spinner
```tsx
<div
  className="w-12 h-12 border-4 rounded-full animate-spin"
  style={{
    borderColor: 'rgba(65, 255, 0, 0.2)',
    borderTopColor: 'rgb(65, 255, 0)'
  }}
/>
```

### Button with Green Glow
```tsx
<button
  className="px-12 py-4 font-bold text-xl"
  style={{
    backgroundColor: 'rgb(65, 255, 0)',
    color: 'rgb(0, 33, 0)',
    textShadow: 'rgb(65, 255, 0) 0px 0px 50px, rgb(0, 255, 34) 0px 0px 10px',
  }}
>
  [CLICK ME]
</button>
```

### Status Badge
```tsx
<div className="bg-black/60 border border-green-600/50 rounded px-3 py-1.5">
  <span className="text-xs font-mono text-green-400">
    [CONNECTED]
  </span>
</div>
```

## Color Palette

| Color | Value | Usage |
|-------|-------|-------|
| Primary Green | `#41FF00` | Main brand color, buttons, highlights |
| Green Dark | `#00FF22` | Accents, shadows, glows |
| Green Darker | `#006400` | Borders, subtle accents |
| Dark BG | `rgb(0, 33, 0)` | Background color |

## Best Practices

1. **Use Tailwind classes when possible** - Better for tree-shaking and consistency
2. **Use CSS variables for dynamic opacity** - `rgba(var(--iq-green-rgb), 0.x)`
3. **Import TypeScript constants for complex logic** - Type-safe and maintainable
4. **Keep mono font** - Use `font-mono` for the terminal/matrix aesthetic
5. **Add brackets** - Wrap text in `[]` for consistent styling: `[TEXT]`
