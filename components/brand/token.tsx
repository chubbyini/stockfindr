"use client";
import { useEffect, useState } from "react";
import {
  SojournerToken,
  type SojournerTokenProps,
} from "@sojournerbuilds/mark/tokens";

/**
 * Client-only render for the waymark.
 *
 * The token derives tick coordinates from floating-point trig, and the last
 * significant digit can differ between the SSR pass and the client pass
 * (87.53166894485021 vs ...022). React treats that as a hydration mismatch.
 * Rendering a same-size placeholder on the server/first paint and swapping
 * in the real SVG after mount keeps HTML identical on both passes.
 */
export default function Token(props: SojournerTokenProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    const s = props.size ?? 96;
    return (
      <span
        aria-hidden
        style={{ width: s, height: s }}
        className={`inline-block ${props.className ?? ""}`}
      />
    );
  }
  return <SojournerToken {...props} />;
}
