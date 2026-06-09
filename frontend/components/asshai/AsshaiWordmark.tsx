import Link from "next/link";

export function AsshaiWordmark() {
  return (
    <Link className="wordmark" href="/" aria-label="Asshai home">
      <img src="/asshai_logo-removebg-preview.png" alt="" aria-hidden="true" />
      <span>ASSHAI</span>
    </Link>
  );
}
