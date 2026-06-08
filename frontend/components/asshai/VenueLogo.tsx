import Image from "next/image";

const venueLogoUrls: Record<string, string> = {
  "aave-v3-usdc-base": "https://coin-images.coingecko.com/coins/images/12645/small/aave-token-round.png",
  "compound-v3-usdc-base": "https://coin-images.coingecko.com/coins/images/10775/small/COMP.png",
  "morpho-spark-usdc-base": "https://coin-images.coingecko.com/coins/images/29837/small/Morpho-token-icon.png",
  "morpho-moonwell-flagship-usdc-base": "https://coin-images.coingecko.com/coins/images/26133/small/WELL.png",
  "fluid-usdc-base": "https://coin-images.coingecko.com/coins/images/28471/small/fUSDC-200x200.png",
  "steakhouse-prime-usdc-base": "https://coin-images.coingecko.com/coins/images/71229/small/steakusdc.png",
  usdc: "https://coin-images.coingecko.com/coins/images/6319/small/usdc.png",
};

export function VenueLogo({ poolId, label, size = 34 }: { poolId: string; label?: string; size?: number }) {
  const src = venueLogoUrls[poolId] ?? venueLogoUrls.usdc;

  return (
    <span className="venue-logo" style={{ width: size, height: size }}>
      <Image src={src} alt={label ?? poolId} width={size} height={size} unoptimized />
    </span>
  );
}
