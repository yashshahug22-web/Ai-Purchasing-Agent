import Anthropic from "@anthropic-ai/sdk";
import { Store } from "../data/store";
import { toolDefinitions, dispatchTool } from "./tools";
import { AgentRunResult, TraceEvent } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

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
recommendation, and why. When you are done, write a final short summary of the decision, the
action taken, and the validation outcome.`;

export async function runLlmAgent(store: Store): Promise<AgentRunResult> {
  const anthropic = new Anthropic();
  const trace: TraceEvent[] = [];
  const now = () => new Date().toISOString();

  const upstream = store.getUpstreamRecommendation();
  trace.push({
    type: "trigger",
    label: "Supplier condition change detected",
    detail: upstream,
    timestamp: now(),
  });

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        "A supplier condition change event just fired for this product. Investigate, decide, act, and validate, per your instructions.",
    },
  ];

  let createdPo: unknown = null;
  let lastValidation: unknown = null;
  const MAX_TURNS = 10;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions as Anthropic.Tool[],
      messages,
    });

    type InputBlock = Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam | Anthropic.ToolResultBlockParam;
    const assistantContent: InputBlock[] = [];
    const toolResultsContent: InputBlock[] = [];

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        trace.push({ type: "thought", label: "Agent reasoning", detail: block.text, timestamp: now() });
        assistantContent.push(block);
      } else if (block.type === "tool_use") {
        assistantContent.push(block);
        trace.push({
          type: "tool_call",
          label: `Called tool: ${block.name}`,
          detail: block.input,
          timestamp: now(),
        });

        let result: unknown;
        let isError = false;
        try {
          result = dispatchTool(store, block.name, block.input);
        } catch (err: any) {
          result = { error: err.message };
          isError = true;
        }

        if (block.name === "create_purchase_order" && !isError) {
          createdPo = result;
          trace.push({ type: "action", label: "Purchase order created", detail: result, timestamp: now() });
        } else if (block.name === "validate_order") {
          lastValidation = result;
          trace.push({ type: "validation", label: "Validation check", detail: result, timestamp: now() });
        } else {
          trace.push({ type: "tool_result", label: `Result: ${block.name}`, detail: result, timestamp: now() });
        }

        toolResultsContent.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
          is_error: isError,
        });
      }
    }

    messages.push({ role: "assistant", content: assistantContent });

    if (response.stop_reason !== "tool_use") {
      // Agent is done reasoning; capture its final summary and stop.
      const finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      trace.push({ type: "final", label: "Agent summary", detail: finalText, timestamp: now() });
      break;
    }

    messages.push({ role: "user", content: toolResultsContent });
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
