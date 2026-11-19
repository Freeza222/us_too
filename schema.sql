-- Installation neuve : à coller dans Supabase > SQL Editor > Run

create table couples (
  id   uuid primary key default gen_random_uuid(),
  code text unique not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  a    uuid not null default auth.uid() references auth.users on delete cascade,
  b    uuid references auth.users on delete cascade
);

create table answers (
  couple_id uuid not null references couples on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users on delete cascade,
  day       date not null default (now() at time zone 'Europe/Paris')::date,
  question  text check (length(question) <= 500), -- figée au moment de répondre
  text      text not null check (length(text) between 1 and 2000),
  primary key (couple_id, user_id, day)
);

alter table couples enable row level security;
alter table answers enable row level security;

-- Couples : on ne voit que le sien, on n'en crée un que si on n'en a pas déjà
create policy "voir mon couple" on couples for select
  using (auth.uid() in (a, b));
create policy "créer un couple" on couples for insert with check (
  a = auth.uid() and b is null
  and not exists (select 1 from couples where auth.uid() in (a, b))
);

-- Rejoindre via le code (security definer car on ne "voit" pas encore le couple)
create function join_couple(c text) returns uuid
language sql security definer set search_path = public as $$
  update couples set b = auth.uid()
  where code = upper(c) and b is null
    and not exists (select 1 from couples where auth.uid() in (a, b))
  returning id;
$$;

-- Quitter : l'espace reste à l'autre avec vos réponses (supprimé s'il n'a pas de partenaire)
create function leave_couple() returns void
language sql security definer set search_path = public as $$
  delete from couples where a = auth.uid() and b is null;
  update couples set a = b, b = null where a = auth.uid();
  update couples set b = null where b = auth.uid();
$$;

-- Dissoudre : supprime l'espace et toutes les réponses (cascade)
create function dissolve_couple() returns void
language sql security definer set search_path = public as $$
  delete from couples where auth.uid() in (a, b);
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
  and day = (now() at time zone 'Europe/Paris')::date
  and couple_id in (select id from couples where auth.uid() in (a, b))
);

-- Temps réel (la RLS s'applique aussi : rien ne fuite avant dévoilement)
alter publication supabase_realtime add table answers;
alter publication supabase_realtime add table couples;
