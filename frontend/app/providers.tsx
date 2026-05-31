"use client";

import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { arbitrum, base, mainnet, optimism } from "wagmi/chains";
import { somniaTestnet } from "@/lib/somnia";

const config = getDefaultConfig({
  appName: "Asshai",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "asshai-dev",
  chains: [somniaTestnet, mainnet, arbitrum, base, optimism],
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
