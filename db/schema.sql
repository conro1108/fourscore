-- Fourscore's slice of the shared toybox database.
--
-- This is a full rebuild, not a migration: the whole schema is dropped and
-- recreated on every push. In-progress matches are the only thing lost, and a
-- half-finished game of Connect 4 is not worth a migration history. `cascade`
-- stops at the schema boundary, so this cannot touch another project's data.
--
-- Multiplayer here is client-authoritative. Both clients own the same engine and
-- fold the move list into a Position independently, so an illegal move shows up
-- as a replay mismatch on the opponent's machine. What the database enforces is
-- the part that breaks by accident rather than by malice: whose turn it is, and
-- that plies land in order exactly once.

drop schema if exists fourscore cascade;
create schema fourscore;
grant usage on schema fourscore to anon, authenticated;

create type fourscore.match_status as enum ('waiting', 'active', 'finished', 'abandoned');

create table fourscore.matches (
  id         uuid primary key default gen_random_uuid(),
  -- Cleared once someone joins, so a shared link stops working after it's used.
  join_code  text unique,
  variant    text not null default 'connect4' check (variant in ('connect4', 'connect5', 'connect6', 'connect7')),
  host       uuid not null references auth.users on delete cascade,
  guest      uuid references auth.users on delete cascade,
  -- Which seat the host takes; seat 1 moves first.
  host_seat  smallint not null default 1 check (host_seat in (1, 2)),
  status     fourscore.match_status not null default 'waiting',
  winner     uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only, and the source of truth. No board column: the position is a fold
-- over these rows, exactly as Match.history already is in the engine, and the
-- bitboard packing stays the one thing board.ts knows about.
create table fourscore.moves (
  match_id  uuid not null references fourscore.matches on delete cascade,
  ply       int not null check (ply >= 0),
  col       int not null check (col >= 0),
  player    uuid not null references auth.users on delete cascade,
  played_at timestamptz not null default now(),
  primary key (match_id, ply)
);

create index on fourscore.matches (host) where status <> 'finished';
create index on fourscore.matches (guest) where status <> 'finished';

alter table fourscore.matches enable row level security;
alter table fourscore.moves enable row level security;

-- Matches are visible only to their two players. Finding a match by join code
-- goes through join_match() below, because RLS can't express "readable only if
-- you already know the code" — a select policy that matched on the code would
-- let anyone list every open game.
create policy "players see their own matches" on fourscore.matches
  for select using (auth.uid() in (host, guest));

create policy "anyone can host a match" on fourscore.matches
  for insert with check (host = auth.uid());

create policy "players can update their match" on fourscore.matches
  for update using (auth.uid() in (host, guest))
  with check (auth.uid() in (host, guest));

create policy "players see their own moves" on fourscore.moves
  for select using (
    exists (
      select 1 from fourscore.matches m
      where m.id = match_id and auth.uid() in (m.host, m.guest)
    )
  );

-- The only rule the database really enforces. Turn order is pure arithmetic on
-- the ply count, so it costs nothing: seat 1 plays even plies.
create policy "only the player to move may move" on fourscore.moves
  for insert with check (
    player = auth.uid()
    and exists (
      select 1 from fourscore.matches m
      where m.id = match_id
        and m.status = 'active'
        and auth.uid() = case
          when (ply + m.host_seat) % 2 = 1 then m.host
          else m.guest
        end
    )
  );

-- Contiguity is a trigger and not part of the policy above, because a policy on
-- `moves` that subqueries `moves` is infinite recursion (42P17) — Postgres
-- rejects it at runtime, not at creation, so it looks fine until the first
-- insert. security definer lets the count see rows the caller's select policy
-- would filter, which matters the moment we add spectators.
create function fourscore.enforce_ply_order()
returns trigger
language plpgsql
security definer
set search_path = fourscore, public
as $$
declare
  expected int;
begin
  select count(*) into expected from fourscore.moves where match_id = new.match_id;
  if new.ply <> expected then
    raise exception 'ply % is not the next move (expected %)', new.ply, expected
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger moves_ply_contiguous
  before insert on fourscore.moves
  for each row execute function fourscore.enforce_ply_order();

grant select, insert, update on fourscore.matches to authenticated;
grant select, insert on fourscore.moves to authenticated;

-- Joining by code. security definer so the lookup can see a row the caller has
-- no select policy for yet, and the single UPDATE means two people racing on the
-- same code produce one guest, not two.
create function fourscore.join_match(p_code text)
returns fourscore.matches
language plpgsql
security definer
set search_path = fourscore, public
as $$
declare
  m fourscore.matches;
begin
  update fourscore.matches
     set guest = auth.uid(),
         status = 'active',
         join_code = null,
         updated_at = now()
   where join_code = upper(p_code)
     and status = 'waiting'
     and host <> auth.uid()
  returning * into m;

  if m.id is null then
    raise exception 'no open match with that code';
  end if;
  return m;
end;
$$;

grant execute on function fourscore.join_match(text) to authenticated;

-- Realtime. Publication membership is dropped along with the schema, so it has
-- to be re-added on every push.
alter publication supabase_realtime add table fourscore.matches;
alter publication supabase_realtime add table fourscore.moves;
