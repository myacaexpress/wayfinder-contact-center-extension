"""Package only reviewed extension assets; reproducible ZIP without credentials."""
import hashlib
import shutil
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extensions/allcalls-mode"
DESTINATION = ROOT / "dist/combined/wayfinder-call-modes.zip"
FILES = ("manifest.json", "background.js", "detector.js", "allcalls.js", "wayfinder.js",
         "popup.html", "popup.css", "popup.js", "README.md", "report.html", "report-tool.js", "report-capture.js",
         "capture.html", "capture.mjs", "capture-core.mjs",
         "integrity-verify.mjs", "integrity-verify-background.mjs",
         "integrity-verify-wayfinder.js", "integrity-verify-popup.js",
         "integrity-health.mjs", "integrity-health-background.mjs", "integrity-health-wayfinder.js",
         "icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png")
DESTINATION.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(DESTINATION, "w", compression=ZIP_DEFLATED) as archive:
    for name in FILES:
        info = ZipInfo("wayfinder-call-modes/" + name, date_time=(2026, 10, 16, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (SOURCE / name).read_bytes())
print(DESTINATION)

# Separate output keeps this combined package distinct from the call-only build.
unpacked = DESTINATION.parent / "unpacked"
if unpacked.exists():
    shutil.rmtree(unpacked)
with ZipFile(DESTINATION) as archive:
    archive.extractall(unpacked)
DESTINATION.with_suffix('.zip.sha256').write_text(
    f"{hashlib.sha256(DESTINATION.read_bytes()).hexdigest()}  {DESTINATION.name}\n")
