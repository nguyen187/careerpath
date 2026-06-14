-- Run this in Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor

create table public.profiles (
  id            uuid references auth.users on delete cascade primary key,
  career_data   jsonb,
  tracker_apps  jsonb default '[]'::jsonb,
  notes         jsonb default '[]'::jsonb,
  todos         jsonb default '[]'::jsonb,
  focus_sessions jsonb default '[]'::jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Row Level Security: each user can only read/write their own row
alter table public.profiles enable row level security;

create policy "Users manage own profile"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);
