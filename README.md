# Asshai

On-chain intent compiler for cross-chain stablecoin yield on Somnia.

This repository follows `BUILD_PLAN.md` as the source of truth.

## Somnia testnet contracts

- GoalRegistry: `0x06A361DfDD8d63AcCb1AEf1C02e7C31C50e97af1`
- CompilerEngine: `0xa6B3EF98fC847ba6146Bf681846Fe5c3215Dc711`
- ReceiptLog: `0x29452CAf63505fb2B76D9b819905143a65910C76`
- IntentStore: `0x5bE497c2Bb2d5b6aa0f67F7DE9ACD912d84EE66a`
- AddressRegistry: `0x935e79EE5F5217DFe5E1A80c5EB0091517FAEb9D`
- StandardOrderEncoder: `0x99429Db645D004194b000A2BD1384ffee6BB7E01`

## Smoke test

The canonical BTC price oracle smoke contract is deployed at
`0x38ea72f87b8473e9c06690ecbc788fea2fcdba8c`.

The LLM inference smoke contract is deployed at
`0xeb1ff73d01e3cd6ad68a36a7de3b2b0292c7a9da`.

## Compiler data source

`CompilerEngine` reads a compact rates payload from `COMPILER_RATES_URL` using
the JSON API agent selector in `COMPILER_RATES_SELECTOR`. The frontend exposes
the intended normalizer at `/api/yields`; point `COMPILER_RATES_URL` at the
public deployed app URL before deploying a compiler intended to run live.
