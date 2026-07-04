# Armillary — Smoke Test Checklist

Manual QA before deploy. Run locally with:

```bash
npm install
npm run dev
```

Open the app in your browser. Keep DevTools (F12) → **Console** open; there should be no red errors during these steps.

**Current target:** v1.2.0 (Phase 1 — generation coherence)

See [Phase 1 checks](#phase-1-checks-v120) below after Phase 0 sign-off.

---

## Quick pass (~5 minutes)

Use before every deploy.

| # | Action | Expected |
|---|--------|----------|
| 1 | **⚡ Generate New** (Single star) | System loads; stars, worlds, neighborhood, comets appear |
| 2 | **↻ Redraw Free** | Unlocked cards change; no console errors |
| 3 | **Lock** one world → **↻ Redraw Free** | Locked world identical; others change |
| 4 | Switch to **Binary** → **↻ Apply & Redraw** | Two star cards; HZ bar shows combined range |
| 5 | Lock Star A → **↻** on Star B only | HZ bar updates; unlocked worlds may change; Star A unchanged |
| 6 | Lock world 3 → **↻** on world 5 only | World 3 unchanged; world 5 keeps the **same AU** |
| 7 | Neighborhood → click a **star** → explore | Neighbor system opens; **← Back** returns |
| 8 | Neighborhood → **Rogue Planet** → explore | No host star; body (if any) is **Ice Planet** with icon |
| 9 | **↓ Save System** → **ARCHIVE** → **RESTORE** | System comes back intact |
| 10 | **⬇ Export Text** | File downloads; valid world types in output |
| 11 | `npm run build` | Completes without errors |

---

## Thorough pass (~15 minutes)

Run after significant generator or UI changes (e.g. Phase 0, 1, 2 releases).

### A. Lock / redraw integrity

**Binary system**

1. Generate Binary.
2. Note **HZ bar** values (inner–outer AU).
3. Lock **Star A** and one **★ HABITABLE** world (if any).
4. **↻** redraw **Star B** only.

**Check:**

- Star A: same spectral class, luminosity, mass, age.
- Star B: new values.
- HZ bar: **changed** from step 2.
- Locked world: unchanged (type, AU, atmosphere, species).
- Unlocked worlds: may change; **orbital AU stays the same** per world.

**Single world redraw**

1. Note world 4’s **AU** (e.g. `1.42 AU`).
2. Lock world 2.
3. **↻** redraw world 4 only.

**Check:**

- World 4: same **AU**; other properties may change.
- World 2: untouched.

### B. Full redraw vs. single-card redraw

1. Lock neighborhood + one star + one world.
2. **↻ Redraw Free**.

**Check:**

- Locked pieces identical.
- Unlocked stars, worlds, and comets change.
- No duplicate or missing worlds.

### C. Star count change

1. Start with a Binary system (some cards locked optional).
2. Switch to **Triple** → **↻ Apply & Redraw**.

**Check:**

- Amber warning appears before apply.
- Third star appears.
- Locked star/world still present.
- **✕ Revert** restores star count without applying.

### D. Neighborhood

1. **Lock** neighborhood → redraw button hidden on neighborhood card.
2. Unlock → **↻ Redraw** → new neighbors.
3. Click **Nebula** or **Black Hole** → info panel opens/closes.
4. Explore a star, return, click same star again → **↺ Return** shows same explored system.

### E. Rogue planet

1. Find **Rogue Planet** in neighborhood (redraw neighborhood if needed).
2. Explore it.

**Check:**

- Overview shows **ROGUE PLANET**; no stars.
- If a world exists:
  - Type: **Ice Planet**
  - Icon visible (❄️)
  - **DETAILS** expands without errors
- Export text lists `Ice Planet`, not `Subsurface Ocean` as world type.

### F. Habitable worlds / species / ruins

1. Open **★ HABITABLE** world → **DETAILS** → **↻ Regen Species**.

**Check:**

- Species block updates or shows “No sapient life detected.”
- With 0 species, ruins may appear (~28% — try another habitable world if needed).

### G. Persistence

1. Rename the system (click **UNNAMED SYSTEM**).
2. Refresh the browser (F5).

**Check:**

- Same system loads from localStorage.
- Name preserved.

3. **↓ Save System** → refresh page → **ARCHIVE** → **RESTORE**.

**Check:**

- Restored system matches saved entry.

### H. Production build

```bash
npm run build
npm run preview
```

Open the preview URL. Repeat quick-pass steps **1, 4, 6, and 9**.

---

## Phase 0 regression watchlist

If any of these fail, the Phase 0 redraw fix may have regressed:

| Symptom | Likely problem |
|---------|----------------|
| Redraw Star B, HZ bar unchanged | Star redraw not recomputing combined HZ |
| Redraw world, AU jumps | World redraw not preserving orbit |
| Rogue world has no icon / odd type | Rogue generator not using `WORLD_TYPES` |
| Locked world changes on single-star redraw | Lock not respected in `redrawStar` |

---

## Sign-off

Ready to commit/push/deploy when all are true:

- [ ] Binary star redraw updates HZ; locks hold
- [ ] Single world redraw keeps same AU
- [ ] Rogue planet shows valid **Ice Planet**
- [ ] Archive + browser refresh persistence work
- [ ] `npm run build` succeeds
- [ ] No console errors during quick pass

---

## Phase 1 checks (v1.2.0)

Run after Phase 1 release (generation coherence).

| # | Action | Expected |
|---|--------|----------|
| P1-1 | Generate several systems; compare **T** on inner vs. outer worlds | Farther worlds (higher AU) tend to be **colder** at similar types |
| P1-2 | **↻ Redraw** primary star repeatedly until **NS** (rare) or use a saved NS system | Innermost body is often **Pulsar Planet** (~65%); export shows `★ PULSAR ORBIT` |
| P1-3 | Habitable **Ocean Planet** → regen species several times | Chemoreception / carbon-based appear more often than on random desert worlds |
| P1-4 | Star card: mass and luminosity feel paired | Extreme mismatches (e.g. tiny mass, huge L) should be rare |
| P1-5 | Phase 0 quick pass still passes | Locks, redraw, rogue planet, archive |

**NS tip:** Neutron stars are rare in random generation. Redraw an unlocked primary, or explore until you see NS in the neighborhood and match it.

---

## Deploy note

**Smoke test** verifies the build locally. **Ship to live** (e.g. Cloudflare Pages) is typically:

1. Pass this checklist
2. `git commit` + `git push`
3. Hosting rebuilds from the repo

Adjust if your deploy pipeline differs.
