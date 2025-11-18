# WHISPER Color Mapping Guide

## ❌ OLD SOLCHAT COLORS → ✅ NEW WHISPER COLORS

### Primary Brand Colors
- `#41FF00` (bright green) → `#6C4DFF` (Whisper Violet)
- `#16a34a` (green-600) → `#6C4DFF` (Whisper Violet)
- `#10b981` (emerald-500) → `#7A8CFF` (Encrypted Blue)
- `#4ade80` (green-400) → `#7A8CFF` (Encrypted Blue)
- `#22c55e` (green-500) → `#00E0E0` (Cyber Aqua)
- `#86efac` (green-300) → `#00E0E0` (Cyber Aqua)
- `#00FF22` (neon green) → `#00E0E0` (Cyber Aqua)

### Background Colors
- `#000000` (pure black) → `#0A0A0F` (Midnight Black)
- `#000` (black) → `#0A0A0F` (Midnight Black)
- `black` → `#0A0A0F` (Midnight Black)
- `#1a1a1a` (dark gray) → `#11121A` (Deep Night)
- `#2a2a2a` (medium dark) → `#1C1E27` (Carbon Shadow)
- `#002100` (dark green) → `#0A0A0F` (Midnight Black)
- `#001a00` (darker green) → `#11121A` (Deep Night)

### Text Colors
- `.text-green-400` → `.text-[#7A8CFF]` or `color: #7A8CFF`
- `.text-green-300` → `.text-[#00E0E0]` or `color: #00E0E0`
- `.text-green-500` → `.text-[#6C4DFF]` or `color: #6C4DFF`
- `.text-green-200` → `.text-[#9BA0AE]` or `color: #9BA0AE`

### Border Colors
- `.border-green-400` → `.border-[#7A8CFF]` or `border-color: #7A8CFF`
- `.border-green-500` → `.border-[#6C4DFF]` or `border-color: #6C4DFF`
- `.border-green-600` → `.border-[#6C4DFF]` or `border-color: #6C4DFF`

### Background Utility Classes
- `.bg-green-400` → `.bg-[#7A8CFF]` or `background: #7A8CFF`
- `.bg-green-500` → `.bg-[#6C4DFF]` or `background: #6C4DFF`
- `.bg-green-600` → `.bg-[#6C4DFF]` or `background: #6C4DFF`
- `.bg-green-700` → `.bg-[#5A3DE6]` (darker violet)
- `.bg-green-900` → `.bg-[#1C1E27]` or `background: #1C1E27`
- `.bg-green-900/90` → `.bg-[#1C1E27]/90`
- `.bg-black` → `.bg-[#0A0A0F]` or `background: #0A0A0F`
- `.bg-black/60` → `.bg-[#0A0A0F]/60`
- `.bg-black/70` → `.bg-[#0A0A0F]/70`

### Hover States
- `.hover:bg-green-700` → `.hover:bg-[#5A3DE6]`
- `.hover:bg-green-500` → `.hover:bg-[#7A8CFF]`
- `.hover:text-green-300` → `.hover:text-[#00E0E0]`
- `.hover:bg-green-600/10` → `.hover:bg-[#6C4DFF]/10`

## Complete Whisper Color Palette

### Primary Colors
- **Midnight Black**: `#0A0A0F` - Main background
- **Deep Night**: `#11121A` - Secondary background, panels
- **Carbon Shadow**: `#1C1E27` - Cards, message bubbles

### Accent Colors
- **Whisper Violet**: `#6C4DFF` - Primary CTA, important UI
- **Encrypted Blue**: `#7A8CFF` - Highlights, secondary actions
- **Cyber Aqua**: `#00E0E0` - Success states, active indicators

### Neutral Colors
- **Ghost White**: `#F2F3F7` - Primary text
- **Mist Grey**: `#9BA0AE` - Secondary text
- **Graphite**: `#2A2D36` - Dividers, borders

### Semantic Colors
- **Success**: `#00C98D` - Success messages
- **Error**: `#FF4D6C` - Error states
- **Warning**: `#FFD460` - Warning alerts

### UI Component Colors
- **Input Background**: `#161820`
- **Card Background**: `#11121A`
- **Border**: `#2A2D36`

## Quick Replace Regex Patterns

### For styled-components
```
background:\s*black → background: #0A0A0F
background:\s*#000(?:000)?\b → background: #0A0A0F
color:\s*#4ade80 → color: #7A8CFF
color:\s*#16a34a → color: #6C4DFF
color:\s*#10b981 → color: #7A8CFF
border.*#16a34a → border-color: #6C4DFF
```

### For Tailwind Classes
```
bg-black → bg-[#0A0A0F]
bg-green-400 → bg-[#7A8CFF]
bg-green-600 → bg-[#6C4DFF]
text-green-400 → text-[#7A8CFF]
border-green-600 → border-[#6C4DFF]
```

## Files Still Needing Updates
- components/chat/chat-client.tsx (many instances)
- components/chat/chat-interface.tsx
- components/account/*.tsx
- components/ui/terminal*.tsx
- components/home/wallet-prompt.tsx
- components/debug/privy-debug.tsx
- components/mobile/mobile-wallet-banner.tsx
