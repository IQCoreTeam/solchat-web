# Repository Guidelines

## Project Structure & Modules
- `app/`: Next.js App Router routes; main surfaces live in `app/chat`, `app/friends`, and `app/account`.
- `components/`: UI and client logic grouped by feature (chat, friends, layout, providers, UI primitives).
- `lib/`: Core domain helpers (`onchainDB` Solana table access, `wallet` adapters, `friends` utilities, `cache`, `utils`, `iq`).
- `packages/privacy-sdk/`: Bundled Cloak privacy SDK used via `@cloak-dev/sdk`.
- `public/` assets and `types/` shared TypeScript definitions.

## Build, Test, Development
- `npm run dev` – start the Next dev server on port 3000.
- `npm run build` – production build; run before deployment.
- `npm start` – serve the built app.
- `npm run lint` – Next + ESLint core-web-vitals rules; fix all warnings before pushing.
- Env setup: `cp .env.example .env.local` then fill RPC and IQ endpoints (see `ENV_SETUP.md`). Use Node 18+.
- RPC throttling defaults: `lib/onchainDB/web/rpc-throttle.ts` (public Solana RPC = 1 tx/sec, custom RPC = 8 tx/batch with 1s delay). Override via `NEXT_PUBLIC_RPC_SLOW_BATCH`, `NEXT_PUBLIC_RPC_SLOW_DELAY_MS`, `NEXT_PUBLIC_RPC_FAST_BATCH`, `NEXT_PUBLIC_RPC_FAST_DELAY_MS`.

## Coding Style & Naming
- TypeScript-first, React function components; add `use client` where required.
- PascalCase for components/hooks, camelCase for variables/functions, kebab-case for files within features.
- Styling via Tailwind utility classes plus existing React95 theming; keep palettes consistent with current screens.
- Keep Solana/RPC helpers in `lib/onchainDB` and wallet concerns in `lib/wallet`; reuse shared hooks like `useMessageLoader` and caches instead of duplicating fetch logic.
- Run `npm run lint` locally; prefer explicit `PublicKey` handling and narrow prop types.

## Testing Guidelines
- No automated suite yet; manually verify chat send/receive, DM flows, wallet connect, and RPC endpoint switching on each change.
- If adding tests, favor integration/e2e around chat and friends loaders to catch RPC and cache regressions; co-locate tests with the feature.

## Commit & PR Guidelines
- Use short, imperative commit subjects (e.g., `fix chat rate guard`, `add dm cache busting`).
- PRs should state purpose, key changes, reproduction/verification steps, and include screenshots/GIFs for UI updates; link issues when available.
- Ensure lint passes and call out any RPC, wallet, or env-variable impacts explicitly.

## Security & Configuration Notes
- Never commit secrets; `.env.local` is ignored.
- Default RPC is devnet—note when switching endpoints or increasing rate limits; prefer provider keys over public endpoints.
- Cache and rate-limit RPC calls (see `lib/cache` and client rate guards) to avoid throttling in chat and friends flows.
