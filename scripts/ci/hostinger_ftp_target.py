#!/usr/bin/env python3
"""Resolve e valida o destino FTPS do deploy do House Mix."""
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from ftplib import FTP_TLS, error_perm

DEPLOY_INFO = "deploy-info.json"
DEFAULT_PUBLIC_URL = "https://housemix.nexobrasil.net/deploy-info.json"


def fail(message):
    print(f"::error::{message}")
    sys.exit(1)


def normalize_server_dir(value):
    raw = (value or "").strip().replace("\\", "/")
    parts = []
    for part in raw.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            if parts and parts[-1] != "..":
                parts.pop()
            else:
                parts.append("..")
        else:
            parts.append(part)
    return "/".join(parts)


def action_server_dir(relative):
    return f"{relative}/" if relative else "./"


def repeated_segment(path):
    parts = [p for p in path.split("/") if p]
    for current, following in zip(parts, parts[1:]):
        if current == following:
            return current
    return None


def open_ftp():
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    ftp = FTP_TLS(context=context, timeout=60)
    ftp.connect(os.environ["FTP_SERVER"], 21, timeout=60)
    ftp.auth()
    ftp.prot_p()
    ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
    return ftp


def close_ftp(ftp):
    try:
        ftp.quit()
    except Exception:
        try:
            ftp.close()
        except Exception:
            pass


def configured_relative_dir():
    relative = normalize_server_dir(os.environ.get("FTP_SERVER_DIR", ""))
    repeated = repeated_segment(relative)
    if repeated:
        fail(f"FTP_SERVER_DIR='{relative}' repete a pasta '{repeated}'. Corrija o secret.")
    return relative


def resolve_relative_from_login(ftp, configured):
    """Corrige automaticamente o caso Hostinger em que o login inicia em /public_html.

    Para um docroot de domínio adicional como /domains/housemix.../public_html,
    o caminho correto a partir de /public_html é ../domains/.../public_html.
    """
    login_dir = ftp.pwd()
    candidates = [configured]

    if (
        login_dir.rstrip("/").endswith("/public_html")
        and configured.startswith("domains/")
    ):
        candidates.insert(0, f"../{configured}")

    errors = []
    for candidate in candidates:
        try:
            ftp.cwd("/")
            ftp.cwd(candidate)
            effective = ftp.pwd()
            if repeated_segment(effective):
                errors.append(f"{candidate} -> {effective} (pasta repetida)")
                continue
            return candidate, effective, login_dir
        except Exception as exc:
            errors.append(f"{candidate}: {exc}")

    fail(
        "Nenhum destino FTP válido foi encontrado. "
        f"Pasta inicial='{login_dir}'. Tentativas: {' | '.join(errors)}"
    )


def write_outputs(server_dir, effective):
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"server_dir={action_server_dir(server_dir)}\n")
            handle.write(f"effective_dir={effective}\n")


def cmd_resolve():
    configured = configured_relative_dir()
    ftp = open_ftp()
    try:
        print(f"FTP_SERVER_DIR configurado: {action_server_dir(configured)}")
        print(f"Conteudo da pasta inicial '{ftp.pwd()}': {sorted(ftp.nlst())[:30]}")
        server_dir, effective, login_dir = resolve_relative_from_login(ftp, configured)
    finally:
        close_ftp(ftp)

    print(f"Pasta inicial do usuario FTP: {login_dir}")
    print(f"FTP_SERVER_DIR usado: {action_server_dir(server_dir)}")
    print(f"Destino efetivo do upload: {effective}")
    write_outputs(server_dir, effective)


def read_commit(raw):
    try:
        data = json.loads(raw.decode("utf-8"))
        value = data.get("commit", "")
        return value if isinstance(value, str) else ""
    except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
        return ""


def cmd_verify():
    expected = os.environ["EXPECTED_SHA"]
    configured = configured_relative_dir()
    chunks = []
    ftp = open_ftp()
    try:
        server_dir, effective, _ = resolve_relative_from_login(ftp, configured)
        try:
            ftp.cwd("/")
            if server_dir:
                ftp.cwd(server_dir)
            ftp.retrbinary(f"RETR {DEPLOY_INFO}", chunks.append)
        except Exception as exc:
            fail(f"Falha ao ler {effective}/{DEPLOY_INFO} via FTPS: {exc}")
    finally:
        close_ftp(ftp)

    actual = read_commit(b"".join(chunks))
    if actual != expected:
        fail(f"{effective}/{DEPLOY_INFO} tem SHA '{actual}', esperado '{expected}'.")
    print(f"Upload confirmado em {effective}/{DEPLOY_INFO} no commit {actual}.")


def cmd_public():
    expected = os.environ["EXPECTED_SHA"]
    url = os.environ.get("PUBLIC_URL", DEFAULT_PUBLIC_URL)
    attempts = int(os.environ.get("PUBLIC_ATTEMPTS", "12"))
    delay = int(os.environ.get("PUBLIC_DELAY_SECONDS", "10"))
    effective = os.environ.get("EFFECTIVE_DIR", "(desconhecido)")
    last = "sem resposta"

    for attempt in range(1, attempts + 1):
        request = urllib.request.Request(
            f"{url}?check={attempt}-{int(time.time())}",
            headers={"Cache-Control": "no-cache"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                content_type = response.headers.get("Content-Type", "")
                body = response.read(65536)
                actual = read_commit(body)
                last = f"HTTP {response.status} {content_type} commit='{actual or 'JSON ausente/invalido'}'"
                if actual == expected:
                    print(f"Dominio publico confirmado no commit {actual} ({url}).")
                    return
        except (urllib.error.URLError, OSError) as exc:
            last = f"erro de rede: {exc}"
        print(f"Tentativa {attempt}/{attempts}: {last}")
        if attempt < attempts:
            time.sleep(delay)

    fail(
        f"O upload foi para '{effective}', mas {url} nao serve o SHA esperado ({last}). "
        "Deploy NAO VALIDADO."
    )


COMMANDS = {"resolve": cmd_resolve, "verify": cmd_verify, "public": cmd_public}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        fail(f"Uso: {sys.argv[0]} {{{'|'.join(COMMANDS)}}}")
    COMMANDS[sys.argv[1]]()
