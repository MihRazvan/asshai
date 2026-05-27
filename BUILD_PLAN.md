# Build Plan — Verifiable Intent Solver on Somnia

> **Working name:** `Scryer` (placeholder — swap in your chosen ASOIAF name throughout the codebase; all references to "Scryer" below are project-name placeholders).

> **Hackathon:** Somnia Agentathon — submission due **June 11, 2026**.
> **Scope of v1:** Cross-chain stablecoin yield optimization. Intents in, agent-reasoned plans out, LI.FI executes.

---

## 1. The pitch in one paragraph

Intent-based DeFi is now a $50B+ category — UniswapX, 1inch Fusion, CoW, Across — but every one of those systems shares the same hidden flaw: the *solving itself* runs on private, permissioned, off-chain infrastructure that you have to trust. Users sign intents trustlessly; the layer that fulfills them is centralized. **Scryer is the first intent solver where the solving runs inside validator consensus.** Users post natural-language intents on Somnia ("maximize my USDC yield, 7-day lockup max, low risk"). On-chain agents pull rates from across the entire DeFi landscape via JSON API calls, reason about the optimal allocation via consensus-verified LLM inference, and produce a structured plan with full receipts. LI.FI executes that plan as a single bundled transaction across any of 50+ chains. Every reasoning step is on-chain. Every validator independently re-ran the analysis and agreed. Anyone can audit what the solver read, what it considered, and why it chose what it chose.

**Moat:** consensus-verified solving is structurally impossible on any chain without on-chain LLM consensus. Somnia is the only one.

---

## 2. What we're actually building (high level)

Three pieces, clean separation:

1. **On-chain reasoning (Somnia).** A set of Solidity contracts that receive intents, orchestrate chained agent calls (JSON API → LLM Inference → LLM Inference), and write the final plan + receipt log on-chain. This is the load-bearing innovation.

2. **Off-chain execution (LI.FI REST API).** A backend service (or Next.js API route) that watches the on-chain `PlanReady` events, fetches LI.FI quotes for the agent-decided allocations, and returns a ready-to-sign transaction to the user. **User keeps custody throughout** — protocol never holds funds.

3. **Frontend (Next.js).** Intent submission, live agent reasoning visualization, plan preview, one-click LI.FI execution, receipt explorer. *Design and UX/UI direction will come separately — do not over-design upfront. Build minimally functional first.*

---

## 3. Architecture

### High-level flow

```
User                Frontend            Somnia Contracts                LI.FI API
 │                     │                       │                            │
 │  "max USDC yield"   │                       │                            │
 ├────────────────────►│                       │                            │
 │                     │   postIntent()        │                            │
 │   sign tx           ├──────────────────────►│                            │
 │◄────────────────────┤                       │                            │
 │   submit            │                       │                            │
 ├────────────────────►├──────────────────────►│ IntentPosted event         │
 │                     │                       │                            │
 │                     │   (watches events)    │ ─── Agent 1: JSON API ────►│ (DefiLlama)
 │                     │                       │ ◄── pools data callback ───┤
 │                     │                       │ ─── Agent 2: LLM filter ──►│
 │                     │                       │ ◄── candidates callback ───┤
 │                     │                       │ ─── Agent 3: LLM plan ────►│
 │                     │                       │ ◄── final plan callback ───┤
 │                     │                       │                            │
 │                     │   (PlanReady event)   │ PlanReady event            │
 │                     │◄──────────────────────┤                            │
 │   view plan         │                       │                            │
 │◄────────────────────┤                       │                            │
 │   "execute"         │                       │                            │
 ├────────────────────►│                       │                            │
 │                     │   GET /v1/quote ──────────────────────────────────►│
 │                     │◄──── quote ──────────────────────────────────────  │
 │   sign LI.FI tx     │                       │                            │
 │◄────────────────────┤                       │                            │
 │   submit            │                       │                            │
 ├──────────────────────────────────────────────────────────────────────────┤
 │                     │   GET /v1/status ─────────────────────────────────►│
 │                     │◄──── status ──────────────────────────────────────  │
```

### Why the agent chain runs *on-chain*

This is the part that's tempting to mess up. The reasoning **must** be on-chain (not in a Node.js backend that calls Somnia agents), because:

1. The chain itself is the orchestrator — `callback → createRequest → callback → createRequest` is the canonical agent-chaining pattern in the Somnia docs.
2. Every intermediate result is consensus-verified and gets a receipt.
3. The final plan is on-chain state anyone can read and re-execute. No "trust our backend's interpretation."

If we moved the orchestration off-chain, we'd be no different from any other AI yield bot. The on-chain orchestration is the moat.

### Why execution runs *off-chain* via LI.FI REST API

LI.FI's own docs say it explicitly: *"Building an AI agent? For AI integrations, we recommend using the REST API directly instead of the SDK."* The REST API is a stateless HTTP endpoint — we call it from our backend/frontend, get a ready-to-sign transaction, hand it to the user. **No need to deploy LI.FI contracts on Somnia ourselves; LI.FI already routes USDC.e in via Stargate.**

Composer (`toToken = vault token`) bundles bridge + swap + deposit into one atomic transaction, which is exactly what we need.

---

## 4. Smart contract design

Four contracts on Somnia testnet first, mainnet later.

### `IntentRegistry.sol`

The entry point. Users post intents here. Stores them, emits events, kicks off the agent chain.

**Intent struct (storage):**
```solidity
enum IntentStatus { Pending, Solving, PlanReady, Executed, Failed, Expired }

struct Intent {
    address author;
    string naturalLanguage;       // "max USDC yield, 7-day lockup max"
    address sourceAsset;          // address user holds (e.g. USDC)
    uint256 sourceAmount;         // amount in smallest unit
    uint256 sourceChainId;        // chain user holds it on
    string[] constraints;         // structured constraint tags (e.g. ["no-lockup-over-7d", "risk-low"])
    uint256 deadline;             // when intent expires
    IntentStatus status;
    uint256 createdAt;
    address solver;               // SolverEngine that owns this intent's flow
}

mapping(uint256 => Intent) public intents;
uint256 public nextIntentId;
```

**Key functions:**
- `postIntent(string nl, address asset, uint256 amount, uint256 chainId, string[] constraints, uint256 deadline) external payable returns (uint256 intentId)` — payable to fund the solver. Emits `IntentPosted(intentId, author, ...)`.
- `getIntent(uint256 intentId) external view returns (Intent memory)`.
- `markPlanReady(uint256 intentId)` — called by SolverEngine when plan is final.
- `markExecuted(uint256 intentId, bytes32 lifiTxHash)` — called by user's wallet (or relayer) after successful LI.FI execution.

### `SolverEngine.sol`

The orchestrator. Owns the agent-chaining state machine for each intent.

**State per intent:**
```solidity
enum SolveStep { Idle, FetchingRates, FilteringPools, BuildingPlan, Done, Failed }

struct SolveState {
    uint256 intentId;
    SolveStep step;
    uint256 currentAgentRequestId;
    bytes ratesPayload;       // raw DefiLlama response (or selector extracted)
    string[] candidatePools;  // pool IDs that survived LLM filter
    bytes finalPlan;          // encoded plan from third agent
}

mapping(uint256 => SolveState) public solveStates;
```

**Flow (called from `IntentRegistry.postIntent`'s same-tx hook OR a separate `startSolve(intentId)` external call funded by the intent author):**

1. `startSolve(intentId)` → call JSON API agent. Payload: `fetchString("https://yields.llama.fi/poolsBorrow", "...")` or `fetchString("https://yields.llama.fi/pools", "{json-path-to-prefilter}")`. Set state to `FetchingRates`.

2. `handleRatesResponse(...)` callback → store rates payload. Call LLM Inference agent with prompt:
    ```
    You are a DeFi solver. Given the user intent "{nl}" and constraints {constraints},
    select the top N pools from this list that fit the intent. Return only the pool IDs
    as a comma-separated string. Pools: {ratesPayload}
    ```
    Use `inferString` with a constrained output format. Set state to `FilteringPools`.

3. `handleFilterResponse(...)` callback → parse pool IDs. Call LLM Inference agent again with prompt:
    ```
    Allocate {amount} {asset} across these pools to fit the intent: "{nl}".
    Return strictly JSON: [{"pool":"<id>","chain":<chainId>,"pct":<0-100>}, ...]
    Pools: {candidatePools with details}
    ```
    Use `inferString`. Set state to `BuildingPlan`.

4. `handlePlanResponse(...)` callback → store the final plan. Write to `PlanVault`. Mark intent `PlanReady`. Emit `PlanReady(intentId, planHash)`.

**Critical implementation notes:**
- All three agent calls go through `IAgentRequester.createRequest` on Somnia's platform contract.
- Each callback must gate `require(msg.sender == address(platform) && pendingRequests[requestId])`.
- Each callback **must** handle `ResponseStatus.Failed` and `ResponseStatus.TimedOut` — write a `SolveFailed` reason and stop.
- The contract **must** implement `receive() external payable {}` to receive agent rebates.
- Per-step deposit math: `platform.getRequestDeposit() + pricePerAgent * subcommitteeSize`. For default subcommittee size 3: JSON API = `floor + 0.03 × 3 = floor + 0.09 STT`, LLM Inference = `floor + 0.07 × 3 = floor + 0.21 STT`. Three calls total ≈ `floor × 3 + 0.51 STT` per intent. **Verify exact prices on testnet first** — they may have changed.

### `ReceiptLog.sol`

Append-only log of solve steps. Anyone can read it. This is the user-facing audit trail.

```solidity
struct ReceiptEntry {
    uint256 intentId;
    uint256 timestamp;
    string stepName;          // "rates_fetched", "candidates_selected", "plan_built"
    bytes data;               // encoded result of the step
    uint256 agentRequestId;   // pointer into Somnia's request store for the receipt
}

mapping(uint256 => ReceiptEntry[]) public entriesByIntent;

function log(uint256 intentId, string calldata step, bytes calldata data, uint256 requestId) external;
event ReceiptLogged(uint256 indexed intentId, string step, uint256 requestId);
```

Only `SolverEngine` can write to it (use access control). Anyone can read.

### `PlanVault.sol`

Stores the final agent-produced plan, queryable by frontend.

```solidity
struct Allocation {
    string poolId;        // DefiLlama pool ID
    uint256 chainId;
    address vaultToken;   // the target ERC-20 the user ends up holding (Morpho aToken, Aave variableDebt, etc.)
    uint16 bps;           // basis points of total (sum across allocations must = 10000)
}

struct Plan {
    uint256 intentId;
    Allocation[] allocations;
    uint256 builtAt;
    bytes32 reasoningHash; // hash of the final LLM reasoning text
}

mapping(uint256 => Plan) public plans;

function setPlan(uint256 intentId, Allocation[] calldata allocs, bytes32 reasoningHash) external;
function getPlan(uint256 intentId) external view returns (Plan memory);
```

---

## 5. The agent workflow in detail

This is the heart of the project. Spend time here.

### Agent 1 — Rate Fetcher (JSON API Request)

**Goal:** pull a current snapshot of USDC yields across the major lending and yield protocols.

**Endpoint:** `https://yields.llama.fi/pools` (DefiLlama, free, no auth).

**Problem:** that endpoint returns ~10,000+ pools as a giant JSON blob. We can't pass the whole thing through an on-chain agent — too expensive, won't fit in callback.

**Solution:** the JSON API agent's `fetchString` accepts a *selector* — it extracts a specific JSON path from the response before returning. We can either:
- Use the selector to extract a filtered subset (e.g., `data[?(@.symbol=='USDC')]`) — verify exact selector syntax works for this.
- OR pre-filter via a curated list: call `https://yields.llama.fi/poolsOld` (smaller) or hit `/poolsEnriched/<chain>` for specific chains.

**Recommended:** for v1, hardcode a curated list of ~10-15 known stablecoin pool IDs (Aave V3 USDC on Ethereum/Base/Arbitrum, Compound V3 USDC on Base/Mainnet, Morpho USDC vaults on Base, Sky/Spark sUSDS, etc.), then call `https://yields.llama.fi/chart/<poolId>` for each in parallel, *or* use the single `/pools` endpoint with a tight selector. **Test this on Somnia testnet before committing the architecture.**

**Payload encoding (rough):**
```solidity
bytes memory payload = abi.encodeWithSelector(
    IJsonApiAgent.fetchString.selector,
    "https://yields.llama.fi/pools",
    "data[?(@.stablecoin==true && @.tvlUsd>1000000)]"  // adjust selector to taste
);
```

**Cost:** ~0.03 STT × 3 validators = ~0.09 STT plus operations reserve.

### Agent 2 — Pool Filter (LLM Inference, `inferString`)

**Goal:** given the rates payload and the user's intent, return a short list of pool IDs that fit.

**Prompt template:**
```
You are a DeFi yield solver. The user's intent is: "{nl}".
Hard constraints: {constraints joined}.

From the pools below, select the 3 best candidates. Consider APY, TVL,
risk profile (stablecoin pegged? lock-up? recent exploits?), and chain
diversity. Return ONLY the pool IDs, comma-separated, no other text.

Pools:
{rates_payload_truncated}
```

**Use `inferString` with constraints:** the agent supports an `allowedValues` parameter that forces the output to be one of a finite set. We can't use that directly here since the output is a list, but we can prompt-engineer for strict format and validate on parse.

**Cost:** ~0.07 STT × 3 = ~0.21 STT plus reserve.

**Failure mode:** if the LLM returns garbage (non-parseable, no commas, wrong IDs), `SolverEngine` must catch the parse error and mark the intent failed. **Test prompt engineering empirically — week 1 priority.**

### Agent 3 — Plan Builder (LLM Inference, `inferString`)

**Goal:** allocate the user's source amount across the filtered candidates, output as structured JSON.

**Prompt template:**
```
User intent: "{nl}"
Source: {sourceAmount} {sourceAssetSymbol} on chain {sourceChainName}
Candidate pools (with current APY, TVL, chain):
{candidates_with_data}

Build an allocation plan. Output ONLY valid JSON in this exact schema:
{
  "allocations": [
    {"poolId": "<string>", "chainId": <number>, "pct": <0-100>},
    ...
  ],
  "reasoning": "<one paragraph explaining the choices>"
}
Sum of pct must equal 100. No other text. No markdown.
```

**Parse server-side via the callback** — extract JSON, validate, write to `PlanVault`.

**Cost:** same as Agent 2.

### Total cost per solve

Approximate, on testnet:
- 3 × operations reserve (~0.01–0.05 STT each, depends on platform config)
- 1 × JSON API agent = ~0.09 STT reward pot
- 2 × LLM Inference = ~0.42 STT reward pot
- **Total intent: ~0.6–0.8 STT** (`SOMI` on mainnet — currently small dollar value).

User funds the solve via `msg.value` when posting the intent. Unused funds are rebated to the contract automatically.

---

## 6. Off-chain integration

### LI.FI REST API (execution)

When the frontend sees a `PlanReady` event, it reads the plan from `PlanVault`, then for each allocation calls:

```
GET https://li.quest/v1/quote
  ?fromChain={user_source_chain}
  &toChain={allocation.chainId}
  &fromToken={user_source_token}
  &toToken={allocation.vaultToken}   // Morpho/Aave/etc. position token
  &fromAmount={sourceAmount * allocation.bps / 10000}
  &fromAddress={user_wallet}
```

The response includes a `transactionRequest` ready to sign. If the user has multiple allocations, we make multiple quote calls and present them as a sequence; the user signs each in turn.

**Composer is enabled automatically** — if `toToken` is a recognized vault token address (Morpho aToken, Aave aToken, etc.), LI.FI bundles the swap + bridge + deposit into one transaction.

**Status polling** after submission:
```
GET https://li.quest/v1/status?txHash=0x...
```
Poll every 10–30 seconds until `DONE` or `FAILED`. Display in the receipt explorer.

**Rate limits:** 200 requests / 2 hours without key, 200/minute with key. Get a free API key from LI.FI before mainnet. Testnet demo will work without.

**Important:** LI.FI execution chains for v1 should be Ethereum / Arbitrum / Base / Optimism — the deepest yield venues. Somnia itself is a routable destination too (USDC.e via Stargate), but the *yield venues* live on the other chains.

### DefiLlama (data source, called by Agent 1)

- `https://yields.llama.fi/pools` — all pools across all chains. Returns ~10k entries.
- `https://yields.llama.fi/chart/<poolId>` — APY history for a single pool.
- `https://yields.llama.fi/poolsBorrow` — borrowing rates if we extend to borrow-style intents later.

Free, no auth. **Verify rate limits** when testing.

### Token addresses cheat-sheet

| Token | Ethereum | Base | Arbitrum | Optimism | Somnia |
|---|---|---|---|---|---|
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` | `0x28BEc7E30E6faee657a03e19Bf1128AaD7632A00` (USDC.e bridged) |
| USDT | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | — | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` | — | `0x67B302E35Aef5EEE8c32D934F5856869EF428330` |
| WETH | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | `0x4200000000000000000000000000000000000006` | `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` | `0x4200000000000000000000000000000000000006` | `0x936Ab8C674bcb567CD5dEB85D8A216494704E9D8` |

**Don't hardcode.** Fetch via `GET https://li.quest/v1/tokens?chains=1,8453,42161,10,5031` at app boot.

---

## 7. Build sequence

### Week 1 — Plumbing & first agent call (May 27 → June 2)

**Day 1–2: Repo + tooling**
- Initialize repo. Foundry for contracts (Hardhat is fine but Foundry compiles faster). Next.js app in `frontend/`. TypeScript everywhere.
- Add Somnia testnet (chain 50312) to Foundry config. RPC: `https://dream-rpc.somnia.network` (verify current testnet RPC).
- Fund test wallet from Somnia faucet.
- Get agent IDs from https://agents.somnia.network code generator — copy the Solidity stubs for JSON API and LLM Inference. **Capture the actual agent IDs and per-agent prices from the generator output, not from this doc.**

**Day 3–4: Single agent call working end-to-end**
- Deploy a minimal `BtcPriceOracle`-style contract from the docs that fetches one number via JSON API and stores it.
- Confirm: deploy → call request function → see `RequestCreated` event → wait for callback → verify stored value.
- This is the **single biggest go/no-go** for the whole project. If you can't get a basic agent call working in 2 days, scope something simpler.

**Day 5: First LLM call**
- Modify the test contract to use `LLM Inference` `inferString` with a constrained prompt. Get a deterministic string output.
- **Test that two calls with identical inputs produce identical outputs.** That's the consensus property in action.

**Day 6–7: Prompt engineering for the filter agent**
- Mock the JSON API output (since we don't yet have selectors working) by hardcoding a small pool list as a string.
- Test the filter prompt with 5–10 realistic intent variations. Tune until LLM outputs parse reliably.
- This is where the project lives or dies. **If the prompts don't produce parseable output reliably, fall back to numeric outputs (`inferNumber`) with index-based pool selection.**

### Week 2 — Full chain + frontend MVP (June 3 → June 9)

**Day 8–9: Agent chain end-to-end**
- Deploy `IntentRegistry`, `SolverEngine`, `ReceiptLog`, `PlanVault`.
- Wire callbacks: rates → filter → plan. Each callback fires the next `createRequest`.
- Run a full solve on testnet with a sample intent. Verify all three receipts land in `ReceiptLog`.

**Day 10–11: LI.FI integration**
- Wire frontend to LI.FI REST API. Quote, execute, status poll.
- Confirm USDC.e bridged from Arbitrum → Base → Morpho deposit works as a single Composer flow.
- Display status events in UI.

**Day 12–13: Frontend MVP**
- Intent submission form (textarea + structured constraints).
- Plan view (allocations table + reasoning text).
- Receipt explorer (timeline of agent steps).
- Wallet connection (RainbowKit or similar — standard).
- **No fancy design yet** — wait for design direction.

**Day 14: Polish, error states**
- Failed solve handling. Timeouts. Insufficient gas. LI.FI failures. Refund paths.

### Week 3 — Demo, video, writeup (June 10 → June 11)

**Day 15: Run real demos end-to-end**
- One demo intent that completes cleanly (predictable result, looks good on camera).
- One demo intent that shows the agent reasoning being non-obvious (e.g., the LLM picks a less obvious pool because of a constraint).

**Day 16: Demo video + README**
- 3-minute video: intent submission → live agent reasoning → plan → LI.FI execution → receipt.
- README with one-paragraph pitch, architecture diagram, links to deployed contracts, link to live demo.

**Day 17 (buffer / submission day): Submit.**

---

## 8. Demo plan

The demo needs to make one thing legible: **the chain is the solver.**

### Subject

A user with 5,000 USDC on Arbitrum who wants to maximize 30-day yield with a 7-day lockup max and low risk.

### Beats

1. **Set the stage (15s).** "Every intent solver today — UniswapX, Across, 1inch — runs its routing on private off-chain infrastructure. Their pitch is trustless intents; the layer fulfilling them isn't. This is the first solver where the solving runs in validator consensus."

2. **Post the intent (20s).** User types it. Signs. Block confirms in <1s (Somnia speed visible).

3. **Watch the agents reason (60s).** Three lanes on screen:
   - *Agent 1: Rate Fetcher* — line by line, you see "Querying DefiLlama → 47 pools matched constraint → APYs ranging 3.2% to 11.4%".
   - *Agent 2: Filter* — "Considering 47 pools. Excluding 12 with TVL < $1M. Excluding 8 with active lockups > 7 days. Considering risk: excluding 5 with Score B or worse. Top 3 candidates: Morpho-USDC-Base, Aave-V3-USDC-Mainnet, Spark-sUSDS-Mainnet."
   - *Agent 3: Plan Builder* — final allocation appears with reasoning: "Splitting 60% to Morpho-USDC-Base (highest stable APY at 9.1%, low gas), 40% to Aave-V3-USDC-Mainnet (lower APY at 7.4%, but adds chain diversification)."

4. **Execute (30s).** User clicks "Execute". LI.FI quote appears. User signs. Bridge + deposit fires. Status updates from PENDING → DONE.

5. **Show the receipt (15s).** Click any reasoning step. See the full agent input, the LLM prompt, the validator signatures, the receipt hash. "All of this is on-chain. Verifiable. No solver could have lied about what they considered."

6. **Closer (10s).** "This is the first verifiable intent solver. The chain itself is the solver. Built on Somnia, executed via LI.FI."

### What we *don't* claim

- We're **not** claiming our LLM produces better allocations than a quant trader. (Qwen3-30B is decent, not superhuman.)
- We're **not** claiming faster execution than UniswapX. (Async LLM calls add seconds.)
- We **are** claiming the only verifiable solving layer that exists today.

---

## 9. Risks and open questions

### Real risks (with mitigations)

| Risk | Severity | Mitigation |
|---|---|---|
| Agent IDs / pricing differ from this doc | Medium | Always pull from https://agents.somnia.network code generator output, not this doc |
| LLM output not parseable reliably | High | Week 1 priority: prompt engineering empirical testing. Fall back to `inferNumber` index-based selection if `inferString` JSON is unreliable |
| JSON API agent can't handle large DefiLlama response | Medium | Use tight selectors OR hardcode curated pool list OR call per-pool endpoints |
| Total per-intent STT cost too high for demo wallet | Low | Pre-fund demo wallet generously; agents cost cents in real money on testnet |
| LI.FI doesn't route to a vault token we want | Low | Check `getTools` and `getTokens` at start; fall back to plain bridge + manual deposit if Composer doesn't support a target |
| dreamDEX not live by demo time | None | Not in scope for v1. We don't depend on dreamDEX. |
| Multiple parallel intents collide in storage | Low | Each intent has a unique ID; `mapping(uint256 => ...)` per intent state |
| Agent timeouts (no validators respond) | Low | Handle `ResponseStatus.TimedOut` in every callback; auto-mark intent failed; refund |

### Open questions to resolve in week 1

1. **Exact selector syntax for the JSON API agent on DefiLlama pools response.** Test on testnet, document what works.
2. **Maximum payload size for `fetchString` selector output.** If it's e.g. 32KB, that constrains how many pools we can pass to the LLM. Adjust pool count accordingly.
3. **Maximum prompt length for `inferString`.** Determines how much pool data we can include in the filter / plan prompts.
4. **Does `inferString` `allowedValues` support list outputs?** Or only single-token outputs? Affects prompt design.
5. **Is `inferToolsChat` viable for a single-prompt "fetch + reason + plan" agent?** Would simplify to one call. Probably not worth the risk on first build — stick with the three-agent chain.

### What I deliberately punt on

- **No solver auction.** v1 is "the solver" — singular. Multi-solver competition is interesting but adds 2x scope.
- **No order matching / coincidence of wants.** That's CoW's thing.
- **No leverage, no shorting, no perps.** Stables yield only.
- **No agent reputation / staking.** Out of scope.
- **No frontend polish.** Wait for design input.

---

## 10. Repo structure

```
scryer/                           # rename to your chosen name
├── BUILD_PLAN.md                 # this file
├── README.md                     # public-facing pitch + run instructions
├── contracts/
│   ├── src/
│   │   ├── IntentRegistry.sol
│   │   ├── SolverEngine.sol
│   │   ├── ReceiptLog.sol
│   │   ├── PlanVault.sol
│   │   └── interfaces/
│   │       ├── IAgentRequester.sol      # from Somnia docs, paste verbatim
│   │       ├── IJsonApiAgent.sol
│   │       └── ILlmInferenceAgent.sol
│   ├── script/
│   │   ├── Deploy.s.sol
│   │   └── FundAgentBudget.s.sol
│   ├── test/
│   │   └── SolverEngine.t.sol           # fork tests + mocks
│   └── foundry.toml
├── frontend/                     # Next.js (App Router)
│   ├── app/
│   │   ├── page.tsx                     # intent submission
│   │   ├── intent/[id]/page.tsx         # plan view + execute
│   │   └── api/
│   │       └── quote/route.ts           # proxy to LI.FI (rate limit, key)
│   ├── lib/
│   │   ├── contracts.ts                 # wagmi/viem contract bindings
│   │   ├── lifi.ts                      # LI.FI REST client
│   │   └── somnia.ts                    # chain config
│   └── package.json
├── .env.example
└── package.json                  # root, with workspaces
```

---

## 11. References — keep these open while coding

### Somnia
- Agents overview: https://docs.somnia.network/agents
- Invoking from Solidity: https://docs.somnia.network/agents/invoking-agents/from-solidity
- JSON API agent: https://docs.somnia.network/agents/base-agents/json-api-request
- LLM Inference agent: https://docs.somnia.network/agents/base-agents/llm-inference
- Code generator: https://agents.somnia.network
- Testnet platform contract: `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` (chain 50312)
- Mainnet platform contract: `0x5E5205CF39E766118C01636bED000A54D93163E6` (chain 5031)
- Testnet RPC: `https://dream-rpc.somnia.network` (verify current)
- Faucet: ask in Somnia Discord

### LI.FI
- Intro: https://docs.li.fi/introduction/introduction
- Agent integration guide: https://docs.li.fi/agents/overview
- REST API reference: https://docs.li.fi/api-reference/introduction
- Composer (vault deposits): https://docs.li.fi/composer/overview
- Supported protocols list: https://docs.li.fi/composer/reference/supported-protocols
- LI.FI on Somnia (Somnia-specific SDK guide): https://docs.somnia.network/developer/building-dapps/cross-chain-swaps-and-bridging/integrating-the-li.fi-sdk

### Data sources
- DefiLlama yields API: https://yields.llama.fi/pools (also `/poolsBorrow`, `/chart/{poolId}`)
- DefiLlama yield docs: https://defillama.com/docs/api

### Standards (for reference, not required to implement)
- ERC-7683 (cross-chain intents standard)
- EIP-712 (typed data signing for intents)

---

## 12. Definition of done for v1

- [ ] Deployed contracts on Somnia testnet with verified source
- [ ] Demo wallet with sufficient STT to run >10 full solves
- [ ] At least 2 working demo intents, end-to-end (intent → plan → execute → status)
- [ ] Frontend that shows intent submission, plan view with reasoning, receipt explorer
- [ ] One full demo run recorded as video, ≤3 minutes
- [ ] README with pitch, architecture, deployed addresses, demo link
- [ ] Public GitHub repo

**Stretch (only if time allows):**
- [ ] Multi-asset intents (not just USDC)
- [ ] Constraint richness (more than ~5 constraint tags)
- [ ] Conditional intents ("if X happens, do Y") — adds reactivity scope
- [ ] Leaderboard of solved intents

---

## 13. Things to verify in the first hour of building

Before writing any application code:

1. **Pull the latest Solidity stubs from https://agents.somnia.network** for JSON API Request and LLM Inference. Compare agent IDs and per-validator prices against what's in this doc. **The generator is the source of truth.**
2. **Test the `?ask=` mechanism** on the Somnia docs for any specific question: `https://docs.somnia.network/agents/<page>.md?ask=<question>`.
3. **Confirm LI.FI `GET /v1/tokens?chains=5031`** returns the Somnia token list. If yes, integration is ready.
4. **Run one `BtcPriceOracle` example** from the docs verbatim to confirm your local environment works against Somnia testnet.

If any of those four fail, stop and resolve before continuing.
