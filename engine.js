/* =========================================================================
   engine.js  —  Pump selection engine (pure, UI-free, unit-testable)
   -------------------------------------------------------------------------
   All physics/selection logic lives here so it can be reused by index.html
   (browser, file://) AND by /tests/*.js (Node, no DOM).

   CONVENTIONS
     * Public API works in US units at the boundary (GPM, ft, °F, psig)
       because the Goulds data is US-unit. Internal helpers expose SI where
       useful. Conversions are provided in U{} for the UI.
     * Every function is documented; no external dependencies.
   ========================================================================= */
(function (root) {
  "use strict";

  /* ---------------- Unit conversions (I/O boundary) ---------------------- */
  const U = {
    gpm_to_m3h: g => g * 0.2271247,
    m3h_to_gpm: m => m / 0.2271247,
    ft_to_m:    f => f * 0.3048,
    m_to_ft:    m => m / 0.3048,
    psi_to_ft:  (psi, sg) => psi * 2.30666 / (sg || 1.0), // head of liquid
    ft_to_psi:  (ft, sg) => ft * (sg || 1.0) / 2.30666,
    F_to_C:     f => (f - 32) * 5 / 9,
    C_to_F:     c => c * 9 / 5 + 32,
    hp_to_kw:   h => h * 0.745699
  };

  /* ---------------- Hydraulic pre-screen quantities ---------------------- */
  // Specific speed (US units): Ns = N*sqrt(Q) / H^0.75  (N rpm, Q gpm, H ft/stage)
  function specificSpeed(N, Q, H) {
    if (H <= 0 || Q <= 0) return 0;
    return N * Math.sqrt(Q) / Math.pow(H, 0.75);
  }
  // Suction specific speed: Nss = N*sqrt(Q) / NPSHr^0.75
  function suctionSpecificSpeed(N, Q, NPSHr) {
    if (NPSHr <= 0 || Q <= 0) return 0;
    return N * Math.sqrt(Q) / Math.pow(NPSHr, 0.75);
  }
  // Recommended impeller type from US specific speed
  function pumpTypeByNs(Ns) {
    if (Ns <= 0) return "—";
    if (Ns < 1500) return "Radial vane";
    if (Ns < 4500) return "Francis vane";
    if (Ns < 8000) return "Mixed flow";
    return "Axial flow";
  }
  // Water (hydraulic) horsepower: WHP = Q*H*SG / 3960
  function waterHP(Q, H, sg) { return (Q * H * (sg || 1)) / 3960; }
  // Shaft brake horsepower given efficiency (%)
  function brakeHP(Q, H, sg, effPct) {
    if (effPct <= 0) return 0;
    return waterHP(Q, H, sg) / (effPct / 100);
  }
  // Reynolds number for pump-flow (HI form): Re = 3162 * Q(gpm) / (nu(cSt)*D(in))
  // We use the simplified impeller-based HI parameter; D ~ discharge dia (in).
  function reynolds(Q, viscCp, sg, D_in) {
    const nu_cSt = (viscCp || 1) / (sg || 1); // kinematic viscosity, cSt
    if (nu_cSt <= 0 || D_in <= 0) return Infinity;
    return 3162 * Q / (nu_cSt * D_in);
  }

  /* ---------------- HI 9.6.7 viscosity correction (approx) ---------------
     Returns {Cq, Ch, Ce} correction factors (<=1) for water-based curve.
     Uses the ANSI/HI 9.6.7 parametric form with parameter B:
        B = 26.6 * nu^0.5 * H^0.0625 / (Q^0.375 * N^0.25)   (US units)
     For B<=1 no correction. Above that, factors fall off. This is a
     documented engineering approximation suitable for PRELIMINARY screening;
     confirm with full HI 9.6.7 charts for detailed design.               */
  function viscosityCorrection(Q, H, N, viscCp, sg) {
    const nu = (viscCp || 1) / (sg || 1); // cSt
    if (nu <= 10 || Q <= 0 || H <= 0) return { Cq: 1, Ch: 1, Ce: 1, B: 0, applied: false };
    const B = 26.6 * Math.sqrt(nu) * Math.pow(H, 0.0625) /
              (Math.pow(Q, 0.375) * Math.pow(N || 1750, 0.25));
    if (B <= 1) return { Cq: 1, Ch: 1, Ce: 1, B: B, applied: false };
    const lnB = Math.log(Math.min(B, 40));
    // Empirical fall-off fits (bounded 0.2..1.0), tuned to HI 9.6.7 shape:
    const Cq = clamp(1.0 - 0.06 * lnB, 0.60, 1.0);
    const Ch = clamp(1.0 - 0.08 * lnB, 0.55, 1.0);
    const Ce = clamp(Math.pow(B, -0.165), 0.20, 1.0);
    return { Cq, Ch, Ce, B, applied: true };
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  /* ---------------- NEMA motor sizing ------------------------------------ */
  const NEMA_HP = [1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 60, 75,
                   100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700,
                   800, 900, 1000, 1250, 1500];
  function nextNemaMotor(bhp) {
    const withMargin = bhp * 1.10; // 10% service margin then round up to NEMA
    for (const h of NEMA_HP) if (h >= withMargin) return h;
    return Math.ceil(withMargin / 250) * 250;
  }

  /* ---------------- Curve helpers ---------------------------------------- */
  // Pick the curve object for the requested frequency & (nearest allowed) speed.
  function pickCurve(pump, freqHz, maxSpeedRpm) {
    let best = null;
    for (const c of pump.curves) {
      if (c.frequency_hz !== freqHz) continue;
      if (maxSpeedRpm && c.speed_rpm > maxSpeedRpm) continue;
      if (!best || c.speed_rpm > best.speed_rpm) best = c; // fastest allowed
    }
    // fallback: ignore frequency if none matched (data may be 60Hz only)
    if (!best) {
      for (const c of pump.curves) {
        if (maxSpeedRpm && c.speed_rpm > maxSpeedRpm) continue;
        if (!best || c.speed_rpm > best.speed_rpm) best = c;
      }
    }
    return best;
  }
  // Head from the max-trim polynomial H = a - b*Q^2
  function headAtFlow(curve, Q) {
    const p = curve.head_poly_coeffs;
    if (p) return Math.max(0, p.a - p.b * Q * Q);
    // fall back to linear interpolation of sampled max-trim points
    const key = curve.impeller_trims_in[0];
    return interp(curve.head_curve_points[String(key)], Q);
  }
  // Linear interpolation on [[x,y],...] sorted by x
  function interp(pts, x) {
    if (!pts || !pts.length) return NaN;
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return pts[pts.length - 1][1];
  }
  // Required impeller diameter to hit (Q_duty, H_duty) using affinity on the
  // max-trim curve: H_trim(Q) = H_full(Q) * (D/Dmax)^2  ->  D = Dmax*sqrt(Hd/Hfull)
  function requiredImpeller(curve, pump, Q, Hduty) {
    const Hfull = headAtFlow(curve, Q);
    if (Hfull <= 0) return null;
    const ratio = Math.sqrt(Hduty / Hfull);
    const D = pump.max_impeller_dia_in * ratio;
    return { dia: D, ratioOfMax: D / pump.max_impeller_dia_in, headFullTrim: Hfull };
  }
  function effAtFlow(curve, Q) { return interp(curve.efficiency_curve, Q); }
  function npshrAtFlow(curve, Q) { return interp(curve.npshr_curve, Q); }

  /* ---------------- Fluid suitability profiles ---------------------------
     Each fluid maps to: the pump FAMILIES that suit it (ideal vs merely ok),
     the METALLURGY it needs, and physical properties (fiber/abrasive =>
     lined/sealless pumps are unsuitable; corrosive => base metallurgy is
     inadequate). This is what makes the ranking actually change with fluid. */
  const ALL_MATERIALS = ["CI","DI","316SS","CD4MCu","Alloy20","Hastelloy",
    "Titanium","FRP","PFA-lined","ETFE-lined","Bronze-fitted","CS","12Cr",
    "Duplex","2205 Duplex","Hard Iron","28% Cr Iron","Rubber-lined"];
  const FLUID_PROFILE = {
    "water":        { ideal:["Double Suction","Multi-Stage","Vertical Turbine","Chemical Process"],
                      ok:["API Process"], mats:["CI","DI","Bronze-fitted","316SS"], fiber:false, corrosive:false },
    "condensate":   { ideal:["Multi-Stage","Chemical Process","API Process","Vertical Turbine"],
                      ok:["Double Suction"], mats:["316SS","12Cr","CS","Bronze-fitted","DI"], fiber:false, corrosive:false },
    "paper stock":  { ideal:["Pulp & Paper"], ok:["Abrasive Slurry","Solids Handling"],
                      mats:["CI","DI","316SS","CD4MCu"], fiber:true, corrosive:false,
                      restrictTo:["Pulp & Paper"] }, // hard filter: stock pumps only
    "white liquor": { ideal:["Pulp & Paper","Chemical Process"], ok:["Abrasive Slurry","Solids Handling"],
                      mats:["316SS","2205 Duplex","Duplex","CD4MCu","Alloy20"], fiber:true, corrosive:true },
    "black liquor": { ideal:["Pulp & Paper","Chemical Process"], ok:["Abrasive Slurry","Solids Handling"],
                      mats:["316SS","CD4MCu","2205 Duplex","Duplex"], fiber:true, corrosive:true },
    "green liquor": { ideal:["Pulp & Paper","Chemical Process"], ok:["Abrasive Slurry","Solids Handling"],
                      mats:["316SS","CD4MCu","2205 Duplex","Duplex"], fiber:true, corrosive:true },
    "hot oil":      { ideal:["API Process"], ok:["Chemical Process","Multi-Stage"],
                      mats:["CS","316SS","12Cr","DI"], fiber:false, corrosive:false },
    "brine":        { ideal:["Chemical Process"], ok:["Double Suction","Vertical Turbine"],
                      mats:["316SS","CD4MCu","Alloy20","Duplex","2205 Duplex","Titanium"], fiber:false, corrosive:true },
    "slurry":       { ideal:["Abrasive Slurry","Solids Handling"], ok:[],
                      mats:["Hard Iron","28% Cr Iron","Rubber-lined","CD4MCu","316SS"], fiber:true, corrosive:false, abrasive:true },
    "other":        { ideal:["Chemical Process"], ok:["Double Suction","Multi-Stage","API Process",
                      "Pulp & Paper","Abrasive Slurry","Vertical Turbine"], mats:null, fiber:false, corrosive:false }
  };
  function fluidProfile(fluid) {
    return FLUID_PROFILE[String(fluid || "other").toLowerCase()] || FLUID_PROFILE.other;
  }
  function fluidPreferredMaterials(fluid) {
    const p = fluidProfile(fluid); return p.mats || ALL_MATERIALS;
  }
  // Is this pump a lined / sealless design that fiber or abrasive would clog/erode?
  function isLinedOrSealless(pump) {
    return pump.sealless_option === true
        || /lined|PFA|ETFE|FRP/i.test(pump.construction_type || "")
        || (pump.materials_available || []).every(m => /lined/i.test(m));
  }
  // Service/family suitability score 0..1 (this is the big fluid discriminator)
  function serviceMatchScore(pump, fluid) {
    const p = fluidProfile(fluid);
    const cats = pump.service_category || [];
    let base = cats.some(c => p.ideal.includes(c)) ? 1.0
             : cats.some(c => (p.ok || []).includes(c)) ? 0.5 : 0.12;
    // fibrous / abrasive fluids must NOT go to lined or sealless pumps
    if ((p.fiber || p.abrasive) && isLinedOrSealless(pump)) base = Math.min(base, 0.08);
    return base;
  }
  // Single source of truth for the Medium-Consistency threshold. Any vendor's
  // MC pumps must declare min_consistency_pct >= this value so the gate behaves
  // identically across Goulds / Andritz / Sulzer datasets.
  const MC_THRESHOLD_PCT = 8;
  // For pulp/paper stock & liquors, the "solids %" input is the stock
  // CONSISTENCY. (Slurry uses particle size, not consistency, so it's excluded.)
  function dutyConsistency(inp) {
    const p = fluidProfile(inp.fluid);
    return (p.fiber && !p.abrasive) ? (inp.solidsPct || 0) : null;
  }
  // Metallurgy suitability score 0..1
  function materialMatchScore(pump, fluid) {
    const p = fluidProfile(fluid);
    const mats = pump.materials_available || [];
    if (!p.mats) return 0.8;
    if (mats.some(m => p.mats.includes(m))) return 1.0;
    return p.corrosive ? 0.12 : 0.4; // corrosive w/ wrong metallurgy = big penalty
  }

  /* ---------------- Hard-constraint filter ------------------------------- */
  function passesFilter(pump, inp, curve) {
    const reasons = [];
    if (!curve) return { pass: false, reasons: ["no curve at frequency/speed"] };
    // Flow within curve range
    if (inp.flowGpm < curve.min_flow_gpm * 0.6) reasons.push("flow below min");
    if (inp.flowGpm > curve.max_flow_gpm)        reasons.push("flow above max");
    // Head achievable at full trim (with small tolerance)
    const Hfull = headAtFlow(curve, inp.flowGpm);
    if (inp.tdhFt > Hfull * 1.02) reasons.push("head not achievable at full impeller");
    // Temperature
    if (inp.tempF > pump.max_temp_F) reasons.push("over temperature");
    // Pressure
    if (inp.dischargePsig > pump.max_pressure_psig) reasons.push("over pressure rating");
    // Solids
    if (inp.maxSolidsIn > 0 && inp.maxSolidsIn > pump.max_solids_in) reasons.push("solids too large");
    // Hard family restriction (e.g. paper stock -> only Pulp & Paper pumps).
    // Set FLUID_PROFILE[fluid].restrictTo to enforce this for a fluid.
    const fpf = fluidProfile(inp.fluid);
    if (fpf.restrictTo && !(pump.service_category || []).some(c => fpf.restrictTo.includes(c)))
      reasons.push("pump family not applicable to " + inp.fluid);
    // Stock consistency (only pumps that declare a consistency range are gated)
    const cons = dutyConsistency(inp);
    if (cons != null && pump.max_consistency_pct != null) {
      if (cons > pump.max_consistency_pct)
        reasons.push("stock consistency " + cons + "% above pump limit " + pump.max_consistency_pct + "%");
      if (pump.min_consistency_pct && cons < pump.min_consistency_pct)
        reasons.push("stock consistency " + cons + "% below MC pump minimum " + pump.min_consistency_pct + "%");
    }
    // Material availability
    if (inp.materialPref && inp.materialPref !== "any") {
      if (!pump.materials_available.some(m => m.toLowerCase().includes(inp.materialPref.toLowerCase())))
        reasons.push("required material not offered");
    } else {
      const pref = fluidPreferredMaterials(inp.fluid);
      if (!pump.materials_available.some(m => pref.includes(m))) reasons.push("no suitable material for fluid");
    }
    // Sealing preference
    if (inp.sealingPref === "sealless" && !pump.sealless_option) reasons.push("not sealless");
    // Mounting preference
    if (inp.mounting === "vertical" && !pump.vertical) reasons.push("not vertical");
    if (inp.mounting === "self-priming" && !pump.self_priming) reasons.push("not self-priming");
    if (inp.mounting === "in-line" && !/in-line/i.test(pump.construction_type)) reasons.push("not in-line");
    // Hazardous -> require sealless unless user overrides via sealingPref
    if (inp.hazardous && !pump.sealless_option && inp.sealingPref !== "any" && inp.sealingPref !== "double")
      reasons.push("hazardous service prefers sealless/double");
    return { pass: reasons.length === 0, reasons };
  }

  /* ---------------- Scoring ---------------------------------------------- */
  function scorePump(pump, inp, curve, cfg) {
    const w = cfg.weights;
    const bd = {}; // breakdown
    // 1) % of BEP flow
    const bep = curve.bep_point.flow_gpm || 1;
    const pctBep = inp.flowGpm / bep * 100;
    bd.bepFlow = w.bepFlow * bepScore(pctBep);
    // 2) NPSH margin
    const npshr = npshrAtFlow(curve, inp.flowGpm);
    const margin = (inp.npshaFt || 0) - npshr;
    bd.npshMargin = w.npshMargin * npshScore(margin, cfg.defaults.npshMarginTargetFt);
    // 3) efficiency at duty
    const eff = effAtFlow(curve, inp.flowGpm);
    bd.efficiency = w.efficiency * clamp(eff / 85, 0, 1); // 85% ~ full marks
    // 4) trim within 80-100% of max dia
    const ri = requiredImpeller(curve, pump, inp.flowGpm, inp.tdhFt);
    const ratio = ri ? ri.ratioOfMax : 0.5;
    bd.trim = w.trim * trimScore(ratio);
    // 5) material match (fluid-specific, graded)
    bd.material = w.material * materialMatchScore(pump, inp.fluid);
    // 6) service/family match (fluid-specific; penalizes lined/sealless for fiber)
    bd.serviceMatch = w.serviceMatch * serviceMatchScore(pump, inp.fluid);
    let total = Object.values(bd).reduce((a, b) => a + b, 0);
    // Family veto: fibrous/abrasive fluids (paper stock, liquors, slurry) must not
    // be handled by pumps outside a suitable family, no matter how good the
    // hydraulics look. You would never run stock through a vertical turbine.
    const fp = fluidProfile(inp.fluid);
    const cats = pump.service_category || [];
    let famMult = 1;
    if (fp.fiber || fp.abrasive) {
      const suited = cats.some(c => fp.ideal.includes(c) || (fp.ok || []).includes(c));
      if (!suited) famMult = 0.5;
      if (isLinedOrSealless(pump)) famMult = 0.35;
    }
    total *= famMult;
    return { total, famMult, breakdown: bd, pctBep, npshr, margin, eff, reqImpeller: ri };
  }
  function bepScore(p) { // target 80-110
    if (p >= 80 && p <= 110) return 1;
    if (p >= 70 && p < 80) return 0.7;
    if (p > 110 && p <= 120) return 0.7;
    if (p >= 50 && p < 70) return 0.4;
    if (p > 120 && p <= 140) return 0.4;
    return 0.15;
  }
  function npshScore(margin, target) {
    if (margin >= target) return 1;
    if (margin >= 1.5) return 0.6;
    if (margin >= 0) return 0.3;
    return 0; // cavitation risk
  }
  function trimScore(r) {
    if (r >= 0.85 && r <= 1.0) return 1;
    if (r >= 0.75 && r < 0.85) return 0.7;
    if (r > 1.0) return 0.2;           // needs bigger than max = marginal
    if (r >= 0.6) return 0.4;
    return 0.15;
  }

  /* ---------------- Warning flags ---------------------------------------- */
  function warnings(pump, s, inp, curve) {
    const out = [];
    if (s.pctBep < 70) out.push("Operating < 70% of BEP flow");
    if (s.pctBep > 120) out.push("Operating > 120% of BEP flow");
    if (s.margin < inp_npshTarget(inp)) {
      if (s.margin < 0) out.push("NPSH margin NEGATIVE — cavitation risk");
      else out.push("NPSH margin < " + inp_npshTarget(inp) + " ft");
    }
    if (s.reqImpeller && s.reqImpeller.ratioOfMax > 1.0) out.push("Duty needs > max impeller — at edge of range");
    if (s.reqImpeller && s.reqImpeller.ratioOfMax < 0.75) out.push("Heavy impeller trim required");
    if ((inp.viscosityCp || 1) > 10) out.push("Viscosity correction applied (>10 cP)");
    const fp = fluidProfile(inp.fluid);
    if ((fp.fiber || fp.abrasive) && isLinedOrSealless(pump))
      out.push("Fibrous/abrasive fluid — lined/sealless pump not recommended");
    if (fp.corrosive && fp.mats && !(pump.materials_available || []).some(m => fp.mats.includes(m)))
      out.push("Metallurgy likely inadequate for corrosive service");
    if (s.famMult && s.famMult < 1) out.push("Pump family not ideal for this fluid — score reduced");
    const cons = dutyConsistency(inp);
    if (cons != null && cons >= MC_THRESHOLD_PCT && !(pump.max_consistency_pct >= MC_THRESHOLD_PCT))
      out.push("Medium-consistency service (" + cons + "% ≥ " + MC_THRESHOLD_PCT +
               "%) — an MC pump (e.g. 3500XD) is required");
    if (cons != null && pump.max_consistency_pct != null && cons <= pump.max_consistency_pct &&
        (!pump.min_consistency_pct || cons >= pump.min_consistency_pct))
      out.push("Consistency-matched stock pump (" + (pump.consistency_pct || pump.max_consistency_pct + "%") + ")");
    if (pump.data_quality === "envelope_only") out.push("Low data confidence (envelope-only model) — verify vs Goulds PSS");
    else if (pump.data_quality === "digitized_low") out.push("Modelled curve — verify vs Goulds PSS");
    return out;
  }
  function inp_npshTarget(inp) { return (inp.npshMarginTargetFt || 3.0); }

  /* ---------------- Main selection --------------------------------------- */
  function selectPumps(inp, vendorDatasets, cfg, opts) {
    opts = opts || {};
    const results = [];
    for (const ds of vendorDatasets) {
      if (!ds || !ds.pumps) continue;
      for (const pump of ds.pumps) {
        const curve = pickCurve(pump, inp.frequencyHz || 60, inp.maxSpeedRpm);
        const f = passesFilter(pump, inp, curve);
        if (!f.pass) { if (opts.keepRejected) results.push({ pump, rejected: f.reasons }); continue; }
        const s = scorePump(pump, inp, curve, cfg);
        // viscosity correction
        const vc = viscosityCorrection(inp.flowGpm, inp.tdhFt, curve.speed_rpm,
                                       inp.viscosityCp, inp.specificGravity);
        const effDuty = vc.applied ? s.eff * vc.Ce : s.eff;
        const bhp = brakeHP(inp.flowGpm, inp.tdhFt, inp.specificGravity || 1,
                            Math.max(effDuty, 1));
        results.push({
          pump, curve, score: Math.round(s.total * 10) / 10, breakdown: s.breakdown,
          pctBep: s.pctBep, npshr: s.npshr, npshMargin: s.margin,
          effDuty, reqImpeller: s.reqImpeller, bhp, motorHp: nextNemaMotor(bhp),
          viscosity: vc, warnings: warnings(pump, s, inp, curve),
          material: recommendMaterial(pump, inp.fluid)
        });
      }
    }
    results.sort((a, b) => (b.score || -1) - (a.score || -1));
    // keepRejected returns the full evaluated set (accepted + rejected) for
    // debugging/audit; normal callers get the ranked, accepted top-N only.
    if (opts.keepRejected) return results;
    return results.filter(r => !r.rejected).slice(0, opts.topN || 5);
  }
  function recommendMaterial(pump, fluid) {
    const pref = fluidPreferredMaterials(fluid);
    const hit = pump.materials_available.find(m => pref.includes(m));
    return hit || pump.materials_available[0];
  }

  /* ---------------- Export API ------------------------------------------- */
  const API = {
    U, specificSpeed, suctionSpecificSpeed, pumpTypeByNs, waterHP, brakeHP,
    reynolds, viscosityCorrection, nextNemaMotor, NEMA_HP, pickCurve,
    headAtFlow, interp, requiredImpeller, effAtFlow, npshrAtFlow,
    fluidPreferredMaterials, fluidProfile, serviceMatchScore, materialMatchScore,
    isLinedOrSealless, dutyConsistency, MC_THRESHOLD_PCT, passesFilter, scorePump,
    selectPumps, recommendMaterial, clamp
  };
  root.PumpEngine = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
