# Asshai — Frontend Structural Redesign Brief

## Why we are redesigning

The current frontend tells the story sequentially: typed prompt → 1→2→3→4 timeline with green checkboxes → a small Execute panel → walls of diagnostic status text. That shape made sense as a debug surface but it actively undermines the product pitch.

Asshai's pitch is **"every DeFi action comes with proof of how the decision was made."** A scrolling timeline reads like a build log, not proof. A multi-popup execute flow ending in raw LI.FI status strings reads like a hackathon side project, not a settlement product.

The redesign reshapes the entire user narrative from **"scroll through what happened"** to **"inspect a single durable artifact."** The receipt is the product. Treat it like a Stripe payment detail page, not a CI log.

This brief is exhaustive and frontend-only. Read it end-to-end before opening any file. When the brief and your instincts disagree, the brief wins.

---

## What we throw out

- The numbered 1→2→3→4 timeline with green checkboxes on the receipt page. **Gone entirely.** Compilation progress is not a user-facing feature once the receipt exists.
- The "Switch to origin chain 42161" → "Approve" → "Execute via LI.FI" three-button flow. Collapses to **one button**.
- The four lines of `Quote status: ... LI.FI steps: ... Execution status: ... LI.FI status: ...` debug strings rendered inline at the bottom of the executing page. **All of it.**
- The duplicate rendering of `rejectedAlternatives` — once as JSON inside the decision block, once as strikethrough rows below. Pick one representation (the structured one) and delete the other.
- The orphaned top-right "View raw" toggle. Replaced by inline metadata on the hero band.
- Letter-circle venue placeholders (FL for Fluid, ST for Steakhouse). Real logos only.
- The lonely single-row receipt feed on the home page. Replaced with a horizontal ticker pattern.

## What we keep

- **Typography**: Instrument Serif (headlines, lowercase), Geist Sans (body), Geist Mono (data, IDs, hashes, wordmark)
- **Color tokens** in `globals.css`: `--background #050607`, `--text-primary #f7f4eb` (cream), `--accent #ff7a1a` (orange). Don't redefine.
- The `ASSHAI` mono wordmark with the star symbol, the aurora gradient corners, the somnia glyphs in page corners (`// $`, `@()`, `{s}`, `>> ::`)
- The "Verified by Somnia consensus 3/3" chip — but it lives inline in the hero band metadata, not as a hero element on its own row
- All existing data plumbing: `useReceiptStream`, `lib/contracts.ts`, `lib/goal-policy.json`, `lib/goal-support.ts`, `lib/somnia.ts`, the `/api/*` routes, `app/providers.tsx`. **Do not modify these.**
- The "Backed by Somnia consensus. Audit every decision." tagline below the home compile box

## What the contract emits (assume as fact)

The live compiler contract handles the full 6-venue universe (Aave V3, Compound V3, Morpho Spark, Morpho Moonwell Flagship, Fluid, Steakhouse Prime — all USDC on Base) and emits `rejectedAlternatives` with **differentiated per-alternative reasons** (not the same string repeated). Build the Reasoning tab against this assumption. The frontend should still adapt gracefully if a receipt has fewer rejected alternatives than the venue universe — don't hardcode a count.

---

## The new shape: three tiers

### Tier 1 — Hero Band (always visible)

A single dense card at the top of the receipt page. Everything a non-developer needs to evaluate the outcome lives here, no scrolling.

Contents, left-to-right or stacked depending on viewport:

- **Chosen venue block**: venue logo (real CoinGecko PNG), venue display name, APY value, risk tier pill, lockup pill
- **One-sentence reasoning**: extracted from the LLM JSON `reasoning` field, set in Instrument Serif at a generous size. This is the demo-money sentence. Not the JSON dump.
- **Metadata row** (small, mono): prompt text (truncated with tooltip), objective tag (`safety` / `max_yield` / `protocol_preference` / `fallback`), Intent ID, Somnia hash, "3/3 Somnia consensus" chip, `View raw` link, `Share` link, `Copy URL` link
- **Primary CTA**: `Execute intent` button. See the dedicated Execute section below.

When the intent is already executed, the hero band replaces the CTA with a settled badge: `0.071639 aBasUSDC supplied to Aave V3 on Base · view position →`.

### Tier 2 — Tabbed Detail (one screen, four views, no vertical scroll)

A tab strip directly below the hero band. Use Radix Tabs (you already have shadcn primitives). Default tab is `Reasoning`.

Each tab is sized to roughly one viewport height so users never scroll past a tab.

#### Tab 1: Reasoning

The flagship tab. This is what judges screenshot.

Layout:

- **Top half — Chosen card**: large card with venue logo, name, APY, TVL, risk tier, lockup, source. Below the stat row: the LLM `reasoning` sentence rendered in serif at body+1 size. This card visually says "we picked this and here's why."
- **Bottom half — Rejected chiclets**: a compact horizontal grid of small cards, one per rejected venue. Each chiclet shows: venue logo + name + APY + dimmed strikethrough styling on the name. **Each chiclet shows its own reason inline below the name** — read it from the corresponding `rejectedAlternatives[i].reason` field.

Each chiclet is clickable. Click opens the Inspector Drawer (Tier 3) showing the full per-venue payload: full DefiLlama row data, full LLM reasoning JSON for this alternative, comparison vs chosen.

A `View raw JSON` link in the corner of the tab opens the inspector drawer to the full decision JSON.

**Do not render the raw JSON in this tab.** The Raw tab is for that.

#### Tab 2: Plan

The compiled StandardOrder rendered as a **graph**, not a key-value table.

Use the Workflow component from Vercel AI Elements (wraps `@xyflow/react`). Nodes:

```
[Arbitrum USDC]  →  [LI.FI Composer]  →  [Base USDC]  →  [Venue Pool]  →  [Position Token]
   chain: 42161      bridge route       chain: 8453     (e.g. Aave)       (e.g. aBasUSDC)
   amount: 0.1 USDC  (animated edge)    amount: 0.1     supply           0.071639
```

The venue node and position token node read dynamically from the chosen venue config — not hardcoded to Aave. Each node is a small card with: chain badge (logo + name), token logo + amount, node-type label. Edges show direction with animated dashed lines. Make this layout horizontal, not vertical. Auto-fit the canvas. Disable user drag/zoom by default — it's a diagram, not an editor.

Below the graph, a compact metadata strip: `Intent ID 78 · Hash 0x7772...474ca5 · Encoded StandardOrder · View on Somnia explorer →`.

#### Tab 3: Execution

Reuse the same graph from the Plan tab, but with state per node:
- `pending` — dim node, no edge animation
- `active` — accent-colored ring around node, animated edge incoming
- `done` — checkmark icon, solid edge incoming
- `error` — destructive ring, dashed edge

State updates from `useSendCallsStatus` (EIP-5792) or the fallback `useWaitForTransactionReceipt` calls.

Below the graph: a compact list of receipt cards using AI Elements `Task` component, one per `ReceiptLog` event (`rates_fetched`, `decision_built`, `candidates_selected`, `plan_built`, `order_encoded`). Each shows event name + on-chain tx hash + explorer link. Collapsed by default; click to expand the event payload in the inspector drawer.

When execution is fully settled, show a single hero confirmation row: `✓ 0.071639 aBasUSDC supplied to Aave V3 USDC on Base · explorer →`.

#### Tab 4: Raw

The audit dump. This tab exists for judges who want depth and for the "verifiable" pitch.

Sections (use AI Elements `Reasoning` component or simple collapsible blocks, all collapsed by default):

- **Decision JSON** (the full `{poolId, objectiveMatched, rejectedAlternatives, reasoning}` blob)
- **LI.FI quote** (the full quote object from `/v1/quote` or `/v1/quote/contractCall`)
- **StandardOrder bytes** (the encoded `order_encoded` step payload, with a copy button)
- **Receipt log** (all 5 `ReceiptLog` events with raw payloads, abi-decoded inline)
- **Goal envelope** (the GoalRegistry entry: requester, source token, source amount, requested objectives, timestamps)
- **Contract addresses** (CompilerEngine, ReceiptLog, IntentStore, AddressRegistry, GoalRegistry — all with Somnia explorer links)

Each section header is a Mono pill, click to expand. Inside is monospace text with syntax-friendly formatting. This is the only tab where mono-orange JSON aesthetic is acceptable.

### Tier 3 — Inspector Drawer

A right-side slide-over panel (use `vaul` or Radix Dialog with side="right"). Opens on:

- Clicking a rejected-alternative chiclet → drawer shows full venue comparison
- Clicking a node in the Plan/Execution graph → drawer shows that node's data
- Clicking a `Task` row in Execution tab → drawer shows that receipt's payload
- Clicking `View raw JSON` from Reasoning tab → drawer shows full decision JSON
- Clicking any hash/ID in metadata strips → drawer shows the resolved object

The drawer slides over the existing layout. The user never leaves the receipt page. Press Esc or click outside to close.

Drawer styling: same near-black background, slight border on the left edge, generous padding, mono content blocks with copy buttons.

---

## The single Execute button (do this right)

This is the largest UX upgrade in the redesign and a real technical flex. Most hackathon DeFi projects ship the 3-popup flow. We ship one.

### Behavior

A single button labeled `Execute intent`. Click triggers an internal orchestration:

1. **Chain check** — read current chain via `useAccount`. If not Arbitrum (chainId 42161), call `useSwitchChain` and await. Update button label to `Switching to Arbitrum...`. If the user rejects, restore the default state and show an error toast.

2. **Capability detection** — call `useCapabilities` (wagmi) for chainId 42161. Read `capabilities[42161]?.atomic?.status`. Values are `supported`, `ready`, or `unsupported`.

3. **Branch A (5792 path, status === `supported` || `ready`)**:
   - Build the calls array: `[{ to: USDC, data: approveCalldata, value: 0 }, { to: LIFI_DIAMOND, data: lifiCalldata, value: 0 }]`
   - Call `useSendCalls({ calls, atomicRequired: status === 'supported' })`
   - This produces a **single wallet popup** the user signs once
   - Track via `useCallsStatus(bundleId)` — when status is `100` (`CONFIRMED`), update the Execution tab graph and emit a success toast

4. **Branch B (fallback, status === `unsupported` or capability check fails)**:
   - Run the existing sequential flow: `writeContract(approveCall)` → await → `writeContract(lifiCall)` → await
   - This is the current behavior. Don't delete it; just gate it behind capability detection.

5. **Button state machine**:
   - `Execute intent` (default, orange filled)
   - `Switching to Arbitrum...` (during switchChain)
   - `Confirm in wallet...` (during sendCalls or first writeContract)
   - `Executing on-chain...` (after wallet signature, awaiting confirmation)
   - `Executed → view position` (settled state, links to the on-chain position)
   - On error: button restores to default with an error toast describing what failed

### Critical: no inline status strings anywhere

All ephemeral status moves to `sonner` toasts at the bottom-right corner. The current "Quote status: ...", "LI.FI steps: ...", "Execution status: ...", "LI.FI status: ..." lines **never render in the layout.** They become toasts that auto-dismiss after success or persist as error toasts on failure.

The only place status is visualized inline is **the Execution tab graph** — node colors change as the route progresses. That's the visual.

### Code skeleton

```tsx
const { chain } = useAccount()
const { switchChainAsync } = useSwitchChain()
const { data: capabilities } = useCapabilities({ chainId: 42161 })
const { sendCallsAsync } = useSendCalls()
const { writeContractAsync } = useWriteContract()

async function executeIntent() {
  try {
    if (chain?.id !== 42161) {
      setButtonState('switching')
      await switchChainAsync({ chainId: 42161 })
    }
    const atomicStatus = capabilities?.atomic?.status
    if (atomicStatus === 'supported' || atomicStatus === 'ready') {
      setButtonState('confirming')
      const { id } = await sendCallsAsync({
        calls: [approveCall, lifiCall],
        capabilities: { atomic: { required: atomicStatus === 'supported' } },
      })
      setButtonState('executing')
      // poll useCallsStatus(id) externally to drive graph state
    } else {
      setButtonState('confirming')
      await writeContractAsync(approveCall)
      setButtonState('executing')
      await writeContractAsync(lifiCall)
    }
    setButtonState('done')
    toast.success('Intent executed')
  } catch (err) {
    setButtonState('default')
    toast.error(humanizeError(err))
  }
}
```

`humanizeError` strips LI.FI's `"Transaction hash '0x...' not found on chain '42161'"` polling errors and replaces them with user-readable messages. Never let a raw LI.FI string surface.

---

## Home page redesign

Three changes from the current home.

### 1. Replace the lonely textarea with a command-bar pattern

Above the textarea, add a row of **quick-fill chips**:

```
[ Safest ]  [ Best yield ]  [ Balanced 6%+ ]  [ Prefer Aave ]  [ Prefer Compound ]
```

Click a chip → pre-fills the textarea with a sensible prompt and sets the amount field to 1 USDC. First-time users have a path. Power users still type freeform.

Use simple `<button>` elements styled as Mono pills with hover. No library needed for the chips themselves.

### 2. Replace the vertical "Recently compiled receipts" with a horizontal ticker

Same data (3 most recent goals), but rendered as a horizontal scrollable strip of cards. Each card: prompt (truncated, serif) → arrow → chosen venue + APY → objective pill → relative time.

This conveys "many decisions have been audited" without a vertical scroll. Snap-scroll on touch, arrow keys on desktop. Click a card → navigate to that receipt.

### 3. Add `⌘K` command palette

Install `cmdk`. Bind `⌘K` (mac) / `Ctrl+K` (win) globally. The palette opens with:

- Recent intent IDs (last 5)
- Prompt presets (same as the chips)
- `Compile new intent` action
- `Paste a receipt URL` action

This is the single feature that makes the app feel native to the Linear/Vercel design lineage. It's also a low-effort impressive touch — judges who try `⌘K` get the "oh, this is built right" reaction.

---

## Libraries to install

```bash
# Vercel AI Elements (installs into your shadcn components dir, themes from CSS vars)
npx ai-elements@latest add chain-of-thought reasoning plan task tool workflow

# Command palette
npm install cmdk

# Slide-over drawer (Linear-style)
npm install vaul

# Toast notifications (likely already installed; verify)
npm install sonner

# shadcn primitives you may need
npx shadcn@latest add tabs dialog hover-card
```

AI Elements transitively installs `@xyflow/react` when you add `workflow`. Don't install it separately.

All AI Elements components use shadcn's CSS-variable theming, so they automatically pick up `--background`, `--foreground`, `--accent` etc from your existing `globals.css`. Verify after install: open one of the new components and confirm it renders with cream-on-near-black, not the shadcn default white.

If a component looks wrong after install, the fix is almost always in `globals.css` shadcn-token mapping, not in the component file.

---

## File-level changes

### Create

- `components/receipt/HeroBand.tsx` — Tier 1 hero
- `components/receipt/ReceiptTabs.tsx` — Tier 2 tab strip + tab content
- `components/receipt/ReasoningTab.tsx` — chosen card + rejected chiclets
- `components/receipt/PlanTab.tsx` — route graph (AI Elements Workflow)
- `components/receipt/ExecutionTab.tsx` — animated graph + Task list
- `components/receipt/RawTab.tsx` — collapsible raw payload sections
- `components/receipt/InspectorDrawer.tsx` — Tier 3 slide-over
- `components/receipt/RejectedChiclet.tsx` — single rejected alternative card
- `components/receipt/RouteGraph.tsx` — the shared graph used by Plan and Execution tabs (parameterized by state)
- `components/receipt/ExecuteButton.tsx` — the orchestrating single-button component
- `components/home/PromptChips.tsx` — quick-fill chips row
- `components/home/ReceiptTicker.tsx` — horizontal receipt strip
- `components/CommandPalette.tsx` — `⌘K` palette wrapping `cmdk`
- `lib/use-execute-intent.ts` — the executeIntent orchestration hook (5792 + fallback)
- `lib/humanize-error.ts` — error string sanitizer

### Modify

- `app/page.tsx` — swap textarea-only layout for chips + textarea + amount + button + horizontal ticker
- `app/intent/[id]/page.tsx` — replace the timeline layout with HeroBand + ReceiptTabs
- `app/layout.tsx` — mount `<CommandPalette />` globally, mount `<Toaster />` from sonner globally
- `components/VenueLogo.tsx` — add real CoinGecko URLs for `morpho-spark-usdc-base`, `morpho-moonwell-flagship-usdc-base`, `fluid-usdc-base`, `steakhouse-prime-usdc-base`. Find these by searching CoinGecko for the protocol name. No letter circles.
- `app/globals.css` — only if shadcn primitive tokens need mapping after AI Elements install. Don't touch `--background`, `--text-primary`, `--accent`.

### Delete

- The existing 1→2→3→4 timeline component if it's its own file
- The diagnostic status text block at the bottom of the executing page
- The duplicate strikethrough rejected-alternatives block (after the JSON dump)
- The standalone "Refresh LI.FI status" button (move behind a 30s-stale fallback condition inside the execute orchestration, not a UI element)

### Never touch

- `contracts/**`
- `frontend/lib/contracts.ts`
- `frontend/lib/goal-policy.json`
- `frontend/lib/goal-support.ts`
- `frontend/lib/somnia.ts`
- `frontend/lib/use-receipt-stream.ts` (the receipt streaming adapter — only consume it)
- `frontend/app/providers.tsx`
- `frontend/app/api/**`

---

## Toast taxonomy (replacing the diagnostic walls)

Every ephemeral status string moves to a `sonner` toast. Rules:

- **Info toasts** (auto-dismiss 3s): "Switching to Arbitrum", "Quote ready", "Approval confirmed"
- **Success toasts** (auto-dismiss 5s): "Intent executed · 0.071639 aBasUSDC supplied", "Plan compiled"
- **Error toasts** (sticky until dismissed): humanized error from `humanizeError(err)`. Never raw LI.FI strings.
- **Loading toasts** (replace on next state): "Waiting for destination execution..." with a spinner

Toasts render bottom-right, mono font, near-black background with a 1px border in the accent color for errors, in a muted color for info/success.

Never let the words `relaydepository`, `feeCollection`, or `0x...not found on chain` appear in a toast or in the layout. These are debug values.

---

## Anti-patterns (do not do)

- **Do not** introduce a chat interface anywhere. The receipt is an artifact, not a conversation.
- **Do not** add loading skeletons to the receipt tabs. Use a top-of-page progress bar during compile, then render the receipt once.
- **Do not** add purple, green, or blue accent colors. Cream + orange + dim white. Risk tiers can have subtle color semantics (low/lowest = muted green, medium = muted orange, high = muted red) but never saturated.
- **Do not** render the JSON decision blob in the Reasoning tab. JSON only lives in the Raw tab and the Inspector Drawer.
- **Do not** show "Verified by Somnia consensus 3/3" as a hero element. It's inline metadata.
- **Do not** show step numbers like "Step 1 of 4" anywhere. The receipt is not a wizard.
- **Do not** use Lucide icons larger than 16px. They are accents, not decoration.
- **Do not** add pulsing dots, animated gradients, or shimmer effects to pill badges.
- **Do not** introduce a settings page, a user profile page, or any nav element beyond the wordmark + wallet button.
- **Do not** install a charting library. Hand-built SVG or AI Elements is enough.
- **Do not** modify any policy in `goal-policy.json`. The frontend reflects whatever the policy says.

---

## Verification checklist

Before declaring done, walk through these:

- [ ] Open the home page → see chips row + textarea + amount + button + horizontal ticker. No vertical receipt list.
- [ ] Press `⌘K` → command palette opens
- [ ] Click a quick-fill chip → textarea + amount pre-populate
- [ ] Type a freeform prompt → button activates correctly (no false negative)
- [ ] Compile an intent → navigates to `/intent/[id]`
- [ ] Receipt page shows hero band at top with chosen venue, reasoning sentence, metadata strip, Execute CTA. **No 1→2→3→4 timeline anywhere.**
- [ ] Tab strip below hero with Reasoning / Plan / Execution / Raw
- [ ] Reasoning tab shows chosen card + rejected chiclets, each chiclet with its own per-alternative reason inline. **No raw JSON.**
- [ ] Click a chiclet → inspector drawer slides in from right with per-alternative detail
- [ ] Plan tab shows a horizontal graph: Arbitrum USDC → LI.FI → Base USDC → [chosen venue pool] → [chosen position token]
- [ ] Execution tab shows the same graph, with node states reflecting current execution
- [ ] Raw tab has all collapsible sections (Decision JSON, LI.FI quote, StandardOrder bytes, Receipt log, Goal envelope, Contracts), all collapsed by default
- [ ] Click Execute intent → **single wallet popup** in a 5792-capable wallet (test with MetaMask v12+ or Coinbase Wallet). Sequential fallback in older wallets.
- [ ] No raw LI.FI status strings anywhere in the layout. All ephemeral status is in sonner toasts.
- [ ] All four new venue logos resolve to real CoinGecko images. No FL/ST letter circles.
- [ ] Press Esc with drawer open → drawer closes
- [ ] Press Esc with palette open → palette closes
- [ ] Refresh while executing → state resumes (receipt stream + tx hash both persist in URL or store)
- [ ] On mobile width (375px), the hero band stacks, tabs scroll horizontally, the graph still renders (consider replacing graph with a vertical stepper at <640px)
- [ ] Lighthouse run: no console errors, no failed network requests
- [ ] Demo recording test: load home → press ⌘K → type "safest" → compile → land on receipt → click through 4 tabs → click a chiclet → close drawer → click Execute → see single wallet prompt → settled state. The whole flow should take under 90 seconds with no jank.
