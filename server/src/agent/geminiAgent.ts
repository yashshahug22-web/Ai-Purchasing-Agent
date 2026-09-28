import { GoogleGenAI, Content, Part, FunctionDeclaration } from "@google/genai";
import { Store } from "../data/store";
import { toolDefinitions, dispatchTool } from "./tools";
import { AgentRunResult, TraceEvent } from "./types";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const SYSTEM_PROMPT = `You are the AI Purchasing Agent for a quick-commerce fulfillment node.

A supplier has just changed the terms on an active product (price and/or minimum order
quantity), which triggered a re-evaluation. An upstream legacy rules engine already produced
a recommendation, but it is a simple threshold rule and its warning explicitly says it has
NOT checked storage capacity, budget, or alternate suppliers. Treat it as a hypothesis to
verify, not a conclusion to accept.

Your job, in order:
1. INVESTIGATE: use the read-only tools to gather inventory, demand forecast, existing POs,
   supplier options (including the changed terms and any alternates), warehouse capacity, and
   budget. Call get_upstream_recommendation to see what was originally suggested.
2. DECIDE: reason about trade-offs (cost, MOQ, storage fit, budget fit, lead time vs.
   days-of-stock-left). Use validate_order on any candidate (supplier, quantity) pair before
   committing — you may compare more than one candidate.
3. ACT: once you've picked a final supplier and quantity that you believe is correct, call
   create_purchase_order to place it.
4. VALIDATE THE OUTCOME: after creating the order, call validate_order again on the exact
   order you placed and report the result plainly, including any risk that could NOT be fully
   resolved (e.g. a stockout gap), rather than hiding it.

Be explicit in your reasoning text about whether you are accepting or rejecting the upstream
recommendation, and why. When you are done (no more tools to call), write a final short
summary of the decision, the action taken, and the validation outcome.`;

/** Convert our shared JSON-schema tool defs into Gemini FunctionDeclarations.
 * `parametersJsonSchema` accepts a plain JSON Schema object directly, so the
 * same tool definitions used for the Claude agent work here unchanged. */
const geminiFunctionDeclarations: FunctionDeclaration[] = toolDefinitions.map((t) => ({
  name: t.name,
  description: t.description,
  parametersJsonSchema: t.input_schema,
}));

export async function runGeminiAgent(store: Store): Promise<AgentRunResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const trace: TraceEvent[] = [];
  const now = () => new Date().toISOString();

  const upstream = store.getUpstreamRecommendation();
  trace.push({
    type: "trigger",
    label: "Supplier condition change detected",
    detail: upstream,
    timestamp: now(),
  });

  const contents: Content[] = [
    {
      role: "user",
      parts: [
        {
          text: "A supplier condition change event just fired for this product. Investigate, decide, act, and validate, per your instructions.",
        },
      ],
    },
  ];

  let createdPo: unknown = null;
  let lastValidation: unknown = null;
  const MAX_TURNS = 10;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: geminiFunctionDeclarations }],
      },
    });

    const candidate = response.candidates?.[0];
    const modelParts = candidate?.content?.parts ?? [];
    // Echo the model's own turn back into history so it has full context next loop.
    contents.push({ role: "model", parts: modelParts });

    for (const part of modelParts) {
      if (part.text && part.text.trim()) {
        trace.push({ type: "thought", label: "Agent reasoning", detail: part.text, timestamp: now() });
      }
    }

    const calls = response.functionCalls;

    if (!calls || calls.length === 0) {
      const finalText = modelParts
        .filter((p) => typeof p.text === "string")
        .map((p) => p.text)
        .join("\n");
      trace.push({ type: "final", label: "Agent summary", detail: finalText, timestamp: now() });
      break;
    }

    const functionResponseParts: Part[] = [];

    for (const call of calls) {
      const name = call.name!;
      const args = call.args ?? {};
      trace.push({ type: "tool_call", label: `Called tool: ${name}`, detail: args, timestamp: now() });

      let result: unknown;
      try {
        result = dispatchTool(store, name, args);
      } catch (err: any) {
        result = { error: err.message };
      }

      if (name === "create_purchase_order") {
        createdPo = result;
        trace.push({ type: "action", label: "Purchase order created", detail: result, timestamp: now() });
      } else if (name === "validate_order") {
        lastValidation = result;
        trace.push({ type: "validation", label: "Validation check", detail: result, timestamp: now() });
      } else {
        trace.push({ type: "tool_result", label: `Result: ${name}`, detail: result, timestamp: now() });
      }

      functionResponseParts.push({
        functionResponse: { name, response: { result } },
      });
    }

    contents.push({ role: "user", parts: functionResponseParts });
  }

  const po: any = createdPo;
  return {
    mode: "llm",
    trace,
    decision: {
      chosenSupplierId: po?.supplierId ?? "unresolved",
      cases: po?.cases ?? 0,
      justification: (trace.filter((t) => t.type === "final")[0]?.detail as string) || "",
      rejectedUpstreamRecommendation:
        po?.supplierId !== (upstream as any).supplierId || po?.cases !== (upstream as any).cases,
    },
    purchaseOrder: createdPo,
    validation: lastValidation,
  };
}
