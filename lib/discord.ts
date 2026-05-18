export async function notify(payload: object): Promise<void> {
  const URL = process.env.DISCORD_THREADS_WEBHOOK_URL;
  if (!URL) {
    console.warn("Missing DISCORD_THREADS_WEBHOOK_URL");
    return;
  }
  try {
    await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "DiscordBot (muse, 1.0)",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Discord notify failed:", e);
  }
}

export const COLORS = {
  pink: 0xf3498d,
  gray: 0x767676,
  yellow: 0xf59e0b,
  red: 0xdc2626,
  green: 0x16a34a,
};
