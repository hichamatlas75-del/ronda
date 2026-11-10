const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');
const { startServer } = require('./server.js');

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function isServerRunning(port = 8080) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/index.html`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function run() {
  let localServer = null;
  if (!(await isServerRunning(8080))) {
    console.log('Port 8080 not running, auto-starting server...');
    localServer = await startServer(8080);
  }

  console.log('Launching headless Chrome for Joker Hand Modal verification...');
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-sandbox',
    '--disable-gpu',
    'about:blank'
  ]);

  try {
    let version = null;
    for (let i = 0; i < 20; i++) {
      try {
        version = await getJson('http://127.0.0.1:9222/json/version');
        if (version && version.webSocketDebuggerUrl) break;
      } catch (e) {
        await delay(200);
      }
    }
    if (!version) throw new Error('Could not connect to Chrome debugging port');

    const targets = await getJson('http://127.0.0.1:9222/json/list');
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    const wsUrl = pageTarget.webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let msgId = 1;
    const callbacks = new Map();
    const jsErrors = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        jsErrors.push(msg.params.exceptionDetails);
      }
      if (msg.id && callbacks.has(msg.id)) {
        const cb = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        cb(msg);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.result && res.result.exceptionDetails) {
        throw new Error('Evaluation error: ' + JSON.stringify(res.result.exceptionDetails));
      }
      return res.result ? res.result.result ? res.result.result.value : undefined : undefined;
    }

    await send('Page.enable');
    await send('Runtime.enable');

    // ==========================================
    // 1. Test index.html Joker Color Picker Modal
    // ==========================================
    console.log('\n--- 1. Testing Joker Hand in index.html ---');
    await send('Page.navigate', { url: 'http://127.0.0.1:8080/index.html' });
    await delay(1000);

    // Switch to Uno tab
    await evaluate(`document.getElementById('tab-btn-uno').click()`);
    await delay(300);

    // Set known hand for player 0: 1 Wild card + 2 Copas (R) + 1 Bastos (G)
    // Find Wild card ID
    const unoPrepRes = await evaluate(`
      (() => {
        const g = UnoGameController.getGame();
        const wildId = Uno.CARDS.findIndex(c => c.color === "W" && c.value === "W");
        const copas1 = Uno.CARDS.findIndex(c => c.color === "R" && c.value === "1");
        const copas2 = Uno.CARDS.findIndex(c => c.color === "R" && c.value === "2");
        const bastos = Uno.CARDS.findIndex(c => c.color === "G" && c.value === "5");
        
        g.hands[0] = [Uno.CARDS[wildId], Uno.CARDS[copas1], Uno.CARDS[copas2], Uno.CARDS[bastos]];
        g.turn = 0;
        g.drawn = null;
        UnoGameController.render();

        return {
          hand: g.hands[0].map(c => c.id),
          wildId
        };
      })()
    `);
    console.log('Prepared hand with Joker:', unoPrepRes);

    // Click the Wild card in the hand
    const clickWildRes = await evaluate(`
      (() => {
        const card = document.querySelector('#uno-hand [data-id="${unoPrepRes.wildId}"]');
        if (!card) return { found: false };
        card.click();
        
        const modal = document.getElementById('modal-uno-colors');
        const isVisible = modal && modal.style.display === 'flex';
        const previewCards = document.querySelectorAll('#uno-cp-hand .card').length;
        const countBadges = Array.from(document.querySelectorAll('#uno-cp .uno-cp-btn-count')).map(el => el.textContent.trim());
        const countTotalText = document.getElementById('uno-cp-hand-count').textContent.trim();
        
        return {
          found: true,
          isVisible,
          previewCards,
          countBadges,
          countTotalText
        };
      })()
    `);
    console.log('Modal opened after clicking Joker:', clickWildRes);
    assert.strictEqual(clickWildRes.isVisible, true, 'Modal #modal-uno-colors must be visible');
    assert.strictEqual(clickWildRes.previewCards, 3, 'Preview must show the remaining 3 cards in hand');
    assert(clickWildRes.countTotalText.includes('3'), 'Count total label must show 3 cards');

    // Test close button ✕
    const closeRes = await evaluate(`
      (() => {
        document.getElementById('btn-close-uno-colors').click();
        const modal = document.getElementById('modal-uno-colors');
        return { isVisible: modal && modal.style.display !== 'none' };
      })()
    `);
    console.log('Close button clicked:', closeRes);
    assert.strictEqual(closeRes.isVisible, false, 'Modal should be hidden after clicking close');

    // Reopen and pick Copas (R)
    await evaluate(`document.querySelector('#uno-hand [data-id="${unoPrepRes.wildId}"]').click()`);
    await evaluate(`document.querySelector('#uno-cp button[data-c="R"]').click()`);
    await delay(600); // Wait for card flight animation and engine play

    const pickColorRes = await evaluate(`
      (() => {
        const modal = document.getElementById('modal-uno-colors');
        return {
          modalClosed: !modal || modal.style.display === 'none',
          topCardColor: UnoGameController.getGame().color
        };
      })()
    `);
    console.log('Color chosen:', pickColorRes);
    assert.strictEqual(pickColorRes.modalClosed, true, 'Modal should close after picking color');
    assert.strictEqual(pickColorRes.topCardColor, 'R', 'Top color must now be Copas (R)');

    // ==========================================
    // 2. Test Standalone uno-maroc.html Joker Hand
    // ==========================================
    console.log('\n--- 2. Testing Joker Hand in uno-maroc.html ---');
    await send('Page.navigate', { url: 'http://127.0.0.1:8080/uno-maroc.html' });
    await delay(1000);

    const unoMarocPrep = await evaluate(`
      (() => {
        const wildId = Uno.CARDS.findIndex(c => c.color === "W" && c.value === "W");
        const oros1 = Uno.CARDS.findIndex(c => c.color === "Y" && c.value === "3");
        const espadas1 = Uno.CARDS.findIndex(c => c.color === "B" && c.value === "7");
        
        g.hands[0] = [Uno.CARDS[wildId], Uno.CARDS[oros1], Uno.CARDS[espadas1]];
        g.turn = 0;
        g.drawn = null;
        render();

        return {
          wildId,
          hand: g.hands[0].map(c => c.id)
        };
      })()
    `);
    console.log('Standalone Uno prepared hand:', unoMarocPrep);

    // Click the Wild card
    const clickWildMaroc = await evaluate(`
      (() => {
        const card = document.querySelector('#hand [data-id="${unoMarocPrep.wildId}"]');
        if (!card) return { found: false };
        card.click();
        
        const modal = document.getElementById('colors');
        const isVisible = modal && modal.style.display === 'flex';
        const previewCards = document.querySelectorAll('#colors-hand .card').length;
        const countBadges = Array.from(document.querySelectorAll('#cp .uno-cp-btn-count')).map(el => el.textContent.trim());
        const countTotalText = document.getElementById('colors-hand-count').textContent.trim();

        return {
          found: true,
          isVisible,
          previewCards,
          countBadges,
          countTotalText
        };
      })()
    `);
    console.log('Standalone Uno modal opened:', clickWildMaroc);
    assert.strictEqual(clickWildMaroc.isVisible, true, '#colors modal must be visible');
    assert.strictEqual(clickWildMaroc.previewCards, 2, 'Must display the 2 remaining cards');

    // Test close button in uno-maroc.html
    const closeMaroc = await evaluate(`
      (() => {
        document.getElementById('btn-close-colors').click();
        const modal = document.getElementById('colors');
        return { isVisible: modal && modal.style.display !== 'none' };
      })()
    `);
    console.log('Standalone close button result:', closeMaroc);
    assert.strictEqual(closeMaroc.isVisible, false, 'Standalone modal should be closed');

    // Test backdrop click to close
    await evaluate(`document.querySelector('#hand [data-id="${unoMarocPrep.wildId}"]').click()`);
    const backdropClose = await evaluate(`
      (() => {
        const modal = document.getElementById('colors');
        // Click on the backdrop (the #colors element itself)
        modal.dispatchEvent(new MouseEvent('click', { bubbles: true, target: modal }));
        return { isVisible: modal.style.display !== 'none' };
      })()
    `);
    console.log('Backdrop click close result:', backdropClose);
    assert.strictEqual(backdropClose.isVisible, false, 'Modal should close when clicking backdrop');

    // Reopen and choose Oros (Y)
    await evaluate(`document.querySelector('#hand [data-id="${unoMarocPrep.wildId}"]').click()`);
    await evaluate(`document.querySelector('#cp button[data-c="Y"]').click()`);
    await delay(600); // Wait for card flight animation and engine play

    const pickColorMaroc = await evaluate(`
      (() => {
        const modal = document.getElementById('colors');
        return {
          modalClosed: !modal || modal.style.display === 'none',
          topCardColor: g.color
        };
      })()
    `);
    console.log('Standalone color chosen:', pickColorMaroc);
    assert.strictEqual(pickColorMaroc.modalClosed, true);
    assert.strictEqual(pickColorMaroc.topCardColor, 'Y');

    console.log('\n--- 3. Verifying Zero JavaScript Errors ---');
    console.log('Captured JS Errors:', jsErrors);
    assert.strictEqual(jsErrors.length, 0, 'Must have zero JS errors');
    console.log('SUCCESS: Joker remaining hand display and color selection fully verified!');

    ws.close();
  } finally {
    chrome.kill();
    if (localServer) {
      await new Promise(res => localServer.close(res));
    }
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
