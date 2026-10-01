"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SojournerToken } from "@sojournerbuilds/mark/tokens";
import RouteLoading from "@/components/brand/route-loading";
import { Btn, Card, Page, inputCls } from "@/components/ui";
import {
  signInWithGoogle,
  completeRedirect,
  completeEmailLink,
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
  const [routing, setRouting] = useState(true);

  useEffect(() => {
    (async () => {
      await completeRedirect().catch(() => null);
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
        if (!shops.length) router.push("/onboarding");
        else {
          const last = localStorage.getItem("tilltrail-shop");
          const pick = shops.find((s) => s.id === last) || shops[0];
          setSession({ shopId: pick.id });
          router.push("/dashboard");
        }
      } catch {
        setMsg("Couldn't load your shops — check your connection.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, routing]);

  if (loading || routing || user) return <RouteLoading label="Loading Stockfindr…" />;

  return (
    <Page>
      <Card className="mt-4 p-6 text-center">
        <div className="flex justify-center">
          <SojournerToken size={104} spinning={false} />
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Stockfindr</h1>
        <p className="mt-2 text-[15px] leading-snug text-stone-600">
          Know what you sold, what&apos;s left, and what to reorder — with no extra work for staff.
        </p>
        <Btn size="lg" className="mt-6 w-full" onClick={() => signInWithGoogle()}>
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
      <Card className="mt-3 flex items-center justify-between gap-3 bg-brand-50 p-4">
        <p className="text-sm text-stone-700">
          <b>Shop attendant?</b>
          <br />
          Join with the code your owner gave you.
        </p>
        <Btn variant="secondary" size="sm" onClick={() => router.push("/join")}>
          Join
        </Btn>
      </Card>
      <p className="mt-4 text-center text-xs text-stone-400">
        Works offline • Selling is the only chore
      </p>
    </Page>
  );
}
