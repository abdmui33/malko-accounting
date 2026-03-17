// ─── Malko Solutions — Preloaded Seed Data ───────────────────────────────────
// Extracted from previous Malko Hub HTML app (index.html)
// Last QUO: QUO-116 → next is QUO-117
// Last INV: INV-115 → next is INV-116

export const SEED_SETTINGS = {
  company: "Malko Solutions",
  regNo: "JR0170620-X",
  address: "59, Tingkat 2, Jalan Tuanku Antah, 70100 Seremban, Negeri Sembilan",
  phone: "+6017-2330580",
  email: "malkosolutions@gmail.com",
  bankName: "CIMB Bank Berhad",
  bankAcc: "8606011612",
  logo: null,
};

export const SEED_CLIENTS = [
  { name: "Techmile Resources Sdn Bhd", attn: "", email: "", phone: "", address: "1378045-K" },
  { name: "Shakur Resources Sdn Bhd", attn: "Hafiz Razman", email: "shakur.bizgroup@gmail.com", phone: "010-2147414", address: "38, Jalan Perdana 5/4, Pandan Perdana, 55300 Kuala Lumpur" },
  { name: "Simplycare Bio Co., Ltd", attn: "Jaero Yun", email: "jryun@simplycare.co.kr", phone: "+82 10 5920 9792", address: "2F, 46, Nonhyeon-ro 105-gil, Gangnam-gu, Seoul, Korea 06125" },
  { name: "Destra Sinistra Enterprise", attn: "", email: "", phone: "", address: "" },
  { name: "GAD Present Resources", attn: "", email: "", phone: "", address: "59, Tingkat 2, Jalan Tuanku Antah, 70100 Seremban, NS" },
  { name: "Ahmad Aizuddin bin Mohammad Aris", attn: "Ahmad Aizuddin", email: "", phone: "", address: "68000 Ampang, Selangor" },
];

export const SEED_INVOICES = [
  { doc_no: "INV-102", client: "Techmile Resources Sdn Bhd", address: "", date: "2025-01-15", due_date: "2025-02-14", status: "Paid", notes: "", items: [{ desc: "SWAK™ Anaerobic Thread Sealant, 50cm³ Tube", qty: 1, unit: "unit", price: 2250 }] },
  { doc_no: "INV-105", client: "Destra Sinistra Enterprise", address: "", date: "2025-03-10", due_date: "2025-04-09", status: "Paid", notes: "", items: [{ desc: "Procurement & Supply Services", qty: 1, unit: "lot", price: 3500 }] },
  { doc_no: "INV-106", client: "Simplycare Bio Co., Ltd", address: "Seoul, Korea", date: "2025-12-16", due_date: "2026-01-15", status: "Paid", notes: "Full-day interpretation service", items: [{ desc: "Interpreter Service: Attachment for Mr. Cho Gil Hyeong, Mayor of Chungju City (16 Dec 2025)", qty: 1, unit: "day", price: 800 }] },
  { doc_no: "INV-107", client: "Techmile Resources Sdn Bhd", address: "", date: "2025-06-01", due_date: "2025-07-01", status: "Paid", notes: "", items: [{ desc: "To Supply Cast Nylon Sheet", qty: 1, unit: "lot", price: 1250 }] },
  { doc_no: "INV-109", client: "Shakur Resources Sdn Bhd", address: "38, Jalan Perdana 5/4, Pandan Perdana, 55300 KL", date: "2026-01-09", due_date: "2026-02-08", status: "Paid", notes: "", items: [{ desc: "To Supply Multiple IT Products (Laptops, Peripherals, Accessories)", qty: 1, unit: "lot", price: 6716 }] },
  { doc_no: "INV-110", client: "Shakur Resources Sdn Bhd", address: "38, Jalan Perdana 5/4, Pandan Perdana, 55300 KL", date: "2026-01-09", due_date: "2026-02-08", status: "Paid", notes: "", items: [{ desc: "Supply & Deliver MSI RTX 5070 Graphic Card", qty: 1, unit: "unit", price: 2150 }, { desc: "Supply & Deliver MSI GeForce RTX 5050 Shadow 8GB", qty: 1, unit: "unit", price: 1690 }] },
  { doc_no: "INV-111", client: "Shakur Resources Sdn Bhd", address: "38, Jalan Perdana 5/4, Pandan Perdana, 55300 KL", date: "2026-01-09", due_date: "2026-02-08", status: "Paid", notes: "", items: [{ desc: "Supply & Deliver AGI SSD SATA 1TB – 4 Units", qty: 1, unit: "lot", price: 2150 }] },
  { doc_no: "INV-112", client: "Shakur Resources Sdn Bhd", address: "", date: "2026-01-15", due_date: "2026-02-14", status: "Paid", notes: "", items: [{ desc: "Supply AGI SSD SATA 1T – 4 Unit", qty: 1, unit: "lot", price: 675 }] },
  { doc_no: "INV-113", client: "Simplycare Bio Co., Ltd", address: "2F, 46, Nonhyeon-ro 105-gil, Gangnam-gu, Seoul", date: "2026-02-03", due_date: "2026-03-05", status: "Paid", notes: "Sessions: 6 Feb & 11 Feb 2026", items: [{ desc: "Professional Agri/Tech Interpretation & Meeting Report (2 Sessions × 2 Days)", qty: 2, unit: "session", price: 1500 }] },
  { doc_no: "INV-114", client: "Shakur Resources Sdn Bhd", address: "38, Jalan Perdana 5/4, Pandan Perdana, 55300 KL", date: "2026-02-09", due_date: "2026-03-11", status: "Paid", notes: "", items: [{ desc: "Dismantle, Supply & Install 1HP Inverter Daikin Aircond (Free 6ft copper, drain pipe, outdoor bracket) — Installation: Plaza 33, Petaling Jaya", qty: 1, unit: "lot", price: 2300 }] },
  { doc_no: "INV-115", client: "Ahmad Aizuddin bin Mohammad Aris", address: "68000 Ampang, Selangor", date: "2026-02-12", due_date: "2026-03-14", status: "Pending", notes: "", items: [{ desc: "ThinkPad Lenovo T490 i5 vPro 16GB RAM 256GB SSD", qty: 1, unit: "unit", price: 600 }] },
];

export const SEED_QUOTATIONS = [
  { doc_no: "QUO-103", client: "Techmile Resources Sdn Bhd", address: "", date: "2025-04-01", valid_until: "2025-04-15", notes: "", items: [{ desc: "Supply of U-Bolts (various sizes)", qty: 1, unit: "lot", price: 18449 }] },
  { doc_no: "QUO-104", client: "Techmile Resources Sdn Bhd", address: "", date: "2025-05-01", valid_until: "2025-05-15", notes: "", items: [{ desc: "Customized Ex-Proof Distribution Board (DB Board)", qty: 1, unit: "unit", price: 66960 }] },
  { doc_no: "QUO-112", client: "GAD Present Resources", address: "59, Tingkat 2, Jalan Tuanku Antah, 70100 Seremban, NS", date: "2026-01-26", valid_until: "2026-02-09", notes: "Payment: 50% upon order, 50% after pre-shipment inspection in UK", items: [{ desc: "Francis Barker Prismatic Compass M-73 Mils (NATO Standard, Tritium illumination)", qty: 10, unit: "unit", price: 3460 }, { desc: "Export/Import Clearance, Custom Clearance, SST", qty: 1, unit: "lot", price: 200 }, { desc: "Door-to-Door Courier Service", qty: 1, unit: "lot", price: 565.50 }] },
  { doc_no: "QUO-116", client: "Shakur Resources Sdn Bhd", address: "", date: "2026-02-20", valid_until: "2026-03-06", notes: "Awaiting item list & pricing", items: [{ desc: "Supply & Deliver Stationeries (as per requirement list)", qty: 1, unit: "lot", price: 0 }] },
];

// Next document numbers to continue from
export const NEXT_QUO = "QUO-117";
export const NEXT_INV = "INV-116";
