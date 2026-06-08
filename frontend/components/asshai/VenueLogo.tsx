import Image from "next/image";

const venueLogoUrls: Record<string, string> = {
  "aave-v3-usdc-base": "https://coin-images.coingecko.com/coins/images/12645/small/aave-token-round.png",
  "compound-v3-usdc-base": "https://coin-images.coingecko.com/coins/images/10775/small/COMP.png",
  usdc: "https://coin-images.coingecko.com/coins/images/6319/small/usdc.png",
};

const venueFallbacks: Record<string, string> = {
  "morpho-spark-usdc-base": "SP",
  "morpho-moonwell-flagship-usdc-base": "MW",
  "fluid-usdc-base": "FL",
  "steakhouse-prime-usdc-base": "ST",
};

export function VenueLogo({ poolId, label, size = 34 }: { poolId: string; label?: string; size?: number }) {
  const src = venueLogoUrls[poolId];

  if (!src && venueFallbacks[poolId]) {
    return (
      <span
        className={`venue-logo venue-logo-fallback venue-logo-${poolId}`}
        style={{ width: size, height: size }}
        aria-label={label ?? poolId}
      >
        {venueFallbacks[poolId]}
      </span>
    );
  }

  return (
    <span className="venue-logo" style={{ width: size, height: size }}>
      <Image src={src ?? venueLogoUrls.usdc} alt={label ?? poolId} width={size} height={size} unoptimized />
    </span>
  );
}
