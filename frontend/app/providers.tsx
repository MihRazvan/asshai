"use client";

import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { http, WagmiProvider } from "wagmi";
import { arbitrum, base, mainnet, optimism } from "wagmi/chains";
import { somniaTestnet } from "@/lib/somnia";

const config = getDefaultConfig({
  appName: "Asshai",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "asshai-dev",
  chains: [somniaTestnet, mainnet, arbitrum, base, optimism],
  transports: {
    [somniaTestnet.id]: http(process.env.NEXT_PUBLIC_SOMNIA_TESTNET_RPC || "https://api.infra.testnet.somnia.network/"),
    [mainnet.id]: http("https://ethereum-rpc.publicnode.com"),
    [arbitrum.id]: http("https://arbitrum-one-rpc.publicnode.com"),
    [base.id]: http("https://base-rpc.publicnode.com"),
    [optimism.id]: http("https://optimism-rpc.publicnode.com"),
  },
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
