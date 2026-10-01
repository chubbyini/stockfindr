"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOwner, listOwnerShops, type OwnerShop } from "@/lib/auth/owner";
import { useSession } from "@/store/pos";

export default function ShopSwitcher() {
  const { user } = useOwner();
  const { shopId, setSession } = useSession();
  const router = useRouter();
  const [shops, setShops] = useState<OwnerShop[]>([]);

  useEffect(() => {
    if (user) listOwnerShops(user.uid).then(setShops).catch(() => {});
  }, [user]);

  if (!user || shops.length < 1) return null;

  return (
    <span className="text-sm">
      <select
        value={shopId}
        onChange={(e) => {
          setSession({ shopId: e.target.value });
          router.push("/dashboard");
        }}
        className="border rounded p-1 max-w-40"
        aria-label="Switch shop"
      >
        {shops.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>{" "}
      <a href="/onboarding" className="underline text-xs">+ New shop</a>
    </span>
  );
}
