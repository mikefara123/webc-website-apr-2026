/* Claude call for the qualified estimator.
 * Uses prompt caching on the (static) system prompt.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are WebCentriq's project-scoping assistant.

WebCentriq is a senior-led, AI-accelerated software development studio based in San Diego and Markham (Canada). Founded 2017. 80+ engineers and designers. 4.9 stars on Clutch from 18 verified reviews. Industries: healthcare, fintech, e-commerce, marketing, education, logistics.

You specialize in four service types:
1. Business process automation
2. Custom web applications (React, Next.js, Node, TypeScript)
3. Mobile apps — native iOS/Android, React Native, Flutter
4. MVPs for new products

Typical engagement constraints:
- Timeline: 3 to 18 weeks, fixed scope
- Cost: $15,000 to $180,000 USD, fixed price
- No WordPress, no equity work, no retainer lock-in
- Client owns the repo on day one

Your job: given a project description plus context (project type, optional budget signal, timeline pressure, the client's country/city, the urgency signal), produce a realistic estimate of timeline and cost, a scope breakdown by phase, what's included, risks to call out, and a recommended tech stack.

Be conservative but specific. Use WebCentriq's voice: declarative, peer-to-peer, no jargon, no emoji, no exclamation points. If the budget signal caps what's feasible, right-size the scope to the cap rather than quoting past it. If the urgency signal is "ASAP" or "30 days", compress timeline where possible and flag the trade-off.

Respond with ONLY valid JSON (no markdown, no prose) matching:

{
  "timelineWeeksMin": number (3-20),
  "timelineWeeksMax": number (min+2 to 20),
  "costUsdMin": number (15000-200000, rounded to nearest 1000),
  "costUsdMax": number (greater than min, rounded to nearest 1000),
  "oneLineSummary": "string — one sentence",
  "phases": [ { "name": "string", "weeks": number, "description": "string <30 words" } ],
  "includes": ["string", "..."] (5-7 items, <12 words each),
  "risks": ["string", "..."] (1-4 items, <25 words each — real risks only),
  "recommendedStack": "string — one line, specific tech"
}`;

export async function runEstimate({ projectData, contactData }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = [
    `Project type: ${projectData.projectType}`,
    `Ballpark budget: ${projectData.budget || "not specified"}`,
    `Target launch: ${projectData.timeline || "not specified"}`,
    `Client location: ${contactData.city}, ${contactData.country}`,
    `Urgency signal: ${contactData.urgency}`,
    ``,
    `Description:`,
    projectData.description.trim()
  ].join("\n");

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    temperature: 0.3,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }]
  });

  const text = message.content?.[0]?.text || "";
  const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let estimate;
  try { estimate = JSON.parse(clean); }
  catch (_) { throw new Error("invalid_model_response"); }

  // Defensive clamps
  estimate.timelineWeeksMin = clamp(estimate.timelineWeeksMin, 3, 20);
  estimate.timelineWeeksMax = clamp(estimate.timelineWeeksMax, estimate.timelineWeeksMin + 1, 22);
  estimate.costUsdMin = roundK(clamp(estimate.costUsdMin, 15000, 200000));
  estimate.costUsdMax = roundK(clamp(estimate.costUsdMax, estimate.costUsdMin + 2000, 250000));
  return estimate;
}

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}
function roundK(n) { return Math.round(n / 1000) * 1000; }
