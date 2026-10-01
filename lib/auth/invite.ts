// Unambiguous alphabet (no 0/O, 1/I/L) for verbally-shared invite codes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function makeInviteCode(length = 8): string {
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => ALPHABET[n % ALPHABET.length]).join("");
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z2-9]/g, "");
}
