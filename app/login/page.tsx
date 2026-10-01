"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sendEmailLink, completeEmailLink, useOwner } from "@/lib/auth/owner";
import RouteLoading from "@/components/brand/route-loading";
import { Btn, Card, Field, Page, ErrorText, inputCls } from "@/components/ui";

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
      <Card className="mt-4 p-6">
        <h1 className="text-2xl font-bold tracking-tight">Attendant sign-in</h1>
        <p className="mt-1 text-sm text-stone-500">
          One-tap link, once per device. After that the counter uses your PIN.
        </p>
        <div className="mt-4 space-y-4">
          <Field label="Your email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" className={inputCls} />
          </Field>
          <Btn size="lg" className="w-full" onClick={send}>
            {sent ? "Resend link" : "Send me a sign-in link"}
          </Btn>
          {sent && <p className="text-sm text-stone-600">Check your inbox and tap the link.</p>}
        </div>
        {msg && <ErrorText>{msg}</ErrorText>}
        <p className="mt-4 text-center text-sm">
          Counter phone? <a href="/pin" className="text-brand-800 underline underline-offset-4">Unlock with PIN</a>
        </p>
      </Card>
    </Page>
  );
}
