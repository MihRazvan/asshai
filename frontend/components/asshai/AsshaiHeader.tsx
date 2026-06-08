"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown, History, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { AsshaiWordmark } from "./AsshaiWordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AsshaiHeader() {
  const router = useRouter();

  return (
    <header className="relative z-20 mx-auto flex w-full max-w-[88rem] items-center justify-between px-5 py-5 lg:px-8">
      <AsshaiWordmark />
      <DropdownMenu>
        <DropdownMenuTrigger className="hidden items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.035] px-4 py-2 font-mono text-xs uppercase tracking-[0.22em] text-white/70 outline-none transition-colors hover:border-white/[0.22] hover:text-white md:inline-flex">
          Intent compiler
          <ChevronDown size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          className="border-white/[0.12] bg-[#080a0a]/95 p-1.5 text-white shadow-2xl backdrop-blur-xl"
        >
          <DropdownMenuItem
            className="gap-2 rounded-lg px-3 py-2 text-white/78 focus:bg-white/[0.06] focus:text-white"
            onClick={() => router.push("/")}
          >
            Intent compiler
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 rounded-lg px-3 py-2 text-white/78 focus:bg-white/[0.06] focus:text-white"
            onClick={() => router.push("/#history")}
          >
            <History size={15} className="text-white/52" />
            History
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConnectButton.Custom>
        {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
          const ready = mounted;
          const connected = ready && account && chain;

          if (!connected) {
            return (
              <button className="wallet-pill" type="button" onClick={openConnectModal}>
                <Wallet size={17} />
                Connect wallet
              </button>
            );
          }

          if (chain.unsupported) {
            return (
              <button className="wallet-pill wallet-pill-warning" type="button" onClick={openChainModal}>
                Wrong network
              </button>
            );
          }

          return (
            <button className="wallet-pill" type="button" onClick={openAccountModal}>
              <Wallet size={17} />
              {shortAddress(account.address)}
              <span className="wallet-status-dot" />
              <ChevronDown size={14} />
            </button>
          );
        }}
      </ConnectButton.Custom>
    </header>
  );
}
