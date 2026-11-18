-- À coller dans Supabase > SQL Editor > Run

create table couples (
  id   uuid primary key default gen_random_uuid(),
  code text unique not null default upper(substr(md5(random()::text), 1, 6)),
  a    uuid not null default auth.uid() references auth.users on delete cascade,
  b    uuid references auth.users on delete cascade
);

create table answers (
  couple_id uuid not null references couples on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users on delete cascade,
  day       date not null default current_date, -- ponytail: jour UTC, change à 1h/2h heure de Paris
  text      text not null check (length(text) between 1 and 2000),
  primary key (couple_id, user_id, day)
);

alter table couples enable row level security;
alter table answers enable row level security;

-- Couples : on ne voit que le sien, on ne crée que pour soi
create policy "voir mon couple" on couples for select
  using (auth.uid() in (a, b));
create policy "créer un couple" on couples for insert
  with check (a = auth.uid() and b is null);

-- Rejoindre via le code (security definer car on ne "voit" pas encore le couple)
create function join_couple(c text) returns uuid
language sql security definer set search_path = public as $$
  update couples set b = auth.uid()
  where code = upper(c) and b is null and a <> auth.uid()
  returning id;
$$;

-- Helper hors RLS (une policy sur answers ne peut pas relire answers sans récursion)
create function has_answered(cid uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from answers where couple_id = cid and day = d and user_id = auth.uid());
$$;

-- Réponses : on voit celles de son couple, seulement les jours où on a soi-même répondu
create policy "lire les réponses" on answers for select using (
  couple_id in (select id from couples where auth.uid() in (a, b))
  and has_answered(couple_id, day)
);
create policy "répondre aujourd'hui" on answers for insert with check (
  user_id = auth.uid()
  and day = current_date
  and couple_id in (select id from couples where auth.uid() in (a, b))
);

-- Temps réel : le flux INSERT de answers est diffusé au channel du couple.
-- La RLS ci-dessus s'applique aussi à Realtime, donc rien ne fuite avant dévoilement.
alter publication supabase_realtime add table answers;
