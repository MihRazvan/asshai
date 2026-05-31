const LIFI_ORDER_BASE_URL = "https://order.li.fi";

export async function getSupportedIntentChains() {
  const response = await fetch(`${LIFI_ORDER_BASE_URL}/chains/supported`);

  if (!response.ok) {
    throw new Error(`LI.FI supported chains request failed: ${response.status}`);
  }

  return response.json();
}

export async function getIntentRoutes() {
  const response = await fetch(`${LIFI_ORDER_BASE_URL}/routes`);

  if (!response.ok) {
    throw new Error(`LI.FI routes request failed: ${response.status}`);
  }

  return response.json();
}
