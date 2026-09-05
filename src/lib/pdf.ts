import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { supabase } from "@/integrations/supabase/client";
import { SACCO_ADDRESS, SACCO_NAME, SACCO_PHONE, SACCO_TAGLINE, ugx } from "@/lib/sacco";

const BRAND: [number, number, number] = [15, 76, 58];
const GOLD: [number, number, number] = [176, 137, 43];

let logoCache: string | null = null;
let organizationNameCache = SACCO_NAME;

async function loadLogo(): Promise<string | null> {
  if (logoCache) return logoCache;
  try {
    const res = await fetch("/favicon.png");
    const blob = await res.blob();
    logoCache = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return logoCache;
  } catch {
    return null;
  }
}

export type Orientation = "portrait" | "landscape";

/** Creates a branded document and returns the doc plus the y cursor below the letterhead. */
export async function brandedDoc(orientation: Orientation = "portrait") {
  const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const img = await loadLogo();
  const { data: setting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "sacco_name")
    .maybeSingle();
  organizationNameCache = setting?.value?.trim() || SACCO_NAME;

  if (img) {
    try {
      doc.addImage(img, "JPEG", 40, 28, 58, 58);
    } catch {
      /* ignore bad image */
    }
  }

  const left = img ? 110 : 40;
  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(orientation === "landscape" ? 15 : 13.5);
  const nameLines = doc.splitTextToSize(organizationNameCache, width - left - 40);
  doc.text(nameLines, left, 46);
  const nameBottom = 46 + (nameLines.length - 1) * (orientation === "landscape" ? 16 : 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(`${SACCO_ADDRESS}  ·  Tel: ${SACCO_PHONE}`, left, nameBottom + 18);
  doc.setTextColor(...GOLD);
  doc.setFont("helvetica", "italic");
  doc.text(SACCO_TAGLINE, left, nameBottom + 32);

  doc.setDrawColor(...BRAND);
  doc.setLineWidth(1.5);
  const ruleY = nameBottom + 48;
  doc.line(40, ruleY, width - 40, ruleY);
  doc.setTextColor(20);
  doc.setFont("helvetica", "normal");

  return { doc, width, y: ruleY + 18 };
}

export function docTitle(doc: jsPDF, title: string, y: number, subtitle?: string) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND);
  doc.text(title.toUpperCase(), width / 2, y, { align: "center" });
  let next = y + 16;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(90);
    doc.text(subtitle, width / 2, next, { align: "center" });
    next += 14;
  }
  doc.setTextColor(20);
  return next + 6;
}

function stamp(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(130);
    doc.text(
      `Generated ${new Date().toLocaleString("en-GB")} · ${organizationNameCache}`,
      40,
      height - 20,
    );
    doc.text(`Page ${i} of ${pages}`, width - 40, height - 20, { align: "right" });
  }
}

export function savePdf(doc: jsPDF, filename: string) {
  stamp(doc);
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

/** Branded tabular export used by every list/report screen. */
export async function exportPdfTable(opts: {
  filename: string;
  title: string;
  subtitle?: string;
  head: string[];
  body: (string | number)[][];
  orientation?: Orientation;
  columnStyles?: Record<number, { halign?: "left" | "right" | "center"; cellWidth?: number }>;
  footNote?: string;
}) {
  const { doc, y } = await brandedDoc(opts.orientation ?? "portrait");
  const startY = docTitle(doc, opts.title, y, opts.subtitle);

  autoTable(doc, {
    startY,
    head: [opts.head],
    body: opts.body.length ? opts.body.map((r) => r.map((c) => String(c ?? ""))) : [[""]],
    styles: { fontSize: 8.5, cellPadding: 5, lineColor: [225, 225, 225], lineWidth: 0.4 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: [246, 248, 246] },
    columnStyles: opts.columnStyles ?? {},
    margin: { left: 40, right: 40 },
  });

  if (opts.footNote) {
    const after = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;
    doc.setFontSize(9);
    doc.setTextColor(70);
    doc.text(opts.footNote, 40, after + 22, { maxWidth: doc.internal.pageSize.getWidth() - 80 });
  }

  savePdf(doc, opts.filename);
}

export type ReceiptField = [string, string];

/** Branded A5-feel receipt on A4 portrait, with signature lines. */
export async function receiptPdf(opts: {
  filename: string;
  title: string;
  receiptNo: string;
  date: string;
  memberName: string;
  memberNo: string;
  fields: ReceiptField[];
  amount: number;
  amountLabel?: string;
  note?: string;
  print?: boolean;
}) {
  const { doc, width } = await brandedDoc("portrait");
  let y = docTitle(doc, opts.title, 112);

  autoTable(doc, {
    startY: y,
    body: [[`Receipt No: ${opts.receiptNo}`, `Date: ${opts.date}`]],
    theme: "plain",
    styles: { fontSize: 9.5, textColor: [90, 90, 90], cellPadding: { top: 2, right: 0, bottom: 5, left: 0 } },
    columnStyles: { 0: { cellWidth: (width - 80) / 2 }, 1: { halign: "right", cellWidth: (width - 80) / 2 } },
    margin: { left: 40, right: 40 },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 18;

  autoTable(doc, {
    startY: y,
    body: [
      ["Member name", opts.memberName],
      ["Member number", opts.memberNo],
      ...opts.fields,
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 7, overflow: "linebreak", lineColor: [220, 220, 220], lineWidth: 0.4 },
    columnStyles: { 0: { cellWidth: 170, fontStyle: "bold", fillColor: [246, 248, 246] } },
    margin: { left: 40, right: 40 },
  });

  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 22;

  doc.setFillColor(...BRAND);
  doc.roundedRect(40, y, width - 80, 42, 5, 5, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text((opts.amountLabel ?? "Amount").toUpperCase(), 56, y + 26);
  doc.setFontSize(15);
  doc.text(ugx(opts.amount), width - 56, y + 27, { align: "right" });
  y += 66;

  doc.setTextColor(60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  if (opts.note) {
    const noteLines = doc.splitTextToSize(opts.note, width - 80);
    doc.text(noteLines, 40, y);
    y += noteLines.length * 12 + 12;
  }

  y += 40;
  doc.setDrawColor(150);
  doc.setLineWidth(0.6);
  doc.line(40, y, 230, y);
  doc.line(width - 230, y, width - 40, y);
  doc.setFontSize(9);
  doc.text("Member's signature", 40, y + 14);
  doc.text("Treasurer / Authorised officer", width - 230, y + 14);

  savePdf(doc, opts.filename);
}

/** Excel export (only offered where the SACCO asked for a spreadsheet option). */
export async function exportExcel(filename: string, sheet: string, rows: Record<string, unknown>[]) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 30));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export type Guarantor = { name: string; contact: string };

/** Portrait loan application form. */
export async function loanApplicationPdf(opts: {
  filename: string;
  loanNo: string;
  date: string;
  memberName: string;
  memberNo: string;
  amount: number;
  loanLimit: number;
  shares: number;
  months: number;
  purpose: string;
  guarantors: Guarantor[];
  interest: number;
  total: number;
  monthly: number;
}) {
  const { doc, width } = await brandedDoc("portrait");
  let y = docTitle(doc, "Loan Application Form", 112, `Application No: ${opts.loanNo}  ·  Date: ${opts.date}`);

  autoTable(doc, {
    startY: y,
    body: [
      ["Member name", opts.memberName],
      ["Member number", opts.memberNo],
      ["Shares held", `${opts.shares.toLocaleString()} share(s) @ UGX 20,000`],
      ["Loan limit (shares x 20,000 x 3)", ugx(opts.loanLimit)],
      ["Loan amount applied for", ugx(opts.amount)],
      ["Loan duration", `${opts.months} month(s)`],
      ["Interest (1.5% per month)", ugx(opts.interest)],
      ["Total repayable", ugx(opts.total)],
      ["Monthly instalment", ugx(opts.monthly)],
      ["Loan purpose", opts.purpose || "-"],
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 6.5, lineColor: [220, 220, 220], lineWidth: 0.4 },
    columnStyles: { 0: { cellWidth: 200, fontStyle: "bold", fillColor: [246, 248, 246] } },
    margin: { left: 40, right: 40 },
  });

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND);
  doc.text("LOAN GUARANTORS (SACCO MEMBERS)", 40, y);
  doc.setTextColor(20);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [["#", "Guarantor name", "Telephone contact", "Signature"]],
    body: opts.guarantors.map((g, i) => [String(i + 1), g.name || "", g.contact || "", ""]),
    styles: { fontSize: 9.5, cellPadding: 10, lineColor: [220, 220, 220], lineWidth: 0.4 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 28 }, 3: { cellWidth: 140 } },
    margin: { left: 40, right: 40 },
  });

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 60;
  doc.setDrawColor(150);
  doc.setLineWidth(0.6);
  doc.setFontSize(9.5);
  doc.setTextColor(60);
  doc.line(40, y, 230, y);
  doc.text("Applicant's signature / date", 40, y + 14);
  doc.line(width - 230, y, width - 40, y);
  doc.text("Received by (SACCO officer)", width - 230, y + 14);

  savePdf(doc, opts.filename);
}

/** Landscape loan disbursement schedule with signature provisions. */
export async function loanDisbursementPdf(opts: {
  filename: string;
  date: string;
  rows: Array<{
    memberNo: string;
    memberName: string;
    applied: number;
    approved: number;
    months: number;
    interest: number;
    guarantors: Guarantor[];
  }>;
}) {
  const { doc, width } = await brandedDoc("landscape");
  let y = docTitle(doc, "Loan Disbursement Schedule", 112, `Date: ${opts.date}`);

  autoTable(doc, {
    startY: y,
    head: [
      [
        "Member No",
        "Member name",
        "Applied (UGX)",
        "Approved (UGX)",
        "Duration",
        "Interest @1.5%/mo",
        "Guarantor 1 (contact)",
        "Guarantor 2 (contact)",
        "Signature",
      ],
    ],
    body: opts.rows.map((r) => [
      r.memberNo,
      r.memberName,
      r.applied.toLocaleString(),
      r.approved.toLocaleString(),
      `${r.months} mo`,
      r.interest.toLocaleString(),
      r.guarantors[0] ? `${r.guarantors[0].name} (${r.guarantors[0].contact})` : "-",
      r.guarantors[1] ? `${r.guarantors[1].name} (${r.guarantors[1].contact})` : "-",
      "",
    ]),
    styles: { fontSize: 8.5, cellPadding: 9, lineColor: [220, 220, 220], lineWidth: 0.4 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: [246, 248, 246] },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      5: { halign: "right" },
      8: { cellWidth: 110 },
    },
    margin: { left: 30, right: 30 },
  });

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 70;
  const height = doc.internal.pageSize.getHeight();
  if (y > height - 90) {
    doc.addPage();
    y = 120;
  }

  doc.setFontSize(10);
  doc.setTextColor(40);
  const dots = ".".repeat(60);
  doc.text(`Chairperson, Loans Committee: ${dots}`, 40, y);
  doc.text(`Date: ${".".repeat(24)}`, width / 2 + 150, y);
  y += 40;
  doc.text(`SACCO Chairperson: ${dots}`, 40, y);
  doc.text(`Date: ${".".repeat(24)}`, width / 2 + 150, y);

  savePdf(doc, opts.filename);
}
