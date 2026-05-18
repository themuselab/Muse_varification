const MODEL = "gemini-2.5-flash";

export async function generate(
  systemPrompt: string,
  userPrompt: string,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) throw new Error("Missing GEMINI_API_KEY");

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
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
