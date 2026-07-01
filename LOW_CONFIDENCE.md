# Curve Digitization Confidence — Verify Against Goulds PSS

The performance curves in this tool are **modelled** from the GPM9 published
hydraulic envelopes (H = a − b·Q²), not pixel-digitized from the manual's
curve images. Verify any short-listed pump's duty point, NPSHr, efficiency
and BHP against the **Goulds Pump Selection System (PSS)** before issuing an RFQ.

- Total pump families: **51**
- Modelled, envelope-anchored (`digitized_low`): **4**
- Envelope-only (`envelope_only`) — LOWEST confidence: **47**

## `digitized_low` — moderate confidence (flagship families)

These use the published multi-trim envelope + a nominal BEP. Still verify.

| Model | Section | Max GPM | Max Head ft | Max °F | PDF |
|---|---|---|---|---|---|
| 3196 i-FRAME | CHEM-1A | 7000 | 730 | 700 | p.13 |
| LF 3196 i-FRAME | CHEM-1C | 220 | 925 | 700 | p.25 |
| 3175 | PP-1A | 28000 | 350 | 450 | p.145 |
| 3700 | API-1A | 6500 | 1200 | 800 | p.177 |

## `envelope_only` — LOW confidence (verify all before quoting)

Curve shape is inferred from max-flow/max-head only. BEP, NPSHr and
efficiency are engineering estimates.

| Model | Section | Max GPM | Max Head ft | Max °F | PDF |
|---|---|---|---|---|---|
| CV 3196 i-FRAME | CHEM-1D | 1200 | 290 | 500 | p.41 |
| 3796 i-FRAME | CHEM-1E | 1250 | 430 | 500 | p.49 |
| 3996 In-Line | CHEM-1F | 1400 | 700 | 500 | p.57 |
| IC Series | CHEM-1B | 1980 | 525 | 535 | p.65 |
| HT 3196 i-FRAME | CHEM-1G | 4500 | 925 | 700 | p.73 |
| NM 3196 i-FRAME | CHEM-2A | 1400 | 500 | 200 | p.81 |
| 3198 i-FRAME | CHEM-2B | 800 | 450 | 300 | p.89 |
| 3296 EZMAG | CHEM-3A | 700 | 550 | 535 | p.97 |
| 3298 | CHEM-3B | 1200 | 350 | 250 | p.105 |
| 3299 | CHEM-3C | 425 | 490 | 360 | p.113 |
| ICM / ICMB | CHEM-3D | 1760 | 685 | 535 | p.121 |
| V 3298 | CHEM-3B | 320 | 460 | 250 | p.110 |
| 3171 | CHEM-4A | 3180 | 450 | 450 | p.129 |
| CV 3171 | CHEM-4B | 1300 | 230 | 450 | p.133 |
| AF Axial Flow | CHEM-5A | 200000 | 30 | 600 | p.137 |
| 3180 / 3185 | PP-1B | 26000 | 410 | 446 | p.153 |
| 3181 / 3186 | PP-1C | 13000 | 410 | 508 | p.161 |
| 3500XD | PP-1D | 2200 | 650 | 210 | p.169 |
| 3910 | API-1B | 7500 | 750 | 650 | p.185 |
| 3600 | API-1C | 4500 | 6000 | 400 | p.193 |
| 3620 | API-1D | 20000 | 1500 | 800 | p.201 |
| 3640 | API-1E | 7500 | 2500 | 800 | p.209 |
| 3610 | API-1F | 50000 | 700 | 300 | p.217 |
| 3408A | DS-1A | 6000 | 570 | 250 | p.225 |
| 3409 | DS-1B | 12000 | 850 | 250 | p.233 |
| 3410 | DS-1A | 15000 | 560 | 250 | p.228 |
| 3420 | DS-1C | 65000 | 400 | 275 | p.241 |
| 3498 | DS-1D | 225000 | 800 | 275 | p.249 |
| 3355 | MS-1A | 1500 | 1640 | 280 | p.257 |
| 3311 | MS-1B | 1100 | 5250 | 355 | p.265 |
| 3316 | MS-1C | 3000 | 1000 | 350 | p.273 |
| 3935 | MS-1D | 280 | 2500 | 400 | p.281 |
| JC | AS-1B | 7000 | 240 | 250 | p.289 |
| SRL | AS-1A | 20000 | 165 | 250 | p.297 |
| 5500 | AS-1C | 17000 | 425 | 250 | p.305 |
| HS | AS-1D | 7000 | 140 | 200 | p.313 |
| Trash Hog | AS-1E | 6000 | 140 | 225 | p.321 |
| HSU / HSUL / JCU | AS-1I | 4000 | 220 | 190 | p.329 |
| NSW | AS-1F | 9000 | 280 | 200 | p.337 |
| NSY | AS-1G | 23000 | 90 | 200 | p.345 |
| VHS / VJC | AS-1H | 8000 | 260 | 200 | p.353 |
| VRS | AS-1J | 1500 | 120 | 200 | p.361 |
| WSY / SSE / SSF | AS-1K | 110000 | 200 | 200 | p.369 |
| VIT | VT-1A | 70000 | 3500 | 500 | p.377 |
| VIC | VT-1A | 70000 | 3500 | 500 | p.385 |
| VIS | VT-1A | 70000 | 1400 | 150 | p.393 |
| WCAX / WCA / WCB | VT-1B | 500000 | 600 | 150 | p.401 |

## What specifically to confirm in PSS
1. Actual **head-capacity curve** and shutoff head at the selected speed/trim.
2. **NPSHr** at the duty flow (modelled here — do not rely on it).
3. **Efficiency & BHP** at duty (affects motor sizing).
4. **Min continuous stable flow** and allowable operating region.
5. **Material/seal** availability for the actual fluid and temperature.
