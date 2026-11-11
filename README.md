# 🎴 Ronda Web — Jeu de Cartes Marocain Authentique (الروندا المغربية)

> **Ronda** est le jeu de cartes le plus populaire et convivial du Maroc et d'Afrique du Nord. Cette version Web / PWA moderne implémente l'intégralité des règles traditionnelles sur un tapis en feutre vert avec animations fluides, voix authentiques en **Darija marocain** et en **Français**, mode hors-ligne complet (PWA), et un mode d'essai interactif.

---

## ✨ Fonctionnalités Implémentées

### 1. 🎴 Animations Fluides et Visibilité du Jeu
- **Glissement des cartes (Card Flight)** : Lorsqu'une carte est jouée (par vous ou par l'IA), elle glisse avec une transition fluide de la main vers la table.
- **Prises et Ramasses visibles** : Lors d'une capture, les cartes prises sur la table sont mises en surbrillance verte et dorée (`.capturing`), puis glissent ensemble vers la pile gagnée du joueur concerné.
- **Effet de pile gagnée** : Rebond dynamique et incrément visible du compteur de cartes gagnées (`+N`).
- **Mise en évidence de la dernière carte jouée** : Halo doré pulsant (`.last-played`) et badge `Dernière / الأخيرة` sur la dernière carte posée sur la table, permettant d'identifier immédiatement l'opportunité d'un **Bount** !
- **Bannières d'événements animées** : Popups percutants pour `BOUNT ! +1`, `MISSA ! +1`, `RONDA !` et `TRINGA !`.

### 2. 🔊 Système Sonore & Répliques Audio Authentiques
- **Contrôles complets** :
  - Bouton muet rapide dans l'en-tête (🔊 / 🔉 / 🔇).
  - Curseur de volume général (0% à 100%) sauvegardé automatiquement dans `localStorage`.
- **Répliques audio en Darija marocain et en Français** :
  - `audio/darija/ronda.mp3` : *"روندا !"*
  - `audio/darija/tringa.mp3` : *"ترينڭا !"*
  - `audio/darija/missa.mp3` : *"ميسا !"*
  - `audio/darija/bount.mp3` : *"بونت !"*
  - `audio/darija/win.mp3` : *"مبروك عليك الربحة !"*
  - `audio/darija/lose.mp3` : *"هارد لك !"*
  - Fichiers équivalents en version française (`audio/fr/`).
- **Effets sonores réalistes de cartes (SFX)** :
  - Claquement sec de carte posée sur table (`slap.mp3`).
  - Glissement de carte distribuée (`deal.mp3`).
  - Prise de cartes (`capture.mp3`).
  - Carillon victorieux de fin de partie (`chime.mp3`).
- **Repli automatique (Zero-dependency Fallback)** : Synthèse Web Audio API et Web Speech Synthesis si les fichiers sont inaccessibles.

### 3. 📖 Écran de Règles & Mode d'Essai Interactif
- **Règles complètes illustrées** :
  - Les 40 cartes espagnoles : Copas (الكواص), Oros (الدينار), Bastos (الزرواطة), Espadas (السيوف).
  - L'ordre des cartes : 1, 2, 3, 4, 5, 6, 7, 10 (Sota/الشيخ), 11 (Caballo/العود), 12 (Rey/الملك). **Pas de 8 ni de 9 !**
  - La suite ascendante consécutive (7 → 10 → 11 → 12).
  - Les annonces : Ronda (+1 pt) et Tringa (+5 pts).
  - Les bonus de jeu : Bount (+1 pt) et Missa (+1 pt).
  - Le décompte final (cartes au-delà de 20 ou majorité).
- **Mode d'essai interactif guidé (5 scénarios)** :
  1. *La Suite 7-10-11* : Poser un 7 pour voir la prise en chaîne 7 → 10 → 11.
  2. *Le Bount* : Poser la même carte que celle que l'adversaire vient de mettre.
  3. *La Missa* : Vider entièrement la table.
  4. *La Ronda* : Annoncer une paire de cartes servies.
  5. *La Tringa* : Annoncer un brelan de cartes servies.

### 4. ⚙️ Réglages des Règles du Jeu
- **Score cible** : 21 points (standard café) ou 41 points (grande partie traditionnelle).
- **Niveau de l'IA** : Débutant, Habitué de café, Maître de Ronda (avec simulation de Monte-Carlo et échantillonnage de mains).
- **Points de la Tringa** : 5 pts (défaut), 3 pts, ou 10 pts.
- **Points de la Ronda** : 1 pt (défaut) ou 2 pts.
- **Points du Bount** : 1 pt (défaut) ou 2 pts.
- **Points de la Missa** : 1 pt (défaut) ou 2 pts.
- **Missa sur la dernière carte** : Autorisée ou Interdite (comme dans certains cafés).
- **Mode de décompte** : Au-delà de 20 (`beyond20`) ou Majorité (`majority`).
- **Vitesse d'animation** : Normale (450ms), Rapide (250ms), ou Instantanée (0ms).

### 5. 📢 Annonces Manuelles (Style Café Marocain)
- Option activable dans les paramètres :
  - Si activée, lorsque le joueur reçoit une Ronda ou une Tringa, un bouton vibrant apparaît : *"📢 Annoncer Ronda !"* ou *"📢 Annoncer Tringa !"*.
  - Le joueur doit annoncer sa combinaison avant de jouer sa première carte !
  - S'il joue sans annoncer, l'annonce est perdue (*"Oublié ! Pas de points"*).

### 6. 💾 Sauvegarde, Reprise & Statistiques Détaillées
- **Sauvegarde automatique** : Chaque coup est persisté via `serialize()` dans `localStorage`.
- **Reprise de partie** : À l'ouverture de la page, proposition de reprendre la manche en cours ou de démarrer une nouvelle partie.
- **Statistiques de jeu** :
  - Nombre total de parties jouées, victoires, défaites, pourcentage de victoires.
  - Statistiques ventilées par niveau (Débutant, Habitué, Maître).
  - Compteur global de Missas, Bounts, Rondas et Tringas.
  - Meilleur score atteint.

### 7. 📱 PWA & Mode Hors-Ligne (Offline First)
- Manifeste PWA (`manifest.json`) avec icônes haute résolution (192x192, 512x512, SVG vectoriel).
- Service Worker (`sw.js`) avec stratégie *Cache-First* pour jouer partout, même dans l'avion ou sans connexion réseau.
- Prêt pour l'intégration dans le Hub des jeux.

### 8. 🌐 Bilingue Français / الدارجة المغربية
- Sélecteur de langue instantané (🇫🇷 FR / 🇲🇦 دارجة).
- Bascule automatique de la direction du texte (LTR / RTL) et adaptation des noms des cartes espagnoles en Darija marocaine.

---

## 🚀 Structure des Fichiers

```text
├── index.html         # Application web interactive complète (tapis, animations, modales)
├── ronda.html         # Alias direct vers index.html
├── ronda-engine.js    # Moteur de règles Ronda pur (sans dépendance, Node & Browser)
├── ronda-sound.js     # Gestionnaire audio (WebAudio, mp3, Darija/FR, volume, mute)
├── manifest.json      # Manifeste PWA
├── sw.js              # Service Worker offline
├── audio/
│   ├── darija/        # Voix marocaines authentiques (ronda, tringa, missa, bount, win, lose)
│   ├── fr/            # Voix françaises (ronda, tringa, missa, bount, win, lose)
│   └── sfx/           # Effets sonores de cartes (slap, deal, capture, chime)
├── package.json       # Scripts de test, démarrage et métadonnées du projet
├── test-ronda.js      # Suite de tests complète (Ronda, Uno, Chrome headless, audio, Joker)
├── test-browser-click.js # Test headless Chrome des interactions et sons
├── test-rules-modal.js   # Test headless Chrome des règles et du mode d'essai interactif
├── test-joker-hand.js    # Test headless Chrome de l'affichage de la main restante lors du choix de couleur Joker
├── audit.js           # Audit exhaustif de 200 parties (100 Ronda + 100 Uno) avec sérialisation
└── README.md          # Documentation du projet
```

---

## 🧪 Lancer les Tests et l'Audit

```bash
# Lancer toute la suite de tests (moteurs + interface + sons + Joker hand preview)
npm test
# ou : node test-ronda.js

# Lancer l'audit de 200 parties (100 Ronda + 100 Uno avec sérialisation & conservation des cartes)
npm run audit
# ou : node audit.js

# Tests ciblés headless Chrome
npm run test:browser
npm run test:rules
npm run test:joker

# Démarrer le serveur local autonome
npm start
# ou : node server.js
```
Tous les tests valident la conservation stricte des 40 cartes (Ronda) et 108 cartes (Uno), la sérialisation/restauration, le décompte des points, les annonces manuelles, l'affichage de la main restante sous les yeux lors du déploiement d'un joker, la distribution 3D réaliste (rituel marocain 3 par 3, retournement 3D flip des cartes de table et éventail naturel en main), et les interactions dans le navigateur.
