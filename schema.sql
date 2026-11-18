-- À coller dans Supabase > SQL Editor > Run

create table couples (
  id    uuid primary key default gen_random_uuid(),
  code  text unique not null default upper(substr(md5(random()::text), 1, 6)),
  key_a text not null default upper(substr(md5(random()::text), 1, 10)), -- clé de reconnexion du partenaire a
  key_b text,                                                          -- générée quand b rejoint
  a     uuid not null default auth.uid() references auth.users on delete cascade,
  b     uuid references auth.users on delete cascade
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
-- Rejoindre via le code (security definer car on ne "voit" pas encore le couple).
-- Génère aussi la clé de reconnexion du nouveau partenaire.
create or replace function join_couple(c text) returns uuid
language sql security definer set search_path = public as $$
  update couples set b = auth.uid(), key_b = upper(substr(md5(random()::text), 1, 10))
  where code = upper(c) and b is null and a <> auth.uid()
  returning id;
$$;

-- Récupérer sa place après "déconnexion" (nouveau téléphone, données vidées) :
-- code de l'espace + clé personnelle → la place est réattribuée, réponses comprises.
create or replace function recover_couple(c text, s text) returns void
language plpgsql security definer set search_path = public as $$
declare r couples%rowtype; old_uid uuid;
begin
  select * into r from couples where code = upper(c) limit 1;
  if r.id is null then raise exception 'Espace introuvable'; end if;
  if upper(s) = r.key_a then old_uid := r.a;
  elsif r.key_b is not null and upper(s) = r.key_b then old_uid := r.b;
  else raise exception 'Clé de reconnexion invalide'; end if;
  delete from answers where couple_id = r.id and user_id = auth.uid(); -- évite un conflit de clé primaire
  update couples set a = auth.uid() where id = r.id and a = old_uid;
  update couples set b = auth.uid() where id = r.id and b = old_uid;
  update answers set user_id = auth.uid() where couple_id = r.id and user_id = old_uid;
end $$;

-- Quitter son espace : il reste à l'autre (avec vos réponses), on repart de zéro.
create or replace function leave_couple() returns void
language plpgsql security definer set search_path = public as $$
declare r couples%rowtype;
begin
  select * into r from couples where auth.uid() in (a, b) limit 1;
  if r.id is null then return; end if;
  if r.a = auth.uid() then
    if r.b is null then
      delete from couples where id = r.id; -- espace jamais complété : on le supprime
    else
      update couples set a = r.b, b = null where id = r.id; -- l'autre devient titulaire
    end if;
  else
    update couples set b = null where id = r.id;
  end if;
end $$;

-- Dissoudre : supprime l'espace et toutes les réponses (cascade).
create or replace function dissolve_couple() returns void
language sql security definer set search_path = public as $$
  delete from couples
  where id in (select id from couples where auth.uid() in (a, b));
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

-- Temps réel : les flux INSERT de answers et UPDATE de couples sont diffusés au channel du couple.
-- La RLS ci-dessus s'applique aussi à Realtime, donc rien ne fuite avant dévoilement.
alter publication supabase_realtime add table answers;
alter publication supabase_realtime add table couples;
