-- BookPro schema. Run once in Supabase SQL editor.
create extension if not exists "pgcrypto";

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users,
  name text default 'My Business',
  logo text,
  primary_color text default '#6366f1',
  secondary_color text default '#06b6d4',
  accent_color text default '#10b981',
  show_fixed_slots boolean default false,
  created_at timestamptz default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  date date not null,
  time text,
  client_name text,
  client_phone text,
  client_email text,
  service text,
  notes text,
  media_name text,
  canceled boolean default false,
  rescheduled_from uuid,
  created_at timestamptz default now()
);

create table if not exists clock_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  employee_name text,
  clock_in timestamptz,
  clock_out timestamptz
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  recipient text,
  body text,
  created_at timestamptz default now()
);

alter table companies enable row level security;
alter table appointments enable row level security;
alter table clock_records enable row level security;
alter table quotes enable row level security;

create policy "owner companies" on companies for all
  using (owner_id is null or auth.uid() = owner_id)
  with check (owner_id is null or auth.uid() = owner_id);

create policy "company appointments" on appointments for all
  using (company_id in (select id from companies where owner_id is null or owner_id = auth.uid()));

create policy "company clock" on clock_records for all
  using (company_id in (select id from companies where owner_id is null or owner_id = auth.uid()));

create policy "company quotes" on quotes for all
  using (company_id in (select id from companies where owner_id is null or owner_id = auth.uid()));
