import type { Metadata } from "next";
import "@fontsource/redaction/400.css";
import "@fontsource/redaction-10/400.css";
import "@fontsource/redaction-20/400.css";
import "@fontsource/redaction-35/400.css";
import "@fontsource/redaction-50/400.css";
import "@fontsource/redaction-70/400.css";
import "@fontsource/redaction-100/400.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { FloodProvider } from "@/components/Flood";
import { Ripple } from "@/components/Ripple";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoEvolve",
  description: "Self-improving agents you don't have to trust. They prove they improved, and they leave behind memory other agents can inherit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <FloodProvider>{children}</FloodProvider>
        <Ripple />
      </body>
    </html>
  );
}
