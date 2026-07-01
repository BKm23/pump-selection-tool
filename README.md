# Pump Selection Tool (Preliminary Screening)

A single-page, **offline** web tool for preliminary pump selection at a pulp &
paper mill. No server, no build step, no internet, no npm. Open the HTML file
in any modern browser and it runs.

> ⚠️ **Preliminary screening only.** Curves are *modelled* from the Goulds GPM9
> published envelopes, not pixel-digitized. Final selection, guaranteed
> performance, NPSHr and materials **must be confirmed with the OEM selection
> software** (Goulds PSS / Andritz / Sulzer) before purchase.

---

## 1. How to open the tool

**Simplest:** double-click `index.html`. It opens under `file://` and works
fully offline. Vendor data is delivered as `data/*.js` script wrappers
specifically so it loads under `file://` (browsers block `fetch()` of local
`.json` files, so plain JSON alone would not load by double-click).

**Optional (served):** if you prefer a local web server (e.g. to fetch the raw
`.json` files), run from the project folder:

```
python3 -m http.server 8000      # then browse to http://localhost:8000
```

Either way the tool behaves identically.

### Files
```
index.html          the whole UI (HTML + CSS + UI JS inline)
engine.js           pure selection/physics engine (unit-testable, no DOM)
config.js           vendor registry + scoring weights
data/
  goulds.json       full extracted Goulds dataset (canonical, schema source)
  goulds.js         same data wrapped for file:// loading (auto-generated)
  andritz.json/.js  empty placeholder — drop real data here
  sulzer.json/.js   empty placeholder — drop real data here
tests/run.js        pure-JS unit tests (node tests/run.js)
README.md           this file
QUICKSTART.md       one-page team guide
LOW_CONFIDENCE.md   pumps to verify against Goulds PSS
tools/make_js.py    regenerates data/*.js wrappers from the .json files
```

---

## 2. How to add a new vendor (Andritz, Sulzer, …)

1. **Create the JSON:** `data/<vendor>.json` following the schema in §3
   (start from `goulds.json` as a template). Keep `"vendor"` consistent.
2. **Create the JS wrapper** so it loads under `file://`:
   ```
   python3 tools/make_js.py            # regenerates every data/*.js from *.json
   ```
   (or hand-write `data/<vendor>.js`:
   `window.VENDOR_DATA=window.VENDOR_DATA||{}; window.VENDOR_DATA['<vendor>']={ …json… };`)
3. **Register it** in `config.js` → `vendors: [ … { key:"<vendor>", label:"…", enabledByDefault:true } ]`.

That's it — **no HTML edit needed.** `index.html` reads the vendors array from
`config.js` and loads each `data/<key>.js` dynamically at startup, so adding a
vendor is a single-file change. The new vendor's pumps appear in the selection
logic and behind its vendor checkbox automatically.

**Medium-consistency (MC) pumps:** for any vendor, MC pumps must declare
`min_consistency_pct` and `max_consistency_pct` (e.g. 8 and 16). The engine
gates on these fields, so the MC threshold (≥ 8%, the `MC_THRESHOLD_PCT`
constant in `engine.js`) behaves identically across Goulds / Andritz / Sulzer.

**No-file-edit alternative:** click **“+ Load vendor JSON…”** in the top bar and
pick a `.json` file at runtime. It's registered immediately for that session.

The schema already accommodates pulp & paper stock pumps (consistency %),
MC pumps, fan pumps and slurry pumps via the fields below.

---

## 3. JSON schema

Top level:
```jsonc
{
  "vendor": "Goulds",
  "source": "…provenance…",
  "frequency_hz_basis": 60,
  "notes": "…",
  "pumps": [ /* array of pump records */ ]
}
```

Each **pump record**:
```jsonc
{
  "vendor": "Goulds",
  "model": "3196 i-FRAME",
  "size": "1x1.5-6 - 8x10-15h",         // suction x discharge - max impeller
  "size_range": { "smallest": "1x1.5-6", "largest": "8x10-15h" },
  "service_category": ["Chemical Process","ANSI"],
  "applications": ["general process","mild to severe corrosives"],
  "construction_type": "ANSI B73.1 / horizontal end-suction",
  "max_flow_gpm": 7000,
  "max_head_ft": 730,
  "max_temp_F": 700,
  "max_pressure_psig": 450,
  "suction_size_in": 3,
  "discharge_size_in": 2,
  "max_impeller_dia_in": 13.0,
  "min_impeller_dia_in": 8.5,            // trim floor (curve trim range)
  "speeds_rpm": [3500,1750,1180],
  "frame": "STi / MTi / LTi / XLT-i",
  "materials_available": ["DI","316SS","CD4MCu","Alloy20","Hastelloy","Titanium"],
  "seal_chamber_options": ["Standard Bore","BigBore","TaperBore PLUS", …],
  "sealless_option": false,
  "self_priming": false,
  "vertical": false,
  "solids_handling": false,
  "max_solids_in": 0,
  "consistency_pct": null,               // display string, e.g. "8-16% MC"
  "max_consistency_pct": null,           // numeric gate: reject if duty consistency > this
  "min_consistency_pct": 0,              // numeric gate: MC pumps set this (e.g. 8)
  "page_ref_in_pdf": 13,
  "section_ref": "CHEM-1A",
  "data_quality": "digitized_low",       // digitized_high|digitized_low|envelope_only
  "curves": [ /* one per speed */ ]
}
```

Each **curve** (one per speed/frequency):
```jsonc
{
  "speed_rpm": 3500,
  "frequency_hz": 60,
  "impeller_trims_in": [13.0, 10.8, 8.5],
  "head_curve_points": {                 // Q,H samples per trim
    "13.0": [[0,730],[583,706], … ],
    "8.5":  [[0,312], … ]
  },
  "head_poly_coeffs": { "form":"H = a - b*Q^2", "a":730.0, "b":0.0000078 },
  "bep_point": { "flow_gpm":5250, "head_ft":401, "eff_pct":82 },
  "npshr_curve":      [[0,2.0], … ],
  "efficiency_curve": [[0,1],   … ],
  "power_curve_bhp":  [[0,0],   … ],
  "min_flow_gpm": 1050,
  "max_flow_gpm": 7000
}
```
Sampled points **and** the polynomial coefficients are both stored, so the UI
re-plots smoothly and a reviewer can see exactly how each curve was built.

### `data_quality` levels
| value | meaning |
|---|---|
| `digitized_high` | sampled directly from a legible printed curve |
| `digitized_low`  | modelled, anchored to a documented BEP / multiple trims |
| `envelope_only`  | modelled from max-flow/max-head envelope only |

The Goulds set here is `digitized_low` for the flagship families (3196, 3175,
3700) and `envelope_only` for the rest — see `LOW_CONFIDENCE.md`.

---

## 4. Selection algorithm (transparent & explainable)

For every pump size in every enabled vendor dataset:

**Step 1 — hard-constraint filter** (a pump is dropped if any fails):
- duty flow within the curve's `[0.6·min … max]` at the chosen frequency/speed
- duty head achievable at full impeller (`H_full(Q) ≥ TDH`, small tolerance)
- `max_temp_F ≥ duty temp`
- `max_pressure_psig ≥ duty discharge`
- `max_solids_in ≥ duty particle size`
- a suitable material exists for the fluid (or the user's material preference)
- mounting / sealing / hazardous preferences satisfied

**Step 2 — interpolate required impeller** to land on the duty point, using
affinity on the max-trim curve: `D = D_max · √(H_duty / H_full(Q))`.

**Step 3 — weighted score (0–100)** — weights are in `config.js` and shown in
the UI under each result:

| criterion | pts | target |
|---|---|---|
| % of BEP flow | 30 | 80–110% |
| NPSH margin (NPSHa − NPSHr) | 20 | ≥ 3 ft |
| Efficiency at duty | 20 | higher is better (≈85% = full) |
| Impeller trim within 80–100% of max | 10 | avoid heavy trims |
| Material match to fluid | 10 | — |
| Service/category match | 10 | e.g. stock pump for stock service |

**Step 4 — rank descending, return top 5.**

**Step 5 — HI viscosity correction (ANSI/HI 9.6.7 approx).** When
viscosity > 10 cP the head/efficiency/BHP are corrected via factors
`Cq/Ch/Ce` derived from the HI parameter `B`, and results get a
`VISC-CORR` badge. This is an engineering approximation for screening;
confirm with the full HI 9.6.7 charts for detailed design.

Warning flags are raised for: <70% or >120% BEP, NPSH margin below target
(negative margin = cavitation risk), impeller trim outside 75–100%, viscosity
correction active, and low data confidence.

---

## 5. Running the tests
```
node tests/run.js
```
Pure JavaScript, no framework. Exit code 0 = pass. Covers unit conversions,
specific speed / power, NEMA motor sizing, viscosity correction, and end-to-end
selection against the real `goulds.json` (flow/head/temperature/solids
filtering and ranking). Drop in the 5 hand-worked examples you mentioned as
extra `ok(...)` assertions when ready.

---

## 6. "Publish as a website"
Because the tool is a self-contained static site, publishing = copying this
folder to any static host (SharePoint, an internal web share, GitHub Pages,
Netlify, an S3 bucket, or a mill intranet folder). No backend is required. It
also runs with zero hosting by simply opening `index.html` from a shared drive.
