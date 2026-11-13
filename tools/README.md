# Kunlik XXM POS reel shabloni
- render.py: 1080x1920 30fps kinetic motion. `python3 render.py stills 1.0,3.5,...` -> sheet.jpg (tekshirish), `python3 render.py r START END out.mp4` (kadrlar oralig'i).
  Har yangi video uchun SCENES, HITS va content() ichidagi matn/vaqtlarni ovozdagi so'z vaqtlariga moslang. DUR ni ovoz uzunligi + 1.5s qiling.
- audio.py: 124 BPM musiqa, whoosh, logo boom -> music.wav (DUR, sahna vaqtlarini moslang).
- Mix: voice x1.6 + music 0.22 sidechain, loudnorm I=-14 TP=-1.5, AAC 48k, +faststart.
- Fayl nomi: YYYY-MM-DD.mp4, shu `reels-media` branch'ga push; URL: https://cdn.jsdelivr.net/gh/JusticeCdr/pos-magazin@reels-media/YYYY-MM-DD.mp4
