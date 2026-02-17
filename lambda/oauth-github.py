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
import socket
import ssl
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional, Dict, Any


# ============================================
# Configurazione
# ============================================
SIGNING_SECRET = os.environ.get("SIGNING_SECRET", "")
REDIRECT_URL = os.environ.get("REDIRECT_URL", "")

_parsed = urllib.parse.urlparse(REDIRECT_URL) if REDIRECT_URL else None
CORS_ORIGIN = f"{_parsed.scheme}://{_parsed.netloc}" if _parsed and _parsed.scheme else "*"

TRANSIT_TTL = 300           # 5 minuti
SESSION_TTL = 2592000       # 30 giorni
HTTP_TIMEOUT = 7            # secondi per singola richiesta (3 retry × 7s = 21s max)
MAX_RETRIES = 3             # numero massimo di retry per richieste a GHE
# NESSUN backoff: lambda ha 30s timeout, ogni ms conta


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


def _diagnose_connection(url):
    """Diagnostica connessione: DNS + TCP + SSL per capire DOVE si blocca."""
    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    diag = {"host": host, "port": port}

    # Step A: DNS resolution
    t0 = time.time()
    try:
        addrs = socket.getaddrinfo(host, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
        diag["dns_ms"] = round((time.time() - t0) * 1000, 1)
        diag["dns_results"] = len(addrs)
        diag["dns_ip"] = addrs[0][4][0] if addrs else "none"
    except Exception as e:
        diag["dns_ms"] = round((time.time() - t0) * 1000, 1)
        diag["dns_error"] = str(e)
        _log("ERROR", "DNS resolution fallita", **diag)
        return diag

    # Step B: TCP connect
    t1 = time.time()
    sock = None
    try:
        sock = socket.create_connection((host, port), timeout=5)
        diag["tcp_ms"] = round((time.time() - t1) * 1000, 1)
        diag["tcp_ok"] = True
    except Exception as e:
        diag["tcp_ms"] = round((time.time() - t1) * 1000, 1)
        diag["tcp_error"] = str(e)
        _log("ERROR", "TCP connect fallito", **diag)
        return diag

    # Step C: SSL handshake (se HTTPS)
    if parsed.scheme == "https":
        t2 = time.time()
        try:
            ssl_verify = os.environ.get("SSL_VERIFY", "true").lower()
            if ssl_verify == "false":
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
            else:
                ctx = ssl.create_default_context()
            wrapped = ctx.wrap_socket(sock, server_hostname=host)
            diag["ssl_ms"] = round((time.time() - t2) * 1000, 1)
            diag["ssl_ok"] = True
            diag["ssl_version"] = wrapped.version()
            wrapped.close()
        except Exception as e:
            diag["ssl_ms"] = round((time.time() - t2) * 1000, 1)
            diag["ssl_error"] = str(e)
            _log("ERROR", "SSL handshake fallito", **diag)
            if sock:
                try:
                    sock.close()
                except Exception:
                    pass
            return diag
    else:
        if sock:
            try:
                sock.close()
            except Exception:
                pass

    _log("INFO", "Diagnostica connessione completata", **diag)
    return diag


def _http_request(url, data=None, headers=None, method="GET", max_retries=MAX_RETRIES):
    """Esegue richiesta HTTP con retry IMMEDIATI (no backoff — lambda ha 30s timeout)."""
    headers = headers or {}
    log_url = url.split("?")[0]  # non loggare query string con secrets

    if data is not None and isinstance(data, dict):
        data = json.dumps(data).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")
    headers.setdefault("Accept", "application/json")

    last_exception = None
    last_body = ""

    for attempt in range(max_retries):
        t_start = time.time()
        try:
            _log("INFO", f"HTTP request attempt {attempt + 1}/{max_retries}",
                 method=method, url=log_url, timeout=HTTP_TIMEOUT,
                 has_data=data is not None, headers_keys=list(headers.keys()))

            # Diagnostica connessione al PRIMO tentativo e dopo timeout
            if attempt == 0 or (last_exception and isinstance(last_exception, (TimeoutError, socket.timeout))):
                diag = _diagnose_connection(url)
                if "dns_error" in diag or "tcp_error" in diag or "ssl_error" in diag:
                    _log("ERROR", "Problema di connettività rilevato PRIMA della richiesta HTTP",
                         diagnostics=diag, attempt=attempt + 1)

            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            ctx = _get_ssl_context()

            with urllib.request.urlopen(req, context=ctx, timeout=HTTP_TIMEOUT) as resp:
                elapsed = round((time.time() - t_start) * 1000, 1)
                status = resp.status
                resp_headers = dict(resp.getheaders())
                raw = resp.read().decode("utf-8")
                _log("INFO", "HTTP response OK",
                     status=status, elapsed_ms=elapsed,
                     body_length=len(raw), body_preview=raw[:500],
                     response_headers=resp_headers, attempt=attempt + 1)

                # GHE token endpoint può ritornare form-encoded (access_token=xxx&token_type=bearer)
                if raw.startswith("{") or raw.startswith("["):
                    return json.loads(raw)
                elif "=" in raw and "&" in raw:
                    _log("INFO", "Risposta form-encoded, parsing come query string",
                         raw_response=raw[:500])
                    parsed = urllib.parse.parse_qs(raw, keep_blank_values=True)
                    return {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
                else:
                    # Risposta non riconosciuta — logga TUTTO per debug
                    _log("WARN", "Risposta non JSON e non form-encoded",
                         raw_body_full=raw[:2000],
                         content_type=resp_headers.get("Content-Type", "unknown"))
                    try:
                        return json.loads(raw)
                    except json.JSONDecodeError:
                        raise RuntimeError(
                            f"Risposta GHE non parsabile (status={status}, "
                            f"content-type={resp_headers.get('Content-Type', '?')}): {raw[:500]}"
                        )

        except urllib.error.HTTPError as e:
            elapsed = round((time.time() - t_start) * 1000, 1)
            body = ""
            try:
                body = e.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            last_body = body

            # Non fare retry per errori client (4xx) tranne 429 (rate limit)
            if 400 <= e.code < 500 and e.code != 429:
                _log("ERROR", "HTTP error da GHE (4xx, no retry)",
                     status=e.code, reason=str(e.reason), url=log_url,
                     elapsed_ms=elapsed,
                     response_body_full=body[:2000],
                     response_headers=dict(e.headers) if hasattr(e, 'headers') else {})
                raise RuntimeError(f"GHE HTTP {e.code}: {e.reason} — {body[:500]}") from e

            last_exception = e
            _log("WARN", f"HTTP error (attempt {attempt + 1}/{max_retries}) — retry immediato",
                 status=e.code, reason=str(e.reason), url=log_url,
                 elapsed_ms=elapsed, response_body=body[:1000])
            # NESSUN sleep — retry immediato

        except (urllib.error.URLError, TimeoutError, ConnectionError,
                socket.timeout, OSError) as e:
            elapsed = round((time.time() - t_start) * 1000, 1)
            last_exception = e
            error_msg = str(getattr(e, 'reason', e))
            _log("WARN", f"Rete/timeout (attempt {attempt + 1}/{max_retries}) — retry immediato",
                 url=log_url, elapsed_ms=elapsed,
                 error=error_msg, error_type=type(e).__name__,
                 is_timeout=isinstance(e, (TimeoutError, socket.timeout)),
                 timeout_config=HTTP_TIMEOUT)
            # NESSUN sleep — retry immediato

        except json.JSONDecodeError as e:
            _log("ERROR", "Risposta GHE non è JSON valido", url=log_url, error=str(e))
            raise RuntimeError(f"Risposta GHE non parsabile: {e}") from e

    # === TUTTI I RETRY FALLITI — diagnostica completa ===
    total_elapsed = "unknown"
    _log("ERROR", "TUTTI I RETRY FALLITI — diagnostica finale",
         url=log_url, total_attempts=max_retries,
         last_error_type=type(last_exception).__name__ if last_exception else "none",
         last_error=str(last_exception)[:500] if last_exception else "none",
         last_response_body=last_body[:2000] if last_body else "none")

    # Fai diagnostica di rete finale se era un timeout
    if isinstance(last_exception, (TimeoutError, socket.timeout, urllib.error.URLError)):
        _log("ERROR", "Esecuzione diagnostica rete finale post-fallimento")
        _diagnose_connection(url)

    if isinstance(last_exception, urllib.error.HTTPError):
        raise RuntimeError(
            f"GHE HTTP {last_exception.code} dopo {max_retries} tentativi: "
            f"{last_exception.reason} — {last_body[:500]}"
        ) from last_exception
    elif last_exception:
        error_msg = str(getattr(last_exception, 'reason', last_exception))
        raise RuntimeError(
            f"Errore rete GHE dopo {max_retries} tentativi: {error_msg}"
        ) from last_exception
    else:
        raise RuntimeError(f"Richiesta HTTP fallita dopo {max_retries} tentativi")


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


def _extract_query_params(event):
    """Estrae query parameters da TUTTE le possibili sorgenti nell'evento Lambda.

    Supporta:
    - API Gateway v1 REST API  → queryStringParameters
    - API Gateway v2 HTTP API  → queryStringParameters, rawQueryString
    - Lambda Function URL      → queryStringParameters, rawQueryString
    - ALB                      → queryStringParameters, multiValueQueryStringParameters
    - Fallback                 → rawPath con ?query, headers
    """
    # Log completo dell'evento per debug (prima di processare)
    _log("DEBUG", "Estrazione query params - evento completo",
         event_keys=list(event.keys()),
         queryStringParameters=event.get("queryStringParameters"),
         rawQueryString=event.get("rawQueryString"),
         rawPath=event.get("rawPath"),
         path=event.get("path"),
         headers_keys=list(event.get("headers", {}).keys()) if event.get("headers") else None)

    # 1. rawQueryString FIRST (Lambda Function URL / HTTP API v2) — es. "code=abc123&state=xyz"
    # Diamo priorità a questo perché è la fonte più affidabile per Function URLs
    raw_qs = event.get("rawQueryString", "")
    if raw_qs and raw_qs.strip():
        parsed = urllib.parse.parse_qs(raw_qs, keep_blank_values=True)
        result = {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
        _log("INFO", "Query params da rawQueryString", raw=raw_qs, parsed_keys=list(result.keys()), values=result)
        return result

    # 2. Sorgente standard: queryStringParameters (dict)
    params = event.get("queryStringParameters")
    if params and isinstance(params, dict) and len(params) > 0:
        _log("DEBUG", "Query params da queryStringParameters", params_keys=list(params.keys()), values=params)
        return params

    # 3. multiValueQueryStringParameters (API Gateway v1 / ALB)
    multi = event.get("multiValueQueryStringParameters")
    if multi and isinstance(multi, dict) and len(multi) > 0:
        result = {k: v[0] if isinstance(v, list) and len(v) == 1 else v for k, v in multi.items()}
        _log("INFO", "Query params da multiValueQueryStringParameters", parsed_keys=list(result.keys()), values=result)
        return result

    # 4. Fallback: prova a estrarre da rawPath o path
    for path_key in ("rawPath", "path", "resource"):
        path_val = event.get(path_key, "")
        if "?" in str(path_val):
            qs = str(path_val).split("?", 1)[1]
            parsed = urllib.parse.parse_qs(qs, keep_blank_values=True)
            result = {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
            _log("INFO", f"Query params da {path_key} (fallback)", raw=qs, parsed_keys=list(result.keys()), values=result)
            return result

    # 5. Ultimo tentativo: requestContext.http.path (API Gateway v2)
    http_ctx = event.get("requestContext", {}).get("http", {})
    raw_path = http_ctx.get("path", "")
    if "?" in raw_path:
        qs = raw_path.split("?", 1)[1]
        parsed = urllib.parse.parse_qs(qs, keep_blank_values=True)
        result = {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
        _log("INFO", "Query params da requestContext.http.path (fallback)", parsed_keys=list(result.keys()), values=result)
        return result

    # 6. Ultima risorsa: prova a cercare nei headers (alcuni proxy passano la query string come header)
    headers = event.get("headers", {})
    if headers:
        for header_key in ("X-Original-URL", "X-Rewrite-URL", "X-Forwarded-Path"):
            header_val = headers.get(header_key, "")
            if "?" in header_val:
                qs = header_val.split("?", 1)[1]
                parsed = urllib.parse.parse_qs(qs, keep_blank_values=True)
                result = {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
                _log("INFO", f"Query params da header {header_key} (fallback)", parsed_keys=list(result.keys()), values=result)
                return result

    _log("ERROR", "NESSUN query parameter trovato in NESSUNA sorgente",
         has_queryStringParameters=("queryStringParameters" in event),
         queryStringParameters_value=str(event.get("queryStringParameters")),
         has_rawQueryString=("rawQueryString" in event),
         rawQueryString_value=str(event.get("rawQueryString", "")),
         rawQueryString_repr=repr(event.get("rawQueryString", "")),
         has_rawPath=("rawPath" in event),
         rawPath_value=str(event.get("rawPath", "")),
         has_path=("path" in event),
         path_value=str(event.get("path", "")),
         has_multiValue=("multiValueQueryStringParameters" in event),
         full_event_json=json.dumps(event, default=str)[:2000])
    return {}


# ============================================
# Handler principale
# ============================================
def lambda_handler(event, context):
    global _request_id
    _request_id = getattr(context, "aws_request_id", "-") if context else "-"

    # Log evento completo (senza body per non esporre token)
    safe_event = {k: v for k, v in event.items() if k != "body"}
    _log("INFO", "Lambda invocata",
         event_keys=list(event.keys()),
         queryStringParameters=str(event.get("queryStringParameters"))[:200],
         rawQueryString=event.get("rawQueryString", "N/A"),
         rawPath=event.get("rawPath", "N/A"),
         path=event.get("path", "N/A"),
         httpMethod=event.get("httpMethod", "N/A"),
         requestContext_http=event.get("requestContext", {}).get("http", {}),
         isBase64Encoded=event.get("isBase64Encoded", "N/A"),
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
        return _handle_oauth(event, context)

    except Exception as e:
        _log("ERROR", "Errore non gestito nel handler",
             error=str(e), traceback=traceback.format_exc())
        return _json_response(500, {"error": "Internal Server Error"})


# ============================================
# GET: OAuth code → transit token → redirect
# ============================================
def _handle_oauth(event, context=None):
    redirect_url = REDIRECT_URL

    if not redirect_url:
        _log("ERROR", "REDIRECT_URL non configurato")
        return _json_response(500, {"error": "REDIRECT_URL non configurato"})

    params = _extract_query_params(event)
    code = params.get("code")
    state = params.get("state")

    _log("INFO", "OAuth GET ricevuto",
         has_code=bool(code), has_state=bool(state),
         code_preview=code[:8] + "..." if code else "null",
         params_keys=list(params.keys()),
         params=params)

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
         ghe_base=ghe_base, client_id=client_id, code_preview=code[:8] + "...",
         lambda_remaining_ms=int(context.get_remaining_time_in_millis()) if context and hasattr(context, 'get_remaining_time_in_millis') else "N/A")

    # === Step 1: Scambia code → access_token ===
    t_step1 = time.time()
    try:
        token_url = f"{ghe_base}/login/oauth/access_token"
        _log("INFO", "Step 1: Token exchange → POST " + token_url.split("?")[0])

        token_data = _http_request(
            token_url,
            data={"client_id": client_id, "client_secret": client_secret, "code": code},
            method="POST",
        )

        step1_ms = round((time.time() - t_step1) * 1000, 1)
        _log("INFO", "Step 1 completato",
             elapsed_ms=step1_ms,
             response_keys=list(token_data.keys()) if isinstance(token_data, dict) else "not_dict",
             has_access_token="access_token" in token_data if isinstance(token_data, dict) else False,
             has_error="error" in token_data if isinstance(token_data, dict) else False,
             full_response=str(token_data)[:1000])

    except RuntimeError as e:
        step1_ms = round((time.time() - t_step1) * 1000, 1)
        _log("ERROR", "Step 1 FALLITO",
             elapsed_ms=step1_ms, error=str(e),
             traceback=traceback.format_exc())
        return _error_redirect(redirect_url, f"Token exchange fallito ({step1_ms}ms): {e}")

    access_token = token_data.get("access_token") if isinstance(token_data, dict) else None
    if not access_token:
        err = ""
        if isinstance(token_data, dict):
            err = (token_data.get("error_description")
                   or token_data.get("error")
                   or "Token non ricevuto")
        else:
            err = f"Risposta inattesa: {str(token_data)[:200]}"
        _log("ERROR", "Step 1 FALLITO: access_token assente nella risposta",
             error=err, full_response=str(token_data)[:2000],
             response_type=type(token_data).__name__)
        return _error_redirect(redirect_url, err)

    _log("INFO", "Step 1 OK: access_token ricevuto",
         token_type=token_data.get("token_type", "unknown"),
         scope=token_data.get("scope", "unknown"))

    # === Step 2: Ottieni profilo utente ===
    t_step2 = time.time()
    try:
        user_url = f"{ghe_base}/api/v3/user"
        _log("INFO", "Step 2: Fetch profilo utente → GET " + user_url)

        user_data = _http_request(
            user_url,
            headers={"Authorization": f"token {access_token}"},
        )

        step2_ms = round((time.time() - t_step2) * 1000, 1)
        _log("INFO", "Step 2 completato",
             elapsed_ms=step2_ms,
             response_keys=list(user_data.keys()) if isinstance(user_data, dict) else "not_dict",
             login=user_data.get("login") if isinstance(user_data, dict) else None)

    except RuntimeError as e:
        step2_ms = round((time.time() - t_step2) * 1000, 1)
        _log("ERROR", "Step 2 FALLITO",
             elapsed_ms=step2_ms, error=str(e),
             traceback=traceback.format_exc())
        return _error_redirect(redirect_url, f"Fetch profilo fallito ({step2_ms}ms): {e}")

    login = user_data.get("login") if isinstance(user_data, dict) else None
    if not login:
        _log("ERROR", "Step 2 FALLITO: login non trovato nel profilo",
             full_response=str(user_data)[:2000])
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
