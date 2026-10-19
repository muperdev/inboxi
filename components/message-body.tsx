"use client";

import { useTheme } from "next-themes";
import { mailApi } from "@/lib/mail-api";

const light = { text: "#2b2333", muted: "#6f6577", link: "#6b3fa0" };
const night = { text: "#efe8f2", muted: "#a39ea6", link: "#b4a5f5" };

export function MessageBody({ html, text }: { html: string | null; text: string }) {
  const { resolvedTheme } = useTheme();
  const dark =
    resolvedTheme === "dark" ||
    (resolvedTheme === undefined &&
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"));
  const tone = dark ? night : light;

  if (!html) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
        {text || "This message has no body."}
      </p>
    );
  }

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    :root { color-scheme: ${dark ? "dark" : "light"}; }
    html, body { margin:0; padding:0; overflow:hidden; background:transparent !important; color:${tone.text}; font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body, body * { background:transparent !important; background-color:transparent !important; color:${tone.text} !important }
    a, a * { color:${tone.link} !important }
    img, video { max-width:100%; height:auto; background:transparent !important }
    blockquote { margin:.6em 0; padding-left:.8em; border-left:2px solid color-mix(in srgb, ${tone.muted} 50%, transparent) !important; color:${tone.muted} !important }
  </style></head><body>${html}<style>
    html body, html body * { background:transparent !important; background-color:transparent !important; color:${tone.text} !important }
    html body a, html body a * { color:${tone.link} !important }
  </style></body></html>`;

  return (
    <div>
      <iframe
        title="Message"
        scrolling="no"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        className="block w-full overflow-hidden border-0 bg-transparent"
        onLoad={(event) => {
          const frame = event.currentTarget;
          const height = frame.contentDocument?.documentElement.scrollHeight ?? 0;
          frame.style.height = `${Math.max(height + 8, 32)}px`;
        }}
      />
    </div>
  );
}

export function attachmentHref(messageId: string, index: number): string {
  return mailApi.attachmentUrl(messageId, index);
}
