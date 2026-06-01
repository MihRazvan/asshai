import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const curatedPools = [
  {
    poolId: "aave-v3-usdc-base",
    llamaPoolId: "7e0661bf-8cf3-45e6-9424-31916d4c7b84",
    chainName: "base",
    project: "aave-v3",
    symbol: "USDC",
    lockup: "none",
  },
  {
    poolId: "aave-v3-usdc-mainnet",
    llamaPoolId: "aa70268e-4b52-42bf-a116-608b370f9501",
    chainName: "ethereum",
    project: "aave-v3",
    symbol: "USDC",
    lockup: "none",
  },
  {
    poolId: "aave-v3-usdc-arb",
    llamaPoolId: "d9fa8e14-0447-4207-9ae8-7810199dfa1f",
    chainName: "arbitrum",
    project: "aave-v3",
    symbol: "USDC",
    lockup: "none",
  },
];

type DefiLlamaPool = {
  pool: string;
  apy?: number;
  tvlUsd?: number;
};

export async function GET() {
  const response = await fetch("https://yields.llama.fi/pools", {
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `DefiLlama request failed: ${response.status}` },
      { status: 502 },
    );
  }

  const body = (await response.json()) as { data?: DefiLlamaPool[] };
  const poolsById = new Map((body.data ?? []).map((pool) => [pool.pool, pool]));
  const rows = curatedPools.map((pool) => {
    const live = poolsById.get(pool.llamaPoolId);

    return [
      `poolId=${pool.poolId}`,
      `llamaPoolId=${pool.llamaPoolId}`,
      `chainName=${pool.chainName}`,
      `project=${pool.project}`,
      `symbol=${pool.symbol}`,
      `apy=${live?.apy ?? "unknown"}`,
      `tvlUsd=${live?.tvlUsd ?? "unknown"}`,
      `lockup=${pool.lockup}`,
    ].join(",");
  });

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    payload: rows.join("|"),
  });
}
