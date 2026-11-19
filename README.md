# Stand by me 💞

Une question par jour pour un couple. Chacun répond, et on ne voit la réponse de l'autre qu'après avoir répondu soi-même.
Pas de serveur : des fichiers statiques (`index.html`, `app.js`, `style.css`) + Supabase (gratuit).

## Installation

1. Crée un projet sur https://supabase.com
2. **SQL Editor** → colle `schema.sql` → **Run**
3. **Authentication → Sign In / Providers** → active **Allow anonymous sign-ins**
4. **Authentication → URL Configuration** → **Site URL** = l'adresse du site (ex. `https://<pseudo>.github.io/<repo>/`), et ajoute-la aussi dans **Redirect URLs** suivie de `**` (ex. `https://<pseudo>.github.io/<repo>/**`, plus `http://localhost:8000/**` pour tester en local). Sans ça, les liens reçus par email renvoient vers `localhost:3000`.
5. **Authentication → Emails → Templates** : dans **Magic Link** et **Change Email Address**, ajoute `<p>Ton code : <strong>{{ .Token }}</strong></p>`. L'app demande ce code (un lien s'ouvrirait dans le navigateur, pas dans l'app installée sur l'écran d'accueil).
6. **Project Settings → API Keys** → copie l'URL et la clé publishable/anon en haut de `app.js`.

## Ce que l'app fait

- Une question par jour (la même pour les deux, change à minuit heure de Paris). La réponse de l'autre se dévoile quand tu as répondu.
- Temps réel : dévoilement en direct, « c'est ton tour » quand l'autre a répondu, « Je pense à toi ».
- Compagnon (onglet 🐾) : un petit animal dessiné (7 espèces, 9 couleurs, tenues tête/yeux/corps) dont vous vous occupez à deux : manger, câlin, jouer, bain, dodo. Chaque jauge se vide avec le temps ; il est joyeux, triste, sale ou endormi selon vos soins, et l'autre voit tout en direct. Il ne meurt jamais.
- Souvenirs : les jours passés où tu as répondu (un jour sans ta réponse reste secret).
- Compte : anonyme par défaut (lié au navigateur). Dans **Nous**, lier son email (code reçu par mail) permet de se reconnecter sur un autre appareil via « Déjà un compte ? » sur l'écran d'accueil.
- Quitter l'espace : l'autre le garde avec vos réponses. Dissoudre : tout est supprimé.

## Tester en local

```sh
python3 -m http.server 8000
```

Ouvre http://localhost:8000 dans deux navigateurs (ou un normal + une fenêtre privée) pour jouer les deux partenaires.
Attention : ça écrit dans le vrai projet Supabase. Pour isoler, crée un second projet et mets ses identifiants dans `app.js`.

## Mettre en ligne (GitHub Pages)

Push sur `main` → **Settings → Pages** → branche `main`, dossier `/`. Chaque push redéploie le site en 1-2 min.

## Ajouter des questions

Ajoute des lignes **à la fin** de `QUESTIONS` dans `app.js`. La question est enregistrée avec chaque réponse, donc les souvenirs ne changent pas.
