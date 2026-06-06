# Product Coverage Notes

Last run: 2026-06-06

Harness:

```bash
pnpm coverage:goals --amount=0.1 --out=docs/coverage/latest.json
```

Execution mode: quote-only. No USDC routes were executed. Each Somnia compilation used a `0.1 USDC` source amount. Preflight guard was enabled, so unsupported prompts were skipped before spending STT.

Update: `compound-v3-usdc-base` has now been added as a real Base venue. It uses LI.FI's contract-call Composer endpoint: bridge USDC to Base, then call Compound V3 Comet `supply(USDC, amount)`. The live Somnia registry is seeded, but the production `/api/yields` endpoint must be redeployed before new agent compilations can select Compound.

## Summary

| Prompt case | Expected | Compile | LI.FI quote | Result |
|---|---|---:|---:|---|
| maximize my USDC yield, 7-day lockup | supported | pass | pass | Base Aave USDC |
| safest stablecoin yield, no lockup, prefer Base | supported | pass | pass | Base Aave USDC |
| I want low gas and low risk for USDC | supported | pending retest | pending retest | Compound/Base is now supported after redeploy |
| find me 8%+ if possible, but don't use sketchy pools | supported fallback | pass | pass | Correctly notes APY below target |
| put my stables somewhere safe for a week | supported | pass | pass | Base Aave USDC |
| prefer Ethereum even if APY is lower | unsupported/executable gap | skipped | n/a | Preflight rejected |
| split between the two safest USDC venues | unsupported until multi-route | skipped | n/a | Preflight rejected |
| rebalance if ETH drops | unsupported conditional | skipped | n/a | Preflight rejected |
| use USDT | unsupported token | skipped | n/a | Preflight rejected |

Totals:

- Compilation: `4/9` before Compound support
- Preflight skipped: `4/9`
- LI.FI quote success among compiled cases: `4/4`
- Compiler failure after preflight: `1/9` before Compound support

## Key Findings

The current executable product envelope is narrow but real: fuzzy USDC yield goals that map to `aave-v3-usdc-base` compile and quote successfully. `compound-v3-usdc-base` is now registry-backed and Composer-quoteable through LI.FI's contract-call route, pending frontend/API redeploy and coverage retest.

At `0.1 USDC`, LI.FI quotes are executable but fee-inefficient. The quote output was around `0.0723 aBasUSDC` for `0.1 USDC`, mostly because small cross-chain routes have fixed costs. For demo-quality execution, prefer `1 USDC` or larger, while keeping harness quote tests at `0.1 USDC`.

The preflight support classifier now blocks conditional automation, split allocations, unsupported tokens, and unverified Ethereum destinations before `postGoal`.

The previous candidate/registry drift around `compound-v3-usdc-base` has been addressed in code and in the live Somnia registry. The remaining validation step is to redeploy the frontend/API so the JSON API agent sees Compound in `/api/yields`, then rerun coverage.

The candidate universe is too small and too implicit. Many prompts say "only one pool is available," which is true in practice but weak product behavior. We should either intentionally position v1 as "Base Aave USDC yield only" or add more verified Composer-executable venues.

The parser/validator correctly failed some unsupported outputs after the LLM chose unregistered venues, but failing after spending STT is not ideal. Unsupported goals should be caught before the agent chain where possible.

## Immediate Product Rules

Allow:

- USDC source asset.
- Arbitrum source chain.
- Single-allocation stablecoin yield.
- Base Aave USDC destination.
- Base Compound V3 USDC destination after the updated `/api/yields` deployment is live.
- Goals framed as maximize yield, low risk, low gas, safe stables, short/no lockup.

Reject for now:

- Conditional goals: "if ETH drops", "rebalance when", "monitor", "trigger".
- Multi-allocation goals: "split", "diversify across two", "50/50".
- Unsupported tokens: USDT, DAI, ETH, volatile assets.
- Unsupported venues: anything not in `AddressRegistry` and not quoteable through LI.FI.
- Yield targets above available APY unless presented as "best available is below target".

## Next Implementation Step

Retest candidate/registry alignment after deployment.

The safest demo path is to pass only Composer-executable pool IDs to the LLM. Today that means `aave-v3-usdc-base` and `compound-v3-usdc-base`. Aave uses the standard LI.FI quote path into `aBasUSDC`; Compound uses `/v1/quote/contractCall` to bridge Base USDC and call the Comet `supply` function. Add future venues to the rates normalizer and `AddressRegistry` together, and verify the exact LI.FI execution path before exposing them to the LLM.

The deterministic preflight classifier can later become Agent 0 on Somnia, but for demo safety it should remain in the frontend/server path too.
