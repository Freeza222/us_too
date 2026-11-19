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
  guess     text check (length(guess) <= 2000),  -- mode devine : ce que tu penses que l'autre va répondre
  guess_ok  boolean,                             -- verdict de l'autre (via judge_guess)
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
  and guess_ok is null                                   -- on ne se donne pas les points soi-même
  and couple_id in (select id from couples where auth.uid() in (a, b))
);

-- Compagnon partagé (onglet 🐾) : modifié uniquement via pet() ci-dessous
alter table couples
  add column pet_name  text  not null default 'Mochi' check (length(pet_name) between 1 and 20),
  add column pet_style jsonb not null default '{}',  -- { kind, color, hat, eyes, body }
  add column pet_care  jsonb not null default '{}';  -- { feed: { <uid>: date }, hug, play, wash, sleep }

-- Une seule porte d'entrée : actions validées, horodatées par le serveur, fusion atomique
-- (si vous agissez tous les deux en même temps, rien n'est écrasé)
create or replace function pet(action text, val text default null) returns couples
language plpgsql security definer set search_path = public as $$
declare r couples;
begin
  if action in ('feed', 'hug', 'play', 'wash', 'sleep') then
    update couples set pet_care = pet_care || jsonb_build_object(action,
        coalesce(pet_care -> action, '{}') || jsonb_build_object(auth.uid()::text, now()))
      where auth.uid() in (a, b) returning * into r;
  elsif action in ('kind', 'color', 'hat', 'eyes', 'body') then
    if length(coalesce(val, '')) > 20 then raise exception 'Valeur trop longue'; end if;
    update couples set pet_style = pet_style || jsonb_build_object(action, coalesce(val, ''))
      where auth.uid() in (a, b) returning * into r;
  elsif action = 'name' then
    update couples set pet_name = trim(val) where auth.uid() in (a, b) returning * into r;
  else
    raise exception 'Action inconnue : %', action;
  end if;
  return r;
end $$;

-- Mode devine 🎯, série 🔥 et vos propres questions 💌
-- L'autre juge ta devinette (et toi la sienne), seulement une fois les réponses dévoilées
create or replace function judge_guess(d date, ok boolean) returns void
language sql security definer set search_path = public as $$
  update answers set guess_ok = ok
  where day = d and guess is not null and user_id <> auth.uid()
    and couple_id in (select id from couples where auth.uid() in (a, b))
    and has_answered(couple_id, d);
$$;

-- 2. Série et jours à deux (jours où vous avez répondu tous les deux) : débloquent les tenues
create or replace function couple_stats() returns json
language sql stable security definer set search_path = public as $$
  with c as (select id from couples where auth.uid() in (a, b) limit 1),
  d as (select day from answers where couple_id = (select id from c)
        group by day having count(distinct user_id) = 2),
  g as (select day, day - (row_number() over (order by day))::int as grp from d),
  runs as (select max(day) as fin, count(*) as n from g group by grp)
  select json_build_object(
    'total',  (select count(*) from d),
    'best',   coalesce((select max(n) from runs), 0),
    -- la série tient tant que le dernier jour à deux est aujourd'hui ou hier
    'streak', coalesce((select n from runs where fin >= (now() at time zone 'Europe/Paris')::date - 1), 0),
    'today',  exists (select 1 from d where day = (now() at time zone 'Europe/Paris')::date));
$$;

-- 3. Vos propres questions : une par jour, avant celles de l'app (sauf le dimanche, jour du mode devine)
create table if not exists custom_questions (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples on delete cascade,
  author     uuid not null default auth.uid() references auth.users on delete cascade,
  text       text not null check (length(trim(text)) between 3 and 300),
  created_at timestamptz not null default now(),
  used_on    date                                  -- jour où elle est tombée
);
alter table custom_questions enable row level security;

-- Tu vois les tiennes ; celles de l'autre restent une surprise jusqu'à ce qu'elles tombent
create policy "voir nos questions" on custom_questions for select using (
  couple_id in (select id from couples where auth.uid() in (a, b))
  and (author = auth.uid() or used_on is not null)
);
create policy "ajouter une question" on custom_questions for insert with check (
  author = auth.uid() and used_on is null
  and couple_id in (select id from couples where auth.uid() in (a, b))
);
create policy "retirer sa question" on custom_questions for delete
  using (author = auth.uid() and used_on is null);

-- Combien de questions attendent, de chaque côté (sans rien révéler de celles de l'autre)
create or replace function pending_questions() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'mine',   count(*) filter (where author = auth.uid()),
    'theirs', count(*) filter (where author <> auth.uid()))
  from custom_questions
  where used_on is null and couple_id in (select id from couples where auth.uid() in (a, b));
$$;

-- La question perso du jour : tirée une seule fois par jour, la même pour vous deux
create or replace function todays_custom() returns custom_questions
language plpgsql security definer set search_path = public as $$
declare
  cid   uuid;
  today date := (now() at time zone 'Europe/Paris')::date;
  r     custom_questions;
begin
  select id into cid from couples where auth.uid() in (a, b) limit 1;
  if cid is null then return null; end if;
  perform pg_advisory_xact_lock(hashtext(cid::text));      -- vous deux en même temps → un seul tirage
  select * into r from custom_questions where couple_id = cid and used_on = today;
  if found then return r; end if;
  -- quelqu'un a déjà répondu à la question de l'app aujourd'hui : on ne change pas en cours de route
  if exists (select 1 from answers where couple_id = cid and day = today) then return null; end if;
  update custom_questions set used_on = today
    where id = (select id from custom_questions where couple_id = cid and used_on is null
                order by created_at limit 1)
    returning * into r;
  return r;
end $$;

-- Temps réel (la RLS s'applique aussi : rien ne fuite avant dévoilement)
alter publication supabase_realtime add table answers;
alter publication supabase_realtime add table couples;
