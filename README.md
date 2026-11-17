# Nous deux

Une question par jour pour un couple. Chacun répond, et on ne voit la réponse de l'autre qu'après avoir répondu soi-même.
Pas de serveur : un fichier HTML statique + Supabase (gratuit).

## Installation (10 min)

1. Crée un projet sur https://supabase.com
2. **SQL Editor** → colle `schema.sql` → **Run**
3. **Authentication → Sign In / Providers** → active **Allow anonymous sign-ins**
4. **Project Settings → API** → copie l'URL et la clé `anon` dans `index.html` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)

## Tester en local

```sh
python3 -m http.server 8000
```
Ouvre http://localhost:8000 dans deux navigateurs différents (ou une fenêtre privée) pour simuler les deux partenaires.

## Mettre en ligne (GitHub Pages)

Push le repo sur GitHub → **Settings → Pages** → Source : branche `main`, dossier `/` → l'app est sur `https://<pseudo>.github.io/<repo>/`.

## Ajouter des questions

Ajoute des lignes dans `QUESTIONS` dans `index.html`. La question du jour = numéro du jour % nombre de questions.
