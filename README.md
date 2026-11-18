# Nous deux

Une question par jour pour un couple. Chacun répond, et on ne voit la réponse de l'autre qu'après avoir répondu soi-même.
Pas de serveur : un fichier HTML statique + Supabase (gratuit).

## Installation (10 min)

1. Crée un projet sur https://supabase.com
2. **SQL Editor** → colle `schema.sql` → **Run**
3. **Authentication → Sign In / Providers** → active **Allow anonymous sign-ins**
4. **Project Settings → API** → copie l'URL et la clé `anon` dans `index.html` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)

## Déjà en ligne et mise à jour ?

Si le projet Supabase existait avant l'ajout du temps réel, exécute une fois dans le **SQL Editor** :

```sql
alter publication supabase_realtime add table answers;
```

## Ce que l'app fait

- Une question par jour (la même pour les deux), réponse dévoilée seulement quand les deux ont répondu.
- Dévoilement en direct : quand le partenaire répond, la page se met à jour sans rafraîchir (temps réel).
- « C'est ton tour » : alerte (toast, vibration, notification si activées, titre d'onglet qui clignote) quand le partenaire a répondu.
- « Je pense à toi » : bulle instantanée envoyée au partenaire, même hors question.
- Nos souvenirs : historique des jours passés où tu as répondu (la règle du secret s'applique : un jour sans ta réponse reste invisible).
- Email de secours : proposé tant que le compte est anonyme, pour ne pas perdre les réponses si les données du navigateur sont vidées.

## Tester en local

```sh
python3 -m http.server 8000
```
Ouvre http://localhost:8000 dans deux navigateurs différents (ou une fenêtre privée) pour simuler les deux partenaires.

## Mettre en ligne (GitHub Pages)

Push le repo sur GitHub → **Settings → Pages** → Source : branche `main`, dossier `/` → l'app est sur `https://<pseudo>.github.io/<repo>/`.

## Ajouter des questions

Ajoute des lignes dans `QUESTIONS` dans `index.html`. La question du jour = numéro du jour % nombre de questions.
