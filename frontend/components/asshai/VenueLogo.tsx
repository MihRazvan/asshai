import Image from "next/image";

const venueLogoUrls: Record<string, string> = {
  "aave-v3-usdc-base": "https://coin-images.coingecko.com/coins/images/12645/small/aave-token-round.png",
  "compound-v3-usdc-base": "https://coin-images.coingecko.com/coins/images/10775/small/COMP.png",
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
