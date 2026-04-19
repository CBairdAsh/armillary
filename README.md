# Armillary — Stellar System Generator - v 1.03

[![License: CC BY 4.0](https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)

A deep, procedural star system generator for writers, game masters, and worldbuilders. Generate complete solar systems with stellar data, planetary bodies, habitable zones, sapient species, lost civilizations, and more—in seconds.

**Live tool:** [armillary-star-gen.pages.dev](https://armillary-star-gen.pages.dev/)

Copyright © 2026 [Kummer Wolfe](https://kummerwolfe.substack.com) · [CC BY 4.0](LICENSE)

---

## Why 'Armillary'

First, I made this because—while there are dozens of star generators out there—most go offline or I need to use two, three, or more to get what I want for stories, RPG campaigns, etc. Then it hit me many were all RPG system-locked. Others were so generic, I wound up using more generators to get at what I wanted.

So... Armillary was born.

As for the name? It's named after an 'armillary spehere'. For those that don't know, an 'armillary spehere' is:

>An armillary sphere (variations are known as spherical astrolabe, armilla, or armil) is a model of objects in the sky (on the celestial sphere), consisting of a spherical framework of rings, centered on Earth or the Sun, that represent lines of celestial longitude and latitude and other astronomically important features, such as the ecliptic. As such, it differs from a celestial globe, which is a smooth sphere whose principal purpose is to map the constellations. It was invented separately, in ancient China possibly as early as the 4th century BC and ancient Greece during the 3rd century BC, with later uses in the Islamic world and Medieval Europe.

As quoted from Wikipedia "armillary sphere" https://en.wikipedia.org/wiki/Armillary_sphere

---

## What It Generates

**Stellar Neighborhood**
- Density classification (Sparse / Moderate / Dense / Cluster)
- Nearby stars with distances in light years — click to explore
- Exotic objects: Nebulae (emission, reflection, dark, protostellar, planetary), Rogue Planets (navigable), Black Holes (quiescent, accreting, binary)
- Click stars and rogue planets to explore · Nebulae and black holes show info panel

**Primary System**
- Single, Binary, or Triple star configurations
- Spectral class (O B A F G K M + exotic: White Dwarf, Neutron Star, Brown Dwarf)
- Luminosity, mass, age, and habitable zone calculated per star
- Combined habitable zone for multi-star systems

**Comets**
- 0–5 per system, weighted toward 0–2
- Composition (Icy, Rocky-Icy, Metallic, Carbon-rich, Exotic)
- Orbital period type (Short / Medium / Long period) with year range

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

**Lost Civilizations** *(habitable worlds with no current species)*
- 28% chance of ruins on eligible worlds
- Tech level at time of collapse
- Estimated age (Recent / Ancient / Deep Past / Primordial)
- Cause of collapse (War / Environmental / Plague / Cosmic Event / Transcendence / Assimilation / Unknown)

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

## License

**[Creative Commons Attribution 4.0 International (CC BY 4.0)](LICENSE)**

Copyright © 2026 Kummer Wolfe

Free to use, adapt, and build upon for any purpose — personal, commercial, or creative — with attribution. See [LICENSE](LICENSE) for full terms.

GURPS is a trademark of Steve Jackson Games. This tool is an independent fan creation and is not affiliated with or endorsed by Steve Jackson Games.

---

*Fiction by Kummer Wolfe — [kummerwolfe.substack.com](https://kummerwolfe.substack.com)*
