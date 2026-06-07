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
  {
    poolId: "morpho-spark-usdc-base",
    llamaPoolId: "a5fab52f-73fa-4f44-9c09-9af1eb20996c",
    chainName: "base",
    project: "morpho-blue",
    symbol: "SPARKUSDC",
    lockup: "none",
    venueType: "managed lending vault",
    riskTier: "low",
    riskNotes: "Spark-aligned Morpho USDC vault; single-asset exposure with curator and vault strategy risk.",
    executionVerified: "quote-verified",
    executionPath: "direct LI.FI quote into Spark USDC Vault",
  },
  {
    poolId: "morpho-moonwell-flagship-usdc-base",
    llamaPoolId: "b39b492a-0a64-4926-8598-d5acf05d62b5",
    chainName: "base",
    project: "morpho-blue",
    symbol: "MWUSDC",
    lockup: "none",
    venueType: "managed lending vault",
    riskTier: "medium-low",
    riskNotes: "Moonwell Flagship USDC vault on Base; higher current APY with curator and strategy risk.",
    executionVerified: "quote-verified",
    executionPath: "direct LI.FI quote into Moonwell Flagship USDC Vault",
  },
  {
    poolId: "fluid-usdc-base",
    llamaPoolId: "7372edda-f07f-4598-83e5-4edec48c4039",
    chainName: "base",
    project: "fluid-lending",
    symbol: "USDC",
    lockup: "none",
    venueType: "lending",
    riskTier: "medium-low",
    riskNotes: "Fluid USDC lending route; strong current APY, but less conservative than Aave in v1 policy.",
    executionVerified: "quote-verified",
    executionPath: "direct LI.FI quote into Fluid USDC",
  },
  {
    poolId: "steakhouse-prime-usdc-base",
    llamaPoolId: "ba68527f-8ec2-4c55-827a-8f4673ae047c",
    chainName: "base",
    project: "morpho-blue",
    symbol: "STEAKUSDC",
    lockup: "none",
    venueType: "managed lending vault",
    riskTier: "medium-low",
    riskNotes: "Large Steakhouse-managed Morpho USDC vault; deep TVL with curator and strategy risk.",
    executionVerified: "quote-verified",
    executionPath: "direct LI.FI quote into Steakhouse Prime USDC Vault",
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
