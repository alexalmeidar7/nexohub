import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
os.environ.setdefault("FTP_SERVER_DIR", ".")
import hostinger_static_deploy as deploy


class StaticDeployTest(unittest.TestCase):
    def test_html_is_not_published_before_required_assets_are_verified(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "assets").mkdir()
            for file in ("assets/index-new.js", "assets/PlayerHub-new.js", "index.html", "deploy-info.json", "fonts.txt"):
                (root / file).write_text("fixture", encoding="utf-8")
            events = []
            def upload(files, immutable=False):
                events.extend(("upload", p.name) for p in files)
            def verify(file):
                self.assertNotIn(("upload", "index.html"), events)
                events.append(("verify", file.name))
            with patch.object(deploy, "ROOT", root), patch.object(deploy, "upload_batch", upload), patch.object(deploy, "verify_public", verify):
                deploy.main()
            self.assertLess(events.index(("verify", "PlayerHub-new.js")), events.index(("upload", "index.html")))
            self.assertEqual(events[-1], ("upload", "deploy-info.json"))

    def test_missing_module_spa_fallback_is_rejected(self):
        class Response:
            status = 200
            headers = {"Content-Type": "text/html"}
            def __enter__(self): return self
            def __exit__(self, *args): pass
        with patch.object(deploy.urllib.request, "urlopen", return_value=Response()):
            with self.assertRaisesRegex(RuntimeError, "not JavaScript"):
                deploy.verify_public(deploy.ROOT / "assets" / "PlayerHub-new.js")

    def test_failed_asset_validation_never_publishes_entrypoint(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "assets").mkdir()
            (root / "assets" / "PlayerHub-new.js").write_text("fixture", encoding="utf-8")
            uploaded = []
            with patch.object(deploy, "ROOT", root), patch.object(deploy, "upload_batch", lambda files, immutable=False: uploaded.extend(files)), patch.object(deploy, "verify_public", side_effect=RuntimeError("unavailable")):
                with self.assertRaises(RuntimeError): deploy.main()
            self.assertFalse(any(p.name == "index.html" for p in uploaded))


if __name__ == "__main__": unittest.main()
