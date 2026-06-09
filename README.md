# Asshai

Asshai is an on-chain intent compiler for stablecoin yield.

Users describe a fuzzy outcome, such as "find the safest USDC yield with no lockup" or "maximize my USDC return, vaults are okay." Asshai sends the goal to Somnia, where validator-consensus agents fetch verified venue data, ask an LLM to choose a supported route, and store an auditable receipt of the decision. The frontend then executes the compiled route through LI.FI Composer from Arbitrum USDC into a Base yield position.

The key constraint is intentional: the LLM never controls funds or arbitrary addresses. It can only choose from a hardcoded, registry-backed venue allowlist. Solidity validates the selected pool and builds the encoded StandardOrder-shaped artifact deterministically.

## Live App

- App: `https://asshai.vercel.app`
- Source chain: Arbitrum USDC
- Destination chain: Base
- Compile chain: Somnia Testnet
- Execution backend: LI.FI Composer

## What Works

- Natural-language USDC yield goals.
- Consensus-verified venue selection on Somnia.
- On-chain receipt log for rates, LLM decision, selected candidate, allocation plan, and encoded order.
- Execution from Arbitrum USDC into verified Base yield venues.
- One-click wallet flow where supported, with sequential approve/execute fallback.
- Receipt pages showing the chosen venue, rejected alternatives, route plan, execution status, and raw proof data.

## Supported V1 Scope

Asshai v1 supports single-allocation Arbitrum USDC routes into verified Base venues:

- Aave V3 USDC on Base
- Compound V3 USDC on Base
- Spark USDC Vault on Base
- Moonwell Flagship USDC on Base
- Fluid USDC on Base
- Steakhouse Prime USDC on Base

Unsupported in v1:

- Split allocations
- Conditional automation
- Non-USDC source assets
- Unverified destination chains
- Multi-step portfolio management

## Deployed Somnia Testnet Contracts

- GoalRegistry: `0x3d37cDE79CCcA78334972e6bf1d351f607aF2ca6`
- CompilerEngine: `0xA6195DAbDaB6EB0D53cF03933d868A83e6469672`
- ReceiptLog: `0xCaf26d33E74cc952284AA3aA71a67DBe69deEFC1`
- IntentStore: `0x0D0891Ae2733E3D8644D1044F497Af4bb63404ea`
- AddressRegistry: `0x146bd5510D7B488d936b23040062e2ca8Fc26E76`
- StandardOrderEncoder: `0xB9084F50D6F75006953F69741762548990B334E7`

## Local Development

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

## Environment

Copy `.env.example` and provide the required RPC/key values for local contract work.

Frontend deployment expects the public contract addresses and RPC values used by `frontend/lib/contracts.ts` and `frontend/lib/somnia.ts`.

## Architecture Summary

1. The user posts a goal to `GoalRegistry` on Somnia.
2. `CompilerEngine` calls the Somnia JSON API agent to fetch a compact rates payload.
3. The Somnia LLM agent chooses one supported venue and returns structured JSON.
4. Solidity validates the selected venue against the allowlist.
5. `StandardOrderEncoder` builds the deterministic order-shaped artifact.
6. `ReceiptLog` stores each reasoning step on-chain.
7. The frontend executes the compiled route through LI.FI Composer.

Asshai is not a solver. It is the trustless translation layer above solvers and routers: human goal in, validated executable route out, with the reasoning trail preserved on-chain.
