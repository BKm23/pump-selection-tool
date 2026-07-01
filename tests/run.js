/* =========================================================================
   tests/run.js  —  Pure-JS unit tests (no framework). Run with:  node tests/run.js
   -------------------------------------------------------------------------
   Validates the selection engine against hand-worked engineering examples.
   Exit code 0 = all pass, 1 = failure (CI-friendly).
   ========================================================================= */
const path = require("path");
const E = require(path.join(__dirname, "..", "engine.js"));
const fs = require("fs");
const goulds = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "goulds.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (got !== undefined ? "  (got " + got + ")" : "")); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

console.log("\n[1] Unit conversions");
ok("100 gpm -> ~22.71 m3/h", approx(E.U.gpm_to_m3h(100), 22.71, 0.02), E.U.gpm_to_m3h(100));
ok("100 ft -> 30.48 m", approx(E.U.ft_to_m(100), 30.48, 0.01));
ok("50 psi @ SG 1 -> ~115.3 ft", approx(E.U.psi_to_ft(50, 1), 115.33, 0.1), E.U.psi_to_ft(50,1));
ok("212F -> 100C", approx(E.U.F_to_C(212), 100, 1e-6));

console.log("\n[2] Hydraulic quantities");
// Ns = 1750*sqrt(500)/150^0.75 ; 150^0.75=42.86 ; sqrt500=22.36 -> 1750*22.36/42.86 ~ 913
ok("Specific speed ~913", approx(E.specificSpeed(1750, 500, 150), 913, 15), Math.round(E.specificSpeed(1750,500,150)));
ok("Ns type radial (<1500)", E.pumpTypeByNs(913) === "Radial vane");
ok("Ns type axial (>8000)", E.pumpTypeByNs(9000) === "Axial flow");
// WHP = 500*150*1/3960 = 18.94
ok("Water HP ~18.94", approx(E.waterHP(500, 150, 1), 18.94, 0.05), E.waterHP(500,150,1).toFixed(2));
// BHP at 70% eff = 18.94/0.7 = 27.06
ok("Brake HP ~27.06", approx(E.brakeHP(500, 150, 1, 70), 27.06, 0.1), E.brakeHP(500,150,1,70).toFixed(2));

console.log("\n[3] NEMA motor sizing (next size up incl. 10% margin)");
ok("27 BHP -> 30 HP (27*1.1=29.7)", E.nextNemaMotor(27) === 30, E.nextNemaMotor(27));
ok("9 BHP -> 10 HP", E.nextNemaMotor(9) === 10, E.nextNemaMotor(9));
ok("48 BHP -> 60 HP", E.nextNemaMotor(48) === 60, E.nextNemaMotor(48));

console.log("\n[4] Viscosity correction (HI 9.6.7 approx)");
ok("<=10 cP -> no correction", E.viscosityCorrection(300, 200, 1750, 5, 1).applied === false);
const vc = E.viscosityCorrection(300, 200, 1750, 200, 0.9);
ok(">10 cP -> correction applied", vc.applied === true);
ok("Ch factor in (0.55..1)", vc.Ch > 0.55 && vc.Ch <= 1, vc.Ch.toFixed(3));
ok("Ce <= Ch (efficiency hit hardest)", vc.Ce <= vc.Ch + 1e-9, vc.Ce.toFixed(3));

console.log("\n[5] End-to-end selection on real Goulds dataset");
// Example: BFW-ish duty 150 gpm @ 300 ft, water, 20 ft NPSHa, 120F, 60Hz
const inp = {
  service:"Boiler feedwater", fluid:"water", flowGpm:150, tdhFt:300, npshaFt:20,
  suctionPsig:5, dischargePsig:135, tempF:120, specificGravity:1, viscosityCp:1,
  solidsPct:0, maxSolidsIn:0, frequencyHz:60, materialPref:"any", sealingPref:"any",
  mounting:"any", hazardous:false, code:"any", maxSpeedRpm:null, npshMarginTargetFt:3
};
const res = E.selectPumps(inp, [goulds], cfgShim(), {topN:5});
ok("returns up to 5 ranked results", res.length >= 1 && res.length <= 5, res.length);
ok("scores are descending", res.every((r,i)=> i===0 || res[i-1].score >= r.score));
ok("top result score in 0..100", res[0].score >= 0 && res[0].score <= 100, res[0].score);
ok("top result has a curve + BHP", !!res[0].curve && res[0].bhp > 0);
ok("top result recommends a motor", E.NEMA_HP.includes(res[0].motorHp), res[0].motorHp);

// Example: high-solids slurry should NOT return clean chemical pumps as #1
const slurry = Object.assign({}, inp, {fluid:"slurry", flowGpm:2000, tdhFt:100, maxSolidsIn:3, solidsPct:30});
const sres = E.selectPumps(slurry, [goulds], cfgShim(), {topN:5});
ok("slurry duty returns solids-handling pumps",
   sres.length===0 || sres.every(r=> r.pump.max_solids_in >= 3),
   sres.map(r=>r.pump.model).join(","));

// Example: over-temperature must filter out ANSI pumps rated below duty
const hot = Object.assign({}, inp, {tempF:750, flowGpm:200, tdhFt:400});
const hres = E.selectPumps(hot, [goulds], cfgShim(), {topN:5});
ok("750F duty: every result rated >=750F", hres.every(r=> r.pump.max_temp_F >= 750),
   hres.map(r=>r.pump.model+":"+r.pump.max_temp_F).join(","));

function cfgShim(){
  return { weights:{bepFlow:25,npshMargin:15,efficiency:15,trim:10,material:15,serviceMatch:20},
           defaults:{npshMarginTargetFt:3.0} };
}

console.log("\n[6] Fluid actually reshapes the ranking");
const base = {npshaFt:25, suctionPsig:5, dischargePsig:100, tempF:180, specificGravity:1,
  viscosityCp:1, solidsPct:0, maxSolidsIn:0, frequencyHz:60, materialPref:"any",
  sealingPref:"any", mounting:"any", hazardous:false, code:"any", maxSpeedRpm:null,
  npshMarginTargetFt:3, service:"x"};
const list = a => a.map(r=>r.pump.model).join(" | ");
const topModel = a => a.length ? a[0].pump.model : "(none)";

// (a) At a mid duty, different fluids must produce a different ranked list.
const midDuty = Object.assign({}, base, {flowGpm:2500, tdhFt:180});
const wMid = E.selectPumps(Object.assign({},midDuty,{fluid:"water"}), [goulds], cfgShim(), {topN:5});
const sMid = E.selectPumps(Object.assign({},midDuty,{fluid:"paper stock"}), [goulds], cfgShim(), {topN:5});
const bMid = E.selectPumps(Object.assign({},midDuty,{fluid:"black liquor"}), [goulds], cfgShim(), {topN:5});
console.log("    [mid 2500/180] water :", list(wMid));
console.log("    [mid 2500/180] stock :", list(sMid));
console.log("    [mid 2500/180] bliq  :", list(bMid));
ok("water vs paper-stock give a DIFFERENT ranked list", list(wMid) !== list(sMid));
ok("water vs black-liquor give a DIFFERENT ranked list", list(wMid) !== list(bMid));
ok("black-liquor results all offer corrosion-resistant metallurgy",
   bMid.every(r => r.pump.materials_available.some(m =>
     ["316SS","CD4MCu","2205 Duplex","Duplex"].includes(m))));

// (b) At a HIGH-flow duty where stock pumps are hydraulically viable, paper
//     stock must surface a Pulp & Paper pump at #1 while water does not.
const hiDuty = Object.assign({}, base, {flowGpm:12000, tdhFt:90, npshaFt:35, maxSpeedRpm:1200});
const wHi = E.selectPumps(Object.assign({},hiDuty,{fluid:"water"}), [goulds], cfgShim(), {topN:5});
const sHi = E.selectPumps(Object.assign({},hiDuty,{fluid:"paper stock"}), [goulds], cfgShim(), {topN:5});
console.log("    [high 18000/120] water:", list(wHi));
console.log("    [high 18000/120] stock:", list(sHi));
ok("high-flow paper-stock #1 is a stock-suitable pump (Pulp&Paper or Solids Handling)",
   sHi.length && (sHi[0].pump.service_category.includes("Pulp & Paper") ||
     sHi[0].pump.service_category.includes("Solids Handling")), topModel(sHi));
ok("water list includes a non-stock pump (water is NOT family-restricted)",
   wHi.some(r => !r.pump.service_category.includes("Pulp & Paper")), list(wHi));
ok("stock list is restricted to Pulp & Paper pumps only",
   sHi.length>0 && sHi.every(r => r.pump.service_category.includes("Pulp & Paper")), list(sHi));

console.log("\n[7] Stock consistency gating (MC vs low-consistency pumps)");
// Low-consistency stock: 3175/3180/3181 eligible; 3500XD (MC, min 8%) excluded
const lowC = Object.assign({}, base, {fluid:"paper stock", flowGpm:1800, tdhFt:200, solidsPct:4, maxSpeedRpm:1200});
const lowRej = E.selectPumps(lowC, [goulds], cfgShim(), {topN:20, keepRejected:true});
const mcAt4 = lowRej.find(r => r.pump && r.pump.model === "3500XD");
ok("3500XD (MC) is rejected at 4% consistency",
   !!(mcAt4 && mcAt4.rejected), mcAt4 ? JSON.stringify(mcAt4.rejected) : "not found");
// High-consistency stock (12%): low-consistency stock pumps excluded, 3500XD ok
const hiC = Object.assign({}, base, {fluid:"paper stock", flowGpm:1500, tdhFt:300, solidsPct:12, maxSpeedRpm:1800});
const hiRej = E.selectPumps(hiC, [goulds], cfgShim(), {topN:60, keepRejected:true});
const p3175 = hiRej.find(r => r.pump && r.pump.model === "3175");
const mc12  = E.selectPumps(hiC, [goulds], cfgShim(), {topN:60}).find(r => r.pump.model === "3500XD");
ok("3175 (max 6%) rejected at 12% consistency", !!(p3175 && p3175.rejected), p3175?JSON.stringify(p3175.rejected):"n/f");
ok("3500XD passes at 12% consistency (MC range 8-16%)", !!mc12, mc12?"present":"absent");
ok("dutyConsistency null for non-fiber fluid",
   E.dutyConsistency({fluid:"water", solidsPct:5}) === null,
   String(E.dutyConsistency({fluid:"water", solidsPct:5})));

console.log("\n[8] Paper stock shows ONLY Pulp & Paper pumps (hard family filter)");
// Screenshot duty: 1500 gpm / 300 ft, paper stock, 8% consistency
const ps = Object.assign({}, base, {fluid:"paper stock", flowGpm:1500, tdhFt:300, solidsPct:8});
const psRes = E.selectPumps(ps, [goulds], cfgShim(), {topN:10});
console.log("    paper stock @1500/300, 8%:", psRes.map(r=>r.pump.model).join(", ") || "(none)");
ok("every paper-stock result is a Pulp & Paper pump",
   psRes.length>0 && psRes.every(r => r.pump.service_category.includes("Pulp & Paper")),
   psRes.map(r=>r.pump.model).join(","));
ok("no chemical/sump/multistage pump appears for paper stock",
   psRes.every(r => !["IC Series","3171","3316","3196 i-FRAME","HT 3196 i-FRAME"].includes(r.pump.model)));
ok("at 8% consistency the MC pump 3500XD is present",
   psRes.some(r => r.pump.model === "3500XD"), psRes.map(r=>r.pump.model).join(","));
// Low consistency (5%): standard stock pumps allowed, MC (3500XD) filtered
const ps5 = Object.assign({}, base, {fluid:"paper stock", flowGpm:8000, tdhFt:150, solidsPct:5, maxSpeedRpm:1200});
const ps5Res = E.selectPumps(ps5, [goulds], cfgShim(), {topN:10});
console.log("    paper stock @8000/150, 5%:", ps5Res.map(r=>r.pump.model).join(", ") || "(none)");
ok("low-consistency stock still restricted to Pulp & Paper family",
   ps5Res.length>0 && ps5Res.every(r => r.pump.service_category.includes("Pulp & Paper")),
   ps5Res.map(r=>r.pump.model).join(","));

console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
process.exit(fail ? 1 : 0);
