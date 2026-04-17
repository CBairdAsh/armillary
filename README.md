# Armillary — Stellar System Generator

A deep, procedural star system generator for writers, game masters, and worldbuilders. Generate complete solar systems — stellar data, planetary bodies, habitable zones, and sapient species — in seconds.

**Live tool:** [armillary.pages.dev](https://armillary.pages.dev)

Built by [Kummer Wolfe](https://kummerwolfe.substack.com)

---

## What It Generates

**Stellar Neighborhood**
- Density classification (Sparse / Moderate / Dense / Cluster)
- Nearby stars with distances in light years
- Click any neighbor to explore that system — each explored neighbor persists independently

**Primary System**
- Single, Binary, or Triple star configurations
- Spectral class (O B A F G K M + exotic: White Dwarf, Neutron Star, Brown Dwarf)
- Luminosity, mass, age, and habitable zone calculated per star
- Combined habitable zone for multi-star systems

**Planetary Bodies**
- Up to 12 worlds per system, orbital positions generated via Titius-Bode spacing
- 13 world types: Terrestrial, Ocean Planet, Desert, Ice Planet, Hycean, Gas Giant, Ice Giant, Gas Dwarf, Chthonian, Double Planet, Asteroid Belt, Pulsar Planet, Coreless
- Atmosphere, hydrosphere, gravity, temperature per world
- Orbital zone classification (Inner / Habitable / Outer / Fringe)
- Hazards, moon generation (Rocky, Icy, Subsurface Ocean, Cryovolcanic, Volcanic, Terrestrial, Thin Atmosphere)
- Europa and Enceladus analog moons flagged with life potential notes

**Sapient Species** *(habitable worlds only)*
- Biological origin (Carbon, Silicon, Sulfur, Exotic)
- Body plan, primary sense, social structure
- Technology level, disposition toward outsiders
- 1–2 distinctive traits per species
- 0–4 species per habitable world (weighted toward 0–1)

---

## How To Use

| Action | How |
|--------|-----|
| Generate a fresh system | ⚡ Generate New |
| Lock a card | Click the left stripe or LOCK button |
| Redraw unlocked cards | ↻ Redraw Free |
| Change star count | Single / Binary / Triple selector — amber notice appears, confirm with Apply & Redraw |
| See world detail | DETAILS ▾ on any world card |
| Explore a neighbor star | Click any neighbor in the Stellar Neighborhood |
| Name the system | Click the system name / UNNAMED SYSTEM in the overview |
| Save to archive | ↓ Save System button |
| Restore a saved system | ARCHIVE tab → RESTORE |
| Export | ⬇ Export JSON / ⬇ Export Text / ⎘ Copy Text |

Your current system saves automatically in your browser. Saved systems are stored in the ARCHIVE tab (up to 50 entries).

---

## Generation Methodology

Generation logic is based on **GURPS Space 4th Edition** (Steve Jackson Games) stellar and planetary generation tables, supplemented with NASA exoplanet habitability research and real stellar classification data.

Species generation draws on **GURPS Aliens** biological origin and social structure frameworks.

Key physics:
- Habitable zone: `inner = 0.95 × √L`, `outer = 1.37 × √L` (where L = solar luminosity)
- Orbital spacing: Titius-Bode inspired with randomized multiplier (1.4–2.2×)
- Planetary type probability weighted by orbital zone (Inner / Habitable / Outer / Fringe)
- Spectral class distribution weighted to realistic stellar population (M-type 76.5%, K 12.1%, G 7.6%, etc.)

All methodology used for fan creative purposes with attribution.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI framework | React 18 + Vite 6 |
| Styling | Inline styles, Share Tech Mono font |
| PWA | vite-plugin-pwa + Workbox |
| Hosting | Cloudflare Pages (free tier) |
| Storage | Browser localStorage only — no backend, no accounts |
| Dependencies | Zero runtime dependencies beyond React |

---

## Local Development

**Prerequisites:** Node.js 22.x or later

```bash
# Clone and install
git clone https://github.com/yourusername/armillary.git
cd armillary
npm install

# Start dev server
npm run dev
# → http://localhost:5173

# Build for production
npm run build

# Preview production build locally
npm run preview
```

---

## Deployment (Cloudflare Pages)

1. Push to GitHub
2. Go to [Cloudflare Pages](https://pages.cloudflare.com) → Create a project → Connect to Git
3. Select your `armillary` repo
4. Configure build settings:
   - **Framework preset:** Vite
   - **Build command:** `vite build`
   - **Output directory:** `dist`
5. Deploy — no environment variables required

Every `git push` to `main` triggers an automatic redeploy.

---

## PWA Installation

**Desktop (Chrome / Edge):** Click the install icon in the address bar

**Android (Chrome):** Three-dot menu → Add to Home screen

**iOS (Safari):** Share → Add to Home Screen

Once installed, the app works fully offline — all generation is client-side.

---

## Project Structure

```
armillary/
├── public/
│   ├── favicon.svg          Armillary sphere icon
│   ├── icon-192.png         PWA icon (generate from favicon.svg)
│   └── icon-512.png         PWA icon (generate from favicon.svg)
├── src/
│   ├── App.jsx              Full application UI and state
│   ├── main.jsx             React entry point
│   ├── tokens.js            Design constants, color palette, style helpers
│   ├── components/
│   │   └── BootSequence.jsx Nav console startup animation
│   └── data/
│       ├── stellarData.js   All generation tables (stellar, planetary, species)
│       └── generator.js     Procedural generation engine
├── vite.config.js           Vite + PWA configuration
├── index.html               HTML entry point
└── package.json
```

---

## Generating PWA Icons

The PWA requires `public/icon-192.png` and `public/icon-512.png`.

**Easiest — online:**
1. Go to [realfavicongenerator.net](https://realfavicongenerator.net)
2. Upload `public/favicon.svg`
3. Download and copy the 192×192 and 512×512 PNGs into `public/`

**Via Node:**
```bash
npm install --save-dev sharp
node -e "
const sharp = require('sharp');
const fs = require('fs');
const svg = fs.readFileSync('public/favicon.svg');
sharp(svg).resize(192).png().toFile('public/icon-192.png', ()=>{});
sharp(svg).resize(512).png().toFile('public/icon-512.png', ()=>{});
"
```

---

## License

Free for personal, commercial, and creative use. No attribution required, though it's always appreciated.

GURPS is a trademark of Steve Jackson Games. This tool is an independent fan creation and is not affiliated with or endorsed by Steve Jackson Games.

---

*Fiction by Kummer Wolfe — [kummerwolfe.substack.com](https://kummerwolfe.substack.com)*
