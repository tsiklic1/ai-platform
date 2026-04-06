-- ============================================================
-- generated_images table
-- ============================================================
create table public.generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  content_type_id uuid references public.content_types(id) on delete set null,
  prompt text not null,
  full_prompt text,
  aspect_ratio text not null default '1:1' check (aspect_ratio in ('1:1', '9:16')),
  storage_path text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index idx_generated_images_user_id on public.generated_images(user_id);
create index idx_generated_images_brand_id on public.generated_images(brand_id);
create index idx_generated_images_created_at on public.generated_images(created_at desc);

-- RLS
alter table public.generated_images enable row level security;

create policy "Users can view own generated images"
  on public.generated_images for select
  using (user_id = auth.uid());

create policy "Users can create own generated images"
  on public.generated_images for insert
  with check (user_id = auth.uid());

create policy "Users can update own generated images"
  on public.generated_images for update
  using (user_id = auth.uid());

create policy "Users can delete own generated images"
  on public.generated_images for delete
  using (user_id = auth.uid());
