import "dotenv/config";
import express from "express";
import cors from "cors";
import { Store } from "./data/store";
import { runLlmAgent } from "./agent/llmAgent";
import { runGeminiAgent } from "./agent/geminiAgent";
import { runRuleAgent } from "./agent/ruleAgent";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const HAS_ANTHROPIC_KEY = Boolean(process.env.ANTHROPIC_API_KEY);
const HAS_GEMINI_KEY = Boolean(process.env.GEMINI_API_KEY);
const HAS_API_KEY = HAS_ANTHROPIC_KEY || HAS_GEMINI_KEY;

/** Which provider actually runs when the caller doesn't force one. Gemini
 * first since it's the free-tier-friendly default; falls back to Claude,
 * then to the deterministic rule-based agent if neither key is set. */
function defaultProvider(): "gemini" | "claude" | "rule_based" {
  if (HAS_GEMINI_KEY) return "gemini";
  if (HAS_ANTHROPIC_KEY) return "claude";
  return "rule_based";
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, llmAvailable: HAS_API_KEY, defaultProvider: defaultProvider() });
});

/** Snapshot of the scenario as it stands *before* the agent has acted. */
app.get("/api/scenario", (_req, res) => {
  const store = new Store();
  res.json({
    product: store.getProduct(),
    inventory: store.getInventoryStatus(),
    demandForecast: store.getDemandForecast(),
    existingPurchaseOrders: store.getExistingPurchaseOrders(),
    suppliers: store.getSuppliers(),
    warehouse: store.getWarehouseCapacity(),
    budget: store.getBudgetStatus(),
    upstreamRecommendation: store.getUpstreamRecommendation(),
    llmAvailable: HAS_API_KEY,
    provider: defaultProvider(),
  });
});

/**
 * Runs the agent end to end on a fresh copy of the scenario and returns the
 * full trace plus final decision/action/validation.
 *
 * Provider selection: pass {"mode": "gemini" | "claude" | "rule_based"} to
 * force one. Left unset, it uses whichever provider has a key configured
 * (Gemini first, then Claude), falling back to the deterministic rule-based
 * agent if neither key is set, so the app always works with zero setup.
 */
app.post("/api/run-agent", async (req, res) => {
  const forceMode = req.body?.mode as "gemini" | "claude" | "rule_based" | "llm" | undefined;
  const store = new Store();

  // "llm" is kept as a legacy alias that resolves to whichever provider is configured.
  const mode = forceMode === "llm" || !forceMode ? defaultProvider() : forceMode;

  try {
    let result;
    if (mode === "gemini") {
      result = await runGeminiAgent(store);
    } else if (mode === "claude") {
      result = await runLlmAgent(store);
    } else {
      result = runRuleAgent(store);
    }
    res.json(result);
  } catch (err: any) {
    console.error("Agent run failed:", err);
    res.status(500).json({ error: err.message || "Agent run failed" });
  }
});

app.listen(PORT, () => {
  console.log(`AI Purchasing Agent server listening on http://localhost:${PORT}`);
  const provider = defaultProvider();
  if (provider === "rule_based") {
    console.log("LLM mode DISABLED (no ANTHROPIC_API_KEY or GEMINI_API_KEY found) — using rule-based fallback agent");
  } else {
    console.log(`LLM mode ENABLED — using ${provider === "gemini" ? "Gemini" : "Claude"} as the default provider`);
  }
});
