// 우선순위: 2.5 → 2.0 → 2.5-lite. 503/quota 시 다음 모델로 fallback
const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
];

// 모듈 레벨 카운터 — 라운드 로빈 시작점.
// Serverless cold start마다 리셋되지만 그래도 분산 효과 있음.
let rotationStart = 0;

function getKeys(): string[] {
  // GEMINI_API_KEYS (콤마 분리) 우선, 없으면 GEMINI_API_KEY (단일)
  const multi = process.env.GEMINI_API_KEYS;
  if (multi) {
    return multi
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }
  const single = process.env.GEMINI_API_KEY;
  return single ? [single] : [];
}

function isRetryableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("quota") ||
    msg.includes("503") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("high demand") ||
    msg.includes("500") ||
    msg.includes("INTERNAL")
  );
}

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

export type ImageInput = { mime: string; base64: string };

async function tryOnce(
  key: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  opts?: { maxTokens?: number; temperature?: number; images?: ImageInput[] },
): Promise<string> {
  const parts: Array<
    | { text: string }
    | { inline_data: { mime_type: string; data: string } }
  > = [];
  for (const img of opts?.images || []) {
    parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
  }
  parts.push({ text: userPrompt });

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: opts?.temperature ?? 0.95,
          maxOutputTokens: opts?.maxTokens ?? 800,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );
  if (!r.ok) {
    throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  const data = (await r.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text.trim();
}

export async function generate(
  systemPrompt: string,
  userPrompt: string,
  opts?: { maxTokens?: number; temperature?: number; images?: ImageInput[] },
): Promise<string> {
  const keys = getKeys();
  if (keys.length === 0) throw new Error("No Gemini API keys configured");

  const tries: Array<{ model: string; idx: number; status: "ok" | "retry" | "error"; msg?: string }> = [];

  // 모든 모델 × 모든 키 한 번 → 백오프 → 한 번 더
  for (let pass = 0; pass < 2; pass++) {
    for (const model of MODELS) {
      for (let i = 0; i < keys.length; i++) {
        const idx = (rotationStart + i) % keys.length;
        const key = keys[idx];
        try {
          const result = await tryOnce(key, model, systemPrompt, userPrompt, opts);
          tries.push({ model, idx, status: "ok" });
          rotationStart = (idx + 1) % keys.length;
          return result;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (isRetryableError(e)) {
            tries.push({ model, idx, status: "retry", msg: msg.slice(0, 60) });
            continue;
          }
          tries.push({ model, idx, status: "error", msg: msg.slice(0, 60) });
          throw e;
        }
      }
    }
    if (pass < 1) {
      await sleep(3000); // 모든 모델×키 retryable → 3초 쉬고 한 번 더
    }
  }

  const summary = tries
    .map((t) => `[${t.model}/${t.idx}] ${t.status}${t.msg ? `: ${t.msg}` : ""}`)
    .join(" | ");
  throw new Error(`Gemini all retries exhausted: ${summary}`);
}

export function getKeyCount(): number {
  return getKeys().length;
}
