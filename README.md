# AI Purchasing Agent — Buyer Console

A full-stack proof of concept for the Rappi "AI Purchasing Agent" assignment.
The agent investigates a purchasing situation, makes a decision, takes action
(places a mock purchase order), and validates the outcome — end to end, for
one deep scenario rather than four shallow ones.

## The scenario (built end-to-end)

**Supplier condition change → re-evaluate the reorder.**

`SKU-4471 — Instant Noodles Family Pack (24ct)` is low on stock. Its incumbent
supplier, NoodleCo, just raised its price 24% and its minimum order quantity
from 100 → 400 cases. A legacy "reorder rules engine" fired a naive
recommendation: *accept the new terms and reorder 400 cases from NoodleCo*.

That recommendation is deliberately not trustworthy — it hasn't checked
storage capacity, budget, or the approved alternate supplier. It's provided
to the agent exactly as the assignment brief specifies: **"should not
necessarily be assumed to be correct."**

The agent has to:
1. **Investigate** — inventory, demand forecast, existing POs, all supplier
   options (incumbent + alternate), warehouse capacity, budget.
2. **Decide** — the 400-case MOQ order physically doesn't fit the 320
   free cases in the warehouse zone, so the incumbent is unusable at *any*
   quantity right now. The approved alternate (PacificFoods) has a smaller
   MOQ, a volume discount at 300+ cases, but a longer lead time than the
   days of stock remaining.
3. **Act** — places a real (mocked) purchase order for the quantity that
   actually clears every hard constraint.
4. **Validate** — checks the placed order against MOQ / storage / budget /
   lead-time, and **surfaces the one constraint it can't fully clear** (a
   short stockout gap) instead of quietly reporting success.

This is meant to demonstrate exactly the "multiple factors or constraints
affect the final decision" and "recommendation should not be assumed
correct" requirements from the brief with a concrete, checkable outcome,
rather than a shallow demo across many scenarios.

## Architecture

```
purchasing-agent/
├── server/                Node + TypeScript + Express
│   └── src/
│       ├── data/          Mock dataset (db.json) + Store (typed accessors, mutation, validation)
│       ├── agent/
│       │   ├── tools.ts       Tool schema + dispatcher shared by the LLM agent
│       │   ├── llmAgent.ts    Claude tool-use loop (investigate/decide/act/validate)
│       │   ├── ruleAgent.ts   Deterministic fallback — same steps, no LLM needed
│       │   └── types.ts       Shared trace/result types
│       └── server.ts       REST API
└── client/                Vite + React + TypeScript
    └── src/
        ├── components/     ScenarioPanel, TraceLog, OutcomePanel
        ├── api.ts, types.ts
        └── App.tsx
```

**Why three agent implementations?** The brief asks for an *AI* purchasing
agent, so the primary path is a real tool-use loop, available against two
interchangeable providers:

- `geminiAgent.ts` — Google's Gemini API (`@google/genai`). Get a free key
  with no credit card at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
  This is the default provider if you only want to try the LLM path for
  free.
- `llmAgent.ts` — Claude (`@anthropic-ai/sdk`), pay-as-you-go.

Both are given the exact same tool set (`agent/tools.ts`: read-only
investigation tools plus `validate_order` and `create_purchase_order`) and
the same system prompt, and each decides for itself what to call and in
what order — the loop just executes whatever tools the model chooses and
feeds results back until it stops. This also makes the two directly
comparable: you can run the identical scenario through Gemini and Claude
and see whether they reach the same decision.

`ruleAgent.ts` is a deterministic stand-in that walks the identical
investigate → validate-candidate → decide → act → validate steps with
explicit heuristics, so the app is fully runnable and demoable with **no API
key at all**, and so you can diff "what the LLM did" against "what a
hand-written rule would do" for the same data — useful both as a fallback
and as a sanity check on the LLM's reasoning.

**Provider selection** (`server.ts`, `defaultProvider()`): if
`GEMINI_API_KEY` is set, `/api/run-agent` uses Gemini by default; else if
`ANTHROPIC_API_KEY` is set, it uses Claude; else it uses the rule-based
agent. You can force a specific provider per request regardless of what's
configured with `{"mode": "gemini" | "claude" | "rule_based"}` in the POST
body (useful for the side-by-side comparison above).

**Mock data, not mock plumbing.** `Store` (`server/src/data/store.ts`) is a
small in-memory repository over a JSON fixture, but its interface
(`getInventoryStatus`, `getSuppliers`, `createPurchaseOrder`,
`validateOrder`, …) is written the way a real service layer over an
inventory DB / supplier API / PO system would look, specifically so it's
easy to swap the fixture for real integrations without touching the agent
or the tool schema.

## Running it

Requires Node 18+.

```bash
# 1. Backend
cd server
npm install
cp .env.example .env      # optional — add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY to use a real LLM agent
npm run dev                # http://localhost:4000

# 2. Frontend (separate terminal)
cd client
npm install
npm run dev                # http://localhost:5173 (proxies /api to :4000)
```

Open `http://localhost:5173`, review the scenario snapshot on the left, and
click **Run agent**. The center panel streams the live trace (tool calls,
reasoning, action, validation); the right panel shows the final decision,
the purchase order, and a pass/fail checklist for every hard constraint.

Without a `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`, the mode badge shows
"Rule-based agent" and everything still runs end to end. Add a Gemini key
(free, no card required) and re-run to see the same scenario reasoned
through live by an LLM with tool use.

## Design decisions worth calling out in discussion

- **Tool-use over a single prompt.** The agent doesn't get a pre-baked
  context dump — it has to call tools to investigate, which is what makes
  it an *agent* rather than a classifier, and mirrors how a real system
  would need to hit several internal services.
- **`validate_order` is available *before* `create_purchase_order`**, and
  the LLM agent's system prompt tells it to compare candidates before
  committing — this is what lets it reject the incumbent supplier instead
  of just accepting whatever the upstream engine said.
- **The agent is told, explicitly, not to hide unresolved risk.** The
  validation step after the action still surfaces the projected stockout
  gap. A purchasing agent that silently reports success on a partial fix is
  worse than one that flags the gap for a human to cover.
- **Rule-based fallback isn't a toy** — it's a legitimate deterministic
  policy implementation, which matters for a real buyer tool: you may want
  guaranteed, auditable behavior for some SKUs/categories and LLM judgment
  for others.

## What I'd extend next

- More scenarios (low-stock reorder without a supplier event; storage-only
  constraint; multi-SKU budget contention) using the same tool set —
  the agent/tool layer doesn't need to change, only the fixture + trigger.
- Persist the trace and PO history (currently in-memory, resets each run).
- A "confidence to auto-execute" threshold — small, clearly-compliant
  orders auto-place; anything that fails a validation check or exceeds a
  cost threshold routes to a human buyer for approval instead of the agent
  acting unilaterally.
- Multi-agent split (an "investigator" and a "reviewer" agent) so the
  validation step is genuinely adversarial rather than self-graded.
