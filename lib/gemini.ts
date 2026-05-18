const MODEL = "gemini-2.5-flash";

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

function isQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota");
}

async function tryOnce(
  key: string,
  systemPrompt: string,
  userPrompt: string,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
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
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const keys = getKeys();
  if (keys.length === 0) throw new Error("No Gemini API keys configured");

  let lastError: unknown = null;
  const tries: Array<{ idx: number; status: "ok" | "quota" | "error"; msg?: string }> = [];

  for (let i = 0; i < keys.length; i++) {
    const idx = (rotationStart + i) % keys.length;
    const key = keys[idx];
    try {
      const result = await tryOnce(key, systemPrompt, userPrompt, opts);
      tries.push({ idx, status: "ok" });
      // 성공한 다음 키부터 다음 호출 시작 → 분산
      rotationStart = (idx + 1) % keys.length;
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isQuotaError(e)) {
        tries.push({ idx, status: "quota", msg: msg.slice(0, 100) });
        lastError = e;
        continue; // 다음 키로
      }
      tries.push({ idx, status: "error", msg: msg.slice(0, 100) });
      throw e; // 쿼터 외 에러는 즉시 throw
    }
  }

  // 모든 키 소진
  const summary = tries
    .map((t) => `[${t.idx}] ${t.status}${t.msg ? `: ${t.msg}` : ""}`)
    .join(" | ");
  throw new Error(`All ${keys.length} Gemini keys exhausted (quota): ${summary}`);
}

export function getKeyCount(): number {
  return getKeys().length;
}
