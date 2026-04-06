-- ============================================================
-- brand_product_images table
-- ============================================================
create table public.brand_product_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.brand_products(id) on delete cascade,
  storage_path text not null,
  url text not null,
  sort_order int not null default 0 check (sort_order >= 0 and sort_order <= 4),
  created_at timestamptz not null default now()
);

create index idx_brand_product_images_user_id on public.brand_product_images(user_id);
create index idx_brand_product_images_product_id on public.brand_product_images(product_id);

-- RLS
alter table public.brand_product_images enable row level security;

create policy "Users can view own product images"
  on public.brand_product_images for select
  using (user_id = auth.uid());

create policy "Users can create own product images"
  on public.brand_product_images for insert
  with check (user_id = auth.uid());

create policy "Users can update own product images"
  on public.brand_product_images for update
  using (user_id = auth.uid());

create policy "Users can delete own product images"
  on public.brand_product_images for delete
  using (user_id = auth.uid());
