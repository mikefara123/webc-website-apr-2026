/* Email helpers — Resend.
 * Two templates: full estimate (to user), lead notification (to sales).
 */

import { Resend } from "resend";

const FROM_ADDRESS = process.env.ESTIMATOR_FROM || "WebCentriq <estimator@webcentriq.com>";
const SALES_ADDRESS = process.env.ESTIMATOR_SALES_TO || "sales@webcentriq.com";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ----- Shared styling for email templates -----
const BASE_STYLES = `
  body { margin:0; padding:0; background:#0A0A0A; color:#FAFAFA; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 48px 24px; background:#0A0A0A; }
  .logo { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: #FAFAFA; margin-bottom: 32px; }
  .logo span { font-weight: 900; }
  h1 { font-size: 32px; line-height: 1.1; font-weight: 800; letter-spacing: -0.025em; margin: 0 0 16px; color:#FAFAFA; }
  h2 { font-size: 20px; font-weight: 700; letter-spacing: -0.015em; margin: 32px 0 12px; color:#FAFAFA; }
  p  { font-size: 16px; line-height: 1.6; color: #B5B5B5; margin: 0 0 16px; }
  .mono { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #8A8A8A; }
  .code-box { border: 1px solid #262626; padding: 32px; text-align: center; margin: 24px 0; background:#141414; }
  .code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 42px; letter-spacing: 0.3em; font-weight: 700; color:#FF4D00; }
  .numbers { display: table; width: 100%; border: 1px solid #262626; border-collapse: collapse; margin: 24px 0; }
  .numbers td { padding: 24px; border: 1px solid #262626; vertical-align: top; width: 50%; background:#141414; }
  .num-value { font-size: 36px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; margin: 8px 0; }
  .num-value.accent { color: #FF4D00; }
  .phase { border-top: 1px solid #262626; padding: 12px 0; }
  .phase:first-child { border-top: none; padding-top: 0; }
  .phase-head { font-weight: 600; color: #FAFAFA; display: flex; justify-content: space-between; }
  .phase-weeks { color: #FF4D00; font-family: "SF Mono", Menlo, monospace; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; }
  ul { padding-left: 20px; margin: 0 0 16px; color:#B5B5B5; }
  li { margin-bottom: 8px; line-height: 1.5; }
  .cta { display: inline-block; background: #FF4D00; color: #fff !important; padding: 14px 24px; text-decoration: none; font-weight: 500; border-radius: 4px; margin-top: 16px; }
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #262626; color: #5A5A5A; font-size: 12px; }
  .footer a { color: #8A8A8A; }
`;

const logoBlock = `<div class="logo">Web<span>C</span>entriq</div>`;

// ============== 1) Full estimate email to user ==============
export async function sendEstimateEmail({ to, estimate, projectData, contactData }) {
  if (!resend) {
    console.log("[email:estimate] (no Resend key — would send) to:", to);
    return { ok: true, mock: true };
  }
  const html = buildEstimateHtml({ estimate, projectData, contactData });
  const subject = `Your WebCentriq estimate: ${estimate.timelineWeeksMin}–${estimate.timelineWeeksMax} weeks, $${Math.round(estimate.costUsdMin/1000)}K–$${Math.round(estimate.costUsdMax/1000)}K`;

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: [to],
    reply_to: SALES_ADDRESS,
    subject,
    html
  });
  if (error) throw new Error(`resend_estimate: ${error.message || error}`);
  return { ok: true, id: data?.id };
}

// ============== 2) Internal lead notification to sales ==============
export async function sendSalesNotification({ estimate, projectData, contactData }) {
  if (!resend) {
    console.log("[email:sales-notify] (no Resend key — would send)", { contactData, estimate });
    return { ok: true, mock: true };
  }
  const subject = `[Lead] ${contactData.email} · ${contactData.country}/${contactData.city} · ${estimate.timelineWeeksMin}-${estimate.timelineWeeksMax}wk, $${Math.round(estimate.costUsdMin/1000)}-$${Math.round(estimate.costUsdMax/1000)}K`;

  const html = `
    <!doctype html><html><head><meta charset="utf-8"/><style>${BASE_STYLES}</style></head>
    <body><div class="wrap">
      ${logoBlock}
      <h1>New qualified lead.</h1>
      <p style="color:#FAFAFA;">Verified via OTP. AI estimate generated and emailed to the lead. Reply directly to engage.</p>

      <h2>Contact</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#8A8A8A;width:180px;">Email</td><td style="color:#FAFAFA;"><a href="mailto:${contactData.email}" style="color:#FF4D00;">${contactData.email}</a></td></tr>
        <tr><td style="padding:8px 0;color:#8A8A8A;">Location</td><td style="color:#FAFAFA;">${escapeHtml(contactData.city)}, ${escapeHtml(contactData.country)}</td></tr>
        <tr><td style="padding:8px 0;color:#8A8A8A;">Heard via</td><td style="color:#FAFAFA;">${escapeHtml(contactData.source)}</td></tr>
        <tr><td style="padding:8px 0;color:#8A8A8A;">Urgency</td><td style="color:#FAFAFA;"><strong>${escapeHtml(contactData.urgency)}</strong></td></tr>
      </table>

      <h2>Project</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#8A8A8A;width:180px;">Type</td><td style="color:#FAFAFA;">${escapeHtml(projectData.projectType)}</td></tr>
        <tr><td style="padding:8px 0;color:#8A8A8A;">Budget signal</td><td style="color:#FAFAFA;">${escapeHtml(projectData.budget || "—")}</td></tr>
        <tr><td style="padding:8px 0;color:#8A8A8A;">Timeline signal</td><td style="color:#FAFAFA;">${escapeHtml(projectData.timeline || "—")}</td></tr>
      </table>
      <div style="margin:16px 0;padding:16px;border-left:2px solid #FF4D00;color:#FAFAFA;font-style:italic;background:#141414;">
        ${escapeHtml(projectData.description)}
      </div>

      <h2>AI estimate</h2>
      <table class="numbers">
        <tr>
          <td><div class="mono">TIMELINE</div><div class="num-value">${estimate.timelineWeeksMin}–${estimate.timelineWeeksMax} wks</div></td>
          <td><div class="mono">FIXED-PRICE RANGE</div><div class="num-value accent">$${Math.round(estimate.costUsdMin/1000)}K–$${Math.round(estimate.costUsdMax/1000)}K</div></td>
        </tr>
      </table>
      <p style="color:#FAFAFA;">${escapeHtml(estimate.oneLineSummary)}</p>

      <h2>Risks flagged</h2>
      <ul>${(estimate.risks || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>

      <div class="footer">
        Sent by the WebCentriq estimator. Reply-to on the user email is set to ${SALES_ADDRESS}.
      </div>
    </div></body></html>`;

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: [SALES_ADDRESS],
    reply_to: contactData.email,
    subject,
    html
  });
  if (error) console.error("[email:sales-notify] failed:", error);
  return { ok: !error, id: data?.id };
}

// ============== User-facing estimate HTML builder ==============
function buildEstimateHtml({ estimate, projectData, contactData }) {
  const typeLabel = ({ web: "custom web app", mobile: "mobile app", automation: "business process automation", mvp: "MVP" })[projectData.projectType] || "software project";
  const phasesHtml = (estimate.phases || []).map((p, i) => `
    <div class="phase">
      <div class="phase-head"><span>${String(i+1).padStart(2,"0")} &nbsp; ${escapeHtml(p.name)}</span><span class="phase-weeks">${p.weeks} wk${p.weeks===1?"":"s"}</span></div>
      <p style="font-size:14px;margin:6px 0 0;">${escapeHtml(p.description || "")}</p>
    </div>`).join("");

  return `
    <!doctype html><html><head><meta charset="utf-8"/><style>${BASE_STYLES}</style></head>
    <body><div class="wrap">
      ${logoBlock}
      <div class="mono">YOUR AI ESTIMATE</div>
      <h1>Estimate for your ${escapeHtml(typeLabel)}.</h1>
      <p>${escapeHtml(estimate.oneLineSummary)}</p>

      <table class="numbers">
        <tr>
          <td><div class="mono">TIMELINE</div><div class="num-value">${estimate.timelineWeeksMin}–${estimate.timelineWeeksMax} weeks</div><div style="font-size:12px;color:#8A8A8A;">brief to production</div></td>
          <td><div class="mono">FIXED-PRICE RANGE</div><div class="num-value accent">$${Math.round(estimate.costUsdMin/1000)}K–$${Math.round(estimate.costUsdMax/1000)}K</div><div style="font-size:12px;color:#8A8A8A;">plain-English scope before work starts</div></td>
        </tr>
      </table>

      <h2>Scope breakdown</h2>
      ${phasesHtml}

      <h2>What's included</h2>
      <ul>${(estimate.includes || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>

      <h2>Things to watch</h2>
      <ul>${(estimate.risks || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>

      <h2>Recommended stack</h2>
      <p style="font-family:'SF Mono',Menlo,monospace;font-size:14px;color:#FAFAFA;">${escapeHtml(estimate.recommendedStack || "")}</p>

      <p style="margin-top:40px;color:#FAFAFA;">
        <strong>Next step.</strong> A senior engineer reviews this AI estimate, refines the scope, and reaches out within 72 hours &mdash; with a named lead and a time to walk through the plan. Reply to this email to accelerate.
      </p>

      <a href="https://webcentriq.com/" class="cta">Visit WebCentriq &rarr;</a>

      <div class="footer">
        WebCentriq Inc. &middot; San Diego &middot; Toronto &middot; Shipping since 2017<br/>
        4.9&#9733; on <a href="https://clutch.co/profile/webcentriq">Clutch</a> from 18 verified reviews.<br/>
        You received this because you verified ${escapeHtml(contactData.email)} on webcentriq.com.
      </div>
    </div></body></html>`;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
