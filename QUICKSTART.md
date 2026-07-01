# Pump Selection Tool — Team Quick-Start (1 page)

### Open it
Double-click **`index.html`**. It runs in any browser, fully offline. Nothing
to install. (It also runs from a shared drive or intranet folder.)

### Do a selection in 4 steps
1. **Top bar** — type Project, your name, date (auto-populates the datasheet).
2. **Left panel** — enter the duty:
   - Fluid, **Flow**, **TDH**, **NPSHa**, suction/discharge pressure, temp, SG.
   - Set **Viscosity** and **Solids** if relevant (paper stock, slurry, liquor).
   - Pick **Frequency** (60/50 Hz). Open **Optional/advanced** for material,
     sealing, mounting, hazardous, code, or a max-speed limit.
3. Click **Select Pumps ▶**. The **center panel** shows the ranked top 5 with
   duty point, % of BEP, required impeller, efficiency, NPSH margin, BHP →
   NEMA motor, material, a 0–100 **suitability score** (expand for the weighted
   breakdown), and **warning flags**.
4. Click **Show Curve** on any result to see the H-Q / efficiency / NPSHr
   curves with your duty point as a red dot.

### Right panel (always live)
As you type, it recomputes **specific speed Ns**, **suction specific speed Nss**,
recommended **pump type**, **hydraulic (WHP)** and **shaft (BHP)** power,
**Reynolds number**, and the **HI viscosity correction** factors.

### Export
- **Use for Datasheet** on the pump you want → **Export Datasheet** → a
  one-page printable datasheet (browser Print / Save-as-PDF) with duty, pump,
  materials, curve thumbnail and a signature block.
- **Export RFQ Email** → opens a pre-filled email to the vendor rep with all
  duty conditions formatted.

### Reading the flags
- **Orange** = caution (off-BEP, heavy trim, low data confidence, viscosity-corrected).
- **Red** = serious (negative NPSH margin = cavitation risk).
- **Grey** = data-quality note — the curve is *modelled*; confirm in Goulds PSS.

### Adding Andritz / Sulzer later
Drop `data/andritz.json` (or `sulzer.json`), run `python3 tools/make_js.py`,
tick the vendor box — or just use **“+ Load vendor JSON…”** in the top bar to
add a file on the spot. See `README.md` §2–3.

### Golden rule
This is **preliminary screening**. Always confirm the final selection,
guaranteed curve, NPSHr and materials with the **OEM selection software**
before you buy. Pumps flagged `envelope_only` (see `LOW_CONFIDENCE.md`) need
extra scrutiny.
