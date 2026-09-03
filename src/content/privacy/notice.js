import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getPrivacyNotice } from "./manifest";

export async function loadPrivacyNotice(type) {
  const notice = getPrivacyNotice(type);
  const content = type === "privacy"
    ? await readFile(join(process.cwd(), "src", "content", "privacy", "privacy-v1.md"), "utf8")
    : await readFile(join(process.cwd(), "src", "content", "privacy", "terms-v1.md"), "utf8");
  return { ...notice, content };
}

export function parseNotice(content) {
  return content.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean).map((block) => {
    const lines = block.split("\n");
    if (lines[0].startsWith("## ")) return { type: "heading", value: lines[0].slice(3), lines: lines.slice(1) };
    if (lines.every((line) => line.startsWith("- "))) return { type: "list", items: lines.map((line) => line.slice(2)) };
    return { type: "paragraph", value: block.replace(/^# .*\n?/, "").trim() };
  }).filter((block) => block.value || block.items?.length);
}
