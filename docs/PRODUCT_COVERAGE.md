# Product Coverage Notes

Last run: 2026-06-06

Harness:

```bash
pnpm coverage:goals --amount=0.1 --out=docs/coverage/latest.json
```

Execution mode: quote-only. No USDC routes were executed. Each Somnia compilation used a `0.1 USDC` source amount. Preflight guard was enabled, so unsupported prompts were skipped before spending STT.

Update: `compound-v3-usdc-base` has now been added as a real Base venue. It uses LI.FI's contract-call Composer endpoint: bridge USDC to Base, then call Compound V3 Comet `supply(USDC, amount)`. The live Somnia registry is seeded and the production `/api/yields` endpoint exposes both Aave and Compound.

## Summary

| Prompt case | Expected | Compile | LI.FI quote | Result |
|---|---|---:|---:|---|
| maximize my USDC yield, 7-day lockup | supported | pass | pass | Base Compound V3 via contract-call Composer |
| safest stablecoin yield, no lockup, prefer Base | supported | pass | pass | LLM produced 50/50 Aave + Compound; harness quoted first output only |
| I want low gas and low risk for USDC | supported | pass | pass | LLM produced 50/50 Aave + Compound; harness quoted first output only |
| find me 8%+ if possible, but don't use sketchy pools | supported fallback | fail | n/a | LLM produced 50/50 plan; deployed compiler failed before encoding |
| put my stables somewhere safe for a week | supported | pass | pass | LLM produced 50/50 Aave + Compound; harness quoted first output only |
| prefer Ethereum even if APY is lower | unsupported/executable gap | skipped | n/a | Preflight rejected |
| split between the two safest USDC venues | unsupported until multi-route | skipped | n/a | Preflight rejected |
| rebalance if ETH drops | unsupported conditional | skipped | n/a | Preflight rejected |
| use USDT | unsupported token | skipped | n/a | Preflight rejected |

Totals:

- Compilation: `4/9`
- Preflight skipped: `4/9`
- LI.FI quote success among compiled cases: `4/4`
- Compiler failure after preflight: `1/9`

## Key Findings

The current executable product envelope is narrow but real: fuzzy USDC yield goals can now map to `aave-v3-usdc-base` or `compound-v3-usdc-base`. Compound is registry-backed and Composer-quoteable through LI.FI's contract-call route.

At `0.1 USDC`, LI.FI quotes are executable but fee-inefficient. The quote output was around `0.0723 aBasUSDC` for `0.1 USDC`, mostly because small cross-chain routes have fixed costs. For demo-quality execution, prefer `1 USDC` or larger, while keeping harness quote tests at `0.1 USDC`.

The preflight support classifier now blocks conditional automation, split allocations, unsupported tokens, and unverified Ethereum destinations before `postGoal`.

The previous candidate/registry drift around `compound-v3-usdc-base` has been addressed in code, live registry, and production `/api/yields`.

The new blocker is multi-allocation behavior in the currently deployed compiler. Its prompt still asks the filter agent for the top 2 pools and asks the plan agent to use all selected pools. With both Aave and Compound visible, the LLM often emits 50/50 allocations. The frontend and coverage harness are still single-output execution paths, so v1 should either deploy the patched single-allocation compiler or expose only one pool to the deployed compiler.

The parser/validator correctly failed some unsupported outputs after the LLM chose unregistered venues, but failing after spending STT is not ideal. Unsupported goals should be caught before the agent chain where possible.

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

## Next Implementation Step

Resolve single-allocation enforcement.

The safest demo path is to pass one Composer-executable pool ID to the deployed compiler until the patched single-allocation compiler is live. The patched contract in the repo selects one candidate and rejects multi-allocation plans, but deployment attempts on Somnia testnet currently fail at contract creation and leave no runtime code. The app has been rolled back to the previous working compiler address.

Aave uses the standard LI.FI quote path into `aBasUSDC`; Compound uses `/v1/quote/contractCall` to bridge Base USDC and call the Comet `supply` function. Add future venues to the rates normalizer and `AddressRegistry` together, and verify the exact LI.FI execution path before exposing them to the LLM.

The deterministic preflight classifier can later become Agent 0 on Somnia, but for demo safety it should remain in the frontend/server path too.
