const LIFI_BASE_URL = "https://li.quest/v1";

export async function getLifiQuote(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  const response = await fetch(`${LIFI_BASE_URL}/quote?${search.toString()}`);

  if (!response.ok) {
    throw new Error(`LI.FI quote failed: ${response.status}`);
  }

  return response.json();
}

