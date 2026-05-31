import { NextRequest, NextResponse } from "next/server";
import { trackEvent, getTrackStats, resetTrackData } from "@/lib/kv";

// CORS: 앱인토스 mock 검증용 — 모든 출처 허용 (이벤트만 받음)
function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// DELETE /api/track[?date=YYYY-MM-DD] — 트래커 데이터 초기화
// Authorization: Bearer {CRON_SECRET} 필요
export async function DELETE(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: corsHeaders() },
    );
  }
  const date = req.nextUrl.searchParams.get("date") || undefined;
  try {
    const r = await resetTrackData(date);
    return NextResponse.json(
      { ok: true, deleted: r.deleted, scope: date || "all" },
      { headers: corsHeaders() },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "reset_failed", detail: msg },
      { status: 500, headers: corsHeaders() },
    );
  }
}

const VALID_EVENTS = new Set([
  "session_start",
  "impression",
  "alert_click",
  "pin_click",
  "missed_view",
  "deeplink_open",
]);

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const event = typeof body.event === "string" ? body.event : "";
  if (!VALID_EVENTS.has(event)) {
    return NextResponse.json(
      { error: "invalid_event", got: event },
      { status: 400, headers: corsHeaders() },
    );
  }

  const variant =
    body.variant === "A" || body.variant === "B"
      ? (body.variant as "A" | "B")
      : undefined;
  const ms = typeof body.ms === "number" ? body.ms : undefined;
  const source = typeof body.source === "string" ? body.source : undefined;
  const campaignId =
    typeof body.campaignId === "string" ? body.campaignId : undefined;

  try {
    await trackEvent({
      event: event as
        | "session_start"
        | "impression"
        | "alert_click"
        | "pin_click"
        | "missed_view"
        | "deeplink_open",
      variant,
      ms,
      source,
      campaignId,
    });
  } catch (e) {
    // KV 실패해도 클라이언트에 200 — 검증 데이터 누락은 알림에만
    console.error("trackEvent failed:", e);
  }

  return NextResponse.json({ ok: true }, { headers: corsHeaders() });
}

// GET /api/track?stats=1&date=YYYY-MM-DD — 대시보드용
export async function GET(req: NextRequest) {
  const stats = req.nextUrl.searchParams.get("stats");
  if (!stats) {
    return NextResponse.json(
      { hint: "use POST to submit event; GET?stats=1 for daily stats" },
      { headers: corsHeaders() },
    );
  }
  const date = req.nextUrl.searchParams.get("date") || undefined;
  try {
    const s = await getTrackStats(date);
    return NextResponse.json(s, { headers: corsHeaders() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "stats_failed", detail: msg },
      { status: 500, headers: corsHeaders() },
    );
  }
}
