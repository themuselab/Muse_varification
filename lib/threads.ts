const API = "https://graph.threads.net/v1.0";

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

async function post(url: string, params: Record<string, string>): Promise<unknown> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Threads ${r.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

async function get<T = unknown>(url: string): Promise<T> {
  const r = await fetch(url);
  const text = await r.text();
  if (!r.ok) throw new Error(`Threads ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export async function publish(
  text: string,
  opts?: { topic_tag?: string; reply_to_id?: string },
): Promise<{ id: string; permalink: string }> {
  const TK = process.env.THREADS_ACCESS_TOKEN;
  if (!TK) throw new Error("Missing THREADS_ACCESS_TOKEN");

  const params: Record<string, string> = {
    media_type: "TEXT",
    text,
    access_token: TK,
  };
  if (opts?.topic_tag) params.topic_tag = opts.topic_tag;
  if (opts?.reply_to_id) params.reply_to_id = opts.reply_to_id;

  const container = (await post(`${API}/me/threads`, params)) as { id: string };
  await sleep(3000);

  const published = (await post(`${API}/me/threads_publish`, {
    creation_id: container.id,
    access_token: TK,
  })) as { id: string };

  await sleep(2000);
  const meta = await get<{ permalink: string }>(
    `${API}/${published.id}?fields=permalink&access_token=${TK}`,
  );
  return { id: published.id, permalink: meta.permalink };
}

export type ConvComment = {
  id: string;
  text?: string;
  username: string;
  timestamp: string;
  permalink: string;
  replied_to?: { id: string };
};

export async function conversation(threadId: string): Promise<ConvComment[]> {
  const TK = process.env.THREADS_ACCESS_TOKEN!;
  const data = await get<{ data: ConvComment[] }>(
    `${API}/${threadId}/conversation?fields=id,text,username,timestamp,permalink,replied_to&access_token=${TK}`,
  );
  return data.data || [];
}

export async function listMyPosts(limit = 25): Promise<
  Array<{ id: string; text?: string; permalink: string; timestamp: string }>
> {
  const TK = process.env.THREADS_ACCESS_TOKEN!;
  const data = await get<{
    data: Array<{ id: string; text?: string; permalink: string; timestamp: string }>;
  }>(
    `${API}/me/threads?fields=id,text,timestamp,permalink&limit=${limit}&access_token=${TK}`,
  );
  return data.data || [];
}

export async function getInsights(
  postId: string,
): Promise<Record<string, number>> {
  const TK = process.env.THREADS_ACCESS_TOKEN!;
  try {
    const data = await get<{
      data: Array<{ name: string; values: Array<{ value: number }>; total_value?: { value: number } }>;
    }>(
      `${API}/${postId}/insights?metric=views,likes,replies,reposts,quotes,shares&access_token=${TK}`,
    );
    const out: Record<string, number> = {};
    for (const m of data.data || []) {
      out[m.name] = m.total_value?.value ?? m.values?.[0]?.value ?? 0;
    }
    return out;
  } catch {
    return {};
  }
}
