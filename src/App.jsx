import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import { SEED_SETTINGS, SEED_CLIENTS, SEED_INVOICES, SEED_QUOTATIONS, NEXT_QUO, NEXT_INV } from "./seed.js";

// ─── Utilities ───────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtMY = (n) => "RM " + parseFloat(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const today = () => new Date().toISOString().slice(0, 10);
const nextDocNo = (prefix, rows) => prefix + String(rows.length + 1).padStart(3, "0");
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
    .note-box{background:#fffbf0;border-left:4px solid #c9a84c;padding:12px 16px;margin-bottom:16px;font-size:12px;line-height:1.7}
    .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px}
    .sig-line{border-top:1px solid #333;padding-top:10px;text-align:center;font-size:11px;color:#666}
    @media print{body{padding:20px}}
  </style></head><body>${html}<script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = { bg:"#0f0f1a",card:"#16162a",border:"#2a2a45",gold:"#c9a84c",text:"#e8e8f0",muted:"#7070a0",accent:"#4c6ef5",success:"#40c057",danger:"#fa5252",warning:"#fd7e14" };
const QSC = { Draft:C.muted,Sent:C.accent,"Success (To Invoice)":C.success,Archive:C.danger };
const ISC = { Draft:C.muted,"Sent/Pending Payment":C.warning,Received:C.success };

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
  grid3:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16},
  statCard:{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px 24px"},
};
function Empty({text}){return <div style={{textAlign:"center",padding:"40px 0",color:C.muted,fontSize:13}}>{text}</div>;}
function Spinner(){return <div style={{textAlign:"center",padding:"60px 0",color:C.muted}}>Loading...</div>;}

// ─── PDF Doc Header ───────────────────────────────────────────────────────────
function docHeader(s, docType, docNo, date, dueDate, toName, toAttn, toAddress, extra="") {
  const logo = s.logo?`<img src="${s.logo}" class="logo" alt="logo"/>`:`<div style="font-size:22px;font-weight:900;color:#1a1a2e">${(s.company||"").slice(0,2).toUpperCase()}</div>`;
  return `<div class="header"><div>${logo}</div><div style="text-align:right"><div class="company-name">${s.company||""}</div><div style="color:#666;font-size:12px;line-height:1.7">${s.address||""}<br/>${s.phone||""} · ${s.email||""}<br/>Reg: ${s.regNo||""}</div></div></div>
  <div class="doc-title">${docType}</div>
  <div class="meta-grid"><div class="meta-box"><span class="meta-label">To</span><div class="meta-value">${toName||""}</div>${toAttn?`<div style="color:#666;font-size:12px;margin-top:3px">Attn: ${toAttn}</div>`:""}<div style="color:#666;font-size:12px;margin-top:3px">${(toAddress||"").replace(/\n/g,"<br/>")}</div></div>
  <div class="meta-box"><span class="meta-label">${docType} No.</span><div class="meta-value">${docNo||""}</div><div style="margin-top:8px"><span class="meta-label">Date </span><span class="meta-value">${fmtDate(date)}</span></div>${dueDate?`<div><span class="meta-label">Due </span><span class="meta-value" style="font-weight:800;color:#c9a84c">${fmtDate(dueDate)}</span></div>`:""}${extra}</div></div>`;
}

function totalsHtml(sub, disc, tax, taxRate, total) {
  return `<div class="totals"><div class="totals-box">
    <div class="total-row"><span>Subtotal</span><span>${fmtMY(sub)}</span></div>
    ${disc?`<div class="total-row"><span>Discount</span><span>- ${fmtMY(disc)}</span></div>`:""}
    ${taxRate?`<div class="total-row"><span>Tax (${taxRate}%)</span><span>${fmtMY(tax)}</span></div>`:""}
    <div class="total-row grand"><span>TOTAL</span><span>${fmtMY(total)}</span></div>
  </div></div>`;
}

// ─── Client Address Book ──────────────────────────────────────────────────────
function ClientsModule() {
  const [clients,setClients]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(false);
  const [editId,setEditId]=useState(null);
  const blank=()=>({name:"",attn:"",email:"",phone:"",address:""});
  const [form,setForm]=useState(blank());
  useEffect(()=>{dbLoad("clients").then(d=>{setClients(d);setLoading(false);});},[]);
  const openNew=()=>{setForm(blank());setEditId(null);setModal(true);};
  const openEdit=(c)=>{setForm(c);setEditId(c.id);setModal(true);};
  const save_=async()=>{
    if(!form.name.trim()){alert("Client name is required");return;}
    if(editId){await dbUpdate("clients",editId,form);setClients(clients.map(c=>c.id===editId?{...form,id:editId}:c));}
    else{const ins=await dbInsert("clients",form);if(ins)setClients([ins,...clients]);}
    setModal(false);
  };
  const del=async(id)=>{if(!window.confirm("Remove this client?"))return;await dbDelete("clients",id);setClients(clients.filter(c=>c.id!==id));};
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><div style={css.pageTitle}>Client Address Book</div><div style={css.pageSub}>Quick-select when creating documents</div></div>
      <button style={mkBtn("gold")} onClick={openNew}>+ Add Client</button>
    </div>
    {modal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:28,width:480}}>
        <div style={{fontWeight:800,fontSize:16,color:C.text,marginBottom:20}}>{editId?"Edit Client":"New Client"}</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {[{key:"name",label:"Company / Client Name *"},{key:"attn",label:"Attention (Contact Person)"},{key:"email",label:"Email",type:"email"},{key:"phone",label:"Phone"}].map(f=>(
            <div key={f.key}><label style={css.label}>{f.label}</label><input style={css.input} type={f.type||"text"} value={form[f.key]||""} onChange={e=>setForm(x=>({...x,[f.key]:e.target.value}))}/></div>
          ))}
          <div><label style={css.label}>Address</label><textarea style={{...css.input,height:72,resize:"vertical"}} value={form.address||""} onChange={e=>setForm(x=>({...x,address:e.target.value}))}/></div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button style={mkBtn("gold")} onClick={save_}>Save</button>
          <button style={mkBtn("ghost")} onClick={()=>setModal(false)}>Cancel</button>
        </div>
      </div>
    </div>}
    {loading?<Spinner/>:(
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
        {clients.length===0?<div style={{gridColumn:"1/-1"}}><Empty text="No clients yet"/></div>:clients.map(c=>(
          <div key={c.id} style={{...css.card,marginBottom:0}}>
            <div style={{fontWeight:700,color:C.text,marginBottom:4,fontSize:14}}>{c.name}</div>
            {c.email&&<div style={{fontSize:12,color:C.accent,marginBottom:6}}>{c.email}</div>}
            {c.attn&&<div style={{fontSize:12,color:C.muted}}>👤 {c.attn}</div>}
            {c.phone&&<div style={{fontSize:12,color:C.muted}}>📞 {c.phone}</div>}
            {c.address&&<div style={{fontSize:12,color:C.muted,marginTop:4}}>📍 {c.address.split("\n")[0]}</div>}
            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button style={{...mkBtn("ghost"),padding:"5px 12px",fontSize:11}} onClick={()=>openEdit(c)}>Edit</button>
              <button style={{...mkBtn("danger"),padding:"5px 12px",fontSize:11}} onClick={()=>del(c.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>);
}

// ─── Client Quick-Select ──────────────────────────────────────────────────────
function ClientSelect({doc,setDoc}) {
  const [clients,setClients]=useState([]);
  useEffect(()=>{dbLoad("clients").then(setClients);},[]);
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

// ─── QUOTATIONS ───────────────────────────────────────────────────────────────
function QuotationModule({settings,onNavigate}) {
  // ALL hooks at the top — no exceptions
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [doc,setDoc]=useState(null);

  useEffect(()=>{dbLoad("quotations").then(d=>{setRows(d);setLoading(false);});},[]);

  const newItem=()=>({id:uid(),desc:"",qty:1,unit:"unit",price:0});

  const openNew=()=>{
    setDoc({doc_no:rows.length===0?NEXT_QUO:nextDocNo("QUO-",rows),title:"",client:"",attn:"",address:"",date:today(),valid_until:"",status:"Draft",notes:"",terms:(settings&&settings.terms_quo)||"",discount:0,tax_rate:0,items:[newItem()]});
    setEditId(null);setForm(true);
  };
  const openEdit=(r)=>{
    setDoc({discount:0,tax_rate:0,attn:"",title:"",...r,items:Array.isArray(r.items)&&r.items.length?r.items:[newItem()]});
    setEditId(r.id);setForm(true);
  };
  const save_=async()=>{
    if(editId){await dbUpdate("quotations",editId,doc);setRows(rows.map(r=>r.id===editId?{...doc,id:editId}:r));}
    else{const ins=await dbInsert("quotations",doc);if(ins)setRows([ins,...rows]);}
    setForm(false);
  };
  const del=async(id)=>{if(!window.confirm("Delete this quotation?"))return;await dbDelete("quotations",id);setRows(rows.filter(r=>r.id!==id));};

  const convertToInvoice=(q)=>{
    const prefill={doc_no:"",client:q.client,attn:q.attn||"",address:q.address||"",date:today(),due_date:"",payment_terms_days:"30 days",status:"Draft",notes:q.notes||"",terms:q.terms||((settings&&settings.terms_inv)||""),ref_quo:q.doc_no,discount:q.discount||0,tax_rate:q.tax_rate||0,items:(q.items||[]).map(i=>({...i,id:uid()}))};
    sessionStorage.setItem("prefill_invoice",JSON.stringify(prefill));
    onNavigate("invoice");
  };

  const printQ=(q)=>{
    const items=q.items||[];
    const {subtotal,discountAmt,taxAmt,total}=calcDoc(items,q.discount,q.tax_rate);
    const trs=items.map((i,idx)=>`<tr><td>${idx+1}</td><td>${i.desc}</td><td style="text-align:right">${nf(i.qty)}</td><td>${i.unit}</td><td style="text-align:right">${fmtMY(i.price)}</td><td style="text-align:right;font-weight:600">${fmtMY(nf(i.qty)*nf(i.price))}</td></tr>`).join("");
    printDoc(
      docHeader(settings,"QUOTATION",q.doc_no,q.date,null,q.client,q.attn,q.address,"")+
      `${q.title?`<div style="background:#f8f6f0;border-left:4px solid #1a1a2e;padding:10px 18px;margin-bottom:20px;font-size:14px;font-weight:700;color:#1a1a2e">${q.title}</div>`:""}<table><thead><tr><th>#</th><th>Description</th><th style="text-align:right">Qty</th><th>Unit</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${trs}</tbody></table>`+
      totalsHtml(subtotal,discountAmt,taxAmt,q.tax_rate,total)+
      (q.notes?`<div class="note-box"><strong>Notes:</strong> ${q.notes}</div>`:"")+
      (q.terms?`<div class="note-box"><strong>Terms & Conditions:</strong><br/>${q.terms.replace(/\n/g,"<br/>")}</div>`:"")+
      (q.valid_until?`<p style="color:#666;font-size:12px;margin-bottom:16px">Valid until ${fmtDate(q.valid_until)}.</p>`:"")+
      `<div class="footer">Thank you for your consideration · ${(settings&&settings.company)||""}</div>`,
      `Quotation ${q.doc_no}`
    );
  };

  // Early return AFTER all hooks
  if(form&&doc) return <DocForm doc={doc} setDoc={setDoc} title={editId?"Edit Quotation":"New Quotation"} onSave={save_} onCancel={()=>setForm(false)} newItem={newItem} showDiscountTax={true}
    fields={[{key:"doc_no",label:"Quotation No."},{key:"client",label:"Client Name"},{key:"attn",label:"Attention (Contact Person)"},{key:"address",label:"Client Address"},{key:"date",label:"Date",type:"date"},{key:"valid_until",label:"Valid Until",type:"date"},{key:"status",label:"Status",type:"select",options:["Draft","Sent","Success (To Invoice)","Archive"]},{key:"notes",label:"Notes / Scope"},{key:"terms",label:"Terms & Conditions",type:"textarea"}]}/>;


  const exportCSV=()=>{
    if(!rows.length){alert("No quotations to export.");return;}
    const headers=["Quotation No","Client","Attention","Date","Valid Until","Status","Notes","Subtotal","Discount","Tax Rate","Total"];
    const csvRows=rows.map(q=>{
      const {subtotal,discountAmt,taxAmt,total}=calcDoc(q.items,q.discount,q.tax_rate);
      return [
        q.doc_no||"",q.client||"",q.attn||"",q.date||"",q.valid_until||"",
        q.status||"",(q.notes||"").replace(/,/g,";"),
        subtotal.toFixed(2),discountAmt.toFixed(2),q.tax_rate||0,total.toFixed(2)
      ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",");
    });
    const csv=[headers.map(h=>`"${h}"`).join(","),...csvRows].join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=`Malko_Quotations_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><div style={css.pageTitle}>Quotations</div><div style={css.pageSub}>{rows.length} document{rows.length!==1?"s":""}</div></div>
      <div style={{display:"flex",gap:10}}>
        <button style={mkBtn("gold")} onClick={openNew}>+ New Quotation</button>
        <button style={{...mkBtn("ghost"),fontSize:12}} onClick={exportCSV}>⬇ Export CSV</button>
      </div>
    </div>
    <div style={css.card}>
      {loading?<Spinner/>:rows.length===0?<Empty text="No quotations yet"/>:(
        <div style={{overflowX:"auto"}}><table style={css.table}>
          <thead><tr>{["No.","Title","Client","Date","Valid Until","Status","Total","Actions"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(q=><tr key={q.id}>
            <td style={css.td}><span style={{color:C.gold,fontWeight:700}}>{q.doc_no}</span></td>
            <td style={{...css.td,maxWidth:200}}><div style={{fontWeight:600,color:C.text,fontSize:12}}>{q.title||"—"}</div></td>
            <td style={css.td}><div>{q.client}</div>{q.attn&&<div style={{fontSize:11,color:C.muted}}>👤 {q.attn}</div>}</td>
            <td style={css.td}>{fmtDate(q.date)}</td>
            <td style={css.td}>{fmtDate(q.valid_until)}</td>
            <td style={css.td}><span style={css.badge(QSC[q.status]||C.muted)}>{q.status||"Draft"}</span></td>
            <td style={css.td}><strong>{fmtMY(calcDoc(q.items,q.discount,q.tax_rate).total)}</strong></td>
            <td style={css.td}><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <select style={{background:"#0f0f1a",border:"1px solid #2a2a45",borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer",color:QSC[q.status]||"#7070a0"}} value={q.status||"Draft"} onChange={e=>{const s=e.target.value;dbUpdate("quotations",q.id,{status:s});setRows(rows.map(r=>r.id===q.id?{...r,status:s}:r));}}>{["Draft","Sent","Success (To Invoice)","Archive"].map(s=><option key={s}>{s}</option>)}</select>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>openEdit(q)}>Edit</button>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>printQ(q)}>🖨 PDF</button>
              <button style={{...mkBtn("accent"),padding:"5px 10px",fontSize:11}} onClick={()=>convertToInvoice(q)}>→ INV</button>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11,color:C.accent,borderColor:C.accent}} onClick={()=>{sessionStorage.setItem("prefill_do",JSON.stringify({...q,source:"QUO"}));window.dispatchEvent(new Event("navigate_to_do"));}}>🚚 DO</button>
              <button style={{...mkBtn("danger"),padding:"5px 10px",fontSize:11}} onClick={()=>del(q.id)}>✕</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
      )}
    </div>
  </div>);
}

// ─── INVOICES ─────────────────────────────────────────────────────────────────
function InvoiceModule({settings}) {
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [doc,setDoc]=useState(null);
  const [fClient,setFClient]=useState("");
  const [fStatus,setFStatus]=useState("");
  const [fMonth,setFMonth]=useState("");

  const newItem=()=>({id:uid(),desc:"",qty:1,unit:"unit",price:0});

  useEffect(()=>{
    dbLoad("invoices").then(d=>{setRows(d);setLoading(false);});
    const handler=()=>{
      const raw=sessionStorage.getItem("prefill_invoice");
      if(raw){try{const data=JSON.parse(raw);
        dbLoad("invoices").then(existing=>{data.doc_no=existing.length===0?NEXT_INV:nextDocNo("INV-",existing);setDoc({discount:0,tax_rate:0,payment_terms_days:"30 days",...data});setEditId(null);setForm(true);sessionStorage.removeItem("prefill_invoice");});
      }catch(e){console.error(e);}}
    };
    window.addEventListener("navigate_to_invoice",handler);
    return()=>window.removeEventListener("navigate_to_invoice",handler);
  },[]);

  const computeDueDate=(base,terms)=>{try{if(!base||!terms||terms==="Custom")return"";const d=new Date(base);d.setDate(d.getDate()+parseInt(terms));return d.toISOString().slice(0,10);}catch(e){return"";}};

  const openNew=()=>{const base=today();setDoc({doc_no:rows.length===0?NEXT_INV:nextDocNo("INV-",rows),title:"",client:"",attn:"",address:"",date:base,due_date:computeDueDate(base,"30"),payment_terms_days:"30 days",status:"Draft",ref_quo:"",notes:"",terms:(settings&&settings.terms_inv)||"",discount:0,tax_rate:0,items:[newItem()]});setEditId(null);setForm(true);};
  const openEdit=(r)=>{setDoc({discount:0,tax_rate:0,attn:"",ref_quo:"",title:"",payment_terms_days:"30 days",...r,items:Array.isArray(r.items)&&r.items.length?r.items:[newItem()]});setEditId(r.id);setForm(true);};
  const save_=async()=>{
    if(editId){await dbUpdate("invoices",editId,doc);setRows(rows.map(r=>r.id===editId?{...doc,id:editId}:r));}
    else{const ins=await dbInsert("invoices",doc);if(ins)setRows([ins,...rows]);}
    setForm(false);
  };
  const del=async(id)=>{if(!window.confirm("Delete this invoice?"))return;await dbDelete("invoices",id);setRows(rows.filter(r=>r.id!==id));};

  const printI=(inv)=>{
    const items=inv.items||[];const {subtotal,discountAmt,taxAmt,total}=calcDoc(items,inv.discount,inv.tax_rate);
    const trs=items.map((i,idx)=>`<tr><td>${idx+1}</td><td>${i.desc}</td><td style="text-align:right">${nf(i.qty)}</td><td>${i.unit}</td><td style="text-align:right">${fmtMY(i.price)}</td><td style="text-align:right;font-weight:600">${fmtMY(nf(i.qty)*nf(i.price))}</td></tr>`).join("");
    const resolvedDue=inv.due_date||computeDueDate(inv.date,inv.payment_terms_days);
    const extraMeta=(inv.payment_terms_days?`<div style="margin-top:4px"><span class="meta-label">Payment Terms </span><span class="meta-value">${inv.payment_terms_days}</span></div>`:"")+(inv.ref_quo?`<div style="margin-top:4px"><span class="meta-label">Ref QUO </span><span class="meta-value">${inv.ref_quo}</span></div>`:"");
    printDoc(docHeader(settings,"INVOICE",inv.doc_no,inv.date,resolvedDue,inv.client,inv.attn||"",inv.address||"",extraMeta)+
      `${inv.title?`<div style="background:#f8f6f0;border-left:4px solid #1a1a2e;padding:10px 18px;margin-bottom:20px;font-size:14px;font-weight:700;color:#1a1a2e">${inv.title}</div>`:""}<table><thead><tr><th>#</th><th>Description</th><th style="text-align:right">Qty</th><th>Unit</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${trs}</tbody></table>`+
      totalsHtml(subtotal,discountAmt,taxAmt,inv.tax_rate,total)+
      (inv.notes?`<div class="note-box"><strong>Notes:</strong> ${inv.notes}</div>`:"")+
      (inv.terms?`<div class="note-box"><strong>Terms & Conditions:</strong><br/>${inv.terms.replace(/\n/g,"<br/>")}</div>`:"")+
      `<div class="note-box"><strong>Payment Details</strong><br/>${((settings&&settings.payment_terms)||("Bank: "+((settings&&settings.bankName)||"")+"\nAcc: "+((settings&&settings.bankAcc)||""))).replace(/\n/g,"<br/>")}</div>`+
      `<div class="footer">Thank you for your business · ${(settings&&settings.company)||""}</div>`,`Invoice ${inv.doc_no}`);
  };

  const calcT=(inv)=>calcDoc(inv.items,inv.discount,inv.tax_rate).total;
  const filtered=rows.filter(inv=>{if(fClient&&inv.client!==fClient)return false;if(fStatus&&inv.status!==fStatus)return false;if(fMonth&&!(inv.date||"").startsWith(fMonth))return false;return true;});
  const fTotal=filtered.reduce((s,inv)=>s+calcT(inv),0);
  const clientList=[...new Set(rows.map(r=>r.client).filter(Boolean))].sort();
  const monthList=[...new Set(rows.map(r=>(r.date||"").slice(0,7)).filter(Boolean))].sort().reverse();
  const hasFilter=fClient||fStatus||fMonth;

  if(form&&doc) return <DocForm doc={doc} setDoc={setDoc} title={editId?"Edit Invoice":"New Invoice"} onSave={save_} onCancel={()=>setForm(false)} newItem={newItem} showDiscountTax={true}
    fields={[{key:"doc_no",label:"Invoice No."},{key:"client",label:"Client Name"},{key:"attn",label:"Attention (Contact Person)"},{key:"address",label:"Client Address"},{key:"date",label:"Date",type:"date"},{key:"payment_terms_days",label:"Payment Terms",type:"select",options:["7 days","14 days","30 days","60 days","Custom"]},{key:"due_date",label:"Due Date",type:"date"},{key:"ref_quo",label:"Ref: Quotation No."},{key:"status",label:"Status",type:"select",options:["Draft","Sent/Pending Payment","Received"]},{key:"notes",label:"Notes"},{key:"terms",label:"Terms & Conditions",type:"textarea"}]}/>;


  const exportCSV=()=>{
    const data=hasFilter?filtered:rows;
    if(!data.length){alert("No invoices to export.");return;}
    const headers=["Invoice No","Client","Attention","Date","Due Date","Payment Terms","Status","Ref Quo","Notes","Subtotal","Discount","Tax Rate","Total"];
    const csvRows=data.map(inv=>{
      const {subtotal,discountAmt,taxAmt,total}=calcDoc(inv.items,inv.discount,inv.tax_rate);
      return [
        inv.doc_no||"",inv.client||"",inv.attn||"",inv.date||"",
        inv.due_date||computeDueDate(inv.date,inv.payment_terms_days)||"",
        inv.payment_terms_days||"",inv.status||"",inv.ref_quo||"",
        (inv.notes||"").replace(/,/g,";"),
        subtotal.toFixed(2),discountAmt.toFixed(2),inv.tax_rate||0,total.toFixed(2)
      ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",");
    });
    const csv=[headers.map(h=>`"${h}"`).join(","),...csvRows].join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=`Malko_Invoices${hasFilter?"_filtered":""}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
      <div><div style={css.pageTitle}>Invoices</div><div style={css.pageSub}>{rows.length} document{rows.length!==1?"s":""}</div></div>
      <div style={{display:"flex",gap:10}}>
        <button style={mkBtn("gold")} onClick={openNew}>+ New Invoice</button>
        <button style={{...mkBtn("ghost"),fontSize:12}} onClick={exportCSV}>⬇ Export CSV</button>
      </div>
    </div>
    <div style={{...css.card,marginBottom:12,padding:"16px 20px"}}>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div style={{flex:"1 1 180px"}}><label style={css.label}>Company</label><select style={css.input} value={fClient} onChange={e=>setFClient(e.target.value)}><option value="">All Companies</option>{clientList.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
        <div style={{flex:"1 1 130px"}}><label style={css.label}>Month</label><select style={css.input} value={fMonth} onChange={e=>setFMonth(e.target.value)}><option value="">All Months</option>{monthList.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
        <div style={{flex:"1 1 130px"}}><label style={css.label}>Status</label><select style={css.input} value={fStatus} onChange={e=>setFStatus(e.target.value)}><option value="">All Statuses</option>{["Draft","Sent/Pending Payment","Received"].map(s=><option key={s} value={s}>{s}</option>)}</select></div>
        {hasFilter&&<button style={{...mkBtn("ghost"),padding:"8px 16px",alignSelf:"flex-end"}} onClick={()=>{setFClient("");setFStatus("");setFMonth("");}}>✕ Clear</button>}
      </div>
      {hasFilter&&<div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #2a2a45",display:"flex",gap:24,flexWrap:"wrap",alignItems:"center"}}>
        <div><span style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Showing </span><span style={{fontWeight:700,color:C.text}}>{filtered.length} invoice{filtered.length!==1?"s":""}</span></div>
        <div><span style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Total </span><span style={{fontWeight:800,color:C.gold,fontSize:16}}>{fmtMY(fTotal)}</span></div>
        {fClient&&<span style={css.badge(C.accent)}>{fClient}</span>}
        {fStatus&&<span style={css.badge(ISC[fStatus]||C.muted)}>{fStatus}</span>}
        {fMonth&&<span style={css.badge(C.muted)}>{fMonth}</span>}
      </div>}
    </div>
    <div style={css.card}>
      {loading?<Spinner/>:rows.length===0?<Empty text="No invoices yet"/>:filtered.length===0?<Empty text="No invoices match filters"/>:(
        <div style={{overflowX:"auto"}}><table style={css.table}>
          <thead><tr>{["No.","Title","Client","Date","Due","Status","Total","Actions"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map(inv=><tr key={inv.id}>
            <td style={css.td}><span style={{color:C.gold,fontWeight:700}}>{inv.doc_no}</span>{inv.ref_quo&&<div style={{fontSize:10,color:C.muted}}>ref: {inv.ref_quo}</div>}</td>
            <td style={{...css.td,maxWidth:200}}><div style={{fontWeight:600,color:C.text,fontSize:12}}>{inv.title||"—"}</div></td>
            <td style={css.td}><div>{inv.client}</div>{inv.attn&&<div style={{fontSize:11,color:C.muted}}>👤 {inv.attn}</div>}</td>
            <td style={css.td}>{fmtDate(inv.date)}</td>
            <td style={css.td}>{fmtDate(inv.due_date||computeDueDate(inv.date,inv.payment_terms_days))}</td>
            <td style={css.td}><span style={css.badge(ISC[inv.status]||C.muted)}>{inv.status}</span></td>
            <td style={css.td}><strong>{fmtMY(calcT(inv))}</strong></td>
            <td style={css.td}><div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <select style={{background:"#0f0f1a",border:"1px solid #2a2a45",borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer",color:ISC[inv.status]||"#7070a0"}} value={inv.status} onChange={e=>{const s=e.target.value;dbUpdate("invoices",inv.id,{status:s});setRows(rows.map(r=>r.id===inv.id?{...r,status:s}:r));}}>{["Draft","Sent/Pending Payment","Received"].map(s=><option key={s}>{s}</option>)}</select>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>openEdit(inv)}>Edit</button>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>printI(inv)}>🖨 PDF</button>
              <button style={{...mkBtn("danger"),padding:"5px 10px",fontSize:11}} onClick={()=>del(inv.id)}>✕</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
      )}
    </div>
  </div>);
}

function CostingModule({settings}) {
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [doc,setDoc]=useState(null);
  const newItem=()=>({id:uid(),desc:"",category:"Material",qty:1,unit:"unit",rate:0});
  useEffect(()=>{dbLoad("costings").then(d=>{setRows(d);setLoading(false);});},[]);
  const lT=(items)=>(items||[]).reduce((s,i)=>s+nf(i.qty)*nf(i.rate),0);
  const openNew=()=>{setDoc({doc_no:nextDocNo("CST-",rows),project:"",client:"",date:today(),notes:"",items:[newItem()]});setEditId(null);setForm(true);};
  const openEdit=(r)=>{setDoc({...r,items:Array.isArray(r.items)&&r.items.length?r.items:[newItem()]});setEditId(r.id);setForm(true);};
  const save_=async()=>{
    if(editId){await dbUpdate("costings",editId,doc);setRows(rows.map(r=>r.id===editId?{...doc,id:editId}:r));}
    else{const ins=await dbInsert("costings",doc);if(ins)setRows([ins,...rows]);}
    setForm(false);
  };
  const del=async(id)=>{if(!window.confirm("Delete?"))return;await dbDelete("costings",id);setRows(rows.filter(r=>r.id!==id));};
  const printC=(c)=>{
    const items=c.items||[];const cats=[...new Set(items.map(i=>i.category))];let trs="";
    cats.forEach(cat=>{const ci=items.filter(i=>i.category===cat);const ct=ci.reduce((s,i)=>s+nf(i.qty)*nf(i.rate),0);
      trs+=`<tr><td colspan="6" style="background:#f0f0f0;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:1px;padding:8px 14px">${cat}</td></tr>`;
      ci.forEach((i,idx)=>{trs+=`<tr><td>${idx+1}</td><td>${i.desc}</td><td style="text-align:right">${nf(i.qty)}</td><td>${i.unit}</td><td style="text-align:right">${fmtMY(i.rate)}</td><td style="text-align:right;font-weight:600">${fmtMY(nf(i.qty)*nf(i.rate))}</td></tr>`;});
      trs+=`<tr><td colspan="5" style="text-align:right;font-weight:700;color:#555;font-size:11px;padding:8px 14px">${cat} Subtotal</td><td style="font-weight:700;text-align:right;padding:8px 14px">${fmtMY(ct)}</td></tr>`;
    });
    printDoc(docHeader(settings,"PROJECT COSTING",c.doc_no,c.date,null,c.client,"","",`<div style="margin-top:8px"><span class="meta-label">Project </span><span class="meta-value">${c.project}</span></div>`)+
      `<table><thead><tr><th>#</th><th>Description</th><th style="text-align:right">Qty</th><th>Unit</th><th style="text-align:right">Rate (RM)</th><th style="text-align:right">Amount</th></tr></thead><tbody>${trs}</tbody></table>`+
      `<div class="totals"><div class="totals-box"><div class="total-row grand"><span>TOTAL COST</span><span>${fmtMY(lT(items))}</span></div></div></div>`+
      (c.notes?`<div class="note-box"><strong>Notes:</strong> ${c.notes}</div>`:"")+
      `<div class="footer">Prepared by ${(settings&&settings.company)||""}</div>`,`Costing ${c.doc_no}`);
  };
  if(form&&doc) return <CostingForm doc={doc} setDoc={setDoc} onSave={save_} onCancel={()=>setForm(false)} newItem={newItem} isEdit={!!editId}/>;
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><div style={css.pageTitle}>Project Costing</div><div style={css.pageSub}>{rows.length} record{rows.length!==1?"s":""}</div></div>
      <button style={mkBtn("gold")} onClick={openNew}>+ New Costing</button>
    </div>
    <div style={css.card}>
      {loading?<Spinner/>:rows.length===0?<Empty text="No costing records yet"/>:(
        <table style={css.table}><thead><tr>{["No.","Project","Client","Date","Total Cost","Actions"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(c=><tr key={c.id}>
            <td style={css.td}><span style={{color:C.gold,fontWeight:700}}>{c.doc_no}</span></td>
            <td style={css.td}>{c.project}</td><td style={css.td}>{c.client}</td><td style={css.td}>{fmtDate(c.date)}</td>
            <td style={css.td}><strong>{fmtMY(lT(c.items))}</strong></td>
            <td style={css.td}><div style={{display:"flex",gap:6}}>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>openEdit(c)}>Edit</button>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>printC(c)}>🖨 PDF</button>
              <button style={{...mkBtn("danger"),padding:"5px 10px",fontSize:11}} onClick={()=>del(c.id)}>✕</button>
            </div></td>
          </tr>)}</tbody>
        </table>
      )}
    </div>
  </div>);
}

// ─── SUPPLIER PAYMENTS ────────────────────────────────────────────────────────
function SupplierModule({settings}) {
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [doc,setDoc]=useState(null);
  useEffect(()=>{dbLoad("supplier_payments").then(d=>{setRows(d);setLoading(false);});},[]);
  const openNew=()=>{setDoc({doc_no:nextDocNo("SPY-",rows),supplier:"",invoice_ref:"",date:today(),due_date:"",amount:"",method:"Bank Transfer",status:"Pending",description:"",notes:""});setEditId(null);setForm(true);};
  const openEdit=(r)=>{setDoc(r);setEditId(r.id);setForm(true);};
  const save_=async()=>{
    if(editId){await dbUpdate("supplier_payments",editId,doc);setRows(rows.map(r=>r.id===editId?{...doc,id:editId}:r));}
    else{const ins=await dbInsert("supplier_payments",doc);if(ins)setRows([ins,...rows]);}
    setForm(false);
  };
  const del=async(id)=>{if(!window.confirm("Delete?"))return;await dbDelete("supplier_payments",id);setRows(rows.filter(r=>r.id!==id));};
  const toggleStatus=async(p)=>{const s=p.status==="Paid"?"Pending":"Paid";await dbUpdate("supplier_payments",p.id,{status:s});setRows(rows.map(r=>r.id===p.id?{...r,status:s}:r));};
  const printP=(p)=>{
    printDoc(docHeader(settings,"PAYMENT VOUCHER",p.doc_no,p.date,p.due_date,p.supplier,"","",`<div style="margin-top:8px"><span class="meta-label">Method </span><span class="meta-value">${p.method}</span></div>`)+
      `<div class="note-box"><strong>Supplier Invoice Ref:</strong> ${p.invoice_ref||"—"}<br/><strong>Description:</strong> ${p.description||"—"}</div>`+
      `<div class="totals"><div class="totals-box"><div class="total-row grand"><span>AMOUNT</span><span>${fmtMY(p.amount)}</span></div></div></div>`+
      (p.notes?`<div class="note-box">${p.notes}</div>`:"")+
      `<div class="sig-grid"><div class="sig-line">Prepared By</div><div class="sig-line">Approved By</div></div>`+
      `<div class="footer">${(settings&&settings.company)||""}</div>`,`Payment Voucher ${p.doc_no}`);
  };
  const sColor={Paid:C.success,Pending:C.warning};
  const pendingAmt=rows.filter(r=>r.status==="Pending").reduce((s,r)=>s+nf(r.amount),0);
  if(form&&doc) return(<div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:24}}>
      <div style={css.pageTitle}>{editId?"Edit Payment":"New Supplier Payment"}</div>
      <button style={mkBtn("ghost")} onClick={()=>setForm(false)}>← Back</button>
    </div>
    <div style={css.card}>
      <div style={css.grid2}>
        {[{key:"doc_no",label:"Voucher No."},{key:"supplier",label:"Supplier Name"},{key:"invoice_ref",label:"Supplier Invoice Ref"},{key:"description",label:"Description"},{key:"date",label:"Date",type:"date"},{key:"due_date",label:"Due Date",type:"date"},{key:"amount",label:"Amount (RM)",type:"number"}].map(f=>(
          <div key={f.key}><label style={css.label}>{f.label}</label><input style={css.input} type={f.type||"text"} value={doc[f.key]??""} onChange={e=>setDoc(d=>({...d,[f.key]:e.target.value}))}/></div>
        ))}
        <div><label style={css.label}>Payment Method</label><select style={css.input} value={doc.method} onChange={e=>setDoc(d=>({...d,method:e.target.value}))}>{["Bank Transfer","Cash","Cheque","Online Transfer","Credit Card"].map(o=><option key={o}>{o}</option>)}</select></div>
        <div><label style={css.label}>Status</label><select style={css.input} value={doc.status} onChange={e=>setDoc(d=>({...d,status:e.target.value}))}>{["Pending","Paid"].map(o=><option key={o}>{o}</option>)}</select></div>
      </div>
      <div style={{marginTop:16}}><label style={css.label}>Notes</label><input style={css.input} value={doc.notes??""} onChange={e=>setDoc(d=>({...d,notes:e.target.value}))}/></div>
      <div style={{display:"flex",gap:12,marginTop:24}}><button style={mkBtn("gold")} onClick={save_}>Save</button><button style={mkBtn("ghost")} onClick={()=>setForm(false)}>Cancel</button></div>
    </div>
  </div>);
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><div style={css.pageTitle}>Supplier Payments</div><div style={css.pageSub}>{rows.length} record{rows.length!==1?"s":""} · Pending: <span style={{color:C.warning,fontWeight:700}}>{fmtMY(pendingAmt)}</span></div></div>
      <button style={mkBtn("gold")} onClick={openNew}>+ New Payment</button>
    </div>
    <div style={css.card}>
      {loading?<Spinner/>:rows.length===0?<Empty text="No supplier payments yet"/>:(
        <div style={{overflowX:"auto"}}><table style={css.table}>
          <thead><tr>{["Voucher","Supplier","Ref","Date","Method","Status","Amount","Actions"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(p=><tr key={p.id}>
            <td style={css.td}><span style={{color:C.gold,fontWeight:700}}>{p.doc_no}</span></td>
            <td style={css.td}>{p.supplier}</td><td style={css.td}>{p.invoice_ref}</td>
            <td style={css.td}>{fmtDate(p.date)}</td><td style={css.td}>{p.method}</td>
            <td style={css.td}><span style={css.badge(sColor[p.status]||C.muted)}>{p.status}</span></td>
            <td style={css.td}><strong>{fmtMY(p.amount)}</strong></td>
            <td style={css.td}><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>toggleStatus(p)}>{p.status==="Paid"?"Unpaid":"✓ Paid"}</button>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>openEdit(p)}>Edit</button>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>printP(p)}>🖨 PDF</button>
              <button style={{...mkBtn("danger"),padding:"5px 10px",fontSize:11}} onClick={()=>del(p.id)}>✕</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
      )}
    </div>
  </div>);
}

// ─── SALARY ───────────────────────────────────────────────────────────────────
function SalaryModule({settings}) {
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [doc,setDoc]=useState(null);
  useEffect(()=>{dbLoad("salary_records").then(d=>{setRows(d);setLoading(false);});},[]);
  const gross=(r)=>nf(r.basic)+nf(r.allowance)+nf(r.overtime);
  const netPay=(r)=>Math.max(0,gross(r)-nf(r.deduction)-nf(r.epf_employee)-nf(r.socso)-nf(r.tax));
  const openNew=()=>{setDoc({doc_no:nextDocNo("SAL-",rows),employee:"",position:"",month:today().slice(0,7),basic:"",allowance:"",overtime:"",deduction:"",epf_employee:"",epf_employer:"",socso:"",tax:"",status:"Pending",notes:""});setEditId(null);setForm(true);};
  const openEdit=(r)=>{setDoc(r);setEditId(r.id);setForm(true);};
  const save_=async()=>{
    if(editId){await dbUpdate("salary_records",editId,doc);setRows(rows.map(r=>r.id===editId?{...doc,id:editId}:r));}
    else{const ins=await dbInsert("salary_records",doc);if(ins)setRows([ins,...rows]);}
    setForm(false);
  };
  const del=async(id)=>{if(!window.confirm("Delete?"))return;await dbDelete("salary_records",id);setRows(rows.filter(r=>r.id!==id));};
  const printSlip=(r)=>{
    const g=gross(r);const np=netPay(r);const td=nf(r.epf_employee)+nf(r.socso)+nf(r.tax)+nf(r.deduction);
    const logo=(settings&&settings.logo)?`<img src="${settings.logo}" class="logo" alt="logo"/>`:`<div style="font-size:22px;font-weight:900">${((settings&&settings.company)||"").slice(0,2).toUpperCase()}</div>`;
    printDoc(`<div class="header"><div>${logo}</div><div style="text-align:right"><div class="company-name">${(settings&&settings.company)||""}</div><div style="color:#666;font-size:12px;line-height:1.7">${(settings&&settings.address)||""}<br/>${(settings&&settings.phone)||""}</div></div></div>
    <div class="doc-title">SALARY SLIP</div>
    <div class="meta-grid"><div class="meta-box"><span class="meta-label">Employee</span><div class="meta-value">${r.employee}</div><div style="margin-top:6px"><span class="meta-label">Position </span>${r.position}</div></div>
    <div class="meta-box"><span class="meta-label">Ref No.</span><div class="meta-value">${r.doc_no}</div><div style="margin-top:6px"><span class="meta-label">Period </span><span class="meta-value">${r.month}</span></div></div></div>
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
      <tr style="background:#f8f6f0"><td style="font-weight:700">Total Deductions</td><td style="text-align:right;font-weight:700">${fmtMY(td)}</td></tr>
    </tbody></table></div>
    <div class="totals"><div class="totals-box"><div class="total-row"><span>EPF Employer (13%)</span><span>${fmtMY(r.epf_employer)}</span></div><div class="total-row grand"><span>NET PAY</span><span>${fmtMY(np)}</span></div></div></div>
    ${r.notes?`<div class="note-box">${r.notes}</div>`:""}
    <div class="sig-grid"><div class="sig-line">Employee Signature</div><div class="sig-line">Authorised Signature</div></div>
    <div class="footer">${(settings&&settings.company)||""} — Confidential</div>`,`Salary Slip ${r.doc_no}`);
  };
  const sColor={Paid:C.success,Pending:C.warning};
  if(form&&doc) return(<div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:24}}>
      <div style={css.pageTitle}>{editId?"Edit Salary Record":"New Salary Record"}</div>
      <button style={mkBtn("ghost")} onClick={()=>setForm(false)}>← Back</button>
    </div>
    <div style={css.card}>
      <div style={css.grid3}>
        {[{key:"doc_no",label:"Ref No."},{key:"employee",label:"Employee Name"},{key:"position",label:"Position"},
          {key:"month",label:"Month",type:"month"},{key:"basic",label:"Basic Salary (RM)",type:"number"},{key:"allowance",label:"Allowances (RM)",type:"number"},
          {key:"overtime",label:"Overtime (RM)",type:"number"},{key:"deduction",label:"Other Deductions (RM)",type:"number"},{key:"epf_employee",label:"EPF Employee 11% (RM)",type:"number"},
          {key:"epf_employer",label:"EPF Employer 13% (RM)",type:"number"},{key:"socso",label:"SOCSO (RM)",type:"number"},{key:"tax",label:"Income Tax/PCB (RM)",type:"number"},
        ].map(f=><div key={f.key}><label style={css.label}>{f.label}</label><input style={css.input} type={f.type||"text"} value={doc[f.key]??""} onChange={e=>setDoc(d=>({...d,[f.key]:e.target.value}))}/></div>)}
      </div>
      <div style={{...css.grid2,marginTop:16}}>
        <div><label style={css.label}>Status</label><select style={css.input} value={doc.status} onChange={e=>setDoc(d=>({...d,status:e.target.value}))}>{["Pending","Paid"].map(o=><option key={o}>{o}</option>)}</select></div>
        <div><label style={css.label}>Notes</label><input style={css.input} value={doc.notes??""} onChange={e=>setDoc(d=>({...d,notes:e.target.value}))}/></div>
      </div>
      <div style={{background:"rgba(201,168,76,0.1)",border:"1px solid rgba(201,168,76,0.3)",borderRadius:8,padding:"14px 18px",marginTop:20}}>
        <div style={{display:"flex",gap:32}}>
          <div><div style={css.label}>Gross Pay</div><div style={{fontSize:18,fontWeight:800,color:C.gold}}>{fmtMY(gross(doc))}</div></div>
          <div><div style={css.label}>Net Pay</div><div style={{fontSize:18,fontWeight:800,color:C.success}}>{fmtMY(netPay(doc))}</div></div>
        </div>
      </div>
      <div style={{display:"flex",gap:12,marginTop:20}}><button style={mkBtn("gold")} onClick={save_}>Save</button><button style={mkBtn("ghost")} onClick={()=>setForm(false)}>Cancel</button></div>
    </div>
  </div>);
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><div style={css.pageTitle}>Salary Records</div><div style={css.pageSub}>{rows.length} record{rows.length!==1?"s":""}</div></div>
      <button style={mkBtn("gold")} onClick={openNew}>+ New Salary</button>
    </div>
    <div style={css.card}>
      {loading?<Spinner/>:rows.length===0?<Empty text="No salary records yet"/>:(
        <table style={css.table}><thead><tr>{["Ref","Employee","Position","Month","Gross","Net Pay","Status","Actions"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(r=><tr key={r.id}>
            <td style={css.td}><span style={{color:C.gold,fontWeight:700}}>{r.doc_no}</span></td>
            <td style={css.td}>{r.employee}</td><td style={css.td}>{r.position}</td><td style={css.td}>{r.month}</td>
            <td style={css.td}>{fmtMY(gross(r))}</td>
            <td style={css.td}><strong style={{color:C.success}}>{fmtMY(netPay(r))}</strong></td>
            <td style={css.td}><span style={css.badge(sColor[r.status]||C.muted)}>{r.status}</span></td>
            <td style={css.td}><div style={{display:"flex",gap:6}}>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>openEdit(r)}>Edit</button>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>printSlip(r)}>🖨 Slip</button>
              <button style={{...mkBtn("danger"),padding:"5px 10px",fontSize:11}} onClick={()=>del(r.id)}>✕</button>
            </div></td>
          </tr>)}</tbody>
        </table>
      )}
    </div>
  </div>);
}


// ─── DELIVERY ORDERS / ACCEPTANCE ────────────────────────────────────────────
function DeliveryOrderModule({settings}) {
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [doc,setDoc]=useState(null);

  useEffect(()=>{
    dbLoad("delivery_orders").then(d=>{setRows(d);setLoading(false);});
    const handler=()=>{
      const raw=sessionStorage.getItem("prefill_do");
      if(!raw) return;
      try{
        const src=JSON.parse(raw);
        sessionStorage.removeItem("prefill_do");
        dbLoad("delivery_orders").then(existing=>{
          setDoc({
            doc_no:existing.length===0?"DO-001":nextDocNo("DO-",existing),
            ref_doc:src.doc_no||"",
            source_type:src.source||"INV",
            title:src.title||"",
            date:today(),
            client:src.client||"",
            attn:src.attn||"",
            delivery_address:src.address||"",
            items:(src.items||[]).map(i=>({id:uid(),desc:i.desc||"",qty:nf(i.qty)||1,unit:i.unit||"unit"})),
            notes:"",
            status:"Pending",
          });
          setEditId(null);
          setForm(true);
        });
      }catch(e){console.error(e);}
    };
    window.addEventListener("navigate_to_do",handler);
    return()=>window.removeEventListener("navigate_to_do",handler);
  },[]);

  const openEdit=(r)=>{setDoc({...r,items:Array.isArray(r.items)&&r.items.length?r.items:[{id:uid(),desc:"",qty:1,unit:"unit"}]});setEditId(r.id);setForm(true);};
  const openNew=()=>{setDoc({doc_no:rows.length===0?"DO-001":nextDocNo("DO-",rows),ref_doc:"",source_type:"",title:"",date:today(),client:"",attn:"",delivery_address:"",items:[{id:uid(),desc:"",qty:1,unit:"unit"}],notes:"",status:"Pending"});setEditId(null);setForm(true);};

  const save_=async()=>{
    if(editId){await dbUpdate("delivery_orders",editId,doc);setRows(rows.map(r=>r.id===editId?{...doc,id:editId}:r));}
    else{const ins=await dbInsert("delivery_orders",doc);if(ins)setRows([ins,...rows]);}
    setForm(false);
  };
  const del=async(id)=>{if(!window.confirm("Delete this Delivery Order?"))return;await dbDelete("delivery_orders",id);setRows(rows.filter(r=>r.id!==id));};

  const printDO=(d)=>{
    const items=d.items||[];
    const logo=(settings&&settings.logo)?`<img src="${settings.logo}" class="logo" alt="logo"/>`:`<div style="font-size:22px;font-weight:900;color:#1a1a2e">${((settings&&settings.company)||"").slice(0,2).toUpperCase()}</div>`;
    const trs=items.map((i,idx)=>`
      <tr>
        <td style="text-align:center;padding:10px 14px">${idx+1}</td>
        <td style="padding:10px 14px">${i.desc||""}</td>
        <td style="text-align:center;padding:10px 14px">${i.qty||""}</td>
        <td style="text-align:center;padding:10px 14px">${i.unit||""}</td>
      </tr>`).join("");
    printDoc(`
      <div class="header">
        <div>${logo}</div>
        <div style="text-align:right">
          <div class="company-name">${(settings&&settings.company)||""}</div>
          <div style="color:#666;font-size:12px;line-height:1.8">${(settings&&settings.address)||""}<br/>${(settings&&settings.phone)||""} · ${(settings&&settings.email)||""}<br/>Reg: ${(settings&&settings.regNo)||""}</div>
        </div>
      </div>

      <div class="doc-title">DELIVERY ORDER / ACCEPTANCE FORM</div>

      <div class="meta-grid">
        <div class="meta-box">
          <span class="meta-label">Client</span>
          <div class="meta-value">${d.client||""}</div>
          ${d.attn?`<div style="color:#666;font-size:12px;margin-top:4px">Attn: ${d.attn}</div>`:""}
          ${d.delivery_address?`<div style="margin-top:10px"><span class="meta-label">Delivery Address</span><div style="color:#333;font-size:12px;line-height:1.7;margin-top:3px">${d.delivery_address.replace(/\n/g,"<br/>")}</div></div>`:""}
        </div>
        <div class="meta-box">
          <span class="meta-label">D.O. No.</span>
          <div class="meta-value">${d.doc_no||""}</div>
          <div style="margin-top:8px"><span class="meta-label">Date </span><span class="meta-value">${fmtDate(d.date)}</span></div>
          ${d.ref_doc?`<div style="margin-top:6px"><span class="meta-label">Ref: ${d.source_type||"Doc"} </span><span class="meta-value">${d.ref_doc}</span></div>`:""}
        </div>
      </div>

      ${d.title?`<div style="background:#f0f0f8;border-left:4px solid #1a1a2e;padding:12px 18px;margin-bottom:20px;font-size:14px;font-weight:700;color:#1a1a2e">${d.title}</div>`:""}

      <table>
        <thead>
          <tr>
            <th style="text-align:center;width:40px">#</th>
            <th>Description of Goods / Services</th>
            <th style="text-align:center;width:70px">Qty</th>
            <th style="text-align:center;width:80px">Unit</th>
          </tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>

      ${d.notes?`<div class="note-box" style="margin-top:16px"><strong>Notes:</strong> ${d.notes}</div>`:""}

      <div style="margin-top:50px;border:1px solid #ddd;border-radius:8px;padding:24px 28px;background:#fafafa">
        <div style="font-size:13px;font-weight:700;color:#1a1a2e;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Client Acknowledgement</div>
        <div style="font-size:12px;color:#444;line-height:1.8;margin-bottom:24px">
          I hereby confirm that the above-mentioned goods / services have been delivered and/or completed to my satisfaction.
          The items listed have been received in good order and condition, and the scope of work has been carried out as agreed.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:16px">
          <div>
            <div style="border-top:1px solid #555;padding-top:8px;margin-top:48px">
              <div style="font-size:12px;font-weight:700;color:#333">Authorised Signature</div>
              <div style="font-size:11px;color:#666;margin-top:4px">Name: ___________________________________</div>
              <div style="font-size:11px;color:#666;margin-top:6px">Designation: ______________________________</div>
              <div style="font-size:11px;color:#666;margin-top:6px">Date: _____________________________________</div>
              <div style="font-size:11px;color:#333;font-weight:700;margin-top:8px">${d.client||""}</div>
            </div>
          </div>
          <div>
            <div style="border-top:1px solid #555;padding-top:8px;margin-top:48px">
              <div style="font-size:12px;font-weight:700;color:#333">Company Stamp <span style="font-weight:400;color:#888">(if applicable)</span></div>
              <div style="height:70px;border:1px dashed #ccc;border-radius:6px;margin-top:10px"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="footer" style="margin-top:32px">
        This document is computer generated · ${(settings&&settings.company)||""} · ${d.doc_no||""}
      </div>
    `, `DO ${d.doc_no}`);
  };

  const sColor={Pending:C.warning,Delivered:C.success,Returned:C.danger};

  // ── FORM VIEW ────────────────────────────────────────────────────────────────
  if(form&&doc) return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
      <div style={css.pageTitle}>{editId?"Edit Delivery Order":"New Delivery Order"}</div>
      <button style={mkBtn("ghost")} onClick={()=>setForm(false)}>← Back</button>
    </div>

    <div style={css.card}>
      <div style={{fontWeight:700,color:C.gold,marginBottom:16}}>Document Details</div>
      <div style={css.grid2}>
        <div><label style={css.label}>D.O. No.</label><input style={css.input} value={doc.doc_no??""} onChange={e=>setDoc(d=>({...d,doc_no:e.target.value}))}/></div>
        <div><label style={css.label}>Date</label><input style={css.input} type="date" value={doc.date??""} onChange={e=>setDoc(d=>({...d,date:e.target.value}))}/></div>
        <div><label style={css.label}>Reference (INV/QUO No.)</label><input style={css.input} value={doc.ref_doc??""} onChange={e=>setDoc(d=>({...d,ref_doc:e.target.value}))}/></div>
        <div><label style={css.label}>Status</label>
          <select style={css.input} value={doc.status} onChange={e=>setDoc(d=>({...d,status:e.target.value}))}>
            {["Pending","Delivered","Returned"].map(o=><option key={o}>{o}</option>)}
          </select>
        </div>
        <div><label style={css.label}>Client / Recipient</label><input style={css.input} value={doc.client??""} onChange={e=>setDoc(d=>({...d,client:e.target.value}))}/></div>
        <div><label style={css.label}>Attention (Contact Person)</label><input style={css.input} value={doc.attn??""} onChange={e=>setDoc(d=>({...d,attn:e.target.value}))}/></div>
        <div style={{gridColumn:"1 / -1"}}><label style={css.label}>Delivery Address</label>
          <textarea style={{...css.input,height:72,resize:"vertical"}} value={doc.delivery_address??""} onChange={e=>setDoc(d=>({...d,delivery_address:e.target.value}))}/>
        </div>
      </div>
    </div>

    <div style={css.card}>
      <div style={{fontWeight:700,color:C.gold,marginBottom:12}}>Items / Scope of Work</div>
      <div style={{marginBottom:16}}>
        <label style={css.label}>Title / Description</label>
        <input style={css.input} placeholder="e.g. SCaRF Rotary Kiln — Phase 2 Interpretation Services" value={doc.title||""} onChange={e=>setDoc(d=>({...d,title:e.target.value}))}/>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{...css.table,marginBottom:12}}>
          <thead><tr>
            <th style={css.th}>Description of Goods / Services</th>
            <th style={{...css.th,width:80,textAlign:"right"}}>Qty</th>
            <th style={{...css.th,width:100}}>Unit</th>
            <th style={{...css.th,width:40}}></th>
          </tr></thead>
          <tbody>{(doc.items||[]).map(item=>(
            <tr key={item.id}>
              <td style={css.td}><input style={css.input} value={item.desc??""} placeholder="Item or service description" onChange={e=>setDoc(d=>({...d,items:d.items.map(i=>i.id===item.id?{...i,desc:e.target.value}:i)}))}/></td>
              <td style={css.td}><input style={{...css.input,textAlign:"right"}} type="number" min="0" value={item.qty??1} onChange={e=>setDoc(d=>({...d,items:d.items.map(i=>i.id===item.id?{...i,qty:e.target.value}:i)}))}/></td>
              <td style={css.td}><input style={css.input} value={item.unit??""} onChange={e=>setDoc(d=>({...d,items:d.items.map(i=>i.id===item.id?{...i,unit:e.target.value}:i)}))}/></td>
              <td style={css.td}><button style={{...mkBtn("danger"),padding:"4px 10px",opacity:(doc.items||[]).length<=1?0.3:1}} onClick={()=>{if((doc.items||[]).length<=1)return;setDoc(d=>({...d,items:d.items.filter(i=>i.id!==item.id)}));}}>✕</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <button style={{...mkBtn("ghost"),fontSize:12}} onClick={()=>setDoc(d=>({...d,items:[...d.items,{id:uid(),desc:"",qty:1,unit:"unit"}]}))}>+ Add Item</button>
      <div style={{marginTop:16}}><label style={css.label}>Notes</label><input style={css.input} value={doc.notes??""} placeholder="Optional notes or special instructions" onChange={e=>setDoc(d=>({...d,notes:e.target.value}))}/></div>
    </div>

    <div style={{display:"flex",gap:12,marginTop:4}}>
      <button style={mkBtn("gold")} onClick={save_}>💾 Save D.O.</button>
      <button style={{...mkBtn("ghost"),color:C.accent,borderColor:C.accent}} onClick={()=>printDO(doc)}>🖨 Preview PDF</button>
      <button style={mkBtn("ghost")} onClick={()=>setForm(false)}>Cancel</button>
    </div>
  </div>);

  // ── LIST VIEW ────────────────────────────────────────────────────────────────
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div>
        <div style={css.pageTitle}>Delivery Orders</div>
        <div style={css.pageSub}>{rows.length} document{rows.length!==1?"s":""} · Click 🚚 DO on any Invoice or Quotation to generate</div>
      </div>
      <button style={mkBtn("gold")} onClick={openNew}>+ New D.O.</button>
    </div>
    <div style={css.card}>
      {loading?<Spinner/>:rows.length===0?(
        <div style={{textAlign:"center",padding:"48px 0"}}>
          <div style={{fontSize:32,marginBottom:12}}>🚚</div>
          <div style={{color:C.muted,fontSize:14,marginBottom:4}}>No delivery orders yet</div>
          <div style={{color:C.muted,fontSize:12}}>Click the 🚚 DO button on any Invoice or Quotation to generate one automatically</div>
        </div>
      ):(
        <div style={{overflowX:"auto"}}><table style={css.table}>
          <thead><tr>{["D.O. No.","Title","Client","Date","Ref","Status","Actions"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(d=><tr key={d.id}>
            <td style={css.td}><span style={{color:C.gold,fontWeight:700}}>{d.doc_no}</span></td>
            <td style={{...css.td,maxWidth:180}}><div style={{fontSize:12,fontWeight:600,color:C.text}}>{d.title||"—"}</div></td>
            <td style={css.td}><div style={{fontSize:13}}>{d.client}</div>{d.attn&&<div style={{fontSize:11,color:C.muted}}>👤 {d.attn}</div>}</td>
            <td style={css.td}>{fmtDate(d.date)}</td>
            <td style={css.td}>{d.ref_doc&&<span style={{fontSize:11,color:C.muted}}>{d.source_type||""}: <span style={{color:C.accent}}>{d.ref_doc}</span></span>}</td>
            <td style={css.td}><span style={css.badge(sColor[d.status]||C.muted)}>{d.status}</span></td>
            <td style={css.td}><div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <select style={{background:"#0f0f1a",border:"1px solid #2a2a45",borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer",color:sColor[d.status]||C.muted}} value={d.status} onChange={e=>{const s=e.target.value;dbUpdate("delivery_orders",d.id,{status:s});setRows(rows.map(r=>r.id===d.id?{...r,status:s}:r));}}>{["Pending","Delivered","Returned"].map(s=><option key={s}>{s}</option>)}</select>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>openEdit(d)}>Edit</button>
              <button style={{...mkBtn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>printDO(d)}>🖨 PDF</button>
              <button style={{...mkBtn("danger"),padding:"5px 10px",fontSize:11}} onClick={()=>del(d.id)}>✕</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
      )}
    </div>
  </div>);
}


// ─── P&L REPORT ───────────────────────────────────────────────────────────────
function PLReport() {
  const [data,setData]=useState(null);
  const [period,setPeriod]=useState("all");
  useEffect(()=>{Promise.all([dbLoad("invoices"),dbLoad("supplier_payments"),dbLoad("salary_records")]).then(([inv,sup,sal])=>setData({inv,sup,sal}));},[]);
  if(!data) return <Spinner/>;
  const {inv,sup,sal}=data;
  const now=new Date();
  const filt=(items,dk="date")=>{
    if(period==="all") return items;
    return items.filter(x=>{const d=new Date(x[dk]);
      if(period==="this_year") return d.getFullYear()===now.getFullYear();
      if(period==="this_month") return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
      if(period==="last_month"){const lm=new Date(now.getFullYear(),now.getMonth()-1,1);return d.getFullYear()===lm.getFullYear()&&d.getMonth()===lm.getMonth();}
      return true;
    });
  };
  const calcInvT=(i)=>{const sub=(i.items||[]).reduce((s,x)=>s+nf(x.qty)*nf(x.price),0);const disc=nf(i.discount);return sub-disc+((sub-disc)*nf(i.tax_rate))/100;};
  const fi=filt(inv),fs=filt(sup),fsal=filt(sal,"month");
  const totalRev=fi.reduce((s,i)=>s+calcInvT(i),0);
  const totalColl=fi.filter(i=>i.status==="Received").reduce((s,i)=>s+calcInvT(i),0);
  const totalOut=fi.filter(i=>["Sent/Pending Payment","Draft"].includes(i.status)).reduce((s,i)=>s+calcInvT(i),0);
  const totalSupCost=fs.reduce((s,p)=>s+nf(p.amount),0);
  const totalVendorPend=fs.filter(p=>p.status==="Pending").reduce((s,p)=>s+nf(p.amount),0);
  const totalSalCost=fsal.reduce((s,r)=>s+(nf(r.basic)+nf(r.allowance)+nf(r.overtime)+nf(r.epf_employer)),0);
  const netIncome=totalRev-totalSupCost-totalSalCost;
  const mMap={};
  fi.forEach(i=>{const k=(i.date||"").slice(0,7);if(!k)return;if(!mMap[k])mMap[k]={rev:0,costs:0};mMap[k].rev+=calcInvT(i);});
  fs.forEach(p=>{const k=(p.date||"").slice(0,7);if(!k)return;if(!mMap[k])mMap[k]={rev:0,costs:0};mMap[k].costs+=nf(p.amount);});
  const monthly=Object.entries(mMap).sort((a,b)=>b[0].localeCompare(a[0]));
  const exportCSV=()=>{
    let csv="Invoice No,Date,Client,Revenue,Status\n";
    fi.forEach(i=>{csv+=`${i.doc_no},${i.date},"${i.client}",${calcInvT(i).toFixed(2)},${i.status}\n`;});
    csv+=`\nMonth,Revenue,Costs,Net\n`;
    monthly.forEach(([m,v])=>{csv+=`${m},${v.rev.toFixed(2)},${v.costs.toFixed(2)},${(v.rev-v.costs).toFixed(2)}\n`;});
    csv+=`\nSUMMARY\nTotal Revenue,${totalRev.toFixed(2)}\nTotal Collected,${totalColl.toFixed(2)}\nOutstanding,${totalOut.toFixed(2)}\nSupplier Costs,${totalSupCost.toFixed(2)}\nSalary Costs,${totalSalCost.toFixed(2)}\nNet Income,${netIncome.toFixed(2)}\n`;
    const blob=new Blob([csv],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`MalkoSolutions_PL_${period}.csv`;a.click();
  };
  const sc=(color)=>({...css.statCard,borderLeft:`3px solid ${color}`});
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div><div style={css.pageTitle}>P&L Report</div><div style={css.pageSub}>Profit & Loss — exportable for LHDN / IRB Form B</div></div>
      <div style={{display:"flex",gap:10}}>
        <select style={{...css.input,width:"auto"}} value={period} onChange={e=>setPeriod(e.target.value)}>
          <option value="all">All Time</option><option value="this_year">This Year</option>
          <option value="this_month">This Month</option><option value="last_month">Last Month</option>
        </select>
        <button style={mkBtn("gold")} onClick={exportCSV}>⬇ Export CSV</button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:16}}>
      {[{l:"Gross Revenue",v:fmtMY(totalRev),c:C.gold,i:"📄"},{l:"Total Collected",v:fmtMY(totalColl),c:C.success,i:"✅"},{l:"Outstanding",v:fmtMY(totalOut),c:C.warning,i:"⏳"},{l:"Net Income",v:fmtMY(netIncome),c:netIncome>=0?C.success:C.danger,i:"💰"}].map(s=>(
        <div key={s.l} style={sc(s.c)}><div style={{fontSize:20,marginBottom:6}}>{s.i}</div><div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:3}}>{s.l}</div><div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div></div>
      ))}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
      {[{l:"Supplier Costs",v:fmtMY(totalSupCost),c:C.danger,i:"🏭"},{l:"Vendor Payables",v:fmtMY(totalVendorPend),c:C.warning,i:"⚠️"},{l:"Salary Costs",v:fmtMY(totalSalCost),c:C.accent,i:"👤"}].map(s=>(
        <div key={s.l} style={sc(s.c)}><div style={{fontSize:20,marginBottom:6}}>{s.i}</div><div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:3}}>{s.l}</div><div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div></div>
      ))}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
      <div style={css.card}>
        <div style={{fontWeight:700,marginBottom:16,color:C.gold}}>Monthly Summary</div>
        {monthly.length===0?<Empty text="No data"/>:(
          <table style={css.table}><thead><tr>{["Month","Revenue","Costs","Net"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
            <tbody>{monthly.map(([m,v])=>{const net=v.rev-v.costs;return(<tr key={m}>
              <td style={css.td}>{m}</td><td style={css.td}>{fmtMY(v.rev)}</td><td style={css.td}>{fmtMY(v.costs)}</td>
              <td style={{...css.td,fontWeight:700,color:net>=0?C.success:C.danger}}>{fmtMY(net)}</td>
            </tr>);})}</tbody>
          </table>
        )}
      </div>
      <div style={css.card}>
        <div style={{fontWeight:700,marginBottom:16,color:C.gold}}>Per Invoice</div>
        {fi.length===0?<Empty text="No invoices"/>:(
          <table style={css.table}><thead><tr>{["Invoice","Client","Revenue","Status"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
            <tbody>{fi.map(i=><tr key={i.id}>
              <td style={css.td}><span style={{color:C.gold,fontWeight:700,fontSize:12}}>{i.doc_no}</span></td>
              <td style={{...css.td,fontSize:12,maxWidth:130}}>{i.client}</td>
              <td style={css.td}>{fmtMY(calcInvT(i))}</td>
              <td style={css.td}><span style={css.badge(ISC[i.status]||C.muted)}>{i.status}</span></td>
            </tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  </div>);
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function SettingsModule({settings,setSettings}) {
  const [local,setLocal]=useState({...settings});
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const fileRef=useRef();
  const handleLogo=(e)=>{const file=e.target.files[0];if(!file)return;if(file.size>500000){alert("Logo too large. Max 500KB.");return;}const reader=new FileReader();reader.onload=(ev)=>setLocal(l=>({...l,logo:ev.target.result}));reader.readAsDataURL(file);};
  const saveSettings=async()=>{setSaving(true);await dbUpsertSettings(local);setSettings(local);setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2500);};
  return(<div>
    <div style={css.pageTitle}>Settings</div>
    <div style={css.pageSub}>Company details used on all printed documents · saved to cloud</div>
    <div style={css.card}>
      <div style={{display:"flex",gap:24,marginBottom:28,alignItems:"flex-start"}}>
        <div style={{width:120,height:80,background:"#0f0f1a",border:`2px dashed ${C.border}`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
          {local.logo?<img src={local.logo} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}} alt="logo"/>:<span style={{color:C.muted,fontSize:11}}>No Logo</span>}
        </div>
        <div>
          <label style={css.label}>Company Logo</label>
          <input type="file" accept="image/*" ref={fileRef} onChange={handleLogo} style={{display:"none"}}/>
          <button style={{...mkBtn("ghost"),marginTop:8}} onClick={()=>fileRef.current.click()}>Upload Logo</button>
          {local.logo&&<button style={{...mkBtn("danger"),marginTop:8,marginLeft:8}} onClick={()=>setLocal(l=>({...l,logo:null}))}>Remove</button>}
          <div style={{color:C.muted,fontSize:11,marginTop:6}}>PNG / JPG · Max 500KB</div>
        </div>
      </div>
      <div style={css.grid2}>
        {[{key:"company",label:"Company Name"},{key:"regNo",label:"Registration No."},{key:"address",label:"Address"},{key:"phone",label:"Phone"},{key:"email",label:"Email"},{key:"bankName",label:"Bank Name"},{key:"bankAcc",label:"Bank Account No."}].map(f=>(
          <div key={f.key}><label style={css.label}>{f.label}</label><input style={css.input} value={local[f.key]||""} onChange={e=>setLocal(l=>({...l,[f.key]:e.target.value}))}/></div>
        ))}
      </div>
      <div style={{marginTop:24,paddingTop:20,borderTop:`1px solid ${C.border}`}}>
        <div style={{fontSize:13,fontWeight:700,color:C.gold,marginBottom:6}}>📄 Document Templates</div>
        <div style={{color:C.muted,fontSize:12,marginBottom:16}}>Preloaded into every new Quotation and Invoice. Editable per document.</div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {[{key:"terms_quo",label:"Default Quotation Terms & Conditions"},{key:"terms_inv",label:"Default Invoice Terms & Conditions"},{key:"payment_terms",label:"Payment Details (shown on every invoice)"}].map(f=>(
            <div key={f.key}><label style={css.label}>{f.label}</label>
              <textarea style={{...css.input,height:90,resize:"vertical",fontFamily:"inherit",lineHeight:1.6}} value={local[f.key]||""} onChange={e=>setLocal(l=>({...l,[f.key]:e.target.value}))}/>
            </div>
          ))}
        </div>
      </div>
      <div style={{marginTop:24,display:"flex",alignItems:"center",gap:16}}>
        <button style={mkBtn("gold")} onClick={saveSettings} disabled={saving}>{saving?"Saving...":"Save Settings"}</button>
        {saved&&<span style={{color:C.success,fontSize:13,fontWeight:600}}>✓ Saved successfully</span>}
      </div>
    </div>
  </div>);
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({settings}) {
  const [data,setData]=useState(null);
  useEffect(()=>{Promise.all([dbLoad("invoices"),dbLoad("quotations"),dbLoad("supplier_payments"),dbLoad("salary_records"),dbLoad("costings")]).then(([inv,quo,sup,sal,cos])=>setData({inv,quo,sup,sal,cos}));},[]);
  if(!data) return <Spinner/>;
  const {inv,quo,sup,sal,cos}=data;
  const cIT=(i)=>{const sub=(i.items||[]).reduce((s,x)=>s+nf(x.qty)*nf(x.price),0);const disc=nf(i.discount);return sub-disc+((sub-disc)*nf(i.tax_rate))/100;};
  const totalRev=inv.reduce((s,i)=>s+cIT(i),0);
  const totalColl=inv.filter(i=>i.status==="Received").reduce((s,i)=>s+cIT(i),0);
  const totalOut=inv.filter(i=>["Sent/Pending Payment","Draft"].includes(i.status)).reduce((s,i)=>s+cIT(i),0);
  const vendorPend=sup.filter(p=>p.status==="Pending").reduce((s,p)=>s+nf(p.amount),0);
  return(<div>
    <div style={{marginBottom:28}}><div style={css.pageTitle}>Welcome, {((settings&&settings.company)||"").split(" ")[0]} 👋</div><div style={css.pageSub}>Business overview · live from cloud</div></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
      {[{l:"Total Invoiced",v:fmtMY(totalRev),c:C.gold,i:"📄"},{l:"Total Collected",v:fmtMY(totalColl),c:C.success,i:"✅"},{l:"Outstanding",v:fmtMY(totalOut),c:C.warning,i:"⏳"},{l:"Vendor Payables",v:fmtMY(vendorPend),c:C.danger,i:"⚠️"}].map(s=>(
        <div key={s.l} style={{...css.statCard,borderLeft:`3px solid ${s.c}`}}><div style={{fontSize:20,marginBottom:6}}>{s.i}</div><div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:3}}>{s.l}</div><div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div></div>
      ))}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
      <div style={css.card}>
        <div style={{fontWeight:700,marginBottom:14,color:C.gold}}>Recent Invoices</div>
        {inv.length===0?<Empty text="No invoices yet"/>:inv.slice(0,6).map(i=>(
          <div key={i.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
            <div><span style={{color:C.gold,fontWeight:700}}>{i.doc_no}</span><span style={{color:C.muted,fontSize:12}}> · {i.title||i.client}</span></div>
            <div style={{color:ISC[i.status]||C.muted,fontWeight:600}}>{i.status}</div>
          </div>
        ))}
      </div>
      <div style={css.card}>
        <div style={{fontWeight:700,marginBottom:14,color:C.gold}}>Document Summary</div>
        {[{l:"Quotations",c:quo.length,cl:C.gold},{l:"Invoices",c:inv.length,cl:C.accent},{l:"Supplier Payments",c:sup.length,cl:C.danger},{l:"Costing Records",c:cos.length,cl:C.warning},{l:"Salary Records",c:sal.length,cl:C.success}].map(x=>(
          <div key={x.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:13,color:C.muted}}>{x.l}</span><span style={{fontWeight:800,color:x.cl,fontSize:15}}>{x.c}</span>
          </div>
        ))}
      </div>
    </div>
  </div>);
}

// ─── DOC FORM (single definition) ────────────────────────────────────────────
function DocForm({doc,setDoc,title,onSave,onCancel,newItem,fields,showDiscountTax}) {
  const updItem=(id,key,val)=>setDoc(d=>({...d,items:d.items.map(i=>i.id===id?{...i,[key]:val}:i)}));
  const addItem=()=>setDoc(d=>({...d,items:[...d.items,newItem()]}));
  const remItem=(id)=>{if((doc.items||[]).length<=1)return;setDoc(d=>({...d,items:d.items.filter(i=>i.id!==id)}));};
  const {subtotal,discountAmt,taxAmt,total}=calcDoc(doc.items,doc.discount,doc.tax_rate);
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:24}}>
      <div style={css.pageTitle}>{title}</div>
      <button style={mkBtn("ghost")} onClick={onCancel}>← Back</button>
    </div>
    <div style={css.card}>
      <div style={css.grid2}>
        <ClientSelect doc={doc} setDoc={setDoc}/>
        {fields.map(f=>(
          <div key={f.key} style={(f.key==="address"||f.key==="terms"||f.key==="notes"||f.span)?{gridColumn:"1 / -1"}:{}}>
            <label style={css.label}>{f.label}</label>
            {f.type==="select"?
              <select style={css.input} value={doc[f.key]||""} onChange={e=>{const v=e.target.value;setDoc(d=>{const u={...d,[f.key]:v};if(f.key==="payment_terms_days"&&v!=="Custom"&&d.date){try{const dd=new Date(d.date);dd.setDate(dd.getDate()+parseInt(v));u.due_date=dd.toISOString().slice(0,10);}catch(e){}}return u;})}}>{f.options.map(o=><option key={o}>{o}</option>)}</select>
            :f.type==="textarea"?
              <textarea style={{...css.input,height:80,resize:"vertical",fontFamily:"inherit"}} value={doc[f.key]??""} onChange={e=>setDoc(d=>({...d,[f.key]:e.target.value}))}/>
            :
              <input style={css.input} type={f.type||"text"} value={doc[f.key]??""} onChange={e=>{const v=e.target.value;setDoc(d=>{const u={...d,[f.key]:v};if(f.key==="date"&&d.payment_terms_days&&d.payment_terms_days!=="Custom"){try{const dd=new Date(v);dd.setDate(dd.getDate()+parseInt(d.payment_terms_days));u.due_date=dd.toISOString().slice(0,10);}catch(e){}}return u;});}}/>
            }
          </div>
        ))}
      </div>
    </div>
    <div style={css.card}>
      <div style={{fontWeight:700,marginBottom:12,color:C.gold}}>Line Items</div>
      <div style={{marginBottom:16}}>
        <label style={css.label}>Title / Description</label>
        <input style={css.input} placeholder="e.g. SCaRF Rotary Kiln — Phase 2 Interpretation" value={doc.title||""} onChange={e=>setDoc(d=>({...d,title:e.target.value}))}/>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{...css.table,minWidth:600,marginBottom:12}}>
          <thead><tr>
            <th style={css.th}>Description</th>
            <th style={{...css.th,width:80}}>Qty</th>
            <th style={{...css.th,width:100}}>Unit</th>
            <th style={{...css.th,width:130,textAlign:"right"}}>Unit Price (RM)</th>
            <th style={{...css.th,width:130,textAlign:"right"}}>Amount (RM)</th>
            <th style={{...css.th,width:40}}></th>
          </tr></thead>
          <tbody>{(doc.items||[]).map(item=>(
            <tr key={item.id}>
              <td style={css.td}><input style={css.input} value={item.desc??""} onChange={e=>updItem(item.id,"desc",e.target.value)} placeholder="Item description"/></td>
              <td style={css.td}><input style={{...css.input,textAlign:"right"}} type="number" min="0" value={item.qty??1} onChange={e=>updItem(item.id,"qty",e.target.value)}/></td>
              <td style={css.td}><input style={css.input} value={item.unit??""} onChange={e=>updItem(item.id,"unit",e.target.value)}/></td>
              <td style={css.td}><input style={{...css.input,textAlign:"right"}} type="number" min="0" value={item.price??0} onChange={e=>updItem(item.id,"price",e.target.value)}/></td>
              <td style={{...css.td,fontWeight:700,color:C.gold,textAlign:"right"}}>{(nf(item.qty)*nf(item.price)).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              <td style={css.td}><button style={{...mkBtn("danger"),padding:"4px 10px",opacity:(doc.items||[]).length<=1?0.3:1}} onClick={()=>remItem(item.id)}>✕</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <button style={{...mkBtn("ghost"),fontSize:12}} onClick={addItem}>+ Add Item</button>
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
        <div style={{background:"rgba(201,168,76,0.08)",border:"1px solid rgba(201,168,76,0.25)",borderRadius:10,padding:"16px 20px",minWidth:280}}>
          <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:13,color:C.muted}}><span>Subtotal</span><span>{fmtMY(subtotal)}</span></div>
          {showDiscountTax&&<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",fontSize:13,borderTop:`1px solid ${C.border}`}}>
              <span style={{color:C.muted}}>Discount (RM)</span>
              <input style={{...css.input,width:100,textAlign:"right",padding:"4px 8px"}} type="number" min="0" value={doc.discount??0} onChange={e=>setDoc(d=>({...d,discount:e.target.value}))}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",fontSize:13,borderTop:`1px solid ${C.border}`}}>
              <span style={{color:C.muted}}>Tax (%)</span>
              <input style={{...css.input,width:80,textAlign:"right",padding:"4px 8px"}} type="number" min="0" max="100" value={doc.tax_rate??0} onChange={e=>setDoc(d=>({...d,tax_rate:e.target.value}))}/>
            </div>
            {nf(doc.tax_rate)>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:12,color:C.muted}}><span>Tax Amount</span><span>{fmtMY(taxAmt)}</span></div>}
          </>}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:17,fontWeight:800,color:C.gold,borderTop:`2px solid ${C.gold}`,paddingTop:10,marginTop:6}}>
            <span>TOTAL</span><span>{fmtMY(total)}</span>
          </div>
        </div>
      </div>
    </div>
    <div style={{display:"flex",gap:12}}>
      <button style={mkBtn("gold")} onClick={onSave}>Save Document</button>
      <button style={mkBtn("ghost")} onClick={onCancel}>Cancel</button>
    </div>
  </div>);
}

// ─── COSTING FORM ─────────────────────────────────────────────────────────────
const CATS=["Material","Labour","Equipment","Subcontract","Overhead","Other"];
function CostingForm({doc,setDoc,onSave,onCancel,newItem,isEdit}) {
  const updItem=(id,key,val)=>setDoc(d=>({...d,items:d.items.map(i=>i.id===id?{...i,[key]:val}:i)}));
  const addItem=()=>setDoc(d=>({...d,items:[...d.items,newItem()]}));
  const remItem=(id)=>{if((doc.items||[]).length<=1)return;setDoc(d=>({...d,items:d.items.filter(i=>i.id!==id)}));};
  const total=(doc.items||[]).reduce((s,i)=>s+nf(i.qty)*nf(i.rate),0);
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:24}}>
      <div style={css.pageTitle}>{isEdit?"Edit Costing":"New Costing"}</div>
      <button style={mkBtn("ghost")} onClick={onCancel}>← Back</button>
    </div>
    <div style={css.card}>
      <div style={css.grid3}>
        {[{key:"doc_no",label:"Costing No."},{key:"project",label:"Project Name"},{key:"client",label:"Client"},{key:"date",label:"Date",type:"date"},{key:"notes",label:"Notes"}].map(f=>(
          <div key={f.key}><label style={css.label}>{f.label}</label><input style={css.input} type={f.type||"text"} value={doc[f.key]??""} onChange={e=>setDoc(d=>({...d,[f.key]:e.target.value}))}/></div>
        ))}
      </div>
    </div>
    <div style={css.card}>
      <div style={{fontWeight:700,marginBottom:16,color:C.gold}}>Cost Items</div>
      <div style={{overflowX:"auto"}}>
        <table style={{...css.table,minWidth:700,marginBottom:12}}>
          <thead><tr>
            <th style={{...css.th,width:140}}>Category</th><th style={css.th}>Description</th>
            <th style={{...css.th,width:70}}>Qty</th><th style={{...css.th,width:90}}>Unit</th>
            <th style={{...css.th,width:120}}>Rate (RM)</th><th style={{...css.th,width:120}}>Amount</th>
            <th style={{...css.th,width:40}}></th>
          </tr></thead>
          <tbody>{(doc.items||[]).map(item=>(
            <tr key={item.id}>
              <td style={css.td}><select style={css.input} value={item.category} onChange={e=>updItem(item.id,"category",e.target.value)}>{CATS.map(c=><option key={c}>{c}</option>)}</select></td>
              <td style={css.td}><input style={css.input} value={item.desc??""} onChange={e=>updItem(item.id,"desc",e.target.value)}/></td>
              <td style={css.td}><input style={{...css.input,textAlign:"right"}} type="number" min="0" value={item.qty??1} onChange={e=>updItem(item.id,"qty",e.target.value)}/></td>
              <td style={css.td}><input style={css.input} value={item.unit??""} onChange={e=>updItem(item.id,"unit",e.target.value)}/></td>
              <td style={css.td}><input style={{...css.input,textAlign:"right"}} type="number" min="0" value={item.rate??0} onChange={e=>updItem(item.id,"rate",e.target.value)}/></td>
              <td style={{...css.td,fontWeight:700,color:C.gold}}>{fmtMY(nf(item.qty)*nf(item.rate))}</td>
              <td style={css.td}><button style={{...mkBtn("danger"),padding:"4px 10px",opacity:(doc.items||[]).length<=1?0.3:1}} onClick={()=>remItem(item.id)}>✕</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <button style={{...mkBtn("ghost"),fontSize:12}} onClick={addItem}>+ Add Item</button>
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
        <div style={{background:"rgba(201,168,76,0.1)",border:"1px solid rgba(201,168,76,0.3)",borderRadius:8,padding:"12px 20px",minWidth:220}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:18,fontWeight:800,color:C.gold}}><span>TOTAL COST</span><span>{fmtMY(total)}</span></div>
        </div>
      </div>
    </div>
    <div style={{display:"flex",gap:12}}>
      <button style={mkBtn("gold")} onClick={onSave}>Save Costing</button>
      <button style={mkBtn("ghost")} onClick={onCancel}>Cancel</button>
    </div>
  </div>);
}

// ─── SETUP SCREEN ─────────────────────────────────────────────────────────────
function SetupScreen() {
  return(<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif",padding:24}}>
    <div style={{maxWidth:560,width:"100%"}}>
      <div style={{fontSize:13,fontWeight:800,letterSpacing:3,color:C.gold,textTransform:"uppercase",marginBottom:8}}>Malko Accounting</div>
      <div style={{fontSize:28,fontWeight:800,color:C.text,marginBottom:8}}>Supabase Setup Required</div>
      <div style={{color:C.muted,fontSize:14,marginBottom:32,lineHeight:1.7}}>Connect a free Supabase database for cross-device sync.</div>
      {[{n:"1",t:"Create free Supabase account",d:"supabase.com → New Project"},{n:"2",t:"Run SQL setup script",d:"SQL Editor → paste script from README.md → Run"},{n:"3",t:"Copy API credentials",d:"Settings → API Keys → Project URL + anon key"},{n:"4",t:"Add to .env.local",d:"VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"},{n:"5",t:"Deploy on Vercel",d:"Add same env vars in Vercel → Environment Variables"}].map(s=>(
        <div key={s.n} style={{display:"flex",gap:16,marginBottom:20,alignItems:"flex-start"}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:C.gold,color:"#0f0f1a",fontWeight:800,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s.n}</div>
          <div><div style={{fontWeight:700,color:C.text,marginBottom:2}}>{s.t}</div><div style={{color:C.muted,fontSize:13}}>{s.d}</div></div>
        </div>
      ))}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 20px",marginTop:24,fontSize:12,color:C.muted}}>See <strong style={{color:C.gold}}>README.md</strong> for the full SQL script.</div>
    </div>
  </div>);
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
const NAV=[
  {id:"dashboard",label:"Dashboard",icon:"◈"},
  {id:"quotation",label:"Quotations",icon:"📋"},
  {id:"invoice",label:"Invoices",icon:"📄"},
  {id:"costing",label:"Costing",icon:"📊"},
  {id:"supplier",label:"Supplier Payments",icon:"🏭"},
  {id:"salary",label:"Salary",icon:"👤"},
  {id:"clients",label:"Clients",icon:"◎"},
  {id:"do",label:"Delivery Orders",icon:"🚚"},
  {id:"pl",label:"P&L Report",icon:"📈"},
  {id:"settings",label:"Settings",icon:"⚙"},
];

const DEFAULT_SETTINGS={
  ...SEED_SETTINGS,
  terms_quo:"1. This quotation is valid for 14 days from the date of issue.\n2. Prices quoted are subject to change without prior notice.\n3. Acceptance is confirmed upon issuance of a Purchase Order.",
  terms_inv:"1. Payment is due within 30 days from invoice date.\n2. Late payments may incur interest charges.\n3. Goods remain property of Malko Solutions until full payment is received.",
  payment_terms:"Bank Transfer to:\nMALKO SOLUTIONS\nCIMB Bank Berhad\nAcc No: 8606011612\nThis is a computer-generated document.",
};

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page,setPage]=useState("dashboard");
  const [settings,setSettings]=useState(DEFAULT_SETTINGS);
  const [ready,setReady]=useState(false);
  const [noEnv,setNoEnv]=useState(false);

  useEffect(()=>{
    const handler=()=>setPage("invoice");
    const doHandler=()=>setPage("do");
    window.addEventListener("navigate_to_do",doHandler);
    return()=>{window.removeEventListener("navigate_to_invoice",handler);window.removeEventListener("navigate_to_do",doHandler);};
  // eslint-disable-next-line
    window.addEventListener("navigate_to_invoice",handler);
    return()=>window.removeEventListener("navigate_to_invoice",handler);
  },[]);

  useEffect(()=>{
    const url=import.meta.env.VITE_SUPABASE_URL;
    const key=import.meta.env.VITE_SUPABASE_ANON_KEY;
    if(!url||!key||url.includes("your-project")){setNoEnv(true);setReady(true);return;}
    const init=async()=>{
      const s=await dbLoadSettings();
      if(s) setSettings(prev=>({...prev,...s}));
      else await dbUpsertSettings(DEFAULT_SETTINGS);
      const existingInv=await dbLoad("invoices");
      if(existingInv.length===0){
        for(const inv of SEED_INVOICES) await supabase.from("invoices").insert([inv]);
        for(const quo of SEED_QUOTATIONS) await supabase.from("quotations").insert([quo]);
        for(const c of SEED_CLIENTS) await supabase.from("clients").insert([c]);
      }
      setReady(true);
    };
    init().catch(()=>setReady(true));
  },[]);

  if(!ready) return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.gold,fontFamily:"DM Sans,sans-serif",fontSize:16}}>Connecting to cloud...</div>;
  if(noEnv) return <SetupScreen/>;

  return(<div style={css.app}>
    <style>{`input[type="date"]::-webkit-calendar-picker-indicator,input[type="month"]::-webkit-calendar-picker-indicator{filter:invert(1);cursor:pointer;opacity:0.8;}`}</style>
    <div style={css.sidebar}>
      <div style={css.sideHeader}><div style={css.sideTitle}>Malko Acc</div><div style={css.sideSub}>Business Manager</div></div>
      {NAV.map(n=>(
        <div key={n.id} style={css.navItem(page===n.id)} onClick={()=>setPage(n.id)}>
          <span>{n.icon}</span><span>{n.label}</span>
        </div>
      ))}
      <div style={{marginTop:"auto",padding:"0 20px"}}>
        <div style={{fontSize:10,color:C.muted,borderTop:`1px solid ${C.border}`,paddingTop:12,lineHeight:1.7}}>
          {(settings&&settings.company)||""}<br/>☁ Cloud synced · Supabase
        </div>
      </div>
    </div>
    <div style={css.main}>
      {page==="dashboard"&&<Dashboard settings={settings}/>}
      {page==="quotation"&&<QuotationModule settings={settings} onNavigate={setPage}/>}
      {page==="invoice"&&<InvoiceModule settings={settings}/>}
      {page==="costing"&&<CostingModule settings={settings}/>}
      {page==="supplier"&&<SupplierModule settings={settings}/>}
      {page==="salary"&&<SalaryModule settings={settings}/>}
      {page==="clients"&&<ClientsModule/>}
      {page==="do"&&<DeliveryOrderModule settings={settings}/>}
      {page==="pl"&&<PLReport/>}
      {page==="settings"&&<SettingsModule settings={settings} setSettings={setSettings}/>}
    </div>
  </div>);
}
