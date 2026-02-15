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
import traceback
import urllib.error
import urllib.parse
import urllib.request


# ============================================
# Configurazione
# ============================================
SIGNING_SECRET = os.environ.get("SIGNING_SECRET", "")
REDIRECT_URL = os.environ.get("REDIRECT_URL", "")

_parsed = urllib.parse.urlparse(REDIRECT_URL) if REDIRECT_URL else None
CORS_ORIGIN = f"{_parsed.scheme}://{_parsed.netloc}" if _parsed and _parsed.scheme else "*"

TRANSIT_TTL = 300       # 5 minuti
SESSION_TTL = 28800     # 8 ore
HTTP_TIMEOUT = 15       # secondi per richieste a GHE


# ============================================
# Structured logging
# ============================================
_request_id = "-"


def _log(level, message, **extra):
    """Log strutturato JSON per CloudWatch Logs Insights."""
    entry = {
        "level": level,
        "message": message,
        "request_id": _request_id,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    entry.update(extra)
    print(json.dumps(entry, default=str))


# ============================================
# Validazione configurazione
# ============================================
def _validate_config():
    """Verifica che le variabili d'ambiente essenziali siano presenti."""
    missing = []
    for var in ("GHE_BASE_URL", "OAUTH_CLIENT_ID", "OAUTH_CLIENT_SECRET",
                "REDIRECT_URL", "SIGNING_SECRET"):
        val = os.environ.get(var, "")
        if not val:
            missing.append(var)
    if missing:
        _log("ERROR", "Variabili d'ambiente mancanti", missing_vars=missing)
        return False
    if len(SIGNING_SECRET) < 32:
        _log("WARN", "SIGNING_SECRET troppo corto, rischio sicurezza",
             length=len(SIGNING_SECRET))
    return True


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
    if not token_str or "." not in token_str:
        _log("DEBUG", "Token formato non valido", token_preview=token_str[:20] if token_str else "empty")
        return None
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
        _log("WARN", "Firma HMAC non valida")
        return None
    padded = payload_b64 + "=" * (4 - len(payload_b64) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except Exception as e:
        _log("ERROR", "Decodifica payload fallita", error=str(e))
        return None
    now = time.time()
    exp = payload.get("exp", 0)
    if exp < now:
        _log("INFO", "Token scaduto", exp=exp, now=int(now),
             expired_ago_seconds=int(now - exp), sub=payload.get("sub"))
        return None
    return payload


# ============================================
# HTTP helpers
# ============================================
def _get_ssl_context():
    ssl_verify = os.environ.get("SSL_VERIFY", "true").lower()
    if ssl_verify == "false":
        _log("DEBUG", "SSL verification disabilitata")
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    return None


def _http_request(url, data=None, headers=None, method="GET"):
    """Esegue richiesta HTTP con gestione errori completa."""
    headers = headers or {}
    log_url = url.split("?")[0]  # non loggare query string con secrets

    if data is not None and isinstance(data, dict):
        data = json.dumps(data).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")
    headers.setdefault("Accept", "application/json")

    _log("DEBUG", "HTTP request", method=method, url=log_url,
         has_data=data is not None, headers_keys=list(headers.keys()))

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    ctx = _get_ssl_context()

    try:
        with urllib.request.urlopen(req, context=ctx, timeout=HTTP_TIMEOUT) as resp:
            status = resp.status
            raw = resp.read().decode("utf-8")
            _log("DEBUG", "HTTP response", status=status, body_length=len(raw),
                 body_preview=raw[:300])

            # GHE token endpoint può ritornare form-encoded (access_token=xxx&token_type=bearer)
            # anche con Accept: application/json su alcune versioni
            if raw.startswith("{") or raw.startswith("["):
                return json.loads(raw)
            elif "=" in raw and "&" in raw:
                _log("INFO", "Risposta form-encoded, parsing come query string")
                parsed = urllib.parse.parse_qs(raw, keep_blank_values=True)
                return {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
            else:
                # Prova JSON comunque
                return json.loads(raw)

    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        _log("ERROR", "HTTP error da GHE",
             status=e.code, reason=str(e.reason),
             url=log_url, response_body=body[:500])
        raise RuntimeError(
            f"GHE HTTP {e.code}: {e.reason} — {body[:200]}"
        ) from e

    except urllib.error.URLError as e:
        _log("ERROR", "Errore di rete/SSL verso GHE",
             url=log_url, error=str(e.reason),
             error_type=type(e.reason).__name__)
        raise RuntimeError(
            f"Errore rete GHE: {e.reason}"
        ) from e

    except TimeoutError:
        _log("ERROR", "Timeout HTTP verso GHE",
             url=log_url, timeout_seconds=HTTP_TIMEOUT)
        raise RuntimeError(
            f"Timeout {HTTP_TIMEOUT}s contattando GHE"
        ) from None

    except json.JSONDecodeError as e:
        _log("ERROR", "Risposta GHE non è JSON valido",
             url=log_url, error=str(e))
        raise RuntimeError(
            f"Risposta GHE non parsabile: {e}"
        ) from e


def _redirect(url):
    _log("DEBUG", "Redirect", target=url[:120])
    return {"statusCode": 302, "headers": {"Location": url}, "body": ""}


def _cors_headers():
    return {
        "Access-Control-Allow-Origin": CORS_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


def _json_response(status, body):
    _log("DEBUG", "JSON response", status=status, body=body)
    return {
        "statusCode": status,
        "headers": {**_cors_headers(), "Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def _error_redirect(redirect_url, error_msg):
    """Redirect con errore URL-encoded."""
    safe_msg = str(error_msg)[:200]
    return _redirect(f"{redirect_url}?ghuser_error={urllib.parse.quote(safe_msg)}")


# ============================================
# Handler principale
# ============================================
def lambda_handler(event, context):
    global _request_id
    _request_id = getattr(context, "aws_request_id", "-") if context else "-"

    # Log evento completo (senza body per non esporre token)
    safe_event = {k: v for k, v in event.items() if k != "body"}
    _log("INFO", "Lambda invocata", event_keys=list(event.keys()),
         event=safe_event)

    # Valida configurazione
    if not _validate_config():
        return _json_response(500, {
            "error": "Configurazione Lambda incompleta — verifica variabili d'ambiente"
        })

    # Determina metodo HTTP (supporta sia API Gateway v1 che v2)
    method = (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method", "")
    ).upper()

    if not method:
        _log("WARN", "Metodo HTTP non determinato", event_keys=list(event.keys()),
             has_httpMethod=("httpMethod" in event),
             requestContext=event.get("requestContext", {}))
        # Fallback: se c'è un body è POST, altrimenti GET
        method = "POST" if event.get("body") else "GET"
        _log("INFO", "Metodo HTTP determinato per fallback", method=method)

    _log("INFO", "Routing richiesta", method=method)

    try:
        if method == "OPTIONS":
            return _json_response(200, {})

        if method == "POST":
            return _handle_verify(event)

        # GET (default) — OAuth code exchange
        return _handle_oauth(event)

    except Exception as e:
        _log("ERROR", "Errore non gestito nel handler",
             error=str(e), traceback=traceback.format_exc())
        return _json_response(500, {"error": "Internal Server Error"})


# ============================================
# GET: OAuth code → transit token → redirect
# ============================================
def _handle_oauth(event):
    redirect_url = REDIRECT_URL

    if not redirect_url:
        _log("ERROR", "REDIRECT_URL non configurato")
        return _json_response(500, {"error": "REDIRECT_URL non configurato"})

    params = event.get("queryStringParameters") or {}
    code = params.get("code")
    state = params.get("state")

    _log("INFO", "OAuth GET ricevuto",
         has_code=bool(code), has_state=bool(state),
         params_keys=list(params.keys()))

    if not code:
        _log("WARN", "Parametro 'code' mancante", params=params)
        return _error_redirect(redirect_url, "Parametro 'code' mancante")

    # Leggi env vars con controllo
    ghe_base = os.environ.get("GHE_BASE_URL", "")
    client_id = os.environ.get("OAUTH_CLIENT_ID", "")
    client_secret = os.environ.get("OAUTH_CLIENT_SECRET", "")

    if not all([ghe_base, client_id, client_secret]):
        _log("ERROR", "Variabili OAuth mancanti",
             has_ghe_base=bool(ghe_base),
             has_client_id=bool(client_id),
             has_client_secret=bool(client_secret))
        return _error_redirect(redirect_url, "Configurazione OAuth incompleta nel server")

    _log("INFO", "Inizio scambio OAuth code → access_token",
         ghe_base=ghe_base, client_id=client_id, code_preview=code[:8] + "...")

    # === Step 1: Scambia code → access_token ===
    try:
        token_url = f"{ghe_base}/login/oauth/access_token"
        _log("INFO", "Step 1: Token exchange", url=token_url)

        token_data = _http_request(
            token_url,
            data={"client_id": client_id, "client_secret": client_secret, "code": code},
            method="POST",
        )

        _log("INFO", "Step 1 completato: risposta token endpoint",
             response_keys=list(token_data.keys()) if isinstance(token_data, dict) else "not_dict",
             has_access_token="access_token" in token_data if isinstance(token_data, dict) else False,
             has_error="error" in token_data if isinstance(token_data, dict) else False)

    except RuntimeError as e:
        _log("ERROR", "Step 1 fallito: errore nella richiesta token",
             error=str(e), traceback=traceback.format_exc())
        return _error_redirect(redirect_url, f"Errore contattando GHE: {e}")

    access_token = token_data.get("access_token") if isinstance(token_data, dict) else None
    if not access_token:
        err = ""
        if isinstance(token_data, dict):
            err = (token_data.get("error_description")
                   or token_data.get("error")
                   or "Token non ricevuto")
        else:
            err = f"Risposta inattesa: {str(token_data)[:100]}"
        _log("ERROR", "Step 1 fallito: access_token non presente",
             error=err, full_response=str(token_data)[:500])
        return _error_redirect(redirect_url, err)

    _log("INFO", "Step 1 OK: access_token ricevuto",
         token_type=token_data.get("token_type", "unknown"),
         scope=token_data.get("scope", "unknown"))

    # === Step 2: Ottieni profilo utente ===
    try:
        user_url = f"{ghe_base}/api/v3/user"
        _log("INFO", "Step 2: Fetch profilo utente", url=user_url)

        user_data = _http_request(
            user_url,
            headers={"Authorization": f"token {access_token}"},
        )

        _log("INFO", "Step 2 completato: risposta user endpoint",
             response_keys=list(user_data.keys()) if isinstance(user_data, dict) else "not_dict",
             login=user_data.get("login") if isinstance(user_data, dict) else None)

    except RuntimeError as e:
        _log("ERROR", "Step 2 fallito: errore nella richiesta user",
             error=str(e), traceback=traceback.format_exc())
        return _error_redirect(redirect_url, f"Errore recupero profilo utente: {e}")

    login = user_data.get("login") if isinstance(user_data, dict) else None
    if not login:
        _log("ERROR", "Step 2 fallito: login non trovato nel profilo",
             full_response=str(user_data)[:500])
        return _error_redirect(redirect_url, "Profilo utente non trovato nella risposta GHE")

    # === Step 3: Crea transit token firmato ===
    now = int(time.time())
    transit_payload = {"sub": login, "typ": "t", "exp": now + TRANSIT_TTL}
    transit = _make_token(transit_payload)

    _log("INFO", "OAuth completato con successo",
         login=login, transit_exp=now + TRANSIT_TTL,
         token_length=len(transit))

    return _redirect(f"{redirect_url}?ghtoken={urllib.parse.quote(transit)}")


# ============================================
# POST: Verifica token → ritorna login
# ============================================
def _handle_verify(event):
    # Gestisci body potenzialmente base64-encoded (API Gateway v2)
    raw_body = event.get("body") or ""
    is_base64 = event.get("isBase64Encoded", False)

    _log("INFO", "POST verify ricevuto",
         body_length=len(raw_body), is_base64=is_base64)

    if is_base64:
        try:
            raw_body = base64.b64decode(raw_body).decode("utf-8")
            _log("DEBUG", "Body decodificato da base64", decoded_length=len(raw_body))
        except Exception as e:
            _log("ERROR", "Decodifica base64 body fallita", error=str(e))
            return _json_response(400, {"error": "Body base64 non valido"})

    try:
        body = json.loads(raw_body) if raw_body else {}
    except (json.JSONDecodeError, TypeError) as e:
        _log("ERROR", "JSON body non valido",
             error=str(e), body_preview=raw_body[:100])
        return _json_response(400, {"error": "JSON non valido"})

    token_str = body.get("token", "")
    if not token_str:
        _log("WARN", "Token mancante nel body", body_keys=list(body.keys()))
        return _json_response(400, {"error": "Token mancante"})

    _log("INFO", "Verifica token",
         token_length=len(token_str),
         token_preview=token_str[:20] + "...")

    payload = _verify_token(token_str)
    if payload is None:
        _log("WARN", "Token non valido o scaduto")
        return _json_response(401, {"error": "Token non valido o scaduto"})

    login = payload.get("sub")
    typ = payload.get("typ")

    _log("INFO", "Token verificato", login=login, typ=typ,
         exp=payload.get("exp"), remaining_seconds=int(payload.get("exp", 0) - time.time()))

    if typ == "t":
        # Transit token → scambia per session token (8 ore)
        now = int(time.time())
        session_payload = {"sub": login, "typ": "s", "exp": now + SESSION_TTL}
        session = _make_token(session_payload)
        _log("INFO", "Session token creato", login=login,
             session_exp=now + SESSION_TTL)
        return _json_response(200, {"login": login, "session_token": session})

    if typ == "s":
        # Session token → verifica e ritorna login
        _log("INFO", "Session token valido", login=login)
        return _json_response(200, {"login": login})

    _log("WARN", "Tipo di token sconosciuto", typ=typ, login=login)
    return _json_response(401, {"error": f"Tipo di token sconosciuto: {typ}"})
