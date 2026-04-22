/* POST /api/estimate
 * Single endpoint. Validates form → runs Claude → emails result to user + internal
 * lead notification to sales. Returns { ok: true } — the result is delivered via email,
 * not rendered on page.
 */

import { runEstimate } from "./_lib/claude.js";
import { sendEstimateEmail, sendSalesNotification } from "./_lib/email.js";

const VALID_TYPES     = new Set(["web", "mobile", "automation", "mvp"]);
const VALID_SOURCES   = new Set(["referral","clutch","google","linkedin","twitter","newsletter","event","podcast","social","other"]);
const VALID_URGENCIES = new Set(["asap","30_days","quarter","6_months","exploring"]);

// Basic IP rate limit (in-memory, resets per cold start). Use Upstash/Vercel KV for durable.
const rateMap = new Map();
function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, ts: now };
  if (now - entry.ts > 60 * 60 * 1000) { entry.count = 0; entry.ts = now; }
  entry.count += 1;
  rateMap.set(ip, entry);
  return entry.count > 10;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  if (rateLimited(ip)) return res.status(429).json({ error: "rate_limited" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  // Honeypot
  if (body.website || body.company_name_confirm) {
    console.warn("[estimate] honeypot hit, ip:", ip);
    return res.status(400).json({ error: "spam_detected" });
  }

  // Time-trap — at least 8 seconds to reach this endpoint
  if (typeof body.elapsed !== "number" || body.elapsed < 8000) {
    return res.status(400).json({ error: "too_fast" });
  }

  // Project validation
  const projectType = VALID_TYPES.has(body.projectType) ? body.projectType : "web";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description.length < 40 || description.length > 2500) return res.status(400).json({ error: "invalid_description" });

  // Contact validation
  const email   = typeof body.email === "string" ? body.email.trim() : "";
  const country = typeof body.country === "string" ? body.country.trim() : "";
  const city    = typeof body.city === "string" ? body.city.trim() : "";
  const source  = typeof body.source === "string" ? body.source : "";
  const urgency = typeof body.urgency === "string" ? body.urgency : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "invalid_email" });
  if (!country || country.length > 40)           return res.status(400).json({ error: "invalid_country" });
  if (!city || city.length < 2 || city.length > 80) return res.status(400).json({ error: "invalid_city" });
  if (!VALID_SOURCES.has(source))     return res.status(400).json({ error: "invalid_source" });
  if (!VALID_URGENCIES.has(urgency))  return res.status(400).json({ error: "invalid_urgency" });

  const projectData = {
    projectType,
    description,
    budget:   typeof body.budget === "string" && body.budget ? body.budget : null,
    timeline: typeof body.timeline === "string" && body.timeline ? body.timeline : null
  };
  const contactData = { email, country, city, source, urgency };

  // Run Claude
  let estimate;
  try {
    estimate = await runEstimate({ projectData, contactData });
  } catch (err) {
    console.error("[estimate] Claude failed:", err?.message || err);
    return res.status(500).json({ error: "estimation_failed" });
  }

  // Fan-out email — user + sales
  try {
    await Promise.all([
      sendEstimateEmail({ to: email, estimate, projectData, contactData }),
      sendSalesNotification({ estimate, projectData, contactData })
    ]);
  } catch (err) {
    // Email failures should not block the UX — the user already clicked submit.
    // The client treats any 2xx as success. Log for investigation.
    console.error("[estimate] email delivery failed:", err?.message || err);
  }

  return res.status(200).json({ ok: true });
}
