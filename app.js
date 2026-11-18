import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase > Project Settings > API Keys (la clé publishable/anon est publique, c'est normal)
const SUPABASE_URL = 'https://njvatmicnmekplpkvppd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1A5R-PFEg8rN8lc5junI7Q_bbCIEbBB';

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
const share = (code) => navigator.share
  ? navigator.share({ text: `Rejoins-moi sur Nous deux 💞 Code : ${code}\n${location.href}` }).catch(() => {})
  : navigator.clipboard.writeText(code).then(() => alert('Code copié !'));

// Même formule que la question du jour, réutilisée pour les souvenirs
const questionFor = (day) => QUESTIONS[Math.floor(Date.parse(day) / 86400000) % QUESTIONS.length];

const toast = (msg) => {
  const t = h('div', { className: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 4200);
};

// Prévenir même quand l'app est en fond : Notification si permission, sinon titre qui clignote
const alertes = (msg) => {
  navigator.vibrate?.([80, 40, 80]);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('Nous deux 💞', { body: msg });
  } else {
    toast(msg);
    if (document.hidden) flashTitle();
  }
};
const flashTitle = () => {
  if (flashTimer) return;
  let i = 0;
  flashTimer = setInterval(() => {
    document.title = (i++ % 2) ? '💞 Une réponse t\u2019attend' : 'Nous deux';
    if (i > 8) { clearInterval(flashTimer); flashTimer = null; document.title = 'Nous deux'; }
  }, 900);
};
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && flashTimer) { clearInterval(flashTimer); flashTimer = null; document.title = 'Nous deux'; }
});

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

// Temps réel : canal par couple, une fois l'espace créé
function listen(couples, me) {
  if (channel) return;
  channel = sb.channel(`nous-deux-${couples.id}`)
    // Jeu conjoint : le partenaire arrive ou part → tout se recharge
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${couples.id}` }, (payload) => {
      if (payload.new.b !== couple.b) {
        couple = payload.new;
        alertes(couple.b ? 'Ton/ta partenaire a rejoint 💞' : 'Ton/ta partenaire a quitté l\u2019espace');
        main();
      }
    })
    // "Je pense à toi" : bulle instantanée
    .on('broadcast', { event: 'nudge' }, () => alertes('Ton/ta partenaire pense à toi 💭'))
    // Le partenaire vient de répondre (RLS me masque encore sa réponse) : c'est mon tour
    .on('broadcast', { event: 'answered' }, () => {
      const ta = app.querySelector('textarea');
      if (document.activeElement === ta) return toast('Ton/ta partenaire a répondu 💞 Tu verras la mise à jour après l\u2019envoi');
      alertes('C\u2019est ton tour ! Ton/ta partenaire a répondu 💞');
      if (view === 'jour') showToday();
    })
    // Nouvelle réponse que je peux voir (j'ai répondu en premier) : dévoilement en direct
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers', filter: `couple_id=eq.${couples.id}` }, (payload) => {
      if (payload.new.user_id === me.id) return;
      if (document.hidden) alertes('Vos réponses du jour se sont dévoilées 💞');
      if (view === 'jour') showToday();
    })
    .subscribe();
}

async function main() {
  // Compte anonyme lié au navigateur (vider les données = perdre le couple). À relier par email dans Nous.
  const { data: { session } } = await sb.auth.getSession();
  user = session?.user ?? null;
  if (!user) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) return fail(error);
    user = data.user;
  }

  const { data: couples, error } = await sb.from('couples').select('*').limit(1);
  if (error) return fail(error);
  couple = couples[0] ?? null;

  // Auto-réparation : si ma clé personnelle n'existe pas encore (compte inscrit
  // avant la mise à jour SQL), le serveur la génère, puis on relit la ligne.
  if (couple && !((couple.a === user.id && couple.key_a) || (couple.b === user.id && couple.key_b))) {
    await sb.rpc('ensure_my_key').catch(() => {});
    const { data: fresh } = await sb.from('couples').select('*').limit(1);
    if (fresh?.length) couple = fresh[0];
  }

  if (!couple) { setTabs(false); return showPairing(user.id); }
  listen(couple, user);
  route();
}

function showPairing(me) {
  const input = h('input', { className: 'code-input', placeholder: 'ABC123', maxLength: 6, autocomplete: 'off', ariaLabel: 'Code du partenaire' });
  const code = h('input', { className: 'code-input', placeholder: 'ABC123', maxLength: 6, autocomplete: 'off', ariaLabel: 'Code de votre espace' });
  const secret = h('input', { className: 'code-input', placeholder: 'CLÉ…', maxLength: 10, autocomplete: 'off', ariaLabel: 'Ta clé de reconnexion' });
  show(
    card(
      h('p', { className: 'eyebrow' }, 'Bienvenue'),
      h('p', { className: 'question' }, 'Une question par jour, rien que pour vous deux.'),
      h('p', { className: 'hint' }, 'Vous répondez chacun de votre côté, et la réponse de l\'autre se dévoile quand vous avez répondu.'),
      btn('Créer notre espace', async () => {
        const { error } = await sb.from('couples').insert({ a: me });
        error ? alert(error.message) : main();
      }),
    ),
    card(
      h('p', { className: 'eyebrow' }, 'Tu as reçu un code ?'),
      input,
      btn('Rejoindre', async () => {
        const { data, error } = await sb.rpc('join_couple', { c: input.value.trim() });
        if (error || !data) return alert(error?.message ?? 'Code invalide ou déjà utilisé');
        main();
      }),
    ),
    card(
      h('p', { className: 'eyebrow' }, 'Tu te reconnectes ?'),
      h('p', { className: 'hint' }, 'Après un changement de téléphone ou un nettoyage du navigateur : entre le code de votre espace et ta clé personnelle pour retrouver ta place et vos souvenirs.'),
      code,
      secret,
      btn('Récupérer ma place', async () => {
        if (!code.value.trim()) return code.focus();
        if (!secret.value.trim()) return secret.focus();
        const { error } = await sb.rpc('recover_couple', { c: code.value.trim(), s: secret.value.trim() });
        if (error) return alert(error.message);
        main();
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

function showToday() {
  const me = user.id;
  const today = new Date().toISOString().slice(0, 10); // UTC, comme current_date côté Supabase
  const question = questionFor(today);
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return sb.from('answers').select('user_id, text').eq('couple_id', couple.id).eq('day', today)
    .then(({ data: answers, error }) => {
      if (error) return fail(error);
      if (!couple.b) return showWaiting();

      const mine = answers.find((a) => a.user_id === me);
      const theirs = answers.find((a) => a.user_id !== me);
      const head = [h('p', { className: 'eyebrow' }, dateLabel), h('p', { className: 'question' }, question)];
      const nudge = btn('Je pense à toi 💭', async () => {
        if (!channel) return toast('Recharge la page pour activer le temps réel');
        await channel.send({ type: 'broadcast', event: 'nudge', payload: { from: me } });
        toast('Envoyé 💞');
      }, 'ghost');

      if (!mine) {
        const ta = h('textarea', { placeholder: 'Écris ta réponse…', maxLength: 2000, ariaLabel: 'Ta réponse' });
        return show(card(
          ...head, ta,
          btn('Envoyer 💌', async () => {
            if (!ta.value.trim()) return ta.focus();
            const { error } = await sb.from('answers').insert({ couple_id: couple.id, text: ta.value.trim() });
            if (error) return alert(error.message);
            channel?.send({ type: 'broadcast', event: 'answered', payload: {} });
            main();
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
    });
}

async function showSouvenirs() {
  // La RLS ne renvoie que les jours où tu as répondu : leur réponse d'un jour sans la tienne reste secrète
  const { data, error } = await sb.from('answers')
    .select('user_id, day, text').eq('couple_id', couple.id)
    .order('day', { ascending: false }).limit(120);
  if (error) return fail(error);

  const days = [];
  for (const row of data) {
    let d = days.at(-1);
    if (!d || d.day !== row.day) { d = { day: row.day, mine: null, theirs: null }; days.push(d); }
    if (row.user_id === user.id) d.mine = row.text; else d.theirs = row.text;
  }

  const out = days.length ? days.map((d) => {
        const kids = [
          h('p', { className: 'eyebrow' }, new Date(d.day + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })),
          h('p', { className: 'question' }, questionFor(d.day)),
        ];
        if (d.mine) kids.push(h('p', { className: 'label me' }, 'Toi'), h('div', { className: 'bubble mine' }, d.mine));
        kids.push(h('p', { className: 'label' }, 'Ton/ta partenaire'));
        kids.push(d.theirs
          ? h('div', { className: 'bubble theirs' }, d.theirs)
          : h('div', { className: 'bubble locked' }, 'Pas de réponse ce jour-là'));
        return card(...kids);
      })
    : [card(
        h('p', { className: 'eyebrow' }, 'Nos souvenirs'),
        h('p', { className: 'hint' }, 'Pas encore de souvenirs — réponds à la question du jour, ils apparaîtront ici.'),
      )];
  show(...out);
}

function showNous() {
  const cards = [];

  // Notre espace : code, partenaire
  cards.push(card(
    h('p', { className: 'eyebrow' }, 'Notre espace'),
    couple.b
      ? h('p', { className: 'hint' }, 'Votre espace est complet, les réponses se dévoilent à deux.')
      : h('p', { className: 'hint' }, 'En attente de ton/ta partenaire. Partage ce code pour l\u2019inviter.'),
    couple.b ? null : h('p', { className: 'code' }, couple.code),
    couple.b ? null : btn('Partager le code', () => share(couple.code)),
  ));

  // Se reconnecter un jour : code de l'espace + clé personnelle
  const myKey = couple.a === user.id ? couple.key_a : couple.b === user.id ? couple.key_b : null;
  cards.push(card(
    h('p', { className: 'eyebrow' }, 'Me reconnecter'),
    h('p', { className: 'hint' }, 'Sur un nouveau téléphone ou après un nettoyage du navigateur : entre ces deux codes à l\u2019écran Bienvenue pour retrouver ta place et vos souvenirs. Ta clé est personnelle, garde-la précieusement.'),
    h('p', { className: 'label' }, 'Code de l\u2019espace'),
    h('p', { className: 'code' }, couple.code),
    h('p', { className: 'label' }, 'Ta clé personnelle'),
    myKey
      ? [h('p', { className: 'code small' }, myKey), btn('Copier ma clé', () => navigator.clipboard.writeText(myKey).then(() => alert('Clé copiée !')), 'ghost')]
      : [h('p', { className: 'hint' }, 'N\u2019a pas encore été générée : ré-exécute le SQL de mise à jour (voir README).')],
  ));

  // Email de secours : un compte anonyme vit dans le navigateur
  const security = card(h('p', { className: 'eyebrow' }, 'Sécuriser nos souvenirs'));
  if (user.is_anonymous) {
    const emailInput = h('input', { type: 'email', placeholder: 'ton@email.fr', autocomplete: 'email', ariaLabel: 'Ton email' });
    security.append(
      h('p', { className: 'hint' }, 'Ton compte est lié à ce navigateur : si ses données sont vidées, vos réponses partent avec. Ajoute un email pour les retrouver.'),
      emailInput,
      btn('Lier mon email', async () => {
        if (!emailInput.value.trim()) return emailInput.focus();
        const { error } = await sb.auth.updateUser({ email: emailInput.value.trim() });
        if (error) return alert(error.message);
        alert('Vérifie ta boîte mail pour confirmer 💞');
      }),
    );
  } else {
    security.append(h('p', { className: 'hint' }, `Compte relié à ${user.email ?? 'ton email'} ✓ Tes souvenirs survivent à un nettoyage du navigateur.`));
  }
  cards.push(security);

  // Notifications
  cards.push(card(
    h('p', { className: 'eyebrow' }, 'Alertes'),
    h('p', { className: 'hint' }, 'Sois prévenu·e quand ton/ta partenaire te pense à toi ou a répondu.'),
    btn('Activer les notifications', async () => {
      if (!('Notification' in window)) return toast('Notifications non supportées par ce navigateur');
      const p = await Notification.requestPermission();
      toast(p === 'granted' ? 'Notifications activées 💞' : 'Notifications refusées');
    }),
  ));

  // La suite à venir
  cards.push(card(
    h('p', { className: 'eyebrow' }, 'Bientôt'),
    h('p', { className: 'hint' }, 'Questions personnalisées · Petites statistiques douces · Lettres à ouvrir plus tard…'),
  ));

  // Quitter la session : l'espace reste à l'autre, ou dissolution complète
  const session = card(
    h('p', { className: 'eyebrow' }, 'Session'),
    couple.b
      ? h('p', { className: 'hint' }, 'Partir de cet espace ? Il restera à ton/ta partenaire, avec toutes vos réponses. Tu pourras en créer un autre ou en rejoindre un autre.')
      : h('p', { className: 'hint' }, 'Abandonner cet espace le supprimera (il n\u2019a pas encore de partenaire).'),
    btn('Quitter l\u2019espace', async () => {
      if (!confirm('Quitter cet espace ? Ton/ta partenaire gardera vos réponses.')) return;
      const { error } = await sb.rpc('leave_couple');
      if (error) return alert(error.message);
      await resetSession();
      main();
    }, 'ghost danger'),
  );
  if (couple.b) session.append(btn('Dissoudre (tout supprimer)', async () => {
    if (!confirm('Supprimer définitivement l\u2019espace et toutes vos réponses ? Action irréversible.')) return;
    const { error } = await sb.rpc('dissolve_couple');
    if (error) return alert(error.message);
    await resetSession();
    main();
  }, 'ghost danger'));
  cards.push(session);

  show(...cards);
}

main().catch(fail);
