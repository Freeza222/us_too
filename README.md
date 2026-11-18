# Nous deux

Une question par jour pour un couple. Chacun répond, et on ne voit la réponse de l'autre qu'après avoir répondu soi-même.
Pas de serveur : un fichier HTML statique + Supabase (gratuit).

## Installation (10 min)

1. Crée un projet sur https://supabase.com
2. **SQL Editor** → colle `schema.sql` → **Run**
3. **Authentication → Sign In / Providers** → active **Allow anonymous sign-ins**
4. **Project Settings → API** → copie l'URL et la clé `anon` en haut de `app.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)

La logique est dans `app.js`, le style dans `style.css`, l'ossature dans `index.html`.

## Déjà en ligne et mise à jour ?

Si le projet Supabase existait avant une mise à jour du `schema.sql`, ré-exécute dans le **SQL Editor** les seuls ajouts concernés.

Temps réel (une fois) :

```sql
alter publication supabase_realtime add table answers;
alter publication supabase_realtime add table couples;
```

Reconnexion par clé personnelle : recolle dans le **SQL Editor** le bloc complet ci-dessous (colonnes + fonctions + temps réel), puis **Run** — tout est en `create or replace`, tu peux le rejouer sans risque :

```sql
alter table couples add column if not exists key_a text not null default upper(substr(md5(random()::text), 1, 10));
alter table couples add column if not exists key_b text;
update couples set key_b = upper(substr(md5(random()::text), 1, 10)) where b is not null and key_b is null;
create or replace function join_couple(c text) returns uuid
language sql security definer set search_path = public as $$
  update couples set b = auth.uid(), key_b = upper(substr(md5(random()::text), 1, 10))
  where code = upper(c) and b is null and a <> auth.uid()
  returning id;
$$;
create or replace function ensure_my_key() returns void
language plpgsql security definer set search_path = public as $$
declare r couples%rowtype;
begin
  select * into r from couples where a = auth.uid() or b = auth.uid() limit 1;
  if r.id is null then return; end if;
  if r.a = auth.uid() and coalesce(r.key_a, '') = '' then
    update couples set key_a = upper(substr(md5(random()::text), 1, 10)) where id = r.id;
  elsif r.b = auth.uid() and coalesce(r.key_b, '') = '' then
    update couples set key_b = upper(substr(md5(random()::text), 1, 10)) where id = r.id;
  end if;
end $$;
-- + les blocs create or replace de recover_couple, leave_couple et dissolve_couple (dans schema.sql)
alter publication supabase_realtime add table answers;
alter publication supabase_realtime add table couples;
```

## Ce que l'app fait

- Une question par jour (la même pour les deux), réponse dévoilée seulement quand les deux ont répondu.
- Dévoilement en direct : quand le partenaire répond, la page se met à jour sans rafraîchir (temps réel).
- « C'est ton tour » : alerte (toast, vibration, notification si activées, titre d'onglet qui clignote) quand le partenaire a répondu.
- « Je pense à toi » : bulle instantanée envoyée au partenaire, même hors question.
- Nos souvenirs : historique des jours passés où tu as répondu (la règle du secret s'applique : un jour sans ta réponse reste invisible).
- Email de secours : proposé tant que le compte est anonyme, pour ne pas perdre les réponses si les données du navigateur sont vidées.
- Quitter l'espace (onglet Nous) : tu sors de la session, le partenaire garde l'espace et vos réponses. Dissoudre supprime définitivement l'espace et toutes les réponses.
- Reconnexion (onglet Nous) : chaque partenaire a un code d'espace + une clé personnelle à noter. Sur un nouveau téléphone ou après avoir vidé les données du navigateur, se reconnecter depuis l'écran Bienvenue retrouve sa place et ses réponses. La clé est personnelle : sans elle, personne ne peut reprendre ta place.

## Tester en local

```sh
python3 -m http.server 8000
```

Ouvre http://localhost:8000.

- Simule les deux partenaires en ouvrant le site dans **deux navigateurs différents** (Firefox + Chromium) ou un normal + une fenêtre privée : le compte anonyme vit dans le stockage du navigateur.
- Réponds d'un côté, regarde l'autre recevoir « c'est ton tour » puis le dévoilement en direct.
- Attention : les tests tapent dans le vrai projet Supabase (mêmes identifiants que la version en ligne). Pour isoler, crée un second projet Supabase et mets ses identifiants dans `app.js`.

## Mettre en ligne (GitHub Pages)

Push le repo sur GitHub → **Settings → Pages** → Source : branche `main`, dossier `/` → l'app est sur `https://<pseudo>.github.io/<repo>/`.

## Ajouter des questions

Ajoute des lignes dans `QUESTIONS` dans `index.html`. La question du jour = numéro du jour % nombre de questions.
