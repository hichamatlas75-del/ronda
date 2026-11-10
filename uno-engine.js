/* uno-engine.js — Moteur de jeu de type Uno (108 cartes, 2 à 4 joueurs). Sans dépendance, navigateur + Node.
 * Joueur 0 = humain, les autres = IA.
 *   const g = new Uno.Game({ players:3, difficulty:'habitue', target:200 });
 *   g.view(0)                       état public pour le joueur 0
 *   g.play(0, cardId, color, uno)   joue une carte (color obligatoire pour un joker, uno=true pour annoncer)
 *   g.draw1(0) / g.pass(0)          piocher une carte / passer après avoir pioché une carte jouable
 *   g.aiStep()                      joue le tour complet de l'IA courante
 *   g.nextRound()                   manche suivante quand g.roundOver
 * Chaque action renvoie la liste d'événements : play, draw, skip, reverse, uno, unoMissed,
 * reshuffle, roundEnd, gameOver.
 * Cartes : { id, color:'R'|'Y'|'G'|'B'|'W', value:'0'..'9'|'S'(passe)|'R'(sens)|'D2'|'W'|'D4' }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Uno = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const COLORS = ['R', 'Y', 'G', 'B'];
  const CARDS = [];
  const mk = (color, value) => CARDS.push(Object.freeze({ id: CARDS.length, color, value }));
  COLORS.forEach(c => {
    mk(c, '0');
    for (let i = 1; i <= 9; i++) { mk(c, '' + i); mk(c, '' + i); }
    ['S', 'R', 'D2'].forEach(v => { mk(c, v); mk(c, v); });
  });
  for (let i = 0; i < 4; i++) { mk('W', 'W'); mk('W', 'D4'); }

  const isNum = c => c.value.length === 1 && c.value >= '0' && c.value <= '9';
  const pts = c => isNum(c) ? +c.value : (c.color === 'W' ? 50 : 20);
  const ACTION = { S: 1, R: 1, D2: 1 };

  const DEFAULTS = {
    players: 2,           // 2 à 4
    target: 500,          // points pour gagner la partie (somme des cartes restantes des adversaires)
    difficulty: 'habitue',// 'debutant' | 'habitue' | 'maitre'
    strictWild4: true,    // +4 autorisé seulement sans carte de la couleur courante
    seed: null
  };

  class Game {
    constructor(o = {}) {
      this.cfg = Object.assign({}, DEFAULTS, o);
      this.n = Math.max(2, Math.min(4, this.cfg.players | 0));
      this.s = (this.cfg.seed == null ? (Math.random() * 4294967296) >>> 0 : this.cfg.seed) | 0;
      this.scores = Array(this.n).fill(0);
      this.round = 0; this.over = false; this.winner = null; this.events = [];
      this.startRound();
    }

    rnd() { // mulberry32
      this.s = (this.s + 0x6D2B79F5) | 0;
      let t = this.s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    emit(type, d) { this.events.push(Object.assign({ type }, d)); }
    drain() { const e = this.events; this.events = []; return e; }
    nextIdx(p, s = 1) { return ((p + this.dir * s) % this.n + this.n) % this.n; }

    startRound() {
      this.round++;
      this.deck = this.shuffle(CARDS.slice());
      this.hands = Array.from({ length: this.n }, () => this.deck.splice(0, 7));
      const k = this.deck.findIndex(isNum);                     // carte de départ : toujours un chiffre
      this.top = this.deck.splice(k, 1)[0];
      this.discard = [this.top]; this.color = this.top.color; this.dir = 1;
      this.turn = (this.round - 1) % this.n; this.drawn = null;
      this.lacks = Array.from({ length: this.n }, () => new Set());
      this.roundOver = false; this.roundWinner = null;
      this.emit('round', { round: this.round });
    }

    nextRound() { if (!this.over && this.roundOver) this.startRound(); }

    drawCards(p, k) {
      const got = [];
      for (let i = 0; i < k; i++) {
        if (!this.deck.length && this.discard.length > 1) {
          const keep = this.discard.pop();
          this.deck = this.shuffle(this.discard); this.discard = [keep];
          if (this.deck.length) this.emit('reshuffle', {});
        }
        if (!this.deck.length) break;                           // plus aucune carte disponible
        const c = this.deck.pop(); this.hands[p].push(c); got.push(c);
      }
      this.emit('draw', { player: p, count: got.length, cards: got.map(c => c.id) });
      return got;
    }

    isPlayable(p, c) {
      if (c.color === 'W') {
        if (c.value === 'D4' && this.cfg.strictWild4) return !this.hands[p].some(x => x.color === this.color);
        return true;
      }
      return c.color === this.color || (this.top.color !== 'W' && c.value === this.top.value);
    }

    legalMoves(p) {
      if (this.over || this.roundOver || p !== this.turn) return [];
      if (this.drawn != null) return [this.drawn];
      return this.hands[p].filter(c => this.isPlayable(p, c)).map(c => c.id);
    }

    play(p, id, color, uno) {
      if (this.over || this.roundOver) throw new Error('Manche terminée');
      if (p !== this.turn) throw new Error('Pas ton tour');
      const h = this.hands[p], i = h.findIndex(c => c.id === id);
      if (i < 0) throw new Error('Carte absente de la main');
      const c = h[i];
      if (this.drawn != null && this.drawn !== id) throw new Error('Joue la carte piochée ou passe');
      if (!this.isPlayable(p, c)) throw new Error('Carte non jouable');
      if (c.color === 'W' && !COLORS.includes(color)) throw new Error('Choisis une couleur');
      h.splice(i, 1); this.discard.push(c); this.top = c; this.drawn = null;
      this.color = c.color === 'W' ? color : c.color;
      if (c.color !== 'W') this.lacks[p].delete(c.color);
      this.emit('play', { player: p, card: c.id, color: this.color });
      if (h.length === 1) {
        if (uno) this.emit('uno', { player: p });
        else { this.emit('unoMissed', { player: p }); this.drawCards(p, 2); }   // oubli de « UNO ! » : +2 cartes
      }
      let step = 1;
      if (c.value === 'R') { if (this.n === 2) step = 2; else this.dir *= -1; this.emit('reverse', { player: p }); }
      else if (c.value === 'S') { step = 2; this.emit('skip', { player: this.nextIdx(p) }); }
      else if (c.value === 'D2' || c.value === 'D4') {
        const t = this.nextIdx(p); this.drawCards(t, c.value === 'D2' ? 2 : 4);
        this.emit('skip', { player: t }); step = 2;
      }
      if (!h.length) { this.endRound(p); return this.drain(); }
      this.turn = this.nextIdx(p, step);
      return this.drain();
    }

    draw1(p) {
      if (this.over || this.roundOver || p !== this.turn) throw new Error('Pas ton tour');
      if (this.drawn != null) throw new Error('Déjà pioché');
      const had = this.legalMoves(p).length > 0;
      const got = this.drawCards(p, 1);
      if (got.length && this.isPlayable(p, got[0])) this.drawn = got[0].id;   // jouable : jouer ou passer
      else { if (!had) this.lacks[p].add(this.color); this.turn = this.nextIdx(p); }
      return this.drain();
    }

    pass(p) {
      if (p !== this.turn || this.drawn == null) throw new Error('Impossible de passer');
      this.drawn = null; this.turn = this.nextIdx(p);
      return this.drain();
    }

    endRound(w) {
      let pt = 0;
      this.hands.forEach((h, i) => { if (i !== w) h.forEach(c => pt += pts(c)); });
      this.scores[w] += pt; this.roundOver = true; this.roundWinner = w;
      this.emit('roundEnd', { winner: w, points: pt, scores: this.scores.slice() });
      if (this.scores[w] >= this.cfg.target) {
        this.over = true; this.winner = w;
        this.emit('gameOver', { winner: w, scores: this.scores.slice() });
      }
    }

    /* ---------- IA ---------- */

    pickColor(p, level) {
      const cnt = { R: 0, Y: 0, G: 0, B: 0 };
      this.hands[p].forEach(c => { if (c.color !== 'W') cnt[c.color]++; });
      const nx = this.nextIdx(p);
      let best = COLORS[Math.floor(this.rnd() * 4)], bv = -1;
      COLORS.forEach(c => {
        const v = cnt[c] + (level === 'maitre' && this.lacks[nx].has(c) ? 1.5 : 0) + this.rnd() * 0.1;
        if (v > bv) { bv = v; best = c; }
      });
      return best;
    }

    aiStep() {
      const p = this.turn, level = this.cfg.difficulty;
      if (this.over || this.roundOver) return this.drain();
      if (!this.legalMoves(p).length) {
        this.draw1(p);
        if (this.turn !== p || this.drawn == null) return this.drain();
      }
      const moves = this.legalMoves(p).map(id => CARDS[id]);
      let pick;
      if (level === 'debutant' || moves.length === 1) pick = moves[Math.floor(this.rnd() * moves.length)];
      else {
        const cnt = { R: 0, Y: 0, G: 0, B: 0 };
        this.hands[p].forEach(c => { if (c.color !== 'W') cnt[c.color]++; });
        const threat = level === 'maitre' && this.hands[this.nextIdx(p)].length <= 2;
        let bv = -1e9;
        for (const c of moves) {
          let s = pts(c) / 25 + this.rnd() * 0.2;
          if (c.color === 'W') s -= c.value === 'D4' ? (threat ? -8 : 4) : 5;   // garder les jokers sauf menace
          else s += cnt[c.color] * 0.3;
          if (ACTION[c.value]) s += 1 + (threat ? 6 : 0);
          if (s > bv) { bv = s; pick = c; }
        }
      }
      const aiSaysUno = level === 'debutant' ? (this.rnd() >= 0.15) : (level === 'habitue' ? (this.rnd() >= 0.03) : true);
      return this.play(p, pick.id, pick.color === 'W' ? this.pickColor(p, level) : null, aiSaysUno);
    }

    /* ---------- État public / Sauvegarde ---------- */

    view(p = 0) {
      return {
        n: this.n, turn: this.turn, dir: this.dir, top: this.top ? this.top.id : null, color: this.color,
        hand: this.hands[p].map(c => c.id), counts: this.hands.map(h => h.length),
        deck: this.deck.length, drawn: this.drawn, legal: this.legalMoves(p),
        scores: this.scores.slice(), round: this.round, roundOver: this.roundOver,
        roundWinner: this.roundWinner, over: this.over, winner: this.winner
      };
    }

    serialize() {
      return {
        cfg: Object.assign({}, this.cfg),
        s: this.s,
        n: this.n,
        scores: this.scores.slice(),
        round: this.round,
        roundOver: this.roundOver,
        roundWinner: this.roundWinner,
        over: this.over,
        winner: this.winner,
        deck: this.deck.map(c => c.id),
        discard: this.discard.map(c => c.id),
        top: this.top ? this.top.id : null,
        color: this.color,
        dir: this.dir,
        turn: this.turn,
        drawn: this.drawn,
        hands: this.hands.map(h => h.map(c => c.id)),
        lacks: this.lacks.map(set => [...set])
      };
    }

    static restore(o) {
      const g = Object.create(Game.prototype);
      const C = id => CARDS[id];
      Object.assign(g, {
        cfg: Object.assign({}, DEFAULTS, o.cfg || {}),
        s: o.s,
        n: o.n,
        scores: (o.scores || []).slice(),
        round: o.round,
        roundOver: !!o.roundOver,
        roundWinner: o.roundWinner,
        over: !!o.over,
        winner: o.winner,
        deck: (o.deck || []).map(C),
        discard: (o.discard || []).map(C),
        top: o.top != null ? C(o.top) : null,
        color: o.color,
        dir: o.dir || 1,
        turn: o.turn || 0,
        drawn: o.drawn,
        hands: (o.hands || []).map(h => h.map(C)),
        lacks: (o.lacks || []).map(arr => new Set(arr)),
        events: []
      });
      return g;
    }

    // Auto-test : parties IA contre IA (2 à 4 joueurs), vérifie la conservation des 108 cartes.
    static selfTest(n = 60) {
      const L = ['debutant', 'habitue', 'maitre'];
      let steps = 0, rounds = 0;
      for (let k = 0; k < n; k++) {
        const g = new Game({ seed: k + 1, players: 2 + (k % 3), difficulty: L[k % 3], target: 100 });
        let guard = 0;
        while (!g.over) {
          if (g.roundOver) { g.nextRound(); rounds++; }
          if (++guard > 20000) throw new Error('Boucle infinie, seed ' + (k + 1));
          g.aiStep(); g.drain(); steps++;
          const tot = g.deck.length + g.discard.length + g.hands.reduce((a, h) => a + h.length, 0);
          if (tot !== 108) throw new Error('Cartes perdues/dupliquées, seed ' + (k + 1));
        }
      }
      return { parties: n, coups: steps, manches: rounds };
    }
  }

  return { Game, CARDS, COLORS, DEFAULTS };
});
