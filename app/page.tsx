"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SojournerToken } from "@sojournerbuilds/mark/tokens";
import RouteLoading from "@/components/brand/route-loading";
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
    <main className="max-w-md mx-auto p-8 text-center">
      <div className="flex justify-center mb-4">
        <SojournerToken size={96} spinning={false} />
      </div>
      <h1 className="text-3xl font-bold">Stockfindr</h1>
      <p className="text-gray-600 mt-2">
        Know what you sold, what&apos;s left, and what to reorder — with no extra work for staff.
      </p>
      <button
        onClick={() => signInWithGoogle()}
        className="mt-6 w-full bg-green-700 text-white py-3 rounded"
      >
        Continue with Google
      </button>
      <div className="flex gap-2 mt-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="or email for a sign-in link"
          type="email"
          className="flex-1 border rounded p-2"
        />
        <button
          onClick={async () => {
            try {
              await sendEmailLink(email);
              setMsg("Check your inbox for the sign-in link.");
            } catch {
              setMsg("Couldn't send the link — check the address.");
            }
          }}
          className="border rounded px-3"
        >
          Send
        </button>
      </div>
      {msg && <p className="text-sm mt-2">{msg}</p>}
      <p className="mt-6 text-sm">
        Shop attendant? <a href="/join" className="underline">Join your shop with a code</a>
      </p>
    </main>
  );
}
