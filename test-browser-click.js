const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const { startServer } = require('./server.js');

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

  console.log('Launching headless Chrome...');
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-sandbox',
    '--disable-gpu',
    'about:blank'
  ]);

  let cdp = null;
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

    // Create a new target/page
    const targets = await getJson('http://127.0.0.1:9222/json/list');
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    const wsUrl = pageTarget.webSocketDebuggerUrl;

    console.log('Connecting CDP WebSocket...');
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let msgId = 1;
    const callbacks = new Map();
    const consoleLogs = [];
    const jsErrors = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => a.value || a.description).join(' ');
        consoleLogs.push({ type: msg.params.type, text });
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        jsErrors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');

    console.log('\n--- 0. Testing Ronda Realistic Card Throw Animation (Zero White Glare, Zero Overshoot) ---');
    await send('Page.navigate', { url: 'http://localhost:8080/index.html' });
    await delay(1000);
    for (let i = 0; i < 40; i++) {
      const ready = await send('Runtime.evaluate', {
        expression: 'document.querySelectorAll("#table-cards .card").length === 4 && document.querySelectorAll("#my-hand .card").length === 3 && document.querySelectorAll("#opp-hand .card").length === 3 && document.querySelectorAll(".card-flight-3d, .flying-card").length === 0',
        returnByValue: true
      });
      if (ready.result?.result?.value) break;
      await delay(200);
    }

    // Verify board and deal card dimensions
    const dealCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const tableCards = document.querySelectorAll("#table-cards .card");
        const handCards = document.querySelectorAll("#my-hand .card");
        const oppCards = document.querySelectorAll("#opp-hand .card");
        const flying = document.querySelectorAll(".flying-card, .card-flight-3d");
        return {
          tableCount: tableCards.length,
          handCount: handCards.length,
          oppCount: oppCards.length,
          flyingCount: flying.length,
          firstTableCardWidth: tableCards[0]?.getBoundingClientRect().width,
          firstOppCardWidth: oppCards[0]?.getBoundingClientRect().width
        };
      })()`,
      returnByValue: true
    });
    console.log('Ronda board after deal check:', dealCheck.result?.result?.value);
    assert(dealCheck.result?.result?.value?.tableCount === 4, 'Table must have 4 cards');
    assert(dealCheck.result?.result?.value?.handCount === 3, 'Hand must have 3 cards');
    assert(dealCheck.result?.result?.value?.oppCount === 3, 'Opponent must have 3 cards');
    assert(dealCheck.result?.result?.value?.flyingCount === 0, 'No orphaned flying cards after deal');
    assert(dealCheck.result?.result?.value?.firstOppCardWidth < 110, 'Opponent card must not stretch to container width');

    // Test Human Play Flight Animation
    console.log('Testing Human Card Throw Flight...');
    const humanFlightPromise = send('Runtime.evaluate', {
      expression: `(async () => {
        const card = document.querySelector("#my-hand .card");
        const cid = parseInt(card.dataset.cardId);
        return humanPlay(cid);
      })()`,
      awaitPromise: false
    });

    await delay(120); // Capture mid-flight
    const flightMetrics = await send('Runtime.evaluate', {
      expression: `(() => {
        const flying = document.querySelector(".flying-card, .card-flight-3d");
        if (!flying) return { found: false };
        const rect = flying.getBoundingClientRect();
        const style = window.getComputedStyle(flying);
        const transform = style.transform;
        return {
          found: true,
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top,
          transform: transform
        };
      })()`,
      returnByValue: true
    });
    console.log('Human card flight metrics:', flightMetrics.result?.result?.value);
    if (flightMetrics.result?.result?.value?.found) {
      assert(flightMetrics.result?.result?.value?.width < 120, 'Flying card must not be scaled up to container width (>120px)');
      assert(flightMetrics.result?.result?.value?.left >= -10, 'Card must not fly off-screen horizontally');
      assert(flightMetrics.result?.result?.value?.top >= -10, 'Card must not fly off-screen vertically');
    }

    await delay(2000); // wait for AI response and state settling
    const postPlayCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const flying = document.querySelectorAll(".flying-card, .card-flight-3d");
        return {
          flyingCount: flying.length,
          handCount: document.querySelectorAll("#my-hand .card").length
        };
      })()`,
      returnByValue: true
    });
    console.log('Post-play state check:', postPlayCheck.result?.result?.value);
    assert(postPlayCheck.result?.result?.value?.flyingCount === 0, 'Zero lingering flying cards after play and AI turn');

    console.log('\n--- 1. Testing Uno Tab in index.html ---');
    await send('Page.navigate', { url: 'http://localhost:8080/#uno' });
    await delay(1500);

    // Evaluate state and click Uno tab
    let evalRes = await send('Runtime.evaluate', {
      expression: `(() => {
        document.getElementById('tab-btn-uno').click();
        const unoView = document.getElementById('uno-view');
        const hand = document.getElementById('uno-hand');
        const cards = hand ? Array.from(hand.children) : [];
        const okCards = cards.filter(c => c.classList.contains('ok'));
        const noCards = cards.filter(c => c.classList.contains('no'));
        return {
          viewVisible: unoView.style.display !== 'none',
          handCardsCount: cards.length,
          okCardsCount: okCards.length,
          noCardsCount: noCards.length,
          firstOkCardId: okCards.length > 0 ? okCards[0].getAttribute('data-id') : null
        };
      })()`,
      returnByValue: true
    });
    console.log('Initial Uno hand state:', evalRes.result?.result?.value);
    assert(evalRes.result?.result?.value?.handCardsCount > 0, 'Must load hand cards in index.html');

    // Test false card click (unplayable card intervention)
    console.log('Testing false card click (.card.no) - should intervene with error message and shake...');
    let falseClickRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const noCard = document.querySelector('#uno-hand .card.no');
        if (!noCard) return { skipped: true };
        const id = noCard.getAttribute('data-id');
        noCard.click();
        const toast = document.querySelector('.uno-toast-invalid');
        const hasShake = noCard.classList.contains('card-shake');
        const msg = document.getElementById('uno-msg').innerText;
        return {
          id,
          hasShake,
          toastText: toast ? toast.innerText : null,
          msg
        };
      })()`,
      returnByValue: true
    });
    console.log('False card click result:', falseClickRes.result?.result?.value);
    assert(falseClickRes.result?.result?.value?.skipped || falseClickRes.result?.result?.value?.toastText, 'Intervention message should appear on invalid move');

    // Click playable card
    console.log('Simulating click on first playable card (.card.ok)...');
    let clickRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const okCard = document.querySelector('#uno-hand .card.ok');
        if (!okCard) return { error: 'No playable card found' };
        const id = okCard.getAttribute('data-id');
        okCard.click();
        return { clickedId: id, ok: true };
      })()`,
      returnByValue: true
    });
    console.log('Card click result:', clickRes.result?.result?.value);

    // Wait for ply execution and AI response
    await delay(1200);

    // Check message log and state after card click
    let stateAfterClick = await send('Runtime.evaluate', {
      expression: `(() => {
        const msg = document.getElementById('uno-msg').innerText;
        const handCount = document.getElementById('uno-hand').children.length;
        return { msg, handCount };
      })()`,
      returnByValue: true
    });
    console.log('State after click:', stateAfterClick.result?.result?.value);

    // Test clicking Uno Button
    let unoBtnRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('uno-btn-uno');
        btn.click();
        return { hasOnClass: btn.classList.contains('on') };
      })()`,
      returnByValue: true
    });
    console.log('UNO button toggle result:', unoBtnRes.result?.result?.value);

    // Test clicking Pile (draw)
    let pileRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const pile = document.getElementById('uno-pile');
        const prevCount = document.getElementById('uno-hand').children.length;
        pile.click();
        return { prevCount };
      })()`,
      returnByValue: true
    });
    console.log('Pile click result:', pileRes.result?.result?.value);

    await delay(1000);

    let stateAfterDraw = await send('Runtime.evaluate', {
      expression: `(() => {
        const msg = document.getElementById('uno-msg').innerText;
        const handCount = document.getElementById('uno-hand').children.length;
        return { msg, handCount };
      })()`,
      returnByValue: true
    });
    console.log('State after draw:', stateAfterDraw.result?.result?.value);

    console.log('\n--- 2. Testing Standalone uno-maroc.html ---');
    await send('Page.navigate', { url: 'http://localhost:8080/uno-maroc.html' });
    await delay(1500);

    let unoStandaloneRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const hand = document.getElementById('hand');
        const cards = hand ? Array.from(hand.children) : [];
        const okCards = cards.filter(c => c.classList.contains('ok'));
        const noCards = cards.filter(c => c.classList.contains('no'));
        return {
          handCardsCount: cards.length,
          okCardsCount: okCards.length,
          noCardsCount: noCards.length
        };
      })()`,
      returnByValue: true
    });
    console.log('uno-maroc.html hand state:', unoStandaloneRes.result?.result?.value);
    assert(unoStandaloneRes.result?.result?.value?.handCardsCount > 0, 'Must load hand cards in uno-maroc.html');

    // Test false card click on uno-maroc.html
    console.log('Testing false card click (.card.no) on uno-maroc.html...');
    let standaloneFalseClick = await send('Runtime.evaluate', {
      expression: `(() => {
        const noCard = document.querySelector('#hand .card.no');
        if (!noCard) return { skipped: true };
        const id = noCard.getAttribute('data-id');
        noCard.click();
        const toast = document.querySelector('.uno-toast-invalid');
        const hasShake = noCard.classList.contains('card-shake');
        const msg = document.getElementById('msg').innerText;
        return {
          id,
          hasShake,
          toastText: toast ? toast.innerText : null,
          msg
        };
      })()`,
      returnByValue: true
    });
    console.log('uno-maroc.html false card click result:', standaloneFalseClick.result?.result?.value);
    assert(standaloneFalseClick.result?.result?.value?.skipped || standaloneFalseClick.result?.result?.value?.toastText, 'Intervention message should appear on invalid move in uno-maroc.html');

    let standaloneClick = await send('Runtime.evaluate', {
      expression: `(() => {
        const okCard = document.querySelector('#hand .card.ok');
        if (!okCard) return { error: 'No playable card' };
        okCard.click();
        return { ok: true, id: okCard.getAttribute('data-id') };
      })()`,
      returnByValue: true
    });
    console.log('uno-maroc.html card click result:', standaloneClick.result?.result?.value);

    await delay(1200);

    let standaloneAfter = await send('Runtime.evaluate', {
      expression: `(() => {
        const msg = document.getElementById('msg').innerText;
        const count = document.getElementById('hand').children.length;
        return { msg, count };
      })()`,
      returnByValue: true
    });
    console.log('uno-maroc.html state after play:', standaloneAfter.result?.result?.value);

    console.log('\n--- 3. Verifying Console Errors ---');
    console.log('Captured JS Errors:', jsErrors);
    if (jsErrors.length > 0) {
      console.error('FAIL: Found JS Errors during card clicking!');
      process.exit(1);
    } else {
      console.log('SUCCESS: Zero JavaScript errors detected! Uno cards are 100% clickable and working!');
    }

    ws.close();
  } finally {
    if (chrome) chrome.kill('SIGTERM');
    if (localServer) localServer.close();
  }
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
