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

  console.log('Launching headless Chrome for Rules & Trial Mode verification...');
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9223',
    '--no-sandbox',
    '--disable-gpu',
    'about:blank'
  ]);

  try {
    let version = null;
    for (let i = 0; i < 20; i++) {
      try {
        version = await getJson('http://127.0.0.1:9223/json/version');
        if (version && version.webSocketDebuggerUrl) break;
      } catch (e) {
        await delay(200);
      }
    }
    if (!version) throw new Error('Could not connect to Chrome debugging port');

    const targets = await getJson('http://127.0.0.1:9223/json/list');
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
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
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

    console.log('\n--- 1. Testing Rules Modal on index.html (Uno Tab) ---');
    await send('Page.navigate', { url: 'http://localhost:8080/#uno' });
    await delay(1200);

    // Click Uno Tab
    await send('Runtime.evaluate', {
      expression: `document.getElementById('tab-btn-uno').click();`
    });
    await delay(300);

    // Open Rules Modal while on Uno
    let openRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('btn-rules');
        btn.click();
        const modal = document.getElementById('modal-rules');
        const unoTab = document.getElementById('modal-tab-uno');
        const unoPanel = document.getElementById('panel-rules-txt-uno');
        return {
          modalVisible: modal.style.display === 'flex',
          unoTabActive: unoTab.classList.contains('active'),
          unoPanelVisible: unoPanel.style.display === 'flex'
        };
      })()`,
      returnByValue: true
    });
    console.log('Uno Rules Modal open check:', openRes.result?.result?.value);
    assert(openRes.result?.result?.value?.modalVisible, 'Modal must be visible');
    assert(openRes.result?.result?.value?.unoTabActive, 'Uno tab should be active by default on Uno view');
    assert(openRes.result?.result?.value?.unoPanelVisible, 'Uno rules text panel should be visible');

    // Switch to Trial Mode
    let trialSwitchRes = await send('Runtime.evaluate', {
      expression: `(() => {
        document.getElementById('tab-rules-trial').click();
        const trialPanel = document.getElementById('panel-rules-trial');
        const unoSteps = document.getElementById('trial-steps-uno');
        const inst = document.getElementById('trial-instructions').innerText;
        return {
          trialVisible: trialPanel.style.display === 'flex',
          unoStepsVisible: unoSteps.style.display === 'flex',
          instructions: inst
        };
      })()`,
      returnByValue: true
    });
    console.log('Uno Trial Mode switch check:', trialSwitchRes.result?.result?.value);
    assert(trialSwitchRes.result?.result?.value?.trialVisible, 'Trial mode panel must be visible');
    assert(trialSwitchRes.result?.result?.value?.unoStepsVisible, 'Uno trial steps must be visible');

    // Test correct play in Uno Trial Mode (uno-match)
    let trialPlayRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const handCards = Array.from(document.querySelectorAll('#trial-hand-row .card'));
        // Find correct card (7 of oros or 3 of copas)
        handCards[0].click();
        const fb = document.getElementById('trial-feedback').innerText;
        return { fb };
      })()`,
      returnByValue: true
    });
    console.log('Uno trial play result:', trialPlayRes.result?.result?.value);
    assert(trialPlayRes.result?.result?.value?.fb.length > 0, 'Trial feedback should display');

    // Switch scenario to uno-shout (Bouton UNO !)
    let unoShoutRes = await send('Runtime.evaluate', {
      expression: `(() => {
        document.getElementById('trial-step-uno-shout').click();
        const unoWrap = document.getElementById('trial-uno-btn-wrap');
        const handCards = Array.from(document.querySelectorAll('#trial-hand-row .card'));
        
        // 1. Play without clicking UNO -> should warn penalty
        handCards[0].click();
        const fbWithoutUno = document.getElementById('trial-feedback').innerText;

        // 2. Click UNO button then play -> should succeed
        const unoBtn = document.getElementById('trial-uno-btn');
        unoBtn.click();
        handCards[0].click();
        const fbWithUno = document.getElementById('trial-feedback').innerText;

        return {
          unoWrapVisible: unoWrap.style.display === 'flex',
          fbWithoutUno,
          fbWithUno
        };
      })()`,
      returnByValue: true
    });
    console.log('Uno Shout scenario result:', unoShoutRes.result?.result?.value);
    assert(unoShoutRes.result?.result?.value?.unoWrapVisible, 'UNO button should be visible in shout scenario');
    assert(unoShoutRes.result?.result?.value?.fbWithoutUno.includes('عقوبة') || unoShoutRes.result?.result?.value?.fbWithoutUno.includes('Pénalité'), 'Should warn penalty when UNO not clicked');
    assert(unoShoutRes.result?.result?.value?.fbWithUno.includes('أونو') || unoShoutRes.result?.result?.value?.fbWithUno.includes('Bravo'), 'Should succeed when UNO is clicked');

    // Close modal
    await send('Runtime.evaluate', {
      expression: `document.getElementById('btn-close-rules').click();`
    });

    console.log('\n--- 2. Testing Standalone uno-maroc.html Rules & Trial Mode ---');
    await send('Page.navigate', { url: 'http://localhost:8080/uno-maroc.html' });
    await delay(1200);

    let standaloneRulesRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('btn-rules');
        btn.click();
        const modal = document.getElementById('modal-rules');
        const unoTab = document.getElementById('modal-tab-uno');
        const unoPanel = document.getElementById('panel-rules-txt-uno');
        return {
          modalVisible: modal.style.display === 'flex',
          unoTabActive: unoTab.classList.contains('active'),
          unoPanelVisible: unoPanel.style.display === 'flex'
        };
      })()`,
      returnByValue: true
    });
    console.log('Standalone Uno rules open check:', standaloneRulesRes.result?.result?.value);
    assert(standaloneRulesRes.result?.result?.value?.modalVisible, 'Modal must open on standalone uno-maroc.html');
    assert(standaloneRulesRes.result?.result?.value?.unoTabActive, 'Uno tab active');

    // Test trial mode in uno-maroc.html
    let standaloneTrialRes = await send('Runtime.evaluate', {
      expression: `(() => {
        document.getElementById('tab-rules-trial').click();
        document.getElementById('trial-step-uno-rey').click();
        const handCards = Array.from(document.querySelectorAll('#trial-hand-row .card'));
        handCards[0].click();
        const fb = document.getElementById('trial-feedback').innerText;
        return { fb };
      })()`,
      returnByValue: true
    });
    console.log('Standalone Rey +2 trial result:', standaloneTrialRes.result?.result?.value);
    assert(standaloneTrialRes.result?.result?.value?.fb.includes('الملك') || standaloneTrialRes.result?.result?.value?.fb.includes('REY'), 'Rey trial should trigger');

    console.log('\n--- 3. Verifying Zero JavaScript Errors ---');
    console.log('Captured JS Errors:', jsErrors);
    assert(jsErrors.length === 0, 'Must have zero JavaScript errors');
    console.log('SUCCESS: Rules and Interactive Trial Mode verified with 0 errors across index.html and uno-maroc.html!');

    ws.close();
  } finally {
    if (chrome) chrome.kill('SIGTERM');
    if (localServer) localServer.close();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
