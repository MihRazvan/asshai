import { NextRequest, NextResponse } from "next/server";

const lifiOrderBaseUrl = "https://order.li.fi";

export async function GET(request: NextRequest) {
  const catalystOrderId = request.nextUrl.searchParams.get("catalystOrderId");
  const endpoint = catalystOrderId
    ? `/orders/status?catalystOrderId=${encodeURIComponent(catalystOrderId)}`
    : "/chains/supported";

  const response = await fetch(`${lifiOrderBaseUrl}${endpoint}`);
  const body = await response.json();

  return NextResponse.json(body, { status: response.status });
}

export async function POST(request: NextRequest) {
  const response = await fetch(`${lifiOrderBaseUrl}/orders/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(await request.json()),
  });
  const body = await response.json();

  return NextResponse.json(body, { status: response.status });
}
