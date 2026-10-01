"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOwner, listOwnerShops, type OwnerShop } from "@/lib/auth/owner";
import { useSession } from "@/store/pos";
import { IconStore, IconPlus } from "./icons";

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
    <div className="flex items-center gap-2">
      <div className="relative flex items-center rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-700 transition hover:bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
        <IconStore className="mr-1.5 size-3.5 text-stone-500" />
        <select
          value={shopId}
          onChange={(e) => {
            const pick = shops.find((s) => s.id === e.target.value);
            setSession({ shopId: e.target.value, shopName: pick?.name || "" });
            router.push("/dashboard");
          }}
          className="bg-transparent font-semibold text-stone-900 outline-none pr-1 max-w-[130px] sm:max-w-[180px] truncate cursor-pointer dark:text-white"
          aria-label="Switch shop"
        >
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={() => router.push("/onboarding")}
        title="Add new shop"
        className="flex size-7 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50 hover:text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
      >
        <IconPlus className="size-3.5" />
      </button>
    </div>
  );
}
