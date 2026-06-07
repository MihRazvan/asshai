import Link from "next/link";

function StarMark() {
  return (
    <svg className="wordmark-star" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 1.5 18.2 13.8 30.5 16 18.2 18.2 16 30.5 13.8 18.2 1.5 16 13.8 13.8 16 1.5Z" />
      <path d="M16 8.5 17.1 14.9 23.5 16 17.1 17.1 16 23.5 14.9 17.1 8.5 16 14.9 14.9 16 8.5Z" />
    </svg>
  );
}

export function AsshaiWordmark() {
  return (
    <Link className="wordmark" href="/" aria-label="Asshai home">
      <StarMark />
      <span>ASSHAI</span>
    </Link>
  );
}
