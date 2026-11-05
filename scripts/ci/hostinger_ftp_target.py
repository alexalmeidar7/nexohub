#!/usr/bin/env python3
"""Destino FTP unico para o deploy do House Mix na Hostinger.

Comandos:
  resolve  Normaliza FTP_SERVER_DIR, confirma que a pasta existe e nao tem
           segmentos repetidos (ex.: public_html/public_html) e publica o valor
           em GITHUB_OUTPUT. Roda ANTES do upload.
  verify   Le deploy-info.json no mesmo destino usado pelo upload (via FTPS).
  public   Le deploy-info.json pela URL publica do dominio.

FTP_SERVER_DIR e sempre tratado como caminho relativo a pasta inicial do usuario
FTP. Nenhum trecho como "public_html" e acrescentado por este script.
"""
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
    parts = [p for p in (value or "").strip().replace("\\", "/").split("/") if p not in ("", ".")]
    if ".." in parts:
        raise ValueError("FTP_SERVER_DIR nao pode conter '..'")
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
    # O certificado da Hostinger pode ser emitido para o hostname enquanto
    # FTP_SERVER contem um IP: mantem TLS, mas nao valida o nome.
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
    try:
        relative = normalize_server_dir(os.environ.get("FTP_SERVER_DIR", ""))
    except ValueError as exc:
        fail(str(exc))
    repeated = repeated_segment(relative)
    if repeated:
        fail(f"FTP_SERVER_DIR='{relative}' repete a pasta '{repeated}'. Corrija o secret.")
    return relative


def cmd_resolve():
    relative = configured_relative_dir()
    ftp = open_ftp()
    try:
        login_dir = ftp.pwd()
        try:
            print(f"Conteudo da pasta inicial '{login_dir}': {sorted(ftp.nlst())[:30]}")
        except Exception as exc:
            print(f"Nao foi possivel listar a pasta inicial: {exc}")
        if relative:
            try:
                ftp.cwd(relative)
            except error_perm as exc:
                fail(
                    f"A pasta '{relative}' nao existe a partir de '{login_dir}'. "
                    f"O upload nao sera feito para nao criar pastas no lugar errado: {exc}"
                )
        effective = ftp.pwd()
    finally:
        close_ftp(ftp)

    repeated = repeated_segment(effective)
    if repeated:
        fail(
            f"O destino FTP resolve para '{effective}' (pasta inicial '{login_dir}' + "
            f"FTP_SERVER_DIR '{relative or './'}') e repete '{repeated}'. "
            "Ajuste FTP_SERVER_DIR para ser relativo a pasta inicial do usuario FTP."
        )

    server_dir = action_server_dir(relative)
    print(f"Pasta inicial do usuario FTP: {login_dir}")
    print(f"FTP_SERVER_DIR normalizado: {server_dir}")
    print(f"Destino efetivo do upload: {effective}")

    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"server_dir={server_dir}\n")
            handle.write(f"effective_dir={effective}\n")


def read_commit(raw):
    try:
        data = json.loads(raw.decode("utf-8"))
        value = data.get("commit", "")
        return value if isinstance(value, str) else ""
    except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
        return ""


def cmd_verify():
    expected = os.environ["EXPECTED_SHA"]
    relative = configured_relative_dir()
    chunks = []
    ftp = open_ftp()
    try:
        if relative:
            ftp.cwd(relative)
        effective = ftp.pwd()
        try:
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
        "Provavel causa: FTP_SERVER_DIR nao aponta para o document root do dominio. "
        "Deploy NAO VALIDADO."
    )


COMMANDS = {"resolve": cmd_resolve, "verify": cmd_verify, "public": cmd_public}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        fail(f"Uso: {sys.argv[0]} {{{'|'.join(COMMANDS)}}}")
    COMMANDS[sys.argv[1]]()
