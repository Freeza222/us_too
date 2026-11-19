import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase > Project Settings > API Keys (la clé publishable/anon est publique, c'est normal)
const SUPABASE_URL = 'https://njvatmicnmekplpkvppd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1A5R-PFEg8rN8lc5junI7Q_bbCIEbBB';

const APP = 'Stand by me';

// Ajoute des questions à la fin : celles déjà répondues sont enregistrées avec la réponse
const QUESTIONS = [
  "Quel est ton meilleur souvenir avec moi ?",
  "Qu'est-ce qui t'a fait sourire aujourd'hui ?",
  "Où aimerais-tu qu'on parte en voyage ensemble ?",
  "Quelle petite chose je fais qui te fait plaisir ?",
  "Quel est ton plat préféré que je cuisine (ou devrais cuisiner) ?",
  "Qu'est-ce que tu as pensé la première fois que tu m'as vu·e ?",
  "Quelle chanson te fait penser à nous ?",
  "Quel rêve aimerais-tu réaliser dans les 5 prochaines années ?",
  "De quoi es-tu fier·e cette semaine ?",
  "Quel serait notre rendez-vous parfait ?",
  "Qu'est-ce qui te stresse en ce moment ?",
  "Quelle habitude aimerais-tu qu'on prenne ensemble ?",
  "Quel film devrait-on regarder ensemble ?",
  "Qu'est-ce que tu préfères dans notre relation ?",
  "Si on gagnait au loto demain, on fait quoi ?",
  "Quel moment de ton enfance te rend nostalgique ?",
  "Qu'est-ce que je pourrais faire pour t'aider cette semaine ?",
  "Quelle est la chose la plus drôle qu'on ait vécue ensemble ?",
  "Quelle qualité admires-tu chez moi ?",
  "Comment imagines-tu notre vie dans 10 ans ?",
  "Quel petit plaisir t'a manqué récemment ?",
  "Quelle est ta saison préférée et pourquoi ?",
  "Qu'est-ce que tu aimerais apprendre ?",
  "Quel compliment aimerais-tu entendre plus souvent ?",
  "Quel endroit te fait te sentir chez toi ?",
  "Quelle est ta plus grande peur ?",
  "Quel serait ton week-end idéal ?",
  "Qu'est-ce qui te rend heureux·se en ce moment ?",
  "Quelle tradition aimerais-tu qu'on crée tous les deux ?",
  "Qu'est-ce que tu voudrais me dire mais n'as jamais osé ?",
];

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = document.getElementById('app');
const nav = document.querySelector('nav');

// État global de l'app
let couple = null;    // ligne "couples" une fois l'espace créé
let user = null;      // utilisateur courant (anonyme ou relié par email)
let view = 'jour';    // vue affichée : jour | souvenirs | nous
let channel = null;   // canal Supabase Realtime
let flashTimer = null;

const here = location.origin + location.pathname; // où revenir après un lien reçu par email
// Jour en heure de Paris au format AAAA-MM-JJ, comme la colonne "day" en base
const todayParis = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const questionFor = (day) => QUESTIONS[Math.floor(Date.parse(day) / 86400000) % QUESTIONS.length];

// Mini helper DOM : les strings deviennent des text nodes → pas d'injection HTML.
// Aplatit les tableaux de nodes et ignore null/false (branches de ternaires).
const h = (tag, props = {}, ...kids) => {
  const el = Object.assign(document.createElement(tag), props);
  const add = (n) => {
    if (n == null || n === false) return;
    if (Array.isArray(n)) { for (const c of n) add(c); return; }
    el.append(n);
  };
  for (const k of kids) add(k);
  return el;
};
const show = (...els) => app.replaceChildren(...els);
const card = (...kids) => h('div', { className: 'card' }, ...kids);
const fail = (e) => show(card(h('p', { className: 'eyebrow' }, 'Oups'), h('p', {}, e.message), btn('Réessayer', main)));
const btn = (label, fn, className = '') => h('button', { className, onclick: async (e) => {
  e.target.disabled = true;
  try { await fn(); } finally { e.target.disabled = false; }
} }, label);
const emailInput = () => h('input', { type: 'email', placeholder: 'ton@email.fr', autocomplete: 'email', ariaLabel: 'Ton email' });
const share = (code) => navigator.share
  ? navigator.share({ text: `Rejoins-moi sur ${APP} 💞 Code : ${code}\n${here}` }).catch(() => {})
  : navigator.clipboard.writeText(code).then(() => alert('Code copié !'));

const toast = (msg) => {
  const t = h('div', { className: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 4200);
};

// Prévenir même quand l'app est en fond : Notification si permission, sinon titre qui clignote
const alertes = (msg) => {
  navigator.vibrate?.([80, 40, 80]);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(`${APP} 💞`, { body: msg });
  } else {
    toast(msg);
    if (document.hidden) flashTitle();
  }
};
const stopFlash = () => { clearInterval(flashTimer); flashTimer = null; document.title = APP; };
const flashTitle = () => {
  if (flashTimer) return;
  let i = 0;
  flashTimer = setInterval(() => {
    document.title = (i++ % 2) ? '💞 Une réponse t’attend' : APP;
    if (i > 8) stopFlash();
  }, 900);
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && flashTimer) stopFlash(); });

// Quitter/dissoudre : couper le canal Realtime et repartir de zéro
async function resetSession() {
  if (channel) { try { await sb.removeChannel(channel); } catch { /* canal déjà fermé */ } }
  channel = null;
  couple = null;
}

// Barre d'onglets : afficher/masquer + marquer l'onglet actif
function setTabs(on, active = 'jour') {
  nav.hidden = !on;
  if (!on) return;
  for (const a of nav.querySelectorAll('a')) {
    a.getAttribute('href') === `#/${active}`
      ? a.setAttribute('aria-current', 'page')
      : a.removeAttribute('aria-current');
  }
}

// Routeur minimaliste : #/jour, #/souvenirs, #/nous
const route = () => {
  const name = location.hash.replace('#/', '').split('?')[0];
  view = ['souvenirs', 'nous'].includes(name) ? name : 'jour';
  setTabs(!!couple, view);
  if (view === 'souvenirs') return showSouvenirs();
  if (view === 'nous') return showNous();
  return showToday();
};
addEventListener('hashchange', () => { if (couple) route(); });

// Temps réel : un canal par couple
// ponytail: canal public (il faut connaître l'id du couple pour l'écouter). Canal privé Supabase si besoin.
function listen(c) {
  if (channel) return;
  channel = sb.channel(`couple-${c.id}`)
    // Le partenaire arrive ou part → tout se recharge
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${c.id}` }, (payload) => {
      if (payload.new.b === couple?.b) return;
      alertes(payload.new.b ? 'Ton/ta partenaire a rejoint 💞' : 'Ton/ta partenaire a quitté l’espace');
      main();
    })
    // Le partenaire a dissous l'espace (les DELETE ne sont pas filtrables : on compare l'id)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'couples' }, async (payload) => {
      if (payload.old?.id !== couple?.id) return;
      alertes('Votre espace a été dissous');
      await resetSession();
      main();
    })
    // "Je pense à toi" : bulle instantanée
    .on('broadcast', { event: 'nudge' }, () => alertes('Ton/ta partenaire pense à toi 💭'))
    // Le partenaire vient de répondre (la RLS me masque encore sa réponse) : c'est mon tour
    .on('broadcast', { event: 'answered' }, () => {
      if (document.activeElement === app.querySelector('textarea')) return toast('Ton/ta partenaire a répondu 💞');
      alertes('C’est ton tour ! Ton/ta partenaire a répondu 💞');
      if (view === 'jour') showToday();
    })
    // Nouvelle réponse que je peux voir (j'avais répondu en premier) : dévoilement en direct
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers', filter: `couple_id=eq.${c.id}` }, (payload) => {
      if (payload.new.user_id === user.id) return;
      if (document.hidden) alertes('Vos réponses du jour se sont dévoilées 💞');
      if (view === 'jour') showToday();
    })
    .subscribe();
}

async function main() {
  // Session existante (ou revenue d'un lien email), sinon compte anonyme lié au navigateur
  const { data: { session } } = await sb.auth.getSession();
  user = session?.user ?? null;
  if (!user) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) return fail(error);
    user = data.user;
  }

  const { data, error } = await sb.from('couples').select('id, code, a, b').limit(1);
  if (error) return fail(error);
  couple = data[0] ?? null;

  if (!couple) { setTabs(false); return showPairing(); }
  listen(couple);
  route();
}

function showPairing() {
  const code = h('input', { className: 'code-input', placeholder: 'ABC123', maxLength: 6, autocomplete: 'off', ariaLabel: 'Code du partenaire' });
  const email = emailInput();
  show(
    card(
      h('p', { className: 'eyebrow' }, 'Bienvenue'),
      h('p', { className: 'question' }, 'Une question par jour, rien que pour vous deux.'),
      h('p', { className: 'hint' }, 'Vous répondez chacun de votre côté, et la réponse de l\'autre se dévoile quand vous avez répondu.'),
      btn('Créer notre espace', async () => {
        const { error } = await sb.from('couples').insert({ a: user.id });
        error ? alert(error.message) : main();
      }),
    ),
    card(
      h('p', { className: 'eyebrow' }, 'Tu as reçu un code ?'),
      code,
      btn('Rejoindre', async () => {
        const { data, error } = await sb.rpc('join_couple', { c: code.value.trim() });
        if (error || !data) return alert(error?.message ?? 'Code invalide ou déjà utilisé');
        main();
      }),
    ),
    card(
      h('p', { className: 'eyebrow' }, 'Déjà un compte ?'),
      h('p', { className: 'hint' }, 'Nouveau téléphone ou navigateur vidé ? Si tu avais lié ton email (onglet Nous), reçois un lien pour retrouver ton espace et vos souvenirs.'),
      email,
      btn('Recevoir le lien', async () => {
        if (!email.value.trim()) return email.focus();
        const { error } = await sb.auth.signInWithOtp({
          email: email.value.trim(),
          options: { shouldCreateUser: false, emailRedirectTo: here },
        });
        if (error) return alert(/signups not allowed/i.test(error.message) ? 'Aucun compte lié à cet email' : error.message);
        alert('Lien envoyé 💌 Ouvre-le sur cet appareil.');
      }),
    ),
  );
}

function showWaiting() {
  show(card(
    h('p', { className: 'eyebrow' }, 'Presque prêt'),
    h('p', { className: 'question' }, 'Envoie ce code à ton/ta partenaire'),
    h('p', { className: 'code' }, couple.code),
    btn('Partager le code', () => share(couple.code)),
    btn('J\'ai envoyé, actualiser', main, 'ghost'),
  ));
}

async function showToday() {
  if (!couple.b) return showWaiting();
  const today = todayParis();
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

  const { data: answers, error } = await sb.from('answers')
    .select('user_id, question, text').eq('couple_id', couple.id).eq('day', today);
  if (error) return fail(error);

  const mine = answers.find((a) => a.user_id === user.id);
  const theirs = answers.find((a) => a.user_id !== user.id);
  const question = mine?.question ?? questionFor(today);
  const head = [h('p', { className: 'eyebrow' }, dateLabel), h('p', { className: 'question' }, question)];
  const nudge = btn('Je pense à toi 💭', async () => {
    await channel.send({ type: 'broadcast', event: 'nudge', payload: {} });
    toast('Envoyé 💞');
  }, 'ghost');

  if (!mine) {
    const ta = h('textarea', { placeholder: 'Écris ta réponse…', maxLength: 2000, ariaLabel: 'Ta réponse' });
    return show(card(
      ...head, ta,
      btn('Envoyer 💌', async () => {
        if (!ta.value.trim()) return ta.focus();
        const { error } = await sb.from('answers').insert({ couple_id: couple.id, question, text: ta.value.trim() });
        if (error) return alert(error.message);
        channel.send({ type: 'broadcast', event: 'answered', payload: {} });
        showToday();
      }),
      h('p', { className: 'label' }, 'Ton/ta partenaire'),
      h('div', { className: 'bubble locked' }, '🔒 Sa réponse se dévoile quand tu as répondu'),
      nudge,
    ));
  }

  show(card(
    ...head,
    h('p', { className: 'label me' }, 'Toi'),
    h('div', { className: 'bubble mine' }, mine.text),
    h('p', { className: 'label' }, 'Ton/ta partenaire'),
    theirs
      ? h('div', { className: 'bubble theirs' }, theirs.text)
      : h('div', { className: 'bubble locked' }, '⏳ Pas encore répondu…'),
    theirs
      ? h('p', { className: 'both' }, 'Vous avez répondu tous les deux 💞')
      : btn('Actualiser', showToday, 'ghost'),
    nudge,
  ));
}

async function showSouvenirs() {
  // La RLS ne renvoie que les jours où tu as répondu : leur réponse d'un jour sans la tienne reste secrète
  // ponytail: 120 dernières réponses (~2 mois), pagination si l'historique grossit
  const { data, error } = await sb.from('answers')
    .select('user_id, day, question, text').eq('couple_id', couple.id)
    .order('day', { ascending: false }).limit(120);
  if (error) return fail(error);

  const days = [];
  for (const row of data) {
    let d = days.at(-1);
    if (!d || d.day !== row.day) { d = { day: row.day, question: null, mine: null, theirs: null }; days.push(d); }
    d.question ??= row.question;
    if (row.user_id === user.id) d.mine = row.text; else d.theirs = row.text;
  }

  if (!days.length) return show(card(
    h('p', { className: 'eyebrow' }, 'Nos souvenirs'),
    h('p', { className: 'hint' }, 'Pas encore de souvenirs : réponds à la question du jour, ils apparaîtront ici.'),
  ));

  show(...days.map((d) => card(
    h('p', { className: 'eyebrow' }, new Date(d.day + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })),
    h('p', { className: 'question' }, d.question ?? questionFor(d.day)), // anciennes réponses sans question enregistrée
    d.mine && [h('p', { className: 'label me' }, 'Toi'), h('div', { className: 'bubble mine' }, d.mine)],
    h('p', { className: 'label' }, 'Ton/ta partenaire'),
    d.theirs
      ? h('div', { className: 'bubble theirs' }, d.theirs)
      : h('div', { className: 'bubble locked' }, 'Pas de réponse ce jour-là'),
  )));
}

function showNous() {
  const cards = [];

  // Notre espace
  cards.push(card(
    h('p', { className: 'eyebrow' }, 'Notre espace'),
    couple.b
      ? h('p', { className: 'hint' }, 'Votre espace est complet, les réponses se dévoilent à deux.')
      : [
          h('p', { className: 'hint' }, 'En attente de ton/ta partenaire. Partage ce code pour l’inviter.'),
          h('p', { className: 'code' }, couple.code),
          btn('Partager le code', () => share(couple.code)),
        ],
  ));

  // Email : seul moyen de retrouver sa place sur un autre appareil
  const security = card(h('p', { className: 'eyebrow' }, 'Sécuriser nos souvenirs'));
  if (user.is_anonymous) {
    const email = emailInput();
    security.append(
      h('p', { className: 'hint' }, 'Ton compte vit dans ce navigateur : s’il est vidé, tu perds ta place. Lie ton email pour pouvoir te reconnecter depuis n’importe quel appareil.'),
      email,
      btn('Lier mon email', async () => {
        if (!email.value.trim()) return email.focus();
        const { error } = await sb.auth.updateUser({ email: email.value.trim() }, { emailRedirectTo: here });
        if (error) return alert(error.message);
        alert('Clique sur le lien reçu par email pour confirmer 💌');
      }),
    );
  } else {
    security.append(h('p', { className: 'hint' }, `Compte relié à ${user.email} ✓ Sur un autre appareil : écran d’accueil → « Déjà un compte ? ».`));
  }
  cards.push(security);

  // Notifications
  cards.push(card(
    h('p', { className: 'eyebrow' }, 'Alertes'),
    h('p', { className: 'hint' }, 'Sois prévenu·e quand ton/ta partenaire pense à toi ou a répondu (quand l’app est ouverte).'),
    btn('Activer les notifications', async () => {
      if (!('Notification' in window)) return toast('Notifications non supportées par ce navigateur');
      const p = await Notification.requestPermission();
      toast(p === 'granted' ? 'Notifications activées 💞' : 'Notifications refusées');
    }),
  ));

  cards.push(card(
    h('p', { className: 'eyebrow' }, 'Bientôt'),
    h('p', { className: 'hint' }, 'Questions personnalisées · Petites statistiques douces · Lettres à ouvrir plus tard…'),
  ));

  // Quitter : l'espace reste à l'autre ; Dissoudre : tout est supprimé
  const leave = async (rpc, question) => {
    if (!confirm(question)) return;
    await resetSession();
    const { error } = await sb.rpc(rpc);
    if (error) alert(error.message);
    main();
  };
  cards.push(card(
    h('p', { className: 'eyebrow' }, 'Session'),
    h('p', { className: 'hint' }, couple.b
      ? 'Partir de cet espace ? Il restera à ton/ta partenaire, avec toutes vos réponses.'
      : 'Abandonner cet espace le supprimera (il n’a pas encore de partenaire).'),
    btn('Quitter l’espace', () => leave('leave_couple', 'Quitter cet espace ?'), 'ghost danger'),
    couple.b && btn('Dissoudre (tout supprimer)', () => leave('dissolve_couple', 'Supprimer définitivement l’espace et toutes vos réponses ? Action irréversible.'), 'ghost danger'),
  ));

  show(...cards);
}

main().catch(fail);
