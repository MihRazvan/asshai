"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet } from "lucide-react";
import { AsshaiWordmark } from "./AsshaiWordmark";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AsshaiHeader() {
  return (
    <header className="site-header">
      <AsshaiWordmark />
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
            </button>
          );
        }}
      </ConnectButton.Custom>
    </header>
  );
}
