"""Carbon-fibre laminate sheet: a plain flat plate in a common stock size, 400 × 300 × 3 mm."""
import pathlib
import cadquery as cq

ROOT = pathlib.Path(__file__).resolve().parents[2]
sheet = cq.Workplane("XY").box(400, 300, 3)
cq.exporters.export(sheet, str(ROOT / "cad/models/cf-sheet.step"))
