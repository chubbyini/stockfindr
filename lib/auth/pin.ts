import bcrypt from "bcryptjs";

export async function hashPin(pin: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(pin, salt);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

const ATTEMPTS_KEY = "tilltrail-pin-attempts";
export function pinRateLimitCheck(deviceId: string): { blocked: boolean; retryAfterSec: number } {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY + ":" + deviceId);
    const rec = raw ? (JSON.parse(raw) as { fails: number; lockedUntil: number }) : { fails: 0, lockedUntil: 0 };
    if (Date.now() < rec.lockedUntil) {
      return { blocked: true, retryAfterSec: Math.ceil((rec.lockedUntil - Date.now()) / 1000) };
    }
    return { blocked: false, retryAfterSec: 0 };
  } catch {
    return { blocked: false, retryAfterSec: 0 };
  }
}

export function pinRecordFailure(deviceId: string) {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY + ":" + deviceId);
    const rec = raw ? (JSON.parse(raw) as { fails: number; lockedUntil: number }) : { fails: 0, lockedUntil: 0 };
    rec.fails += 1;
    if (rec.fails >= 5) {
      rec.lockedUntil = Date.now() + 5 * 60 * 1000;
      rec.fails = 0;
    }
    localStorage.setItem(ATTEMPTS_KEY + ":" + deviceId, JSON.stringify(rec));
  } catch { /* ignore */ }
}

export function pinClearFailures(deviceId: string) {
  try {
    localStorage.removeItem(ATTEMPTS_KEY + ":" + deviceId);
  } catch { /* ignore */ }
}
