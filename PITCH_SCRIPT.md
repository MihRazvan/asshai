# Asshai 5-Minute Demo Pitch Script

Target length: ~5 minutes  
Tone: confident, clear, slightly cinematic  
Core message: Asshai is the missing verifiable compiler layer between fuzzy user goals and executable DeFi routes.

## 0:00-0:30 — Hook

Visual: general Asshai image / animated brand screen.

Narration:

> Intent-based DeFi is eating cross-chain execution.
>
> Solvers, routers, and marketplaces can already compete to execute precise orders. But there is still a problem before any solver ever sees the order.
>
> Real users do not think in chain IDs, vault tokens, settlement contracts, or calldata.
>
> They think: "find me the safest stablecoin yield" or "maximize my USDC return without using sketchy pools."
>
> Asshai is the missing layer: an on-chain intent compiler. You describe the outcome, Somnia validators reason over verified market data, and Asshai produces an executable route with an audit trail for every decision.

Key line if you want one punchier version:

> Solvers execute intents. Asshai creates them from human goals, under consensus.

## 0:30-0:50 — Homepage Intro

Visual: app loads, header typing animation.

Narration:

> This is Asshai. The interface is intentionally simple: type what you want your USDC to do next.
>
> Under the hood, this is not just a chatbot. The goal will be posted to Somnia, where the compiler uses Somnia's on-chain agent stack to fetch yield data and make the route decision under validator consensus.

## 0:50-1:15 — Enter Goal

Visual: type or use preset. Set USDC amount. Click through chips briefly.

Example prompt:

```text
safest stablecoin yield, no lockup, prefer Base
```

Alternative if you want a max-yield demo:

```text
find the highest available USDC yield, vaults are okay
```

Narration:

> I can type a fuzzy goal, or use these presets to steer the compiler toward safety, max yield, or a balanced route.
>
> For the demo, I’ll route a small amount of Arbitrum USDC. The compile step uses Somnia Testnet STT, while the actual DeFi execution happens on mainnet through LI.FI.

Small note if shown:

> The user keeps custody the whole time. Asshai only compiles and routes through the user's wallet.

## 1:15-1:35 — Submit To Somnia

Visual: click Compile Intent, approve Somnia transaction.

Narration:

> When I compile, the goal is written to the `GoalRegistry` contract on Somnia Testnet.
>
> That kicks off the compiler engine. First, Somnia's JSON API agent fetches the current supported venue data. Then the Somnia LLM agent chooses the route that best matches the user's goal.

Avoid saying:

> "The AI controls the funds."

Better:

> The AI only chooses from a strict allowlist. It never creates addresses or calldata.

## 1:35-1:55 — Compiling Intent

Visual: compiling screen. It may happen fast, so slow down in edit if needed.

Narration:

> This is the part that usually happens inside a private backend.
>
> Asshai moves it on-chain. The rates fetch, the LLM decision, and the deterministic plan are all recorded as receipts.
>
> If the model returns an unsupported pool or malformed output, the contract rejects it. No route is exposed for execution.

## 1:55-2:30 — Intent Ready

Visual: intent ready page. Show selected venue and summary.

Narration:

> Now the intent is compiled.
>
> Asshai selected a supported Base yield venue, and we can inspect why.
>
> The important safety boundary is here: the LLM selected a pool ID, not a token address, not a contract, not arbitrary bytes. Solidity validated that pool against the registry and built the final route artifact deterministically.

If using safety prompt:

> In this case, the compiler prioritized the lowest risk tier and rejected higher-yield venues because they were less conservative.

If using max-yield prompt:

> In this case, the compiler prioritized the highest verified APY among the supported venues.

## 2:30-3:15 — Execute Intent + Inspect Tabs During Delay

Visual: click Execute Intent, wallet approval/route transaction. While waiting, show Reasoning, Plan, Execution, Raw tabs.

Narration:

> Once the intent is ready, execution is handled by LI.FI Composer.
>
> The app requests a live route, asks the user for approval, and submits the route transaction from Arbitrum.
>
> While that runs, we can inspect the receipt.
>
> The Reasoning tab shows the market data considered, the selected venue, and rejected alternatives.
>
> The Plan tab shows the deterministic path: Arbitrum USDC, LI.FI route, Base asset, selected yield venue, final position token.
>
> The Raw tab is for developers and judges who want to inspect the encoded order, receipts, and contract addresses directly.

Important phrasing:

> The compiler is on Somnia. The funds move through mainnet rails.

## 3:15-3:45 — Execution Complete

Visual: success state. Show resulting token, route tx, open Base explorer/Basescan if available.

Narration:

> And the route is complete.
>
> The user now holds the resulting yield position on Base. The receipt links back to the route transaction and preserves the reasoning path that led to this decision.
>
> So the final result is not just "a transaction happened." It is: this goal was interpreted, this data was considered, this venue was selected, this route was executed, and here is the proof.

Required operational note:

> For the hackathon demo, the compiler runs on Somnia Testnet, so users compile with testnet STT. The yield execution is real mainnet routing, so the user needs a small amount of USDC on Arbitrum and gas on the relevant chains.

Somnia-native future note:

> As Somnia-native yield markets become available through LI.FI, we can add them as registry-approved destinations without changing the compiler architecture.

## 3:45-4:00 — History

Visual: open History page briefly.

Narration:

> Every compiled intent becomes a receipt. The history page turns the product into an auditable feed of decisions, routes, and outcomes.
>
> This is important because the real value is not just automation. It is accountable automation.

## 4:00-4:40 — Technical Architecture

Visual: architecture diagram.

Narration:

> Architecturally, Asshai has three layers.
>
> First, the user layer: a natural-language goal and a source amount.
>
> Second, the Somnia compiler layer: `GoalRegistry`, `CompilerEngine`, `ReceiptLog`, `AddressRegistry`, `IntentStore`, and `StandardOrderEncoder`.
>
> The compiler calls Somnia's JSON API agent for venue data and Somnia's LLM agent for the route decision. Each callback is gated by the platform contract and tracked by request ID.
>
> Third, the execution layer: the frontend reads the compiled route and executes through LI.FI Composer, using direct token routes or contract-call routes depending on the selected venue.
>
> The key design choice is the two-layer reasoning model. The LLM reasons over human-readable pool IDs and risk data. Solidity binds that choice to trusted addresses and executable route constraints.

Optional deeper technical line:

> That means no hallucinated address can become an execution target. The model can only choose from venues the registry already knows.

## 4:40-5:00 — Closing

Visual: ending screen / thank you / logo.

Narration:

> Asshai is not a solver. It is the layer before the solver: the verifiable compiler that turns human goals into executable DeFi routes.
>
> Today we prove it with USDC yield from Arbitrum to Base, compiled on Somnia and executed through LI.FI.
>
> The bigger idea is simple: if DeFi is moving toward intents, users need a trustless way to create those intents from the way they actually think.
>
> That is Asshai. Describe the outcome. Compile the path. Audit every decision.

## Short Version If The Video Runs Long

Cut in this order:

1. Remove detailed Raw tab explanation.
2. Shorten History section to one sentence.
3. Compress technical architecture to three layers only.
4. Remove operational note about gas unless needed on-screen.

## Things To Avoid Saying

- "Asshai supports any DeFi intent."
- "Asshai always finds the best yield."
- "Asshai is a solver."
- "Funds are on Somnia."
- "Somnia executes the yield deposit."
- "The AI controls the route transaction."
- "This removes every trust assumption."
- "This is financial advice."

## Safe Repeated Phrases

- "Asshai compiles supported goals into executable routes."
- "The compiler runs on Somnia."
- "Execution happens through LI.FI."
- "The LLM chooses from an allowlist; Solidity validates the route."
- "Every reasoning step is recorded as a receipt."
- "Somnia is the verifiable reasoning layer."
- "Human goal in, auditable route out."
