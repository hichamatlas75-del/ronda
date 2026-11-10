/* ronda-sound.js — Sons et voix pour ronda-engine.js (WebAudio & fichiers audio).
 * - Réglage du volume (0 à 1) et mode muet persistant (localStorage)
 * - Répliques audio authentiques en Darija marocain et en Français
 * - Effets sonores réalistes de cartes (claquement, glissement, prise, carillon de victoire)
 * - Repli automatique sur WebAudio synthétisé et SpeechSynthesis si les fichiers sont indisponibles
 */
(function (root) {
  'use strict';

  let ctx = null;
  let masterGain = null;
  const listeners = [];

  // État audio persistant
  let isMuted = false;
  let volume = 0.8;
  let voiceLang = 'darija'; // 'darija' | 'fr' | 'none'

  try {
    if (typeof localStorage !== 'undefined') {
      const savedMute = localStorage.getItem('ronda_muted');
      if (savedMute !== null) isMuted = savedMute === 'true';
      const savedVol = localStorage.getItem('ronda_volume');
      if (savedVol !== null) volume = Math.max(0, Math.min(1, parseFloat(savedVol)));
      const savedLang = localStorage.getItem('ronda_voice_lang');
      if (savedLang) voiceLang = savedLang;
    }
  } catch (e) {}

  function getAudioContext() {
    if (!ctx && (root.AudioContext || root.webkitAudioContext)) {
      ctx = new (root.AudioContext || root.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = isMuted ? 0 : volume;
      masterGain.connect(ctx.destination);
    }
    return ctx;
  }

  function applyVolume() {
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(isMuted ? 0 : volume, ctx.currentTime);
    }
    notifyListeners();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ronda_muted', String(isMuted));
        localStorage.setItem('ronda_volume', String(volume));
        localStorage.setItem('ronda_voice_lang', voiceLang);
      }
    } catch (e) {}
  }

  function notifyListeners() {
    listeners.forEach(fn => {
      try { fn({ muted: isMuted, volume, voiceLang }); } catch (e) {}
    });
  }

  // Fichiers audio par défaut (organisés par langue et SFX)
  const files = {
    darija: {
      ronda: 'audio/darija/ronda.mp3',
      tringa: 'audio/darija/tringa.mp3',
      missa: 'audio/darija/missa.mp3',
      bount: 'audio/darija/bount.mp3',
      win: 'audio/darija/win.mp3',
      lose: 'audio/darija/lose.mp3',
      uno: 'audio/darija/uno.mp3',
      uno_missed: 'audio/darija/uno_missed.mp3',
      skip: 'audio/darija/skip.mp3',
      reverse: 'audio/darija/reverse.mp3',
      draw2: 'audio/darija/draw2.mp3',
      draw4: 'audio/darija/draw4.mp3',
      wild: 'audio/darija/wild.mp3',
      uno_win: 'audio/darija/uno_win.mp3',
      uno_lose: 'audio/darija/uno_lose.mp3'
    },
    fr: {
      ronda: 'audio/fr/ronda.mp3',
      tringa: 'audio/fr/tringa.mp3',
      missa: 'audio/fr/missa.mp3',
      bount: 'audio/fr/bount.mp3',
      win: 'audio/fr/win.mp3',
      lose: 'audio/fr/lose.mp3',
      uno: 'audio/fr/uno.mp3',
      uno_missed: 'audio/fr/uno_missed.mp3',
      skip: 'audio/fr/skip.mp3',
      reverse: 'audio/fr/reverse.mp3',
      draw2: 'audio/fr/draw2.mp3',
      draw4: 'audio/fr/draw4.mp3',
      wild: 'audio/fr/wild.mp3',
      uno_win: 'audio/fr/uno_win.mp3',
      uno_lose: 'audio/fr/uno_lose.mp3'
    },
    sfx: {
      slap: 'audio/sfx/slap.mp3',
      deal: 'audio/sfx/deal.mp3',
      capture: 'audio/sfx/capture.mp3',
      chime: 'audio/sfx/chime.mp3',
      swoosh: 'audio/sfx/swoosh.mp3',
      block: 'audio/sfx/block.mp3',
      alert: 'audio/sfx/alert.mp3'
    }
  };

  // Phrases de repli pour SpeechSynthesis
  const phrases = {
    fr: {
      ronda: 'Ronda !',
      tringa: 'Tringa !',
      missa: 'Missa !',
      bount: 'Bount !',
      win: 'Bravo ! Tu as gagné la partie !',
      lose: 'L\'adversaire a gagné la partie.',
      uno: 'UNO !',
      uno_missed: 'Tu as oublié UNO ! Deux cartes de pénalité !',
      skip: 'Passe ton tour !',
      reverse: 'Changement de sens !',
      draw2: 'Plus deux cartes !',
      draw4: 'Joker plus quatre !',
      wild: 'Changement de couleur !',
      uno_win: 'Bravo ! Tu as posé toutes tes cartes et gagné la partie de UNO !',
      uno_lose: 'L\'adversaire a posé toutes ses cartes et gagne la partie de UNO.'
    },
    darija: {
      ronda: ['روندا !', 'روندا حية !', 'عندي روندا ناضية !'],
      tringa: ['ترينڭا !', 'ترينڭا مسمومة ! خمسة دالنقط !', 'تلاتة دقة وحدة ! ترينڭا !'],
      missa: ['ميسا قرعة !', 'ميسا ! مسحت الطابلة !', 'الطابلة نقية ! ميسا !'],
      bount: ['بونت فالراس !', 'بونت ! رديتها ليك تما !', 'بونت فالوجه !'],
      win: ['مبروك عليك ! ربحتي الطرح يا الحريف !', 'طيرتي ليه الماتش، معلم ديال الروندا نيت !'],
      lose: ['الخصم دا الطرح، عاود طرح أخور وعوضها !', 'معليش، الطرح الجاي ديالك ان شاء الله !'],
      uno: ['أونو !', 'أونو ناضية !'],
      uno_missed: ['نسيتي أونو ! كول جوج كارطات عقوبة !'],
      skip: ['دوز تورك !', 'سوطي تورك !'],
      reverse: ['قلب الدورة !', 'تبدلات الدورة !'],
      draw2: ['كول جوج كارطات !', 'زيد جوج كارطات !'],
      draw4: ['جوكير كول ربعة !', 'ربعة دالكارطات عقوبة !'],
      wild: ['بدل اللون !', 'جوكير !'],
      uno_win: ['مبروك عليك ! كملتي كارطتك وربحتي طرح أونو !'],
      uno_lose: ['الخصم كمل كارطتو وربح طرح أونو !']
    }
  };

  // Cache d'éléments audio préchargés
  const audioCache = new Map();

  function playAudioFile(src, volFactor = 1) {
    if (isMuted || volume <= 0) return Promise.resolve(false);
    return new Promise(resolve => {
      try {
        let a = audioCache.get(src);
        if (!a) {
          a = new Audio(src);
          audioCache.set(src, a);
        }
        // Utiliser cloneNode pour permettre les sons superposés sans interruption
        const sound = a.cloneNode();
        sound.volume = Math.max(0, Math.min(1, volume * volFactor));
        const p = sound.play();
        if (p && p.then) {
          p.then(() => resolve(true)).catch(() => resolve(false));
        } else {
          resolve(true);
        }
      } catch (err) {
        resolve(false);
      }
    });
  }

  /* ---------- Synthèse Web Audio (Repli sans fichiers) ---------- */

  function synthSlap(vol = 0.6) {
    if (isMuted || volume <= 0) return;
    try {
      const a = getAudioContext();
      if (!a) return;
      const n = (a.sampleRate * 0.09) | 0;
      const buf = a.createBuffer(1, n, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      const s = a.createBufferSource();
      const f = a.createBiquadFilter();
      const g = a.createGain();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      g.gain.value = vol;
      s.buffer = buf;
      s.connect(f);
      f.connect(g);
      g.connect(masterGain || a.destination);
      s.start();
    } catch (e) {}
  }

  function synthTone(freq, dur = 0.18, delay = 0, vol = 0.18) {
    if (isMuted || volume <= 0) return;
    try {
      const a = getAudioContext();
      if (!a) return;
      const o = a.createOscillator();
      const g = a.createGain();
      const t = a.currentTime + delay;
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(masterGain || a.destination);
      o.start(t);
      o.stop(t + dur);
    } catch (e) {}
  }

  function synthDeal() {
    if (isMuted || volume <= 0) return;
    try {
      const a = getAudioContext();
      if (!a) return;
      const n = (a.sampleRate * 0.1) | 0;
      const buf = a.createBuffer(1, n, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n) * 0.4;
      const s = a.createBufferSource();
      const f = a.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 2400;
      s.buffer = buf;
      s.connect(f);
      f.connect(masterGain || a.destination);
      s.start();
    } catch (e) {}
  }

  function synthCapture() {
    synthSlap(0.5);
    setTimeout(() => synthSlap(0.8), 70);
  }

  /* ---------- Fonctions publiques de lecture ---------- */

  function playSFX(key) {
    if (isMuted || volume <= 0) return;
    const file = files.sfx && files.sfx[key];
    const synthFallback = () => {
      if (key === 'slap') synthSlap();
      else if (key === 'deal') synthDeal();
      else if (key === 'capture') synthCapture();
      else if (key === 'chime') [523, 659, 784, 1046].forEach((f, i) => synthTone(f, 0.22, i * 0.12));
      else if (key === 'swoosh') [600, 480, 360, 240].forEach((f, i) => synthTone(f, 0.08, i * 0.04, 0.3));
      else if (key === 'block') [220, 160].forEach((f, i) => synthTone(f, 0.12, i * 0.08, 0.4));
      else if (key === 'alert') [880, 1175].forEach((f, i) => synthTone(f, 0.18, i * 0.1, 0.35));
    };
    if (file) {
      playAudioFile(file, 1.0).then(played => {
        if (!played) synthFallback();
      });
    } else {
      synthFallback();
    }
  }

  function say(key, overrideLang) {
    if (isMuted || volume <= 0 || voiceLang === 'none') return;
    const lang = overrideLang || ((voiceLang === 'fr') ? 'fr' : 'darija');
    const langFiles = files[lang] || files.darija;
    const src = (langFiles && langFiles[key]) || (files[key]);

    if (src) {
      playAudioFile(src, 1.0).then(played => {
        if (!played) fallbackSpeech(key, lang);
      });
    } else {
      fallbackSpeech(key, lang);
    }
  }

  function fallbackSpeech(key, lang) {
    try {
      if (root.speechSynthesis) {
        let phrase = (phrases[lang] && phrases[lang][key]) || (phrases.fr && phrases.fr[key]);
        if (Array.isArray(phrase)) {
          phrase = phrase[Math.floor(Math.random() * phrase.length)];
        }
        if (phrase) {
          const u = new SpeechSynthesisUtterance(phrase);
          u.lang = lang === 'darija' ? 'ar-MA' : 'fr-FR';
          u.rate = 1.05;
          u.volume = Math.max(0, Math.min(1, volume));
          root.speechSynthesis.speak(u);
        }
      }
    } catch (e) {}
  }

  function handle(events) {
    try {
      for (const e of events) {
        if (e.type === 'play') {
          playSFX('slap');
          if (e.captured && e.captured.length) {
            setTimeout(() => playSFX('capture'), 140);
          }
        } else if (e.type === 'deal') {
          playSFX('deal');
        } else if (e.type === 'combo') {
          setTimeout(() => say(e.kind), 180);
        } else if (e.type === 'missa') {
          setTimeout(() => say('missa'), 300);
        } else if (e.type === 'bount') {
          setTimeout(() => say('bount'), 250);
        } else if (e.type === 'gameOver') {
          playSFX('chime');
          setTimeout(() => say(e.winner === 0 ? 'win' : 'lose'), 600);
        }
      }
    } catch (err) {}
  }

  function unlock() {
    const a = getAudioContext();
    if (a && a.state === 'suspended') {
      a.resume().catch(() => {});
    }
  }

  root.RondaSound = {
    handle,
    say,
    playSFX,
    play: (k) => {
      try {
        if (['slap', 'deal', 'capture', 'chime', 'swoosh', 'block', 'alert'].includes(k)) {
          return playSFX(k);
        }
        return say(k);
      } catch (e) {}
    },
    playVoice: (k, lang) => {
      try {
        return say(k, lang);
      } catch (e) {}
    },
    slap: () => playSFX('slap'),
    deal: () => playSFX('deal'),
    capture: () => playSFX('capture'),
    chime: () => playSFX('chime'),
    files,
    phrases,
    unlock,
    getVolume: () => volume,
    setVolume: (v) => {
      volume = Math.max(0, Math.min(1, parseFloat(v)));
      if (volume > 0 && isMuted) isMuted = false;
      applyVolume();
    },
    isMuted: () => isMuted,
    setMuted: (m) => {
      isMuted = !!m;
      applyVolume();
    },
    toggleMute: () => {
      isMuted = !isMuted;
      applyVolume();
      return isMuted;
    },
    getVoiceLanguage: () => voiceLang,
    setVoiceLanguage: (lang) => {
      voiceLang = ['darija', 'fr', 'none'].includes(lang) ? lang : 'darija';
      applyVolume();
    },
    onChange: (fn) => {
      if (typeof fn === 'function') listeners.push(fn);
    }
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = root.RondaSound;
  }
})(typeof window !== 'undefined' ? window : globalThis);
