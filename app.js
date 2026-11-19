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

// Mode devine 🎯 (le dimanche) : chacun répond pour soi ET devine la réponse de l'autre
const DEVINE = [
  "Quel est ton plat préféré en ce moment ?",
  "Quelle chanson tu écoutes en boucle ces temps-ci ?",
  "Dans quel pays rêves-tu de partir ?",
  "Que ferais-tu d'une journée entière sans obligations ?",
  "Quel est ton film réconfort ?",
  "Quelle est ta plus grande peur un peu ridicule ?",
  "Quel super-pouvoir choisirais-tu ?",
  "Quel est ton moment préféré de la journée ?",
  "Quel animal serais-tu ?",
  "Quel est ton dessert préféré ?",
  "Qu'est-ce qui te met de bonne humeur instantanément ?",
  "Quel métier aurais-tu aimé faire, enfant ?",
  "Quel est ton plus beau souvenir de vacances ?",
  "Quelle est la chose que tu ne pourrais jamais manger ?",
  "Quel est ton emoji le plus utilisé ?",
];
const isGuessDay = (day) => new Date(day + 'T12:00:00Z').getUTCDay() === 0;
const guessFor = (day) => DEVINE[Math.floor(Date.parse(day) / 864e5 / 7) % DEVINE.length];

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = document.getElementById('app');
const nav = document.querySelector('nav');

// État global de l'app
let couple = null;    // ligne "couples" une fois l'espace créé
let user = null;      // utilisateur courant (anonyme ou relié par email)
let view = 'jour';    // vue affichée : jour | souvenirs | nous
let channel = null;   // canal Supabase Realtime
let flashTimer = null;
let stats = { streak: 0, best: 0, total: 0, today: false }; // série 🔥 et jours à deux (couple_stats)

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
// Code reçu par email, tapé dans l'app : marche aussi dans l'app installée sur l'écran d'accueil
// (un lien, lui, s'ouvrirait dans le navigateur, qui ne partage pas la connexion avec l'app)
const codeStep = (parent, email, type) => {
  parent.querySelector('.otp')?.remove();
  const code = h('input', { className: 'code-input', inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 10, placeholder: '123456', ariaLabel: 'Code reçu par email' });
  parent.append(h('div', { className: 'otp' },
    h('p', { className: 'hint' }, `Code envoyé à ${email} 💌 (regarde aussi les spams)`),
    code,
    btn('Valider le code', async () => {
      const { error } = await sb.auth.verifyOtp({ email, token: code.value.trim(), type });
      if (error) return alert('Code invalide ou expiré');
      main();
    }),
  ));
  code.focus();
};
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

// Série et jours à deux, calculés par la base. Annonce les tenues débloquées depuis la dernière visite.
async function loadStats() {
  const { data } = await sb.rpc('couple_stats');
  if (!data) return;
  stats = data;
  let vu = null;
  try { vu = localStorage.getItem('sbm-jours'); localStorage.setItem('sbm-jours', stats.total); } catch { /* stockage indisponible */ }
  if (vu === null) return;
  for (const t of TENUES()) {
    if (t.jours > +vu && t.jours <= stats.total) toast(`Nouvelle tenue débloquée : ${t.nom} ${t.icone}`);
  }
}

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
  nav.querySelector('[href="#/animal"]').textContent = `🐾 ${couple.pet_name}`;
  for (const a of nav.querySelectorAll('a')) {
    a.getAttribute('href') === `#/${active}`
      ? a.setAttribute('aria-current', 'page')
      : a.removeAttribute('aria-current');
  }
}

// Routeur minimaliste : #/jour, #/souvenirs, #/animal, #/nous
const route = () => {
  const name = location.hash.replace('#/', '').split('?')[0];
  view = ['souvenirs', 'animal', 'nous'].includes(name) ? name : 'jour';
  setTabs(!!couple, view);
  if (view === 'souvenirs') return showSouvenirs();
  if (view === 'animal') return loadStats().then(showPet);
  if (view === 'nous') return showNous();
  return showToday();
};
addEventListener('hashchange', () => { if (couple) route(); });

// Temps réel : un canal par couple
// ponytail: canal public (il faut connaître l'id du couple pour l'écouter). Canal privé Supabase si besoin.
function listen(c) {
  if (channel) return;
  channel = sb.channel(`couple-${c.id}`)
    // Le partenaire arrive/part (→ tout se recharge) ou s'occupe de l'animal (→ mise à jour en direct)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${c.id}` }, ({ new: n }) => {
      if (!couple) return;
      if (n.b !== couple.b) {
        alertes(n.b ? 'Ton/ta partenaire a rejoint 💞' : 'Ton/ta partenaire a quitté l’espace');
        return main();
      }
      // Soins faits par l'autre → petite bulle
      for (const [act, soin] of Object.entries(SOINS)) {
        for (const [uid, at] of Object.entries(n.pet_care?.[act] ?? {})) {
          if (uid !== user.id && at !== couple.pet_care?.[act]?.[uid]) toast(`Ton/ta partenaire ${soin.fait} ${n.pet_name} ${soin.icone}`);
        }
      }
      Object.assign(couple, n);
      setTabs(true, view);
      if (view === 'animal' && !app.contains(document.activeElement)) showPet();
    })
    // Le partenaire a dissous l'espace (les DELETE ne sont pas filtrables : on compare l'id)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'couples' }, async (payload) => {
      if (payload.old?.id !== couple?.id) return;
      alertes('Votre espace a été dissous');
      await resetSession();
      main();
    })
    // Mode devine : l'autre a donné son verdict sur ta devinette
    .on('broadcast', { event: 'judged' }, ({ payload }) => {
      toast(payload?.ok ? 'Ton/ta partenaire dit que tu as bien deviné 🎯' : 'Raté pour cette fois 😅 Regarde sa réponse !');
      if (view === 'jour') showToday();
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
  // Email confirmé ailleurs (lien ouvert dans le navigateur) : on récupère le compte à jour
  if (user?.is_anonymous) {
    const { data } = await sb.auth.refreshSession();
    if (data?.user) user = data.user;
  }
  if (!user) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) return fail(error);
    user = data.user;
  }

  const { data, error } = await sb.from('couples').select('*').limit(1);
  if (error) return fail(error);
  couple = data[0] ?? null;

  if (!couple) { setTabs(false); return showPairing(); }
  listen(couple);
  route();
}

function showPairing() {
  const code = h('input', { className: 'code-input', placeholder: 'ABC123', maxLength: 6, autocomplete: 'off', ariaLabel: 'Code du partenaire' });
  const email = emailInput();
  const login = card();
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
    login,
  );
  login.append(
      h('p', { className: 'eyebrow' }, 'Déjà un compte ?'),
      h('p', { className: 'hint' }, 'Nouveau téléphone ou navigateur vidé ? Si tu avais lié ton email (onglet Nous), reçois un code pour retrouver ton espace et vos souvenirs.'),
      email,
      btn('Recevoir le code', async () => {
        if (!email.value.trim()) return email.focus();
        const { error } = await sb.auth.signInWithOtp({
          email: email.value.trim(),
          options: { shouldCreateUser: false, emailRedirectTo: here },
        });
        if (error) return alert(/signups not allowed/i.test(error.message) ? 'Aucun compte lié à cet email' : error.message);
        codeStep(login, email.value.trim(), 'email');
      }),
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
  const devine = isGuessDay(today);
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

  const [{ data: answers, error }] = await Promise.all([
    sb.from('answers').select('user_id, question, text, guess, guess_ok').eq('couple_id', couple.id).eq('day', today),
    loadStats(),
  ]);
  if (error) return fail(error);

  const mine = answers.find((a) => a.user_id === user.id);
  const theirs = answers.find((a) => a.user_id !== user.id);

  // Question du jour : celle de ta réponse si tu as déjà répondu ; sinon dimanche → mode devine,
  // sinon une de vos questions perso (tirée côté base, la même pour vous deux), sinon celle de l'app
  let perso = null;
  if (!mine && !devine) {
    const { data } = await sb.rpc('todays_custom');
    if (data?.text) perso = data;
  }
  const question = mine?.question ?? (devine ? guessFor(today) : perso?.text ?? questionFor(today));
  const n = stats.streak;
  const head = [
    h('p', { className: 'eyebrow' }, dateLabel),
    n > 0 && h('p', { className: 'streak' }, `🔥 ${n} jour${n > 1 ? 's' : ''} d’affilée`,
      stats.today ? null : h('small', {}, 'Répondez tous les deux aujourd’hui pour la garder')),
    (devine || mine?.guess) && h('p', { className: 'tag' }, mine ? '🎯 Mode devine' : '🎯 Mode devine : réponds pour toi, puis devine sa réponse'),
    perso && h('p', { className: 'tag' }, perso.author === user.id ? '💌 Ta question' : '💌 Une question de ton/ta partenaire'),
    h('p', { className: 'question' }, question),
  ];
  const nudge = btn('Je pense à toi 💭', async () => {
    await channel.send({ type: 'broadcast', event: 'nudge', payload: {} });
    toast('Envoyé 💞');
  }, 'ghost');

  if (!mine) {
    const ta = h('textarea', { placeholder: 'Écris ta réponse…', maxLength: 2000, ariaLabel: 'Ta réponse' });
    const devinette = devine && h('textarea', { placeholder: 'Et selon toi, que va répondre ton/ta partenaire ?', maxLength: 2000, ariaLabel: 'Ta devinette' });
    return show(card(
      ...head, ta,
      devinette && [h('p', { className: 'label' }, '🎯 Ta devinette'), devinette],
      btn('Envoyer 💌', async () => {
        if (!ta.value.trim()) return ta.focus();
        if (devinette && !devinette.value.trim()) return devinette.focus();
        const { error } = await sb.from('answers').insert({
          couple_id: couple.id, question, text: ta.value.trim(), guess: devinette ? devinette.value.trim() : null,
        });
        if (error) return alert(error.message);
        channel.send({ type: 'broadcast', event: 'answered', payload: {} });
        showToday();
      }),
      h('p', { className: 'label' }, 'Ton/ta partenaire'),
      h('div', { className: 'bubble locked' }, '🔒 Sa réponse se dévoile quand tu as répondu'),
      nudge,
    ));
  }

  // Mode devine : chacun dit si l'autre a bien deviné sa réponse
  const verdict = (ok) => ok === true ? '🎯 Bien deviné !' : ok === false ? '😅 Raté' : '⏳ En attente de son verdict';
  const juger = (ok) => async () => {
    const { error } = await sb.rpc('judge_guess', { d: today, ok });
    if (error) return alert(error.message);
    channel.send({ type: 'broadcast', event: 'judged', payload: { ok } });
    showToday();
  };

  show(card(
    ...head,
    h('p', { className: 'label me' }, 'Toi'),
    h('div', { className: 'bubble mine' }, mine.text),
    h('p', { className: 'label' }, 'Ton/ta partenaire'),
    theirs
      ? h('div', { className: 'bubble theirs' }, theirs.text)
      : h('div', { className: 'bubble locked' }, '⏳ Pas encore répondu…'),
    theirs?.guess && h('div', { className: 'guess' },
      h('p', { className: 'label' }, '🎯 Il/elle pensait que tu répondrais'),
      h('div', { className: 'bubble theirs' }, theirs.guess),
      theirs.guess_ok == null
        ? [h('p', { className: 'hint center' }, 'A-t-il/elle bien deviné ?'),
           h('div', { className: 'row' }, btn('🎯 Bien vu', juger(true)), btn('😅 Raté', juger(false), 'ghost'))]
        : h('p', { className: 'verdict' }, verdict(theirs.guess_ok)),
    ),
    mine.guess && h('div', { className: 'guess' },
      h('p', { className: 'label me' }, '🎯 Tu pensais qu’il/elle répondrait'),
      h('div', { className: 'bubble mine' }, mine.guess),
      theirs && h('p', { className: 'verdict me' }, verdict(mine.guess_ok)),
    ),
    theirs
      ? h('p', { className: 'both' }, 'Vous avez répondu tous les deux 💞')
      : btn('Actualiser', showToday, 'ghost'),
    nudge,
  ));
}

async function showSouvenirs() {
  // La RLS ne renvoie que les jours où tu as répondu : leur réponse d'un jour sans la tienne reste secrète
  // ponytail: 120 dernières réponses (~2 mois), pagination si l'historique grossit
  const [{ data, error }] = await Promise.all([
    sb.from('answers').select('user_id, day, question, text, guess, guess_ok').eq('couple_id', couple.id)
      .order('day', { ascending: false }).limit(120),
    loadStats(),
  ]);
  if (error) return fail(error);

  const days = [];
  for (const row of data) {
    let d = days.at(-1);
    if (!d || d.day !== row.day) { d = { day: row.day, question: null, mine: null, theirs: null }; days.push(d); }
    d.question ??= row.question;
    if (row.user_id === user.id) d.mine = row; else d.theirs = row;
  }

  // Score du mode devine : chacun marque quand l'autre valide sa devinette
  const pts = (moi) => data.filter((r) => (r.user_id === user.id) === moi && r.guess_ok).length;
  const moiPts = pts(true), luiPts = pts(false);
  const stat = (icone, valeur, label) => h('div', { className: 'stat' }, h('strong', {}, `${icone} ${valeur}`), h('span', {}, label));
  const resume = card(
    h('p', { className: 'eyebrow' }, 'Nous deux'),
    h('div', { className: 'stats' },
      stat('🔥', stats.streak, 'jours d’affilée'),
      stat('🏆', stats.best, 'record'),
      stat('💞', stats.total, 'jours à deux'),
    ),
    (moiPts > 0 || luiPts > 0) && h('p', { className: 'hint center' }, `🎯 Mode devine : toi ${moiPts} · ton/ta partenaire ${luiPts}`),
  );

  if (!days.length) return show(resume, card(
    h('p', { className: 'eyebrow' }, 'Nos souvenirs'),
    h('p', { className: 'hint' }, 'Pas encore de souvenirs : réponds à la question du jour, ils apparaîtront ici.'),
  ));

  const devinette = (row, qui) => row?.guess && h('p', { className: 'guess-line' },
    `🎯 ${qui} « ${row.guess} »`, row.guess_ok === true ? ' ✅' : row.guess_ok === false ? ' ❌' : '');

  show(resume, ...days.map((d) => card(
    h('p', { className: 'eyebrow' }, new Date(d.day + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })),
    h('p', { className: 'question' }, d.question ?? questionFor(d.day)), // anciennes réponses sans question enregistrée
    d.mine && [h('p', { className: 'label me' }, 'Toi'), h('div', { className: 'bubble mine' }, d.mine.text)],
    h('p', { className: 'label' }, 'Ton/ta partenaire'),
    d.theirs
      ? h('div', { className: 'bubble theirs' }, d.theirs.text)
      : h('div', { className: 'bubble locked' }, 'Pas de réponse ce jour-là'),
    devinette(d.mine, 'Tu pensais :'),
    d.theirs && devinette(d.theirs, 'Il/elle pensait :'),
  )));
}

// ───────────── Compagnon partagé ─────────────
// Dessiné en SVG (pareil sur tous les téléphones). Toutes les valeurs passent par des listes
// fermées ci-dessous : rien de ce qui vient de la base n'est injecté tel quel dans le SVG.

const ESPECES = {
  chat:    { nom: 'Chat',    fur: '#F6A04D', belly: '#FFE6C7', ears: 'pointy', tail: 'long',  extra: 'stripes' },
  chien:   { nom: 'Chien',   fur: '#E9C79F', belly: '#FFF5E8', ears: 'floppy', tail: 'curl',  extra: 'muzzle', ear: '#A0704F' },
  lapin:   { nom: 'Lapin',   fur: '#ECEBF2', belly: '#FFFFFF', ears: 'long',   tail: 'puff' },
  renard:  { nom: 'Renard',  fur: '#F07A3A', belly: '#FFF4EA', ears: 'pointy', tail: 'bushy', extra: 'fox', tip: '#4A2E2A' },
  panda:   { nom: 'Panda',   fur: '#FAFAFB', belly: '#FFFFFF', ears: 'round',  tail: 'nub',   extra: 'panda', dark: '#3A3842' },
  ours:    { nom: 'Ourson',  fur: '#A9744F', belly: '#E9CBA8', ears: 'round',  tail: 'nub',   extra: 'muzzle' },
  hamster: { nom: 'Hamster', fur: '#F4C27A', belly: '#FFF3DE', ears: 'small',  tail: 'none',  extra: 'cheeks' },
};
const COULEURS = {
  '':     { nom: 'Naturel' },
  roux:   { nom: 'Roux',   fur: '#F6A04D', belly: '#FFE6C7' },
  creme:  { nom: 'Crème',  fur: '#F1DEC2', belly: '#FFF7EC' },
  gris:   { nom: 'Gris',   fur: '#B8BCC9', belly: '#EEF0F6' },
  brun:   { nom: 'Brun',   fur: '#9C6B4A', belly: '#E6C7A3' },
  nuit:   { nom: 'Nuit',   fur: '#4B4655', belly: '#8F889B' },
  rose:   { nom: 'Rose',   fur: '#F6B3C7', belly: '#FFE7EF' },
  ciel:   { nom: 'Ciel',   fur: '#A9C8F0', belly: '#E8F1FF' },
  menthe: { nom: 'Menthe', fur: '#A6DEC6', belly: '#E9FAF2' },
};

const pick = (obj, key) => (Object.hasOwn(obj, key ?? '') ? obj[key ?? ''] : null);
const INK = '#3A2631';
const TENUES = () => [TETE, YEUX, CORPS].flatMap((liste) => Object.values(liste).filter(Boolean));               // contours et traits du visage
const LINE = 'stroke="#3A263126" stroke-width="2.5"';

// Tenues : une fonction par objet, qui renvoie le SVG à superposer (coordonnées du dessin 200×210)
const TETE = {
  '': null,
  'haut-de-forme': { icone: '🎩', jours: 14, nom: 'Haut-de-forme', svg: () => `<g transform="rotate(-8 100 40)">
    <ellipse cx="100" cy="42" rx="34" ry="7" fill="#2E2A36"/>
    <rect x="78" y="6" width="44" height="36" rx="5" fill="#2E2A36"/>
    <rect x="78" y="30" width="44" height="7" fill="#E5457E"/></g>` },
  couronne: { icone: '👑', jours: 30, nom: 'Couronne', svg: () => `
    <path d="M73 46 L75 16 L89 31 L100 10 L111 31 L125 16 L127 46 Z" fill="#FFC93C" stroke="#E2A400" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="100" cy="36" r="4.5" fill="#E5457E"/><circle cx="84" cy="39" r="3" fill="#5AA9E6"/><circle cx="116" cy="39" r="3" fill="#5AA9E6"/>` },
  casquette: { icone: '🧢', jours: 3, nom: 'Casquette', svg: () => `
    <path d="M56 50 Q58 12 100 11 Q142 12 144 50 Z" fill="#5AA9E6"/>
    <path d="M118 44 Q156 38 172 50 Q150 60 118 54 Z" fill="#3D8BD0"/>
    <circle cx="100" cy="12" r="5" fill="#3D8BD0"/>` },
  bonnet: { icone: '🧶', jours: 7, nom: 'Bonnet', svg: () => `
    <path d="M54 54 Q56 8 100 8 Q144 8 146 54 Z" fill="#F36B9A"/>
    <rect x="50" y="44" width="100" height="15" rx="7.5" fill="#D9487A"/>
    <circle cx="100" cy="8" r="11" fill="#FFF"/>` },
  noeud: { icone: '🎀', jours: 0, nom: 'Nœud', svg: () => `<g transform="rotate(18 140 34)">
    <path d="M140 34 L118 20 Q112 34 118 48 Z M140 34 L162 20 Q168 34 162 48 Z" fill="#FF7AAB"/>
    <circle cx="140" cy="34" r="7" fill="#E5457E"/></g>` },
  fleur: { icone: '🌸', jours: 0, nom: 'Fleur', svg: () => `<g transform="translate(60 40)">
    ${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-10" rx="7" ry="10" fill="#FFB3CF" transform="rotate(${a})"/>`).join('')}
    <circle r="6" fill="#FFD84D"/></g>` },
  aureole: { icone: '😇', jours: 60, nom: 'Auréole', svg: () => `
    <ellipse cx="100" cy="14" rx="30" ry="8" fill="none" stroke="#FFD84D" stroke-width="6"/>` },
};
const YEUX = {
  '': null,
  rondes: { icone: '👓', jours: 0, nom: 'Lunettes', svg: () => `<g fill="#FFFFFF40" stroke="${INK}" stroke-width="3.5">
    <circle cx="78" cy="90" r="15"/><circle cx="122" cy="90" r="15"/><path d="M93 89 Q100 84 107 89" fill="none"/></g>` },
  soleil: { icone: '🕶️', jours: 5, nom: 'Lunettes de soleil', svg: () => `<g fill="#26232E">
    <rect x="61" y="80" width="33" height="22" rx="10"/><rect x="106" y="80" width="33" height="22" rx="10"/>
    <rect x="92" y="84" width="16" height="4" rx="2"/>
    <path d="M66 86 L74 84" stroke="#FFFFFF80" stroke-width="3" stroke-linecap="round"/><path d="M111 86 L119 84" stroke="#FFFFFF80" stroke-width="3" stroke-linecap="round"/></g>` },
  coeur: { icone: '💖', jours: 21, nom: 'Cœurs', svg: () => ['78', '122'].map((x) => `
    <path transform="translate(${x} 82) scale(1.35)" d="M0 4 C0 -3 -10 -4 -11 3 C-12 9 0 14 0 17 C0 14 12 9 11 3 C10 -4 0 -3 0 4 Z" fill="#FF5C93" stroke="${INK}" stroke-width="2"/>`).join('')
    + `<path d="M92 88 L108 88" stroke="${INK}" stroke-width="3"/>` },
};
const CORPS = {
  '': null,
  echarpe: { icone: '🧣', jours: 0, nom: 'Écharpe', svg: () => `
    <path d="M58 122 Q100 140 142 122 L144 135 Q100 153 56 135 Z" fill="#E5457E"/>
    <g transform="rotate(-8 118 132)"><rect x="110" y="130" width="16" height="36" rx="5" fill="#D13A70"/>
    <path d="M110 150 H126 M110 158 H126" stroke="#FFFFFF90" stroke-width="3"/></g>` },
  papillon: { icone: '🎗️', jours: 10, nom: 'Nœud pap', svg: () => `
    <path d="M100 128 L80 118 L82 140 Z M100 128 L120 118 L118 140 Z" fill="#C2255C"/>
    <circle cx="100" cy="129" r="6" fill="#9E1C49"/>` },
  bandana: { icone: '🔷', jours: 2, nom: 'Bandana', svg: () => `
    <path d="M62 122 Q100 136 138 122 L100 164 Z" fill="#5AA9E6"/>
    <circle cx="92" cy="134" r="3" fill="#fff"/><circle cx="108" cy="134" r="3" fill="#fff"/><circle cx="100" cy="147" r="3" fill="#fff"/>` },
  pull: { icone: '🧥', jours: 14, nom: 'Pull', svg: () => `
    <path d="M58 132 Q62 118 100 118 Q138 118 142 132 L147 162 Q100 192 53 162 Z" fill="#7FB7E8"/>
    <path d="M56 148 Q100 164 144 148" fill="none" stroke="#FFFFFF" stroke-width="5"/>
    <path d="M70 120 Q100 132 130 120" fill="none" stroke="#5E98CF" stroke-width="7" stroke-linecap="round"/>` },
  cape: { icone: '🦸', jours: 45, nom: 'Cape', derriere: true, svg: () => `
    <path d="M62 124 Q34 178 54 198 L146 198 Q166 178 138 124 Z" fill="#C2255C"/>
    <path d="M62 124 Q34 178 54 198 L70 198 Q56 170 74 128 Z" fill="#9E1C49"/>` },
};

// Le dessin complet. mood : joie | normal | triste | dodo
function petSVG({ kind = 'chat', color = '', hat = '', eyes = '', body = '', mood = 'normal', sale = false } = {}) {
  const e = pick(ESPECES, kind) ?? ESPECES.chat;
  if (!pick(ESPECES, kind)) kind = 'chat';
  const col = pick(COULEURS, color);
  const c = col?.fur ? col : e;
  const fur = c.fur, belly = c.belly, dark = e.dark ?? fur;
  const ear = e.ear && !col?.fur ? e.ear : kind === 'chien' ? shade(fur, -0.25) : fur;
  const outfit = pick(CORPS, body), headwear = pick(TETE, hat), glasses = pick(YEUX, eyes);
  const L = [];

  L.push('<ellipse cx="100" cy="200" rx="54" ry="8" fill="#3A263118"/>');
  if (outfit?.derriere) L.push(outfit.svg());

  // Queue (derrière le corps)
  const tails = {
    long:  `<path d="M140 168 C178 166 186 128 168 108" fill="none" stroke="${fur}" stroke-width="13" stroke-linecap="round"/>`,
    curl:  `<path d="M142 162 C164 156 170 136 158 126" fill="none" stroke="${fur}" stroke-width="12" stroke-linecap="round"/>`,
    puff:  `<circle cx="146" cy="172" r="13" fill="${belly}" ${LINE}/>`,
    bushy: `<g><ellipse cx="160" cy="150" rx="19" ry="36" transform="rotate(38 160 150)" fill="${fur}" ${LINE}/>
            <ellipse cx="177" cy="126" rx="10" ry="13" transform="rotate(38 177 126)" fill="${belly}"/></g>`,
    nub:   `<circle cx="145" cy="174" r="9" fill="${kind === 'panda' ? dark : fur}"/>`,
    none:  '',
  };
  L.push(`<g class="tail">${tails[e.tail]}</g>`);

  // Pieds, corps, ventre, bras
  const limb = kind === 'panda' ? dark : fur;
  L.push(`<ellipse cx="78" cy="190" rx="17" ry="11" fill="${limb}" ${LINE}/><ellipse cx="122" cy="190" rx="17" ry="11" fill="${limb}" ${LINE}/>`);
  L.push(`<ellipse cx="100" cy="155" rx="47" ry="40" fill="${fur}" ${LINE}/>`);
  L.push(`<ellipse cx="100" cy="163" rx="29" ry="26" fill="${belly}"/>`);
  if (sale) L.push(`<g fill="#8B6B4E" opacity=".55"><ellipse cx="78" cy="166" rx="8" ry="5"/><ellipse cx="124" cy="150" rx="6" ry="4"/><ellipse cx="108" cy="178" rx="5" ry="3.5"/><ellipse cx="130" cy="74" rx="6" ry="4"/></g>`);
  if (outfit && !outfit.derriere) L.push(outfit.svg());
  L.push(`<ellipse cx="57" cy="150" rx="11" ry="17" transform="rotate(22 57 150)" fill="${limb}" ${LINE}/>`);
  L.push(`<ellipse cx="143" cy="150" rx="11" ry="17" transform="rotate(-22 143 150)" fill="${limb}" ${LINE}/>`);

  // Oreilles derrière la tête
  const earsBack = {
    pointy: `<path d="M50 66 L56 16 L94 44 Z" fill="${fur}" ${LINE} stroke-linejoin="round"/><path d="M150 66 L144 16 L106 44 Z" fill="${fur}" ${LINE} stroke-linejoin="round"/>
             <path d="M60 54 L62 28 L82 44 Z" fill="${kind === 'renard' ? e.tip : '#FFB3C6'}"/><path d="M140 54 L138 28 L118 44 Z" fill="${kind === 'renard' ? e.tip : '#FFB3C6'}"/>`,
    long:   `<ellipse cx="76" cy="26" rx="14" ry="38" transform="rotate(-10 76 26)" fill="${fur}" ${LINE}/><ellipse cx="124" cy="26" rx="14" ry="38" transform="rotate(10 124 26)" fill="${fur}" ${LINE}/>
             <ellipse cx="76" cy="28" rx="7" ry="28" transform="rotate(-10 76 28)" fill="#FFB8CC"/><ellipse cx="124" cy="28" rx="7" ry="28" transform="rotate(10 124 28)" fill="#FFB8CC"/>`,
    round:  `<circle cx="56" cy="44" r="17" fill="${kind === 'panda' ? dark : fur}" ${LINE}/><circle cx="144" cy="44" r="17" fill="${kind === 'panda' ? dark : fur}" ${LINE}/>
             ${kind === 'panda' ? '' : `<circle cx="56" cy="44" r="9" fill="${belly}"/><circle cx="144" cy="44" r="9" fill="${belly}"/>`}`,
    small:  `<circle cx="60" cy="48" r="13" fill="${fur}" ${LINE}/><circle cx="140" cy="48" r="13" fill="${fur}" ${LINE}/>
             <circle cx="60" cy="48" r="7" fill="#FFB8CC"/><circle cx="140" cy="48" r="7" fill="#FFB8CC"/>`,
    floppy: '',
  };
  L.push(earsBack[e.ears]);

  // Tête
  L.push(`<ellipse cx="100" cy="88" rx="57" ry="49" fill="${fur}" ${LINE}/>`);
  if (e.extra === 'stripes') L.push(`<path d="M92 44 L94 56 M100 42 L100 55 M108 44 L106 56" stroke="${shade(fur, -0.18)}" stroke-width="4" stroke-linecap="round"/>`);
  if (e.extra === 'fox') L.push(`<path d="M46 96 Q72 98 100 128 Q128 98 154 96 Q150 130 100 136 Q50 130 46 96 Z" fill="${belly}"/>`);
  if (e.extra === 'muzzle') L.push(`<ellipse cx="100" cy="108" rx="23" ry="16" fill="${belly}"/>`);
  if (e.extra === 'cheeks') L.push(`<ellipse cx="62" cy="106" rx="18" ry="15" fill="${belly}"/><ellipse cx="138" cy="106" rx="18" ry="15" fill="${belly}"/>`);
  if (e.extra === 'panda') L.push(`<ellipse cx="78" cy="91" rx="14" ry="18" transform="rotate(28 78 91)" fill="${dark}"/><ellipse cx="122" cy="91" rx="14" ry="18" transform="rotate(-28 122 91)" fill="${dark}"/>`);
  if (e.ears === 'floppy') L.push(`<ellipse cx="48" cy="84" rx="15" ry="31" transform="rotate(18 48 84)" fill="${ear}" ${LINE}/><ellipse cx="152" cy="84" rx="15" ry="31" transform="rotate(-18 152 84)" fill="${ear}" ${LINE}/>`);

  // Visage selon l'humeur
  const eyeW = kind === 'panda' ? '#FFFFFF' : INK;
  const open = (x) => `<g class="blink"><ellipse cx="${x}" cy="91" rx="7" ry="9" fill="${kind === 'panda' ? INK : eyeW}"/>
    <circle cx="${x + 2.5}" cy="87.5" r="2.7" fill="#fff"/></g>`;
  const arc = (x, up) => `<path d="M${x - 8} ${up ? 94 : 88} Q${x} ${up ? 82 : 98} ${x + 8} ${up ? 94 : 88}" fill="none" stroke="${kind === 'panda' ? '#fff' : INK}" stroke-width="4" stroke-linecap="round"/>`;
  if (mood === 'joie') L.push(arc(78, true), arc(122, true));
  else if (mood === 'dodo') L.push(arc(78, false), arc(122, false));
  else L.push(open(78), open(122));
  if (mood === 'triste') L.push(`<path d="M68 76 L86 72 M114 72 L132 76" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M70 102 q-5 8 0 11 q5 -3 0 -11 z" fill="#8EC5FF"/>`);

  L.push(`<ellipse cx="62" cy="106" rx="9" ry="6" fill="#FF7FA3" opacity=".45"/><ellipse cx="138" cy="106" rx="9" ry="6" fill="#FF7FA3" opacity=".45"/>`);
  L.push(kind === 'chat' || kind === 'lapin' || kind === 'hamster'
    ? `<path d="M96 100 L104 100 L100 105 Z" fill="#FF8FAB" stroke="#FF8FAB" stroke-width="2" stroke-linejoin="round"/>`
    : `<ellipse cx="100" cy="101" rx="7" ry="5" fill="${INK}"/>`);
  L.push(mood === 'triste'
    ? `<path d="M92 114 Q100 107 108 114" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`
    : mood === 'dodo'
      ? `<ellipse cx="100" cy="112" rx="3.5" ry="4.5" fill="${INK}"/>`
      : `<path d="M91 107 Q95.5 113 100 107 Q104.5 113 109 107" fill="${mood === 'joie' ? '#FF8FAB' : 'none'}" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
  if (kind === 'chat') L.push(`<path d="M44 98 L64 102 M44 108 L64 106 M156 98 L136 102 M156 108 L136 106" stroke="${INK}80" stroke-width="2" stroke-linecap="round"/>`);
  if (kind === 'lapin') L.push(`<rect x="96" y="112" width="8" height="7" rx="2" fill="#fff" stroke="${INK}50" stroke-width="1.5"/>`);

  if (glasses) L.push(glasses.svg());
  if (headwear) L.push(headwear.svg());
  if (mood === 'dodo') L.push(`<g class="zzz" fill="${INK}" font-weight="800" font-family="system-ui">
    <text x="150" y="40" font-size="18">z</text><text x="162" y="24" font-size="13">z</text><text x="171" y="12" font-size="9">z</text></g>`);

  return `<svg viewBox="0 0 200 210" xmlns="http://www.w3.org/2000/svg" class="pet-svg mood-${mood}" aria-hidden="true">${L.join('')}</svg>`;
}

// Éclaircit (+) ou assombrit (−) une couleur #RRGGBB
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(Math.min(255, Math.max(0, k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
}
const svgNode = (markup) => { const s = h('span', { className: 'svg-wrap' }); s.innerHTML = markup; return s; };

// Soins : chaque jauge se vide en `heures` heures depuis le dernier soin (par l'un ou l'autre)
const SOINS = {
  feed:  { icone: '🍖', nom: 'Manger',  heures: 24, burst: ['🍖', '🥕', '🍓'], fait: 'a nourri',          envie: 'J’ai un petit creux…' },
  hug:   { icone: '🤗', nom: 'Câlin',   heures: 36, burst: ['💗', '💕', '💖'], fait: 'a fait un câlin à', envie: 'Un câlin ? 🥺' },
  play:  { icone: '🎾', nom: 'Jouer',   heures: 30, burst: ['🎾', '⭐', '✨'], fait: 'a joué avec',       envie: 'On joue ?' },
  wash:  { icone: '🫧', nom: 'Bain',    heures: 72, burst: ['🫧', '🫧', '💧'], fait: 'a donné un bain à', envie: 'Je suis tout sale !' },
  sleep: { icone: '🌙', nom: 'Dodo',    heures: 20, burst: ['💤', '🌙', '⭐'], fait: 'a couché',          envie: 'Je baille…' },
};
const DODO_MIN = 30; // il dort 30 min après « Dodo »
const lastCare = (act) => Math.max(0, ...Object.values(couple.pet_care?.[act] ?? {}).map(Date.parse).filter(Boolean));
const jauge = (act) => {
  const t = lastCare(act);
  if (!t) return 70; // jamais fait : à moitié content
  return Math.round(Math.max(0, 100 - (Date.now() - t) / 36e5 / SOINS[act].heures * 100));
};
const hoursSince = (t) => Math.max(0, Date.now() - t) / 36e5;
const ago = (t) => {
  const m = Math.round(hoursSince(t) * 60);
  return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
};

function petMood() {
  const vals = Object.fromEntries(Object.keys(SOINS).map((k) => [k, jauge(k)]));
  const dort = lastCare('sleep') && hoursSince(lastCare('sleep')) * 60 < DODO_MIN;
  const [pire, min] = Object.entries(vals).sort((x, y) => x[1] - y[1])[0];
  const mood = dort ? 'dodo' : min >= 75 ? 'joie' : min < 30 ? 'triste' : 'normal';
  const bulle = dort ? 'Zzz… 😴' : min >= 75 ? 'Je vous aime tous les deux 💕' : min < 55 ? SOINS[pire].envie : 'Coucou !';
  return { vals, dort, mood, bulle, sale: vals.wash < 35 };
}

async function petAct(action, val) {
  const { data, error } = await sb.rpc('pet', { action, val });
  if (error) return alert(error.message);
  if (data) Object.assign(couple, data);
  setTabs(true, view);
  showPet();
  const stage = app.querySelector('.pet-stage');
  const fx = SOINS[action]?.burst;
  if (!fx) return;
  stage.classList.add('hop');
  fx.concat(fx).forEach((em, i) => stage.append(h('span', {
    className: 'burst', onanimationend: (ev) => ev.target.remove(),
    style: `left:${15 + Math.random() * 70}%;animation-delay:${i * 80}ms`,
  }, em)));
}

function showPet() {
  const st = couple.pet_style ?? {};
  const { vals, dort, mood, bulle, sale } = petMood();
  const partner = couple.a === user.id ? couple.b : couple.a;
  const jour = Date.now() - 864e5;
  const faitPar = (act, uid) => Date.parse(couple.pet_care?.[act]?.[uid] ?? 0) > jour;
  const compte = (uid) => Object.keys(SOINS).filter((k) => faitPar(k, uid)).length;
  const moi = compte(user.id), lui = compte(partner);

  const chip = (content, on, fn, ariaLabel) => Object.assign(btn(content, fn, 'chip'), { ariaPressed: String(on), ariaLabel });
  // Tenues à gagner : chaque jour où vous répondez tous les deux rapproche de la suivante
  const rangée = (titre, liste, cle) => [
    h('p', { className: 'label' }, titre),
    h('div', { className: 'chips' }, Object.entries(liste).map(([id, o]) => {
      if (o && o.jours > stats.total) {
        const b = chip(o.icone, (st[cle] ?? '') === id,
          () => toast(`${o.nom} ${o.icone} : à débloquer après ${o.jours} jours à deux (vous en êtes à ${stats.total})`),
          `${o.nom}, verrouillé : ${o.jours} jours à deux`);
        b.classList.add('locked');
        return b;
      }
      return chip(o ? o.icone : '🚫', (st[cle] ?? '') === id, () => petAct(cle, id), o ? o.nom : 'Rien');
    })),
  ];
  const prochaine = TENUES().filter((t) => t.jours > stats.total).sort((x, y) => x.jours - y.jours)[0];
  const nom = h('input', { value: couple.pet_name, maxLength: 20, ariaLabel: 'Nom de votre compagnon' });

  show(
    card(
      h('p', { className: 'eyebrow' }, 'Notre compagnon'),
      h('div', { className: 'pet-stage' + (mood === 'triste' ? ' sad' : '') },
        h('div', { className: 'speech' }, bulle),
        svgNode(petSVG({ ...st, mood, sale })),
      ),
      h('p', { className: 'question pet-name' }, couple.pet_name),
      h('div', { className: 'care' }, Object.entries(SOINS).map(([act, s]) => {
        const t = lastCare(act);
        const b = btn([
          h('span', { className: 'care-icon' }, s.icone),
          h('span', { className: 'care-name' }, s.nom),
          h('span', { className: 'bar' }, h('i', { style: `width:${vals[act]}%`, className: vals[act] < 30 ? 'low' : '' })),
          h('span', { className: 'dots', title: 'toi · ton/ta partenaire (dernières 24 h)' },
            h('i', { className: faitPar(act, user.id) ? 'on' : '' }), h('i', { className: faitPar(act, partner) ? 'on' : '' })),
        ], async () => {
          if (dort && act !== 'hug') return toast(`Chut, ${couple.pet_name} dort 😴`);
          await petAct(act);
        }, 'care-btn');
        b.ariaLabel = `${s.nom} : ${vals[act]} %` + (t ? `, dernier soin ${ago(t)}` : '');
        return b;
      })),
      h('p', { className: 'hint duo' },
        `Aujourd’hui : toi ${moi} soin${moi > 1 ? 's' : ''} · ton/ta partenaire ${lui} soin${lui > 1 ? 's' : ''}`,
        moi > 0 && lui > 0 ? h('strong', {}, ` ✨ ${couple.pet_name} adore quand vous vous occupez de lui à deux`) : null),
    ),
    card(
      h('p', { className: 'eyebrow' }, 'Habiller'),
      h('p', { className: 'hint' }, `💞 ${stats.total} jour${stats.total > 1 ? 's' : ''} à deux`,
        prochaine
          ? ` · prochaine tenue : ${prochaine.nom} ${prochaine.icone} dans ${prochaine.jours - stats.total} jour${prochaine.jours - stats.total > 1 ? 's' : ''}`
          : ' · toutes les tenues sont débloquées ✨'),
      ...rangée('Tête', TETE, 'hat'),
      ...rangée('Yeux', YEUX, 'eyes'),
      ...rangée('Corps', CORPS, 'body'),
    ),
    card(
      h('p', { className: 'eyebrow' }, 'Apparence'),
      h('p', { className: 'label' }, 'Espèce'),
      h('div', { className: 'chips' }, Object.entries(ESPECES).map(([id, e]) =>
        chip(svgNode(petSVG({ kind: id, color: st.color, mood: 'normal' })), (st.kind ?? 'chat') === id, () => petAct('kind', id), e.nom))),
      h('p', { className: 'label' }, 'Couleur'),
      h('div', { className: 'chips' }, Object.entries(COULEURS).map(([id, c]) => {
        const b = chip('', (st.color ?? '') === id, () => petAct('color', id), c.nom);
        b.classList.add('swatch');
        b.style.background = c.fur ?? `conic-gradient(${Object.values(COULEURS).filter((x) => x.fur).map((x) => x.fur).join(',')})`;
        return b;
      })),
      h('p', { className: 'label' }, 'Son nom'),
      nom,
      btn('Renommer', () => nom.value.trim() && petAct('name', nom.value.trim()), 'ghost'),
    ),
  );
}

async function showNous() {
  const cards = [];
  const [{ data: miennes }, { data: attente }] = await Promise.all([
    sb.from('custom_questions').select('id, text').eq('author', user.id).is('used_on', null).order('created_at'),
    sb.rpc('pending_questions'),
  ]);

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
        codeStep(security, email.value.trim(), 'email_change');
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

  // Vos propres questions : elles passent avant celles de l'app, une par jour (sauf le dimanche)
  const nouvelle = h('textarea', { placeholder: 'Ex. : Quel est le moment où tu t’es senti·e le plus proche de moi ?', maxLength: 300, rows: 2, ariaLabel: 'Nouvelle question' });
  const autres = attente?.theirs ?? 0;
  cards.push(card(
    h('p', { className: 'eyebrow' }, 'Nos questions 💌'),
    h('p', { className: 'hint' }, 'Écris des questions pour vous deux : elles tombent une par jour, avant celles de l’app. Celles de ton/ta partenaire restent une surprise.'),
    autres > 0 && h('p', { className: 'hint' }, `🎁 ${autres} question${autres > 1 ? 's' : ''} de ton/ta partenaire en attente`),
    nouvelle,
    btn('Ajouter la question', async () => {
      const text = nouvelle.value.trim();
      if (text.length < 3) return nouvelle.focus();
      const { error } = await sb.from('custom_questions').insert({ couple_id: couple.id, text });
      if (error) return alert(error.message);
      toast('Question ajoutée 💌');
      showNous();
    }),
    (miennes ?? []).length > 0 && [
      h('p', { className: 'label' }, 'Tes questions en attente'),
      h('ul', { className: 'qlist' }, miennes.map((q) => h('li', {},
        h('span', {}, q.text),
        btn('✕', async () => {
          await sb.from('custom_questions').delete().eq('id', q.id);
          showNous();
        }, 'ghost x'),
      ))),
    ],
  ));

  cards.push(card(
    h('p', { className: 'eyebrow' }, 'Bientôt'),
    h('p', { className: 'hint' }, 'Lettres à ouvrir plus tard · Petites statistiques douces…'),
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
