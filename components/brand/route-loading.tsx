"use client";
import { useEffect, useState } from "react";
import "@sojournerbuilds/mark/veil.css";
import { SojournerLoader } from "@sojournerbuilds/mark/loader";

// Same treatment as Token: the loader embeds the waymark SVG, whose
// float-derived coordinates can differ in the last digit between SSR and
// client. Gate on mount so both passes emit identical HTML.
export default function RouteLoading({ label }: { label?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="sj-veil" aria-hidden />;
  return <SojournerLoader label={label} variant="waymark" />;
}
