"""Publish static assets before the SPA entry point; preserve previous releases.

No remote deletion. Immutable hashed assets with a matching size are reused.
Each worker owns its FTP connection, with bounded retries and progress output.
"""
import concurrent.futures
import os
from pathlib import Path
import re
import time
import urllib.request
from ftplib import error_perm
from hostinger_ftp_target import open_ftp, close_ftp


ROOT = Path("dist").resolve()
REMOTE = os.environ["FTP_SERVER_DIR"].rstrip("/") or "."
PUBLIC = "https://housemix.nexobrasil.net"


def upload_batch(files, immutable=False):
    pending = list(files)
    for attempt in range(2):
        ftp = None
        try:
            ftp = open_ftp()
            ftp.cwd(REMOTE)
            base = ftp.pwd()
            current = None
            for local in list(pending):
                rel = local.relative_to(ROOT)
                folder = rel.parent.as_posix()
                if folder != current:
                    ftp.cwd(base)
                    for part in rel.parent.parts:
                        try:
                            ftp.cwd(part)
                        except error_perm:
                            ftp.mkd(part)
                            ftp.cwd(part)
                    current = folder
                ftp.voidcmd("TYPE I")
                size = local.stat().st_size
                try:
                    existing = ftp.size(local.name)
                except error_perm:
                    existing = None
                if not immutable or existing != size:
                    with local.open("rb") as handle:
                        ftp.storbinary(f"STOR {local.name}", handle, blocksize=256 * 1024)
                    if ftp.size(local.name) != size:
                        raise RuntimeError(f"Incomplete upload: {rel}")
                    print(f"Uploaded {rel} ({size} bytes)", flush=True)
                pending.remove(local)
            return
        except Exception as exc:
            print(f"Transfer attempt {attempt + 1}: {type(exc).__name__}; {len(pending)} files remaining", flush=True)
            if attempt == 1:
                raise
            time.sleep(2)
        finally:
            if ftp:
                close_ftp(ftp)


def verify_public(local):
    rel = local.relative_to(ROOT).as_posix()
    request = urllib.request.Request(f"{PUBLIC}/{rel}?verify={os.environ.get('DEPLOY_SHA', 'assets')}", method="HEAD")
    with urllib.request.urlopen(request, timeout=20) as response:
        mime = response.headers.get("Content-Type", "").lower()
        if response.status != 200 or (local.suffix == ".js" and not any(t in mime for t in ("javascript", "ecmascript"))):
            raise RuntimeError(f"Public module is not JavaScript: {rel} ({mime})")
    print(f"Public asset OK: {rel}", flush=True)


def main():
    assets = sorted((ROOT / "assets").glob("*"))
    assets = [p for p in assets if p.is_file()]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(upload_batch, assets[i::3], True) for i in range(3)]
        for future in concurrent.futures.as_completed(futures):
            future.result()
    # Fonts/images/rewrites are ready before the new HTML is made visible.
    extras = [p for p in ROOT.rglob("*") if p.is_file() and p.parent != ROOT / "assets" and p.name not in ("index.html", "deploy-info.json")]
    upload_batch(sorted(extras))
    critical = [p for p in assets if p.suffix == ".js" and re.match(r"(?:index|PlayerHub|PlayerTvWelcome|PlayerHome|Player-|AudioPlayerScreen|react-vendor|playerBranding)-?", p.name)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(verify_public, critical))
    upload_batch([ROOT / "index.html"])
    upload_batch([ROOT / "deploy-info.json"])
    print("SPA entry point published after asset validation.", flush=True)


if __name__ == "__main__":
    main()
