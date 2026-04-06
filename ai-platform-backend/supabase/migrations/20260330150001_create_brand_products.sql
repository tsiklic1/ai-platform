-- ============================================================
-- brand_products table
-- ============================================================
create table public.brand_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  description text,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_brand_products_user_id on public.brand_products(user_id);
create index idx_brand_products_brand_id on public.brand_products(brand_id);

-- RLS
alter table public.brand_products enable row level security;

create policy "Users can view own brand products"
  on public.brand_products for select
  using (user_id = auth.uid());

create policy "Users can create own brand products"
  on public.brand_products for insert
  with check (user_id = auth.uid());

create policy "Users can update own brand products"
  on public.brand_products for update
  using (user_id = auth.uid());

create policy "Users can delete own brand products"
  on public.brand_products for delete
  using (user_id = auth.uid());
