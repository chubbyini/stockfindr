import type { Metadata } from "next";
import "@sojournerbuilds/mark/token.css";
import "@sojournerbuilds/mark/veil.css";
import { SojournerVeilProvider } from "@sojournerbuilds/mark/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stockfindr — know what you sold, what's left, what to reorder",
  description:
    "Inventory, sales capture and reorder alerts for small retail shops. Selling is the only thing staff have to do.",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <SojournerVeilProvider label="Loading Stockfindr…">
          {children}
        </SojournerVeilProvider>
      </body>
    </html>
  );
}
