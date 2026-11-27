"""Check the compiled manifest's TV entry point and exact packaged 16:9 tile."""
import re
import struct
import sys
import zipfile
from pathlib import Path

apk, station, manifest_path, resources_path = sys.argv[1:]
manifest = Path(manifest_path).read_text()
resources = Path(resources_path).read_text()
tile_ids = set(re.findall(r"\b(?:spec )?resource (0x[0-9a-fA-F]+)\s+\S*drawable/native_tv_tile(?=[:\s]|$)", resources))
assert len(tile_ids) == 1, f"{station}: could not identify unique tile resource: {tile_ids}"
tile_id = next(iter(tile_ids)).lower()
# NativeActivity is the existing entry point; do not add another package or icon entry.
lines = manifest.splitlines()
activity_index = next(i for i, line in enumerate(lines) if re.search(r"\bE: activity\b", line))
activity = "\n".join(lines[activity_index:])
application = "\n".join(lines[:activity_index])
assert re.search(r"android:icon\([^)]*\)=@" + tile_id + r"\b", application, re.I), f"{station}: application icon must resolve to horizontal tile"
for attr in ("icon", "logo", "banner"):
    assert re.search(r"android:" + attr + r"\([^)]*\)=@" + tile_id + r"\b", activity, re.I), f"{station}: activity {attr} does not point to horizontal tile"
for category in ("android.intent.category.LAUNCHER", "android.intent.category.LEANBACK_LAUNCHER"):
    assert category in activity, f"{station}: missing {category}"
with zipfile.ZipFile(apk) as z:
    names = [n for n in z.namelist() if n.endswith("/native_tv_tile.png")]
    assert len(names) == 1, f"{station}: expected exactly one dedicated tile"
    data = z.read(names[0])
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "tile must be PNG"
    assert struct.unpack(">II", data[16:24]) == (1280, 720), "TV launcher tile must be original 1280x720"
    originals = [n for n in z.namelist() if n.endswith("/native_tv_banner.png")]
    dimensions = {struct.unpack(">II", z.read(n)[16:24]) for n in originals}
    assert (1280, 720) in dimensions, "full resolution Fire TV artwork must remain packaged"
print(f"{station}: TV launcher icon/logo/banner resolve to {tile_id}; 1280x720 tile and original art verified")
