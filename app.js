// Les recettes de Charlotte — application web installable.
// Données : Firebase Firestore (collection « recipes »). Connexion : e-mail + mot de passe.
// Garder APP_VERSION identique à VERSION dans sw.js.
const APP_VERSION = '1.0.0';
const FIREBASE_VERSION = '10.12.2';
const DEFAULT_TAGS = ['Facile', 'Rapide', 'Facile medium', 'Médium'];

const app = document.getElementById('app');
const state = {
  backend: null, user: null, authReady: false,
  recipes: [], loaded: false, slow: false, error: null,
  q: '', tag: null, cat: null,
  checks: {},
  importing: false
};

// ---------------------------------------------------------------- helpers
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tagClass = t => 't-' + norm(t).replace(/[^a-z0-9]+/g, '-');
const slugify = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'recette';
function safeUrl(u) { try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : null; } catch (e) { return null; } }
function sourceLabel(u) { try { const h = new URL(u).hostname.replace(/^www\./, ''); if (h.includes('instagram')) return 'Instagram'; if (h.includes('youtu')) return 'YouTube'; if (h.includes('tiktok')) return 'TikTok'; if (h.includes('jow')) return 'Jow'; return h; } catch (e) { return 'Source'; } }
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200); }
function getChecks(id) { if (!state.checks[id]) state.checks[id] = { ing: new Set(), step: new Set() }; return state.checks[id]; }
const allCats = () => [...new Set(state.recipes.map(r => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
function allTags() { const s = new Set(DEFAULT_TAGS); state.recipes.forEach(r => (r.tags || []).forEach(t => s.add(t))); return [...s]; }
const findRecipe = id => state.recipes.find(r => r.id === id);
const footer = () => `<footer class="foot">Version ${APP_VERSION}${state.user ? ` · ${esc(state.user.email)} · <button id="logout">Se déconnecter</button>` : ''}</footer>`;

// ---------------------------------------------------------------- routing (#r-id, #ajouter, #modifier-id)
function route() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (h === 'ajouter') return { view: 'form', id: null };
  if (h.startsWith('modifier-')) return { view: 'form', id: h.slice(9) };
  if (h.startsWith('r-')) return { view: 'detail', id: h.slice(2) };
  return { view: 'list' };
}
function go(hash) {
  if (hash) location.hash = hash;
  else if (location.hash) history.pushState(null, '', location.pathname + location.search);
  render(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
window.addEventListener('popstate', () => render());

// ---------------------------------------------------------------- render
function render() {
  if (!state.backend) return;
  if (state.backend.notConfigured) return renderNotConfigured();
  if (!state.authReady) { app.innerHTML = `<div class="status">Chargement…</div>`; return; }
  if (!state.user) return renderLogin();
  const r = route();
  if (r.view === 'detail') return renderDetail(r.id);
  if (r.view === 'form') return renderForm(r.id);
  renderList();
}

function renderNotConfigured() {
  app.innerHTML = `<div class="login"><div class="emo">🛠️</div><h1>Presque prête</h1>
    <p class="hint">Il reste à renseigner les paramètres Firebase dans <code>firebase-config.js</code> (voir le README).</p></div>`;
}

function renderLogin(errMsg) {
  app.innerHTML = `
    <div class="login">
      <div class="emo">🍲</div>
      <h1>Les recettes de Charlotte</h1>
      <form id="loginForm" novalidate>
        <div class="row"><label for="email">E-mail</label><input type="text" inputmode="email" autocomplete="username" id="email"></div>
        <div class="row"><label for="pw">Mot de passe</label><input type="password" autocomplete="current-password" id="pw"></div>
        <div class="err" id="loginErr">${esc(errMsg || '')}</div>
        <div class="actions"><button class="btn" type="submit" id="loginBtn">Se connecter</button>
          <button class="btn ghost" type="button" id="forgot">Mot de passe oublié</button></div>
      </form>
    </div>` + footer();
  const err = document.getElementById('loginErr');
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    const email = document.getElementById('email').value.trim(), pw = document.getElementById('pw').value;
    if (!email || !pw) { err.textContent = 'Renseigne ton e-mail et ton mot de passe.'; return; }
    const btn = document.getElementById('loginBtn'); btn.disabled = true; btn.textContent = 'Connexion…';
    try { await state.backend.signIn(email, pw); }
    catch (ex) {
      btn.disabled = false; btn.textContent = 'Se connecter';
      const c = ex && ex.code || '';
      err.textContent = /invalid-credential|wrong-password|user-not-found|invalid-email/.test(c) ? 'E-mail ou mot de passe incorrect.'
        : /too-many-requests/.test(c) ? 'Trop de tentatives. Réessaie dans quelques minutes.'
        : /network/.test(c) ? 'Pas de connexion internet.' : 'Connexion impossible. Réessaie.';
    }
  });
  document.getElementById('forgot').onclick = async () => {
    const email = document.getElementById('email').value.trim();
    if (!email) { err.textContent = 'Écris d’abord ton e-mail, puis appuie sur « Mot de passe oublié ».'; return; }
    try { await state.backend.resetPassword(email); toast('E-mail de réinitialisation envoyé'); }
    catch (ex) { err.textContent = 'Envoi impossible. Vérifie l’adresse.'; }
  };
}

function bindFooter() { const b = document.getElementById('logout'); if (b) b.onclick = () => state.backend.signOut(); }

function renderList() {
  let html = `<header class="top"><h1>Les recettes de Charlotte<small>${state.recipes.length} recette${state.recipes.length > 1 ? 's' : ''}</small></h1>`
    + `<button class="btn" id="addBtn">＋ Ajouter</button></header>`;
  if (state.error) html += `<div class="banner">${esc(state.error)}</div>`;
  else if (state.slow && !state.loaded) html += `<div class="banner">Les recettes mettent du temps à arriver… vérifie ta connexion.</div>`;
  html += `<input class="search" id="q" type="search" placeholder="Rechercher une recette ou un ingrédient…" value="${esc(state.q)}">`;
  html += `<div class="chips"><button class="chip ${!state.tag && !state.cat ? 'on' : ''}" data-clear="1">Toutes</button>`;
  allTags().forEach(t => html += `<button class="chip ${state.tag === t ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`);
  const cats = allCats(); if (cats.length > 1) cats.forEach(c => html += `<button class="chip ${state.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`);
  html += `</div>`;

  if (!state.loaded && !state.error) html += `<div class="status">Chargement des recettes…</div>`;
  else {
    const q = norm(state.q);
    const list = state.recipes.filter(r => {
      if (state.tag && !(r.tags || []).includes(state.tag)) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (!q) return true;
      const hay = norm([r.name, r.category, (r.tags || []).join(' '), ...(r.groups || []).flatMap(g => [g.title, ...(g.items || [])])].join(' '));
      return q.split(/\s+/).every(w => hay.includes(w));
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (!state.recipes.length && state.loaded) {
      html += `<div class="empty">Aucune recette pour l'instant.<br><br><button class="btn" id="importBtn" ${state.importing ? 'disabled' : ''}>${state.importing ? 'Import en cours…' : 'Importer les recettes de départ'}</button></div>`;
    } else if (!list.length) html += `<div class="empty">Aucune recette ne correspond.</div>`;
    else html += `<div class="grid">` + list.map(r => `
      <button class="card" data-open="${esc(r.id)}">
        <div class="emo">${esc(r.emoji || '🍽️')}</div>
        <h3>${esc(r.name)}</h3>
        ${r.category ? `<div class="cat">${esc(r.category)}</div>` : ''}
        <div class="tags">${(r.tags || []).map(t => `<span class="tag ${tagClass(t)}">${esc(t)}</span>`).join('')}</div>
      </button>`).join('') + `</div>`;
  }
  app.innerHTML = html + footer();

  const qi = document.getElementById('q');
  qi.addEventListener('input', e => { state.q = e.target.value; const p = e.target.selectionStart; renderList(); const n = document.getElementById('q'); n.focus(); try { n.setSelectionRange(p, p); } catch (_) { } });
  document.getElementById('addBtn').onclick = () => go('ajouter');
  app.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => { const t = b.dataset.tag; state.tag = state.tag === t ? null : t; state.cat = null; renderList(); });
  app.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { const c = b.dataset.cat; state.cat = state.cat === c ? null : c; state.tag = null; renderList(); });
  app.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { state.tag = null; state.cat = null; renderList(); });
  app.querySelectorAll('[data-open]').forEach(b => b.onclick = () => go('r-' + b.dataset.open));
  const ib = document.getElementById('importBtn'); if (ib) ib.onclick = importSeed;
  bindFooter();
}

function renderDetail(id) {
  const r = findRecipe(id);
  if (!r) { if (state.loaded) return go(''); app.innerHTML = `<div class="status">Chargement…</div>`; return; }
  const c = getChecks(r.id);
  const src = r.source && safeUrl(r.source);
  let i = 0;
  const ing = (r.groups || []).map(g => `
    ${g.title ? `<h5>${esc(g.title)}</h5>` : ''}
    <ul class="check">${(g.items || []).map(it => { const k = i++; return `<li data-ing="${k}" class="${c.ing.has(k) ? 'done' : ''}"><span class="box">${c.ing.has(k) ? '✓' : ''}</span><span class="txt">${esc(it)}</span></li>`; }).join('')}</ul>`).join('');
  const steps = (r.steps || []).map((s, k) => `<li data-step="${k}" class="${c.step.has(k) ? 'done' : ''}"><span class="txt">${esc(s)}</span></li>`).join('');
  app.innerHTML = `
    <button class="back" id="back">← Toutes les recettes</button>
    <div class="detail-head">
      <div class="emo">${esc(r.emoji || '🍽️')}</div>
      <div><h2>${esc(r.name)}</h2>
        <div class="meta">${r.category ? `<span>${esc(r.category)}</span>` : ''}
          ${(r.tags || []).map(t => `<span class="tag ${tagClass(t)}">${esc(t)}</span>`).join('')}
          ${src ? `<a href="${esc(src)}" target="_blank" rel="noopener">Voir la source (${esc(sourceLabel(src))}) ↗</a>` : ''}</div></div>
    </div>
    <div class="cols">
      <div class="panel"><h4>🥕 Ingrédients</h4>${ing || '<p class="hint">Aucun ingrédient renseigné.</p>'}</div>
      <div class="panel"><h4>👩‍🍳 Préparation</h4><ol class="steps">${steps || '<p class="hint">Aucune étape renseignée.</p>'}</ol>
        <button class="reset" id="reset">Tout décocher</button></div>
    </div>
    ${r.notes ? `<div class="panel notes"><h4>💡 Notes</h4><div>${esc(r.notes).replace(/\n/g, '<br>')}</div></div>` : ''}
    <div class="actions"><button class="btn ghost" id="edit">Modifier</button><button class="btn danger" id="del">Supprimer</button></div>` + footer();
  document.getElementById('back').onclick = () => go('');
  app.querySelectorAll('[data-ing]').forEach(li => li.onclick = () => { const k = +li.dataset.ing; c.ing.has(k) ? c.ing.delete(k) : c.ing.add(k); renderDetail(id); });
  app.querySelectorAll('[data-step]').forEach(li => li.onclick = () => { const k = +li.dataset.step; c.step.has(k) ? c.step.delete(k) : c.step.add(k); renderDetail(id); });
  document.getElementById('reset').onclick = () => { c.ing.clear(); c.step.clear(); renderDetail(id); };
  document.getElementById('edit').onclick = () => go('modifier-' + r.id);
  document.getElementById('del').onclick = () => askDelete(r);
  bindFooter();
}

const groupsToText = groups => (groups || []).map(g => (g.title ? g.title + ' :\n' : '') + (g.items || []).join('\n')).join('\n\n');
function textToGroups(text) {
  const groups = []; let cur = { title: '', items: [] };
  String(text || '').split('\n').map(l => l.replace(/^\s*[-•*]\s*/, '').trim()).forEach(l => {
    if (!l) return;
    if (/:\s*$/.test(l) && l.length < 60) { if (cur.items.length || cur.title) groups.push(cur); cur = { title: l.replace(/\s*:\s*$/, ''), items: [] }; }
    else cur.items.push(l);
  });
  if (cur.items.length || cur.title) groups.push(cur);
  return groups;
}

let formDirty = false;
function renderForm(id) {
  const r = id ? findRecipe(id) : null;
  if (id && !r) { if (state.loaded) return go(''); app.innerHTML = `<div class="status">Chargement…</div>`; return; }
  formDirty = false;
  const sel = new Set(r ? (r.tags || []) : []);
  app.innerHTML = `
    <button class="back" id="back">← ${r ? 'Retour à la recette' : 'Toutes les recettes'}</button>
    <h1 style="margin:8px 0 18px">${r ? 'Modifier la recette' : 'Nouvelle recette'}</h1>
    <form id="f" class="panel" novalidate>
      <div class="row two">
        <div><label for="emoji">Emoji</label><input type="text" id="emoji" maxlength="12" value="${esc(r ? r.emoji : '🍽️')}"></div>
        <div><label for="name">Nom de la recette *</label><input type="text" id="name" value="${esc(r ? r.name : '')}" placeholder="Ex. Gratin dauphinois"></div>
      </div>
      <div class="row"><label for="cat">Catégorie</label>
        <input type="text" id="cat" list="cats" value="${esc(r ? r.category : 'Plat dîner')}" placeholder="Ex. Plat dîner, Dessert…">
        <datalist id="cats">${allCats().map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="row"><label>Étiquettes</label>
        <div class="chips" style="margin:0" id="tagPick">${allTags().map(t => `<button type="button" class="chip ${sel.has(t) ? 'on' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
      <div class="row"><label for="src">Lien source <span class="hint">(Instagram, YouTube, site…)</span></label>
        <input type="url" id="src" value="${esc(r ? r.source || '' : '')}" placeholder="https://…"></div>
      <div class="row"><label for="ing">Ingrédients <span class="hint">— un par ligne. Pour un sous-groupe, écris son titre suivi de « : » (ex. « Marinade : »).</span></label>
        <textarea id="ing" placeholder="400g de pâtes&#10;2 échalotes&#10;&#10;Sauce :&#10;25cL de crème">${esc(r ? groupsToText(r.groups) : '')}</textarea></div>
      <div class="row"><label for="steps">Préparation <span class="hint">— une étape par ligne.</span></label>
        <textarea id="steps" placeholder="Préchauffer le four à 200 degrés&#10;…">${esc(r ? (r.steps || []).join('\n') : '')}</textarea></div>
      <div class="row"><label for="notes">Notes</label><textarea id="notes" style="min-height:80px">${esc(r ? r.notes || '' : '')}</textarea></div>
      <div class="err" id="err"></div>
      <div class="actions"><button class="btn" type="submit" id="save">Enregistrer</button><button class="btn ghost" type="button" id="cancel">Annuler</button></div>
    </form>` + footer();
  const back = () => go(r ? 'r-' + r.id : '');
  document.getElementById('back').onclick = back;
  document.getElementById('cancel').onclick = back;
  document.getElementById('f').addEventListener('input', () => { formDirty = true; });
  app.querySelectorAll('#tagPick [data-t]').forEach(b => b.onclick = () => { const t = b.dataset.t; sel.has(t) ? sel.delete(t) : sel.add(t); b.classList.toggle('on'); formDirty = true; });
  document.getElementById('f').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('err'); err.textContent = '';
    const name = document.getElementById('name').value.trim();
    if (!name) { err.textContent = 'Donne un nom à la recette.'; return; }
    const srcRaw = document.getElementById('src').value.trim();
    if (srcRaw && !safeUrl(srcRaw)) { err.textContent = 'Le lien source doit commencer par https://'; return; }
    const now = new Date().toISOString();
    const data = {
      name, emoji: document.getElementById('emoji').value.trim() || '🍽️',
      category: document.getElementById('cat').value.trim(),
      tags: [...sel], source: srcRaw,
      groups: textToGroups(document.getElementById('ing').value),
      steps: document.getElementById('steps').value.split('\n').map(s => s.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean),
      notes: document.getElementById('notes').value.trim(),
      createdAt: r ? (r.createdAt || now) : now, updatedAt: now,
      origin: r ? (r.origin || 'app') : 'app',
      updatedBy: state.user.email
    };
    let newId = r ? r.id : slugify(name);
    if (!r && findRecipe(newId)) newId += '-' + Date.now().toString(36);
    const btn = document.getElementById('save'); btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      // Hors connexion, Firestore garde l'écriture et l'envoie au retour du réseau : on n'attend pas.
      const p = state.backend.save(newId, data);
      const res = await Promise.race([p.then(() => 'ok'), new Promise(res => setTimeout(() => res('pending'), 4000))]);
      formDirty = false;
      toast(res === 'pending' ? 'Enregistrée sur le téléphone, envoi dès le retour du réseau' : (r ? 'Recette mise à jour' : 'Recette ajoutée'));
      go('r-' + newId);
    } catch (ex) {
      btn.disabled = false; btn.textContent = 'Enregistrer';
      err.textContent = ex && ex.code === 'permission-denied' ? "Ce compte n'a pas le droit de modifier les recettes." : "L'enregistrement a échoué. Réessaie dans un instant.";
    }
  });
  bindFooter();
}

function askDelete(r) {
  const ov = document.getElementById('confirm');
  document.getElementById('confirmText').textContent = `Supprimer « ${r.name} » ? Cette action est définitive.`;
  ov.classList.add('show');
  const close = () => ov.classList.remove('show');
  document.getElementById('confirmNo').onclick = close;
  document.getElementById('confirmYes').onclick = async () => {
    close();
    try { state.backend.remove(r.id).catch(() => toast('La suppression a échoué')); go(''); toast('Recette supprimée'); }
    catch (ex) { toast('La suppression a échoué'); }
  };
}

async function importSeed() {
  state.importing = true; renderList();
  try {
    const res = await fetch('data/recettes.json', { cache: 'no-cache' });
    const list = await res.json();
    await state.backend.importAll(list);
    toast(`${list.length} recettes importées`);
  } catch (ex) {
    toast(ex && ex.code === 'permission-denied' ? "Ce compte n'a pas le droit d'importer." : "L'import a échoué");
  }
  state.importing = false; render();
}

// ---------------------------------------------------------------- Firebase backend
async function loadFirebase() {
  const { firebaseConfig } = await import('./firebase-config.js');
  if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('A_REMPLACER')) return { notConfigured: true };
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')
  ]);
  const fbApp = initializeApp(firebaseConfig);
  const auth = A.getAuth(fbApp);
  await A.setPersistence(auth, A.browserLocalPersistence).catch(() => { });
  let db;
  try { db = F.initializeFirestore(fbApp, { localCache: F.persistentLocalCache() }); }
  catch (e) { db = F.getFirestore(fbApp); }
  const col = F.collection(db, 'recipes');
  return {
    onAuth: cb => A.onAuthStateChanged(auth, u => cb(u ? { email: u.email, uid: u.uid } : null)),
    signIn: (e, p) => A.signInWithEmailAndPassword(auth, e, p),
    signOut: () => A.signOut(auth),
    resetPassword: e => A.sendPasswordResetEmail(auth, e),
    subscribe: (next, error) => F.onSnapshot(col, { includeMetadataChanges: true },
      snap => next(snap.docs.map(d => Object.assign({ id: d.id }, d.data())), snap.metadata.fromCache), error),
    save: (id, data) => F.setDoc(F.doc(db, 'recipes', id), data),
    remove: id => F.deleteDoc(F.doc(db, 'recipes', id)),
    importAll: async list => {
      const batch = F.writeBatch(db);
      list.forEach(r => { const { id, ...data } = r; batch.set(F.doc(db, 'recipes', id), data); });
      await batch.commit();
    }
  };
}

// ---------------------------------------------------------------- data subscription
let unsubscribe = null, slowTimer = null;
function startData() {
  stopData();
  state.loaded = false; state.slow = false; state.error = null;
  slowTimer = setTimeout(() => { if (!state.loaded) { state.slow = true; render(); } }, 10000);
  unsubscribe = state.backend.subscribe((list, fromCache) => {
    state.recipes = list;
    if (!fromCache || list.length) { state.loaded = true; state.slow = false; clearTimeout(slowTimer); }
    if (route().view !== 'form' || !formDirty) render();
  }, err => {
    clearTimeout(slowTimer); state.loaded = true;
    state.error = err && err.code === 'permission-denied'
      ? "Ce compte n'a pas accès aux recettes. Demande à Ziyad d'ajouter ton adresse."
      : 'Impossible de charger les recettes pour le moment.';
    render();
  });
}
function stopData() { if (unsubscribe) { unsubscribe(); unsubscribe = null; } clearTimeout(slowTimer); state.recipes = []; }

// ---------------------------------------------------------------- service worker & mises à jour
function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const banner = document.getElementById('update');
  let reloading = false;
  // Première installation : pas de rechargement. Mise à jour acceptée : on recharge pour l'appliquer.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController || reloading) return; reloading = true; location.reload(); });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const showBanner = worker => {
      banner.hidden = false;
      document.getElementById('updateBtn').onclick = () => worker.postMessage('skipWaiting');
    };
    if (reg.waiting && navigator.serviceWorker.controller) showBanner(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showBanner(w); });
    });
    // Vérifie s'il y a une nouvelle version à chaque retour sur l'app
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => { }); });
  }).catch(() => { });
}

// ---------------------------------------------------------------- démarrage
async function init() {
  setupServiceWorker();
  try { state.backend = window.__recettesBackend || await loadFirebase(); }
  catch (e) {
    app.innerHTML = `<div class="login"><div class="emo">📡</div><h1>Connexion impossible</h1><p class="hint">Vérifie ta connexion internet puis rouvre l'app.</p></div>`;
    return;
  }
  if (state.backend.notConfigured) return render();
  state.backend.onAuth(user => {
    state.user = user; state.authReady = true;
    if (user) startData(); else stopData();
    render();
  });
}
init();
