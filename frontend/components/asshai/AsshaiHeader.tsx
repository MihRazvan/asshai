"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { BookOpen, ChevronDown, Clock3, FileText, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AsshaiWordmark } from "./AsshaiWordmark";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const navItems = [
  { href: "/", label: "Intent", Icon: FileText },
  { href: "/history", label: "History", Icon: Clock3 },
  { href: "/how-it-works", label: "How it works", Icon: BookOpen },
];

export function AsshaiHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <AsshaiWordmark />
      <nav className="side-nav" aria-label="Primary">
        {navItems.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link className="side-nav-item" data-active={active ? "true" : undefined} href={href} key={href}>
              <Icon size={15} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
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
