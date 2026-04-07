# Repository Guidelines

## Project Structure & Modules
- `app/`: Next.js App Router routes; main surfaces live in `app/chat`, `app/friends`, and `app/account`.
- `components/`: UI and client logic grouped by feature (chat, friends, layout, providers, UI primitives).
- `lib/`: Core domain helpers (`gateway` reader, `wallet` adapters, `friends` utilities, `cache`, `iqlabs` SDK integration).
- `public/` assets and `types/` shared TypeScript definitions.

## Build, Test, Development
- `pnpm dev` – start the Next dev server on port 3000.
- `pnpm build` – production build; run before deployment.
- `pnpm start` – serve the built app.
- `pnpm lint` – Next + ESLint core-web-vitals rules; fix all warnings before pushing.
- Env setup: `cp .env.example .env` then fill RPC, gateway, and Privy keys. Use Node 18+.

## Coding Style & Naming
- TypeScript-first, React function components; add `use client` where required.
- PascalCase for components/hooks, camelCase for variables/functions, kebab-case for files within features.
- Styling via Tailwind utility classes plus existing React95 theming; keep palettes consistent with current screens.
- All reads go through `lib/gateway/reader.ts` (gateway-first, SDK fallback). Wallet concerns live in `lib/wallet`.
- Run `pnpm lint` locally; prefer explicit `PublicKey` handling and narrow prop types.

## Testing Guidelines
- No automated suite yet; manually verify chat send/receive, DM flows, wallet connect, and RPC endpoint switching on each change.

## Commit & PR Guidelines
- Use short, imperative commit subjects (e.g., `fix chat rate guard`, `add dm cache busting`).
- PRs should state purpose, key changes, reproduction/verification steps, and include screenshots/GIFs for UI updates.

## Security & Configuration Notes
- Never commit secrets; `.env` is ignored.
- Gateway (`NEXT_PUBLIC_GATEWAY_URL`) handles cached reads; Helius RPC (`NEXT_PUBLIC_HELIUS_RPC_URL`) handles transaction history.
- Cache and rate-limit RPC calls (see `lib/cache` and `lib/rpc`) to avoid throttling.
