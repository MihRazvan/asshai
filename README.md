# Asshai

On-chain intent compiler for cross-chain stablecoin yield on Somnia.

Asshai translates fuzzy user goals like "maximize my USDC yield, 7-day lockup" into a consensus-verified, ERC-7683-shaped execution plan on Somnia. The v1 demo executes that plan through LI.FI Composer because raw LI.FI Intents callback orders were not reliably filled by public solvers during testing. Raw LI.FI Intents remain a compatibility and research path, not the demo-critical execution backend.

This repository follows `BUILD_PLAN.md` as the source of truth.

## Somnia testnet contracts

- GoalRegistry: `0x3d37cDE79CCcA78334972e6bf1d351f607aF2ca6`
- CompilerEngineV2: `0x9Aa2AD7268E086873bddd6fE19C4199577Cd4df7`
- ReceiptLog: `0xCaf26d33E74cc952284AA3aA71a67DBe69deEFC1`
- IntentStore: `0x0D0891Ae2733E3D8644D1044F497Af4bb63404ea`
- AddressRegistry: `0x146bd5510D7B488d936b23040062e2ca8Fc26E76`
- StandardOrderEncoder: `0xB9084F50D6F75006953F69741762548990B334E7`

`CompilerEngine.sol` is the legacy three-agent compiler kept for tests/research. The live stack points to `CompilerEngineV2`, which uses one JSON API agent call, one LLM pool-selection call, and deterministic Solidity encoding.

## V1 product envelope

- Source: Arbitrum USDC.
- Destination: Base.
- Allocation mode: single venue only.
- Verified venues: Base Aave V3 USDC and Base Compound V3 USDC.
- Execution: LI.FI Composer (`li.quest/v1/quote` and `/v1/quote/contractCall`).
- Unsupported for v1: split allocations, conditional automation, unsupported tokens, and unverified destination chains.

Live execution proof:

- Aave: Arbitrum USDC -> Base `aBasUSDC` completed for `0.1` and `1` USDC tests.
- Compound: Arbitrum USDC -> Base Compound V3 completed through contract-call Composer. Route tx `0x1f1938696967d60e40df284a34ec3479a962b74ecc409b6ed42d0cd693125732`; received `0.097997 cUSDCv3` delta.

The deterministic policy layer lives in `frontend/lib/goal-policy.json` and is exposed through `/api/goal-policy`.

## Deployment recipe

1. Deploy or verify the core Somnia contracts: `GoalRegistry`, `ReceiptLog`, `IntentStore`, `AddressRegistry`, and `StandardOrderEncoder`.
2. Seed `AddressRegistry` with verified LI.FI/OIF addresses and supported venues using `contracts/script/SeedRegistry.s.sol`.
3. Deploy `CompilerEngineV2` with `contracts/script/DeployCompilerEngineV2.s.sol`.
4. Wire `GoalRegistry`, `ReceiptLog`, and `IntentStore` to the new compiler.
5. Deploy the frontend and set Vercel env vars to the live contract addresses.
6. Run quote-only coverage before spending USDC:

```bash
pnpm coverage:goals --amount=0.1 --out=docs/coverage/latest-v2.json
```

## Smoke test

The canonical BTC price oracle smoke contract is deployed at
`0x38ea72f87b8473e9c06690ecbc788fea2fcdba8c`.

The LLM inference smoke contract is deployed at
`0xeb1ff73d01e3cd6ad68a36a7de3b2b0292c7a9da`.

## Compiler data source

`CompilerEngineV2` reads a compact rates payload from `COMPILER_RATES_URL` using
the JSON API agent selector in `COMPILER_RATES_SELECTOR`. The frontend exposes
the intended normalizer at `/api/yields`; point `COMPILER_RATES_URL` at the
public deployed app URL before deploying a compiler intended to run live.
Current testnet compiler source: `https://asshai.vercel.app/api/yields` with
selector `payload`.
