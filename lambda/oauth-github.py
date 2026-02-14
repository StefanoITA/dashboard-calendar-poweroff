"""
Lambda: OAuth GitHub Enterprise — Code Exchange + Token Sicuro

Routing per metodo HTTP (stessa Lambda, stessa URL):
  GET  ?code=XXX  → Scambio OAuth, crea transit token HMAC, 302 redirect con ?ghtoken=
  POST {token}    → Verifica token HMAC, ritorna {login, session_token?}
  OPTIONS         → CORS preflight

Variabili d'ambiente:
  GHE_BASE_URL       — es. https://github.AZIENDA.com
  OAUTH_CLIENT_ID    — Client ID dell'OAuth App
  OAUTH_CLIENT_SECRET — Client Secret dell'OAuth App
  REDIRECT_URL       — es. https://pages.github.AZIENDA.com/PATH/
  SIGNING_SECRET     — Chiave HMAC 256-bit (python3 -c "import secrets; print(secrets.token_hex(32))")
  SSL_VERIFY         — "true" (default) o "false" per certificati interni
"""

import base64
import hashlib
import hmac
import json
import os
import ssl
import time
import urllib.parse
import urllib.request


# ============================================
# Configurazione
# ============================================
SIGNING_SECRET = os.environ.get("SIGNING_SECRET", "")
REDIRECT_URL = os.environ.get("REDIRECT_URL", "")

_parsed = urllib.parse.urlparse(REDIRECT_URL)
CORS_ORIGIN = f"{_parsed.scheme}://{_parsed.netloc}" if _parsed.scheme else "*"

TRANSIT_TTL = 300       # 5 minuti
SESSION_TTL = 28800     # 8 ore


# ============================================
# Token HMAC (stdlib only)
# ============================================
def _make_token(payload):
    payload_json = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_json).decode("utf-8").rstrip("=")
    sig = hmac.new(
        SIGNING_SECRET.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload_b64}.{sig}"


def _verify_token(token_str):
    parts = token_str.split(".", 1)
    if len(parts) != 2:
        return None
    payload_b64, sig_received = parts
    sig_expected = hmac.new(
        SIGNING_SECRET.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(sig_expected, sig_received):
        return None
    padded = payload_b64 + "=" * (4 - len(payload_b64) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except Exception:
        return None
    if payload.get("exp", 0) < time.time():
        return None
    return payload


# ============================================
# HTTP helpers
# ============================================
def _get_ssl_context():
    if os.environ.get("SSL_VERIFY", "true").lower() == "false":
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    return None


def _http_request(url, data=None, headers=None, method="GET"):
    headers = headers or {}
    if data is not None and isinstance(data, dict):
        data = json.dumps(data).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")
    headers.setdefault("Accept", "application/json")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    ctx = _get_ssl_context()
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _redirect(url):
    return {"statusCode": 302, "headers": {"Location": url}, "body": ""}


def _cors_headers():
    return {
        "Access-Control-Allow-Origin": CORS_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


def _json_response(status, body):
    return {
        "statusCode": status,
        "headers": {**_cors_headers(), "Content-Type": "application/json"},
        "body": json.dumps(body),
    }


# ============================================
# Handler principale
# ============================================
def lambda_handler(event, context):
    method = (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method", "")
    ).upper()

    if method == "OPTIONS":
        return _json_response(200, {})

    if method == "POST":
        return _handle_verify(event)

    # GET (default) — OAuth code exchange
    return _handle_oauth(event)


# ============================================
# GET: OAuth code → transit token → redirect
# ============================================
def _handle_oauth(event):
    redirect_url = REDIRECT_URL
    params = event.get("queryStringParameters") or {}
    code = params.get("code")

    if not code:
        error = urllib.parse.quote("Parametro 'code' mancante")
        return _redirect(f"{redirect_url}?ghuser_error={error}")

    ghe_base = os.environ["GHE_BASE_URL"]
    client_id = os.environ["OAUTH_CLIENT_ID"]
    client_secret = os.environ["OAUTH_CLIENT_SECRET"]

    try:
        # 1. Scambia code → access_token
        token_data = _http_request(
            f"{ghe_base}/login/oauth/access_token",
            data={"client_id": client_id, "client_secret": client_secret, "code": code},
            method="POST",
        )
        access_token = token_data.get("access_token")
        if not access_token:
            err = token_data.get("error_description") or token_data.get("error") or "Token non ricevuto"
            print(f"Token exchange failed: {token_data}")
            return _redirect(f"{redirect_url}?ghuser_error={urllib.parse.quote(err)}")

        # 2. Ottieni profilo utente
        user_data = _http_request(
            f"{ghe_base}/api/v3/user",
            headers={"Authorization": f"token {access_token}"},
        )
        login = user_data.get("login")
        if not login:
            print(f"User fetch failed: {user_data}")
            return _redirect(f"{redirect_url}?ghuser_error={urllib.parse.quote('Profilo utente non trovato')}")

        # 3. Crea transit token firmato (5 min)
        transit = _make_token({"sub": login, "typ": "t", "exp": int(time.time()) + TRANSIT_TTL})
        print(f"OAuth success: {login}")
        return _redirect(f"{redirect_url}?ghtoken={urllib.parse.quote(transit)}")

    except Exception as e:
        print(f"Lambda error: {e}")
        return _redirect(f"{redirect_url}?ghuser_error={urllib.parse.quote(str(e))}")


# ============================================
# POST: Verifica token → ritorna login
# ============================================
def _handle_verify(event):
    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return _json_response(400, {"error": "JSON non valido"})

    token_str = body.get("token", "")
    if not token_str:
        return _json_response(400, {"error": "Token mancante"})

    payload = _verify_token(token_str)
    if payload is None:
        return _json_response(401, {"error": "Token non valido o scaduto"})

    login = payload.get("sub")
    typ = payload.get("typ")

    if typ == "t":
        # Transit token → scambia per session token (8 ore)
        session = _make_token({"sub": login, "typ": "s", "exp": int(time.time()) + SESSION_TTL})
        return _json_response(200, {"login": login, "session_token": session})

    if typ == "s":
        # Session token → verifica e ritorna login
        return _json_response(200, {"login": login})

    return _json_response(401, {"error": "Tipo di token sconosciuto"})
