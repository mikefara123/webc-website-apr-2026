/* POST /api/estimate
 * Single endpoint. Validates form → runs Claude → emails result to user + internal
 * lead notification to sales. Returns { ok: true } — the result is delivered via email,
 * not rendered on page.
 */

import { runEstimate } from "./_lib/claude.js";
import { sendEstimateEmail, sendSalesNotification } from "./_lib/email.js";
import { generateEstimatePdf, makeRefId } from "./_lib/pdf.js";

const VALID_TYPES     = new Set(["web", "mobile", "automation", "mvp"]);
const VALID_SOURCES   = new Set(["referral","clutch","google","linkedin","twitter","newsletter","event","podcast","social","other"]);
const VALID_URGENCIES = new Set(["asap","30_days","quarter","6_months","exploring"]);

// Tighter email regex — rejects quotes, angle brackets, whitespace, slashes that could enable HTML-attribute injection
// even after escapeHtml (belt + suspenders).
const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

// Max request body size (bytes). A valid submission is <5KB; anything bigger is abusive.
const MAX_BODY_BYTES = 8 * 1024;

// Allowed browser origins for cross-origin requests. Same-origin (no Origin header) is always accepted.
// Production domains + Vercel preview URLs for this project.
const ALLOWED_ORIGINS = [
  "https://webcentriq.com",
  "https://www.webcentriq.com",
];
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/webc-website-apr-2026(-[a-z0-9-]+)?\.vercel\.app$/,
];
function isOriginAllowed(origin) {
  if (!origin) return true; // same-origin (browsers don't send Origin for same-origin fetches)
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

// Basic IP rate limit (in-memory, resets per cold start). TODO: migrate to Upstash Redis for durable.
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
  const origin = req.headers.origin || "";

  // CORS: echo only allowed origins; never use wildcard.
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  // Origin enforcement (browser-side CORS only blocks the response, not the request). We must
  // refuse disallowed cross-origin calls server-side to prevent cost-exhaustion from rogue sites.
  if (origin && !isOriginAllowed(origin)) {
    return res.status(403).json({ error: "origin_not_allowed" });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  if (rateLimited(ip)) return res.status(429).json({ error: "rate_limited" });

  // Body-size guard
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  if (contentLength > MAX_BODY_BYTES) return res.status(413).json({ error: "payload_too_large" });

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
  if (!EMAIL_REGEX.test(email) || email.length > 254) return res.status(400).json({ error: "invalid_email" });
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

  const refId = makeRefId();

  // Generate PDF (shared between both recipients). If generation fails, still send emails
  // without attachment — the email body has the same content.
  let pdfBuffer = null;
  try {
    pdfBuffer = await generateEstimatePdf({ estimate, projectData, contactData, refId });
  } catch (err) {
    console.error("[estimate] pdf generation failed:", err?.message || err);
  }

  // Fan-out email — user + sales
  try {
    await Promise.all([
      sendEstimateEmail({ to: email, estimate, projectData, contactData, pdfBuffer, refId }),
      sendSalesNotification({ estimate, projectData, contactData, pdfBuffer, refId })
    ]);
  } catch (err) {
    // Email failures should not block the UX — the user already clicked submit.
    // The client treats any 2xx as success. Log for investigation.
    console.error("[estimate] email delivery failed:", err?.message || err);
  }

  return res.status(200).json({ ok: true });
}
