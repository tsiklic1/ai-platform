-- ============================================================
-- content_types table
-- ============================================================
create table public.content_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  description text,
  text_prompt_template text,
  image_prompt_template text,
  image_style text,
  default_aspect_ratio text not null default '1:1' check (default_aspect_ratio in ('1:1', '9:16')),
  is_default boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_content_types_user_id on public.content_types(user_id);
create index idx_content_types_brand_id on public.content_types(brand_id);

-- RLS
alter table public.content_types enable row level security;

create policy "Users can view own content types"
  on public.content_types for select
  using (user_id = auth.uid());

create policy "Users can create own content types"
  on public.content_types for insert
  with check (user_id = auth.uid());

create policy "Users can update own content types"
  on public.content_types for update
  using (user_id = auth.uid());

create policy "Users can delete own content types"
  on public.content_types for delete
  using (user_id = auth.uid());
