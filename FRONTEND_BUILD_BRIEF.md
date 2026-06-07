# Asshai — Frontend Build Brief

## TL;DR for the agent

You are building the frontend for **Asshai**, an on-chain intent compiler on the Somnia testnet. The contracts work and are already deployed. The previous frontend is fully functional but unstyled. Your job is to rebuild the presentation layer so it matches the design direction below and connects cleanly to the existing on-chain data.

The defining UX move is **"stage, then document"**: while a goal is compiling on Somnia (10–30 seconds of real validator work), the page streams the agent's reasoning live; once it settles, the same view freezes into a permanent, shareable receipt at the same URL. The compile-time stream and the post-settled document are the same component in two states.

The user will provide visual mocks as image context separately. Where the mocks and this brief contradict, **ask the user before deviating from this brief** — the brief is the source of truth for behavior and data; the mocks are the source of truth for chrome and composition.

---

## What Asshai is

A natural-language DeFi yield compiler. The user types a fuzzy goal in English ("maximize my USDC yield, 7-day lockup max"). Somnia validators (1) fetch verified yield data from DefiLlama via the on-chain JSON API agent, (2) ask an on-chain LLM (Qwen3-30B at temp=0) to choose a venue under structured constraints, (3) Solidity validates the chosen poolId against a hardcoded allowlist, and (4) the deterministic encoder builds an ERC-7683 StandardOrder-shaped plan. The plan is then executed via LI.FI Composer onto Base, into a real lending position.

The product's defensible value is **not** the AI quality. It's the auditability. Every decision the agent made — the data it saw, the alternatives it rejected, the reasoning it gave — is permanently logged on Somnia and viewable by anyone via a shareable URL. The pitch is:

> "LI.FI moves the asset. Somnia proves why the asset moved there."

The reasoning receipt is the product feature. The frontend's job is to make that receipt feel like a desirable object — like a Stripe receipt or a Linear changelog entry — not a debug log.

---

## Current state of the codebase

**Stack already in place** (don't change these without asking):

- Next.js 16 (App Router) with React 19, TypeScript
- Tailwind CSS (config exists, but `globals.css` is empty — design tokens need to be added)
- RainbowKit + wagmi + viem for wallet and on-chain reads
- All on-chain contracts deployed and verified on Somnia testnet

**Working but unstyled pages**:

- `/frontend/app/page.tsx` — home with goal input
- `/frontend/app/intent/[id]/IntentClient.tsx` — receipt view (fetches goal, receipts, encoded intent, runs LI.FI execution)
- `/frontend/app/providers.tsx` — wagmi/RainbowKit config

**Working API routes** (do not modify):

- `/api/yields` — proxies DefiLlama + curated metadata, returns the rates payload string
- `/api/lifi/quote` — direct LI.FI quote (Aave path)
- `/api/lifi/contract-call-quote` — LI.FI contract-call quote (Compound path)
- `/api/lifi/status` — LI.FI execution status polling
- `/api/goal-policy` — preflight policy classifier (POST/GET)

**Stable libraries** (modify visuals only, never the logic):

- `/frontend/lib/contracts.ts` — ABIs and contract addresses
- `/frontend/lib/goal-policy.json` — the preflight policy source of truth
- `/frontend/lib/goal-support.ts` — preflight classifier
- `/frontend/lib/somnia.ts` — Somnia testnet chain definition

---

## Deployed contracts (Somnia testnet, chain 50312)

These are wired into the existing code via `NEXT_PUBLIC_*` env vars. They will not change during the build.

| Contract | Address | Purpose |
|----------|---------|---------|
| `GoalRegistry` | `0x3d37cDE79CCcA78334972e6bf1d351f607aF2ca6` | Goals are posted here. Status enum drives the page state. |
| `CompilerEngineV3` | `0x575f48bCC5E369573822dB19C52f4bdf7495cb80` | Runs the agent calls, writes receipts. |
| `ReceiptLog` | `0xCaf26d33E74cc952284AA3aA71a67DBe69deEFC1` | Per-goal append-only log of reasoning steps. |
| `IntentStore` | `0x0D0891Ae2733E3D8644D1044F497Af4bb63404ea` | Stores the encoded StandardOrder bytes. |
| `AddressRegistry` | `0x146bd5510D7B488d936b23040062e2ca8Fc26E76` | Venue catalog. |
| `StandardOrderEncoder` | `0xB9084F50D6F75006953F69741762548990B334E7` | Pure encoding utility. |

---

## The on-chain data model (read carefully)

This is the most important section. The streaming/animation work all keys off this data flow.

### Goal lifecycle

`GoalRegistry.getGoal(goalId)` returns a `Goal` struct with a `status: uint8`. Map the values:

```
0 Pending      — never seen in v1 (status flips immediately to Compiling)
1 Compiling    — agent work in flight; receipts arriving
2 IntentReady  — compile finished; StandardOrder stored; ready to execute
3 Submitted    — user opened the LI.FI route
4 Settled      — terminal success (we may not transition here from frontend yet)
5 Failed       — terminal failure
6 Expired      — deadline passed
```

The frontend reads goal status on a polling interval (`refetchInterval: 3000`). The page's visual state is driven by this status:

| Goal status | Page state |
|-------------|------------|
| `Compiling` | Screen 2.A — live stream of agent thoughts |
| `IntentReady` | Screen 3.A — settled receipt, execute CTA active |
| `Submitted` (with route tx hash) | Screen 4.A — execution in progress |
| `Submitted` + LI.FI status DONE | Screen 5.A — filled, proof complete |
| `Failed` | Screen 2.B — honest failure copy |

### Receipt step lifecycle

`ReceiptLog.getEntries(goalId)` returns an array of `ReceiptEntry` structs with `stepName: string` and `data: bytes`. Steps arrive in this order during a successful compile:

1. **`rates_fetched`** — `data` is an `abi.encode(string)`. The string is a pipe-separated row payload with `key=value` fields. Use `parseRatesPayload` (already in `IntentClient.tsx`) to decode it into venue rows.
2. **`decision_built`** — `data` is `abi.encode(string)` containing a JSON object the LLM produced. Schema:
   ```json
   {
     "poolId": "compound-v3-usdc-base",
     "objectiveMatched": "max_yield" | "safety" | "fallback",
     "rejectedAlternatives": [
       { "poolId": "aave-v3-usdc-base", "reason": "Lower APY for the same lockup and risk profile." }
     ],
     "reasoning": "Compound V3 slightly outperforms Aave V3 on Base..."
   }
   ```
3. **`candidates_selected`** — `data` is `abi.encode(string)`, just the chosen poolId. Validated against the on-chain allowlist by Solidity.
4. **`plan_built`** — `data` is `abi.encode(string)` containing the deterministic allocation plan with the decision embedded:
   ```json
   {
     "allocations": [{ "chainName": "base", "poolId": "compound-v3-usdc-base", "pct": 100 }],
     "decision": "{...the decision JSON above as a string...}"
   }
   ```
5. **`order_encoded`** — `data` is the raw StandardOrder bytes. Decoded via `standardOrderAbi` in `IntentClient.tsx`.

When the goal status is `Compiling`, poll receipts every 1.5s; as new steps appear, animate them in (the "streaming" feel). When status flips to `IntentReady`, **lock the animation** — no more new entries are coming, and the page should visually settle into a permanent document.

### Venue universe (v1)

Exactly two venues. Do not invent more. Do not show Morpho, Curve, or anything else.

| poolId | Label | Risk tier | Execution path |
|--------|-------|-----------|----------------|
| `aave-v3-usdc-base` | Aave V3 USDC on Base | lowest | Direct LI.FI quote into aBasUSDC |
| `compound-v3-usdc-base` | Compound V3 USDC on Base | low | LI.FI contract-call into Comet.supply |

For real logos, use CoinGecko coin images:

- Aave: `https://coin-images.coingecko.com/coins/images/12645/small/aave-token-round.png`
- Compound: `https://coin-images.coingecko.com/coins/images/10775/small/COMP.png`
- USDC: `https://coin-images.coingecko.com/coins/images/6319/small/usdc.png`
- Base chain icon: use the Base ecosystem logo (search CoinGecko for "Base" or use a local SVG).

**Never** use colored dot placeholders or letter circles for venue icons. Always render the real asset logo in a circular container (`border-radius: 50%`, `object-fit: cover`).

### Test goalIds (already exist on-chain)

These are real, compiled, settled goals you can navigate to during development. Use them to verify the receipt rendering works end-to-end before posting new goals:

- `/intent/62` — "maximize my USDC yield, 7-day lockup" → Compound V3, `max_yield`
- `/intent/63` — "safest stablecoin yield, no lockup, prefer Base" → Aave V3, `safety`
- `/intent/64` — "find me 8%+ if possible, but don't use sketchy pools" → Compound V3, `fallback`

When you post a new goal from the home page, you'll see the live streaming behavior end-to-end.

---

## Design direction

### Aesthetic commitment

Editorial-serif headline + clean sans body, dark navy field, warm orange accent. Restrained motion. No crypto-default chrome. Reference register: Stripe Press, Linear's changelog, polyhubai (github.com/polyhub-sol/polyhubai), Vercel deploy logs. **Not** Etherscan, **not** Uniswap, **not** generic shadcn dashboards.

This commitment is final — do not drift toward Inter+grid+blue-accent territory because that's what AI agents default to when asked for "modern crypto UI." Hold the line.

### Color tokens

Define these as CSS variables in `globals.css` and as semantic Tailwind colors in `tailwind.config.ts`. **Never use raw hex values in component code** — always reference tokens.

| Token | Value | Use |
|-------|-------|-----|
| `--background` | `#090b20` | Page background. This is Somnia's official theme color. |
| `--surface-1` | `rgba(255,255,255,0.02)` | Subtle elevation (cards on dark, table rows) |
| `--surface-2` | `rgba(255,255,255,0.04)` | More elevation (locked prompt bar, decision JSON container) |
| `--border` | `rgba(255,255,255,0.06)` | Hairline borders — always low-opacity white, never solid colors |
| `--border-strong` | `rgba(255,255,255,0.12)` | For interactive/focused elements |
| `--text-primary` | `#FFFFFF` | Headlines, key data |
| `--text-secondary` | `rgba(255,255,255,0.72)` | Body |
| `--text-tertiary` | `rgba(255,255,255,0.48)` | Metadata, timestamps |
| `--text-quaternary` | `rgba(255,255,255,0.32)` | Hint text, very low signal |
| `--accent` | `#FF6A2C` *(placeholder; user will replace with official Somnia accent if different)* | Primary CTA, brand mark dot, active states |
| `--accent-soft` | `rgba(255,106,44,0.12)` | Accent-tinted backgrounds (focused input border, badges) |
| `--success` | `#3FB97F` | Confirmed steps, settled badges |
| `--warning` | `#E0A03A` | Fallback objectiveMatched pill |
| `--danger` | `#E5484D` | Failed states only — used sparingly |

Status colors must be **muted and confident**, not Material-bright. Compare your reds and greens against Linear's, not Bootstrap's.

### Typography

Use these via `next/font` (no external CDN loading):

- **Display / Headlines**: a refined serif. `next/font/google` → **`Instrument Serif`** (regular weight, italic available) is the closest free match to the mocks. Alternative: **`Cormorant Garamond`**. Avoid Playfair (too wedding-invitation), avoid Lora (too blog-post). Pick one and stick with it across all screens.
- **Body / UI**: **`Geist`** (sans). Free, distinctive, modern. Avoid Inter at all costs — it's the AI-slop default.
- **Mono**: **`Geist Mono`** for: addresses, hashes, the decision JSON, raw bytes, validator request IDs. Never use mono for body text or headings.

Wordmark "ASSHAI": all-caps in the display serif, **wide tracking (~0.4em)**. Pair it with a small orange star/asterisk mark to the left (this is in the mocks — implement as a small SVG, not a Unicode character).

Editorial headline pattern, used on most pages:

```
[small uppercase eyebrow: "ON-CHAIN INTENT COMPILER"]
[Large display serif headline: "Describe the outcome."]
[Second line in same style: "Asshai compiles the best on-chain path."]
```

The two-line headline + uppercase eyebrow is a signature pattern. Reuse it.

### Motion

- **Compile-time stream**: receipt steps fade up subtly as they arrive (8–12px translate, 200–300ms, ease-out). The decision JSON character-types in (~10–20ms per character, with a blinking cursor) — this is the visual climax.
- **State transition** when status flips from `Compiling` → `IntentReady`: a quiet whole-page settle. The pulsing dot on the current step becomes a checkmark. No celebration burst. Think of a Vercel deploy turning green.
- **Hover**: very light. A subtle border lift on cards, a brief opacity nudge on links. No transforms.
- **Reduced motion**: respect `prefers-reduced-motion`. Disable the character-typing, disable the translate animations, keep instant fades.

Use **Framer Motion** for all of this. Use `AnimatePresence` for entering/exiting receipt steps. Stagger sibling reveals with `transition.delay` based on index.

### Backgrounds

The aurora gradient corners visible in the mocks are not decorative noise — they're the chrome that keeps the dark navy from feeling oppressive. Implement them as two large, very-low-opacity radial gradients absolutely positioned in the bottom corners of the page. CSS-only, no images. Roughly:

```css
.aurora-corner-left {
  position: fixed;
  bottom: -200px;
  left: -200px;
  width: 800px;
  height: 800px;
  background: radial-gradient(circle, rgba(120, 80, 255, 0.18), transparent 70%);
  pointer-events: none;
  z-index: 0;
}
/* mirror for right corner with a slightly different hue (e.g. magenta) */
```

Tune to taste against the mocks.

---

## Tech stack additions

Run these in `/frontend/`:

```bash
# shadcn foundation (initialize with your own design tokens, not defaults)
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button input textarea badge separator scroll-area card

# AI Elements for the streaming reasoning visualization
pnpm dlx ai-elements@latest add chain-of-thought reasoning task tool source shimmer response

# Animation + UI affordances
pnpm add framer-motion sonner
pnpm add lucide-react

# Fonts (already supported by Next.js via next/font/google — no install needed for Instrument Serif)
# Geist is shipped separately:
pnpm add geist
```

When initializing shadcn, **do not accept the default Slate or Stone palette**. Configure it to use your CSS variables from the design tokens table above. Run `init` with explicit prompts answered:
- Style: New York
- Base color: pick anything; you'll overwrite it
- CSS variables: yes
- Import path alias: `@/`

After init, replace the generated `globals.css` color variables with the token table above.

### Vercel AI Elements adapter pattern (non-obvious)

AI Elements components (`ChainOfThought`, `Reasoning`, `Task`, etc.) are designed to render from streamed LLM SDK output (`useChat`). Asshai's "stream" is actually the on-chain receipt log polled via wagmi. You need a thin adapter layer.

Create `/frontend/lib/use-receipt-stream.ts` that:

1. Calls `useReadContract` for `ReceiptLog.getEntries(goalId)` with `refetchInterval: 1500` when goal status is `Compiling`, and disabled otherwise.
2. Maps each `ReceiptEntry` into an `AgentStep` shape:
   ```ts
   type AgentStep = {
     id: string;             // unique key (stepName + agentRequestId)
     stepName: ReceiptStepName;
     status: 'pending' | 'streaming' | 'done';
     timestamp: number;
     payload: unknown;       // the decoded data
     requestId: bigint;
   }
   ```
3. Maintains a virtual "next step is pending" entry so the UI always shows what's about to happen (e.g. while `rates_fetched` is in flight, show `Task` step 1 with `status: 'streaming'`).
4. When the receipt for a step arrives, transitions that step's status from `streaming` → `done` and reveals the next step as `streaming`.
5. When goal status flips to `IntentReady`, marks all remaining pending steps as `done` and freezes the stream.

The character-by-character typing animation for the decision JSON happens client-side after `decision_built` arrives — once you have the full string, animate its reveal locally (don't try to fake actual on-chain streaming, the receipt arrives whole). 30 chars/second feels right.

---

## Screens to build

The user will paste the mocks as image context. The numbering below matches the mock filenames. For each screen, the visual ground truth is the mock; the data and behavior ground truth is this brief.

### Phase 1 — Foundation (do this first, in one pass)

1. Initialize shadcn with your custom tokens. Install AI Elements. Add Framer Motion, Sonner, Lucide, Geist.
2. Update `tailwind.config.ts` to register the design tokens.
3. Replace `globals.css` with the token CSS variables, font imports, and the aurora background utility classes.
4. Update `/frontend/app/layout.tsx` to load the serif display font + Geist + Geist Mono via `next/font`, and wrap the body in the aurora backdrop divs.
5. Build a shared `<AsshaiHeader />` component (wordmark + connect button) that lives in the layout.
6. Build the `useReceiptStream` adapter described above.

Do not start on any screen until Phase 1 compiles cleanly.

### Phase 2 — Home (`/`)

Replace `/frontend/app/page.tsx` entirely. The existing logic for posting a goal (`writeContract` to `GoalRegistry.postGoal` with the policy-defined `compilerConstraints`, `parseEther("0.6")` value, and Arbitrum USDC source) **must be preserved verbatim**. Only the presentation changes.

States to implement:
- **1.A Default (wallet not connected)** — placeholder rotates through example prompts. Connect Wallet pill in top-right. Recent receipts feed below the input.
- **1.B Wallet connected** — same layout, prompt prefilled with example. CTA is the orange `--accent` solid button.
- **1.C Unsupported prompt** — when `classifyGoalSupport(goal).supported === false`, render the firm rejection card immediately below the input, with the icon and policy reason from `goalPolicy.unsupportedReasons[code]`. CTA stays visible but disabled.

The recent receipts feed pulls from on-chain by reading the last N goals from `GoalRegistry`. Since `GoalRegistry` doesn't expose a "list" function, iterate from `nextGoalId - 1` downward (e.g. last 6 IDs), call `getGoal(id)` for each, and render only those with status `IntentReady` or later. Show only goals whose chosen venue is in the v1 universe (defensive — if anything else slipped through, skip it). For the chosen venue and `objectiveMatched` shown on each card, read the `decision_built` receipt for that goal and parse the JSON.

### Phase 3 — Intent compile/settled (`/intent/[id]`)

This is the load-bearing rewrite. `IntentClient.tsx` currently exists and has all the data flow right — your job is to keep every `useReadContract` / `useWriteContract` / `useSendTransaction` call intact while rebuilding the JSX around it.

States, all at the same URL, driven by `goal.status`:
- **2.A Compile / Mid-stream** — `Compiling`. Use `useReceiptStream` to drive the AI Elements `ChainOfThought` with three tasks: "Reading verified yield venues from DefiLlama," "Asking the Somnia LLM to choose," "Encoding the StandardOrder plan." Each task expands when active and shows its receipt payload as it arrives.
- **2.B Compile / Failed** — `Failed`. Replace the active step's content with the honest failure card ("The compiler couldn't reach consensus on this goal. Try refining it."). Provide "Refine prompt" (navigates back to home with the prompt prefilled) and "Retry compile" (calls `postGoal` again with the same params).
- **3.A Intent / Settled** — `IntentReady`. Same layout as 2.A but all steps are done, the destination summary appears below step 3, and the LI.FI execute panel appears at the bottom. Add the "Verified by Somnia consensus — N/N" badge (use the real subcommittee size from the receipt's response data; if the count isn't available, default to `3/3` since `DEFAULT_SUBCOMMITTEE_SIZE = 3`). Add "Share receipt" and "View raw" toggle (raw reveals the encoded StandardOrder bytes in mono).
- **4.A Intent / Executing** — `Submitted` and route tx is in flight. The reasoning receipt stays visible at the top (it's the audit trail, it doesn't disappear). A new "Execution" panel renders below it with four sub-steps: Arbitrum approval, LI.FI route tx, LI.FI bridge in progress (polled via `/api/lifi/status`), Base destination supply. Each sub-step lights up as confirmed. Use the existing `routeHash`, `approveHash`, `lifiStatus` state from `IntentClient.tsx`.
- **5.A Intent / Filled** — LI.FI status returned `DONE / COMPLETED`. Reorganize into the two-column "Why we chose this" / "What happened" layout from the mock. The hero summary band at the top reads `{amount} {positionTokenSymbol} supplied to {venue label} via reasoning audited by Somnia.` Pull the amount and symbol from the LI.FI status response's `receiving` field.

### Phase 4 — Feed (`/feed` or as a section on home)

**6.A** — A scrollable list of all compiled intents from this user's wallet (read by iterating `getGoal` and filtering by `author === userAddress`). Each row: goal text (truncated), chosen venue + APY, `objectiveMatched` pill, relative timestamp. Click navigates to that intent. Hover expands a row inline to show the rejected alternative for that goal (single entry in v1 since universe is two venues).

### Phase 5 — Compare (`/compare?a={id}&b={id}`)

**8.A / 8.B** — Two-column side-by-side comparison of two compiled receipts. Each column is a compact version of the settled receipt: goal, chosen venue, `objectiveMatched` pill, rejected alternative with strikethrough + reason, reasoning summary, "Verified by Somnia consensus" badge, "View full receipt" link.

Centered headline above the columns:
- Eyebrow: `ON-CHAIN INTENT COMPILER`
- Headline: "Same chain. Same data. Different goals. Different decisions."
- Subhead: "Both audited by Somnia. Both permanent."

Subtle visual connector between the two columns at the chosen-venue row indicating the same input universe was available to both. A simple horizontal hairline with a small label "shared candidate pool" works.

This screen is the demo's hero moment. Spend the polish here.

### Phase 6 — Not found / expired

**7** — `/intent/[id]` for an unknown id, or an `Expired` goal. Quiet, minimal page. "This receipt has expired" / "This intent doesn't exist." Single CTA back to home. No apology copy.

---

## Files to create or modify

### Will create

- `/frontend/lib/use-receipt-stream.ts` — the streaming adapter
- `/frontend/lib/design-tokens.ts` — TypeScript export of token names for type-safe use
- `/frontend/components/asshai/AsshaiHeader.tsx`
- `/frontend/components/asshai/AsshaiWordmark.tsx` — wordmark + star mark
- `/frontend/components/asshai/AuroraBackdrop.tsx` — the corner gradients
- `/frontend/components/asshai/VenueLogo.tsx` — real CoinGecko logo with fallback
- `/frontend/components/asshai/ReceiptCard.tsx` — used by home feed and `/feed`
- `/frontend/components/asshai/RejectedAlternative.tsx` — strikethrough card
- `/frontend/components/asshai/ValidatorBadge.tsx` — "Verified by Somnia consensus N/N"
- `/frontend/components/asshai/ExecutionTrace.tsx` — the four-step execution panel
- `/frontend/app/compare/page.tsx`
- `/frontend/app/feed/page.tsx` (optional — may merge into home)
- `/frontend/components/ai-elements/*` — added by the AI Elements CLI

### Will rewrite (presentation only; behavior stable)

- `/frontend/app/page.tsx`
- `/frontend/app/intent/[id]/IntentClient.tsx`
- `/frontend/app/layout.tsx`
- `/frontend/app/globals.css`
- `/frontend/tailwind.config.ts`

### Do NOT modify

- `/frontend/lib/contracts.ts`
- `/frontend/lib/goal-policy.json`
- `/frontend/lib/goal-support.ts` (you may add small helpers, but don't change the classifier)
- `/frontend/lib/somnia.ts`
- `/frontend/app/providers.tsx`
- `/frontend/app/api/**`
- `/contracts/**` (you have no reason to look at these)

---

## Anti-patterns (do not do these)

These are hard constraints. Each one corresponds to a real failure mode I want avoided:

- **Do not** add a chat interface. Asshai is not a chatbot. The input is one textarea, not a conversation.
- **Do not** add a settings panel, dropdowns for source asset, chain selectors, or slippage controls on the compose surface. The pitch is "type fuzzy English." A configurator contradicts the pitch.
- **Do not** add modal dialogs for the execution flow. Use inline state transitions. Modals fragment the receipt.
- **Do not** use shadcn's default Card with default border + default background as the primary visual unit. shadcn is scaffolding; the visual identity must be more deliberate. Restyle Card, or build your own.
- **Do not** use colored dot placeholders or letter circles for venue icons. Always render real CoinGecko logos (see venue universe section).
- **Do not** use outlined "pill with pulsing dot" patterns (the cliché "Live" badge). If a status badge is needed, use a solid-background filled pill, no animated dot.
- **Do not** use Recharts, Chart.js, or any chart library. The data visualization in v1 is small CSS+SVG bars, hand-built.
- **Do not** introduce three.js, react-three-fiber, or any 3D dependency. The reasoning chain materializing live IS the spectacle.
- **Do not** use Inter, Roboto, or Arial. Use the fonts specified above.
- **Do not** show fake venues in any feed or receipt. Aave V3 USDC on Base and Compound V3 USDC on Base only.
- **Do not** change contract addresses, ABIs, or env var names. The on-chain data layer is stable.
- **Do not** use full phone mockups / device frames anywhere. The product is desktop-first.
- **Do not** use bright Material-style status colors. Mute them.
- **Do not** show loading spinners during compile. The streaming receipt IS the load state.
- **Do not** use raw hex values in component code. Always reference design tokens.

---

## Verification

Before considering the build complete, all of these must work:

1. `pnpm dev` boots cleanly with no console errors.
2. Home page (`/`) renders the styled hero, input, and recent receipts feed. Wallet connect works.
3. Typing an unsupported prompt (e.g. "rebalance if ETH drops 10%") shows the firm rejection card; CTA is disabled.
4. Typing a supported prompt and submitting calls `postGoal`, gets a transaction confirmation, and navigates to `/intent/{newId}`.
5. `/intent/62` renders the **settled** Compound max_yield receipt with all three reasoning steps marked done, the destination card showing Compound V3, the LI.FI execute panel ready.
6. `/intent/63` renders the **settled** Aave safety receipt correctly.
7. `/intent/64` renders the **settled** Compound fallback receipt correctly.
8. Posting a new goal and watching `/intent/{id}` shows the live streaming behavior: step 1 fades in, then step 2 fades in with the decision JSON character-typing, then step 3 with the destination summary, then transitions cleanly into the settled view with the execute panel.
9. Clicking "Execute via LI.FI" walks through approval → route tx → bridge status polling, and lands on the 5.A filled state when LI.FI returns DONE.
10. `/compare?a=62&b=63` renders the side-by-side hero comparison.
11. `/intent/99999` (a non-existent id) renders the 7.A not-found page.
12. The entire site looks correct on a 1440×900 viewport. Mobile responsiveness is a non-goal for v1.

---

## Open questions to flag to the user, not assume

Where the brief and the live system disagree, surface the question rather than picking a side:

- **Validator quorum display**: the mocks show 11/11; the live contract uses `DEFAULT_SUBCOMMITTEE_SIZE = 3`. Render whatever the real subcommittee size is (read from the agent response if available, otherwise fall back to 3). Don't hardcode 11. Flag to the user if they want to bump the subcommittee size for the demo.
- **Accent color**: the mocks use a warm orange. If the user provides Somnia's official brand palette (from the Figma file), update `--accent` accordingly. Until then, `#FF6A2C` is a reasonable placeholder.
- **Confidence score**: the mocks show a "confidence: 0.92" field in the decision JSON. Our actual `decision_built` payload **does not currently include this field**. Render it only if present; don't fabricate it client-side. Flag to the user if they want this added to the prompt.

---

## Style of work

- Build phase-by-phase. Get Phase 1 + Phase 2 working end-to-end before touching Phase 3.
- After Phase 3 is working against the three test goalIds (62/63/64), pause and let the user verify before moving on.
- Commit early, commit often. Each phase is roughly one commit.
- When something is ambiguous between the mocks and this brief, **ask the user** — don't pick.
- When you need to make a small visual decision that isn't covered (e.g. exact line-height of a pill), follow the closest pattern in the mocks rather than inventing.
- Keep the diff focused. Don't refactor files you don't need to touch.

---

## Reference materials worth opening

- Vercel AI Elements docs: <https://elements.ai-sdk.dev>
- shadcn/ui: <https://ui.shadcn.com>
- Framer Motion: <https://motion.dev/docs/react>
- polyhubai (study the dark trading UI patterns): <https://github.com/polyhub-sol/polyhubai>
- Somnia agent docs (only if you need to understand the on-chain side): <https://docs.somnia.network/agents>
- LI.FI Composer docs: <https://docs.li.fi/composer/how-it-works>

That's everything. Build with care.
