# Echoes of Giselle

**Student:** Sreya Kanchi
**Course:** Senior Capstone II — Immersive Media Design, University of Maryland
**Year:** 2026

---

## Description

Echoes of Giselle is a browser-based interactive 3D environment that 
reimagines the gothic fairy tale world of the Romantic ballet Giselle 
as a theatrical diorama — a stage being set, a curtain not yet fully 
raised. At its center sits an antique music box in a moonlit graveyard, 
surrounded by bare winter trees, orbiting volumetric clouds, and 
particle systems that respond to the viewer's presence. The experience 
is driven by mouse interaction and a wind mechanic: the user winds a 
key to charge the box, which triggers music, opens the lid, and raises 
a dancer. Everything in the scene is deliberately artificial — the rope 
holding the moon is visible, the curtains frame the scene, the clouds 
rotate in perfect geometric rings. Nothing pretends to be natural.

---

## How to Run

### Requirements
- Modern browser with WebGL2 support (Chrome 90+ strongly recommended)
- Python 3 OR VS Code with Live Server extension
- Mouse (required for interaction)
- Audio output device

### Steps

1. Clone the repository:
   git clone https://github.com/sreyakanchi/EchoesOfGiselle

2. Navigate to the project root:
   cd EchoesOfGiselle

3. Start a local server:

   Option A — Python:
   python3 -m http.server 8000

   Option B — VS Code:
   Right-click index.html → Open with Live Server

4. Open your browser and go to:
   http://localhost:8000

5. Click "click to begin" when the overlay appears.
   This starts the audio and the intro sequence.

6. Click through the three intro pages.
   The curtain will sweep in and redirect to the main scene.

7. Wait for the cinematic intro zoom to complete (~15 seconds).
   OrbitControls activate automatically afterward.

### Controls
- Mouse movement  — activates tornado particles, scatters shadow creatures
- Wind Key button — hold to charge the music box
- Open Lid button — opens the box and raises the dancer (requires charge)
- Moonlight button — toggles theatrical spotlight on/off

---

## Required Software / Hardware

- Browser: Chrome 90+, Firefox 90+, or Safari 15+
- Local server: Python 3 (built-in) or VS Code Live Server
- Hardware: laptop or desktop with GPU capable of WebGL2
- Mouse (trackpad will work but is not ideal)
- Speakers or headphones recommended

---

## Folder Structure

EchoesOfGiselle_Final/
├── 01_Project_Build/        # index.html, musicbox.html, script.js, 
│                              styles.css, assets/
├── 02_Source_Files/         # Blender files, raw GLBs, Ableton project
├── 03_Documentation/        # Screen recordings, screenshots, 
│                              video walkthrough
├── 04_Process/              # Early sketches, prototype screenshots,
│                              SCENE_STATE.md, iteration notes
├── 05_Presentation_Materials/ # Poster, one-sentence description,
│                              QR code, audience instructions
├── 06_Setup_Instructions/   # Full setup guide PDF
└── 07_ReadMe/               # This file

---

## Known Issues

- Audio requires a user click to start — browser autoplay policy,
  not a bug. Click the overlay to begin.
- Performance may drop on lower-end machines when multiple ghost 
  cloth entities are active. Reduce GHOST_COUNT in script.js if needed.
- Safari may render some WebGL2 features differently than Chrome.
  Chrome is the recommended browser.
- The lid pivot alignment is tuned to the specific GLB export settings.
  Re-exporting the music box from Blender may require re-tuning the 
  offset values marked with CONTROL comments in script.js.
- linewidth > 1 is unsupported in WebGL2 on most GPUs — any line 
  geometry renders at 1px regardless of the value set.

---

## Links

- GitHub Repository: https://github.com/sreyakanchi/EchoesOfGiselle
- Live Site: https://sreyakanchi.github.io/EchoesOfGiselle
- Video Walkthrough: [add link before submission]
- Process Documentation: see 04_Process/

---

## Credits

All code, 3D scene design, shader implementation, and interaction 
systems by Sreya Kanchi.

Music box and dancer GLB assets modeled in Blender by Sreya Kanchi.
Orig