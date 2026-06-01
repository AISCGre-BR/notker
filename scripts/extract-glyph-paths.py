# scripts/extract-glyph-paths.py
# Extrai o contorno SVG de cada glifo nomeado de gregall/grelaon.
# Saída: scripts/.cache/glyph-paths.json
#   { "stgall": { "<code>": {"path": "...", "viewBox": "0 0 W H", "advance": N}, ... },
#     "laon":   { ... } }
import json, os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

SKIP = {".notdef", ".null", "nonmarkingreturn", "space"}
FONTS = {
    "stgall": "src/assets/fonts/gregall.ttf",
    "laon":   "src/assets/fonts/grelaon.ttf",
}

def extract(path):
    font = TTFont(path)
    glyph_set = font.getGlyphSet()
    out = {}
    for name in font.getGlyphOrder():
        if name in SKIP:
            continue
        g = glyph_set[name]
        # 1) bounds em coordenadas da fonte (y para cima)
        bp = BoundsPen(glyph_set)
        g.draw(bp)
        if bp.bounds is None:
            continue  # glifo vazio (sem contorno)
        xmin, ymin, xmax, ymax = bp.bounds
        w, h = xmax - xmin, ymax - ymin
        if w <= 0 or h <= 0:
            continue
        # 2) flip Y (SVG y para baixo) + translada p/ origem: matriz (1,0,0,-1,-xmin,ymax)
        svg_pen = SVGPathPen(glyph_set)
        tpen = TransformPen(svg_pen, (1, 0, 0, -1, -xmin, ymax))
        g.draw(tpen)
        d = svg_pen.getCommands()
        if not d:
            continue
        out[name] = {
            "path": d,
            "viewBox": f"0 0 {round(w, 2)} {round(h, 2)}",
            "advance": int(g.width) if hasattr(g, "width") else 0,
        }
    return out

def main():
    result = {}
    for family, rel in FONTS.items():
        if not os.path.exists(rel):
            sys.exit(f"fonte ausente: {rel} (rode o vendor da Task 0)")
        result[family] = extract(rel)
    os.makedirs("scripts/.cache", exist_ok=True)
    with open("scripts/.cache/glyph-paths.json", "w") as f:
        json.dump(result, f)
    print(f"stgall: {len(result['stgall'])} glifos; laon: {len(result['laon'])} glifos")

if __name__ == "__main__":
    main()
