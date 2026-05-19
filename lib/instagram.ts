import { createClient } from "redis";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export type InstagramProfile = {
  handle: string;
  displayTitle: string; // og:title raw text
  name: string; // 핸들 앞 부분 추출
  bio: string; // og:description 또는 추출
  followers: number | null;
  following: number | null;
  posts: number | null;
  profilePicUrl: string | null;
  fetchedAt: number;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function extractOg(html: string, prop: string): string | null {
  const re = new RegExp(`<meta\\s+property="og:${prop}"\\s+content="([^"]*)"`, "i");
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : null;
}

function parseStats(desc: string): {
  followers: number | null;
  following: number | null;
  posts: number | null;
} {
  // "418 Followers, 1,107 Following, 298 Posts - ..."
  const followers = desc.match(/([\d,]+)\s*Followers?/i);
  const following = desc.match(/([\d,]+)\s*Following/i);
  const posts = desc.match(/([\d,]+)\s*Posts?/i);
  const parse = (m: RegExpMatchArray | null) =>
    m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
  return {
    followers: parse(followers),
    following: parse(following),
    posts: parse(posts),
  };
}

async function fetchHtml(handle: string): Promise<string | null> {
  try {
    const url = `https://www.instagram.com/${encodeURIComponent(handle)}/`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      cache: "no-store",
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

function parseProfile(html: string, handle: string): InstagramProfile {
  const title = extractOg(html, "title") || "";
  const desc = extractOg(html, "description") || "";
  const image = extractOg(html, "image");
  const stats = parseStats(desc);

  // "가게명 (@handle) • Instagram photos and videos"
  const nameMatch = title.match(/^(.+?)\s*\(@/);
  const name = nameMatch ? nameMatch[1].trim() : handle;

  return {
    handle,
    displayTitle: title,
    name,
    bio: desc.replace(/^[\d,]+\s*Followers?,.*?-\s*/i, "").trim(), // strip stats prefix
    ...stats,
    profilePicUrl: image,
    fetchedAt: Date.now(),
  };
}

const CACHE_KEY = (h: string) => `ig:profile:${h.toLowerCase()}`;
const CACHE_TTL = 3600; // 1 hour

async function getCached(handle: string): Promise<InstagramProfile | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const c = createClient({ url, socket: { connectTimeout: 3000 } });
  c.on("error", () => {});
  try {
    await c.connect();
    const v = await c.get(CACHE_KEY(handle));
    return v ? (JSON.parse(v) as InstagramProfile) : null;
  } catch {
    return null;
  } finally {
    try {
      await c.quit();
    } catch {
      // 무시
    }
  }
}

async function setCached(handle: string, p: InstagramProfile): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) return;
  const c = createClient({ url, socket: { connectTimeout: 3000 } });
  c.on("error", () => {});
  try {
    await c.connect();
    await c.set(CACHE_KEY(handle), JSON.stringify(p), { EX: CACHE_TTL });
  } catch {
    // 무시
  } finally {
    try {
      await c.quit();
    } catch {
      // 무시
    }
  }
}

export async function fetchProfile(
  handle: string,
): Promise<InstagramProfile | null> {
  if (!handle || !/^[a-zA-Z0-9._]+$/.test(handle)) return null;

  // 캐시 hit
  const cached = await getCached(handle);
  if (cached) return cached;

  const html = await fetchHtml(handle);
  if (!html) return null;

  const profile = parseProfile(html, handle);
  await setCached(handle, profile);
  return profile;
}

export async function fetchProfilePicBytes(
  url: string,
): Promise<{ mime: string; base64: string } | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get("content-type") || "image/jpeg";
    return { mime, base64: buf.toString("base64") };
  } catch {
    return null;
  }
}
