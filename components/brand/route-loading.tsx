"use client";
import "@sojournerbuilds/mark/veil.css";
import { SojournerLoader } from "@sojournerbuilds/mark/loader";

export default function RouteLoading({ label }: { label?: string }) {
  return <SojournerLoader label={label} variant="waymark" />;
}
