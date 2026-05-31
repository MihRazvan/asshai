# Asshai

On-chain intent compiler for cross-chain stablecoin yield on Somnia.

This repository follows `BUILD_PLAN.md` as the source of truth.

## Somnia testnet contracts

- GoalRegistry: `0x3d37cDE79CCcA78334972e6bf1d351f607aF2ca6`
- CompilerEngine: `0x2296b4607ADe363c0777fF422709a53c5a78eBf9`
- ReceiptLog: `0xCaf26d33E74cc952284AA3aA71a67DBe69deEFC1`
- IntentStore: `0x0D0891Ae2733E3D8644D1044F497Af4bb63404ea`
- AddressRegistry: `0xD37ad369bD8264f0ce3d970686b716663243D0E2`
- StandardOrderEncoder: `0x0E72AE42040d0FD7eeec544fb1BC29e0cb76fdEf`

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
Current testnet compiler source: `https://asshai.vercel.app/api/yields` with
selector `payload`.
