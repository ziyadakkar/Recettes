# Les recettes de Charlotte

Application web installable (PWA) de recettes, partagée entre Ziyad et Charlotte.

- **Code** : HTML, CSS, JavaScript, sans framework ni compilation.
- **Hébergement** : GitHub Pages. Chaque modification envoyée sur la branche `main` est en ligne en 1 minute environ.
- **Données** : Firebase Firestore, dans la collection `recipes`.
- **Connexion** : e-mail et mot de passe. Seules les adresses listées dans `firestore.rules` ont accès.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'entrée |
| `app.js` | Logique de l'app : écrans, recherche, formulaire, connexion à Firebase |
| `style.css` | Apparence |
| `firebase-config.js` | Paramètres de connexion au projet Firebase. Ils sont publics : la sécurité repose sur les règles |
| `firestore.rules` | Qui peut lire et écrire les recettes |
| `manifest.json`, `icons/` | Ce qui rend l'app installable : nom, icône, couleurs |
| `sw.js` | Service worker : cache hors connexion et mises à jour |
| `data/recettes.json` | Les 12 recettes de départ, importées au premier lancement. Sert aussi de sauvegarde |

## Mise en place (une seule fois)

### 1. Firebase (environ 10 minutes)
1. Va sur https://console.firebase.google.com, clique sur **Créer un projet** et nomme-le `recettes-charlotte`. Google Analytics n'est pas nécessaire.
2. **Build → Authentication → Commencer → Adresse e-mail/Mot de passe → Activer**.
3. Dans **Authentication → Utilisateurs → Ajouter un utilisateur**, crée deux comptes : le tien et celui de Charlotte, avec un mot de passe provisoire pour elle.
4. **Build → Firestore Database → Créer une base de données**. Choisis la région `eur3 (europe)` et le **mode production**.
5. Dans l'onglet **Règles** de Firestore, colle le contenu de `firestore.rules`, remplace `EMAIL_DE_CHARLOTTE@gmail.com` par sa vraie adresse, puis clique sur **Publier**.
6. Dans **⚙️ Paramètres du projet → Général → Vos applications**, clique sur l'icône **Web `</>`** et nomme l'app `recettes`. Ne coche pas Firebase Hosting. Copie l'objet `firebaseConfig` dans `firebase-config.js`.
7. Dans **Authentication → Paramètres → Domaines autorisés**, ajoute `<ton-compte>.github.io`.

### 2. GitHub Pages
1. Crée un dépôt nommé `recettes`. Il peut être public : il ne contient aucun secret.
2. Envoie le code sur la branche `main`.
3. Dans **Settings → Pages**, choisis **Source : Deploy from a branch**, puis la branche **`main`** et le dossier **`/ (root)`**.
4. L'app est alors disponible à l'adresse `https://<ton-compte>.github.io/recettes/`.

### 3. Premier lancement
1. Ouvre l'adresse, connecte-toi, puis appuie sur **Importer les recettes de départ** (à faire une seule fois).
2. Sur le téléphone de Charlotte : ouvrir l'adresse dans **Safari** (iPhone) ou **Chrome** (Android), choisir **Ajouter à l'écran d'accueil**, puis se connecter une fois.

## Publier une mise à jour
1. Modifier le code.
2. **Augmenter le numéro de version** au même endroit dans `app.js` (`APP_VERSION`) et dans `sw.js` (`VERSION`), par exemple `1.0.0` → `1.1.0`.
3. Envoyer sur `main`. Environ 1 minute plus tard, l'app est à jour. À l'ouverture suivante, Charlotte a la nouvelle version, et un bandeau « Nouvelle version disponible » s'affiche si l'app était déjà ouverte.

Les recettes ne sont jamais touchées par une mise à jour du code.

## Sauvegarde
Dans la console Firebase, ouvre **Firestore → recipes**. Pour une sauvegarde complète, demande à Claude d'exporter les recettes dans `data/recettes.json`.
