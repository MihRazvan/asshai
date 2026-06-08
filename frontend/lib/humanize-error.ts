export function humanizeError(error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Something went wrong while executing this intent.";

  const message = raw.replace(/\s+/g, " ").trim();
  const lower = message.toLowerCase();

  if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected the request")) {
    return "You rejected the wallet request. No funds moved.";
  }

  if (lower.includes("insufficient funds")) {
    return "Your wallet does not have enough gas or USDC for this execution.";
  }

  if (lower.includes("not found on chain") || lower.includes("transaction hash")) {
    return "The route was submitted. LI.FI is still indexing the transaction; check again in a moment.";
  }

  if (lower.includes("quote")) {
    return "LI.FI could not quote this route right now. Try again with a fresh compilation.";
  }

  if (lower.includes("switch chain") || lower.includes("chain")) {
    return "Switch to Arbitrum and try execution again.";
  }

  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}
