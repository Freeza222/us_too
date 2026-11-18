# Nous deux

Une question par jour pour un couple. Chacun répond, et on ne voit la réponse de l'autre qu'après avoir répondu soi-même.
Pas de serveur : un fichier HTML statique + Supabase (gratuit).

## Installation (10 min)

1. Crée un projet sur https://supabase.com
2. **SQL Editor** → colle `schema.sql` → **Run**
3. **Authentication → Sign In / Providers** → active **Allow anonymous sign-ins**
Toute la logique est dans `app.js`, le style dans `style.css`, l'ossature dans `index.html`.
Les URL et clé à copier sont en haut de `app.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).

## Déjà en ligne et mise à jour ?

Si le projet Supabase existait avant une mise à jour du `schema.sql`, ré-exécute dans le **SQL Editor** les seuls ajouts concernés :

```sql
-- temps réel (une fois)
alter publication supabase_realtime add table answers;
alter publication supabase_realtime add table couples;

-- quitter / dissoudre un espace (fonctions créées à la suite de join_couple dans schema.sql)
```

Recolle simplement les fonctions `leave_couple` et `dissolve_couple` depuis `schema.sql` (elles sont en `create or replace`).

## Ce que l'app fait

- Une question par jour (la même pour les deux), réponse dévoilée seulement quand les deux ont répondu.
- Dévoilement en direct : quand le partenaire répond, la page se met à jour sans rafraîchir (temps réel).
- « C'est ton tour » : alerte (toast, vibration, notification si activées, titre d'onglet qui clignote) quand le partenaire a répondu.
- « Je pense à toi » : bulle instantanée envoyée au partenaire, même hors question.
- Nos souvenirs : historique des jours passés où tu as répondu (la règle du secret s'applique : un jour sans ta réponse reste invisible).
- Email de secours : proposé tant que le compte est anonyme, pour ne pas perdre les réponses si les données du navigateur sont vidées.
- Quitter l'espace (onglet Nous) : tu sors de la session, le partenaire garde l'espace et vos réponses. Dissoudre supprime définitivement l'espace et toutes les réponses.

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
