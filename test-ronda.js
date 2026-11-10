const Ronda = require('./ronda-engine.js');
const assert = require('assert');

console.log('--- 1. Testing Engine Self-Test (60 IA vs IA games) ---');
const testRes = Ronda.Game.selfTest(60);
console.log('Self-test results:', testRes);
assert(testRes.parties === 60, 'Should complete 60 games');
assert(testRes.victoires[0] + testRes.victoires[1] === 60, 'All games should have a winner');

console.log('--- 2. Testing Serialization and Restoration ---');
const g1 = new Ronda.Game({ target: 21, difficulty: 'maitre' });
g1.play(g1.legalMoves()[0]);
const serialized = g1.serialize();
const g2 = Ronda.Game.restore(serialized);
assert.deepStrictEqual(g1.view(0), g2.view(0), 'Restored game view must match original');

console.log('--- 3. Testing Manual Announce Mode ---');
const gManual = new Ronda.Game({ manualAnnounce: true, seed: 42 });
const viewManual = gManual.view(0);
console.log('Initial manual announce view pending combo:', viewManual.pendingCombo);
if (viewManual.pendingCombo) {
  const p = gManual.pendingCombos[0];
  console.log('Player 0 has pending combo:', p);
  const announced = gManual.announce(0);
  assert(announced === true, 'Player should be able to announce pending combo');
  console.log('Combo successfully announced manually!');
}

console.log('--- 4. Testing Missed Combo in Manual Mode ---');
const gMiss = new Ronda.Game({ manualAnnounce: true, seed: 42 });
if (gMiss.pendingCombos && gMiss.pendingCombos[0]) {
  const kind = gMiss.pendingCombos[0].kind;
  const initialScore = gMiss.scores[0];
  // Play without calling announce(0)
  const ev = gMiss.play(gMiss.legalMoves()[0]);
  const missedEv = ev.find(e => e.type === 'comboMissed');
  assert(missedEv, 'Should emit comboMissed event when playing without announcing');
  assert(gMiss.scores[0] === initialScore, 'Score should NOT increase if combo was missed');
  console.log('Combo successfully missed as expected!');
}

console.log('--- 5. Testing Custom Rules (41 target, majority, tringa 10) ---');
const gCustom = new Ronda.Game({
  target: 41,
  tringaPts: 10,
  rondaPts: 2,
  missaPts: 2,
  bountPts: 2,
  cardsScoring: 'majority',
  missaOnLastPlay: true
});
assert.strictEqual(gCustom.cfg.target, 41);
assert.strictEqual(gCustom.cfg.tringaPts, 10);
assert.strictEqual(gCustom.cfg.rondaPts, 2);
assert.strictEqual(gCustom.cfg.missaPts, 2);
assert.strictEqual(gCustom.cfg.bountPts, 2);
assert.strictEqual(gCustom.cfg.cardsScoring, 'majority');
assert.strictEqual(gCustom.cfg.missaOnLastPlay, true);
console.log('--- 6. Testing Uno Engine Self-Test (60 IA vs IA games) ---');
const Uno = require('./uno-engine.js');
const unoTestRes = Uno.Game.selfTest(60);
console.log('Uno self-test results:', unoTestRes);
assert(unoTestRes.parties === 60, 'Should complete 60 Uno games');
assert(unoTestRes.coups > 0, 'Uno games must execute plies');

console.log('=== ALL TESTS PASSED! ===');

