-- Arcade Rooms: per-player game history with private, owner-only access.
-- Run once in the Supabase Dashboard SQL Editor.

create table if not exists public.game_history (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  opponent_id uuid not null references auth.users (id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 20),
  opponent_name text not null check (char_length(opponent_name) between 1 and 20),
  game_type text not null check (game_type in ('rps', 'ttt')),
  variant text not null,
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  player_score smallint not null check (player_score >= 0),
  opponent_score smallint not null check (opponent_score >= 0),
  room_code text not null check (char_length(room_code) = 6),
  completed_at timestamptz not null default now(),
  unique (game_id, user_id)
);

alter table public.game_history enable row level security;

revoke all on table public.game_history from anon, authenticated;
grant select, insert on table public.game_history to authenticated;

drop policy if exists "Players can read their own history" on public.game_history;
create policy "Players can read their own history"
  on public.game_history for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Players can add their own history" on public.game_history;
create policy "Players can add their own history"
  on public.game_history for insert to authenticated
  with check ((select auth.uid()) = user_id);

create index if not exists game_history_user_completed_idx
  on public.game_history (user_id, completed_at desc);
