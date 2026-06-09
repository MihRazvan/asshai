# ASSHAI
<img width="1920" height="360" alt="Asshai hero banner placeholder" src="https://placehold.co/1920x360/050505/f97316?text=Asshai+Hero+Banner" />

Asshai is an on-chain intent compiler that turns fuzzy stablecoin yield goals into consensus-verified, executable DeFi routes.

[Live App](https://asshai.vercel.app/) | [Demo Video](#demo-video-placeholder) | [How It Works](#how-it-works) | [Deployments](#deployments) | [Quickstart](#quickstart)

---

## Problem First

Intent-based DeFi is becoming the default execution layer for cross-chain applications. Solvers, routers, and settlement systems can already compete to execute precise orders.

The missing layer is upstream.

Real users do not start with a complete order. They start with goals:

- "Find the safest USDC yield with no lockup"
- "Maximize my USDC return, vaults are okay"
- "Find me 6%+ if possible, but don't use sketchy pools"

Today, translating those fuzzy goals into executable routes usually happens inside a private backend or centralized AI service. Asshai moves that translation onto Somnia, where validator-consensus agents fetch venue data, reason over the user's goal, and leave an on-chain receipt trail.

<img width="1920" height="720" alt="Problem diagram placeholder" src="https://placehold.co/1920x720/080808/f97316?text=Problem+Diagram+Placeholder" />

Asshai is not a solver. It is the trustless translation layer above solvers and routers: human goal in, validated executable route out.

---

## Overview

Asshai is a two-part system:

- **A Somnia compiler:** contracts and on-chain agents that turn a natural-language goal into a validated route decision.
- **A LI.FI execution layer:** a frontend execution flow that routes Arbitrum USDC into supported Base yield positions.

The important safety boundary is simple: the LLM never controls funds, addresses, or arbitrary calldata. It can only choose from a registry-backed allowlist of supported venues. Solidity validates the selected pool and builds the final order-shaped artifact deterministically.

### Core Principles

1. **Reason Under Consensus**
   Somnia agents produce the yield-data receipt and LLM decision under validator consensus.

2. **Constrain the AI**
   The LLM chooses from known pool IDs. It never invents contracts, addresses, tokens, or execution bytes.

3. **Validate in Solidity**
   Every selected venue is checked against the on-chain registry before execution data is exposed to the frontend.

4. **Execute Through Battle-Tested Routing**
   Asshai compiles the route; LI.FI Composer executes the cross-chain transaction and destination yield action.

5. **Leave a Receipt Trail**
   The app shows the rates considered, the selected venue, rejected alternatives, the deterministic plan, and the execution result.

---

## How It Works

At a high level, Asshai proves this statement:

> This route was selected from verified venue data, under Somnia consensus, constrained by an on-chain allowlist, and executed through LI.FI.

<img width="1920" height="900" alt="Asshai architecture flow placeholder" src="https://placehold.co/1920x900/080808/f97316?text=Architecture+Flow+Placeholder" />

### Compile Flow

1. The user posts a natural-language goal to `GoalRegistry` on Somnia.
2. `CompilerEngine` calls the Somnia JSON API agent to fetch a compact yield venue payload.
3. The Somnia LLM agent chooses one supported venue and returns structured JSON.
4. Solidity validates the selected venue against `AddressRegistry`.
5. `StandardOrderEncoder` builds the deterministic StandardOrder-shaped artifact.
6. `ReceiptLog` stores each compilation step on-chain.
7. The frontend executes the compiled route through LI.FI Composer.

### Full Trust Path

User goal -> Somnia transaction -> rates receipt -> consensus LLM decision -> registry validation -> encoded route artifact -> LI.FI Composer transaction -> Base yield position

> The compiler is auditable before execution, and the execution remains non-custodial.

---

## Demo

The live demo focuses on one product wedge: **single-allocation USDC yield routing from Arbitrum to Base**.

Example prompts that work well:

- `safest stablecoin yield, no lockup`
- `find the highest available USDC yield, vaults are okay`
- `find me 6%+ if possible, but don't use sketchy pools`
- `park my USDC somewhere conservative, prioritize established lending over APY`
- `best USDC yield, but avoid tiny TVL pools and keep it single-asset`

The demo shows:

- a fuzzy goal compiled into a concrete venue decision
- verified venue data from the compiler input
- Somnia consensus receipts for the rates and LLM decision
- rejected alternatives and reasoning
- LI.FI execution into the selected Base position
- a final receipt with route and transaction evidence

### Demo Video Placeholder

Replace this section with the final hackathon demo video link.

---

## Supported V1 Scope

Asshai v1 supports single-allocation routes from **Arbitrum USDC** into verified **Base USDC yield venues**.

### Supported Venues

- Aave V3 USDC on Base
- Compound V3 USDC on Base
- Spark USDC Vault on Base
- Moonwell Flagship USDC on Base
- Fluid USDC on Base
- Steakhouse Prime USDC on Base

### Out of Scope for V1

- Split allocations
- Conditional automation
- Non-USDC source assets
- Unverified destination chains
- Multi-step portfolio management

---

## Tech Stack

| Component | Technology | Purpose |
| --- | --- | --- |
| Intent Compiler | **Somnia Agent Stack** | Consensus JSON API and LLM reasoning |
| Contracts | **Solidity + Foundry** | Goal registry, compiler engine, receipts, registry, encoder |
| Frontend | **Next.js App Router** | User interface, receipt pages, execution flow |
| Wallet Layer | **wagmi + viem + RainbowKit** | Multi-chain wallet connection and transaction signing |
| Execution | **LI.FI Composer** | Cross-chain route execution and destination yield action |
| Venue Data | **DefiLlama + curated normalizer** | Yield, TVL, lockup, and venue metadata |
| Compile Chain | **Somnia Testnet** | On-chain reasoning and receipts |
| Source Chain | **Arbitrum** | User USDC origin chain |
| Destination Chain | **Base** | Supported yield venues |

---

## Deployments

### App

- Live app: [https://asshai.vercel.app](https://asshai.vercel.app)

### Somnia Testnet Contracts

| Contract | Address |
| --- | --- |
| GoalRegistry | `0x3d37cDE79CCcA78334972e6bf1d351f607aF2ca6` |
| CompilerEngine | `0xA6195DAbDaB6EB0D53cF03933d868A83e6469672` |
| ReceiptLog | `0xCaf26d33E74cc952284AA3aA71a67DBe69deEFC1` |
| IntentStore | `0x0D0891Ae2733E3D8644D1044F497Af4bb63404ea` |
| AddressRegistry | `0x146bd5510D7B488d936b23040062e2ca8Fc26E76` |
| StandardOrderEncoder | `0xB9084F50D6F75006953F69741762548990B334E7` |

---

## Quickstart

```bash
pnpm install
pnpm dev
```

The frontend runs from the `frontend` workspace and uses Next.js App Router.

Useful checks:

```bash
pnpm --filter frontend typecheck
pnpm type-boundaries
pnpm build
forge test --root contracts
```

### Environment

Copy `.env.example` and provide the required RPC/key values for local contract work.

The frontend deployment uses the public contract addresses and RPC values configured in `frontend/lib/contracts.ts` and `frontend/lib/somnia.ts`.

---

## Repository Structure

```text
.
├── contracts/        # Somnia contracts, tests, and deploy scripts
├── frontend/         # Next.js app, API routes, wallet/execution code
├── package.json      # Workspace scripts
└── README.md         # Hackathon-facing project overview
```

---

Built on Somnia for verifiable goal-to-intent compilation.
