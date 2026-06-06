# Proof of Reasoning Architecture

Last updated: 2026-06-07

Live Somnia testnet compiler: hardened `CompilerEngineV3` at `0x575f48bCC5E369573822dB19C52f4bdf7495cb80`.

## Why We Changed Direction

The working Asshai v1 could already compile a natural-language USDC yield goal on Somnia and execute it through LI.FI Composer into Base Aave or Base Compound. That proved the pipeline, but it left a judge/product critique open:

> If the end result is "bridge USDC and deposit into Aave/Compound," why does this need Somnia?

The answer cannot be "because an LLM ran on-chain." That is technically interesting, but not automatically a product advantage. The product advantage is accountability: the DeFi action comes with proof of how the decision was made.

So the architecture is being reframed from "AI yield router" to "verifiable decision engine for DeFi actions." Yield routing is the first vertical. The distinctive artifact is the Proof of Reasoning: a shareable, auditable trail of the data, prompt, agent decision, deterministic encoding, and final execution.

## Product Thesis

Every AI-directed financial action should be auditable.

For a normal AI/backend router, a user only sees the final transaction. They cannot prove which data was fetched, which options were considered, what the model was asked, why a venue was selected, or whether the backend operator changed the decision path.

Asshai puts the decision path on Somnia:

- DefiLlama/rates data is fetched through Somnia's JSON API agent.
- The LLM decision is produced through Somnia's LLM Inference agent.
- The chosen pool is validated by Solidity against a hardcoded supported set.
- The execution plan is encoded deterministically from registry data.
- ReceiptLog stores the reasoning trace on-chain.
- LI.FI Composer executes the route using standard, battle-tested routing.

The execution backend is intentionally standard. The new layer is the consensus-verified reasoning that decided what to execute.

## What Changed

### Before: CompilerEngineV2

`CompilerEngineV2` asked the LLM to return exactly one pool ID:

```text
compound-v3-usdc-base
```

This was safe, but it made the agent's work look like a two-option picker. The reasoning was mostly invisible.

### After: CompilerEngineV3

`CompilerEngineV3` asks the LLM for a constrained decision object:

```json
{
  "poolId": "compound-v3-usdc-base",
  "objectiveMatched": "max_yield",
  "rejectedAlternatives": [
    {"poolId": "aave-v3-usdc-base", "reason": "lower APY"}
  ],
  "reasoning": "Compound has higher current APY while still being verified."
}
```

Solidity only trusts and extracts `poolId`. The richer reasoning is stored as receipt data for auditability, not used directly for execution.

This preserves the safety model:

- The LLM never writes addresses.
- The LLM never writes calldata.
- The LLM never chooses unsupported venues.
- The LLM never controls percentages in v1.
- Solidity still constructs the StandardOrder-shaped plan from registry data.

But it improves the product:

- The user sees why a venue was chosen.
- A reviewer can inspect rejected alternatives.
- Different goals can produce different rational decisions from the same venue set.
- The receipt page becomes the hero artifact, not a debug log.

## Venue Intelligence Layer

The `/api/yields` payload now includes more than APY:

- `poolId`
- `llamaPoolId`
- `chainName`
- `project`
- `symbol`
- `apy`
- `tvlUsd`
- `lockup`
- `venueType`
- `riskTier`
- `riskNotes`
- `executionVerified`
- `executionPath`

Current v1 venue contrast:

| Venue | Role In Demo | Risk Framing | Execution |
|---|---|---|---|
| `aave-v3-usdc-base` | Safest verified venue | lowest risk, established lending market | direct LI.FI quote into Base aUSDC |
| `compound-v3-usdc-base` | Higher-yield verified venue | low risk, established lending market, contract-call route | LI.FI contract-call Composer into Comet.supply |

The point is not to claim the LLM is a quant. The point is to prove it considered a bounded, documented policy surface under consensus.

## Proof of Reasoning Page

The intent page is being reoriented around:

1. User goal.
2. Data considered.
3. Consensus agent decision.
4. Deterministic Solidity plan.
5. StandardOrder-shaped artifact.
6. LI.FI execution proof.
7. Final received position.

This is the "Etherscan for AI financial reasoning" surface.

## Demo Moments We Want

The demo should show three goals:

1. `maximize my USDC yield, 7-day lockup`

Expected behavior: choose the highest verified yield venue, likely Compound if APY is currently higher.

2. `safest stablecoin yield, no lockup`

Expected behavior: choose Aave if the safety prompt outweighs the APY difference.

3. `find me 8%+ if possible, don't use sketchy pools`

Expected behavior: warn that no verified v1 venue currently meets the APY target, then choose the best verified fallback rather than hallucinating an 8% pool.

The memorable moment is not the deposit itself. It is two similar prompts producing different, auditable decisions from the same candidate set.

## Why This Is Architecturally Defensible

Asshai does not compete with LI.FI Composer. Composer is the execution layer.

Asshai sits above it:

- Converts human goals into a precise execution plan.
- Proves what data and reasoning led to that plan.
- Emits a strict StandardOrder-shaped artifact for auditability and future raw LI.FI Intents/OIF compatibility.
- Uses Composer in v1 because it reliably executes destination yield actions.

This lets us say:

> LI.FI moves the asset. Somnia proves why the asset moved there.

That is the project.

## What We Deliberately Do Not Support Yet

- Multi-allocation.
- Conditional/recurring execution.
- Unsupported tokens like USDT, DAI, ETH, BTC.
- Unverified destinations outside Base.
- Arbitrary protocol calls.
- LLM-generated calldata.

These are rejected by the deterministic policy layer before spending STT.

## Implementation Summary

New/updated pieces:

- `contracts/src/CompilerEngineV3.sol`
- `contracts/test/CompilerEngineV3.t.sol`
- `contracts/script/DeployCompilerEngineV3.s.sol`
- `frontend/app/api/yields/route.ts`
- `frontend/lib/goal-policy.json`
- `frontend/app/intent/[id]/IntentClient.tsx`
- `frontend/scripts/coverage-harness.mjs`

V3 remains compatible with the existing `GoalRegistry`, `ReceiptLog`, `IntentStore`, `AddressRegistry`, and `StandardOrderEncoder` stack.

## Remaining Question For Review

The main thing to test is not whether V3 compiles. It does in unit tests.

The main thing to test is behavioral:

- Does the live Somnia LLM reliably return compact JSON?
- Does it choose Compound for max-yield prompts?
- Does it choose Aave for safety prompts?
- Does it honestly fallback when APY targets are impossible?

If those three behaviors are stable, the demo becomes much stronger.

## Live Decision Check

The hardened V3 prompt was tested on Somnia testnet with the three demo-critical behaviors:

- Max yield prompt selected `compound-v3-usdc-base` with `objectiveMatched=max_yield`.
- Safety prompt selected `aave-v3-usdc-base` with `objectiveMatched=safety`.
- Impossible 8% APY prompt selected `compound-v3-usdc-base` with `objectiveMatched=fallback` and explicitly reasoned that no verified pool offers 8%+ APY.

Report: `docs/coverage/v3-decision-check-hardened.json`.
