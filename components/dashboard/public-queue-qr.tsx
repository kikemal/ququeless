"use client";

import QRCode from "qrcode";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";

type PublicQueueQrProps = {
  publicQueueUrl: string;
  businessName: string;
  queueName: string;
  serviceName: string;
  slug: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function PublicQueueQr({
  publicQueueUrl,
  businessName,
  queueName,
  serviceName,
  slug,
}: PublicQueueQrProps) {
  const titleId = useId();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const url = await QRCode.toDataURL(publicQueueUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 280,
          color: {
            dark: "#102028",
            light: "#ffffff",
          },
        });
        if (!cancelled) {
          setDataUrl(url);
          setRenderError(null);
        }
      } catch {
        if (!cancelled) {
          setDataUrl(null);
          setRenderError("Could not generate the QR code. Use the link below.");
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [publicQueueUrl]);

  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) {
        setCopyState("failed");
        return;
      }
      await navigator.clipboard.writeText(publicQueueUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("failed");
    }
  }

  function downloadQr() {
    if (!dataUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `queueless-public-queue-${slug}.png`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function printQr() {
    if (!dataUrl) {
      return;
    }

    const printWindow = window.open(
      "",
      "_blank",
      "noopener,noreferrer,width=520,height=760",
    );
    if (!printWindow) {
      return;
    }

    printWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>QueueLess QR — ${escapeHtml(queueName)}</title>
    <style>
      body { font-family: system-ui, sans-serif; color: #102028; text-align: center; padding: 32px; }
      h1 { font-size: 24px; margin: 8px 0 4px; }
      p { margin: 6px 0; }
      .muted { color: #5c6b75; }
      img { margin: 24px auto; width: 260px; height: 260px; }
      .url { word-break: break-all; font-size: 14px; }
    </style>
  </head>
  <body>
    <p class="muted">${escapeHtml(businessName)}</p>
    <h1>${escapeHtml(queueName)}</h1>
    <p class="muted">${escapeHtml(serviceName)}</p>
    <img src="${dataUrl}" alt="QR code for joining the public QueueLess queue." width="260" height="260" />
    <p class="url">${escapeHtml(publicQueueUrl)}</p>
    <p class="muted">Scan to join the queue</p>
    <script>
      window.onload = function () {
        window.focus();
        window.print();
      };
    </script>
  </body>
</html>`);
    printWindow.document.close();
  }

  return (
    <section
      className="rounded-xl border border-border bg-surface p-5"
      aria-labelledby={titleId}
    >
      <h2
        id={titleId}
        className="font-display text-lg font-semibold text-foreground"
      >
        Public Queue
      </h2>
      <p className="mt-1 text-sm text-muted">Scan to join this queue</p>

      <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="mx-auto flex w-full max-w-[280px] flex-col items-center lg:mx-0">
          {renderError ? (
            <p className="text-sm text-danger" role="alert">
              {renderError}
            </p>
          ) : dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- QR is a generated data URL
            <img
              src={dataUrl}
              alt="QR code for joining the public QueueLess queue."
              width={280}
              height={280}
              className="h-auto w-full rounded-lg border border-border bg-white p-2"
            />
          ) : (
            <div
              className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border bg-background text-sm text-muted"
              aria-busy="true"
            >
              Generating QR…
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Public link
            </p>
            <p className="mt-2 break-all text-sm font-medium text-foreground">
              {publicQueueUrl}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={copyLink}>
              {copyState === "copied" ? "Copied" : "Copy link"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={downloadQr}
              disabled={!dataUrl}
            >
              Download QR
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={printQr}
              disabled={!dataUrl}
            >
              Print
            </Button>
          </div>

          {copyState === "failed" ? (
            <p className="text-sm text-danger" role="alert">
              Copy failed — select and copy the link manually.
            </p>
          ) : null}
          {copyState === "copied" ? (
            <p className="text-sm text-accent" role="status">
              Link copied to clipboard.
            </p>
          ) : null}

          <p className="text-sm text-muted">
            Customers can scan this code with their phone camera to open the
            public queue.
          </p>
        </div>
      </div>
    </section>
  );
}
