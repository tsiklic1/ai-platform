-- ============================================================
-- brands table
-- ============================================================
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 100),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_brands_user_id on public.brands(user_id);

-- RLS
alter table public.brands enable row level security;

create policy "Users can view own brands"
  on public.brands for select
  using (user_id = auth.uid());

create policy "Users can create own brands"
  on public.brands for insert
  with check (user_id = auth.uid());

create policy "Users can update own brands"
  on public.brands for update
  using (user_id = auth.uid());

create policy "Users can delete own brands"
  on public.brands for delete
  using (user_id = auth.uid());
