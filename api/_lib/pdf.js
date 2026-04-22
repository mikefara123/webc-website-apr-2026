/* WebCentriq — PDF estimate generator.
 * Brand-faithful: dark editorial, one accent, hairline dividers, sharp corners.
 * Uses pdfkit (no external fonts — relies on Helvetica, built-in).
 */

import PDFDocument from "pdfkit";

// Brand tokens mapped to PDF RGB
const C = {
  bg:        "#0A0A0A",
  text:      "#FAFAFA",
  secondary: "#B5B5B5",
  tertiary:  "#8A8A8A",
  border:    "#262626",
  borderStrong: "#3A3A3A",
  accent:    "#FF4D00",
  muted:     "#141414",
};

const FONT_REGULAR = "Helvetica";
const FONT_BOLD    = "Helvetica-Bold";
const FONT_MONO    = "Courier";

const SCHEDULE_URL = process.env.SCHEDULE_URL || "https://calendly.com/hello-webcentriq/30min";

export function generateEstimatePdf({ estimate, projectData, contactData, refId }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margin: 56,
        info: {
          Title: "WebCentriq — Project estimate",
          Author: "WebCentriq Inc.",
          Subject: `Estimate for ${contactData?.email || "your project"}`,
          Creator: "WebCentriq AI Estimator",
        }
      });

      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ---------- Dark background on every page ----------
      const paintBg = () => doc.save().rect(0, 0, doc.page.width, doc.page.height).fill(C.bg).restore();
      paintBg();
      doc.on("pageAdded", paintBg);

      const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // ---------- Helper: mono eyebrow label ----------
      const eyebrow = (text, opts = {}) => {
        doc.font(FONT_MONO).fontSize(8.5).fillColor(opts.color || C.tertiary);
        doc.text(text.toUpperCase(), { characterSpacing: 1.5, ...opts });
      };

      const hairline = (color = C.border, opts = {}) => {
        const y = doc.y + (opts.marginTop || 0);
        doc.save()
           .lineWidth(0.5)
           .strokeColor(color)
           .moveTo(doc.page.margins.left, y)
           .lineTo(doc.page.width - doc.page.margins.right, y)
           .stroke()
           .restore();
        doc.y = y + (opts.marginBottom || 16);
      };

      const h2 = (text) => {
        doc.moveDown(0.2);
        doc.font(FONT_BOLD).fontSize(16).fillColor(C.text).text(text);
        doc.moveDown(0.3);
      };

      const body = (text, opts = {}) => {
        doc.font(FONT_REGULAR).fontSize(10.5).fillColor(opts.color || C.secondary)
           .text(text, { lineGap: 2, ...opts });
      };

      // ---------- HEADER ----------
      // Logo wordmark
      doc.font(FONT_BOLD).fontSize(14).fillColor(C.text);
      doc.text("Web", { continued: true });
      doc.fillColor(C.text).font(FONT_BOLD).fontSize(15).text("C", { continued: true });
      doc.font(FONT_BOLD).fontSize(14).text("entriq");

      doc.moveDown(0.2);
      eyebrow(`Project estimate  ·  ref ${refId}`, { color: C.accent });
      doc.moveDown(1);

      // ---------- BIG NUMBERS BOX ----------
      const numY = doc.y;
      const boxH = 88;
      // Box outline
      doc.save()
         .rect(doc.page.margins.left, numY, pageW, boxH)
         .lineWidth(0.5)
         .strokeColor(C.border)
         .stroke()
         .restore();
      // Vertical hairline divider
      doc.save()
         .moveTo(doc.page.margins.left + pageW / 2, numY)
         .lineTo(doc.page.margins.left + pageW / 2, numY + boxH)
         .lineWidth(0.5)
         .strokeColor(C.border)
         .stroke()
         .restore();

      // Left cell — timeline
      doc.font(FONT_MONO).fontSize(8.5).fillColor(C.tertiary)
         .text("TIMELINE", doc.page.margins.left + 18, numY + 16, { characterSpacing: 1.5 });
      doc.font(FONT_BOLD).fontSize(30).fillColor(C.text)
         .text(`${estimate.timelineWeeksMin}–${estimate.timelineWeeksMax} weeks`, doc.page.margins.left + 18, numY + 32);
      doc.font(FONT_REGULAR).fontSize(8.5).fillColor(C.tertiary)
         .text("brief to production", doc.page.margins.left + 18, numY + 68);

      // Right cell — cost
      const rightX = doc.page.margins.left + pageW / 2 + 18;
      doc.font(FONT_MONO).fontSize(8.5).fillColor(C.tertiary)
         .text("FIXED-PRICE RANGE", rightX, numY + 16, { characterSpacing: 1.5 });
      doc.font(FONT_BOLD).fontSize(30).fillColor(C.accent)
         .text(`$${fmtK(estimate.costUsdMin)}–$${fmtK(estimate.costUsdMax)}`, rightX, numY + 32);
      doc.font(FONT_REGULAR).fontSize(8.5).fillColor(C.tertiary)
         .text("plain-English scope before work starts", rightX, numY + 68);

      // Jump below the box
      doc.y = numY + boxH + 24;
      doc.x = doc.page.margins.left;

      // ---------- ONE-LINE SUMMARY ----------
      body(estimate.oneLineSummary || "", { color: C.text });
      doc.moveDown(1);

      // ---------- WHAT WE HEARD ----------
      eyebrow("WHAT WE HEARD");
      doc.moveDown(0.5);
      (estimate.understandingBullets || []).forEach((b) => {
        const y = doc.y;
        doc.save().moveTo(doc.page.margins.left, y + 5).lineTo(doc.page.margins.left + 8, y + 5).lineWidth(1).strokeColor(C.accent).stroke().restore();
        doc.font(FONT_REGULAR).fontSize(10.5).fillColor(C.text).text(b, doc.page.margins.left + 16, y, { width: pageW - 16, lineGap: 2 });
        doc.moveDown(0.3);
      });
      doc.moveDown(0.5);
      hairline(C.border, { marginTop: 4, marginBottom: 16 });

      // ---------- SCOPE BREAKDOWN ----------
      eyebrow("SCOPE BREAKDOWN");
      doc.moveDown(0.5);
      (estimate.phases || []).forEach((p, i) => {
        const y = doc.y;
        doc.font(FONT_MONO).fontSize(8.5).fillColor(C.tertiary)
           .text(String(i + 1).padStart(2, "0"), doc.page.margins.left, y, { characterSpacing: 1.2, width: 24 });
        doc.font(FONT_BOLD).fontSize(11).fillColor(C.text)
           .text(p.name, doc.page.margins.left + 30, y, { width: pageW - 130 });
        doc.font(FONT_MONO).fontSize(8.5).fillColor(C.accent)
           .text(`${p.weeks} WK${p.weeks === 1 ? "" : "S"}`, doc.page.margins.left + pageW - 60, y, { width: 60, align: "right", characterSpacing: 1.5 });
        doc.moveDown(0.2);
        doc.font(FONT_REGULAR).fontSize(9.5).fillColor(C.secondary)
           .text(p.description || "", doc.page.margins.left + 30, doc.y, { width: pageW - 30, lineGap: 1.5 });
        doc.moveDown(0.6);
      });
      hairline(C.border, { marginTop: 4, marginBottom: 16 });

      // ---------- TWO-COLUMN: INCLUDES + RISKS ----------
      const listStartY = doc.y;
      const colW = (pageW - 24) / 2;

      // Left col — Includes
      doc.font(FONT_MONO).fontSize(8.5).fillColor(C.tertiary)
         .text("WHAT'S INCLUDED", doc.page.margins.left, listStartY, { characterSpacing: 1.5, width: colW });
      let leftY = doc.y + 10;
      (estimate.includes || []).forEach((x) => {
        doc.save().moveTo(doc.page.margins.left, leftY + 5).lineTo(doc.page.margins.left + 8, leftY + 5).lineWidth(1).strokeColor(C.accent).stroke().restore();
        doc.font(FONT_REGULAR).fontSize(9.5).fillColor(C.text)
           .text(x, doc.page.margins.left + 14, leftY, { width: colW - 14, lineGap: 1.5 });
        leftY = doc.y + 6;
      });

      // Right col — Risks
      const rightColX = doc.page.margins.left + colW + 24;
      doc.font(FONT_MONO).fontSize(8.5).fillColor(C.tertiary)
         .text("THINGS TO WATCH", rightColX, listStartY, { characterSpacing: 1.5, width: colW });
      let rightY = listStartY + 22;
      (estimate.risks || []).forEach((x) => {
        doc.font(FONT_MONO).fontSize(10).fillColor(C.tertiary)
           .text("!", rightColX, rightY, { width: 10 });
        doc.font(FONT_REGULAR).fontSize(9.5).fillColor(C.text)
           .text(x, rightColX + 14, rightY, { width: colW - 14, lineGap: 1.5 });
        rightY = doc.y + 6;
      });

      doc.y = Math.max(leftY, rightY) + 8;
      doc.x = doc.page.margins.left;
      hairline(C.border, { marginTop: 4, marginBottom: 16 });

      // ---------- RECOMMENDED STACK ----------
      eyebrow("RECOMMENDED STACK");
      doc.moveDown(0.4);
      doc.font(FONT_MONO).fontSize(10).fillColor(C.text)
         .text(estimate.recommendedStack || "", { lineGap: 2 });
      doc.moveDown(1);
      hairline(C.borderStrong, { marginTop: 4, marginBottom: 20 });

      // ---------- CLARIFYING QUESTIONS (highlighted block) ----------
      h2("Three questions to start the conversation.");
      body("Reply to the email with your answers, or book a 30-minute call with the senior engineer who'd lead the build.", { color: C.secondary });
      doc.moveDown(0.6);

      (estimate.clarifyingQuestions || []).forEach((q, i) => {
        const y = doc.y;
        doc.font(FONT_MONO).fontSize(9).fillColor(C.accent)
           .text(`Q${String(i + 1).padStart(2, "0")}`, doc.page.margins.left, y, { width: 36, characterSpacing: 1.5 });
        doc.font(FONT_REGULAR).fontSize(11).fillColor(C.text)
           .text(q, doc.page.margins.left + 36, y, { width: pageW - 36, lineGap: 2 });
        doc.moveDown(0.7);
      });

      doc.moveDown(0.5);

      // ---------- SCHEDULE A CALL CTA ----------
      const ctaY = doc.y + 8;
      const ctaH = 52;
      doc.save()
         .rect(doc.page.margins.left, ctaY, pageW, ctaH)
         .fillColor(C.accent)
         .fill()
         .restore();
      doc.font(FONT_BOLD).fontSize(13).fillColor("#FFFFFF")
         .text("Schedule a 30-minute call →", doc.page.margins.left + 24, ctaY + 12);
      doc.font(FONT_REGULAR).fontSize(9.5).fillColor("#FFFFFF")
         .text(SCHEDULE_URL, doc.page.margins.left + 24, ctaY + 32, { link: SCHEDULE_URL });
      doc.y = ctaY + ctaH + 24;

      // ---------- FOOTER ----------
      hairline(C.border, { marginTop: 4, marginBottom: 16 });
      doc.font(FONT_REGULAR).fontSize(9).fillColor(C.secondary)
         .text("WebCentriq Inc.  ·  hello@webcentriq.com  ·  4.9★ on Clutch from 18 verified reviews", { link: null });
      doc.moveDown(0.2);
      doc.font(FONT_REGULAR).fontSize(9).fillColor(C.tertiary)
         .text("San Diego, CA · Markham, ON · Shipping since 2017");
      doc.moveDown(0.2);
      doc.font(FONT_MONO).fontSize(8).fillColor(C.tertiary)
         .text(`Sent to ${contactData?.email || "you"} on ${new Date().toUTCString()}`, { characterSpacing: 1 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export function makeRefId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return `EST-${stamp}`;
}

function fmtK(n) {
  if (!n) return "0";
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}
