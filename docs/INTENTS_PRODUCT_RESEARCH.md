# Asshai Intent Product Research - June 4, 2026

This memo records the decision basis for moving Asshai from a working demo into a product-shaped v1. It focuses on LI.FI Intents, Open Intents Framework contracts, ERC-7683, callback execution, and stablecoin yield execution.

## June 6 update - shipped v1 path

This memo originally recommended an intent-native receiver callback path. Follow-up live testing changed the decision.

What shipped:

- Somnia compiles fuzzy goals into a StandardOrder-shaped, auditable execution plan.
- `CompilerEngineV3` uses JSON API data plus one LLM decision-object step, then deterministic Solidity encoding.
- LI.FI Composer is the active v1 execution backend because it reliably returns an executable route transaction.
- Raw LI.FI Intents escrow remains a research/future backend. A simple raw order reached `Settled`, but callback orders to `AsshaiYieldReceiver` stayed at `Signed` and were not reliably filled by public solvers.

Current recommendation: demo and productize the Composer-backed path. Keep `AsshaiYieldReceiver` and raw LI.FI Intents callback work as future infrastructure for partner-solver or allowlisted-solver scenarios, not the hackathon-critical path.

Follow-up verification: the Composer-backed path now has live proof for both Base Aave and Base Compound. The Compound contract-call smoke routed Arbitrum USDC to Base and called Compound V3 `Comet.supply`, producing a positive `0.097997 cUSDCv3` balance delta for the user wallet.

## Current Proof Point

We have already proven the core loop:

- User posts a fuzzy goal to Somnia.
- Somnia agents fetch rates, filter candidates, build a plan, and store receipts.
- Somnia contracts encode a LI.FI/OIF StandardOrder-shaped plan.
- Frontend decodes that plan and requests a LI.FI Composer route.
- User approves and executes one origin-chain route transaction.
- LI.FI routes Arbitrum USDC into a Base yield position.

The raw LI.FI Intents proof point still matters: a simple Arbitrum USDC -> Base USDC order opened through `InputSettlerEscrow.open(StandardOrder)` reached `Settled`. But the stronger shipped v1 proof point is Composer execution into Base Aave yield, because it performs the user-facing yield action reliably.

## Research Findings

### 1. LI.FI Intents support destination callbacks

LI.FI documents that each `MandateOutput` has a `callbackData` field. On delivery, the output token is transferred first, then the output settler calls:

```solidity
outputFilled(bytes32 token, uint256 amount, bytes executionData)
```

on the `recipient` contract. If the callback fails, the intent cannot be filled. The recipient must be a contract. For multi-chain outputs, only the first output should include callback data.

Source: https://docs.li.fi/lifi-intents/intents-api/create-and-submit

The current OIF source confirms the same behavior in `OutputSettlerBase`: transfer output token to recipient, then call `IOutputCallback(recipient).outputFilled(...)`.

Source: https://github.com/openintentsframework/oif-contracts

Conclusion: a receiver contract is not a workaround. It is the intended extension mechanism for "deliver token, then perform action."

### 2. Callback orders are solver-sensitive

LI.FI solver docs say solvers validate output chain, oracle, settler, token, context, callback length, and whether calldata can be executed. If calldata is unsupported or risky, the solver can ignore the order.

Source: https://docs.li.fi/lifi-intents/for-solvers/orderflow

Conclusion: v1 should not emit arbitrary calldata. It should emit callback payloads for whitelisted receiver contracts and whitelisted strategy IDs only.

### 3. Simple Escrow is still the right v1 input settlement

LI.FI docs recommend Simple Escrow for standard integrations. The Compact/resource-lock flow is better for gasless recurring intents after an initial deposit, but it has extra signing, allocator, and resource-lock complexity.

Source: https://docs.li.fi/lifi-intents/intents-api/compact-orders

Conclusion: keep Simple Escrow for v1 because it already works end-to-end. Add Compact later when the product needs "deposit once, run many intents."

### 4. Quote-aware pricing matters

`POST https://order.li.fi/quote/request` returns solver pricing and an optional exclusive solver. A live quote for 1 USDC Arbitrum -> Base returned an output under 1 USDC and an `exclusiveFor` solver address. Our first exact-output order still filled, but callback orders will cost more gas and may need a lower output amount or quote/context support.

Source: https://docs.li.fi/lifi-intents/intents-api/request-quote

Conclusion: the encoder must not blindly set stablecoin output equal to input amount forever. Product v1 should add either:

- A conservative `outputBps` haircut per route/venue in the registry.
- Or a quote snapshot included before/opening compilation, with explicit expiry handling.

The conservative haircut is simpler and more compatible with on-chain compilation. Quote integration is a later reliability upgrade.

### 5. LI.FI Earn/Composer is powerful and became the v1 execution backend

LI.FI Earn + Composer can already discover vaults and execute any-token-to-vault deposits. Composer compiles/simulates cross-chain DeFi actions and returns a ready transaction.

Sources:

- https://docs.li.fi/earn/overview
- https://docs.li.fi/composer/how-it-works

This is important product infrastructure. The initial concern was that routing execution through Composer might weaken the StandardOrder/OIF thesis. Live testing showed the practical tradeoff clearly: Composer reliably executes the yield action, while custom raw-Intent callback orders need solver coordination.

Conclusion: use Composer as the v1 execution backend, while keeping the Somnia-compiled artifact StandardOrder-shaped for auditability and future LI.FI Intents/OIF compatibility.

### 6. ERC-7683's useful boundary is solver-facing resolution

ERC-7683 currently emphasizes general-purpose solver instructions and cross-compatibility rather than forcing every protocol to use the same user-facing order struct. The standard gives solvers a common way to understand what must happen, while settlement systems retain flexibility.

Source: https://eips.ethereum.org/EIPS/eip-7683

Conclusion: Asshai's defensible layer is not "we invented an order format." It is "we compile fuzzy human goals into a precise, solver-fillable order/action plan with consensus-verified reasoning."

## Superseded Architecture Decision - receiver callback path

The original decision was to build `AsshaiYieldReceiver` plus whitelisted strategy adapters.

The receiver should live on each supported destination chain. For v1, start with Base only.

Flow:

1. User types a fuzzy stablecoin goal.
2. Somnia agents select a whitelisted strategy ID, for example `aave-v3-usdc-base:supply`.
3. `StandardOrderEncoder` builds a `StandardOrder` whose destination output is liquid Base USDC, not aUSDC.
4. The output `recipient` is `AsshaiYieldReceiver` on Base.
5. The output `callbackData` encodes the selected action, beneficiary, goal ID, expected token, and minimum amount.
6. LI.FI solver delivers Base USDC to `AsshaiYieldReceiver`.
7. OIF output settler calls `outputFilled(...)`.
8. `AsshaiYieldReceiver` validates the caller, token, strategy ID, amount, and beneficiary.
9. Receiver supplies USDC into Aave V3 on behalf of the user.
10. User ends with aUSDC in their wallet.

This remains a valid future path if we coordinate with solvers or if public solver support for callback recipients improves. It is not the active v1 demo path.

## Why Not Let The LLM Produce Calls

Do not let LLM output generate token addresses, arbitrary calldata, protocol call targets, or ABI-encoded bytes.

The LLM may choose:

- A supported venue ID.
- A supported action ID.
- A percentage/allocation within hard bounds.
- A short reasoning string.

Solidity must bind:

- Token addresses.
- Settlers/oracles.
- Receiver contracts.
- Strategy adapter addresses.
- Callback encoding.
- Output amount math.

This keeps malformed or malicious LLM output from becoming executable calldata.

## Product Surface: What Users Can Type In v1

Supported fuzzy goal family:

- Stablecoin-only allocation goals.
- Source token: USDC first.
- Source chains: Arbitrum first; later Base, Ethereum, Optimism.
- Destination chain: Base first.
- Strategy universe: Aave V3 USDC supply first; later Morpho/Spark/Euler if route and callback economics work.
- Constraints: low risk, no/short lockup, prefer chain, avoid rewards-only APY, max 1-2 allocations.

Examples that should compile:

- "Maximize my USDC yield with low risk."
- "Find the safest stablecoin yield, no lockup."
- "Put my USDC to work on Base, avoid weird reward farms."
- "I want stable yield for 7 days, prefer Aave."
- "Max yield but only blue-chip protocols."

Examples that should be rejected or clarified:

- "Long ETH with leverage."
- "Buy whatever meme coin will pump."
- "Use any protocol with 50% APY."
- "Rebalance if ETH drops 10%."
- "Split across any chain and any token."

The rejection path is product-positive: it proves the compiler has bounded authority.

## Implementation Plan

### Slice 1 - Intent-native Aave callback

- Add `AsshaiYieldReceiver.sol` on Base.
- Implement OIF `IOutputCallback`.
- Allow only Base output settler as caller.
- Allow only Base USDC as delivered token.
- Decode callback payload into a typed `YieldAction`.
- Allow only `aave-v3-usdc-base:supply`.
- Approve Aave V3 Pool and call `supply(asset, amount, beneficiary, 0)`.
- Emit a receipt event linking `goalId`, `intentHash`, beneficiary, token, amount, and strategy ID.

### Slice 2 - Registry and encoder upgrade

- Rename `VenueConfig.vaultToken` semantics to separate `deliveryToken` and `positionToken`.
- Add destination `receiver`, `strategyId`, and `outputBps`/`minOutputBps`.
- Change `StandardOrderEncoder` to set:
  - `outputs[0].token = deliveryToken`.
  - `outputs[0].recipient = receiver`.
  - `outputs[0].amount = sourceAmount * outputBps / 10_000`.
  - `outputs[0].callbackData = abi.encode(YieldAction(...))`.
- Keep `context` empty for v1 unless quote exclusivity is added.

### Slice 3 - Frontend seamless flow

- One primary button can orchestrate:
  - post goal on Somnia.
  - watch compilation.
  - request approval on origin chain if needed.
  - open escrow.
  - poll LI.FI status.
  - show final Base aUSDC balance.
- The user still signs necessary chain transactions. We can make it feel one-flow, but not literally one signature yet.

### Slice 4 - Quote reliability

- Pre-open quote check against `POST /quote/request`.
- If quote output is below encoded output, block opening and ask the user to recompile or use a larger fee buffer.
- Later: include quote route/exclusivity into compilation and encode `context`.

### Slice 5 - Compact/resource-lock v1.5

- Add The Compact only after callback execution works.
- Goal: user deposits/locks once, then future compiled intents can be signed/submitted off-chain.
- This is the true path to "one approval, many intents."

## Main Blockers

- Need to test whether LI.FI solvers fill callback orders to our receiver without coordination.
- Need a conservative output amount policy so callback gas is economically fillable.
- Need Base receiver deployment and Aave address verification from the official Aave address book.
- Need receiver code audited enough that a callback cannot route user funds to an arbitrary strategy.
- Need refund UI for expired/stuck orders.
- Need to decide whether to use LI.FI Earn data, DefiLlama data, or both for candidate generation.

## Follow-Up: Solver Exclusivity And Callback Risk

After a second review, callback-recipient solver behavior should be treated as the main execution risk, not a minor edge case.

LI.FI solver guidance says solvers validate calldata-bearing outputs and may need to whitelist recipients when calldata is present. This matters because an unknown `AsshaiYieldReceiver` can revert, consume solver gas, or otherwise fail simulation. A vanilla USDC-to-USDC order is easy for solvers to fill; a USDC-to-receiver-with-callback order asks them to trust more.

`POST /quote/request` helps but does not fully solve this by itself. A live black-box test showed the endpoint accepts extra `callbackData` fields in the quote request, returns a normal quote with `metadata.exclusiveFor`, but does not echo or price the callback fields. The quoted output amount matched the vanilla route shape. Therefore:

- `metadata.exclusiveFor` is useful for route matching and can be encoded into output `context`.
- It should not be interpreted as proof that the solver has simulated or committed to our destination callback.
- Callback viability still has to be tested with a real opened order.

Practical consequence: receiver work should happen behind a fallback. Keep the already-working bridge-only demo recorded and ready, then attempt the callback path with conservative output amounts and exclusive solver context.

## Near-Term Path Decision

There are two credible paths:

### Path A - Receiver Callback Demo

Build the Base `AsshaiYieldReceiver`, encode Base USDC delivery to that receiver, and use callback data to deposit into Aave V3 for the user.

Required constraints:

- Use one output only.
- Use Base USDC as the delivered token.
- Use conservative output amount, e.g. route output below quoted vanilla output.
- Encode `exclusiveFor` context when a quote provides it.
- Keep callback logic tiny and deterministic.
- Have a bridge-only fallback video before risking demo time.

This is the stronger product demo if it fills: the user asks for yield and actually receives a yield position.

### Path B - Bridge-Only Demo, Callback As Roadmap

Ship the already-working intent compiler and LI.FI settlement path. The compiled order moves USDC to the selected destination chain, and a follow-up UI action deposits into Aave.

This has lower protocol risk and is safer for a deadline, but the story is weaker because the "yield" action is not atomically fulfilled by the intent.

### Historical Recommendation

This recommendation was made before the raw callback fill test. It is superseded by the June 6 update above.

At that point, the proposed path was to proceed with Path A only if we kept Path B as a fallback. The first implementation slice was:

1. Add a minimal Base `AsshaiYieldReceiver`.
2. Add receiver-aware encoding with a conservative `outputBps`.
3. Add quote preflight and exclusive solver context where available.
4. Test with a tiny real order.

If the callback order does not move past `Signed` quickly, stop and use Path B for the hackathon demo.

## Final Recommendation

Proceed with the Composer-backed v1 path.

It is the best fit for the hackathon/product deadline because it has already produced reliable end-to-end yield execution. Asshai still remains an on-chain Intent Compiler: Somnia performs the trustless goal-to-plan translation, stores receipts, and emits a StandardOrder-shaped plan. LI.FI Composer is the execution backend for v1. `AsshaiYieldReceiver` and raw LI.FI Intents callbacks should remain as future/partner-solver research, not the primary demo path.
