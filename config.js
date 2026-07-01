/* =========================================================================
   config.js  —  Vendor registry for the Pump Selection Tool
   -------------------------------------------------------------------------
   To add a new vendor (e.g. Andritz, Sulzer):
     1. Create /data/<vendor>.json following the schema (see README.md).
     2. Create /data/<vendor>.js  — a one-line wrapper that registers the
        JSON on window.VENDOR_DATA so the tool loads it under file:// too:
            window.VENDOR_DATA = window.VENDOR_DATA || {};
            window.VENDOR_DATA['<vendor>'] = { ...contents of the json... };
        (You can regenerate these wrappers with tools/make_js.py — see README.)
     3. Add the vendor key below. Nothing else in the code changes.
   ========================================================================= */
window.PUMP_TOOL_CONFIG = {
  // key must match the /data/<key>.js filename and the "key" used in the wrapper
  vendors: [
    { key: "goulds",  label: "Goulds",  enabledByDefault: true  },
    { key: "andritz", label: "Andritz", enabledByDefault: true  },
    { key: "sulzer",  label: "Sulzer",  enabledByDefault: true  }
  ],
  // Scoring weights (must sum to 100). Shown in the UI for transparency.
  weights: {
    bepFlow:        25, // % of BEP flow, target 80-110%
    npshMargin:     15, // NPSHa - NPSHr, target >= 3 ft
    efficiency:     15, // efficiency at duty point
    trim:           10, // impeller trim within 80-100% of max dia
    material:       15, // metallurgy match for the fluid (fluid-specific)
    serviceMatch:   20  // pump-family match for the fluid (fluid-specific)
  },
  defaults: {
    frequencyHz: 60,
    specificGravity: 1.0,
    viscosityCp: 1.0,
    npshMarginTargetFt: 3.0
  }
};
