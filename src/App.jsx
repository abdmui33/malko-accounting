import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import { SEED_SETTINGS, SEED_CLIENTS, SEED_INVOICES, SEED_QUOTATIONS, NEXT_QUO, NEXT_INV } from "./seed.js";

// ─── Utilities ───────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtMY = (n) => "RM " + parseFloat(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const today = () => new Date().toISOString().slice(0, 10);
const nextDocNo = (prefix, rows) => prefix + String((rows?.length || 0) + 1).padStart(3, "0");
const nf = (v) => parseFloat(v) || 0;

// ─── Supabase helpers ─────────────────────────────────────────────────────────
async function dbLoad(table) {
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
  if (error) { console.error("dbLoad:", table, error); return []; }
  return data || [];
}
async function dbInsert(table, row) {
  const { id: _a, created_at: _b, ...payload } = row;
  const { data, error } = await supabase.from(table).insert([payload]).select().single();
  if (error) { console.error("dbInsert:", table, error); return null; }
  return data;
}
async function dbUpdate(table, id, row) {
  const { id: _a, created_at: _b, ...payload } = row;
  const { error } = await supabase.from(table).update(payload).eq("id", id);
  if (error) console.error("dbUpdate:", table, error);
}
async function dbDelete(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) console.error("dbDelete:", table, error);
}
async function dbUpsertSettings(s) {
  const { id: _a, created_at: _b, ...payload } = s;
  const { error } = await supabase.from("settings").upsert([{ id: 1, ...payload }]);
  if (error) console.error("dbUpsertSettings:", error);
}
async function dbLoadSettings() {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
  if (error) console.error("dbLoadSettings:", error);
  return data || null;
}

// ─── Calc helpers ─────────────────────────────────────────────────────────────
function calcDoc(items, discount, taxRate) {
  const sub = (items || []).reduce((s, i) => s + nf(i.qty) * nf(i.price), 0);
  const disc = nf(discount);
  const tax = ((sub - disc) * nf(taxRate)) / 100;
  return { subtotal: sub, discountAmt: disc, taxAmt: tax, total: sub - disc + tax };
}

// ─── PDF Print ────────────────────────────────────────────────────────────────
function printDoc(html, title) {
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to print/save documents."); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',sans-serif;color:#1a1a2e;background:#fff;padding:40px;font-size:13px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid #1a1a2e}
    .logo{max-width:120px;max-height:80px;object-fit:contain}.company-name{font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:4px}
    .doc-title{font-size:28px;font-weight:800;color:#c9a84c;letter-spacing:2px;margin-bottom:20px}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
    .meta-box{background:#f8f6f0;padding:14px 18px;border-radius:6px}
    .meta-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:4px;display:block}
    .meta-value{font-size:13px;font-weight:600;color:#1a1a2e}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    th{background:#1a1a2e;color:#c9a84c;padding:10px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
    td{padding:10px 14px;border-bottom:1px solid #eee;font-size:12px}tr:nth-child(even) td{background:#fafafa}
    .totals{display:flex;justify-content:flex-end;margin-bottom:24px}.totals-box{min-width:280px}
    .total-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee;font-size:13px}
    .total-row.grand{font-size:15px;font-weight:800;color:#c9a84c;border-top:3px solid #1a1a2e;border-bottom:none;padding-top:10px;margin-top:4px}
    .footer{text-align:center;color:#aaa;font-size:11px;margin-top:40px;padding-top:16px;border-top:1px solid #eee}
    .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px}
    .sig-line{border-top:1px solid #333;padding-top:10px;text-align:center;font-size:11px;color:#666}
  </style></head><body>${html}<script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = { bg:"#0f0f1a",card:"#16162a",border:"#2a2a45",gold:"#c9a84c",text:"#e8e8f0",muted:"#7070a0",accent:"#4c6ef5",success:"#40c057",danger:"#fa5252",warning:"#fd7e14" };
const QSC = { Draft:C.muted,Sent:C.accent,Received:C.success };
const ISC = { Draft:C.muted,Sent:C.accent,Pending:C.warning,Paid:C.success,Overdue:C.danger };

function mkBtn(v="gold") {
  return { padding:"9px 20px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700,letterSpacing:.3,transition:"all .15s",
    background:v==="gold"?C.gold:v==="danger"?C.danger:v==="success"?C.success:v==="ghost"?"transparent":C.accent,
    color:v==="ghost"?C.muted:"#0f0f1a", border:v==="ghost"?`1px solid ${C.border}`:"none" };
}

const css = {
  app:{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Sans','Segoe UI',sans-serif",display:"flex"},
  sidebar:{width:224,background:C.card,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",padding:"0 0 24px",position:"fixed",height:"100vh",zIndex:10,overflowY:"auto"},
  main:{marginLeft:224,flex:1,padding:"32px 36px",minHeight:"100vh"},
  sideHeader:{padding:"28px 20px 20px",borderBottom:`1px solid ${C.border}`,marginBottom:8},
  sideTitle:{fontSize:13,fontWeight:800,letterSpacing:3,color:C.gold,textTransform:"uppercase"},
  sideSub:{fontSize:10,color:C.muted,marginTop:2,letterSpacing:1},
  navItem:(a)=>({display:"flex",alignItems:"center",gap:10,padding:"10px 20px",margin:"2px 10px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:a?700:500,color:a?C.gold:C.muted,background:a?"rgba(201,168,76,0.1)":"transparent",border:a?"1px solid rgba(201,168,76,0.2)":"1px solid transparent",transition:"all .2s"}),
  pageTitle:{fontSize:26,fontWeight:800,color:C.text,marginBottom:4},
  pageSub:{fontSize:13,color:C.muted,marginBottom:28},
  card:{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"24px 28px",marginBottom:20},
  input:{background:"#0f0f1a",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 14px",color:C.text,fontSize:13,width:"100%",outline:"none"},
  label:{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:5,display:"block"},
  table:{width:"100%",borderCollapse:"collapse"},
  th:{textAlign:"left",padding:"10px 14px",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,borderBottom:`1px solid ${C.border}`},
  td:{padding:"11px 14px",fontSize:13,borderBottom:"1px solid rgba(42,42,69,0.5)"},
  badge:(color)=>({display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,letterSpacing:.5,textTransform:"uppercase",background:color+"22",color}),
  grid2:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16},
};

function Empty({text}){return <div style={{textAlign:"center",padding:"40px 0",color:C.muted,fontSize:13}}>{text}</div>;}
function Spinner(){return <div style={{textAlign:"center",padding:"60px 0",color:C.muted}}>Loading...</div>;}

// ─── Shared Components ────────────────────────────────────────────────────────
function ClientSelect({doc,setDoc}) {
  const [clients,setClients]=useState([]);
  useEffect(()=>{dbLoad("clients").then(setClients);},[] );
  if(!clients.length) return null;
  const fill=(id)=>{const c=clients.find(x=>x.id===id);if(c)setDoc(d=>({...d,client:c.name,attn:c.attn||"",address:c.address||""}));};
  return(<div style={{marginBottom:16,gridColumn:"1 / -1"}}>
    <label style={css.label}>Quick Select Client</label>
    <select style={css.input} value="" onChange={e=>fill(e.target.value)}>
      <option value="">— Select existing client —</option>
      {clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.attn?" — "+c.attn:""}</option>)}
    </select>
  </div>);
}

function DocForm({ doc, setDoc, title, onSave, onCancel, newItem, fields, showDiscountTax }) {
  const { subtotal, total } = calcDoc(doc.items, doc.discount, doc.tax_rate);
  const updateItem = (id, key, val) => {
    setDoc(d => ({ ...d, items: d.items.map(i => i.id === id ? { ...i, [key]: val } : i) }));
  };
  const addItem = () => setDoc(d => ({ ...d, items: [...(d.items||[]), newItem()] }));
  const removeItem = (id) => setDoc(d => ({ ...d, items: d.items.filter(i => i.id !== id) }));

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={css.pageTitle}>{title}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={mkBtn("gold")} onClick={onSave}>Save Document</button>
          <button style={mkBtn("ghost")} onClick={onCancel}>Cancel</button>
        </div>
      </div>
      <div style={css.grid2}>
        <div style={css.card}>
          <ClientSelect doc={doc} setDoc={setDoc} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {fields.map(f => (
              <div key={f.key} style={{ gridColumn: f.type === "textarea" ? "1/-1" : "auto" }}>
                <label style={css.label}>{f.label}</label>
                {f.type === "select" ? (
                  <select style={css.input} value={doc[f.key] || ""} onChange={e => setDoc({ ...doc, [f.key]: e.target.value })}>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea style={{ ...css.input, height: 80 }} value={doc[f.key] || ""} onChange={e => setDoc({ ...doc, [f.key]: e.target.value })} />
                ) : (
                  <input type={f.type || "text"} style={css.input} value={doc[f.key] || ""} onChange={e => setDoc({ ...doc, [f.key]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
        </div>
        <div style={css.card}>
          <div style={css.label}>Totals</div>
          <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span>{fmtMY(subtotal)}</span></div>
            {showDiscountTax && (
              <>
                <div><label style={css.label}>Discount</label><input style={css.input} type="number" value={doc.discount || 0} onChange={e => setDoc({ ...doc, discount: nf(e.target.value) })} /></div>
                <div><label style={css.label}>Tax Rate (%)</label><input style={css.input} type="number" value={doc.tax_rate || 0} onChange={e => setDoc({ ...doc, tax_rate: nf(e.target.value) })} /></div>
              </>
            )}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 10, display: "flex", justifyContent: "space-between", fontWeight: 800, color: C.gold, fontSize: 18 }}>
              <span>Total</span><span>{fmtMY(total)}</span>
            </div>
          </div>
        </div>
      </div>
      <div style={css.card}>
        <table style={css.table}>
          <thead><tr><th style={css.th}>Description</th><th style={css.th}>Qty</th><th style={css.th}>Price</th><th style={css.th}>Amount</th><th style={css.th}></th></tr></thead>
          <tbody>
            {(doc.items||[]).map(item => (
              <tr key={item.id}>
                <td style={css.td}><input style={css.input} value={item.desc} onChange={e => updateItem(item.id, "desc", e.target.value)} /></td>
                <td style={css.td}><input style={css.input} type="number" value={item.qty} onChange={e => updateItem(item.id, "qty", e.target.value)} /></td>
                <td style={css.td}><input style={css.input} type="number" value={item.price} onChange={e => updateItem(item.id, "price", e.target.value)} /></td>
                <td style={css.td}>{fmtMY(nf(item.qty) * nf(item.price))}</td>
                <td style={css.td}><button style={mkBtn("danger")} onClick={() => removeItem(item.id)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button style={mkBtn("ghost")} onClick={addItem}>+ Add Item</button>
      </div>
    </div>
  );
}

// ─── Modules ──────────────────────────────────────────────────────────────────
function QuotationModule({settings, onNavigate}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [doc, setDoc] = useState(null);

  useEffect(() => { dbLoad("quotations").then(d => { setRows(d); setLoading(false); }); }, []);

  const newItem = () => ({ id: uid(), desc: "", qty: 1, unit: "unit", price: 0 });

  const openNew = () => {
    setDoc({ doc_no: nextDocNo("QUO-", rows), client: "", attn: "", address: "", date: today(), status: "Draft", discount: 0, tax_rate: 0, items: [newItem()] });
    setEditId(null); setForm(true);
  };

  const openEdit = (r) => {
    setDoc({ ...r, items: Array.isArray(r.items) ? r.items : [newItem()] });
    setEditId(r.id); setForm(true);
  };

  const save_ = async () => {
    if (editId) { await dbUpdate("quotations", editId, doc); setRows(rows.map(r => r.id === editId ? { ...doc, id: editId } : r)); }
    else { const ins = await dbInsert("quotations", doc); if (ins) setRows([ins, ...rows]); }
    setForm(false);
  };

  if (form && doc) return <DocForm doc={doc} setDoc={setDoc} title="Quotation" onSave={save_} onCancel={() => setForm(false)} newItem={newItem} showDiscountTax={true} fields={[{key:"doc_no",label:"No."},{key:"client",label:"Client"},{key:"date",label:"Date",type:"date"}]} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={css.pageTitle}>Quotations</div>
        <button style={mkBtn("gold")} onClick={openNew}>+ New Quotation</button>
      </div>
      <div style={css.card}>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty text="No quotations yet" /> : (
          <table style={css.table}>
            <thead><tr><th style={css.th}>No.</th><th style={css.th}>Client</th><th style={css.th}>Status</th><th style={css.th}>Total</th><th style={css.th}>Actions</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.id}><td style={css.td}>{r.doc_no}</td><td style={css.td}>{r.client}</td><td style={css.td}>{r.status}</td><td style={css.td}>{fmtMY(calcDoc(r.items, r.discount, r.tax_rate).total)}</td><td style={css.td}><button style={mkBtn("ghost")} onClick={() => openEdit(r)}>Edit</button></td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function InvoiceModule({settings}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [doc, setDoc] = useState(null);
  const [fClient, setFClient] = useState("");
  const [fStatus, setFStatus] = useState("");

  useEffect(() => { dbLoad("invoices").then(d => { setRows(d); setLoading(false); }); }, []);

  const newItem = () => ({ id: uid(), desc: "", qty: 1, unit: "unit", price: 0 });

  const openNew = () => {
    setDoc({ doc_no: nextDocNo("INV-", rows), client: "", date: today(), status: "Draft", discount: 0, tax_rate: 0, items: [newItem()] });
    setEditId(null); setForm(true);
  };

  const openEdit = (r) => {
    setDoc({ ...r, items: Array.isArray(r.items) ? r.items : [newItem()] });
    setEditId(r.id); setForm(true);
  };

  const save_ = async () => {
    if (editId) { await dbUpdate("invoices", editId, doc); setRows(rows.map(r => r.id === editId ? { ...doc, id: editId } : r)); }
    else { const ins = await dbInsert("invoices", doc); if (ins) setRows([ins, ...rows]); }
    setForm(false);
  };

  const filtered = rows.filter(r => (r.client||"").toLowerCase().includes(fClient.toLowerCase()) && (fStatus === "" || r.status === fStatus));

  if (form && doc) return <DocForm doc={doc} setDoc={setDoc} title="Invoice" onSave={save_} onCancel={() => setForm(false)} newItem={newItem} showDiscountTax={true} fields={[{key:"doc_no",label:"No."},{key:"client",label:"Client"},{key:"date",label:"Date",type:"date"}]} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={css.pageTitle}>Invoices</div>
        <button style={mkBtn("gold")} onClick={openNew}>+ New Invoice</button>
      </div>
      <div style={{display:"flex", gap:10, marginBottom:20}}>
          <input style={{...css.input, width:200}} placeholder="Filter Client..." value={fClient} onChange={e=>setFClient(e.target.value)} />
          <select style={{...css.input, width:150}} value={fStatus} onChange={e=>setFStatus(e.target.value)}>
              <option value="">All Status</option>
              {["Draft","Sent","Paid"].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
      </div>
      <div style={css.card}>
        {loading ? <Spinner /> : filtered.length === 0 ? <Empty text="No invoices found" /> : (
          <table style={css.table}>
            <thead><tr><th style={css.th}>No.</th><th style={css.th}>Client</th><th style={css.th}>Status</th><th style={css.th}>Total</th><th style={css.th}>Actions</th></tr></thead>
            <tbody>{filtered.map(r => <tr key={r.id}><td style={css.td}>{r.doc_no}</td><td style={css.td}>{r.client}</td><td style={css.td}>{r.status}</td><td style={css.td}>{fmtMY(calcDoc(r.items, r.discount, r.tax_rate).total)}</td><td style={css.td}><button style={mkBtn("ghost")} onClick={() => openEdit(r)}>Edit</button></td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────
const NAV = [ {id:"dashboard", label:"Dashboard", icon:"📊"}, {id:"quotation", label:"Quotations", icon:"📄"}, {id:"invoice", label:"Invoices", icon:"💰"} ];

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [settings, setSettings] = useState({ company: "Malko Solutions" });

  useEffect(() => { dbLoadSettings().then(s => s && setSettings(s)); }, []);

  return (
    <div style={css.app}>
      <div style={css.sidebar}>
        <div style={css.sideHeader}><div style={css.sideTitle}>{settings?.company}</div></div>
        {NAV.map(n => (
          <div key={n.id} style={css.navItem(page===n.id)} onClick={() => setPage(n.id)}>
            {n.icon} {n.label}
          </div>
        ))}
      </div>
      <div style={css.main}>
        {page === "dashboard" && <div>Welcome to Dashboard</div>}
        {page === "quotation" && <QuotationModule settings={settings} onNavigate={setPage} />}
        {page === "invoice" && <InvoiceModule settings={settings} />}
      </div>
    </div>
  );
}
