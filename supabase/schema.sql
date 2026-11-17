-- Run this once in the Supabase SQL editor.
-- Auth: enable Email and Google. For local testing, turn off "Confirm email".

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  username text not null,
  username_lower text not null unique,
  about text not null default '',
  photo_url text not null default '',
  public_key text not null,
  last_seen bigint not null default 0,
  online boolean not null default false,
  privacy jsonb not null default '{"lastSeen":"everyone","photo":"everyone","about":"everyone"}'::jsonb,
  key_backup text not null default ''
);

create table if not exists public.chats (
  id text primary key,
  type text not null check (type in ('direct', 'group')),
  title text not null default '',
  photo_url text not null default '',
  updated_at bigint not null,
  last_message jsonb,
  disappearing_ms bigint,
  current_epoch integer not null default 0,
  epochs jsonb not null default '{}'::jsonb
);

create table if not exists public.chat_members (
  chat_id text not null references public.chats (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  joined_at bigint not null,
  pinned boolean not null default false,
  archived boolean not null default false,
  muted_until bigint not null default 0,
  unread integer not null default 0,
  primary key (chat_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null references public.chats (id) on delete cascade,
  sender_id uuid not null,
  created_at bigint not null,
  type text not null,
  ciphertext text not null,
  nonce text not null,
  wraps jsonb not null default '{}'::jsonb,
  epoch integer,
  content_key_wrap text,
  reply_to uuid,
  edited_at bigint,
  deleted_for_all boolean not null default false,
  deleted_for uuid[] not null default '{}',
  starred_by uuid[] not null default '{}',
  reactions jsonb not null default '{}'::jsonb,
  delivered_to uuid[] not null default '{}',
  read_by uuid[] not null default '{}',
  file_path text,
  file_nonce text,
  file_name text,
  file_mime text,
  expires_at bigint
);

create index if not exists messages_chat_created on public.messages (chat_id, created_at desc);

create table if not exists public.typing (
  chat_id text not null references public.chats (id) on delete cascade,
  user_id uuid not null,
  at bigint not null,
  primary key (chat_id, user_id)
);

create table if not exists public.statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ciphertext text not null,
  nonce text not null,
  wraps jsonb not null default '{}'::jsonb,
  type text not null default 'text',
  file_path text,
  file_nonce text,
  created_at bigint not null,
  expires_at bigint not null,
  viewers jsonb not null default '{}'::jsonb
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null,
  callee_id uuid not null,
  video boolean not null,
  state text not null,
  offer jsonb,
  answer jsonb,
  created_at bigint not null
);

create table if not exists public.call_ice (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls (id) on delete cascade,
  from_user uuid not null,
  candidate jsonb not null
);

create or replace function public.is_chat_member(cid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_members
    where chat_id = cid and user_id = auth.uid()
  );
$$;

create or replace function public.is_call_party(call uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.calls
    where id = call and (caller_id = auth.uid() or callee_id = auth.uid())
  );
$$;

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.typing enable row level security;
alter table public.statuses enable row level security;
alter table public.calls enable row level security;
alter table public.call_ice enable row level security;

create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles update" on public.profiles for update to authenticated using (id = auth.uid());

create policy "chats read" on public.chats for select to authenticated using (public.is_chat_member(id));
create policy "chats insert" on public.chats for insert to authenticated with check (true);
create policy "chats update" on public.chats for update to authenticated using (public.is_chat_member(id));

create policy "members read" on public.chat_members for select to authenticated using (public.is_chat_member(chat_id));
create policy "members insert" on public.chat_members for insert to authenticated
  with check (user_id = auth.uid() or public.is_chat_member(chat_id));
create policy "members update" on public.chat_members for update to authenticated using (public.is_chat_member(chat_id));
create policy "members delete" on public.chat_members for delete to authenticated using (public.is_chat_member(chat_id));

create policy "messages read" on public.messages for select to authenticated using (public.is_chat_member(chat_id));
create policy "messages insert" on public.messages for insert to authenticated
  with check (public.is_chat_member(chat_id) and sender_id = auth.uid());
create policy "messages update" on public.messages for update to authenticated using (public.is_chat_member(chat_id));
create policy "messages delete" on public.messages for delete to authenticated using (public.is_chat_member(chat_id));

create policy "typing read" on public.typing for select to authenticated using (public.is_chat_member(chat_id));
create policy "typing write" on public.typing for all to authenticated
  using (public.is_chat_member(chat_id) and user_id = auth.uid())
  with check (public.is_chat_member(chat_id) and user_id = auth.uid());

create policy "status read" on public.statuses for select to authenticated using (true);
create policy "status insert" on public.statuses for insert to authenticated with check (user_id = auth.uid());
create policy "status update" on public.statuses for update to authenticated using (true);
create policy "status delete" on public.statuses for delete to authenticated using (user_id = auth.uid());

create policy "calls read" on public.calls for select to authenticated using (caller_id = auth.uid() or callee_id = auth.uid());
create policy "calls insert" on public.calls for insert to authenticated with check (caller_id = auth.uid());
create policy "calls update" on public.calls for update to authenticated using (caller_id = auth.uid() or callee_id = auth.uid());

create policy "ice read" on public.call_ice for select to authenticated using (public.is_call_party(call_id));
create policy "ice insert" on public.call_ice for insert to authenticated
  with check (public.is_call_party(call_id) and from_user = auth.uid());

create or replace function public.bump_unread(cid text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_members
  set unread = unread + 1
  where chat_id = cid and user_id <> auth.uid() and public.is_chat_member(cid);
$$;

grant execute on function public.bump_unread(text) to authenticated;

alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.chats;
alter publication supabase_realtime add table public.chat_members;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.typing;
alter publication supabase_realtime add table public.statuses;
alter publication supabase_realtime add table public.calls;
alter publication supabase_realtime add table public.call_ice;
