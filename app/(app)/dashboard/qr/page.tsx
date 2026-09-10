import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QR Code",
};

export default function QrPage() {
  return (
    <main>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
        QR Code
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
        Your QR code will appear here.
      </p>
    </main>
  );
}
