/* ronda-engine.js — Moteur Ronda (40 cartes espagnoles). Sans dépendance, navigateur + Node.
 * Usage :
 *   const g = new Ronda.Game({ difficulty:'habitue', target:21, manualAnnounce:false });
 *   Ronda.CARDS[id] -> {id, suit, rank, name}
 *   g.view(0) -> état public pour le joueur 0 (humain)
 *   g.play(cardId) -> événements (à animer / sonoriser)
 *   g.bestMove(level) -> carte choisie par l'IA
 *   Le joueur 0 est l'humain, le joueur 1 est l'IA.
 * Types d'événements :
 *   round, deal, combo, pendingCombo, comboMissed, play, missa, bount, sweep, roundEnd, gameOver
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ronda = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const SUITS = ['copas', 'oros', 'bastos', 'espadas'];
  const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];          // ordre des suites : 7 -> 10 (sota)
  const NAMES = { 10: 'Sota', 11: 'Caballo', 12: 'Rey' };
  const AR_SUITS = { copas: 'الكواص', oros: 'الذهب', bastos: 'الزرواطة', espadas: 'السيوف' };
  const AR_NAMES = { 1: 'الواحد', 2: 'الجوج', 3: 'التلاتة', 4: 'الربعة', 5: 'الخمسة', 6: 'الستة', 7: 'السبعة', 10: 'الشيخ', 11: 'العود', 12: 'الملك' };

  const CARDS = [];
  SUITS.forEach((s, si) => RANKS.forEach((r, ri) =>
    CARDS.push(Object.freeze({
      id: si * 10 + ri,
      suit: s,
      rank: r,
      name: NAMES[r] || String(r),
      arName: AR_NAMES[r] || String(r),
      arSuit: AR_SUITS[s]
    }))));
  const rankIdx = r => RANKS.indexOf(r);

  // Règles modifiables (elles varient selon les régions : adapte ici).
  const DEFAULTS = {
    target: 21,              // score pour gagner la partie
    rondaPts: 1, tringaPts: 5,
    missaPts: 1,             // table vidée
    bountPts: 1,             // prise de la carte que l'adversaire vient de poser
    missaOnLastPlay: false,  // missa comptée sur la toute dernière carte ?
    cardsScoring: 'beyond20',// 'beyond20' : 1 pt par carte au-delà de 20 | 'majority' : 1 pt au plus de cartes
    difficulty: 'habitue',   // 'debutant' | 'habitue' | 'maitre'
    manualAnnounce: false,   // annonce manuelle des Rondas et Tringas
    seed: null               // nombre fixe = partie rejouable (tests)
  };

  /* ---------- Règles pures ---------- */

  // Poser une carte : prend la carte de même valeur + la suite ascendante présente sur la table.
  function resolve(table, c) {
    const m = table.find(t => t.rank === c.rank);
    if (!m) return { cap: [], table: table.concat(c) };
    const cap = [m];
    for (let i = rankIdx(c.rank) + 1; i < RANKS.length; i++) {
      const t = table.find(x => x.rank === RANKS[i]);
      if (!t) break;
      cap.push(t);
    }
    return { cap, table: table.filter(t => !cap.includes(t)) };
  }

  function gain(table, c, lp, cfg, p, last) {
    const r = resolve(table, c);
    if (!r.cap.length) return { cap: [], table: r.table, g: 0, missa: false, bount: false, lp: { p, c } };
    const missa = !r.table.length && (!last || cfg.missaOnLastPlay);
    const bount = !!lp && lp.p !== p && lp.c === r.cap[0];
    return {
      cap: r.cap, table: r.table, missa, bount, lp: null,
      g: (r.cap.length + 1) * 0.5 + (missa ? 2 * cfg.missaPts : 0) + (bount ? 2 * cfg.bountPts : 0)
    };
  }

  function combo(hand) {
    if (!hand || !hand.length) return null;
    const n = {};
    hand.forEach(c => n[c.rank] = (n[c.rank] || 0) + 1);
    let best = null;
    for (const r in n) if (n[r] >= 2) {
      const k = { kind: n[r] === 3 ? 'tringa' : 'ronda', rank: +r };
      if (!best || cmpCombo(k, best) > 0) best = k;
    }
    return best;
  }
  const cmpCombo = (a, b) => (a.kind === b.kind ? rankIdx(a.rank) - rankIdx(b.rank) : (a.kind === 'tringa' ? 1 : -1));

  /* ---------- Partie ---------- */

  class Game {
    constructor(o = {}) {
      this.cfg = Object.assign({}, DEFAULTS, o);
      this.s = (this.cfg.seed == null ? (Math.random() * 4294967296) >>> 0 : this.cfg.seed) | 0;
      this.scores = [0, 0]; this.dealer = 1; this.round = 0;
      this.over = false; this.winner = null; this.events = [];
      this.pendingCombos = null;
      this.startRound();
    }

    rnd() { // mulberry32
      this.s = (this.s + 0x6D2B79F5) | 0;
      let t = this.s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    emit(type, d) { this.events.push(Object.assign({ type }, d)); }
    drain() { const e = this.events; this.events = []; return e; }

    startRound() {
      this.round++;
      do { // 4 cartes de valeurs toutes différentes sur la table
        this.deck = CARDS.slice();
        for (let i = 39; i > 0; i--) {
          const j = Math.floor(this.rnd() * (i + 1));
          [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
        this.table = this.deck.slice(0, 4);
      } while (new Set(this.table.map(c => c.rank)).size < 4);
      this.deck.splice(0, 4);
      this.captured = [[], []]; this.lastCapturer = null; this.lp = null;
      this.played = new Set(this.table.map(c => c.id));
      this.turn = 1 - this.dealer;
      this.emit('round', { round: this.round, table: this.table.map(c => c.id) });
      this.deal();
    }

    deal() {
      this.hands = [this.deck.splice(0, 3), this.deck.splice(0, 3)];
      this.emit('deal', { left: this.deck.length });
      const a = combo(this.hands[0]), b = combo(this.hands[1]);

      if (this.cfg.manualAnnounce) {
        // En mode annonce manuelle, on stocke les combos en attente d'annonce
        this.pendingCombos = [a, b];
        if (b) {
          const aiForgets = this.cfg.difficulty === 'debutant' && this.rnd() < 0.12;
          if (aiForgets) this.pendingCombos[1] = null;
        }
        if (a) {
          this.emit('pendingCombo', { player: 0, kind: a.kind, rank: a.rank });
        } else if (this.pendingCombos[1]) {
          // L'IA annonce immédiatement si l'humain n'a pas de combo
          this.announce(1);
        }
        return;
      }

      // Mode automatique classique
      this.resolveCombos(a, b);
    }

    resolveCombos(a, b) {
      if (!a && !b) return;
      let w;
      if (a && b) { const k = cmpCombo(a, b); w = k > 0 ? 0 : k < 0 ? 1 : this.turn; } // le plus fort gagne (bount)
      else w = a ? 0 : 1;
      const k = w === 0 ? a : b;
      const pts = k.kind === 'tringa' ? this.cfg.tringaPts : this.cfg.rondaPts;
      this.emit('combo', { player: w, kind: k.kind, rank: k.rank, pts, countered: !!(a && b) });
      this.add(w, pts);
    }

    // Annonce manuelle par le joueur humain ou l'IA
    announce(p = 0) {
      if (!this.pendingCombos) return false;
      const k = this.pendingCombos[p];
      if (!k) return false;

      const otherK = this.pendingCombos[1 - p];
      this.pendingCombos[p] = null;

      let w = p, countered = false;
      if (otherK) {
        countered = true;
        const cmp = cmpCombo(k, otherK);
        w = cmp > 0 ? p : cmp < 0 ? 1 - p : this.turn;
      }

      const winningK = w === p ? k : otherK;
      const pts = winningK.kind === 'tringa' ? this.cfg.tringaPts : this.cfg.rondaPts;
      this.emit('combo', { player: w, kind: winningK.kind, rank: winningK.rank, pts, countered });
      this.add(w, pts);
      this.pendingCombos = null;
      return true;
    }

    add(p, pts) { this.scores[p] += pts; this.finish(); }

    finish() {
      if (this.over) return;
      const [a, b] = this.scores;
      if (Math.max(a, b) >= this.cfg.target && a !== b) {
        this.over = true; this.winner = a > b ? 0 : 1;
        this.emit('gameOver', { winner: this.winner, scores: this.scores.slice() });
      }
    }

    legalMoves() { return this.over ? [] : this.hands[this.turn].map(c => c.id); }

    play(id) {
      if (this.over) throw new Error('Partie terminée');
      const p = this.turn, h = this.hands[p], i = h.findIndex(c => c.id === id);
      if (i < 0) throw new Error('Carte absente de la main du joueur ' + p);

      // Si le joueur joue sans avoir annoncé son combo en mode manuel, il perd l'annonce
      if (this.cfg.manualAnnounce && this.pendingCombos) {
        if (p === 0 && this.pendingCombos[0]) {
          this.emit('comboMissed', { player: 0, kind: this.pendingCombos[0].kind });
          this.pendingCombos[0] = null;
        }
        // Si l'IA avait un combo en attente, elle l'annonce avant de jouer
        if (this.pendingCombos[1]) {
          this.announce(1);
        }
        this.pendingCombos = null;
      }
      if (this.over) return this.drain();

      const c = h.splice(i, 1)[0];
      this.played.add(c.id);
      const last = !this.deck.length && !this.hands[0].length && !this.hands[1].length;
      const g = gain(this.table, c, this.lp, this.cfg, p, last);
      this.table = g.table; this.lp = g.lp;
      this.emit('play', { player: p, card: c.id, captured: g.cap.map(x => x.id) });
      if (g.cap.length) {
        this.captured[p].push(c, ...g.cap);
        this.lastCapturer = p;
        if (g.missa) { this.emit('missa', { player: p }); this.add(p, this.cfg.missaPts); }
        if (g.bount) { this.emit('bount', { player: p }); this.add(p, this.cfg.bountPts); }
      }
      if (this.over) return this.drain();
      this.turn = 1 - p;
      if (!this.hands[0].length && !this.hands[1].length) this.deck.length ? this.deal() : this.endRound();
      return this.drain();
    }

    endRound() {
      const lc = this.lastCapturer;
      if (lc != null && this.table.length) {
        this.captured[lc].push(...this.table);
        this.emit('sweep', { player: lc, cards: this.table.map(c => c.id) });
      }
      this.table = [];
      const n = this.captured.map(a => a.length), pts = [0, 0];
      if (this.cfg.cardsScoring === 'majority') { if (n[0] > n[1]) pts[0] = 1; else if (n[1] > n[0]) pts[1] = 1; }
      else [0, 1].forEach(p => pts[p] = Math.max(0, n[p] - 20));
      this.scores[0] += pts[0]; this.scores[1] += pts[1];
      this.emit('roundEnd', { counts: n, pts, scores: this.scores.slice() });
      this.finish();
      if (!this.over) { this.dealer = 1 - this.dealer; this.startRound(); }
    }

    /* ---------- IA ---------- */

    bestMove(level) {
      if (this.over) return null;
      level = level || this.cfg.difficulty;
      const p = this.turn, h = this.hands[p];
      if (!h || !h.length) return null;
      const opts = h.map(c => ({ c, r: gain(this.table, c, this.lp, this.cfg, p, false) }));
      const pickMax = f => {
        let best = -1e9, bs = [];
        for (const o of opts) { const v = f(o); if (v > best + 1e-9) { best = v; bs = [o]; } else if (Math.abs(v - best) <= 1e-9) bs.push(o); }
        return bs[Math.floor(this.rnd() * bs.length)].c;
      };
      if (level === 'debutant') {
        if (this.rnd() < 0.7) return h[Math.floor(this.rnd() * h.length)];
        return pickMax(o => o.r.g);
      }
      if (level === 'habitue') return pickMax(o => o.r.g - 0.3 * o.r.table.length);
      // 'maitre' : mémoire des cartes jouées + échantillonnage de la main adverse (déterminisation)
      const unseen = CARDS.filter(c => !this.played.has(c.id) && !h.includes(c));
      const k = this.hands[1 - p].length, N = 60, samples = [];
      for (let n = 0; n < N; n++) {
        const a = unseen.slice();
        for (let i = 0; i < k; i++) { const j = i + Math.floor(this.rnd() * (a.length - i)); [a[i], a[j]] = [a[j], a[i]]; }
        samples.push(a.slice(0, k));
      }
      return pickMax(o => {
        let tot = 0;
        for (const s of samples) {
          let best = 0;
          for (const oc of s) { const x = gain(o.r.table, oc, o.r.lp, this.cfg, 1 - p, false).g; if (x > best) best = x; }
          tot += best;
        }
        return o.r.g - 0.9 * tot / N + this.rnd() * 0.01;
      });
    }

    /* ---------- État public / sauvegarde ---------- */

    view(p = 0) {
      return {
        round: this.round, turn: this.turn, scores: this.scores.slice(),
        hand: this.hands[p].map(c => c.id), oppCount: this.hands[1 - p].length,
        table: this.table.map(c => c.id), deck: this.deck.length,
        captured: this.captured.map(a => a.length), over: this.over, winner: this.winner,
        lastPlayed: this.lp ? { player: this.lp.p, card: this.lp.c.id } : null,
        pendingCombo: this.pendingCombos && this.pendingCombos[p] ? Object.assign({}, this.pendingCombos[p]) : null
      };
    }

    serialize() { // JSON-safe (Firebase, localStorage…)
      const id = c => c.id;
      return {
        cfg: Object.assign({}, this.cfg), s: this.s, scores: this.scores.slice(), dealer: this.dealer, round: this.round,
        turn: this.turn, over: this.over, winner: this.winner, deck: this.deck.map(id),
        hands: this.hands.map(a => a.map(id)), table: this.table.map(id),
        captured: this.captured.map(a => a.map(id)), lastCapturer: this.lastCapturer,
        lp: this.lp ? { p: this.lp.p, c: this.lp.c.id } : null, played: [...this.played],
        pendingCombos: this.pendingCombos ? this.pendingCombos.map(k => k ? Object.assign({}, k) : null) : null
      };
    }

    static restore(o) {
      const g = Object.create(Game.prototype), C = a => a.map(i => CARDS[i]);
      Object.assign(g, {
        cfg: Object.assign({}, DEFAULTS, o.cfg || {}),
        s: o.s, scores: o.scores.slice(), dealer: o.dealer, round: o.round, turn: o.turn,
        over: o.over, winner: o.winner, deck: C(o.deck || []), hands: o.hands.map(a => C(a || [])),
        table: C(o.table || []), captured: o.captured.map(a => C(a || [])), lastCapturer: o.lastCapturer,
        lp: o.lp ? { p: o.lp.p, c: CARDS[o.lp.c] } : null, played: new Set(o.played),
        pendingCombos: o.pendingCombos || null, events: []
      });
      return g;
    }

    // Auto-test : parties IA contre IA, vérifie la conservation des 40 cartes et la fin des parties.
    static selfTest(n = 60) {
      const L = ['debutant', 'habitue', 'maitre'], wins = [0, 0];
      const lv = { debutant: [0, 0], habitue: [0, 0], maitre: [0, 0] };
      let plies = 0;
      for (let k = 0; k < n; k++) {
        const g = new Game({ seed: k + 1 }); g.drain();
        const lvl = [L[k % 3], L[(k + 1) % 3]];
        let guard = 0;
        while (!g.over) {
          if (++guard > 5000) throw new Error('Boucle infinie, seed ' + (k + 1));
          g.play(g.bestMove(lvl[g.turn]).id); g.drain(); plies++;
          const tot = g.deck.length + g.hands[0].length + g.hands[1].length + g.table.length +
            g.captured[0].length + g.captured[1].length;
          if (tot !== 40) throw new Error('Cartes perdues/dupliquées, seed ' + (k + 1));
        }
        wins[g.winner]++; lv[lvl[g.winner]][0]++; lv[lvl[1 - g.winner]][1]++;
      }
      return { parties: n, coups: plies, victoires: wins, parNiveau: lv };
    }
  }

  return { Game, CARDS, SUITS, RANKS, NAMES, AR_SUITS, AR_NAMES, DEFAULTS, resolve, gain, combo, cmpCombo };
});
