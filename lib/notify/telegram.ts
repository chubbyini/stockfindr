export async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return { skipped: true };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) throw new Error("Telegram send failed: " + (await res.text()).slice(0, 200));
  return { skipped: false };
}

export function buildSummaryText(s: {
  shopName: string;
  date: string;
  total: number;
  count: number;
  top: { name: string; qty: number }[];
  low: { name: string; stock: number }[];
}) {
  const lines = [
    `<b>${escapeHtml(s.shopName)}</b> — ${s.date}`,
    `Sales: ₦${s.total.toFixed(2)} (${s.count} sales)`,
    ``,
    `<b>Top sellers</b>`,
    ...(s.top.length ? s.top.map((t) => `• ${escapeHtml(t.name)} × ${t.qty}`) : ["(no sales)"]),
    ``,
    `<b>Running low</b>`,
    ...(s.low.length ? s.low.map((t) => `• ${escapeHtml(t.name)} — ${t.stock} left`) : ["All good ✅"]),
  ];
  return lines.join("\n");
}

function escapeHtml(x: string) {
  return x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
