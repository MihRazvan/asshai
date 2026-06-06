# Build Plan - On-Chain Intent Compiler on Somnia

> **Working name:** `Scryer` (placeholder - swap in your chosen ASOIAF name throughout the codebase; all references to "Scryer" below are project-name placeholders).

> **Hackathon:** Somnia Agentathon - submission due **June 11, 2026**.
> **Scope of v1:** Cross-chain stablecoin yield optimization. Goals in, consensus-verified execution plans out, LI.FI API/Composer fulfillment.

---

## 1. The pitch in one paragraph

Intent-based DeFi has become a $50B+ category. ERC-7683 standardizes how intents are structured. The Open Intents Framework (Ethereum Foundation + Hyperlane, Feb 2025) defines the reference implementation. LI.FI Intents and others have shipped competitive solver marketplaces processing tens of billions in flow. But every part of this stack assumes someone has already turned the user's goal into a structured intent - specific token, specific chain, specific destination. Real users don't think that way. They think "find me the safest 8%+ yield" or "rebalance into stables if ETH drops." Translating fuzzy goals into validated execution plans is the missing layer the whole industry is openly looking for, and it requires reasoning about messy real-world data that no centralized AI can trustlessly do. This project is the first on-chain Intent Compiler: type a goal, watch Somnia validators reason about it under consensus, get a fully-formed, auditable plan that can be executed through LI.FI's routing stack. Every reasoning step is on-chain, consensus-verified, and audit-traced. This cannot exist on any chain without on-chain LLM consensus - Somnia is the only one.

**Moat:** Consensus-verified goal-to-intent translation. Every other intent compiler today would be an off-chain backend - a single AI operator whose reasoning you trust. Ours is a chained agent workflow running inside validator consensus, with every step receipt-signed. The Open Intents Framework explicitly leaves this layer unsolved because it can't be solved at the standard layer; it requires real reasoning over real-world data, which only Somnia provides as a consensus primitive.

---

## 2. What we're actually building (high level)

Three pieces, clean separation:

1. **On-chain compilation (Somnia).** A set of Solidity contracts that receive natural-language goals, orchestrate chained agent calls (JSON API -> LLM Inference -> LLM Inference), validate the result, and encode a deterministic execution plan using trusted registry data. Today this is stored as a StandardOrder-shaped artifact because it gives us a strict, auditable schema; the frontend can also translate it into a LI.FI Composer quote.

2. **Execution (LI.FI API/Composer, with LI.FI Intents compatibility).** The frontend reads the compiled plan and requests an executable `li.quest/v1/quote`. LI.FI Composer can bridge USDC and perform the destination yield action in one route, which we verified live for Arbitrum USDC -> Base aUSDC. Raw LI.FI Intents escrow remains compatible for simple transfer-style outputs, but custom callback outputs were not reliably filled by public solvers in testing, so Composer is the v1 execution backend.

3. **Frontend (Next.js).** Goal submission, live compilation visualization, structured plan preview, origin-chain approval, LI.FI Composer transaction execution/status polling, and receipt explorer. Design and UX/UI direction will come separately - do not over-design upfront. Build minimally functional first.

The user's funds do **not** need to be on Somnia. Somnia is the compiler chain. The user's funds stay on their origin chain (Ethereum, Arbitrum, Base, Optimism, etc.) where LI.FI routing supports the requested source asset.

---

## 3. Architecture

### High-level flow

```
User                Frontend            Somnia Contracts              LI.FI API/Composer
 │                     │                       │                            │
 │  "max USDC yield"   │                       │                            │
 ├────────────────────►│                       │                            │
 │   sign tx to        │   postGoal()          │                            │
 │   Somnia (small     ├──────────────────────►│                            │
 │   STT fee)          │                       │                            │
 ├────────────────────►├──────────────────────►│ GoalPosted event           │
 │                     │                       │                            │
 │                     │                       │ ─── Agent 1: JSON API ────►│ (DefiLlama)
 │                     │                       │ ◄── pools data callback ───┤
 │                     │                       │ ─── Agent 2: LLM filter ──►│
 │                     │                       │ ◄── candidates callback ───┤
 │                     │                       │ ─── Agent 3: LLM plan ────►│
 │                     │                       │ ◄── allocation plan ───────┤
 │                     │                       │                            │
 │                     │                       │ ─── StandardOrderEncoder ──│
 │                     │                       │ ─── (Solidity only) ───────│
 │                     │                       │                            │
 │                     │   IntentReady event   │ IntentReady event          │
 │                     │◄──────────────────────┤                            │
 │   review intent     │                       │                            │
 │◄────────────────────┤                       │                            │
 │   approve + execute │                       │                            │
 │   on origin chain   │                       │                            │
 ├────────────────────►├──────── GET /v1/quote ────────────────────────────►│
 │                     │◄──── executable route tx ──────────────────────────┤
 │                     │                       │                            │
 │                     │   poll /v1/status                                  │
 │                     ├───────────────────────────────────────────────────►│
 │                     │◄──── PENDING → DONE / COMPLETED ───────────────────┤
```

### Why Somnia is the compiler, not the origin chain

Verification of LI.FI Intents shows that a `StandardOrder` has an `originChainId`, and the user's funds must originate on a chain where LI.FI input settler contracts and oracle systems are deployed. Verification of LI.FI Composer shows a more reliable v1 path: `li.quest/v1/quote` can route Arbitrum USDC into Base aUSDC using bridge + Composer steps. That is fine: Somnia's role is to host trustless reasoning and compilation. The user approves and executes on the chain where their funds already live.

The user's wallet connects to two networks: Somnia to post the goal and pay the compilation fee, and the origin chain to sign the resulting StandardOrder. RainbowKit/wagmi handles this multi-chain wallet UX natively.

### Why the agent chain runs on-chain

The reasoning must be on-chain (not in a Node.js backend that calls Somnia agents), because:

1. The chain itself is the orchestrator - `callback -> createRequest -> callback -> createRequest` is the canonical agent-chaining pattern in the Somnia docs.
2. Every intermediate result is consensus-verified and gets a receipt.
3. The final StandardOrder is derived from on-chain state and trusted registry data anyone can audit. No "trust our backend's interpretation."

If orchestration moved off-chain, the product would become a centralized AI intent bot. The on-chain compilation path is the moat.

### Two-layer reasoning and encoding

LLMs are unreliable at producing hexadecimal addresses, exact ABI-encoded byte strings, or token-level details with no semantic redundancy. Qwen3-30B at deterministic settings can still hallucinate an invalid address if asked to produce a StandardOrder directly. LI.FI Intents validation requirements - known input settlers, known oracles, valid token addresses, `fillDeadline` before `expires`, and compatible settlement systems - are exactly the kind of constraints that direct LLM generation breaks on.

The fix is structural: split the job into reasoning and encoding.

#### Layer 1 - Reasoning (LLM, on Somnia agents)

The LLM outputs a constrained, easily validated JSON plan:

```json
{
  "allocations": [
    {"poolId": "aave-v3-usdc-base", "chainName": "Base", "pct": 60},
    {"poolId": "morpho-spark-usdc-mainnet", "chainName": "Ethereum", "pct": 40}
  ],
  "reasoning": "Selected Aave-Base for low gas and 9.1% APY..."
}
```

The LLM never sees, generates, or touches an address. It deals in pool IDs and percentages. Parse failures are detectable.

#### Layer 2 - Encoding (Solidity, on Somnia)

`StandardOrderEncoder` takes the parsed plan and constructs the full StandardOrder using:

- An on-chain `AddressRegistry` of trusted addresses: LI.FI input settlers, output settlers, oracle pairs, vault token addresses, and token addresses.
- The user's address, nonce, and current block timestamp for `fillDeadline` and `expires`.
- The plan's percentages translated into exact wei amounts.

No LLM output ever reaches the StandardOrder bytes. The LLM only chooses which pre-validated registry configuration to combine. If the registry has correct addresses, the order is structurally valid by construction. The registry can be updated by the team as new venues come online or addresses change. For v1, hardcode 6-10 known-good pool configurations across 3-4 chains.

---

## 4. Smart contract design

Six contracts on Somnia testnet first, mainnet later: `GoalRegistry`, `CompilerEngine`, `AddressRegistry`, `StandardOrderEncoder`, `IntentStore`, and `ReceiptLog`.

### `GoalRegistry.sol`

The entry point. Users post natural-language goals here. It stores goals, emits events, and kicks off the agent chain.

**Goal struct:**

```solidity
enum GoalStatus { Pending, Compiling, IntentReady, Submitted, Settled, Failed, Expired }

struct Goal {
    address author;
    string naturalLanguage;
    address sourceAsset;
    uint256 sourceAmount;
    uint256 sourceChainId;        // origin chain where the user holds funds, NOT Somnia
    string[] constraints;
    uint256 deadline;
    GoalStatus status;
    uint256 createdAt;
}

mapping(uint256 => Goal) public goals;
uint256 public nextGoalId;
```

**Key functions:**

- `postGoal(string nl, address asset, uint256 amount, uint256 chainId, string[] constraints, uint256 deadline) external payable returns (uint256 goalId)` - payable to fund compilation. Emits `GoalPosted`.
- `getGoal(uint256 goalId) external view returns (Goal memory)`.
- `markIntentReady(uint256 goalId, bytes32 intentHash)` - called by `CompilerEngine` when the StandardOrder is built.
- `markSubmitted(uint256 goalId, string calldata executionId)` - optional bookkeeping hook called by the frontend after LI.FI route execution starts. For Composer, `executionId` can be the LI.FI source transaction hash.

### `CompilerEngine.sol`

Orchestrates the chained agent workflow. Same state-machine pattern as before, with one extra synchronous step at the end for encoding.

```solidity
enum CompileStep { Idle, FetchingRates, FilteringPools, BuildingPlan, EncodingOrder, Done, Failed }

struct CompileState {
    uint256 goalId;
    CompileStep step;
    uint256 currentAgentRequestId;
    bytes ratesPayload;
    string[] candidatePoolIds;
    bytes allocationPlan;     // parsed JSON plan from LLM
}

mapping(uint256 => CompileState) public compileStates;
```

**Flow:**

1. `startCompile(goalId)` -> call JSON API agent (DefiLlama). Set state to `FetchingRates`.
2. `handleRatesResponse(...)` callback -> call LLM Inference (filter). Set state to `FilteringPools`.
3. `handleFilterResponse(...)` callback -> call LLM Inference (plan). Set state to `BuildingPlan`.
4. `handlePlanResponse(...)` callback -> parse JSON plan into structured allocations. Call `StandardOrderEncoder.encode(...)` (synchronous Solidity, no agent). Set state to `EncodingOrder` momentarily, then `Done`.
5. On `Done`: call `IntentStore.store(goalId, encodedOrder)`, then `GoalRegistry.markIntentReady(goalId, hash)`. Emit `IntentReady(goalId, intentHash)`.

**Critical implementation notes:**

- All three agent calls go through `IAgentRequester.createRequest` on Somnia's platform contract.
- Every callback must gate `require(msg.sender == address(platform) && pendingRequests[requestId])`.
- Every callback must handle `ResponseStatus.Failed` and `ResponseStatus.TimedOut`, write a failure reason, refund where applicable, and mark the goal failed.
- The contract must implement `receive() external payable {}` to receive agent rebates.
- Per-step deposit math: `platform.getRequestDeposit() + pricePerAgent * subcommitteeSize`. JSON API is approximately `0.03 STT * 3 = 0.09 STT + reserve`. LLM Inference is approximately `0.07 STT * 3 = 0.21 STT + reserve`. Verify prices empirically on testnet first.

### `AddressRegistry.sol`

Hardcoded registry of trusted addresses indexed by `(chainId, poolId)` and `(chainId, tokenSymbol)`. Owner-only writes. Anyone can read.

```solidity
struct VenueConfig {
    address vaultToken;       // position token user ends up holding, e.g. aUSDC
    address outputSettler;    // LI.FI output settler on that chain
    address oracle;           // LI.FI oracle on that chain
    uint256 chainId;
    bool active;
}

mapping(bytes32 => VenueConfig) public venues; // key = keccak256(chainName + poolId)
mapping(bytes32 => address) public tokens;     // key = keccak256(chainName + symbol)
mapping(uint256 => address) public inputSettlers; // chainId => settler address

function getVenue(string calldata chainName, string calldata poolId) external view returns (VenueConfig memory);
function getToken(string calldata chainName, string calldata symbol) external view returns (address);
function getInputSettler(uint256 chainId) external view returns (address);
```

Populate at deploy time with the 6-10 venues we support in v1:

- `("ethereum", "aave-v3-usdc-mainnet")` -> aUSDC mainnet.
- `("base", "aave-v3-usdc-base")` -> aUSDC Base.
- `("base", "compound-v3-usdc-base")` -> Compound V3 Base cUSDCv3 via LI.FI contract-call Composer.
- `("base", "morpho-spark-usdc")` -> Morpho vault token.
- `("ethereum", "morpho-spark-usdc-mainnet")` -> Morpho vault token mainnet.
- `("ethereum", "spark-susds")` -> sUSDS token.
- `("arbitrum", "aave-v3-usdc-arb")` -> aUSDC Arbitrum.
- A few more known-good stablecoin yield venues after verification.

Critical: the actual LI.FI input settler addresses, output settler addresses, and oracle addresses are deployed contracts on each origin/destination chain. Look these up via `GET https://order.li.fi/chains/supported` and the LI.FI docs at deploy time. They are public but specific.

### `StandardOrderEncoder.sol`

Pure Solidity. Takes a parsed allocation plan plus goal context and registry lookups, then produces an ABI-encoded StandardOrder struct.

```solidity
struct Allocation {
    string chainName;
    string poolId;
    uint16 bps;
}

function encode(
    address user,
    uint256 sourceChainId,
    address sourceAsset,
    uint256 sourceAmount,
    Allocation[] calldata allocs
) external view returns (bytes memory standardOrderEncoded);
```

**Internal logic:**

1. Fetch input settler for `sourceChainId` from `AddressRegistry`.
2. For each allocation, fetch venue config (`vaultToken`, `outputSettler`, `oracle`) and compute amount from bps.
3. Construct `StandardOrder` in memory.
4. Return `abi.encode(order)`.

This contract is the load-bearing safety mechanism. It is the only place addresses are bound to the user's goal. Audit it carefully.

### `IntentStore.sol`

Stores the encoded StandardOrder keyed by `goalId`. Queryable by frontend.

```solidity
mapping(uint256 => bytes) public encodedIntents;
mapping(uint256 => bytes32) public intentHashes;

function store(uint256 goalId, bytes calldata encoded) external; // only CompilerEngine
function getIntent(uint256 goalId) external view returns (bytes memory);
function getIntentHash(uint256 goalId) external view returns (bytes32);
```

### `ReceiptLog.sol`

Append-only log of compilation steps. Anyone can read it. Only `CompilerEngine` can write.

```solidity
struct ReceiptEntry {
    uint256 goalId;
    uint256 timestamp;
    string stepName;          // "rates_fetched", "candidates_selected", "order_encoded"
    bytes data;               // encoded result of the step
    uint256 agentRequestId;   // pointer into Somnia's request store for the receipt
}

mapping(uint256 => ReceiptEntry[]) public entriesByGoal;

function log(uint256 goalId, string calldata step, bytes calldata data, uint256 requestId) external;
event ReceiptLogged(uint256 indexed goalId, string step, uint256 requestId);
```

---

## 5. The agent workflow in detail

This is the heart of the project. Spend time here.

### Agent 1 - Rate Fetcher (JSON API Request, ~0.03 STT * 3)

**Endpoint:** `https://yields.llama.fi/pools` (DefiLlama, free, no auth, public).

Recommended strategy for v1: hardcode a curated set of pool IDs we explicitly support, matching `AddressRegistry`. Call the endpoint with a selector that extracts only those rows. Example selector logic:

```
data[?(@.pool=='aa70268e-...' || @.pool=='...')]
```

The exact JSON-path syntax must be verified against the Somnia JSON API agent's selector implementation on testnet. Validate selector syntax in week 1. If it does not support `||` filters, call per-pool endpoints:

```
https://yields.llama.fi/chart/<poolId>
```

**Output:** a compact JSON blob with pool IDs, APYs, TVLs, chain names, lockup information, and reward token info.

### Agent 2 - Pool Filter (LLM Inference `inferString`, ~0.07 STT * 3)

**Prompt template:**

```text
You are a DeFi yield router. Given the user's goal and constraints, select
the top 3 pools from the candidates that best fit the goal. Return ONLY pool
IDs, comma-separated, no other text.

Goal: "{naturalLanguage}"
Constraints: {constraints joined with comma}

Candidates:
{compact pool data: id, apy, tvlUsd, chain, lockup}

Selection:
```

**Validation:** the callback parses the response, splits by comma, and validates each pool ID exists in the candidate set. If any fail, set the goal to `Failed` and refund where applicable.

### Agent 3 - Plan Builder (LLM Inference `inferString`, ~0.07 STT * 3)

**Prompt template:**

```text
Build an allocation plan. Output ONLY a JSON object in this exact schema:
{"allocations":[{"chainName":"<name>","poolId":"<id>","pct":<0-100>}],"reasoning":"<short>"}
Percentages must sum to exactly 100. No markdown. No text before or after the JSON.

Goal: "{naturalLanguage}"
Source: {sourceAmount} {sourceSymbol} on {sourceChainName}
Pools to allocate across (you must use all):
{filtered_pools_with_apy_and_chain}
```

**Validation:** the callback parses JSON, validates schema, checks percentages sum to 100, and validates each `(chainName, poolId)` exists in `AddressRegistry`. If any fail, set the goal to `Failed`.

### Encoding (synchronous, no agent)

After the plan callback validates the parsed plan, `CompilerEngine` calls `StandardOrderEncoder.encode(...)` directly. The result is `abi.encode`d bytes stored in `IntentStore`. `IntentReady` is emitted.

### Total cost per goal

- 1 * JSON API = approximately `0.09 STT`.
- 2 * LLM Inference = approximately `0.42 STT`.
- 3 * operations reserve (varies, currently around `0.03 STT` each).
- Total = approximately `0.6-0.8 STT` per goal compilation on testnet.

The user funds compilation with `msg.value` on `postGoal`. Unused funds are rebated.

---

## 6. LI.FI execution integration

### What we use from LI.FI

The v1 execution backend is LI.FI's standard API plus Composer, accessed through `https://li.quest/v1`. This path is better suited to the demo/product goal than raw LI.FI Intents callbacks because it can return one executable route that bridges the user's USDC and performs the destination yield action.

Endpoints we hit:

- `GET https://li.quest/v1/chains` - confirm origin and destination chains are supported.
- `GET https://li.quest/v1/tokens?chains=...` - confirm supported source and destination tokens.
- `GET https://li.quest/v1/quote` - request an executable route. For the verified Aave route, `fromChain=42161`, `toChain=8453`, `fromToken=Arbitrum USDC`, `toToken=Base aUSDC`, `fromAmount=<user amount>`, `fromAddress=<user>`.
- `POST https://li.quest/v1/quote/contractCall` - request a Composer route with a destination contract call. For Compound Base, route USDC to Base and call `Comet.supply(Base USDC, amount)`; this is the real Compound deposit path. A plain quote directly to `cUSDCv3` is not sufficient because it can route through token liquidity instead of depositing into Compound.
- `GET https://li.quest/v1/status?txHash=...&fromChain=...&toChain=...` - poll route execution status.
- `GET https://order.li.fi/chains/supported`, `GET https://order.li.fi/routes`, and `POST https://order.li.fi/quote/request` - keep as research/compatibility endpoints for ERC-7683 / raw LI.FI Intents paths, but not the v1 execution path.

### Verified execution path

Live test on June 5, 2026:

- Input: `0.1 USDC` on Arbitrum.
- Compiled plan: `aave-v3-usdc-base`, 100% allocation.
- LI.FI quote steps: `feeCollection -> stargateV2 -> composer`.
- Source transaction: Arbitrum LI.FI route call.
- Destination transaction: Base Composer execution.
- Result: `0.099702 aBasUSDC` received by the user.

Follow-up live test:

- Input: `1 USDC` on Arbitrum.
- LI.FI quote steps: `feeCollection -> across -> composer`.
- Result: `DONE / COMPLETED`, `0.98836 aBasUSDC` received by the user.

This proves the user-facing v1 product path: natural-language goal -> Somnia consensus compilation -> LI.FI Composer route -> Base Aave yield position.

Additional verified quote-only venue:

- Venue: `compound-v3-usdc-base`.
- Compound Comet/cUSDCv3 proxy: `0xb125E6687d4313864e53df431d5425969c15Eb2F`.
- Source: Compound Comet `deployments/base/usdc/roots.json` plus on-chain `symbol()`, `decimals()`, and `baseToken()` checks.
- LI.FI path: `POST /v1/quote/contractCall`, typically `feeCollection -> stargateV2/across -> custom`.
- Current safety setting: registry `outputBps = 9800`, so a `0.1 USDC` compiled source asks LI.FI to supply `0.098 USDC` on Base, keeping the exact-output contract-call quote inside the user's source amount.
- Production note: the updated `/api/yields` endpoint must be redeployed before Somnia's JSON API agent can select Compound live.

### Submission flow

After `IntentReady` fires on Somnia:

1. Frontend reads the encoded plan from `IntentStore`.
2. Frontend decodes it to the typed structure for display in the UI.
3. If the compiled plan contains callback-style yield metadata, frontend decodes the callback payload to recover the intended final position token, e.g. Base `aUSDC`.
4. For Aave-style vault token outputs, frontend calls `GET /v1/quote` through `/api/lifi/quote`.
5. For Compound Base, frontend calls `POST /v1/quote/contractCall` through `/api/lifi/contract-call-quote`, with destination calldata for `Comet.supply(Base USDC, amount)`.
6. User approves the LI.FI transaction target for the exact source amount.
7. User executes the returned `transactionRequest` on the origin chain.
8. Frontend polls `/v1/status` through `/api/lifi/status`.
9. Successful status is `DONE / COMPLETED`; destination output should be the target yield position token.

### Compiled plan artifact

```ts
type StandardOrder = {
  user: `0x${string}`;
  nonce: bigint;
  originChainId: bigint;
  expires: number;        // unix timestamp; refund deadline
  fillDeadline: number;   // unix timestamp; solver fill deadline, must be < expires
  inputOracle: `0x${string}`;
  inputs: [bigint, bigint][];  // [[tokenIdentifier, amount], ...]
  outputs: MandateOutput[];
};

type MandateOutput = {
  oracle: `0x${string}`;    // bytes32, EVM address left-padded
  settler: `0x${string}`;   // bytes32, EVM address left-padded
  chainId: bigint;
  token: `0x${string}`;     // bytes32, EVM address left-padded
  amount: bigint;
  recipient: `0x${string}`; // bytes32, EVM address left-padded
  call: `0x${string}`;
  context: `0x${string}`;
};
```

The contract artifact is still StandardOrder-shaped because it is a strict, bytes-level schema that Solidity can construct and the frontend can decode. For the Composer path, the frontend uses the artifact as an auditable plan: source chain/token/amount from `inputs`, destination chain from `outputs`, and final yield token from callback payload when present. Raw `InputSettlerEscrow.open` is not the v1 path.

### LI.FI route status lifecycle

Typical status flow:

- `PENDING / WAIT_DESTINATION_TRANSACTION`
- `DONE / COMPLETED`
- `FAILED` or `REFUNDED` for unsuccessful routes

For UI purposes, show the LI.FI `status`, `substatus`, destination transaction hash, and received token/amount.

### Important constraints

- Use only destination tokens that `GET /v1/quote` can route into. For the demo, Base `aUSDC` is verified.
- The compiled plan must remain constrained to supported venues until we have a broader coverage matrix.
- Prefer single-allocation goals for v1. Multi-allocation execution requires multiple LI.FI routes or a more complex destination batching story.
- The quote target is dynamic. Frontend must approve the `transactionRequest.to` address returned by LI.FI, not a hardcoded escrow address.
- LI.FI status polling can briefly return parser noise around bridge-specific metadata; also verify destination token balances when debugging.
- LI.FI Earn/vault discovery may require `x-lifi-api-key`, but the executable `/v1/quote` path worked without an API key in testing.

### Raw LI.FI Intents findings

Raw `InputSettlerEscrow.open` was tested. A simple Arbitrum USDC -> Base USDC order reached `Settled`, proving basic raw LI.FI Intents escrow fulfillment works. Custom callback orders to `AsshaiYieldReceiver` reached `Signed` but did not get filled by public solvers, even with a reserved quote context. Conclusion: raw LI.FI Intents callbacks may be viable with solver coordination, but they are not reliable enough for the v1 public demo path.

Stuck raw Intents orders can be refunded after `expires` by calling `InputSettlerEscrow.refund(order)`. A local helper exists at `frontend/scripts/refund-order.mjs`.

### DefiLlama (data source, called by Agent 1)

- `https://yields.llama.fi/pools` - all pools across all chains. Returns ~10k entries.
- `https://yields.llama.fi/chart/<poolId>` - APY history for a single pool.
- `https://yields.llama.fi/poolsBorrow` - borrowing rates if we extend to borrow-style goals later.

Free, no auth. Verify rate limits when testing.

---

## 7. Build sequence

### Week 1 - Plumbing & first agent call (May 27 -> June 2)

**Day 1-2: Repo + tooling**

- Initialize repo. Foundry for contracts. Next.js app in `frontend/`. TypeScript everywhere.
- Add Somnia testnet (chain 50312) to Foundry config. RPC was `https://dream-rpc.somnia.network`; verify current testnet RPC from Somnia docs before deploying.
- Fund test wallet from Somnia faucet.
- Get agent IDs from https://agents.somnia.network code generator. Copy the Solidity stubs for JSON API and LLM Inference. Capture actual agent IDs and per-agent prices from the generator output, not this doc.

**Day 3-4: Single agent call working end-to-end**

- Deploy a minimal `BtcPriceOracle`-style contract from the docs that fetches one number via JSON API and stores it.
- Confirm: deploy -> call request function -> see `RequestCreated` event -> wait for callback -> verify stored value.
- This is the single biggest go/no-go for the whole project. If a basic agent call does not work in 2 days, scope something simpler.

**Day 5: First LLM call**

- Modify the test contract to use `LLM Inference` `inferString` with a constrained prompt. Get a deterministic string output.
- Test that two calls with identical inputs produce identical outputs. That's the consensus property in action.

**Day 6-7: Prompt engineering, selectors, and LI.FI execution discovery**

- Verify JSON API agent selector syntax against DefiLlama's `/pools` endpoint. Test a tight filter for a single pool by ID. If `||`-style multi-filter selectors do not work, fall back to per-pool `/chart/<id>` calls.
- Mock the JSON API output by hardcoding a small pool list as a string. Test the filter prompt with 5-10 realistic goal variations.
- Verify `GET https://li.quest/v1/chains`, `GET https://li.quest/v1/tokens`, and executable `GET https://li.quest/v1/quote` routes for each supported source/destination pair.
- Decide on the 6-10 venues we will support in v1 and populate `AddressRegistry` seed data in the deploy script.
- If prompts do not produce parseable output reliably, fall back to numeric outputs (`inferNumber`) with index-based pool selection.

### Week 2 - Full chain + encoder + frontend MVP (June 3 -> June 9)

**Day 8-9: Agent chain end-to-end**

- Deploy `GoalRegistry`, `CompilerEngine`, `ReceiptLog`, `IntentStore`, `AddressRegistry`, and `StandardOrderEncoder`.
- Wire callbacks: rates -> filter -> plan -> encode. Each callback either validates or fails loudly.
- Run a full compilation on testnet with a sample goal. Verify all three receipts land in `ReceiptLog`.

**Day 10-11: LI.FI Composer integration**

- Wire frontend to `GET https://li.quest/v1/quote` through `/api/lifi/quote`.
- Approve the dynamic `transactionRequest.to` target for the exact input amount.
- Execute the returned `transactionRequest` on the user's origin chain.
- Poll `GET https://li.quest/v1/status?txHash=...`.
- Display status events in UI.
- Keep raw LI.FI Intents escrow behind the scenes as a research path only; do not make callback escrow the demo-critical path.

**Day 12-13: Frontend MVP**

- Goal submission form (textarea + structured constraints).
- Compiled intent view (decoded StandardOrder + reasoning text).
- Receipt explorer (timeline of agent steps).
- Wallet connection (RainbowKit or similar - standard).
- No fancy design yet - wait for design direction.

**Day 14: Polish, error states**

- Failed compilation handling.
- Agent timeouts.
- Insufficient gas / STT.
- LI.FI quote rejection, execution failure, and refund states.
- Refund paths.

### Week 3 - Demo, video, writeup (June 10 -> June 11)

**Day 15: Run real demos end-to-end**

- One demo goal that compiles cleanly into a predictable Composer-executable plan.
- One demo goal that shows non-obvious reasoning, such as preferring lower APY because of risk or lockup constraints.

**Day 16: Demo video + README**

- 3-minute video: goal submission -> live agent reasoning -> compiled plan -> LI.FI Composer quote/execution -> status -> receipt.
- README with one-paragraph pitch, architecture diagram, deployed contracts, and demo link.

**Day 17 (buffer / submission day): Submit.**

---

## 8. Demo plan

### Subject

A user with USDC on Arbitrum types: "Find me the safest 8%+ yield for my stables, max 7-day lockup, prefer Base or Ethereum."

### Beat sheet (3 minutes)

1. **The problem (0:00-0:25).** "Every intent system today - Across, UniswapX, 1inch, LI.FI Intents - assumes you've already turned your goal into a structured order. Real users don't think in token pairs and chain IDs. The translation layer is what's missing. The Ethereum Foundation, LI.FI, and multiple research papers have all named it."
2. **The pitch (0:25-0:45).** "This is the first on-chain Intent Compiler. Type a goal, Somnia validators reason about it under consensus, you get a fully-formed execution plan ready for LI.FI's routing stack. Built on Somnia because the reasoning has to be trustless - and only Somnia has consensus-verified LLM inference."
3. **Live compilation (0:45-2:00).** User types the goal. Somnia tx confirms in <1 second. Watch Agent 1 fetch pool data from DefiLlama, Agent 2 filter candidates, Agent 3 build the allocation plan, and `StandardOrderEncoder` deterministically build the bytes-level plan from registry data. The structured plan appears on screen with chain IDs, token addresses, exact amounts, and the decoded destination yield position.
4. **Execute through LI.FI Composer (2:00-2:35).** User clicks execute. Frontend requests a LI.FI Composer quote. User approves and signs one origin-chain route transaction on Arbitrum. Status polls live: `PENDING -> DONE / COMPLETED`. Real bridge, real Composer deposit, real Base aUSDC received.
5. **The receipt (2:35-2:55).** Click into any reasoning step. See the full agent call on-chain - the URL queried, the LLM prompt, the validator signatures, the receipt hash. "All compilation logic is on-chain. No compiler operator, no centralized AI in the translation path. Every decision auditable forever."
6. **Closer (2:55-3:00).** "Verifiable goal-to-intent translation. The missing layer in intent-based DeFi. Only possible on Somnia."

### What we explicitly don't claim

- We are not a faster solver. We do not solve at all.
- We are not the best yield optimizer. Qwen3-30B is not a quant.
- We are the first system where translation from goal to intent is trustless. That is the entire value proposition.

---

## 9. Risks and open questions

### Real risks (with mitigations)

| Risk | Severity | Mitigation |
|---|---|---|
| LLM produces invalid pool IDs / JSON | High | Two-layer pattern: LLM outputs constrained schema only; Solidity encoder uses registry addresses. Validate every parse. |
| JSON API selector syntax limited | Medium | Test in week 1. Fall back to per-pool `/chart/<id>` calls if needed. |
| LI.FI route coverage changes | Medium | Query `li.quest/v1/quote` at runtime and keep a tested route matrix. Do not show unsupported venues in the demo UI. |
| Raw LI.FI Intents callback orders not filled | Medium | Use LI.FI Composer as v1 execution. Keep raw Intents callbacks as future/partner-solver research only. |
| User wallet is not on origin chain | Low | RainbowKit handles chain switching natively. Prompt user to switch. |
| Agent IDs / pricing differ from this doc | Medium | Always pull from https://agents.somnia.network code generator; treat this doc as guidance, not source of truth. |
| Total per-goal STT cost too high | Low | Pre-fund demo wallet. Real cost is cents. |
| Somnia not an execution origin chain | None | By design - funds stay on user's origin chain. Somnia is the compiler. |
| Agent timeouts | Low | Handle `ResponseStatus.TimedOut` in every callback; auto-mark goal failed and refund where applicable. |

### Open questions to resolve in week 1

1. Exact JSON API agent selector syntax. Test on Somnia testnet.
2. Maximum payload size for `fetchString` selector output.
3. Maximum prompt length for `inferString`.
4. Confirm LI.FI `li.quest/v1/quote` returns executable routes for each venue in `AddressRegistry`.
5. Get current Somnia testnet RPC URL. It was `https://dream-rpc.somnia.network`; verify still active and compare with current Somnia docs.

### What I deliberately punt on

- No custom solver marketplace. LI.FI, LI.FI Intents, and other ERC-7683 marketplaces already exist.
- No order matching / coincidence of wants. That's not our layer.
- No leverage, no shorting, no perps. Stables yield only.
- No agent reputation / staking. Out of scope.
- No frontend polish. Wait for design input.

---

## 10. Product coverage matrix before frontend polish

Before design or onboarding work, map the real supported product envelope. The goal is to know exactly what a user can type and what we can execute without guessing.

### Supported v1 user intent shape

For v1, only support fuzzy stablecoin allocation goals that can be normalized into:

```json
{
  "asset": "USDC",
  "sourceChain": "Arbitrum",
  "sourceAmount": "exact user amount",
  "objective": "maximize yield | safest yield | low gas | prefer chain",
  "constraints": {
    "maxLockupDays": 7,
    "allowedChains": ["base"],
    "risk": "low | medium",
    "singleAllocationRequired": true
  }
}
```

Reject or explain unsupported goals instead of hallucinating:

- Leveraged, borrow, short, options, LP, or volatile-asset strategies.
- Multi-step conditional automation such as "if ETH drops" until we build a keeper/trigger layer.
- Unsupported source tokens or source chains.
- Venues not present in `AddressRegistry` and not executable through the verified LI.FI route type for that venue.

Current implementation note: the frontend, `/api/goal-policy`, and coverage harness use a deterministic policy layer before `postGoal`. It blocks unsupported conditionals, split allocations, unsupported tokens, and unverified destination-chain preferences before spending STT on Somnia compilation. For supported prompts it returns the full executable envelope: Arbitrum USDC source, single-output ERC-7683 StandardOrder shape, Base destination, verified Aave/Compound venues, LI.FI Composer quote mode, and compiler constraints.

### Prompt/agent coverage tests

Create a table of 20-30 natural-language prompts and record:

- Parsed constraints.
- Candidate pools selected.
- Final allocation JSON.
- Whether parsing succeeds.
- Whether the chosen `(chainName, poolId)` exists in `AddressRegistry`.
- Whether LI.FI returns an executable Composer route: standard `/v1/quote` for vault-token routes, or `/v1/quote/contractCall` for destination contract-call routes.

Seed prompt examples:

- "maximize my USDC yield, 7-day lockup"
- "safest stablecoin yield, no lockup, prefer Base"
- "I want low gas and low risk for USDC"
- "find me 8%+ if possible, but don't use sketchy pools"
- "put my stables somewhere safe for a week"
- "prefer Ethereum even if APY is lower"
- "split between the two safest USDC venues" (reject or constrain until multi-route execution exists)
- "rebalance if ETH drops" (unsupported conditional)
- "use USDT" (unsupported until token coverage exists)

### Execution coverage tests

For each supported venue, run a quote-only test first:

- Arbitrum USDC -> Base aUSDC
- Arbitrum USDC -> Base Compound V3 cUSDCv3 through contract-call Composer.
- Arbitrum USDC -> Base USDC
- Arbitrum USDC -> Ethereum aUSDC, if LI.FI quote supports it.
- Base USDC -> Base aUSDC, same-chain Composer deposit.
- Ethereum USDC -> Base aUSDC, if cost is acceptable.

For each route, record:

- `fromChain`, `toChain`, `fromToken`, `toToken`, amount.
- LI.FI tool chain, e.g. `feeCollection -> across -> composer`.
- `transactionRequest.to`.
- Estimated output and minimum output.
- Whether an API key is required.
- Whether a tiny live test completed.
- Final received token balance.

Only routes with at least one successful tiny live test should appear in the demo UI.

Latest coverage finding: the live stack is wired to `CompilerEngineV2`, which compiles single-allocation intents only. Quote-only coverage at `0.1 USDC` compiled 5 supported prompts, preflight-skipped 4 unsupported prompts, and got LI.FI quote coverage for all compiled cases. The previous candidate/registry drift around `compound-v3-usdc-base` has been addressed by adding Compound to the registry seed, rates normalizer, frontend execution logic, coverage harness, and deterministic policy layer.

---

## 11. Repo structure

```
scryer/                           # rename to your chosen name
├── BUILD_PLAN.md                 # this file
├── README.md                     # public-facing pitch + run instructions
├── contracts/
│   ├── src/
│   │   ├── GoalRegistry.sol
│   │   ├── CompilerEngine.sol
│   │   ├── ReceiptLog.sol
│   │   ├── IntentStore.sol
│   │   ├── AddressRegistry.sol
│   │   ├── StandardOrderEncoder.sol
│   │   └── interfaces/
│   │       ├── IAgentRequester.sol      # from Somnia docs, paste verbatim
│   │       ├── IJsonApiAgent.sol
│   │       └── ILlmInferenceAgent.sol
│   ├── script/
│   │   ├── Deploy.s.sol
│   │   └── FundAgentBudget.s.sol
│   ├── test/
│   │   └── CompilerEngine.t.sol         # fork tests + mocks
│   └── foundry.toml
├── frontend/                     # Next.js (App Router)
│   ├── app/
│   │   ├── page.tsx                     # goal submission
│   │   ├── intent/[id]/page.tsx         # compiled intent view + submit
│   │   └── api/
│   │       └── order/route.ts           # optional proxy to LI.FI Intents
│   ├── lib/
│   │   ├── contracts.ts                 # wagmi/viem contract bindings
│   │   ├── lifi.ts                      # LI.FI Intents REST client
│   │   └── somnia.ts                    # chain config
│   └── package.json
├── .env.example
└── package.json                  # root, with workspaces
```

---

## 12. References - keep these open while coding

### Somnia

- Agents overview: https://docs.somnia.network/agents
- Invoking from Solidity: https://docs.somnia.network/agents/invoking-agents/from-solidity
- JSON API agent: https://docs.somnia.network/agents/base-agents/json-api-request
- LLM Inference agent: https://docs.somnia.network/agents/base-agents/llm-inference
- Code generator: https://agents.somnia.network
- Testnet platform contract: `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` (chain 50312)
- Mainnet platform contract: `0x5E5205CF39E766118C01636bED000A54D93163E6` (chain 5031)
- Testnet RPC: verify from https://docs.somnia.network before deploying. Historic value: `https://dream-rpc.somnia.network`
- Faucet: ask in Somnia Discord or use listed Somnia faucet providers.

### LI.FI Intents (Intent / Solver Marketplace)

- Overview: https://docs.li.fi/lifi-intents/introduction
- API base: https://order.li.fi
- Supported chains endpoint: `GET https://order.li.fi/chains/supported`
- Routes endpoint: `GET https://order.li.fi/routes`
- Creating intents (StandardOrder spec): https://docs.li.fi/lifi-intents/for-developers/swap
- Quoting intents: https://docs.li.fi/lifi-intents/for-developers/quote
- Broadcasting intents: https://docs.li.fi/lifi-intents/for-developers/broadcast
- Order status tracking: https://docs.li.fi/lifi-intents/for-developers/status
- Architecture overview: https://docs.li.fi/lifi-intents/architecture/overview
- Settlement: https://docs.li.fi/lifi-intents/architecture/input-settlement, https://docs.li.fi/lifi-intents/architecture/output-settlement
- Oracle systems: https://docs.li.fi/lifi-intents/architecture/oracle-systems
- Glossary: https://docs.li.fi/lifi-intents/knowledge-database/glossary

### Open Intents Framework / ERC-7683

- OIF launch site: https://openintents.xyz/
- OIF reference contracts (BootNode): https://github.com/BootNodeDev/intents-framework
- ERC-7683 spec discussion: referenced via LI.FI and EF; the standard is implemented in OIF reference contracts.
- LI.FI's OIF positioning: https://li.fi/knowledge-hub/a-more-intentional-ethereum-li.fi-intents-and-the-open-intents-framework

### Industry context

- "Best Cross-Chain Intent Protocols 2026" (Eco): https://eco.com/support/en/articles/11802670-best-cross-chain-intent-protocols-2026
- "What Are Intents and Solvers?" (Eco 2026 guide): https://eco.com/support/en/articles/11855244-what-are-intents-and-solvers-the-complete-guide-to-intent-based-blockchain-architecture
- LI.FI on intent value chain: https://li.fi/knowledge-hub/the-intent-value-chain/
- "Know Your Intent" (Nov 2025): research on the gap in blockchain intent recognition.
- "Intent Formalization" (March 2026): grand-challenge framing for formalizing human intent into executable blockchain intents.

### Data sources

- DefiLlama yields API: https://yields.llama.fi/pools (also `/poolsBorrow`, `/chart/{poolId}`)
- DefiLlama yield docs: https://defillama.com/docs/api

### Standards

- ERC-7683 (cross-chain intents standard)
- EIP-712 (typed data signing for intents)

---

## 13. Glossary

- **Intent:** a user-signed declaration of desired outcome, not execution detail.
- **StandardOrder:** the canonical ERC-7683 order struct used by LI.FI Intents and the Open Intents Framework. Single-chain inputs, multi-chain outputs, oracle-verified delivery.
- **MandateOutput:** one of the outputs in a StandardOrder. Specifies a target chain, token, amount, recipient, and optional call.
- **Input Settler:** the contract on the user's origin chain that holds funds in escrow while a solver fulfills the intent.
- **Output Settler:** the contract on the destination chain that records solver fills and generates settlement attestations.
- **Oracle (intent context):** not a price oracle. The intent oracle is a verification layer that proves the solver delivered, allowing the input settler to release escrowed funds. Must be deployed on both origin and destination chains as a paired system.
- **Order Server:** LI.FI's off-chain matching infrastructure at `order.li.fi`. Distributes intents to the solver network. Optional but improves solver discovery.
- **Solver:** an entity, usually a market maker with capital, that fulfills intents using its own inventory and is paid from the escrowed input.
- **Open Intents Framework (OIF):** the Ethereum Foundation-backed reference implementation of ERC-7683. Includes contracts, an open-source Rust solver, and standardized interfaces.
- **Intent Compiler:** the layer that translates natural-language goals into structured StandardOrder intents. The layer this project builds.

---

## 14. Definition of done for v1

- [ ] Deployed contracts on Somnia testnet with verified source, including `GoalRegistry`, `CompilerEngine`, `ReceiptLog`, `IntentStore`, `AddressRegistry`, and `StandardOrderEncoder`.
- [ ] Demo wallet with sufficient STT to run >10 full goal compilations.
- [ ] At least 2 working demo goals, end-to-end (goal -> compiled plan -> LI.FI Composer route -> destination yield position).
- [ ] Frontend that shows goal submission, compiled intent view with reasoning, and receipt explorer.
- [ ] One full demo run recorded as video, <=3 minutes.
- [ ] README with pitch, architecture, deployed addresses, demo link.
- [ ] Public GitHub repo.

**Stretch (only if time allows):**

- [ ] Multi-asset goals (not just USDC).
- [ ] Constraint richness (more than ~5 constraint tags).
- [ ] Conditional goals ("if X happens, do Y") - adds reactivity scope.
- [ ] Leaderboard of compiled goals and fulfillment outcomes.

---

## 15. Things to verify in the first hour of building

Before writing any application code:

1. **Pull the latest Solidity stubs from https://agents.somnia.network** for JSON API Request and LLM Inference. Compare agent IDs and per-validator prices against what's in this doc. **The generator is the source of truth.**
2. **Test the `?ask=` mechanism** on the Somnia docs for any specific question: `https://docs.somnia.network/agents/<page>.md?ask=<question>`.
3. **Confirm LI.FI `GET /v1/tokens?chains=5031`** returns the Somnia token list. If yes, baseline LI.FI chain integration is still present.
4. **Run one `BtcPriceOracle` example** from the docs verbatim to confirm your local environment works against Somnia testnet.
5. **Confirm LI.FI execution endpoints**: `GET https://li.quest/v1/chains`, `GET https://li.quest/v1/tokens`, and at least one executable `GET https://li.quest/v1/quote` into a yield position.

If any of those five fail, stop and resolve before continuing.

---

## 16. Why this project, in one paragraph

Intents are the defining DeFi primitive of 2026. ERC-7683 standardized the data structure. The Open Intents Framework standardized the implementation. LI.FI Intents and others standardized the solver marketplace. What's not standardized - and what the industry has openly identified as missing - is the translation layer that takes a fuzzy human goal and produces a validated intent. Doing this trustlessly requires consensus-verified AI reasoning, which doesn't exist on any chain except Somnia. This project is the first implementation of that translation layer, built directly on the agent stack Somnia ships. Every reasoning step is on-chain. Every validator independently agreed. Every output is auditable forever. The user's funds stay where they are; we compile the intent that moves them.
