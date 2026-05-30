import { createClient, RedisClientType } from "redis";

// KST 기준 날짜 키 생성 (예: "2026-05-19")
export function kstDate(d: Date = new Date()): string {
  const utc = d.getTime() + d.getTimezoneOffset() * 60_000;
  const kst = new Date(utc + 9 * 3600_000);
  return kst.toISOString().slice(0, 10);
}

async function withClient<T>(
  fn: (client: RedisClientType) => Promise<T>,
): Promise<T> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("Missing REDIS_URL");

  const client = createClient({ url, socket: { connectTimeout: 5000 } });
  // 에러 이벤트 캐치만 — throw 안 함 (operation 자체가 reject)
  client.on("error", () => {});

  await client.connect();
  try {
    return await fn(client as RedisClientType);
  } finally {
    try {
      await client.quit();
    } catch {
      // 무시
    }
  }
}

// === 신청 카운터 ===

const KEY_SUBMIT_TOTAL = "submit:total";
const KEY_SUBMIT_DAY = (date: string) => `submit:day:${date}`;
const KEY_SUBMIT_LIST = (date: string) => `submit:list:${date}`; // sorted set: score=timestamp, member=`${code}|${industry}`

export async function trackSubmission(meta: {
  code: string;
  industry: string;
  isCustom: boolean;
  shopName: string;
}): Promise<{ today: number; total: number }> {
  const date = kstDate();
  const ts = Date.now();
  const member = `${meta.code}|${meta.industry}|${meta.isCustom ? "custom" : "tpl"}|${meta.shopName.slice(0, 30)}`;

  return withClient(async (c) => {
    const multi = c.multi();
    multi.incr(KEY_SUBMIT_TOTAL);
    multi.incr(KEY_SUBMIT_DAY(date));
    // 90일 후 자동 만료
    multi.expire(KEY_SUBMIT_DAY(date), 90 * 86400);
    multi.zAdd(KEY_SUBMIT_LIST(date), { score: ts, value: member });
    multi.expire(KEY_SUBMIT_LIST(date), 90 * 86400);
    const results = await multi.exec();
    const total = Number(results?.[0] || 0);
    const today = Number(results?.[1] || 0);
    return { today, total };
  });
}

export async function getSubmissionStats(): Promise<{
  total: number;
  today: number;
  yesterday: number;
  thisWeek: number;
  todayList: Array<{ ts: number; code: string; industry: string; type: string; shop: string }>;
}> {
  const today = kstDate();
  const yesterday = kstDate(new Date(Date.now() - 86400_000));

  return withClient(async (c) => {
    const total = parseInt((await c.get(KEY_SUBMIT_TOTAL)) || "0", 10);
    const todayCount = parseInt((await c.get(KEY_SUBMIT_DAY(today))) || "0", 10);
    const yesterdayCount = parseInt(
      (await c.get(KEY_SUBMIT_DAY(yesterday))) || "0",
      10,
    );

    // 이번주 (지난 7일 KST)
    let thisWeek = 0;
    for (let i = 0; i < 7; i++) {
      const d = kstDate(new Date(Date.now() - i * 86400_000));
      thisWeek += parseInt((await c.get(KEY_SUBMIT_DAY(d))) || "0", 10);
    }

    // 오늘 리스트
    const items = await c.zRange(KEY_SUBMIT_LIST(today), 0, -1, {
      REV: true,
      BY: "SCORE",
    });
    const withScores = await c.zRangeWithScores(
      KEY_SUBMIT_LIST(today),
      0,
      -1,
      { REV: true },
    );
    const todayList = withScores.map((it) => {
      const [code, industry, type, shop] = String(it.value).split("|");
      return {
        ts: Number(it.score),
        code,
        industry,
        type,
        shop,
      };
    });

    return { total, today: todayCount, yesterday: yesterdayCount, thisWeek, todayList };
  });
}

// === Auto-reply 카운터 (모니터 cron에서 활용 가능) ===

const KEY_REPLY_DAY = (date: string) => `reply:day:${date}`;

export async function trackAutoReply(): Promise<number> {
  const date = kstDate();
  return withClient(async (c) => {
    const n = await c.incr(KEY_REPLY_DAY(date));
    await c.expire(KEY_REPLY_DAY(date), 90 * 86400);
    return n;
  });
}

export async function getReplyCount(date?: string): Promise<number> {
  const d = date || kstDate();
  return withClient(async (c) => {
    return parseInt((await c.get(KEY_REPLY_DAY(d))) || "0", 10);
  });
}

// === 자동 발행 카운터 ===

const KEY_PUBLISH_DAY = (date: string) => `publish:day:${date}`;
const KEY_PUBLISH_LIST = (date: string) => `publish:list:${date}`;

export async function trackPublish(meta: {
  slot: string;
  postId: string;
  permalink: string;
}): Promise<number> {
  const date = kstDate();
  const ts = Date.now();
  return withClient(async (c) => {
    const multi = c.multi();
    multi.incr(KEY_PUBLISH_DAY(date));
    multi.expire(KEY_PUBLISH_DAY(date), 90 * 86400);
    multi.zAdd(KEY_PUBLISH_LIST(date), {
      score: ts,
      value: `${meta.slot}|${meta.postId}|${meta.permalink}`,
    });
    multi.expire(KEY_PUBLISH_LIST(date), 90 * 86400);
    const r = await multi.exec();
    return Number(r?.[0] || 0);
  });
}

export async function getPublishCount(date?: string): Promise<number> {
  const d = date || kstDate();
  return withClient(async (c) => {
    return parseInt((await c.get(KEY_PUBLISH_DAY(d))) || "0", 10);
  });
}

// === 앱인토스 mock 검증 이벤트 트래킹 ===

const TRACK_EVENTS = [
  "session_start",
  "impression",
  "alert_click",
  "pin_click",
  "missed_view",
  "deeplink_open", // 푸시 deeplink 진입
] as const;
export type TrackEvent = (typeof TRACK_EVENTS)[number];

const KEY_TRACK_EVENT_DAY = (event: string, date: string) =>
  `track:event:${event}:${date}`;
const KEY_TRACK_VARIANT_DAY = (variant: string, event: string, date: string) =>
  `track:variant:${variant}:${event}:${date}`;
const KEY_TRACK_DWELL_DAY = (variant: string, date: string) =>
  `track:dwell:${variant}:${date}`; // sum of ms
const KEY_TRACK_DWELL_COUNT = (variant: string, date: string) =>
  `track:dwell:count:${variant}:${date}`;
const KEY_TRACK_SOURCE_DAY = (source: string, event: string, date: string) =>
  `track:source:${source}:${event}:${date}`;
const KEY_TRACK_CAMPAIGN_DAY = (campaignId: string, event: string, date: string) =>
  `track:campaign:${campaignId}:${event}:${date}`;

export async function trackEvent(meta: {
  event: TrackEvent;
  variant?: "A" | "B";
  ms?: number;
  source?: string; // "push_a", "push_b", "organic" 등
  campaignId?: string; // 푸시 캠페인 ID
}): Promise<void> {
  const date = kstDate();
  await withClient(async (c) => {
    const multi = c.multi();
    multi.incr(KEY_TRACK_EVENT_DAY(meta.event, date));
    multi.expire(KEY_TRACK_EVENT_DAY(meta.event, date), 90 * 86400);

    if (meta.variant) {
      multi.incr(KEY_TRACK_VARIANT_DAY(meta.variant, meta.event, date));
      multi.expire(
        KEY_TRACK_VARIANT_DAY(meta.variant, meta.event, date),
        90 * 86400,
      );
    }

    // source별 집계 (어디서 진입했는지 — push_a/push_b/organic)
    if (meta.source) {
      multi.incr(KEY_TRACK_SOURCE_DAY(meta.source, meta.event, date));
      multi.expire(
        KEY_TRACK_SOURCE_DAY(meta.source, meta.event, date),
        90 * 86400,
      );
    }

    // campaignId별 집계 (콘솔 발송 캠페인 ID 매칭용)
    if (meta.campaignId) {
      multi.incr(
        KEY_TRACK_CAMPAIGN_DAY(meta.campaignId, meta.event, date),
      );
      multi.expire(
        KEY_TRACK_CAMPAIGN_DAY(meta.campaignId, meta.event, date),
        90 * 86400,
      );
    }

    // dwell time 누적 (missed_view 이벤트일 때만)
    if (meta.event === "missed_view" && meta.ms && meta.variant) {
      multi.incrBy(KEY_TRACK_DWELL_DAY(meta.variant, date), meta.ms);
      multi.expire(KEY_TRACK_DWELL_DAY(meta.variant, date), 90 * 86400);
      multi.incr(KEY_TRACK_DWELL_COUNT(meta.variant, date));
      multi.expire(KEY_TRACK_DWELL_COUNT(meta.variant, date), 90 * 86400);
    }

    await multi.exec();
  });
}

export async function getTrackStats(date?: string): Promise<{
  date: string;
  byEvent: Record<string, number>;
  byVariant: { A: Record<string, number>; B: Record<string, number> };
  avgDwellMs: { A: number; B: number };
  ctr: { A: number; B: number; overall: number };
}> {
  const d = date || kstDate();
  return withClient(async (c) => {
    const byEvent: Record<string, number> = {};
    const byVariant = {
      A: {} as Record<string, number>,
      B: {} as Record<string, number>,
    };

    for (const ev of TRACK_EVENTS) {
      byEvent[ev] = parseInt(
        (await c.get(KEY_TRACK_EVENT_DAY(ev, d))) || "0",
        10,
      );
      for (const v of ["A", "B"] as const) {
        byVariant[v][ev] = parseInt(
          (await c.get(KEY_TRACK_VARIANT_DAY(v, ev, d))) || "0",
          10,
        );
      }
    }

    // dwell avg
    const dwellAvg = { A: 0, B: 0 };
    for (const v of ["A", "B"] as const) {
      const sum = parseInt((await c.get(KEY_TRACK_DWELL_DAY(v, d))) || "0", 10);
      const cnt = parseInt(
        (await c.get(KEY_TRACK_DWELL_COUNT(v, d))) || "0",
        10,
      );
      dwellAvg[v] = cnt > 0 ? Math.round(sum / cnt) : 0;
    }

    // CTR = alert_click / impression
    const ctr = {
      A:
        byVariant.A.impression > 0
          ? byVariant.A.alert_click / byVariant.A.impression
          : 0,
      B:
        byVariant.B.impression > 0
          ? byVariant.B.alert_click / byVariant.B.impression
          : 0,
      overall:
        byEvent.impression > 0 ? byEvent.alert_click / byEvent.impression : 0,
    };

    return { date: d, byEvent, byVariant, avgDwellMs: dwellAvg, ctr };
  });
}
