# Sauvegarde automatique dans Google Drive

Chaque nuit vers 3h, un script Google (Apps Script) recopie toutes les recettes dans ton Drive, sous forme de documents lisibles :

```
📁 Recettes de Charlotte – Sauvegarde
 ├── 📄 une fiche Google Docs par recette (exportable en Word : Fichier → Télécharger → .docx)
 ├── 📘 Livre de recettes (toutes les recettes)   ← sommaire + une recette par page
 └── 📁 Recettes supprimées                         ← les fiches des recettes supprimées de l'app (rien n'est effacé)
```

- Seules les fiches des recettes **modifiées** sont réécrites. Google Docs garde l'historique des versions (Fichier → Historique des versions).
- En cas d'erreur (mot de passe changé, par exemple), **Google t'envoie un e-mail** automatiquement.
- Le script se connecte à Firebase avec un **compte dédié en lecture seule** : il ne peut rien modifier dans l'app.

## Installation (environ 15 minutes, une seule fois)

### 1. Firebase : créer le compte de sauvegarde et mettre à jour les règles
1. Console Firebase → **Sécurité → Authentication → Utilisateurs → Ajouter un utilisateur**
   - E-mail : `ziyadakkar+sauvegarde@gmail.com` (c'est un alias de ton Gmail, aucune boîte à créer)
   - Mot de passe : un mot de passe long, que tu ne réutilises nulle part (garde-le pour l'étape 3)
2. **Firestore → Règles** : remplace le contenu par celui de `firestore.rules` (à la racine du dépôt), **en gardant la vraie adresse de Charlotte** à la place de `EMAIL_DE_CHARLOTTE@gmail.com`, puis **Publier**.

### 2. Google : créer le script
1. Va sur https://script.google.com (connecté avec ton compte Google) → **Nouveau projet**.
2. Renomme le projet (en haut à gauche) : `Sauvegarde recettes`.
3. Efface le contenu du fichier `Code.gs` et colle tout le contenu de `sauvegarde/Code.gs`. Enregistre (icône disquette).
4. **⚙️ Paramètres du projet** (menu de gauche) :
   - **Fuseau horaire** : `(GMT+01:00) Paris`
   - **Propriétés du script → Ajouter une propriété** (deux fois) :
     - `BACKUP_EMAIL` = `ziyadakkar+sauvegarde@gmail.com`
     - `BACKUP_PASSWORD` = le mot de passe de l'étape 1
   - **Enregistrer les propriétés du script**

### 3. Lancer l'installation
1. Retourne dans l'**Éditeur** (icône `< >`), choisis la fonction **`installer`** dans la liste en haut, puis **Exécuter**.
2. Google demande des autorisations : **Examiner les autorisations** → ton compte.
   - Message « Google n'a pas validé cette application » : c'est normal, c'est **ton** script. Clique sur **Paramètres avancés → Accéder à Sauvegarde recettes (non sécurisé)** → **Autoriser**.
3. Le journal d'exécution affiche par exemple `12 recettes · 12 créée(s) …` puis `Installation terminée`.
4. Vérifie dans ton Drive : le dossier **Recettes de Charlotte – Sauvegarde** est là.

C'est fini : la sauvegarde tourne seule chaque nuit. Pour en lancer une tout de suite, exécute la fonction **`sauvegarder`**.

## En cas de problème

| Message | Que faire |
|---|---|
| `Il manque BACKUP_EMAIL ou BACKUP_PASSWORD` | Étape 2.4 : vérifier les Propriétés du script |
| `Connexion à Firebase impossible … INVALID_LOGIN_CREDENTIALS` | Le mot de passe du compte de sauvegarde ne correspond pas : le corriger dans les Propriétés du script |
| `Lecture des recettes refusée (code 403)` | Les règles Firestore n'autorisent pas encore `ziyadakkar+sauvegarde@gmail.com` en lecture : étape 1.2 |
| Plus aucune mise à jour du dossier | Script Google → **Déclencheurs** (icône réveil) : vérifier qu'un déclencheur `sauvegarder` existe, sinon relancer `installer` |
