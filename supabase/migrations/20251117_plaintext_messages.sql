-- Plain-text messages: add body column and clear old encrypted chat data.
alter table public.messages add column if not exists body text not null default '';
alter table public.statuses add column if not exists body text not null default '';

truncate table public.typing, public.messages, public.chat_members, public.chats, public.statuses, public.calls restart identity cascade;