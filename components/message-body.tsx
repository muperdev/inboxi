"use client";

import { useState } from "react";
import { mailApi } from "@/lib/mail-api";

export function MessageBody({ html, text }: { html: string | null; text: string }) {
  const [showImages, setShowImages] = useState(false);
  if (!html) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
        {text || "This message has no body."}
      </p>
    );
  }

  const hasImages = /<img\b/i.test(html);
  const body = showImages ? html : html.replace(/<img\b[^>]*>/gi, "");
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    html,body{margin:0;padding:0;background:transparent;color:CanvasText;font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    img,video{max-width:100%;height:auto}
    a{color:#6b3fa0}
    blockquote{margin:.6em 0;padding-left:.8em;border-left:2px solid color-mix(in srgb, CanvasText 25%, transparent);color:color-mix(in srgb, CanvasText 65%, transparent)}
    table{max-width:100%}
  </style></head><body>${body}</body></html>`;

  return (
    <div>
      {hasImages && !showImages ? (
        <button
          type="button"
          onClick={() => setShowImages(true)}
          className="mb-3 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Show images
        </button>
      ) : null}
      <iframe
        title="Message"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        className="block w-full border-0 bg-transparent"
        onLoad={(event) => {
          const frame = event.currentTarget;
          const height = frame.contentDocument?.documentElement.scrollHeight ?? 0;
          frame.style.height = `${Math.max(height, 32)}px`;
        }}
      />
    </div>
  );
}

export function attachmentHref(messageId: string, index: number): string {
  return mailApi.attachmentUrl(messageId, index);
}
