# Malko Accounting — Self-Hosted Business Manager

A free, cloud-synced accounting web app with Quotations, Invoices, Project Costing, Supplier Payments, and Salary modules. Built with React + Vite + Supabase.

---

## ✅ Features
- 📋 Quotations with line items → Print to PDF
- 📄 Invoices with paid/pending tracking → Print to PDF
- 📊 Project Costing by category (Material, Labour, Equipment...) → Print to PDF
- 🏭 Supplier Payment Vouchers → Print to PDF
- 👤 Salary Slips with EPF, SOCSO, PCB → Print to PDF
- ⚙ Company settings with logo upload
- ☁ All data synced across devices via Supabase (free)

---

## 🗃️ STEP 1 — Set Up Supabase (Free Database)

1. Go to **https://supabase.com** and create a free account
2. Click **New Project** — give it a name (e.g. `malko-accounting`)
3. Wait for it to provision (~1 min)
4. Go to the **SQL Editor** (left sidebar)
5. Click **New Query**, paste ALL of the SQL below, then click **Run**

```sql
-- Settings table
create table if not exists settings (
  id integer primary key default 1,
  company text,
  "regNo" text,
  address text,
  phone text,
  email text,
  "bankName" text,
  "bankAcc" text,
  logo text,
  created_at timestamptz default now()
);

-- Quotations
create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  doc_no text,
  client text,
  address text,
  date text,
  valid_until text,
  notes text,
  items jsonb default '[]',
  created_at timestamptz default now()
);

-- Invoices
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  doc_no text,
  client text,
  address text,
  date text,
  due_date text,
  status text default 'Pending',
  notes text,
  items jsonb default '[]',
  created_at timestamptz default now()
);

-- Project Costings
create table if not exists costings (
  id uuid primary key default gen_random_uuid(),
  doc_no text,
  project text,
  client text,
  date text,
  notes text,
  items jsonb default '[]',
  created_at timestamptz default now()
);

-- Supplier Payments
create table if not exists supplier_payments (
  id uuid primary key default gen_random_uuid(),
  doc_no text,
  supplier text,
  invoice_ref text,
  date text,
  due_date text,
  amount numeric default 0,
  method text default 'Bank Transfer',
  status text default 'Pending',
  description text,
  notes text,
  created_at timestamptz default now()
);

-- Salary Records
create table if not exists salary_records (
  id uuid primary key default gen_random_uuid(),
  doc_no text,
  employee text,
  position text,
  month text,
  basic numeric default 0,
  allowance numeric default 0,
  overtime numeric default 0,
  deduction numeric default 0,
  epf_employee numeric default 0,
  epf_employer numeric default 0,
  socso numeric default 0,
  tax numeric default 0,
  status text default 'Pending',
  notes text,
  created_at timestamptz default now()
);

-- Disable RLS for simplicity (single-user app)
alter table settings disable row level security;
alter table quotations disable row level security;
alter table invoices disable row level security;
alter table costings disable row level security;
alter table supplier_payments disable row level security;
alter table salary_records disable row level security;
```

6. After running, go to **Settings → API** (left sidebar)
7. Copy your:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon/public key** (long string starting with `eyJ...`)

---

## 💻 STEP 2 — Run Locally

```bash
# Clone your repo (after pushing to GitHub)
git clone https://github.com/YOUR_USERNAME/malko-accounting.git
cd malko-accounting

# Install dependencies
npm install

# Create your local env file
cp .env.example .env.local
```

Edit `.env.local` and fill in your Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

```bash
# Start local dev server
npm run dev
# Open http://localhost:5173
```

---

## 🐙 STEP 3 — Push to GitHub

```bash
# Inside the malko-accounting folder:
git init
git add .
git commit -m "Initial commit — Malko Accounting"

# Create a new repo on github.com (name it malko-accounting)
# Then:
git remote add origin https://github.com/YOUR_USERNAME/malko-accounting.git
git branch -M main
git push -u origin main
```

---

## 🚀 STEP 4 — Deploy Free on Vercel

1. Go to **https://vercel.com** and sign in with GitHub
2. Click **Add New → Project**
3. Select your `malko-accounting` repository
4. Framework will auto-detect as **Vite** ✅
5. Before clicking Deploy, go to **Environment Variables** and add:
   - `VITE_SUPABASE_URL` → your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` → your Supabase anon key
6. Click **Deploy**
7. Your app will be live at `https://malko-accounting.vercel.app` (or similar)

**Every time you push to GitHub, Vercel auto-deploys. Free forever on Vercel's Hobby plan.**

---

## 📱 Cross-Device Access

Once deployed on Vercel:
- Open the Vercel URL on your **phone, tablet, laptop** — all devices share the same data
- Bookmark it on your phone's home screen for app-like experience
- Your logo and settings are also stored in the cloud

---

## 🔒 Security Note

This app uses Supabase with Row Level Security disabled — suitable for a **single-user / private business** app. Do not share your Vercel URL publicly unless you add authentication. If you want password protection, the easiest option is to enable **Vercel Password Protection** in your project settings (free on Hobby plan).

---

## 📁 Project Structure

```
malko-accounting/
├── src/
│   ├── App.jsx          ← Main app (all modules)
│   ├── supabase.js      ← Database client
│   └── main.jsx         ← Entry point
├── index.html
├── vite.config.js
├── package.json
├── .env.example         ← Copy to .env.local
├── .gitignore
└── README.md
```

---

Built for Malko Solutions · Semenyih, Selangor
