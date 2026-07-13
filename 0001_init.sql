-- ============================================================
-- Schema أساسي لمنصة تحليل عقود العمل السعودية (B2B SaaS)
-- ============================================================

-- ------------------------------------------------------------
-- 1) profiles: تمتد من auth.users (التي يديرها Supabase تلقائياً)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'lawyer', -- lawyer | hr_manager | admin
  company_id uuid,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2) companies: كل شركة/مكتب محاماة مشترك في المنصة
-- ------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) on delete set null,
  plan text not null default 'trial', -- trial | pro | enterprise
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_company_fk
  foreign key (company_id) references public.companies(id) on delete set null;

-- ------------------------------------------------------------
-- 3) contracts: كل عقد تم رفعه للتحليل
-- ------------------------------------------------------------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,      -- المسار داخل Supabase Storage (وليس الملف نفسه)
  status text not null default 'pending', -- pending | processing | done | failed
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4) audit_reports: نتيجة تحليل كل عقد (1-إلى-1 مع contracts)
-- ------------------------------------------------------------
create table if not exists public.audit_reports (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  score int not null,
  status_summary text,
  risk_high int not null default 0,
  risk_medium int not null default 0,
  risk_low int not null default 0,
  total_financial_liability numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5) audit_issues: كل مخالفة فردية داخل التقرير
-- ------------------------------------------------------------
create table if not exists public.audit_issues (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.audit_reports(id) on delete cascade,
  article_reference text,
  severity text not null,   -- High | Medium | Low
  status text not null,     -- compliant | non-compliant
  original_text text,
  suggested_text text,
  why_explanation text,
  court_prediction text,
  financial_risk numeric(14,2) not null default 0
);

-- ============================================================
-- Row Level Security: كل شركة ترى بيانات موظفيها فقط
-- ============================================================
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.contracts enable row level security;
alter table public.audit_reports enable row level security;
alter table public.audit_issues enable row level security;

-- profiles: كل مستخدم يرى ويعدّل ملفه الشخصي فقط
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- companies: يرى المستخدم شركته فقط
create policy "companies_select_member" on public.companies
  for select using (
    id in (select company_id from public.profiles where id = auth.uid())
  );

-- contracts: يرى المستخدم عقود شركته فقط
create policy "contracts_select_company" on public.contracts
  for select using (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );
create policy "contracts_insert_company" on public.contracts
  for insert with check (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );

-- audit_reports: عبر ربط contract_id بشركة المستخدم
create policy "audit_reports_select_company" on public.audit_reports
  for select using (
    contract_id in (
      select c.id from public.contracts c
      join public.profiles p on p.company_id = c.company_id
      where p.id = auth.uid()
    )
  );

-- audit_issues: نفس منطق audit_reports
create policy "audit_issues_select_company" on public.audit_issues
  for select using (
    report_id in (
      select r.id from public.audit_reports r
      join public.contracts c on c.id = r.contract_id
      join public.profiles p on p.company_id = c.company_id
      where p.id = auth.uid()
    )
  );

-- ============================================================
-- Storage bucket لملفات العقود (PDF) — خاص وليس عاماً
-- ============================================================
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

-- سياسة: كل مستخدم يرفع/يقرأ فقط داخل مجلد باسم company_id الخاص به
create policy "contracts_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'contracts'
    and (storage.foldername(name))[1] in (
      select company_id::text from public.profiles where id = auth.uid()
    )
  );

create policy "contracts_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'contracts'
    and (storage.foldername(name))[1] in (
      select company_id::text from public.profiles where id = auth.uid()
    )
  );

-- ============================================================
-- Trigger: إنشاء profile تلقائياً عند تسجيل مستخدم جديد
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
