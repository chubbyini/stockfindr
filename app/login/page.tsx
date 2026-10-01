"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sendEmailLink, completeEmailLink, useOwner } from "@/lib/auth/owner";
import RouteLoading from "@/components/brand/route-loading";
import { Btn, Card, Field, Page, ErrorText, inputCls } from "@/components/ui";
import { IconStaff, IconLock } from "@/components/icons";

// The attendant front door: email link (identity, once per device) → /join
// figures out the shop. Daily counter unlock stays on /pin (name + PIN).
export default function LoginPage() {
  const { user, loading } = useOwner();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    completeEmailLink().catch(() => null);
  }, []);

  useEffect(() => {
    if (!loading && user) router.push("/join");
  }, [user, loading, router]);

  async function send() {
    if (!email.includes("@")) { setMsg("Enter your email address."); return; }
    try {
      localStorage.setItem("stockfindr-entry", "attendant");
      await sendEmailLink(email.trim().toLowerCase());
      setSent(true);
      setMsg("");
    } catch {
      setMsg("Couldn't send the link — check the address and connection.");
    }
  }

  if (loading || user) return <RouteLoading label="Loading…" />;

  return (
    <Page>
      <div className="mx-auto max-w-md py-6 sm:py-12">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900">
              <IconStaff className="size-7" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900 dark:text-white">Staff Account Setup</h1>
            <p className="mt-1 text-sm text-stone-500">
              One-tap link for initial device registration. Daily sales counter uses PIN unlock.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <Field label="Work Email Address">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                className={inputCls}
              />
            </Field>

            <Btn size="lg" className="w-full font-semibold" onClick={send}>
              {sent ? "Resend Sign-In Link" : "Send Sign-In Link"}
            </Btn>

            {sent && (
              <p className="text-center text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Check your email inbox and tap the link to complete authentication.
              </p>
            )}
          </div>

          {msg && <ErrorText>{msg}</ErrorText>}

          <div className="mt-6 border-t border-stone-100 pt-6 text-center dark:border-stone-800">
            <p className="text-xs text-stone-500">
              Already configured this device?{" "}
              <a href="/pin" className="inline-flex items-center gap-1 font-semibold text-stone-900 underline underline-offset-4 dark:text-stone-100">
                <IconLock className="size-3.5 inline" />
                <span>Unlock with PIN</span>
              </a>
            </p>
          </div>
        </Card>
      </div>
    </Page>
  );
}

