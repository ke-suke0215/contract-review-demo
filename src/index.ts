import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { bodyLimit } from "hono/body-limit";
import { CHECK_CRITERIA } from "./config";
import { runReview } from "./review-service";
import type { ReviewMode } from "./review-types";

const app = new Hono();

app.use("/api/*", logger());
app.use(
  "/api/review",
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: "リクエストが大きすぎます。" }, 413),
  }),
);

app.get("/api/health", (c) => c.json({ ok: true, runtime: "bun" }));

app.get("/api/criteria", (c) => c.json({ criteria: CHECK_CRITERIA }));

app.post("/api/review", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON形式のリクエストが必要です。" }, 400);
  }

  if (!body || typeof body !== "object") {
    return c.json({ error: "リクエスト形式が不正です。" }, 400);
  }

  const payload = body as Record<string, unknown>;
  const contractText = typeof payload.contractText === "string" ? payload.contractText.trim() : "";
  const criteriaIds = Array.isArray(payload.criteriaIds)
    ? payload.criteriaIds.filter((id): id is string => typeof id === "string")
    : [];
  const executionMode = payload.executionMode as ReviewMode;

  if (!contractText) return c.json({ error: "契約書本文を入力してください。" }, 400);
  if (!["jev", "gpt-5.6-luna", "both"].includes(executionMode)) {
    return c.json({ error: "実行モードが不正です。" }, 400);
  }

  try {
    const result = await runReview({ contractText, criteriaIds, executionMode });
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "レビューに失敗しました。";
    return c.json({ error: message }, 400);
  }
});

app.get("/", serveStatic({ path: "./index.html" }));

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
