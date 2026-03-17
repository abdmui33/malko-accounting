import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import { SEED_SETTINGS, SEED_CLIENTS, SEED_INVOICES, SEED_QUOTATIONS, NEXT_QUO, NEXT_INV } from "./seed.js";

// ─── Utilities ───────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtMY = (n) => "RM " + parseFloat(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const today = () => new Date().toISOString().slice(0, 10);
// FIX #2 & #10: Generate doc number from live row count, not stale counts prop
const nextDocNo = (prefix, rows) => prefix + String(rows.length + 1).padStart(3, "0");

// ─── Supabase helpers ─────────────────────────────────────────────────────────
async function dbLoad(table) {
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
  if (error) { console.error("dbLoad error:", table, error); return []; }
  return data || [];
}
async function dbInsert(table, row) {
  // FIX #3: Strip client-side id and created_at — let Supabase generate UUID
  const { id: _omit, created_at: _ca, ...payload } = row;
  const { data, error } = await supabase.from(table).insert([payload]).select().single();
  if (error) { console.error("dbInsert error:", table, error); return null; }
  return data;
}
async function dbUpdate(table, id, row) {
  // FIX #3: Strip id and created_at — must not be in UPDATE payload
  const { id: _id, created_at: _ca, ...payload } = row;
  const { error } = await supabase.from(table).update(payload).eq("id", id);
  if (error) console.error("dbUpdate error:", table, error);
}
async function dbDelete(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) console.error("dbDelete error:", table, error);
}
async function dbUpsertSettings(settings) {
  const { id: _id, created_at: _ca, ...payload } = settings;
  const { error } = await supabase.from("settings").upsert([{ id: 1, ...payload }]);
  if (error) console.error("dbUpsertSettings error:", error);
}
// FIX #4: Use maybeSingle() — no error thrown if settings row doesn't exist yet
async function dbLoadSettings() {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  if (error) console.error("dbLoadSettings error:", error);
  return data || null;
}

// ─── PDF Print ────────────────────────────────────────────────────────────────
function printDoc(html, title) {
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups for this site to print/save documents."); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',sans-serif;color:#1a1a2e;background:#fff;padding:40px;font-size:13px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid #1a1a2e}
    .logo{max-width:120px;max-height:80px;object-fit:contain}
    .company-name{font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:4px}
    .doc-title{font-size:28px;font-weight:800;color:#c9a84c;letter-spacing:2px;margin-bottom:20px}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
    .meta-box{background:#f8f6f0;padding:14px 18px;border-radius:6px}
    .meta-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:4px;display:block}
    .meta-value{font-size:13px;font-weight:600;color:#1a1a2e}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    th{background:#1a1a2e;color:#c9a84c;padding:10px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
    td{padding:10px 14px;border-bottom:1px solid #eee;font-size:12px}
    tr:nth-child(even) td{background:#fafafa}
    .totals{display:flex;justify-content:flex-end;margin-bottom:32px}
    .totals-box{min-width:260px}
    .total-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:13px}
    .total-row.grand{font-size:15px;font-weight:800;color:#c9a84c;border-top:3px solid #1a1a2e;border-bottom:none;padding-top:10px}
    .footer{text-align:center;color:#aaa;font-size:11px;margin-top:40px;padding-top:16px;border-top:1px solid #eee}
    .note-box{background:#fffbf0;border-left:4px solid #c9a84c;padding:12px 16px;margin-bottom:24px;font-size:12px;line-height:1.6}
    .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px}
    .sig-line{border-top:1px solid #333;padding-top:10px;text-align:center;font-size:11px;color:#666}
    .badge-paid{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;background:#d4edda;color:#155724}
    .badge-pending{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;background:#fff3cd;color:#856404}
    .badge-overdue{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;background:#f8d7da;color:#721c24}
    @media print{body{padding:20px}}
  </style></head><body>
  ${html}
  <script>window.onload=function(){window.print()}<\/script>
  </body></html>`);
  w.document.close();
}

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = {
  bg: "#0f0f1a", card: "#16162a", border: "#2a2a45",
  gold: "#c9a84c", text: "#e8e8f0", muted: "#7070a0",
  accent: "#4c6ef5", success: "#40c057", danger: "#fa5252", warning: "#fd7e14",
};

// FIX #1: css.btn previously had duplicate `border` key in JS object (second overwrote first).
// Now using a proper function with no duplicate keys.
function mkBtn(v = "gold") {
  return {
    padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13,
    fontWeight: 700, letterSpacing: 0.3, transition: "all .2s",
    background: v === "gold" ? C.gold : v === "danger" ? C.danger : v === "ghost" ? "transparent" : C.accent,
    color: v === "ghost" ? C.muted : "#0f0f1a",
    border: v === "ghost" ? `1px solid ${C.border}` : "none",
  };
}

const css = {
  app: { minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans','Segoe UI',sans-serif", display: "flex" },
  sidebar: { width: 224, background: C.card, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: "0 0 24px", position: "fixed", height: "100vh", zIndex: 10, overflowY: "auto" },
  main: { marginLeft: 224, flex: 1, padding: "32px 36px", minHeight: "100vh" },
  sideHeader: { padding: "28px 20px 20px", borderBottom: `1px solid ${C.border}`, marginBottom: 8 },
  sideTitle: { fontSize: 13, fontWeight: 800, letterSpacing: 3, color: C.gold, textTransform: "uppercase" },
  sideSub: { fontSize: 10, color: C.muted, marginTop: 2, letterSpacing: 1 },
  navItem: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", margin: "2px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500, color: active ? C.gold : C.muted, background: active ? "rgba(201,168,76,0.1)" : "transparent", border: active ? "1px solid rgba(201,168,76,0.2)" : "1px solid transparent", transition: "all .2s" }),
  pageTitle: { fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 4 },
  pageSub: { fontSize: 13, color: C.muted, marginBottom: 28 },
  card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "24px 28px", marginBottom: 20 },
  input: { background: "#0f0f1a", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 14px", color: C.text, fontSize: 13, width: "100%", outline: "none" },
  label: { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5, display: "block" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .5, borderBottom: `1px solid ${C.border}` },
  td: { padding: "12px 14px", fontSize: 13, borderBottom: "1px solid rgba(42,42,69,0.5)" },
  badge: (color) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase", background: color + "22", color }),
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
  statCard: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 24px" },
};

function Empty({ text }) { return <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: 13 }}>{text}</div>; }
function Spinner() { return <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>Loading...</div>; }

// FIX #5: status badge uses separate CSS class names — no quotes-inside-template-literals bug
const statusBadgeClass = (s) => s === "Paid" ? "badge-paid" : s === "Overdue" ? "badge-overdue" : "badge-pending";

function docHeader(s, docType, docNo, date, dueDate, toName, toAddress, extraMeta = "") {
  const logo = s.logo ? `<img src="${s.logo}" class="logo" alt="logo"/>` : `<div style="font-size:22px;font-weight:900;color:#1a1a2e">${(s.company || "").slice(0, 2).toUpperCase()}</div>`;
  return `
  <div class="header">
    <div>${logo}</div>
    <div style="text-align:right">
      <div class="company-name">${s.company || ""}</div>
      <div style="color:#666;font-size:12px;line-height:1.7">${s.address || ""}<br/>${s.phone || ""} · ${s.email || ""}<br/>Reg: ${s.regNo || ""}</div>
    </div>
  </div>
  <div class="doc-title">${docType}</div>
  <div class="meta-grid">
    <div class="meta-box">
      <span class="meta-label">To</span>
      <div class="meta-value">${toName || ""}</div>
      <div style="color:#666;font-size:12px;margin-top:4px">${toAddress || ""}</div>
    </div>
    <div class="meta-box">
      <span class="meta-label">${docType} No.</span>
      <div class="meta-value">${docNo || ""}</div>
      <div style="margin-top:8px"><span class="meta-label">Date </span><span class="meta-value">${fmtDate(date)}</span></div>
      ${dueDate ? `<div><span class="meta-label">Due </span><span class="meta-value">${fmtDate(dueDate)}</span></div>` : ""}
      ${extraMeta}
    </div>
  </div>`;
}

// ─── QUOTATIONS ───────────────────────────────────────────────────────────────
function QuotationModule({ settings }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [doc, setDoc] = useState(null);
  const newItem = () => ({ id: uid(), desc: "", qty: 1, unit: "unit", price: 0 });

  useEffect(() => { dbLoad("quotations").then(d => { setRows(d); setLoading(false); }); }, []);

  const lineTotal = (items) => (items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
  const openNew = () => { setDoc({ doc_no: rows.length === 0 ? NEXT_QUO : nextDocNo("QUO-", rows), client: "", address: "", date: today(), valid_until: "", notes: "", items: [newItem()] }); setEditId(null); setForm(true); };
  const openEdit = (r) => { setDoc({ ...r, items: Array.isArray(r.items) && r.items.length ? r.items : [newItem()] }); setEditId(r.id); setForm(true); };

  const save_ = async () => {
    if (editId) { await dbUpdate("quotations", editId, doc); setRows(rows.map(r => r.id === editId ? { ...doc, id: editId } : r)); }
    else { const ins = await dbInsert("quotations", doc); if (ins) setRows([ins, ...rows]); }
    setForm(false);
  };
  const del = async (id) => { if (!window.confirm("Delete this quotation?")) return; await dbDelete("quotations", id); setRows(rows.filter(r => r.id !== id)); };

  const printQ = (q) => {
    const items = q.items || [];
    const trs = items.map((i, idx) => `<tr><td>${idx + 1}</td><td>${i.desc}</td><td>${Number(i.qty)}</td><td>${i.unit}</td><td>${fmtMY(i.price)}</td><td style="font-weight:600">${fmtMY((Number(i.qty) || 0) * (Number(i.price) || 0))}</td></tr>`).join("");
    printDoc(
      docHeader(settings, "QUOTATION", q.doc_no, q.date, null, q.client, q.address) +
      `<table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>${trs}</tbody></table>
      <div class="totals"><div class="totals-box"><div class="total-row grand"><span>TOTAL</span><span>${fmtMY(lineTotal(items))}</span></div></div></div>
      ${q.notes ? `<div class="note-box"><strong>Notes:</strong> ${q.notes}</div>` : ""}
      ${q.valid_until ? `<p style="color:#666;font-size:12px;margin-bottom:16px">Valid until ${fmtDate(q.valid_until)}.</p>` : ""}
      <div class="footer">Thank you for your consideration · ${settings.company}</div>`,
      `Quotation ${q.doc_no}`);
  };

  if (form && doc) return <DocForm doc={doc} setDoc={setDoc} title={editId ? "Edit Quotation" : "New Quotation"} onSave={save_} onCancel={() => setForm(false)} newItem={newItem}
    fields={[{ key: "doc_no", label: "Quotation No." }, { key: "client", label: "Client Name" }, { key: "address", label: "Client Address" }, { key: "date", label: "Date", type: "date" }, { key: "valid_until", label: "Valid Until", type: "date" }, { key: "notes", label: "Notes" }]} />;

  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
      <div><div style={css.pageTitle}>Quotations</div><div style={css.pageSub}>{rows.length} document{rows.length !== 1 ? "s" : ""}</div></div>
      <button style={mkBtn("gold")} onClick={openNew}>+ New Quotation</button>
    </div>
    <div style={css.card}>
      {loading ? <Spinner /> : rows.length === 0 ? <Empty text="No quotations yet" /> : (
        <table style={css.table}><thead><tr>{["No.", "Client", "Date", "Valid Until", "Total", "Actions"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(q => <tr key={q.id}>
            <td style={css.td}><span style={{ color: C.gold, fontWeight: 700 }}>{q.doc_no}</span></td>
            <td style={css.td}>{q.client}</td><td style={css.td}>{fmtDate(q.date)}</td><td style={css.td}>{fmtDate(q.valid_until)}</td>
            <td style={css.td}><strong>{fmtMY(lineTotal(q.items))}</strong></td>
            <td style={css.td}><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={{ ...mkBtn("ghost"), padding: "6px 12px", fontSize: 12 }} onClick={() => openEdit(q)}>Edit</button>
              <button style={{ ...mkBtn("ghost"), padding: "6px 12px", fontSize: 12 }} onClick={() => printQ(q)}>🖨 PDF</button>
              <button style={{ ...mkBtn("danger"), padding: "6px 12px", fontSize: 12 }} onClick={() => del(q.id)}>✕</button>
            </div></td>
          </tr>)}</tbody>
        </table>
      )}
    </div>
  </div>);
}

// ─── INVOICES ─────────────────────────────────────────────────────────────────
function InvoiceModule({ settings }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [doc, setDoc] = useState(null);
  const newItem = () => ({ id: uid(), desc: "", qty: 1, unit: "unit", price: 0 });

  useEffect(() => { dbLoad("invoices").then(d => { setRows(d); setLoading(false); }); }, []);

  const lineTotal = (items) => (items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
  const openNew = () => { setDoc({ doc_no: rows.length === 0 ? NEXT_INV : nextDocNo("INV-", rows), client: "", address: "", date: today(), due_date: "", status: "Pending", notes: "", items: [newItem()] }); setEditId(null); setForm(true); };
  const openEdit = (r) => { setDoc({ ...r, items: Array.isArray(r.items) && r.items.length ? r.items : [newItem()] }); setEditId(r.id); setForm(true); };

  const save_ = async () => {
    if (editId) { await dbUpdate("invoices", editId, doc); setRows(rows.map(r => r.id === editId ? { ...doc, id: editId } : r)); }
    else { const ins = await dbInsert("invoices", doc); if (ins) setRows([ins, ...rows]); }
    setForm(false);
  };
  const del = async (id) => { if (!window.confirm("Delete this invoice?")) return; await dbDelete("invoices", id); setRows(rows.filter(r => r.id !== id)); };
  const toggleStatus = async (inv) => {
    const s = inv.status === "Paid" ? "Pending" : "Paid";
    await dbUpdate("invoices", inv.id, { status: s });
    setRows(rows.map(r => r.id === inv.id ? { ...r, status: s } : r));
  };

  const printI = (inv) => {
    const items = inv.items || [];
    const trs = items.map((i, idx) => `<tr><td>${idx + 1}</td><td>${i.desc}</td><td>${Number(i.qty)}</td><td>${i.unit}</td><td>${fmtMY(i.price)}</td><td style="font-weight:600">${fmtMY((Number(i.qty) || 0) * (Number(i.price) || 0))}</td></tr>`).join("");
    printDoc(
      docHeader(settings, "INVOICE", inv.doc_no, inv.date, inv.due_date, inv.client, inv.address,
        `<div style="margin-top:8px"><span class="${statusBadgeClass(inv.status)}">${inv.status}</span></div>`) +
      `<table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>${trs}</tbody></table>
      <div class="totals"><div class="totals-box"><div class="total-row grand"><span>TOTAL DUE</span><span>${fmtMY(lineTotal(items))}</span></div></div></div>
      ${inv.notes ? `<div class="note-box"><strong>Notes:</strong> ${inv.notes}</div>` : ""}
      <div class="note-box"><strong>Payment to:</strong> ${settings.bankName || ""} · Acc No: ${settings.bankAcc || ""}</div>
      <div class="footer">Thank you for your business · ${settings.company}</div>`,
      `Invoice ${inv.doc_no}`);
  };

  const sColor = { Paid: C.success, Pending: C.warning, Overdue: C.danger };
  if (form && doc) return <DocForm doc={doc} setDoc={setDoc} title={editId ? "Edit Invoice" : "New Invoice"} onSave={save_} onCancel={() => setForm(false)} newItem={newItem}
    fields={[{ key: "doc_no", label: "Invoice No." }, { key: "client", label: "Client Name" }, { key: "address", label: "Client Address" }, { key: "date", label: "Date", type: "date" }, { key: "due_date", label: "Due Date", type: "date" }, { key: "status", label: "Status", type: "select", options: ["Pending", "Paid", "Overdue"] }, { key: "notes", label: "Notes" }]} />;

  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
      <div><div style={css.pageTitle}>Invoices</div><div style={css.pageSub}>{rows.length} document{rows.length !== 1 ? "s" : ""}</div></div>
      <button style={mkBtn("gold")} onClick={openNew}>+ New Invoice</button>
    </div>
    <div style={css.card}>
      {loading ? <Spinner /> : rows.length === 0 ? <Empty text="No invoices yet" /> : (
        <table style={css.table}><thead><tr>{["No.", "Client", "Date", "Due", "Status", "Total", "Actions"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(inv => <tr key={inv.id}>
            <td style={css.td}><span style={{ color: C.gold, fontWeight: 700 }}>{inv.doc_no}</span></td>
            <td style={css.td}>{inv.client}</td><td style={css.td}>{fmtDate(inv.date)}</td><td style={css.td}>{fmtDate(inv.due_date)}</td>
            <td style={css.td}><span style={css.badge(sColor[inv.status] || C.muted)}>{inv.status}</span></td>
            <td style={css.td}><strong>{fmtMY(lineTotal(inv.items))}</strong></td>
            <td style={css.td}><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={{ ...mkBtn("ghost"), padding: "6px 12px", fontSize: 12 }} onClick={() => toggleStatus(inv)}>{inv.status === "Paid" ? "Unpaid" : "✓ Paid"}</button>
              <button style={{ ...mkBtn("ghost"), padding: "6px 12px", fontSize: 12 }} onClick={() => openEdit(inv)}>Edit</button>
              <button style={{ ...mkBtn("ghost"), padding: "6px 12px", fontSize: 12 }} onClick={() => printI(inv)}>🖨 PDF</button>
              <button style={{ ...mkBtn("danger"), padding: "6px 12px", fontSize: 12 }} onClick={() => del(inv.id)}>✕</button>
            </div></td>
          </tr>)}</tbody>
        </table>
      )}
    </div>
  </div>);
}

// ─── COSTING ──────────────────────────────────────────────────────────────────
function CostingModule({ settings }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [doc, setDoc] = useState(null);
  const newItem = () => ({ id: uid(), desc: "", category: "Material", qty: 1, unit: "unit", rate: 0 });

  useEffect(() => { dbLoad("costings").then(d => { setRows(d); setLoading(false); }); }, []);

  const lineTotal = (items) => (items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
  const openNew = () => { setDoc({ doc_no: nextDocNo("CST-", rows), project: "", client: "", date: today(), notes: "", items: [newItem()] }); setEditId(null); setForm(true); };
  const openEdit = (r) => { setDoc({ ...r, items: Array.isArray(r.items) && r.items.length ? r.items : [newItem()] }); setEditId(r.id); setForm(true); };

  const save_ = async () => {
    if (editId) { await dbUpdate("costings", editId, doc); setRows(rows.map(r => r.id === editId ? { ...doc, id: editId } : r)); }
    else { const ins = await dbInsert("costings", doc); if (ins) setRows([ins, ...rows]); }
    setForm(false);
  };
  const del = async (id) => { if (!window.confirm("Delete this costing?")) return; await dbDelete("costings", id); setRows(rows.filter(r => r.id !== id)); };

  const printC = (c) => {
    const items = c.items || [];
    const cats = [...new Set(items.map(i => i.category))];
    let trs = "";
    cats.forEach(cat => {
      const ci = items.filter(i => i.category === cat);
      const ct = ci.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
      trs += `<tr><td colspan="6" style="background:#f0f0f0;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:1px;padding:8px 14px">${cat}</td></tr>`;
      ci.forEach((i, idx) => { trs += `<tr><td>${idx + 1}</td><td>${i.desc}</td><td>${Number(i.qty)}</td><td>${i.unit}</td><td>${fmtMY(i.rate)}</td><td style="font-weight:600">${fmtMY((Number(i.qty) || 0) * (Number(i.rate) || 0))}</td></tr>`; });
      trs += `<tr><td colspan="5" style="text-align:right;font-weight:700;color:#555;font-size:11px;padding:8px 14px">${cat} Subtotal</td><td style="font-weight:700;padding:8px 14px">${fmtMY(ct)}</td></tr>`;
    });
    printDoc(
      docHeader(settings, "PROJECT COSTING", c.doc_no, c.date, null, c.client, "",
        `<div style="margin-top:8px"><span class="meta-label">Project </span><span class="meta-value">${c.project}</span></div>`) +
      `<table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit</th><th>Rate (RM)</th><th>Amount</th></tr></thead><tbody>${trs}</tbody></table>
      <div class="totals"><div class="totals-box"><div class="total-row grand"><span>TOTAL COST</span><span>${fmtMY(lineTotal(items))}</span></div></div></div>
      ${c.notes ? `<div class="note-box"><strong>Notes:</strong> ${c.notes}</div>` : ""}
      <div class="footer">Prepared by ${settings.company}</div>`,
      `Costing ${c.doc_no}`);
  };

  if (form && doc) return <CostingForm doc={doc} setDoc={setDoc} onSave={save_} onCancel={() => setForm(false)} newItem={newItem} isEdit={!!editId} />;

  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
      <div><div style={css.pageTitle}>Project Costing</div><div style={css.pageSub}>{rows.length} record{rows.length !== 1 ? "s" : ""}</div></div>
      <button style={mkBtn("gold")} onClick={openNew}>+ New Costing</button>
    </div>
    <div style={css.card}>
      {loading ? <Spinner /> : rows.length === 0 ? <Empty text="No costing records yet" /> : (
        <table style={css.table}><thead><tr>{["No.", "Project", "Client", "Date", "Total Cost", "Actions"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(c => <tr key={c.id}>
            <td style={css.td}><span style={{ color: C.gold, fontWeight: 700 }}>{c.doc_no}</span></td>
            <td style={css.td}>{c.project}</td><td style={css.td}>{c.client}</td><td style={css.td}>{fmtDate(c.date)}</td>
            <td style={css.td}><strong>{fmtMY(lineTotal(c.items))}</strong></td>
            <td style={css.td}><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={{ ...mkBtn("ghost"), padding: "6px 12px", fontSize: 12 }} onClick={() => openEdit(c)}>Edit</button>
              <button style={{ ...mkBtn("ghost"), padding: "6px 12px", fontSize: 12 }} onClick={() => printC(c)}>🖨 PDF</button>
              <button style={{ ...mkBtn("danger"), padding: "6px 12px", fontSize: 12 }} onClick={() => del(c.id)}>✕</button>
            </div></td>
          </tr>)}</tbody>
        </table>
      )}
    </div>
  </div>);
}

// ─── SUPPLIER PAYMENTS ────────────────────────────────────────────────────────
function SupplierModule({ settings }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [doc, setDoc] = useState(null);

  useEffect(() => { dbLoad("supplier_payments").then(d => { setRows(d); setLoading(false); }); }, []);

  const openNew = () => { setDoc({ doc_no: nextDocNo("SPY-", rows), supplier: "", invoice_ref: "", date: today(), due_date: "", amount: "", method: "Bank Transfer", status: "Pending", description: "", notes: "" }); setEditId(null); setForm(true); };
  const openEdit = (r) => { setDoc(r); setEditId(r.id); setForm(true); };
  const save_ = async () => {
    if (editId) { await dbUpdate("supplier_payments", editId, doc); setRows(rows.map(r => r.id === editId ? { ...doc, id: editId } : r)); }
    else { const ins = await dbInsert("supplier_payments", doc); if (ins) setRows([ins, ...rows]); }
    setForm(false);
  };
  const del = async (id) => { if (!window.confirm("Delete this payment?")) return; await dbDelete("supplier_payments", id); setRows(rows.filter(r => r.id !== id)); };
  const toggleStatus = async (p) => {
    const s = p.status === "Paid" ? "Pending" : "Paid";
    await dbUpdate("supplier_payments", p.id, { status: s });
    setRows(rows.map(r => r.id === p.id ? { ...r, status: s } : r));
  };
  const printP = (p) => {
    printDoc(
      docHeader(settings, "PAYMENT VOUCHER", p.doc_no, p.date, p.due_date, p.supplier, "",
        `<div style="margin-top:8px"><span class="meta-label">Method </span><span class="meta-value">${p.method}</span></div>`) +
      `<div class="note-box"><strong>Supplier Invoice Ref:</strong> ${p.invoice_ref || "—"}<br/><strong>Description:</strong> ${p.description || "—"}</div>
      <div class="totals"><div class="totals-box"><div class="total-row grand"><span>AMOUNT</span><span>${fmtMY(p.amount)}</span></div></div></div>
      ${p.notes ? `<div class="note-box">${p.notes}</div>` : ""}
      <div class="sig-grid"><div class="sig-line">Prepared By</div><div class="sig-line">Approved By</div></div>
      <div class="footer">${settings.company}</div>`,
      `Payment Voucher ${p.doc_no}`);
  };

  const sColor = { Paid: C.success, Pending: C.warning };
  if (form && doc) return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
      <div style={css.pageTitle}>{editId ? "Edit Payment" : "New Supplier Payment"}</div>
      <button style={mkBtn("ghost")} onClick={() => setForm(false)}>← Back</button>
    </div>
    <div style={css.card}>
      <div style={css.grid2}>
        {[{ key: "doc_no", label: "Voucher No." }, { key: "supplier", label: "Supplier Name" }, { key: "invoice_ref", label: "Supplier Invoice Ref" }, { key: "description", label: "Description" }, { key: "date", label: "Date", type: "date" }, { key: "due_date", label: "Due Date", type: "date" }, { key: "amount", label: "Amount (RM)", type: "number" }].map(f => (
          <div key={f.key}><label style={css.label}>{f.label}</label>
            <input style={css.input} type={f.type || "text"} value={doc[f.key] ?? ""} onChange={e => setDoc(d => ({ ...d, [f.key]: e.target.value }))} />
          </div>
        ))}
        <div><label style={css.label}>Payment Method</label>
          <select style={css.input} value={doc.method} onChange={e => setDoc(d => ({ ...d, method: e.target.value }))}>
            {["Bank Transfer", "Cash", "Cheque", "Online Transfer", "Credit Card"].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div><label style={css.label}>Status</label>
          <select style={css.input} value={doc.status} onChange={e => setDoc(d => ({ ...d, status: e.target.value }))}>
            {["Pending", "Paid"].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 16 }}><label style={css.label}>Notes</label>
        <input style={css.input} value={doc.notes ?? ""} onChange={e => setDoc(d => ({ ...d, notes: e.target.value }))} />
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button style={mkBtn("gold")} onClick={save_}>Save</button>
        <button style={mkBtn("ghost")} onClick={() => setForm(false)}>Cancel</button>
      </div>
    </div>
  </div>);

  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
      <div><div style={css.pageTitle}>Supplier Payments</div><div style={css.pageSub}>{rows.length} record{rows.length !== 1 ? "s" : ""}</div></div>
      <button style={mkBtn("gold")} onClick={openNew}>+ New Payment</button>
    </div>
    <div style={css.card}>
      {loading ? <Spinner /> : rows.length === 0 ? <Empty text="No supplier payments yet" /> : (
        <table style={css.table}><thead><tr>{["Voucher", "Supplier", "Ref", "Date", "Method", "Status", "Amount", "Actions"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(p => <tr key={p.id}>
            <td style={css.td}><span style={{ color: C.gold, fontWeight: 700 }}>{p.doc_no}</span></td>
            <td style={css.td}>{p.supplier}</td><td style={css.td}>{p.invoice_ref}</td>
            <td style={css.td}>{fmtDate(p.date)}</td><td style={css.td}>{p.method}</td>
            <td style={css.td}><span style={css.badge(sColor[p.status] || C.muted)}>{p.status}</span></td>
            <td style={css.td}><strong>{fmtMY(p.amount)}</strong></td>
            <td style={css.td}><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={{ ...mkBtn("ghost"), padding: "6px 12px", fontSize: 12 }} onClick={() => toggleStatus(p)}>{p.status === "Paid" ? "Unpaid" : "✓ Paid"}</button>
              <button style={{ ...mkBtn("ghost"), padding: "6px 12px", fontSize: 12 }} onClick={() => openEdit(p)}>Edit</button>
              <button style={{ ...mkBtn("ghost"), padding: "6px 12px", fontSize: 12 }} onClick={() => printP(p)}>🖨 PDF</button>
              <button style={{ ...mkBtn("danger"), padding: "6px 12px", fontSize: 12 }} onClick={() => del(p.id)}>✕</button>
            </div></td>
          </tr>)}</tbody>
        </table>
      )}
    </div>
  </div>);
}

// ─── SALARY ───────────────────────────────────────────────────────────────────
function SalaryModule({ settings }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [doc, setDoc] = useState(null);

  useEffect(() => { dbLoad("salary_records").then(d => { setRows(d); setLoading(false); }); }, []);

  const n = (v) => parseFloat(v) || 0;
  const gross = (r) => n(r.basic) + n(r.allowance) + n(r.overtime);
  // FIX #7: Floor net at 0 — cannot be negative
  const netPay = (r) => Math.max(0, gross(r) - n(r.deduction) - n(r.epf_employee) - n(r.socso) - n(r.tax));

  const openNew = () => { setDoc({ doc_no: nextDocNo("SAL-", rows), employee: "", position: "", month: today().slice(0, 7), basic: "", allowance: "", overtime: "", deduction: "", epf_employee: "", epf_employer: "", socso: "", tax: "", status: "Pending", notes: "" }); setEditId(null); setForm(true); };
  const openEdit = (r) => { setDoc(r); setEditId(r.id); setForm(true); };
  const save_ = async () => {
    if (editId) { await dbUpdate("salary_records", editId, doc); setRows(rows.map(r => r.id === editId ? { ...doc, id: editId } : r)); }
    else { const ins = await dbInsert("salary_records", doc); if (ins) setRows([ins, ...rows]); }
    setForm(false);
  };
  const del = async (id) => { if (!window.confirm("Delete this salary record?")) return; await dbDelete("salary_records", id); setRows(rows.filter(r => r.id !== id)); };

  const printSlip = (r) => {
    const g = gross(r); const np = netPay(r);
    const totalDed = n(r.epf_employee) + n(r.socso) + n(r.tax) + n(r.deduction);
    const logo = settings.logo ? `<img src="${settings.logo}" class="logo" alt="logo"/>` : `<div style="font-size:22px;font-weight:900">${(settings.company || "").slice(0, 2).toUpperCase()}</div>`;
    printDoc(`
    <div class="header"><div>${logo}</div><div style="text-align:right"><div class="company-name">${settings.company}</div><div style="color:#666;font-size:12px;line-height:1.7">${settings.address}<br/>${settings.phone}</div></div></div>
    <div class="doc-title">SALARY SLIP</div>
    <div class="meta-grid">
      <div class="meta-box"><span class="meta-label">Employee</span><div class="meta-value">${r.employee}</div><div style="margin-top:6px"><span class="meta-label">Position </span>${r.position}</div></div>
      <div class="meta-box"><span class="meta-label">Ref No.</span><div class="meta-value">${r.doc_no}</div><div style="margin-top:6px"><span class="meta-label">Period </span><span class="meta-value">${r.month}</span></div><div><span class="meta-label">Issued </span>${fmtDate(today())}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px">
      <table><thead><tr><th colspan="2">EARNINGS</th></tr></thead><tbody>
        <tr><td>Basic Salary</td><td style="text-align:right">${fmtMY(r.basic)}</td></tr>
        <tr><td>Allowances</td><td style="text-align:right">${fmtMY(r.allowance)}</td></tr>
        <tr><td>Overtime</td><td style="text-align:right">${fmtMY(r.overtime)}</td></tr>
        <tr style="background:#f8f6f0"><td style="font-weight:700">Gross Pay</td><td style="text-align:right;font-weight:700">${fmtMY(g)}</td></tr>
      </tbody></table>
      <table><thead><tr><th colspan="2">DEDUCTIONS</th></tr></thead><tbody>
        <tr><td>EPF Employee (11%)</td><td style="text-align:right">${fmtMY(r.epf_employee)}</td></tr>
        <tr><td>SOCSO</td><td style="text-align:right">${fmtMY(r.socso)}</td></tr>
        <tr><td>Income Tax (PCB)</td><td style="text-align:right">${fmtMY(r.tax)}</td></tr>
        <tr><td>Other Deductions</td><td style="text-align:right">${fmtMY(r.deduction)}</td></tr>
        <tr style="background:#f8f6f0"><td style="font-weight:700">Total Deductions</td><td style="text-align:right;font-weight:700">${fmtMY(totalDed)}</td></tr>
      </tbody></table>
    </div>
    <div class="totals"><div class="totals-box">
      <div class="total-row"><span>EPF Employer (13%)</span><span>${fmtMY(r.epf_employer)}</span></div>
      <div class="total-row grand"><span>NET PAY</span><span>${fmtMY(np)}</span></div>
    </div></div>
    ${r.notes ? `<div class="note-box">${r.notes}</div>` : ""}
    <div class="sig-grid"><div class="sig-line">Employee Signature</div><div class="sig-line">Authorised Signature</div></div>
    <div class="footer">${settings.company} — Confidential Salary Document</div>`,
      `Salary Slip ${r.doc_no}`);
  };

  const sColor = { Paid: C.success, Pending: C.warning };
  if (form && doc) return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
      <div style={css.pageTitle}>{editId ? "Edit Salary Record" : "New Salary Record"}</div>
      <button style={mkBtn("ghost")} onClick={() => setForm(false)}>← Back</button>
    </div>
    <div style={css.card}>
      <div style={css.grid3}>
        {[{ key: "doc_no", label: "Ref No." }, { key: "employee", label: "Employee Name" }, { key: "position", label: "Position" },
          { key: "month", label: "Month", type: "month" }, { key: "basic", label: "Basic Salary (RM)", type: "number" }, { key: "allowance", label: "Allowances (RM)", type: "number" },
          { key: "overtime", label: "Overtime (RM)", type: "number" }, { key: "deduction", label: "Other Deductions (RM)", type: "number" }, { key: "epf_employee", label: "EPF Employee 11% (RM)", type: "number" },
          { key: "epf_employer", label: "EPF Employer 13% (RM)", type: "number" }, { key: "socso", label: "SOCSO (RM)", type: "number" }, { key: "tax", label: "Income Tax/PCB (RM)", type: "number" },
        ].map(f => <div key={f.key}><label style={css.label}>{f.label}</label>
          <input style={css.input} type={f.type || "text"} value={doc[f.key] ?? ""} onChange={e => setDoc(d => ({ ...d, [f.key]: e.target.value }))} />
        </div>)}
      </div>
      <div style={{ ...css.grid2, marginTop: 16 }}>
        <div><label style={css.label}>Status</label>
          <select style={css.input} value={doc.status} onChange={e => setDoc(d => ({ ...d, status: e.target.value }))}>
            {["Pending", "Paid"].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div><label style={css.label}>Notes</label>
          <input style={css.input} value={doc.notes ?? ""} onChange={e => setDoc(d => ({ ...d, notes: e.target.value }))} />
        </div>
      </div>
      <div style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 8, padding: "14px 18px", marginTop: 20 }}>
        <div style={{ display: "flex", gap: 32 }}>
          <div><div style={css.label}>Gross Pay</div><div style={{ fontSize: 18, fontWeight: 800, color: C.gold }}>{fmtMY(gross(doc))}</div></div>
          <div><div style={css.label}>Net Pay</div><div style={{ fontSize: 18, fontWeight: 800, color: C.success }}>{fmtMY(netPay(doc))}</div></div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <button style={mkBtn("gold")} onClick={save_}>Save</button>
        <button style={mkBtn("ghost")} onClick={() => setForm(false)}>Cancel</button>
      </div>
    </div>
  </div>);

  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
      <div><div style={css.pageTitle}>Salary Records</div><div style={css.pageSub}>{rows.length} record{rows.length !== 1 ? "s" : ""}</div></div>
      <button style={mkBtn("gold")} onClick={openNew}>+ New Salary</button>
    </div>
    <div style={css.card}>
      {loading ? <Spinner /> : rows.length === 0 ? <Empty text="No salary records yet" /> : (
        <table style={css.table}><thead><tr>{["Ref", "Employee", "Position", "Month", "Gross", "Net Pay", "Status", "Actions"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}>
            <td style={css.td}><span style={{ color: C.gold, fontWeight: 700 }}>{r.doc_no}</span></td>
            <td style={css.td}>{r.employee}</td><td style={css.td}>{r.position}</td><td style={css.td}>{r.month}</td>
            <td style={css.td}>{fmtMY(gross(r))}</td>
            <td style={css.td}><strong style={{ color: C.success }}>{fmtMY(netPay(r))}</strong></td>
            <td style={css.td}><span style={css.badge(sColor[r.status] || C.muted)}>{r.status}</span></td>
            <td style={css.td}><div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...mkBtn("ghost"), padding: "6px 12px", fontSize: 12 }} onClick={() => openEdit(r)}>Edit</button>
              <button style={{ ...mkBtn("ghost"), padding: "6px 12px", fontSize: 12 }} onClick={() => printSlip(r)}>🖨 Slip</button>
              <button style={{ ...mkBtn("danger"), padding: "6px 12px", fontSize: 12 }} onClick={() => del(r.id)}>✕</button>
            </div></td>
          </tr>)}</tbody>
        </table>
      )}
    </div>
  </div>);
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function SettingsModule({ settings, setSettings }) {
  const [local, setLocal] = useState({ ...settings });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef();

  const handleLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500000) { alert("Logo file too large. Please use an image under 500KB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setLocal(l => ({ ...l, logo: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const saveSettings = async () => {
    setSaving(true);
    await dbUpsertSettings(local);
    setSettings(local);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (<div>
    <div style={css.pageTitle}>Settings</div>
    <div style={css.pageSub}>Company details used on all printed documents · saved to cloud</div>
    <div style={css.card}>
      <div style={{ display: "flex", gap: 24, marginBottom: 28, alignItems: "flex-start" }}>
        <div style={{ width: 120, height: 80, background: "#0f0f1a", border: `2px dashed ${C.border}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
          {local.logo ? <img src={local.logo} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} alt="logo" /> : <span style={{ color: C.muted, fontSize: 11 }}>No Logo</span>}
        </div>
        <div>
          <label style={css.label}>Company Logo</label>
          <input type="file" accept="image/*" ref={fileRef} onChange={handleLogo} style={{ display: "none" }} />
          <button style={{ ...mkBtn("ghost"), marginTop: 8 }} onClick={() => fileRef.current.click()}>Upload Logo</button>
          {local.logo && <button style={{ ...mkBtn("danger"), marginTop: 8, marginLeft: 8 }} onClick={() => setLocal(l => ({ ...l, logo: null }))}>Remove</button>}
          <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>PNG / JPG · Max 500KB</div>
        </div>
      </div>
      <div style={css.grid2}>
        {[{ key: "company", label: "Company Name" }, { key: "regNo", label: "Registration No." }, { key: "address", label: "Address" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" }, { key: "bankName", label: "Bank Name" }, { key: "bankAcc", label: "Bank Account No." }].map(f => (
          <div key={f.key}><label style={css.label}>{f.label}</label>
            <input style={css.input} value={local[f.key] || ""} onChange={e => setLocal(l => ({ ...l, [f.key]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 16 }}>
        <button style={mkBtn("gold")} onClick={saveSettings} disabled={saving}>{saving ? "Saving..." : "Save Settings"}</button>
        {saved && <span style={{ color: C.success, fontSize: 13, fontWeight: 600 }}>✓ Saved</span>}
      </div>
    </div>
  </div>);
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ settings }) {
  const [data, setData] = useState(null);

  // FIX #9: Single Promise.all to avoid race conditions on slow connections
  useEffect(() => {
    Promise.all([dbLoad("invoices"), dbLoad("quotations"), dbLoad("supplier_payments"), dbLoad("salary_records"), dbLoad("costings")])
      .then(([inv, quo, sup, sal, cos]) => setData({ inv, quo, sup, sal, cos }));
  }, []);

  if (!data) return <Spinner />;
  const { inv, quo, sup, sal, cos } = data;
  const lT = (items) => (items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
  const totalInvoiced = inv.reduce((s, i) => s + lT(i.items), 0);
  const totalPaid = inv.filter(i => i.status === "Paid").reduce((s, i) => s + lT(i.items), 0);
  const totalSupplier = sup.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const totalSalary = sal.reduce((s, r) => s + Math.max(0, (parseFloat(r.basic || 0) + parseFloat(r.allowance || 0) + parseFloat(r.overtime || 0)) - (parseFloat(r.deduction || 0) + parseFloat(r.epf_employee || 0) + parseFloat(r.socso || 0) + parseFloat(r.tax || 0))), 0);

  return (<div>
    <div style={{ marginBottom: 28 }}>
      <div style={css.pageTitle}>Welcome, {(settings.company || "").split(" ")[0]} 👋</div>
      <div style={css.pageSub}>Business overview · live from cloud</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
      {[{ label: "Total Invoiced", value: fmtMY(totalInvoiced), color: C.gold, icon: "📄" },
        { label: "Total Collected", value: fmtMY(totalPaid), color: C.success, icon: "✅" },
        { label: "Supplier Payments", value: fmtMY(totalSupplier), color: C.danger, icon: "🏭" },
        { label: "Net Salary Paid", value: fmtMY(totalSalary), color: C.accent, icon: "👤" }
      ].map(s => (
        <div key={s.label} style={{ ...css.statCard, borderLeft: `3px solid ${s.color}` }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5 }}>{s.label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
        </div>
      ))}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div style={css.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, color: C.gold }}>Recent Invoices</div>
        {inv.length === 0 ? <Empty text="No invoices yet" /> : inv.slice(0, 5).map(i => (
          <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
            <div><span style={{ color: C.gold, fontWeight: 700 }}>{i.doc_no}</span> · {i.client}</div>
            <div style={{ color: i.status === "Paid" ? C.success : C.warning, fontWeight: 600 }}>{i.status}</div>
          </div>
        ))}
      </div>
      <div style={css.card}>
        <div style={{ fontWeight: 700, marginBottom: 14, color: C.gold }}>Document Summary</div>
        {[{ label: "Quotations", count: quo.length, color: C.gold }, { label: "Invoices", count: inv.length, color: C.accent },
          { label: "Supplier Payments", count: sup.length, color: C.danger }, { label: "Costing Records", count: cos.length, color: C.warning },
          { label: "Salary Records", count: sal.length, color: C.success }
        ].map(item => (
          <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, color: C.muted }}>{item.label}</span>
            <span style={{ fontWeight: 800, color: item.color, fontSize: 15 }}>{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  </div>);
}

// ─── SHARED: LINE ITEM DOC FORM (Quotation + Invoice) ────────────────────────
function DocForm({ doc, setDoc, title, onSave, onCancel, newItem, fields }) {
  const updItem = (id, key, val) => setDoc(d => ({ ...d, items: d.items.map(i => i.id === id ? { ...i, [key]: val } : i) }));
  const addItem = () => setDoc(d => ({ ...d, items: [...d.items, newItem()] }));
  const remItem = (id) => { if ((doc.items || []).length <= 1) return; setDoc(d => ({ ...d, items: d.items.filter(i => i.id !== id) })); };
  const total = (doc.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);

  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
      <div style={css.pageTitle}>{title}</div>
      <button style={mkBtn("ghost")} onClick={onCancel}>← Back</button>
    </div>
    <div style={css.card}>
      <div style={css.grid2}>
        {fields.map(f => (<div key={f.key}><label style={css.label}>{f.label}</label>
          {f.type === "select"
            ? <select style={css.input} value={doc[f.key] || ""} onChange={e => setDoc(d => ({ ...d, [f.key]: e.target.value }))}>{f.options.map(o => <option key={o}>{o}</option>)}</select>
            : <input style={css.input} type={f.type || "text"} value={doc[f.key] ?? ""} onChange={e => setDoc(d => ({ ...d, [f.key]: e.target.value }))} />}
        </div>))}
      </div>
    </div>
    <div style={css.card}>
      <div style={{ fontWeight: 700, marginBottom: 16, color: C.gold }}>Line Items</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ ...css.table, minWidth: 600, marginBottom: 12 }}>
          <thead><tr>
            <th style={css.th}>Description</th>
            <th style={{ ...css.th, width: 80 }}>Qty</th>
            <th style={{ ...css.th, width: 100 }}>Unit</th>
            <th style={{ ...css.th, width: 130 }}>Price (RM)</th>
            <th style={{ ...css.th, width: 120 }}>Amount</th>
            <th style={{ ...css.th, width: 48 }}></th>
          </tr></thead>
          <tbody>{(doc.items || []).map(item => (<tr key={item.id}>
            <td style={css.td}><input style={css.input} value={item.desc ?? ""} onChange={e => updItem(item.id, "desc", e.target.value)} placeholder="Item description" /></td>
            <td style={css.td}><input style={{ ...css.input, textAlign: "right" }} type="number" min="0" value={item.qty ?? 1} onChange={e => updItem(item.id, "qty", e.target.value)} /></td>
            <td style={css.td}><input style={css.input} value={item.unit ?? ""} onChange={e => updItem(item.id, "unit", e.target.value)} /></td>
            <td style={css.td}><input style={{ ...css.input, textAlign: "right" }} type="number" min="0" value={item.price ?? 0} onChange={e => updItem(item.id, "price", e.target.value)} /></td>
            <td style={{ ...css.td, fontWeight: 700, color: C.gold }}>{fmtMY((Number(item.qty) || 0) * (Number(item.price) || 0))}</td>
            <td style={css.td}><button style={{ ...mkBtn("danger"), padding: "4px 10px", opacity: (doc.items || []).length <= 1 ? 0.3 : 1 }} onClick={() => remItem(item.id)}>✕</button></td>
          </tr>))}</tbody>
        </table>
      </div>
      <button style={{ ...mkBtn("ghost"), fontSize: 12 }} onClick={addItem}>+ Add Item</button>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <div style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 8, padding: "12px 20px", minWidth: 220 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 800, color: C.gold }}>
            <span>TOTAL</span><span>{fmtMY(total)}</span>
          </div>
        </div>
      </div>
    </div>
    <div style={{ display: "flex", gap: 12 }}>
      <button style={mkBtn("gold")} onClick={onSave}>Save Document</button>
      <button style={mkBtn("ghost")} onClick={onCancel}>Cancel</button>
    </div>
  </div>);
}

// ─── COSTING FORM ─────────────────────────────────────────────────────────────
const CATS = ["Material", "Labour", "Equipment", "Subcontract", "Overhead", "Other"];
function CostingForm({ doc, setDoc, onSave, onCancel, newItem, isEdit }) {
  const updItem = (id, key, val) => setDoc(d => ({ ...d, items: d.items.map(i => i.id === id ? { ...i, [key]: val } : i) }));
  const addItem = () => setDoc(d => ({ ...d, items: [...d.items, newItem()] }));
  const remItem = (id) => { if ((doc.items || []).length <= 1) return; setDoc(d => ({ ...d, items: d.items.filter(i => i.id !== id) })); };
  const total = (doc.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);

  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
      <div style={css.pageTitle}>{isEdit ? "Edit Costing" : "New Costing"}</div>
      <button style={mkBtn("ghost")} onClick={onCancel}>← Back</button>
    </div>
    <div style={css.card}>
      <div style={css.grid3}>
        {[{ key: "doc_no", label: "Costing No." }, { key: "project", label: "Project Name" }, { key: "client", label: "Client" }, { key: "date", label: "Date", type: "date" }, { key: "notes", label: "Notes" }].map(f => (
          <div key={f.key}><label style={css.label}>{f.label}</label>
            <input style={css.input} type={f.type || "text"} value={doc[f.key] ?? ""} onChange={e => setDoc(d => ({ ...d, [f.key]: e.target.value }))} />
          </div>
        ))}
      </div>
    </div>
    <div style={css.card}>
      <div style={{ fontWeight: 700, marginBottom: 16, color: C.gold }}>Cost Items</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ ...css.table, minWidth: 700, marginBottom: 12 }}>
          <thead><tr>
            <th style={{ ...css.th, width: 140 }}>Category</th>
            <th style={css.th}>Description</th>
            <th style={{ ...css.th, width: 70 }}>Qty</th>
            <th style={{ ...css.th, width: 90 }}>Unit</th>
            <th style={{ ...css.th, width: 120 }}>Rate (RM)</th>
            <th style={{ ...css.th, width: 120 }}>Amount</th>
            <th style={{ ...css.th, width: 48 }}></th>
          </tr></thead>
          <tbody>{(doc.items || []).map(item => (<tr key={item.id}>
            <td style={css.td}><select style={css.input} value={item.category} onChange={e => updItem(item.id, "category", e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select></td>
            <td style={css.td}><input style={css.input} value={item.desc ?? ""} onChange={e => updItem(item.id, "desc", e.target.value)} /></td>
            <td style={css.td}><input style={{ ...css.input, textAlign: "right" }} type="number" min="0" value={item.qty ?? 1} onChange={e => updItem(item.id, "qty", e.target.value)} /></td>
            <td style={css.td}><input style={css.input} value={item.unit ?? ""} onChange={e => updItem(item.id, "unit", e.target.value)} /></td>
            <td style={css.td}><input style={{ ...css.input, textAlign: "right" }} type="number" min="0" value={item.rate ?? 0} onChange={e => updItem(item.id, "rate", e.target.value)} /></td>
            <td style={{ ...css.td, fontWeight: 700, color: C.gold }}>{fmtMY((Number(item.qty) || 0) * (Number(item.rate) || 0))}</td>
            <td style={css.td}><button style={{ ...mkBtn("danger"), padding: "4px 10px", opacity: (doc.items || []).length <= 1 ? 0.3 : 1 }} onClick={() => remItem(item.id)}>✕</button></td>
          </tr>))}</tbody>
        </table>
      </div>
      <button style={{ ...mkBtn("ghost"), fontSize: 12 }} onClick={addItem}>+ Add Item</button>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <div style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 8, padding: "12px 20px", minWidth: 220 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 800, color: C.gold }}>
            <span>TOTAL COST</span><span>{fmtMY(total)}</span>
          </div>
        </div>
      </div>
    </div>
    <div style={{ display: "flex", gap: 12 }}>
      <button style={mkBtn("gold")} onClick={onSave}>Save Costing</button>
      <button style={mkBtn("ghost")} onClick={onCancel}>Cancel</button>
    </div>
  </div>);
}

// ─── SETUP SCREEN ─────────────────────────────────────────────────────────────
function SetupScreen() {
  return (<div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", padding: 24 }}>
    <div style={{ maxWidth: 560, width: "100%" }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, color: C.gold, textTransform: "uppercase", marginBottom: 8 }}>Malko Accounting</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: C.text, marginBottom: 8 }}>Supabase Setup Required</div>
      <div style={{ color: C.muted, fontSize: 14, marginBottom: 32, lineHeight: 1.7 }}>Connect a free Supabase database for cross-device sync. Follow these steps:</div>
      {[{ n: "1", title: "Create free Supabase account", desc: "supabase.com → New Project (free tier)" },
        { n: "2", title: "Run SQL setup script", desc: "SQL Editor → paste script from README.md → Run" },
        { n: "3", title: "Copy API credentials", desc: "Settings → API → Project URL + anon/public key" },
        { n: "4", title: "Add to .env.local", desc: "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY" },
        { n: "5", title: "Deploy on Vercel", desc: "Add same env vars in Vercel → Project Settings → Environment Variables" },
      ].map(s => (<div key={s.n} style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "flex-start" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.gold, color: "#0f0f1a", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.n}</div>
        <div><div style={{ fontWeight: 700, color: C.text, marginBottom: 2 }}>{s.title}</div><div style={{ color: C.muted, fontSize: 13 }}>{s.desc}</div></div>
      </div>))}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px", marginTop: 24, fontSize: 12, color: C.muted }}>
        See <strong style={{ color: C.gold }}>README.md</strong> for the full SQL script to paste into Supabase.
      </div>
    </div>
  </div>);
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "◈" },
  { id: "quotation", label: "Quotations", icon: "📋" },
  { id: "invoice", label: "Invoices", icon: "📄" },
  { id: "costing", label: "Costing", icon: "📊" },
  { id: "supplier", label: "Supplier Payments", icon: "🏭" },
  { id: "salary", label: "Salary", icon: "👤" },
  { id: "settings", label: "Settings", icon: "⚙" },
];
const DEFAULT_SETTINGS = SEED_SETTINGS;

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [noEnv, setNoEnv] = useState(false);

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key || url.includes("your-project")) { setNoEnv(true); setReady(true); return; }

    const initApp = async () => {
      // Load or seed settings
      const s = await dbLoadSettings();
      if (s) {
        setSettings(prev => ({ ...prev, ...s }));
      } else {
        // First run — seed Malko Solutions settings
        await dbUpsertSettings(SEED_SETTINGS);
        setSettings(SEED_SETTINGS);
      }
      // Check if data already exists
      const existingInv = await dbLoad("invoices");
      if (existingInv.length === 0) {
        // First run — seed all historical invoices
        for (const inv of SEED_INVOICES) {
          await supabase.from("invoices").insert([inv]);
        }
        // Seed all historical quotations
        for (const quo of SEED_QUOTATIONS) {
          await supabase.from("quotations").insert([quo]);
        }
      }
      setReady(true);
    };
    initApp().catch(() => { setReady(true); });
  }, []);

  if (!ready) return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.gold, fontFamily: "DM Sans,sans-serif", fontSize: 16 }}>Connecting to cloud...</div>;
  if (noEnv) return <SetupScreen />;

  return (<div style={css.app}>
    <div style={css.sidebar}>
      <div style={css.sideHeader}>
        <div style={css.sideTitle}>Malko Acc</div>
        <div style={css.sideSub}>Business Manager</div>
      </div>
      {NAV.map(n => (
        <div key={n.id} style={css.navItem(page === n.id)} onClick={() => setPage(n.id)}>
          <span>{n.icon}</span><span>{n.label}</span>
        </div>
      ))}
      <div style={{ marginTop: "auto", padding: "0 20px" }}>
        <div style={{ fontSize: 10, color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: 12, lineHeight: 1.7 }}>
          {settings.company}<br />☁ Cloud synced · Supabase
        </div>
      </div>
    </div>
    <div style={css.main}>
      {page === "dashboard" && <Dashboard settings={settings} />}
      {page === "quotation" && <QuotationModule settings={settings} />}
      {page === "invoice" && <InvoiceModule settings={settings} />}
      {page === "costing" && <CostingModule settings={settings} />}
      {page === "supplier" && <SupplierModule settings={settings} />}
      {page === "salary" && <SalaryModule settings={settings} />}
      {page === "settings" && <SettingsModule settings={settings} setSettings={setSettings} />}
    </div>
  </div>);
}
