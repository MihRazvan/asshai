# Asshai Venue Expansion Research

Last updated: 2026-06-07

## Short Answer

The easiest next expansion is **direct vault-token execution through LI.FI Composer**, not more custom contract-call logic.

Recommended next venues:

1. **Morpho Spark USDC Vault on Base** (`sparkUSDC`)
2. **Morpho / Moonwell Flagship USDC Vault on Base** (`mwUSDC`)
3. **Fluid USDC on Base** (`fUSDC`)
4. Optional later: **Steakhouse Prime USDC** (`steakUSDC`)

These are easier than LPs, Aerodrome, Avantis, or arbitrary DeFi adapters because LI.FI can already quote them as destination `toToken` vault tokens. Asshai can keep using the same execution pattern as Aave: quote from Arbitrum USDC into the destination position token, then execute the returned LI.FI route.

## Why This Is The Right Expansion Class

LI.FI Composer docs state that Composer can turn an intent such as "deposit USDC into Morpho on Base" into an executable transaction. Composer routes can be requested through the same `/quote` endpoint by setting `toToken` to a supported vault token address. LI.FI Earn also exposes vault discovery/portfolio metadata and says Composer handles one-click deposits, including cross-chain any-token-to-vault execution.

This aligns perfectly with Asshai:

- Somnia still decides which venue is right.
- Solidity still validates the chosen `poolId`.
- LI.FI still executes the cross-chain route.
- The frontend gets a normal transaction request.
- No new receiver contract is needed.
- No LLM-generated calldata is introduced.

## Live Probes Run

All quote probes used:

- Source: Arbitrum USDC
- Destination: Base
- Amount: `0.2 USDC`
- User: `0x7eBBD35e6781AB77B059F0262E9Abe2685152Fff`
- Endpoint: `GET https://li.quest/v1/quote`

These probes test route existence, not final economics. Tiny amounts exaggerate bridge/route fee effects.

| Candidate | Address | On-chain Shape | LI.FI Quote Result | Notes |
|---|---:|---|---|---|
| Aave V3 aBasUSDC | `0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB` | ERC-20 aToken, 6 decimals | Success, `relaydepository` | Already live |
| Compound cUSDCv3 | `0xb125E6687d4313864e53df431d5425969c15Eb2F` | Comet market token, 6 decimals | Direct quote failed | Already live via contract-call quote |
| Spark USDC Vault | `0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A` | ERC-4626-like vault, `asset() = Base USDC`, 18 decimals | Success, `relaydepository` | Best first add |
| Moonwell Flagship USDC Vault | `0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca` | ERC-4626-like vault, `asset() = Base USDC`, 18 decimals | Success, `stargateV2 -> composer` | Highest product impact |
| Steakhouse Prime USDC | `0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9` | ERC-4626-like vault, `asset() = Base USDC`, 18 decimals | Success, `stargateV2 -> composer` | Good but curator risk needs explanation |
| Gauntlet USDC Core | `0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12` | ERC-4626-like vault, `asset() = Base USDC`, 18 decimals | Success, `stargateV2 -> composer` | Route works; TVL/APY mapping needs more verification |
| Gauntlet USDC Frontier | `0x1deEfABEe758AAbdC29a542B24ca3b75aFD56765` | ERC-4626-like vault, `asset() = Base USDC`, 18 decimals | Success, `stargateV2 -> composer` | Higher risk positioning |
| Fluid fUSDC | `0xf42f5795D9ac7e9D757dB633D693cD548Cfd9169` | ERC-4626-like token, `asset() = Base USDC`, 6 decimals | Success, `stargateV2 -> composer` | Strong second-wave candidate |
| Moonwell mUSDC market token | `0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22` | mToken market token, 8 decimals | Success, `relaydepository` | Works, but protocol-specific market-token semantics |

## DefiLlama Candidate Surface

Live `https://yields.llama.fi/pools` filtering for Base + USDC-like pools surfaced these major classes:

### Good Candidates

- `morpho-blue` vaults: large TVL, single-asset stablecoin exposure, no IL.
- `aave-v3`: current base venue, lower APY, strongest "safety" narrative.
- `compound-v3`: current higher-APY blue-chip venue, requires contract-call route.
- `fluid-lending`: single-asset USDC, no IL, direct Composer quote worked.
- `moonwell` / Morpho Moonwell vaults: direct Composer quote worked, strong Base-native brand.

### Defer For Now

- `aerodrome-v1` / `aerodrome-slipstream`: often higher APY, but LP exposure or reward-heavy APY. Good future "advanced yield" bucket, not v1 low-risk compiler.
- `uniswap-v3/v4` WETH-USDC or cbBTC-USDC: high APY but clear IL/non-stable exposure.
- `avantis`: attractive APY but different risk model; needs separate protocol review before putting in a "safe stablecoin yield" compiler.
- `extra-finance-leverage-farming`: leverage/farming semantics conflict with current bounded-authority pitch.
- Smaller vaults/long-tail symbols: add only after we have a registry/risk review workflow.

## Recommended Add Order

### 1. Add Spark USDC Vault

Why:

- LI.FI documentation uses Morpho-on-Base vault deposits as the canonical Composer-style example.
- On-chain `asset()` returns Base USDC.
- Direct LI.FI quote succeeds.
- It adds a third venue without new execution code.
- It gives the LLM a "managed Morpho vault" option distinct from Aave and Compound.

Proposed pool ID:

```text
morpho-spark-usdc-base
```

Suggested risk tier:

```text
low
```

Suggested execution path:

```text
direct LI.FI quote into Spark USDC Vault
```

### 2. Add Moonwell Flagship USDC Vault

Why:

- LI.FI quote succeeds.
- Moonwell docs explicitly describe Moonwell as a Base/Optimism/Moonbeam/Moonriver lending protocol and say users receive mTokens/yield-bearing position tokens when supplying.
- Moonwell docs also mention the Moonwell Flagship USDC Vault is available inside Jumper Earn, which is useful because Jumper is LI.FI's own user-facing product.
- APY/TVL are currently more interesting than Aave/Compound, which helps the demo.

Proposed pool ID:

```text
morpho-moonwell-flagship-usdc-base
```

Suggested risk tier:

```text
medium-low
```

Suggested execution path:

```text
LI.FI Composer quote into Moonwell Flagship USDC Vault
```

### 3. Add Fluid USDC

Why:

- Direct LI.FI quote succeeds.
- `asset()` returns Base USDC.
- DefiLlama shows single-asset stablecoin exposure and no IL.
- LI.FI changelog/docs indicate Fluid is supported in Composer.

Proposed pool ID:

```text
fluid-usdc-base
```

Suggested risk tier:

```text
medium-low
```

### 4. Add Steakhouse Prime USDC Later

Why:

- Direct LI.FI quote succeeds.
- Very large TVL.
- Good recognizability in Morpho vault ecosystem.

Why not first:

- Curator/strategy risk needs clearer UI language.
- Multiple Steakhouse USDC vaults appear in DefiLlama; we need exact one-to-one pool ID mapping before presenting it to users.

## Architecture Implications

Adding new venues is not only frontend metadata.

Current blockers:

- `CompilerEngineV3` hardcodes exactly two supported pool IDs.
- The LLM prompt says supported pools are exactly Aave and Compound.
- `_isSupportedPool()` rejects everything else.
- `/api/yields` only returns two curated rows.
- `goal-policy.json` only lists two supported venues.
- `AddressRegistry` needs new venue entries.

So the next backend slice is **CompilerEngineV4 + registry seed update**, not a frontend-only change.

## The StandardOrder-Shaped Artifact Issue

For Aave and Compound, our display/execution math is easy because the position token decimals are 6 or the execution path uses Base USDC delivery into a contract call.

For many vault tokens, especially Morpho vaults, the position token has 18 decimals while source USDC has 6 decimals. LI.FI quote returns the real vault-share amount, but Somnia's `StandardOrderEncoder` currently computes output amount as:

```solidity
outputAmount = sourceAmount * outputBps / 10_000
```

That is fine as a conservative USDC-denominated planning amount, but not a precise vault-share amount for raw ERC-7683 execution.

Recommendation:

- Keep using LI.FI Composer for actual execution.
- In the receipt UI, display the encoded output as "planned source amount" and the LI.FI quote/final status as the actual received vault token amount.
- For `CompilerEngineV4`, add metadata such as `positionTokenDecimals` and `executionMode`.
- Do not claim raw LI.FI Intents are ready for 18-decimal vault-token direct outputs until the encoder can represent output token units correctly or quote snapshots are incorporated.

## Implementation Plan

### Slice A - Data/Policy Only

- Add Spark and Moonwell Flagship to `goal-policy.json`.
- Add both to `/api/yields` curated pool data.
- Add real logos in `VenueLogo`.
- Add route type metadata:
  - `direct-vault-token`
  - `direct-receipt-token`
  - `contract-call`

### Slice B - Contracts

- Deploy `CompilerEngineV4`.
- Update the prompt supported pool list.
- Update `_isSupportedPool()` for the new pool IDs.
- Seed `AddressRegistry` with new venue configs.
- Consider adding token decimals / execution mode to registry or a parallel frontend policy file.

### Slice C - Frontend Execution

- For direct vault-token routes, use the same flow as Aave:
  - `fromAmount = inputAmount`
  - `toToken = finalOutputToken(output)`
  - no custom contract call
- For contract-call routes, keep the existing Compound path.
- Update receipt wording:
  - "planned amount" from Somnia
  - "quoted/final received amount" from LI.FI

### Slice D - Live Tests

For each new venue:

1. Quote-only test with `0.2 USDC`.
2. Compile a goal that should select it.
3. Execute with `0.2 USDC`.
4. Confirm LI.FI status reaches `DONE / COMPLETED`.
5. Confirm destination position token balance increases.

## Decision

The best next product step is:

```text
Add Spark USDC Vault and Moonwell Flagship USDC Vault as direct Composer-supported venues.
```

This gives the compiler a more interesting venue universe without blowing up execution complexity. It also lets the UI show richer reasoning:

- Aave: safest/lowest-risk blue-chip lending.
- Compound: blue-chip lending, higher APY than Aave.
- Spark/Morpho: managed vault, moderate risk, potentially better yield.
- Moonwell Flagship: Base-native yield vault, higher product contrast.

That is enough to make user goals meaningfully fuzzy:

- "safest" can choose Aave.
- "max yield but still established" can choose Moonwell/Spark/Compound depending live APY.
- "avoid vault managers" can choose Aave/Compound.
- "Base-native yield" can choose Moonwell.
- "Morpho vaults are okay" can choose Spark/Moonwell/Steakhouse.

## Sources

- LI.FI Composer docs: https://docs.li.fi/composer/how-it-works
- LI.FI Earn overview: https://docs.li.fi/earn/overview
- LI.FI quote API: https://li.quest/v1/quote
- DefiLlama yields API: https://yields.llama.fi/pools
- Morpho docs: https://docs.morpho.org/
- Moonwell docs: https://docs.moonwell.fi/moonwell
- Base token verification via public RPC: `https://base-rpc.publicnode.com`
