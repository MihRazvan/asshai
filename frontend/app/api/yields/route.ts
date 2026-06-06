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
    venueType: "blue-chip lending",
    riskTier: "lowest",
    riskNotes: "Large established lending market; lower APY but strongest safety profile in v1.",
    executionVerified: "live",
    executionPath: "direct LI.FI quote into Base aUSDC",
  },
  {
    poolId: "compound-v3-usdc-base",
    llamaPoolId: "0c8567f8-ba5b-41ad-80de-00a71895eb19",
    chainName: "base",
    project: "compound-v3",
    symbol: "USDC",
    lockup: "none",
    venueType: "blue-chip lending",
    riskTier: "low",
    riskNotes: "Established lending market; higher current APY in v1 but contract-call execution path.",
    executionVerified: "live",
    executionPath: "LI.FI contract-call quote into Compound V3 Comet.supply",
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
      `venueType=${pool.venueType}`,
      `riskTier=${pool.riskTier}`,
      `riskNotes=${pool.riskNotes}`,
      `executionVerified=${pool.executionVerified}`,
      `executionPath=${pool.executionPath}`,
    ].join(",");
  });

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    payload: rows.join("|"),
  });
}
