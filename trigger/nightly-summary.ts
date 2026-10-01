import { logger, schedules } from "@trigger.dev/sdk";
import { adminDb, FieldValue } from "./admin";
import { buildSummaryText, sendTelegram } from "../lib/notify/telegram";

// Minutes east of UTC per shop timezone. Africa/Lagos (WAT) has no DST.
// Extend this table if shops in other zones are onboarded.
const TZ_OFFSETS_MIN: Record<string, number> = { "Africa/Lagos": 60 };

function dayBoundsUTC(now: Date, tz: string) {
  const offsetMin = TZ_OFFSETS_MIN[tz] ?? 0;
  const shifted = new Date(now.getTime() + offsetMin * 60_000);
  const dayKey = shifted.toISOString().slice(0, 10); // YYYY-MM-DD in shop tz
  const startMs = Date.parse(`${dayKey}T00:00:00Z`) - offsetMin * 60_000;
  return { startMs, endMs: startMs + 86_400_000, dayKey };
}

interface TopLine {
  name: string;
  qty: number;
}

/**
 * Nightly owner summary — 18:00 shop time.
 * Idempotent: summaries/{YYYY-MM-DD} is recomputed on retry, but the
 * Telegram message is sent only once per date key (guarded by
 * telegramSent on the doc).
 */
export const nightlySummary = schedules.task({
  id: "nightly-summary",
  cron: {
    pattern: "0 18 * * *",
    timezone: "Africa/Lagos",
  },
  run: async (payload) => {
    const db = adminDb();
    const shops = await db.collection("shops").limit(100).get();
    logger.info("nightly-summary start", { shopCount: shops.size });

    for (const shopDoc of shops.docs) {
      const shop = shopDoc.data() as {
        name?: string;
        timezone?: string;
        telegramChatId?: string;
      };
      const tz = shop.timezone || "Africa/Lagos";
      const { startMs, endMs, dayKey } = dayBoundsUTC(payload.timestamp, tz);
      const base = `shops/${shopDoc.id}`;
      const summaryRef = db.doc(`${base}/summaries/${dayKey}`);

      const existing = await summaryRef.get();
      if (existing.exists && existing.data()?.telegramSent === true) {
        logger.info("already sent, skipping", { shop: shopDoc.id, dayKey });
        continue;
      }

      // Today's completed sales
      const salesSnap = await db
        .collection(`${base}/sales`)
        .where("occurred_at", ">=", startMs)
        .where("occurred_at", "<", endMs)
        .get();
      const completed = salesSnap.docs.filter((d) => d.data().status !== "voided");
      const total = completed.reduce((a, d) => a + Number(d.data().total || 0), 0);

      // Catalog once (names for top sellers + low-stock check)
      const prodSnap = await db.collection(`${base}/products`).get();
      const names = new Map<string, string>();
      const low: { name: string; stock: number }[] = [];
      for (const p of prodSnap.docs) {
        const pd = p.data() as {
          name?: string;
          current_stock?: number;
          reorder_level?: number;
        };
        names.set(p.id, pd.name || p.id);
        const stock = Number(pd.current_stock ?? 0);
        if (stock <= Number(pd.reorder_level ?? 5)) {
          low.push({ name: pd.name || p.id, stock });
        }
      }

      // Top sellers from sale items
      const qtyByProduct = new Map<string, number>();
      for (const s of completed) {
        const items = await s.ref.collection("items").get();
        for (const it of items.docs) {
          const d = it.data() as { product_id?: string; quantity?: number };
          if (!d.product_id) continue;
          qtyByProduct.set(
            d.product_id,
            (qtyByProduct.get(d.product_id) || 0) + Number(d.quantity || 0)
          );
        }
      }
      const top: TopLine[] = [...qtyByProduct.entries()]
        .map(([id, qty]) => ({ name: names.get(id) || id, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      await summaryRef.set(
        {
          date: dayKey,
          total: Math.round(total * 100) / 100,
          count: completed.length,
          top,
          low: low.slice(0, 20),
          telegramSent: false,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Telegram (once per date key)
      if (shop.telegramChatId) {
        const text = buildSummaryText({
          shopName: shop.name || shopDoc.id,
          date: dayKey,
          total,
          count: completed.length,
          top,
          low: low.slice(0, 10),
        });
        await sendTelegram(shop.telegramChatId, text);
        await summaryRef.set(
          { telegramSent: true, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
        logger.info("telegram sent", { shop: shopDoc.id, dayKey });
      } else {
        logger.info("no telegram chat linked, in-app only", { shop: shopDoc.id, dayKey });
      }
    }

    return { ok: true };
  },
});
