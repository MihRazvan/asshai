import { NextRequest, NextResponse } from "next/server";
import { classifyGoalSupport } from "@/lib/goal-support";

export function GET(request: NextRequest) {
  const goal = request.nextUrl.searchParams.get("goal") ?? "";
  return NextResponse.json(classifyGoalSupport(goal));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json(classifyGoalSupport(String(body.goal ?? "")));
}
