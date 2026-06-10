# Asshai Explainer

This file explains what Asshai does, what happens behind the scenes, what is currently in scope, and what the project deliberately does not do yet.

## One-Sentence Summary

Asshai turns fuzzy USDC yield goals into an auditable, consensus-verified route decision on Somnia, then executes that route through LI.FI into a supported Base yield position.

## What Asshai Is

Asshai is an on-chain intent compiler.

The user does not need to choose a protocol, chain, vault token, or route manually. They describe an outcome in plain language, such as:

- `safest stablecoin yield, no lockup`
- `find the highest available USDC yield, vaults are okay`
- `find me 6%+ if possible, but don't use sketchy pools`
- `park my USDC somewhere conservative, prioritize established lending over APY`

Asshai compiles that goal into one supported yield venue, shows why that venue was selected, shows what alternatives were rejected, and lets the user execute the route.

The important distinction:

Asshai is not trying to be the solver, bridge, or yield protocol. It is the trustless reasoning layer that decides which supported route best matches the user's stated goal.

## User Perspective

From the user's point of view, Asshai works like this:

1. The user connects their wallet.
2. They type a yield goal in natural language.
3. They enter how much Arbitrum USDC they want to route.
4. They submit the goal on Somnia Testnet, paying a small STT compilation fee.
5. Asshai shows the compiler working:
   - venue data read
   - Somnia LLM decision
   - selected venue
   - rejected alternatives
   - deterministic plan
6. Once the intent is ready, the user executes through LI.FI.
7. Their Arbitrum USDC is routed to Base and deposited or swapped into the selected yield position.
8. The final screen shows what position was acquired and links to the execution evidence.

The user experience should feel like:

> "I said what I wanted. Asshai showed me why it chose a route. I approved execution. I received the resulting yield position."

## Current Product Scope

The current working product is intentionally narrow.

Asshai v1 supports:

- Source asset: USDC
- Source chain: Arbitrum
- Destination chain: Base
- Allocation mode: single venue only
- Execution path: LI.FI Composer
- Compile chain: Somnia Testnet
- Goal type: one-time USDC yield allocation

Supported destination venues:

- Aave V3 USDC on Base
- Compound V3 USDC on Base
- Spark USDC Vault on Base
- Moonwell Flagship USDC on Base
- Fluid USDC on Base
- Steakhouse Prime USDC on Base

The user can choose any amount of Arbitrum USDC, subject to wallet balance and route availability.

## What Happens Behind The Scenes

### 1. Frontend Classifies The Goal

Before sending anything on-chain, the frontend checks whether the prompt is inside the v1 product envelope.

Supported:

- stablecoin / USDC yield
- single allocation
- no conditional automation
- no unsupported source token

Rejected or warned:

- `rebalance if ETH drops`
- `split across three protocols`
- `use my WETH`
- `send to Ethereum mainnet`

This is not the core trust mechanism. It is a UX guardrail so users do not spend STT on obviously unsupported requests.

### 2. User Posts A Goal To Somnia

The frontend calls `GoalRegistry.postGoal(...)` on Somnia Testnet.

The goal includes:

- natural-language text
- source asset address
- source amount
- source chain ID
- constraints
- deadline

In v1, the source is Arbitrum USDC:

- chain ID: `42161`
- token: Arbitrum USDC

`GoalRegistry` stores the goal and forwards the compilation fee to `CompilerEngineV4`.

### 3. Somnia Fetches Venue Data

`CompilerEngineV4` calls Somnia's JSON API agent.

That agent fetches the configured rates URL, currently the app's curated yield endpoint:

```text
https://asshai.vercel.app/api/yields
```

That endpoint normalizes DefiLlama venue data into a compact payload containing only supported venues and metadata:

- pool ID
- protocol
- APY
- TVL
- chain
- lockup
- risk tier
- execution path

The resulting payload is recorded through `ReceiptLog` as `rates_fetched`.

Important nuance:

Somnia proves that the compiler fetched and reasoned over this payload. The app's normalizer is still part of the data pipeline. For the hackathon this is acceptable because the payload is deterministic, public, and auditable, but it is not the same as a cryptographic proof that DefiLlama itself returned the data.

### 4. Somnia LLM Chooses One Supported Venue

After rates are fetched, `CompilerEngineV4` calls the Somnia LLM Inference agent.

The LLM is constrained by prompt and contract validation. It must choose exactly one of these pool IDs:

```text
aave-v3-usdc-base
compound-v3-usdc-base
morpho-spark-usdc-base
morpho-moonwell-flagship-usdc-base
fluid-usdc-base
steakhouse-prime-usdc-base
```

The LLM returns compact JSON:

```json
{
  "poolId": "aave-v3-usdc-base",
  "objectiveMatched": "safety",
  "rejectedAlternatives": [
    {
      "poolId": "compound-v3-usdc-base",
      "reason": "higher riskTier"
    }
  ],
  "reasoning": "Aave V3 has the lowest risk tier and best matches a conservative goal."
}
```

The decision is recorded on-chain as `decision_built` and `candidates_selected`.

### 5. Solidity Validates The Decision

The LLM does not get to invent addresses, calldata, routes, tokens, or destinations.

The contract extracts `poolId` and checks it against the hardcoded supported-pool allowlist. If the selected pool is not supported, compilation fails.

This is the key safety pattern:

> LLM chooses a semantic option. Solidity binds that option to actual protocol addresses and execution constraints.

### 6. Solidity Builds A Deterministic Plan

`CompilerEngineV4` builds a single-allocation plan:

```json
{
  "allocations": [
    {
      "chainName": "base",
      "poolId": "compound-v3-usdc-base",
      "pct": 100
    }
  ],
  "decision": "{...}"
}
```

This is recorded as `plan_built`.

### 7. StandardOrderEncoder Builds The Order-Shaped Artifact

`StandardOrderEncoder` reads trusted addresses from `AddressRegistry` and builds a StandardOrder-shaped encoded artifact.

It determines:

- input settler for the source chain
- output settler
- oracle
- destination token
- receiver or recipient
- output amount
- deadline and expiry
- encoded output structure

The encoded artifact is stored in `IntentStore`, and its hash is stored in `GoalRegistry`.

This is recorded as `order_encoded`.

Important nuance:

This artifact is useful as an auditable, deterministic intent representation. The current production execution path does not rely on LI.FI Intents order-server settlement. The app executes through LI.FI Composer because that path is live, reliable, and tested for the supported venues.

### 8. Frontend Executes Through LI.FI Composer

Once the compiled intent is ready, the frontend decodes the selected venue and requests a LI.FI route.

There are two execution styles:

Direct token/vault routes:

- Aave
- Spark
- Moonwell
- Fluid
- Steakhouse

Contract-call route:

- Compound V3, where LI.FI bridges into Base USDC and calls `Comet.supply(...)`

The frontend handles:

- Arbitrum chain switching
- USDC approval
- LI.FI route transaction
- EIP-5792 batched execution when the wallet supports it
- sequential approve + execute fallback when it does not
- LI.FI status polling
- final receipt display

### 9. Final Receipt

The final receipt combines:

- the original user goal
- venue data considered
- Somnia consensus decision
- rejected alternatives
- deterministic plan
- on-chain compile receipts
- approval transaction
- LI.FI route transaction
- final received position token

This is what makes the demo legible: users and judges can inspect why the route was chosen, not just that something executed.

## Why Somnia Matters

Asshai uses Somnia for the step that is normally hidden inside a centralized backend:

> translating a fuzzy human goal into a concrete route decision.

The JSON API fetch and LLM decision happen through Somnia's agent stack, and the receipts are written on-chain. That means the decision process is not merely "our backend said so." It is a consensus-executed workflow with an audit trail.

Somnia is not currently the user's origin chain or destination yield chain in v1. The user's funds start on Arbitrum and end on Base. Somnia is the verifiable compiler layer.

That is intentional.

## What Asshai Does Not Do

Asshai does not currently do the following:

- It does not custody user funds.
- It does not run its own solver.
- It does not compete with LI.FI, Across, Stargate, or other routing systems.
- It does not dynamically discover arbitrary DeFi protocols.
- It does not support arbitrary natural-language DeFi requests.
- It does not support conditional automation like "if ETH drops 10%."
- It does not rebalance positions over time.
- It does not split allocations across multiple venues.
- It does not support non-USDC source assets.
- It does not support every chain.
- It does not guarantee the highest possible yield in DeFi.
- It does not guarantee that APYs stay constant after execution.
- It does not perform financial advice or personalized suitability checks.
- It does not currently route into Somnia-native yield protocols.
- It does not currently use LI.FI Intents order-server settlement for the final execution path.

The clean claim is:

> Asshai compiles supported USDC yield goals into auditable route decisions on Somnia and executes those routes through LI.FI.

## What The Demo Proves

The current demo proves:

1. A user can type a fuzzy yield goal.
2. Somnia agents can fetch venue data and produce an LLM decision.
3. The decision can be constrained to a supported allowlist.
4. The selected route can be displayed with reasoning and rejected alternatives.
5. The user can execute the route through LI.FI.
6. The final position can be acquired on Base.
7. The whole decision path can be shown as a receipt.

The demo does not prove:

- universal intent support
- autonomous portfolio management
- arbitrary chain support
- arbitrary protocol support
- live Somnia-native yield execution
- production-grade risk scoring

## Best Demo Prompts

Use prompts that fit the v1 envelope and demonstrate different reasoning modes.

Safety:

```text
safest stablecoin yield, no lockup, prefer Base
```

Max yield:

```text
find the highest available USDC yield, vaults are okay
```

Fallback / honest APY handling:

```text
find me 6%+ if possible, but don't use sketchy pools
```

Conservative:

```text
park my USDC somewhere conservative, prioritize established lending over APY
```

Liquidity-aware:

```text
find a strong USDC yield with deep liquidity and no lockup
```

## Safe Pitch Boundaries

Good claims:

- "Asshai is an on-chain intent compiler."
- "The user's fuzzy goal is compiled on Somnia."
- "The LLM decision is constrained to verified venues."
- "Solidity validates the selected pool before execution."
- "LI.FI handles cross-chain execution."
- "The final receipt shows the reasoning and execution trail."

Avoid saying:

- "Asshai supports any DeFi intent."
- "Asshai always finds the best yield."
- "Asshai is a solver."
- "Asshai eliminates all trust assumptions."
- "Asshai routes into Somnia-native yield today."
- "Asshai uses LI.FI Intents marketplace for execution today."

Better phrasing:

> "Today we prove the core primitive with a focused USDC yield product: verifiable goal-to-route compilation on Somnia, executed through LI.FI. The architecture can add more venues as they become verified and routable."

## Future Extensions

Natural next steps after the hackathon:

- Add more source chains.
- Add more source assets.
- Add Somnia-native yield destinations once they are safely routable.
- Replace the curated yield endpoint with more direct or independently verifiable data fetching.
- Add split allocations.
- Add conditional intents.
- Add portfolio monitoring and withdrawal flows.
- Add stronger risk scoring and venue explainability.
- Integrate a true ERC-7683 / LI.FI Intents submission path once the targeted route types are reliably fillable.

## Mental Model

Asshai is three layers:

1. **Human layer:** "What should my USDC do?"
2. **Compiler layer on Somnia:** "Given the verified options, which supported route best matches this goal?"
3. **Execution layer through LI.FI:** "Move funds and acquire the selected position."

That is the project.

Not a wallet. Not a solver. Not a universal DeFi autopilot.

A verifiable compiler for supported DeFi outcomes.
