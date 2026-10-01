"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Token from "@/components/brand/token";
import RouteLoading from "@/components/brand/route-loading";
import { Btn, Card, Page, inputCls } from "@/components/ui";
import {
  signInWithGoogle,
  completeRedirect,
  completeEmailLink,
  friendlyAuthError,
  sendEmailLink,
  useOwner,
  listOwnerShops,
} from "@/lib/auth/owner";
import { useSession } from "@/store/pos";

export default function Home() {
  const { user, loading } = useOwner();
  const { setSession } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [routeError, setRouteError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [routing, setRouting] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await completeRedirect();
      } catch (e) {
        setMsg(friendlyAuthError(e));
      }
      await completeEmailLink().catch(() => null);
      setRouting(false);
    })();
  }, []);

  useEffect(() => {
    if (loading || routing) return;
    if (!user) return;
    (async () => {
      try {
        const shops = await listOwnerShops(user.uid);
        if (shops.length) {
          const last = localStorage.getItem("tilltrail-shop");
          const pick = shops.find((s) => s.id === last) || shops[0];
          setSession({ shopId: pick.id });
          router.push("/dashboard");
        } else if (localStorage.getItem("stockfindr-entry") === "attendant") {
          router.push("/join");
        } else {
          router.push("/onboarding");
        }
      } catch {
        // Never spin forever: say it, offer retry.
        setRouteError("Couldn't load your shops — check your connection, then retry.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, routing, retryKey]);

  if (loading || routing) return <RouteLoading label="Loading Stockfindr…" />;

  if (routeError) {
    return (
      <Page>
        <Card className="mt-8 p-6 text-center">
          <h1 className="text-xl font-bold">Something got stuck</h1>
          <p className="mt-2 text-sm text-stone-600">{routeError}</p>
          <Btn
            className="mt-4 w-full"
            onClick={() => { setRouteError(""); setRetryKey((k) => k + 1); }}
          >
            Try again
          </Btn>
          <p className="mt-3 text-xs text-stone-400">Signed in{user?.email ? ` as ${user.email}` : ""}.</p>
        </Card>
      </Page>
    );
  }

  if (user) return <RouteLoading label="Finding your shops…" />;

  return (
    <Page>
      <Card className="mt-4 p-6 text-center">
        <div className="flex justify-center">
          <Token size={104} spinning={false} />
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Stockfindr</h1>
        <p className="mt-2 text-[15px] leading-snug text-stone-600">
          Know what you sold, what&apos;s left, and what to reorder — with no extra work for staff.
        </p>
        <Btn size="lg" className="mt-6 w-full" onClick={() => { localStorage.setItem("stockfindr-entry", "owner"); signInWithGoogle(); }}>
          Continue with Google
        </Btn>
        <div className="my-4 flex items-center gap-3 text-xs text-stone-400">
          <span className="h-px flex-1 bg-stone-200" />
          or email link
          <span className="h-px flex-1 bg-stone-200" />
        </div>
        <div className="flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@shop.com"
            type="email"
            className={`${inputCls} flex-1`}
          />
          <Btn
            variant="secondary"
            onClick={async () => {
              try {
                localStorage.setItem("stockfindr-entry", "owner");
                await sendEmailLink(email);
                setMsg("Check your inbox for the sign-in link.");
              } catch {
                setMsg("Couldn't send the link — check the address.");
              }
            }}
          >
            Send
          </Btn>
        </div>
        {msg && <p className="mt-2 text-sm text-stone-600">{msg}</p>}
      </Card>
      <Card className="mt-3 bg-brand-50 p-4">
        <p className="text-sm text-stone-700">
          <b>Shop attendant?</b>
          <br />
          Sign in with your email link, then unlock the counter with your PIN.
        </p>
        <Btn variant="secondary" size="sm" onClick={() => router.push("/login")} className="mt-3 w-full">
          Attendant sign-in
        </Btn>
      </Card>
      <p className="mt-4 text-center text-xs text-stone-400">
        Works offline • Selling is the only chore
      </p>
    </Page>
  );
}
