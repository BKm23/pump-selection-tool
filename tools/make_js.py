#!/usr/bin/env python3
"""
make_js.py — regenerate data/<vendor>.js wrappers from data/<vendor>.json.

Why: browsers block fetch() of local .json under file://. Delivering the same
data as a <script> that assigns to window.VENDOR_DATA makes the tool work by
simply double-clicking index.html. Run this after editing any data/*.json.

Usage:
    python3 tools/make_js.py
"""
import json, os, glob
here = os.path.dirname(os.path.abspath(__file__))
data = os.path.join(here, "..", "data")
for jf in glob.glob(os.path.join(data, "*.json")):
    key = os.path.splitext(os.path.basename(jf))[0].lower()
    d = json.load(open(jf))
    with open(os.path.join(data, key + ".js"), "w") as f:
        f.write("window.VENDOR_DATA=window.VENDOR_DATA||{};\n")
        f.write("window.VENDOR_DATA['%s']=%s;\n" % (key, json.dumps(d)))
    print("wrote data/%s.js (%d pumps)" % (key, len(d.get("pumps", []))))
