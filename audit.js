const Ronda = require('./ronda-engine.js');
const assert = require('assert');

console.log('=== RUNNING COMPREHENSIVE RONDA AUDIT ===');

// 1. Test 200 random games with random parameters
let totalGames = 100;
let errors = [];

for (let i = 0; i < totalGames; i++) {
  try {
    const target = (i % 2 === 0) ? 21 : 41;
    const cardsScoring = (i % 3 === 0) ? 'majority' : 'beyond20';
    const missaOnLastPlay = (i % 2 === 1);
    const manualAnnounce = (i % 2 === 0);
    const levels = ['debutant', 'habitue', 'maitre'];
    const diff = levels[i % 3];

    const g = new Ronda.Game({
      seed: i * 77 + 13,
      target,
      cardsScoring,
      missaOnLastPlay,
      manualAnnounce,
      difficulty: diff
    });

    let moves = 0;
    while (!g.over && moves < 2000) {
      moves++;
      // Test serialize & restore every 10 moves
      if (moves % 10 === 0) {
        const ser = g.serialize();
        const restored = Ronda.Game.restore(ser);
        assert.deepStrictEqual(g.view(0), restored.view(0), `Mismatch on restore at move ${moves}`);
      }

      if (g.cfg.manualAnnounce && g.pendingCombos && g.pendingCombos[0]) {
        // Player 0 decides to announce 80% of the time
        if (Math.random() < 0.8) {
          g.announce(0);
        }
        if (g.over) break;
      }

      const move = g.bestMove();
      if (!move) {
        assert(g.over, 'bestMove returned null only when over');
        break;
      }
      assert(g.legalMoves().includes(move.id), `Move ${move.id} must be legal`);
      g.play(move.id);
      g.drain();

      // Check card conservation
      const totalCards = g.deck.length + g.hands[0].length + g.hands[1].length +
        g.table.length + g.captured[0].length + g.captured[1].length;
      assert.strictEqual(totalCards, 40, `Card conservation failed at move ${moves}: got ${totalCards}`);
    }

    assert(g.over, `Game ${i} should be over`);
    assert(g.winner === 0 || g.winner === 1, `Game ${i} must have valid winner`);
  } catch (err) {
    errors.push({ game: i, error: err.message, stack: err.stack });
  }
}

if (errors.length > 0) {
  console.error(`Ronda audit found ${errors.length} errors:`, errors);
  process.exit(1);
} else {
  console.log(`Ronda audit passed! All ${totalGames} games completed with 100% card conservation and valid states.`);
}

console.log('\n=== RUNNING COMPREHENSIVE UNO MAROC AUDIT ===');
const Uno = require('./uno-engine.js');
let unoErrors = [];
let unoGames = 100;

for (let i = 0; i < unoGames; i++) {
  try {
    const players = 2 + (i % 3); // 2, 3, or 4 players
    const levels = ['debutant', 'habitue', 'maitre'];
    const diff = levels[i % 3];
    const target = 150;

    const g = new Uno.Game({
      seed: i * 133 + 7,
      players,
      difficulty: diff,
      target
    });

    let moves = 0;
    while (!g.over && moves < 4000) {
      if (g.roundOver) g.nextRound();
      moves++;

      // Test serialize & restore every 15 moves
      if (moves % 15 === 0) {
        const ser = g.serialize();
        const restored = Uno.Game.restore(ser);
        assert.deepStrictEqual(g.view(0), restored.view(0), `Uno mismatch on restore at move ${moves}`);
        assert.strictEqual(g.top.id, restored.top.id, `Uno top card mismatch at move ${moves}`);
      }

      g.aiStep();
      g.drain();

      // Check card conservation
      const totalCards = g.deck.length + g.discard.length + g.hands.reduce((sum, h) => sum + h.length, 0);
      assert.strictEqual(totalCards, 108, `Uno card conservation failed at move ${moves}: got ${totalCards}`);
    }

    assert(g.over, `Uno game ${i} should be over`);
    assert(g.winner !== null && g.winner >= 0 && g.winner < players, `Uno game ${i} must have valid winner`);
  } catch (err) {
    unoErrors.push({ game: i, error: err.message, stack: err.stack });
  }
}

if (unoErrors.length > 0) {
  console.error(`Uno audit found ${unoErrors.length} errors:`, unoErrors);
  process.exit(1);
} else {
  console.log(`Uno audit passed! All ${unoGames} games completed with 100% card conservation and valid states.`);
  console.log('\n=== ALL AUDITS PASSED SUCCESSFULLY (100 Ronda + 100 Uno) ===');
}
