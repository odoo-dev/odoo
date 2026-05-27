"use strict";
// AI review panel — streams /api/ai/review (SSE-ish) and renders markdown.
import { STATE } from "/review/review.js";

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function renderAiTab(container, state) {
  const intro = el("div", "rv-ai-intro muted",
    "Stream a Claude review of this diff against the migration checklist.");
  container.appendChild(intro);

  const run = el("button", "rv-btn", "Review full diff with AI");
  const out = el("div", "rv-ai-out");
  run.addEventListener("click", () => streamReview(out, "full"));
  container.appendChild(run);
  container.appendChild(out);
}

async function streamReview(out, scope, file) {
  out.innerHTML = "";
  const status = el("div", "rv-ai-status muted", "Contacting Claude…");
  out.appendChild(status);
  const body = el("div", "rv-ai-body");
  out.appendChild(body);

  let url = `/api/ai/review?id=${encodeURIComponent(STATE.id)}&scope=${scope}`;
  if (file) url += `&file=${encodeURIComponent(file)}`;

  let resp;
  try {
    resp = await fetch(url, { method: "POST" });
  } catch (e) {
    status.textContent = "AI request failed: " + e;
    return;
  }
  if (!resp.ok) {
    let reason = resp.status;
    try {
      reason = (await resp.json()).reason || reason;
    } catch {}
    status.textContent = "AI unavailable: " + reason;
    return;
  }
  status.textContent = "Streaming…";

  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let acc = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() || "";
    for (const part of parts) {
      const line = part.replace(/^data:/, "").trim();
      if (!line) continue;
      if (part.startsWith("event:error")) {
        status.textContent = "AI error.";
        continue;
      }
      if (part.startsWith("event:done")) {
        status.textContent = "Done.";
        continue;
      }
      // stream-json deltas: try to extract text fragments
      try {
        const obj = JSON.parse(line);
        const text =
          obj?.delta?.text ||
          obj?.content_block?.text ||
          obj?.text ||
          (obj?.message?.content?.[0]?.text ?? "");
        if (text) {
          acc += text;
          renderMd(body, acc);
        }
      } catch {
        // non-JSON line; append raw
        acc += line + "\n";
        renderMd(body, acc);
      }
    }
  }
  status.textContent = "Done.";
}

function renderMd(node, text) {
  if (window.REVIEW_CAP.marked && window.REVIEW_CAP.purify && window.marked && window.DOMPurify) {
    node.innerHTML = window.DOMPurify.sanitize(window.marked.parse(text));
  } else {
    node.textContent = text;
  }
}

// per-hunk explain (M3) — exported for render to wire if desired
export function explainHunk(out, file, hunkN) {
  streamReview(out, "hunk", file);
}
