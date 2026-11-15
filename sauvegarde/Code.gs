/**
 * Sauvegarde automatique des recettes de Charlotte dans Google Drive.
 *
 * Chaque nuit, ce script :
 *   1. se connecte à Firebase avec le compte de sauvegarde (lecture seule) ;
 *   2. lit toutes les recettes ;
 *   3. met à jour, dans le dossier Drive « Recettes de Charlotte – Sauvegarde » :
 *      - un document Google Docs par recette (seulement celles qui ont changé),
 *      - le « Livre de recettes » qui les contient toutes, avec un sommaire ;
 *   4. déplace dans « Recettes supprimées » les documents des recettes supprimées de l'app
 *      (rien n'est jamais effacé du Drive).
 *
 * Installation : voir sauvegarde/README.md. En résumé :
 *   - Propriétés du script : BACKUP_EMAIL et BACKUP_PASSWORD (compte de sauvegarde Firebase) ;
 *   - exécuter une fois la fonction « installer ».
 */

// Paramètres publics du projet Firebase (les mêmes que dans l'app, ils ne sont pas secrets).
var FIREBASE_API_KEY = 'AIzaSyC4dY_nD_tl0blSBYiEuDK78vSCS3Vosqg';
var FIREBASE_PROJECT_ID = 'recettes-charlotte';

var NOM_DOSSIER = 'Recettes de Charlotte – Sauvegarde';
var NOM_DOSSIER_SUPPRIMEES = 'Recettes supprimées';
var NOM_LIVRE = 'Livre de recettes (toutes les recettes)';
var HEURE_SAUVEGARDE = 3; // 3h du matin
var PREFIXE = 'recette:'; // marqueur rangé dans la description de chaque document

// ============================================================ points d'entrée

/** À exécuter une seule fois : lance une première sauvegarde puis programme celle de chaque nuit. */
function installer() {
  verifierProprietes_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sauvegarder') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sauvegarder').timeBased().everyDays(1).atHour(HEURE_SAUVEGARDE).create();
  sauvegarder();
  Logger.log('Installation terminée : sauvegarde programmée chaque nuit vers ' + HEURE_SAUVEGARDE + 'h.');
}

/** La sauvegarde elle-même. Peut aussi être lancée à la main depuis l'éditeur. */
function sauvegarder() {
  verifierProprietes_();
  var recettes = lireRecettes_();
  var dossier = dossier_(NOM_DOSSIER, DriveApp.getRootFolder());
  var corbeille = dossier_(NOM_DOSSIER_SUPPRIMEES, dossier);

  // Documents déjà présents, repérés grâce à leur description « recette:<id>|<date de mise à jour> »
  var existants = {};
  var fichiers = dossier.getFilesByType(MimeType.GOOGLE_DOCS);
  while (fichiers.hasNext()) {
    var f = fichiers.next();
    var desc = f.getDescription() || '';
    if (desc.indexOf(PREFIXE) === 0) {
      var parts = desc.slice(PREFIXE.length).split('|');
      existants[parts[0]] = { fichier: f, version: parts[1] || '' };
    }
  }

  var crees = 0, maj = 0, supprimees = 0;
  recettes.forEach(function (r) {
    var version = r.updatedAt || r.createdAt || '';
    var titre = titreDocument_(r);
    var e = existants[r.id];
    if (!e) {
      var doc = DocumentApp.create(titre);
      remplirDocumentRecette_(doc.getBody(), r);
      doc.saveAndClose();
      var fichier = DriveApp.getFileById(doc.getId());
      fichier.moveTo(dossier);
      fichier.setDescription(PREFIXE + r.id + '|' + version);
      crees++;
    } else {
      if (e.version !== version) {
        var d = DocumentApp.openById(e.fichier.getId());
        d.getBody().clear();
        remplirDocumentRecette_(d.getBody(), r);
        d.saveAndClose();
        e.fichier.setDescription(PREFIXE + r.id + '|' + version);
        maj++;
      }
      if (e.fichier.getName() !== titre) e.fichier.setName(titre);
      delete existants[r.id];
    }
  });

  // Ce qui reste dans « existants » correspond à des recettes supprimées de l'app.
  Object.keys(existants).forEach(function (id) {
    existants[id].fichier.moveTo(corbeille);
    supprimees++;
  });

  var changement = crees + maj + supprimees > 0;
  var livre = livre_(dossier);
  if (changement || livre.nouveau) remplirLivre_(livre.doc, recettes);

  var resume = recettes.length + ' recettes · ' + crees + ' créée(s) · ' + maj + ' mise(s) à jour · ' +
    supprimees + ' supprimée(s)' + (changement || livre.nouveau ? ' · livre mis à jour' : ' · rien de nouveau');
  PropertiesService.getScriptProperties().setProperty('DERNIERE_SAUVEGARDE', new Date().toISOString() + ' — ' + resume);
  Logger.log(resume);
  return resume;
}

// ============================================================ Firebase

function verifierProprietes_() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('BACKUP_EMAIL') || !p.getProperty('BACKUP_PASSWORD')) {
    throw new Error('Il manque BACKUP_EMAIL ou BACKUP_PASSWORD dans les Propriétés du script (⚙️ Paramètres du projet).');
  }
}

function seConnecter_() {
  var p = PropertiesService.getScriptProperties();
  var rep = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FIREBASE_API_KEY, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ email: p.getProperty('BACKUP_EMAIL'), password: p.getProperty('BACKUP_PASSWORD'), returnSecureToken: true })
  });
  var json = JSON.parse(rep.getContentText() || '{}');
  if (rep.getResponseCode() !== 200 || !json.idToken) {
    var msg = json.error && json.error.message || ('code ' + rep.getResponseCode());
    throw new Error('Connexion à Firebase impossible avec le compte de sauvegarde (' + msg + '). Vérifie BACKUP_EMAIL et BACKUP_PASSWORD.');
  }
  return json.idToken;
}

function lireRecettes_() {
  var jeton = seConnecter_();
  var base = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents/recipes?pageSize=300';
  var recettes = [], pageToken = '';
  do {
    var rep = UrlFetchApp.fetch(base + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), {
      headers: { Authorization: 'Bearer ' + jeton }, muteHttpExceptions: true
    });
    if (rep.getResponseCode() !== 200) {
      throw new Error('Lecture des recettes refusée (code ' + rep.getResponseCode() + '). Vérifie que l’e-mail de sauvegarde est bien autorisé en lecture dans les règles Firestore. ' + rep.getContentText().slice(0, 300));
    }
    var json = JSON.parse(rep.getContentText() || '{}');
    (json.documents || []).forEach(function (d) {
      var r = depuisFirestore_({ mapValue: { fields: d.fields || {} } });
      r.id = d.name.split('/').pop();
      recettes.push(r);
    });
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  recettes.sort(function (a, b) {
    return (a.category || '').localeCompare(b.category || '', 'fr') || (a.name || '').localeCompare(b.name || '', 'fr');
  });
  return recettes;
}

/** Convertit le format de l'API Firestore ({stringValue: …}, {arrayValue: …}) en objet JavaScript simple. */
function depuisFirestore_(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(depuisFirestore_);
  if ('mapValue' in v) {
    var o = {}, f = v.mapValue.fields || {};
    Object.keys(f).forEach(function (k) { o[k] = depuisFirestore_(f[k]); });
    return o;
  }
  return null;
}

// ============================================================ Drive

function dossier_(nom, parent) {
  var it = parent.getFoldersByName(nom);
  return it.hasNext() ? it.next() : parent.createFolder(nom);
}

function livre_(dossier) {
  var it = dossier.getFilesByName(NOM_LIVRE);
  if (it.hasNext()) return { doc: DocumentApp.openById(it.next().getId()), nouveau: false };
  var doc = DocumentApp.create(NOM_LIVRE);
  DriveApp.getFileById(doc.getId()).moveTo(dossier);
  return { doc: doc, nouveau: true };
}

function titreDocument_(r) {
  return (r.name || 'Recette sans nom').replace(/[\/\\]/g, '-');
}

// ============================================================ mise en page

var COULEUR = '#C8553D';

/** Écrit une recette dans un corps de document (fiche seule ou page du livre). */
function ecrireRecette_(body, r, premiere) {
  var titre = (r.emoji ? r.emoji + ' ' : '') + (r.name || 'Recette sans nom');
  var h = premiere ? body.getParagraphs()[0] : body.appendParagraph('');
  h.setText(titre).setHeading(DocumentApp.ParagraphHeading.HEADING1);

  var infos = [];
  if (r.category) infos.push(r.category);
  if (r.tags && r.tags.length) infos.push(r.tags.join(' · '));
  if (infos.length) body.appendParagraph(infos.join('   |   ')).editAsText().setItalic(true).setForegroundColor('#7A6D64');

  if (r.source) {
    var p = body.appendParagraph('Source : ' + r.source);
    p.editAsText().setLinkUrl(9, 9 + r.source.length - 1, r.source);
  }

  body.appendParagraph('Ingrédients').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  var groupes = r.groups || [];
  if (!groupes.length) body.appendParagraph('—');
  groupes.forEach(function (g) {
    if (g.title) body.appendParagraph(g.title).setHeading(DocumentApp.ParagraphHeading.HEADING3);
    (g.items || []).forEach(function (it) {
      body.appendListItem(it).setGlyphType(DocumentApp.GlyphType.BULLET);
    });
  });

  body.appendParagraph('Préparation').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  var etapes = r.steps || [];
  if (!etapes.length) body.appendParagraph('—');
  etapes.forEach(function (s, i) {
    var p = body.appendParagraph((i + 1) + '.  ' + s);
    p.editAsText().setBold(0, String(i + 1).length, true).setForegroundColor(0, String(i + 1).length, COULEUR);
    p.setSpacingAfter(6);
  });

  if (r.notes) {
    body.appendParagraph('Notes').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(r.notes);
  }
}

function piedDePage_(body, r) {
  var dates = [];
  if (r.createdAt) dates.push('ajoutée le ' + dateFr_(r.createdAt));
  if (r.updatedAt) dates.push('modifiée le ' + dateFr_(r.updatedAt) + (r.updatedBy ? ' par ' + r.updatedBy.split('@')[0] : ''));
  if (dates.length) body.appendParagraph(dates.join(' · ')).editAsText().setFontSize(8).setForegroundColor('#A99C90');
}

function remplirDocumentRecette_(body, r) {
  ecrireRecette_(body, r, true);
  body.appendParagraph('');
  piedDePage_(body, r);
}

function remplirLivre_(doc, recettes) {
  var body = doc.getBody();
  body.clear();
  body.getParagraphs()[0].setText('Les recettes de Charlotte').setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('Sauvegarde du ' + dateFr_(new Date().toISOString()) + ' — ' + recettes.length + ' recette' + (recettes.length > 1 ? 's' : ''))
    .setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

  body.appendParagraph('Sommaire').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  var cat = null;
  recettes.forEach(function (r) {
    if ((r.category || 'Sans catégorie') !== cat) {
      cat = r.category || 'Sans catégorie';
      body.appendParagraph(cat).setHeading(DocumentApp.ParagraphHeading.HEADING3);
    }
    body.appendListItem((r.emoji ? r.emoji + ' ' : '') + r.name).setGlyphType(DocumentApp.GlyphType.BULLET);
  });

  recettes.forEach(function (r) {
    body.appendPageBreak();
    ecrireRecette_(body, r, false);
    piedDePage_(body, r);
  });
  doc.saveAndClose();
}

function dateFr_(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return iso;
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Europe/Paris', 'dd/MM/yyyy');
}
