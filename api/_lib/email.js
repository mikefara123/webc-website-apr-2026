/* Email helpers — Resend.
 * Two templates: full estimate (to user), lead notification (to sales).
 * Both emails attach the same generated PDF.
 */

import { Resend } from "resend";

const FROM_ADDRESS = process.env.ESTIMATOR_FROM || "WebCentriq <hello@webcentriq.com>";
const SALES_ADDRESS = process.env.ESTIMATOR_SALES_TO || "hello@webcentriq.com";
const SCHEDULE_URL = process.env.SCHEDULE_URL || "https://calendly.com/hello-webcentriq/30min";
const SITE_URL = process.env.SITE_URL || "https://webcentriq.com";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ----- Shared email styles (inline-safe, email-client-tested) -----
const BASE_STYLES = `
  body { margin:0; padding:0; background:#0A0A0A; color:#FAFAFA; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 40px 24px; background:#0A0A0A; }
  .brand { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; color: #FAFAFA; margin-bottom: 24px; }
  .brand span { font-weight: 900; }
  .eyebrow { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #FF4D00; font-weight: 600; margin-bottom: 6px; }
  h1 { font-size: 28px; line-height: 1.1; font-weight: 800; letter-spacing: -0.025em; margin: 0 0 14px; color:#FAFAFA; }
  h2 { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #8A8A8A; font-weight: 600; margin: 32px 0 12px; }
  p  { font-size: 15px; line-height: 1.6; color: #B5B5B5; margin: 0 0 14px; }
  .lead { color: #FAFAFA; font-size: 16px; line-height: 1.55; margin: 0 0 20px; }
  .numbers { width: 100%; border: 1px solid #262626; border-collapse: collapse; margin: 8px 0 24px; }
  .numbers td { padding: 20px 24px; border: 1px solid #262626; vertical-align: top; width: 50%; background:#0A0A0A; }
  .num-label { font-family: "SF Mono", Menlo, monospace; font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #8A8A8A; margin-bottom: 4px; }
  .num-value { font-size: 28px; font-weight: 800; letter-spacing: -0.025em; line-height: 1; color: #FAFAFA; margin: 4px 0; }
  .num-value.accent { color: #FF4D00; }
  .num-sub { font-size: 11px; color: #5A5A5A; }
  .bullet { padding: 0 0 10px 16px; position: relative; font-size: 14px; line-height: 1.5; color: #FAFAFA; }
  .bullet::before { content:""; position:absolute; left:0; top:8px; width:8px; height:1px; background:#FF4D00; }
  .question { border-left: 2px solid #FF4D00; padding: 4px 0 4px 16px; margin: 0 0 14px; }
  .question-num { font-family: "SF Mono", Menlo, monospace; font-size: 10px; letter-spacing: 0.15em; color: #FF4D00; margin-bottom: 2px; }
  .question-text { font-size: 14.5px; line-height: 1.5; color: #FAFAFA; }
  .cta { display: inline-block; background: #FF4D00; color: #FFFFFF !important; padding: 16px 28px; text-decoration: none; font-weight: 600; font-size: 15px; border-radius: 4px; margin: 8px 0; }
  .cta-note { font-size: 12px; color: #8A8A8A; margin: 8px 0 0; }
  .footer { margin-top: 40px; padding-top: 24px; border-top: 1px solid #262626; color: #5A5A5A; font-size: 12px; line-height: 1.5; }
  .footer a { color: #8A8A8A; }
  .footer-stars { color:#FF4D00; }
`;

const logoBlock = `<div class="brand">Web<span>C</span>entriq</div>`;

// ============== 1) Full estimate email to user ==============
export async function sendEstimateEmail({ to, estimate, projectData, contactData, pdfBuffer, refId }) {
  if (!resend) {
    console.log("[email:estimate] (no Resend key — would send) to:", redactEmail(to), "ref:", refId, "pdf bytes:", pdfBuffer?.length || 0);
    return { ok: true, mock: true };
  }
  const html = buildEstimateHtml({ estimate, projectData, contactData, refId });
  const subject = `Your WebCentriq estimate: ${estimate.timelineWeeksMin}–${estimate.timelineWeeksMax} weeks, $${Math.round(estimate.costUsdMin/1000)}K–$${Math.round(estimate.costUsdMax/1000)}K`;

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: [to],
    replyTo: SALES_ADDRESS,
    subject,
    html,
    attachments: pdfBuffer ? [{
      filename: `WebCentriq-Estimate-${refId}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    }] : []
  });
  if (error) throw new Error(`resend_estimate: ${error.message || error}`);
  return { ok: true, id: data?.id };
}

// ============== 2) Internal lead notification to sales ==============
export async function sendSalesNotification({ estimate, projectData, contactData, pdfBuffer, refId }) {
  if (!resend) {
    console.log("[email:sales-notify] (no Resend key — would send) for:", redactEmail(contactData.email), "ref:", refId);
    return { ok: true, mock: true };
  }
  // Sanitize subject (no header injection)
  const safeCity    = String(contactData.city || "").replace(/[\r\n]/g, " ").slice(0, 40);
  const safeCountry = String(contactData.country || "").replace(/[\r\n]/g, " ").slice(0, 40);
  const subject = `[Lead · ${contactData.urgency}] ${contactData.email} · ${safeCountry}/${safeCity} · ${estimate.timelineWeeksMin}-${estimate.timelineWeeksMax}wk · $${Math.round(estimate.costUsdMin/1000)}-$${Math.round(estimate.costUsdMax/1000)}K`;

  const html = `
    <!doctype html><html><head><meta charset="utf-8"/><style>${BASE_STYLES}</style></head>
    <body><div class="wrap">
      ${logoBlock}
      <div class="eyebrow">New lead · ref ${escapeHtml(refId)}</div>
      <h1>New qualified lead.</h1>
      <p class="lead">AI estimate generated and emailed to the lead. PDF attached. Reply directly to engage — reply-to on this message is set to the lead's address.</p>

      <h2>Contact</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#8A8A8A;width:160px;font-size:13px;">Email</td><td style="color:#FAFAFA;font-size:14px;"><a href="mailto:${encodeURIComponent(contactData.email)}" style="color:#FF4D00;">${escapeHtml(contactData.email)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#8A8A8A;font-size:13px;">Location</td><td style="color:#FAFAFA;font-size:14px;">${escapeHtml(contactData.city)}, ${escapeHtml(contactData.country)}</td></tr>
        <tr><td style="padding:6px 0;color:#8A8A8A;font-size:13px;">Heard via</td><td style="color:#FAFAFA;font-size:14px;">${escapeHtml(contactData.source)}</td></tr>
        <tr><td style="padding:6px 0;color:#8A8A8A;font-size:13px;">Urgency</td><td style="color:#FAFAFA;font-size:14px;"><strong>${escapeHtml(contactData.urgency)}</strong></td></tr>
      </table>

      <h2>Project</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#8A8A8A;width:160px;font-size:13px;">Type</td><td style="color:#FAFAFA;font-size:14px;">${escapeHtml(projectData.projectType)}</td></tr>
        <tr><td style="padding:6px 0;color:#8A8A8A;font-size:13px;">Budget signal</td><td style="color:#FAFAFA;font-size:14px;">${escapeHtml(projectData.budget || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#8A8A8A;font-size:13px;">Timeline signal</td><td style="color:#FAFAFA;font-size:14px;">${escapeHtml(projectData.timeline || "—")}</td></tr>
      </table>
      <div style="margin:12px 0;padding:14px 18px;border-left:2px solid #FF4D00;color:#FAFAFA;font-style:italic;background:#141414;font-size:14px;line-height:1.55;">
        ${escapeHtml(projectData.description)}
      </div>

      <h2>AI estimate</h2>
      <table class="numbers">
        <tr>
          <td><div class="num-label">TIMELINE</div><div class="num-value">${estimate.timelineWeeksMin}–${estimate.timelineWeeksMax} wks</div></td>
          <td><div class="num-label">FIXED-PRICE RANGE</div><div class="num-value accent">$${Math.round(estimate.costUsdMin/1000)}K–$${Math.round(estimate.costUsdMax/1000)}K</div></td>
        </tr>
      </table>
      <p style="color:#FAFAFA;">${escapeHtml(estimate.oneLineSummary)}</p>

      <h2>What the AI heard</h2>
      ${(estimate.understandingBullets || []).map((b) => `<div class="bullet">${escapeHtml(b)}</div>`).join("")}

      <h2>Clarifying questions sent to lead</h2>
      ${(estimate.clarifyingQuestions || []).map((q, i) => `<div class="question"><div class="question-num">Q${String(i + 1).padStart(2, "0")}</div><div class="question-text">${escapeHtml(q)}</div></div>`).join("")}

      <h2>Risks flagged</h2>
      ${(estimate.risks || []).map((r) => `<div class="bullet">${escapeHtml(r)}</div>`).join("")}

      <div class="footer">
        Sent by the WebCentriq estimator · reply-to ${escapeHtml(contactData.email)}<br/>
        Attached: <code>WebCentriq-Estimate-${escapeHtml(refId)}.pdf</code>
      </div>
    </div></body></html>`;

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: [SALES_ADDRESS],
    replyTo: contactData.email,
    subject,
    html,
    attachments: pdfBuffer ? [{
      filename: `WebCentriq-Estimate-${refId}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    }] : []
  });
  if (error) console.error("[email:sales-notify] failed:", error);
  return { ok: !error, id: data?.id };
}

// ============== User-facing HTML email body ==============
function buildEstimateHtml({ estimate, projectData, contactData, refId }) {
  const typeLabel = ({ web: "custom web app", mobile: "mobile app", automation: "business process automation", mvp: "MVP" })[projectData.projectType] || "software project";

  return `
    <!doctype html><html><head><meta charset="utf-8"/><style>${BASE_STYLES}</style></head>
    <body><div class="wrap">
      ${logoBlock}

      <div class="eyebrow">Your AI estimate · ref ${escapeHtml(refId)}</div>
      <h1>Estimate for your ${escapeHtml(typeLabel)}.</h1>
      <p class="lead">${escapeHtml(estimate.oneLineSummary)}</p>

      <table class="numbers">
        <tr>
          <td>
            <div class="num-label">TIMELINE</div>
            <div class="num-value">${estimate.timelineWeeksMin}–${estimate.timelineWeeksMax} weeks</div>
            <div class="num-sub">brief to production</div>
          </td>
          <td>
            <div class="num-label">FIXED-PRICE RANGE</div>
            <div class="num-value accent">$${Math.round(estimate.costUsdMin/1000)}K–$${Math.round(estimate.costUsdMax/1000)}K</div>
            <div class="num-sub">plain-English scope before work starts</div>
          </td>
        </tr>
      </table>

      <h2>What we heard</h2>
      ${(estimate.understandingBullets || []).map((b) => `<div class="bullet">${escapeHtml(b)}</div>`).join("")}

      <h2>Three questions to sharpen the scope</h2>
      <p style="font-size:14px;line-height:1.55;">Reply to this email with your answers — or book a 30-minute call with the senior engineer who would lead the build.</p>
      ${(estimate.clarifyingQuestions || []).map((q, i) => `<div class="question"><div class="question-num">Q${String(i + 1).padStart(2, "0")}</div><div class="question-text">${escapeHtml(q)}</div></div>`).join("")}

      <p style="margin-top:24px;">
        <a href="${SCHEDULE_URL}" class="cta">Schedule a 30-minute call &rarr;</a>
      </p>
      <p class="cta-note">${escapeHtml(SCHEDULE_URL)}</p>

      <h2>Scope breakdown</h2>
      ${(estimate.phases || []).map((p, i) => `
        <div style="padding:10px 0;border-top:1px solid #262626;">
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <span style="font-family:'SF Mono',Menlo,monospace;font-size:10px;letter-spacing:0.15em;color:#8A8A8A;width:32px;">${String(i + 1).padStart(2, "0")}</span>
            <span style="flex:1;font-weight:600;color:#FAFAFA;font-size:14px;">${escapeHtml(p.name)}</span>
            <span style="font-family:'SF Mono',Menlo,monospace;font-size:10px;letter-spacing:0.15em;color:#FF4D00;">${p.weeks} WK${p.weeks === 1 ? "" : "S"}</span>
          </div>
          <p style="font-size:13px;color:#B5B5B5;margin:4px 0 0 32px;line-height:1.5;">${escapeHtml(p.description || "")}</p>
        </div>
      `).join("")}

      <h2>What's included</h2>
      ${(estimate.includes || []).map((x) => `<div class="bullet">${escapeHtml(x)}</div>`).join("")}

      <h2>Things to watch</h2>
      ${(estimate.risks || []).map((x) => `<div class="bullet">${escapeHtml(x)}</div>`).join("")}

      <h2>Recommended stack</h2>
      <p style="font-family:'SF Mono',Menlo,monospace;font-size:13px;color:#FAFAFA;line-height:1.5;">${escapeHtml(estimate.recommendedStack || "")}</p>

      <p style="margin-top:32px;padding:18px 20px;background:#141414;border:1px solid #262626;color:#FAFAFA;font-size:14px;line-height:1.55;">
        <strong>Next step.</strong> A senior engineer reviews this AI estimate, refines the scope, and reaches out within 72 hours. Reply here to accelerate, or <a href="${SCHEDULE_URL}" style="color:#FF4D00;">book a 30-minute call</a>.
      </p>

      <p style="font-size:13px;color:#8A8A8A;margin-top:16px;">
        Full PDF estimate is attached to this email: <strong>WebCentriq-Estimate-${escapeHtml(refId)}.pdf</strong>
      </p>

      <div class="footer">
        <div style="margin-bottom:6px;">
          <span class="footer-stars">★★★★★</span>&nbsp; 4.9 on <a href="https://clutch.co/profile/webcentriq">Clutch</a> from 18 verified reviews
        </div>
        WebCentriq Inc. &middot; San Diego &middot; Markham (Canada) &middot; Shipping since 2017<br/>
        <a href="mailto:hello@webcentriq.com">hello@webcentriq.com</a> &middot;
        <a href="${SITE_URL}/">webcentriq.com</a> &middot;
        <a href="${SITE_URL}/privacy.html">Privacy</a><br/>
        <span style="font-size:11px;color:#5A5A5A;">You received this because you submitted ${escapeHtml(contactData.email)} on webcentriq.com.</span>
      </div>
    </div></body></html>`;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Redact an email for logs: foo@example.com → f**@example.com
function redactEmail(e) {
  if (!e || typeof e !== "string") return "[none]";
  const [local, domain] = e.split("@");
  if (!domain) return "[malformed]";
  const prefix = local.charAt(0) || "";
  return `${prefix}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}
