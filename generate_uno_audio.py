import os
import subprocess
from gtts import gTTS

os.makedirs('audio/darija', exist_ok=True)
os.makedirs('audio/fr', exist_ok=True)
os.makedirs('audio/sfx', exist_ok=True)

# 1. French Uno Audio
fr_phrases = {
    'uno': 'UNO !',
    'uno_missed': 'Tu as oublié UNO ! Deux cartes de pénalité !',
    'skip': 'Passe ton tour !',
    'reverse': 'Changement de sens !',
    'draw2': 'Plus deux cartes !',
    'draw4': 'Joker plus quatre !',
    'wild': 'Changement de couleur !',
    'uno_win': 'Bravo ! Tu as posé toutes tes cartes et gagné la partie de UNO !',
    'uno_lose': 'L\'adversaire a posé toutes ses cartes et gagne la partie de UNO.'
}

for key, text in fr_phrases.items():
    path = f'audio/fr/{key}.mp3'
    print(f'Generating {path} ({text})...')
    tts = gTTS(text=text, lang='fr')
    tts.save(path)

# 2. Moroccan Arabic / Darija Uno Audio
darija_phrases = {
    'uno': 'أونو !',
    'uno_missed': 'نسيتي أونو ! كول جوج كارطات عقوبة !',
    'skip': 'دوز تورك !',
    'reverse': 'قلب الدورة !',
    'draw2': 'كول جوج كارطات !',
    'draw4': 'جوكير كول ربعة !',
    'wild': 'بدل اللون !',
    'uno_win': 'مبروك عليك ! كملتي كارطتك وربحتي طرح أونو !',
    'uno_lose': 'الخصم كمل كارطتو وربح طرح أونو !'
}

for key, text in darija_phrases.items():
    path = f'audio/darija/{key}.mp3'
    print(f'Generating {path} ({text})...')
    tts = gTTS(text=text, lang='ar')
    tts.save(path)

# 3. Sound Effects with ffmpeg
# - swoosh: frequency sweep for reverse
# - block: two descending tones for skip
# - alert: bright two-tone bell for uno
print('Synthesizing Uno SFX...')

# Reverse swoosh: white noise + frequency sweep
cmd_swoosh = [
    'ffmpeg', '-y', '-f', 'lavfi',
    '-i', 'anoisesrc=d=0.25:c=pink:r=44100,lowpass=f=1200,volume=1.5',
    '-af', 'afade=t=in:ss=0:d=0.04,afade=t=out:st=0.15:d=0.1',
    '-b:a', '64k', 'audio/sfx/swoosh.mp3'
]
subprocess.run(cmd_swoosh, check=True)

# Block: sharp dull percussive thud for skip
cmd_block = [
    'ffmpeg', '-y', '-f', 'lavfi',
    '-i', 'sine=frequency=180:duration=0.15',
    '-af', 'afade=t=in:ss=0:d=0.01,afade=t=out:st=0.05:d=0.1,volume=1.8',
    '-b:a', '64k', 'audio/sfx/block.mp3'
]
subprocess.run(cmd_block, check=True)

# Alert: bright bell / chime for UNO
cmd_alert = [
    'ffmpeg', '-y', '-f', 'lavfi',
    '-i', 'sine=frequency=880:duration=0.35',
    '-af', 'afade=t=in:ss=0:d=0.01,afade=t=out:st=0.1:d=0.25,volume=1.2',
    '-b:a', '64k', 'audio/sfx/alert.mp3'
]
subprocess.run(cmd_alert, check=True)

print('All Uno audio files generated successfully!')
