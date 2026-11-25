import React from "react";

// Angel portraits (public/angels/<key>.png). Keys: claude=Michael, grok=Gabriel, gemini=Raphael, openai=Uriel, emmanuel, enoch, baseline=Sentinel.
const HAVE = new Set(["claude", "grok", "gemini", "openai", "emmanuel", "enoch", "baseline"]);

export const hasAngelIcon = (k) => HAVE.has(k);

export default function AngelIcon({ k, size = 20, style }) {
  if (!HAVE.has(k)) return null;
  return <img src={`/angels/${k}.png`} alt="" width={size} height={size} loading="lazy" style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), flexShrink: 0, display: "block", ...style }} />;
}
