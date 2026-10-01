// Seed one shop: shop doc + owner member + staff (bcrypt PIN hashes).
// Reads secrets from .env.local — never commit that file.
// Idempotent: reruns merge (safe to re-run to add staff or link Telegram).
//
// Usage:
//   node scripts/seed-shop.mjs --shop "Mama Tunde Store" --owner-uid UID123 \
//     --staff "Emeka:1234:attendant,Ada:5678:attendant" [--telegram 123456789]
import fs from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";

function loadLocalEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const shopName = arg("shop");
const ownerUid = arg("owner-uid");
const staffArg = arg("staff") || "";
const telegramChatId = arg("telegram");
if (!shopName || !ownerUid) {
  console.error(
    'Usage: node scripts/seed-shop.mjs --shop "Name" --owner-uid UID [--staff "Name:pin:role,..."] [--telegram CHATID]'
  );
  process.exit(1);
}

const env = loadLocalEnv();
const projectId =
  env.FIREBASE_ADMIN_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
initializeApp({
  credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)),
  projectId,
});
const db = getFirestore();

const shopId =
  "shop-" +
  shopName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

await db.doc(`shops/${shopId}`).set(
  {
    name: shopName,
    ownerUid,
    timezone: "Africa/Lagos",
    ...(telegramChatId ? { telegramChatId } : {}),
    createdAt: FieldValue.serverTimestamp(),
  },
  { merge: true }
);
await db.doc(`shops/${shopId}/members/${ownerUid}`).set({ role: "owner" });
// Private per-user index (mirrors what /onboarding writes for self-serve).
await db
  .doc(`users/${ownerUid}/shops/${shopId}`)
  .set({ name: shopName, createdAt: FieldValue.serverTimestamp() }, { merge: true });

for (const entry of staffArg.split(",").map((s) => s.trim()).filter(Boolean)) {
  const [name, pin, role = "attendant"] = entry.split(":");
  if (!name || !pin) throw new Error(`Bad staff entry: ${entry} (want Name:pin[:role])`);
  const pinHash = await bcrypt.hash(pin, 10);
  const staffId = "staff-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await db.doc(`shops/${shopId}/staff/${staffId}`).set(
    {
      shopId,
      name,
      role,
      pinHash,
      active: true,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  console.log(`staff: ${name} (${role})`);
}

console.log(`shop ready: shops/${shopId} (set as tilltrail-shop in the app)`);
