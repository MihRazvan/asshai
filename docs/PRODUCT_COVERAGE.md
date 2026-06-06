# Product Coverage Notes

Last run: 2026-06-06

Harness:

```bash
pnpm coverage:goals --amount=0.1 --out=docs/coverage/latest-v2.json
```

Execution mode: quote-only. No USDC routes were executed. Each Somnia compilation used a `0.1 USDC` source amount. Preflight guard was enabled, so unsupported prompts were skipped before spending STT.

Update: `compound-v3-usdc-base` has now been added as a real Base venue. It uses LI.FI's contract-call Composer endpoint: bridge USDC to Base, then call Compound V3 Comet `supply(USDC, amount)`. The live Somnia registry is seeded and the production `/api/yields` endpoint exposes both Aave and Compound.

Compound live smoke test: `0.098` Base USDC target supplied through LI.FI contract-call Composer. Arbitrum approval `0x37599eb8885681c427011009a33cd8c3093721defa6f87c6324ef362c5b83838`, route tx `0x1f1938696967d60e40df284a34ec3479a962b74ecc409b6ed42d0cd693125732`, status `DONE / COMPLETED`, Base `cUSDCv3` balance delta `0.097997`.

The live Somnia stack is now wired to `CompilerEngineV2` at `0x9Aa2AD7268E086873bddd6fE19C4199577Cd4df7`. V2 intentionally compiles only one allocation per goal. It fetches rates, asks the LLM to pick one verified pool ID, rejects comma-separated or unknown selections, and deterministically encodes a single StandardOrder. This matches the current LI.FI Composer execution path and removes the old 50/50 split risk.

The app now has a deterministic policy layer before `postGoal`. The policy lives in `frontend/lib/goal-policy.json` and is consumed by both the Next.js UI and the Node coverage harness. It exposes the supported source, StandardOrder shape, verified venues, LI.FI quote mode, compiler constraints, and unsupported-goal reasons. The same decision is also available through `GET/POST /api/goal-policy`.

## Summary

| Prompt case | Expected | Compile | LI.FI quote | Result |
|---|---|---:|---:|---|
| maximize my USDC yield, 7-day lockup | supported | pass | pass | Base Compound V3 via contract-call Composer |
| safest stablecoin yield, no lockup, prefer Base | supported | pass | pass | Base Compound V3 via contract-call Composer |
| I want low gas and low risk for USDC | supported | pass | pass | Base Compound V3 via contract-call Composer |
| find me 8%+ if possible, but don't use sketchy pools | supported fallback | pass | pass | Base Aave/USDC fallback; target APY is above verified venue APYs |
| put my stables somewhere safe for a week | supported | pass | pass | Base Compound V3 via contract-call Composer |
| prefer Ethereum even if APY is lower | unsupported/executable gap | skipped | n/a | Preflight rejected |
| split between the two safest USDC venues | unsupported until multi-route | skipped | n/a | Preflight rejected |
| rebalance if ETH drops | unsupported conditional | skipped | n/a | Preflight rejected |
| use USDT | unsupported token | skipped | n/a | Preflight rejected |

Totals:

- Compilation: `5/9`
- Preflight skipped: `4/9`
- LI.FI quote success among compiled cases: `5/5`
- Compiler failure after preflight: `0/9`

## Key Findings

The current executable product envelope is narrow but real: fuzzy USDC yield goals can now map to `aave-v3-usdc-base` or `compound-v3-usdc-base`. Both Aave and Compound have live execution proof. Compound is registry-backed and executable through LI.FI's contract-call route.

At `0.1 USDC`, LI.FI quotes are executable but fee-inefficient. The quote output was around `0.0723 aBasUSDC` for `0.1 USDC`, mostly because small cross-chain routes have fixed costs. For demo-quality execution, prefer `1 USDC` or larger, while keeping harness quote tests at `0.1 USDC`.

The preflight support classifier now blocks conditional automation, split allocations, unsupported tokens, and unverified Ethereum destinations before `postGoal`. For supported prompts, it returns an explicit executable envelope: Arbitrum USDC source, single-output ERC-7683 StandardOrder, Base destination, verified Aave/Compound venues, and LI.FI Composer quote readiness.

The previous candidate/registry drift around `compound-v3-usdc-base` has been addressed in code, live registry, and production `/api/yields`.

The previous multi-allocation blocker is resolved in `CompilerEngineV2`. The compiler now treats the LLM as a single-choice selector, not an allocator. Multi-output goals are still product-unsupported, but they are rejected before execution rather than compiled into partially executable orders.

Unsupported goals should continue to be caught before the agent chain where possible. The frontend/server preflight guard is currently the product safety layer for unsupported tokens, destinations, conditional automation, and multi-route requests.

## Immediate Product Rules

Allow:

- USDC source asset.
- Arbitrum source chain.
- Single-allocation stablecoin yield.
- Base Aave USDC destination.
- Base Compound V3 USDC destination.
- Goals framed as maximize yield, low risk, low gas, safe stables, short/no lockup.

Reject for now:

- Conditional goals: "if ETH drops", "rebalance when", "monitor", "trigger".
- Multi-allocation goals: "split", "diversify across two", "50/50".
- Unsupported tokens: USDT, DAI, ETH, volatile assets.
- Unsupported venues: anything not in `AddressRegistry` and not quoteable through LI.FI.
- Yield targets above available APY unless presented as "best available is below target".

## Current Product Safety Layer

The deterministic policy layer is now implemented.

- UI: the home page shows the executable envelope before submit.
- API: `/api/goal-policy?goal=...` returns the same decision for non-UI clients.
- Harness: `coverage-harness.mjs` posts goals with the policy-defined compiler constraints and records the full preflight envelope.
- Data source: `frontend/lib/goal-policy.json` is the single source of truth for v1 supported venues and rejection copy.

## Next Implementation Step

Move from policy coverage to execution hardening.

The next product step is not visual polish; it is execution hardening around the now-defined v1 envelope. The app should make the LI.FI quote step more deterministic before asking for approval: show from amount, expected output/position token, route steps, spender, estimated gas, expiry, and a clear "this is quoteable but not executed yet" state.

Aave uses the standard LI.FI quote path into `aBasUSDC`; Compound uses `/v1/quote/contractCall` to bridge Base USDC and call the Comet `supply` function. Add future venues to the rates normalizer and `AddressRegistry` together, and verify the exact LI.FI execution path before exposing them to the LLM.

The deterministic preflight classifier can later become Agent 0 on Somnia, but for demo safety it should remain in the frontend/server path too.
