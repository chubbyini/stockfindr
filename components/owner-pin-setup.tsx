"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { hashPin } from "@/lib/auth/pin";
import { useOwner } from "@/lib/auth/owner";
import { useSession } from "@/store/pos";
import { tilldb } from "@/lib/db/dexie";
import { Modal, Btn, Field, ErrorText, inputCls } from "@/components/ui";

export function EnsureOwnerTillAccount() {
  const { user } = useOwner();
  const { shopId, shopName, setSession } = useSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user || !shopId || checked) return;
    (async () => {
      try {
        // Check local Dexie first
        const local = await tilldb.staff.get(user.uid);
        if (local && local.pinHash && local.shopId === shopId) {
          setChecked(true);
          return;
        }

        // Check Firestore
        const snap = await getDoc(doc(db, `shops/${shopId}/staff/${user.uid}`));
        if (snap.exists() && snap.data()?.pinHash) {
          const d = snap.data();
          await tilldb.staff.put({
            id: user.uid,
            shopId,
            name: d.name || "Owner",
            email: d.email || user.email || "",
            role: "owner",
            pinHash: d.pinHash,
            active: true,
            updatedAt: Date.now(),
          });
          setChecked(true);
          return;
        }

        // Check if user is shop owner
        const shopSnap = await getDoc(doc(db, `shops/${shopId}`));
        if (shopSnap.exists() && shopSnap.data()?.ownerUid === user.uid) {
          setName(user.displayName || user.email?.split("@")[0] || "Owner");
          setOpen(true);
        }
      } catch {
        /* offline */
      } finally {
        setChecked(true);
      }
    })();
  }, [user, shopId, checked]);

  async function handleSavePin() {
    if (!user || !shopId) return;
    if (!name.trim()) {
      setMsg("Please enter your name.");
      return;
    }
    if (pin.length < 4) {
      setMsg("PIN must be at least 4 digits.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const pinHash = await hashPin(pin);
      const emailLc = (user.email || "").toLowerCase();
      const displayName = name.trim();

      // Write to Firestore
      await setDoc(doc(db, `shops/${shopId}/staff/${user.uid}`), {
        shopId,
        name: displayName,
        email: emailLc,
        role: "owner",
        pinHash,
        active: true,
        updatedAt: Date.now(),
      }, { merge: true });

      // Save locally to Dexie
      await tilldb.staff.put({
        id: user.uid,
        shopId,
        name: displayName,
        email: emailLc,
        role: "owner",
        pinHash,
        active: true,
        updatedAt: Date.now(),
      });

      // Update Session
      setSession({
        staffId: user.uid,
        staffName: displayName,
        staffEmail: emailLc,
        role: "owner",
      });

      setOpen(false);
    } catch {
      setMsg("Couldn't save your till PIN — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <Modal isOpen={open} onClose={() => {}} title="Create Your Owner Till Account">
      <div className="space-y-4">
        <p className="text-xs text-stone-600">
          As the shop owner of <b>{shopName || "your shop"}</b>, create a 4-digit PIN for your personal till profile so you can unlock counter registers offline and sell at the register.
        </p>

        <Field label="Your Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chief Owner"
            className={inputCls}
          />
        </Field>

        <Field label="Set Your 4-Digit Counter PIN" hint="Use this PIN to unlock registers on any counter device.">
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            inputMode="numeric"
            type="password"
            maxLength={6}
            className={`${inputCls} text-center text-2xl tracking-[0.5em]`}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSavePin();
            }}
          />
        </Field>

        <Btn
          size="lg"
          variant="primary"
          onClick={handleSavePin}
          loading={busy}
          className="w-full shadow-lg shadow-brand-600/20"
        >
          Save Owner PIN & Activate Till
        </Btn>

        {msg && <ErrorText>{msg}</ErrorText>}
      </div>
    </Modal>
  );
}
