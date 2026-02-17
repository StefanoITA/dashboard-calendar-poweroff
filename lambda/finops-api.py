"""
Lambda: FinOps API — Proxy sicuro per DynamoDB con verifica token e permessi

Architettura:
  Sito statico (GHE Pages) → API Gateway → Questa Lambda → DynamoDB

Routing (path-based):
  POST /schedules/fetch   → Leggi schedule (utente autenticato, filtrato per permessi)
  POST /schedules/save    → Salva schedule (solo utenti RW per quell'app)
  GET  /users             → Lista utenti (solo Admin)
  POST /users             → Crea/aggiorna utente (solo Admin)
  DELETE /users/{id}      → Elimina utente (solo Admin)
  GET  /users/me          → Profilo utente corrente (qualsiasi utente autenticato)
  OPTIONS *               → CORS preflight

Sicurezza:
  - Ogni richiesta DEVE avere header Authorization: Bearer <session_token>
  - Il token è verificato con HMAC (stesso SIGNING_SECRET della lambda OAuth)
  - Il github_user dal token viene cercato nella tabella FinOps_Platform_Users
  - I permessi RW/RO vengono verificati per ogni operazione su schedule

Variabili d'ambiente:
  SIGNING_SECRET          — Stessa chiave HMAC della lambda OAuth
  SCHEDULES_TABLE         — Nome tabella DynamoDB schedules (default: FinOpsShutdownScheduler)
  USERS_TABLE             — Nome tabella DynamoDB utenti (default: FinOps_Platform_Users)
  CORS_ORIGIN             — Origine CORS consentita (es. https://pages.github.AZIENDA.com)
  USERS_GSI_NAME          — Nome del GSI su github_user (default: github_user-index)
"""

import base64
import hashlib
import hmac
import json
import os
import time
import traceback
import decimal

import boto3
from boto3.dynamodb.conditions import Key

# ============================================
# Configurazione
# ============================================
SIGNING_SECRET = os.environ.get("SIGNING_SECRET", "")
SCHEDULES_TABLE = os.environ.get("SCHEDULES_TABLE", "FinOpsShutdownScheduler")
USERS_TABLE = os.environ.get("USERS_TABLE", "FinOps_Platform_Users")
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
USERS_GSI_NAME = os.environ.get("USERS_GSI_NAME", "github_user-index")

# DynamoDB client (riutilizzato tra invocazioni per performance)
_dynamodb = boto3.resource("dynamodb")
_schedules_table = _dynamodb.Table(SCHEDULES_TABLE)
_users_table = _dynamodb.Table(USERS_TABLE)

_request_id = "-"


# ============================================
# Logging
# ============================================
def _log(level, message, **extra):
    entry = {
        "level": level,
        "message": message,
        "request_id": _request_id,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    entry.update(extra)
    print(json.dumps(entry, default=str))


def _redact_token(token_str):
    """Mostra solo primi 10 e ultimi 6 caratteri di un token per debug."""
    if not token_str or len(token_str) < 20:
        return f"[len={len(token_str) if token_str else 0}]"
    return f"{token_str[:10]}...{token_str[-6:]} [len={len(token_str)}]"


# ============================================
# JSON helpers (DynamoDB Decimal → int/float)
# ============================================
class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, decimal.Decimal):
            return int(o) if o == int(o) else float(o)
        return super().default(o)


def _json_dumps(obj):
    return json.dumps(obj, cls=DecimalEncoder)


# ============================================
# CORS helpers
# ============================================
def _cors_headers():
    return {
        "Access-Control-Allow-Origin": CORS_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
    }


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {**_cors_headers(), "Content-Type": "application/json"},
        "body": _json_dumps(body),
    }


# ============================================
# Token verification (stessa logica della lambda OAuth)
# ============================================
def _verify_token(token_str):
    """Verifica token HMAC e ritorna payload se valido."""
    _log("DEBUG", "Token verify — Inizio",
         token_preview=_redact_token(token_str),
         has_dot="." in token_str if token_str else False)

    if not token_str or "." not in token_str:
        _log("WARN", "Token verify — FALLITO: token vuoto o senza punto",
             token_empty=not token_str,
             has_dot="." in token_str if token_str else False)
        return None

    parts = token_str.split(".", 1)
    if len(parts) != 2:
        _log("WARN", "Token verify — FALLITO: split non ha prodotto 2 parti",
             parts_count=len(parts))
        return None

    payload_b64, sig_received = parts
    _log("DEBUG", "Token verify — Parti estratte",
         payload_b64_len=len(payload_b64),
         sig_received_len=len(sig_received),
         sig_received_preview=sig_received[:10] + "..." if len(sig_received) > 10 else sig_received)

    # Verifica SIGNING_SECRET configurato
    if not SIGNING_SECRET:
        _log("ERROR", "Token verify — FALLITO: SIGNING_SECRET non configurato!")
        return None

    _log("DEBUG", "Token verify — SIGNING_SECRET presente",
         secret_len=len(SIGNING_SECRET),
         secret_preview=SIGNING_SECRET[:3] + "..." if len(SIGNING_SECRET) > 3 else "***")

    sig_expected = hmac.new(
        SIGNING_SECRET.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    sig_match = hmac.compare_digest(sig_expected, sig_received)
    _log("DEBUG", "Token verify — HMAC comparison",
         sig_expected_preview=sig_expected[:10] + "...",
         sig_received_preview=sig_received[:10] + "...",
         sig_match=sig_match)

    if not sig_match:
        _log("WARN", "Token verify — FALLITO: firma HMAC non corrisponde",
             sig_expected_len=len(sig_expected),
             sig_received_len=len(sig_received))
        return None

    # Decodifica payload
    padded = payload_b64 + "=" * (4 - len(payload_b64) % 4)
    try:
        payload_raw = base64.urlsafe_b64decode(padded).decode("utf-8")
        payload = json.loads(payload_raw)
        _log("DEBUG", "Token verify — Payload decodificato",
             payload_keys=list(payload.keys()),
             sub=payload.get("sub"),
             typ=payload.get("typ"),
             exp=payload.get("exp"),
             iat=payload.get("iat"))
    except Exception as e:
        _log("WARN", "Token verify — FALLITO: errore decodifica payload",
             error=str(e),
             padded_len=len(padded))
        return None

    # Verifica scadenza
    now = time.time()
    exp = payload.get("exp", 0)
    if exp < now:
        _log("WARN", "Token verify — FALLITO: token scaduto",
             exp=exp, now=now,
             expired_ago_seconds=int(now - exp),
             sub=payload.get("sub"))
        return None

    _log("DEBUG", "Token verify — Scadenza OK",
         exp=exp, now=now,
         valid_for_seconds=int(exp - now),
         valid_for_days=round((exp - now) / 86400, 1))

    # Accetta solo session token (typ=s), non transit (typ=t)
    typ = payload.get("typ")
    if typ != "s":
        _log("WARN", "Token verify — FALLITO: tipo token non valido",
             typ_received=typ, typ_expected="s",
             sub=payload.get("sub"))
        return None

    _log("INFO", "Token verify — SUCCESSO",
         sub=payload.get("sub"),
         typ=typ,
         valid_for_days=round((exp - now) / 86400, 1))
    return payload


def _extract_token(event):
    """Estrae il token dall'header Authorization: Bearer <token>."""
    headers = event.get("headers", {})

    # Debug: log tutte le chiavi degli headers ricevuti
    header_keys = list(headers.keys()) if headers else []
    _log("DEBUG", "Token extraction — headers ricevuti",
         header_keys=header_keys,
         headers_type=type(headers).__name__,
         headers_count=len(header_keys))

    # API Gateway HTTP API v2 lowercasa tutti gli headers
    # API Gateway REST API v1 mantiene il case originale
    auth = headers.get("authorization") or headers.get("Authorization") or ""

    _log("DEBUG", "Token extraction — Authorization header",
         auth_found=bool(auth),
         auth_length=len(auth),
         auth_prefix=auth[:15] if auth else "(vuoto)",
         tried_lowercase=bool(headers.get("authorization")),
         tried_titlecase=bool(headers.get("Authorization")))

    if auth.startswith("Bearer "):
        token = auth[7:]
        _log("DEBUG", "Token extraction — Token estratto",
             token_preview=_redact_token(token),
             has_dot="." in token)
        return token

    # Fallback: cerca in tutti gli headers (case-insensitive)
    for key, value in headers.items():
        if key.lower() == "authorization" and value.startswith("Bearer "):
            _log("DEBUG", "Token extraction — Trovato con key case-insensitive",
                 original_key=key)
            return value[7:]

    _log("WARN", "Token extraction — Nessun token trovato",
         all_headers={k: v[:20] + "..." if len(str(v)) > 20 else v for k, v in headers.items()})
    return None


# ============================================
# User lookup & permission check
# ============================================
def _get_user_by_github(github_user):
    """Cerca utente nella tabella DynamoDB per github_user (via GSI)."""
    lookup_value = github_user.lower()
    _log("DEBUG", "User lookup via GSI",
         github_user_original=github_user,
         github_user_lowercase=lookup_value,
         table=USERS_TABLE,
         gsi=USERS_GSI_NAME)
    try:
        resp = _users_table.query(
            IndexName=USERS_GSI_NAME,
            KeyConditionExpression=Key("github_user").eq(lookup_value),
        )
        items = resp.get("Items", [])
        _log("DEBUG", "User lookup result",
             items_found=len(items),
             user_ids=[i.get("user_id") for i in items] if items else [],
             scanned_count=resp.get("ScannedCount", 0))
        return items[0] if items else None
    except Exception as e:
        _log("ERROR", "Errore query utente per github_user",
             github_user=github_user, error=str(e),
             error_type=type(e).__name__,
             traceback=traceback.format_exc())
        return None


def _get_user_by_id(user_id):
    """Cerca utente per user_id (PK diretto)."""
    try:
        resp = _users_table.get_item(Key={"user_id": user_id})
        return resp.get("Item")
    except Exception as e:
        _log("ERROR", "Errore get utente per user_id",
             user_id=user_id, error=str(e))
        return None


def _check_app_permission(user, app_name):
    """
    Ritorna il permesso dell'utente per un'applicazione: 'rw', 'ro', o None.
    Logica identica al frontend (DataManager.getAppPermission).
    """
    if not user:
        return None
    role = user.get("role", "")
    if role == "Admin":
        return "rw"
    if role == "Read-Only":
        apps = user.get("applications", [])
        if isinstance(apps, list) and "*" in apps:
            return "ro"
        if isinstance(apps, dict):
            return "ro" if app_name in apps else None
        return "ro"

    # Application_owner o altri ruoli
    apps = user.get("applications", {})
    if isinstance(apps, list):
        if "*" in apps:
            return "rw"
        return "rw" if app_name in apps else None
    if isinstance(apps, dict):
        return apps.get(app_name)
    return None


# ============================================
# DynamoDB key sanitization
# ============================================
def _sanitize_key(app, env):
    """
    Genera chiave DynamoDB safe: spazi → _, separatore app/env → #
    Es: "Applicazione Prova Uno 1" + "Development" → "Applicazione_Prova_Uno_1#Development"
    """
    safe_app = app.strip().replace(" ", "_")
    safe_env = env.strip().replace(" ", "_")
    return f"{safe_app}#{safe_env}"


def _parse_key(key):
    """Inverso di _sanitize_key: da chiave DynamoDB a (app, env) originali."""
    if "#" not in key:
        # Fallback per chiavi legacy con formato app_env
        return key, ""
    parts = key.split("#", 1)
    app = parts[0].replace("_", " ")
    env = parts[1].replace("_", " ")
    return app, env


# ============================================
# Handler principale
# ============================================
def lambda_handler(event, context):
    global _request_id
    _request_id = getattr(context, "aws_request_id", "-") if context else "-"

    # ============================================
    # DEBUG: Log completo della struttura event
    # ============================================
    _log("DEBUG", "=== EVENTO RICEVUTO ===",
         event_keys=list(event.keys()),
         has_rawPath="rawPath" in event,
         has_path="path" in event,
         has_httpMethod="httpMethod" in event,
         has_requestContext="requestContext" in event,
         has_headers="headers" in event,
         has_body="body" in event,
         isBase64Encoded=event.get("isBase64Encoded", False),
         version=event.get("version", "N/A"))

    # Log requestContext per capire il formato (v1 vs v2)
    rc = event.get("requestContext", {})
    if rc:
        _log("DEBUG", "RequestContext structure",
             rc_keys=list(rc.keys()),
             has_http="http" in rc,
             has_httpMethod="httpMethod" in rc,
             has_resourcePath="resourcePath" in rc,
             has_stage="stage" in rc,
             stage=rc.get("stage"),
             accountId=rc.get("accountId", "N/A"),
             apiId=rc.get("apiId", "N/A"))
        if "http" in rc:
            _log("DEBUG", "RequestContext.http (v2 format)",
                 http_method=rc["http"].get("method"),
                 http_path=rc["http"].get("path"),
                 http_sourceIp=rc["http"].get("sourceIp"))

    # Determina path e metodo
    raw_path = event.get("rawPath", "") or event.get("path", "")
    method_v1 = event.get("httpMethod", "")
    method_v2 = rc.get("http", {}).get("method", "")
    method = (method_v1 or method_v2).upper()

    _log("INFO", "API request",
         method=method, path=raw_path,
         method_source="httpMethod(v1)" if method_v1 else "requestContext.http(v2)" if method_v2 else "UNKNOWN")

    # CORS preflight
    if method == "OPTIONS":
        return _response(200, {})

    # Favicon shortcut
    if "favicon" in raw_path.lower():
        return {"statusCode": 204, "body": ""}

    # ============================================
    # Autenticazione: verifica token su OGNI richiesta
    # ============================================
    _log("DEBUG", "=== INIZIO AUTENTICAZIONE ===")

    token_str = _extract_token(event)
    if not token_str:
        _log("WARN", "AUTH FALLITA: Token mancante",
             path=raw_path, method=method)
        return _response(401, {"error": "Token mancante. Invia header Authorization: Bearer <session_token>"})

    payload = _verify_token(token_str)
    if not payload:
        _log("WARN", "AUTH FALLITA: Token non valido",
             path=raw_path, method=method,
             token_preview=_redact_token(token_str))
        return _response(401, {"error": "Token non valido o scaduto. Effettua nuovamente il login."})

    github_user = payload.get("sub")
    if not github_user:
        _log("WARN", "AUTH FALLITA: Token senza sub",
             path=raw_path, payload_keys=list(payload.keys()))
        return _response(401, {"error": "Token non contiene utente (sub)."})

    _log("DEBUG", "=== LOOKUP UTENTE ===",
         github_user=github_user,
         users_table=USERS_TABLE,
         gsi_name=USERS_GSI_NAME)

    # Cerca utente in DynamoDB
    user = _get_user_by_github(github_user)
    if not user:
        _log("WARN", "Utente non trovato in DynamoDB",
             github_user=github_user,
             table=USERS_TABLE,
             gsi=USERS_GSI_NAME)
        return _response(403, {"error": f"Utente '{github_user}' non autorizzato. Contattare un amministratore."})

    _log("INFO", "Utente autenticato",
         user_id=user.get("user_id"), role=user.get("role"), github_user=github_user)

    # ============================================
    # Routing
    # ============================================
    try:
        if raw_path.endswith("/schedules/fetch"):
            return _handle_schedules_fetch(event, user)
        elif raw_path.endswith("/schedules/save"):
            return _handle_schedules_save(event, user)
        elif raw_path.endswith("/users/me"):
            return _handle_users_me(user)
        elif raw_path.endswith("/users") and method == "GET":
            return _handle_users_list(user)
        elif raw_path.endswith("/users") and method == "POST":
            return _handle_users_upsert(event, user)
        elif "/users/" in raw_path and method == "DELETE":
            return _handle_users_delete(event, raw_path, user)
        else:
            return _response(404, {"error": f"Endpoint non trovato: {method} {raw_path}"})

    except Exception as e:
        _log("ERROR", "Errore non gestito", error=str(e), traceback=traceback.format_exc())
        return _response(500, {"error": "Errore interno del server"})


# ============================================
# POST /schedules/fetch
# ============================================
def _handle_schedules_fetch(event, user):
    """Fetch schedule per le chiavi richieste. Filtra per permessi utente."""
    body = _parse_body(event)
    keys = body.get("keys", [])
    if not keys:
        return _response(400, {"error": "Campo 'keys' mancante o vuoto"})

    _log("INFO", "Schedules fetch", key_count=len(keys), user_id=user.get("user_id"))

    items = {}
    for key in keys:
        app, env = _parse_key(key)
        # Verifica che l'utente possa accedere a questa app (almeno ro)
        perm = _check_app_permission(user, app)
        if not perm:
            _log("WARN", "Accesso negato per fetch", app=app, user_id=user.get("user_id"))
            continue  # Salta silenziosamente le app non autorizzate

        try:
            resp = _schedules_table.get_item(Key={"app_env": key})
            item = resp.get("Item")
            if item:
                items[key] = item.get("schedules", {})
            else:
                items[key] = {}
        except Exception as e:
            _log("ERROR", "Errore DynamoDB get_item", key=key, error=str(e))
            items[key] = {}

    return _response(200, {"items": items})


# ============================================
# POST /schedules/save
# ============================================
def _handle_schedules_save(event, user):
    """Salva schedule per un app_env. Verifica permesso RW. Last-write-wins."""
    body = _parse_body(event)
    key = body.get("key")
    data = body.get("data")

    if not key or data is None:
        return _response(400, {"error": "Campi 'key' e 'data' obbligatori"})

    app, env = _parse_key(key)

    # Verifica permesso RW
    perm = _check_app_permission(user, app)
    if perm != "rw":
        _log("WARN", "Tentativo di scrittura non autorizzato",
             app=app, env=env, user_id=user.get("user_id"), perm=perm)
        return _response(403, {
            "error": f"Non hai permesso di scrittura per '{app}'. Permesso attuale: {perm or 'nessuno'}"
        })

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    user_id = user.get("user_id", "unknown")

    _log("INFO", "Schedules save",
         key=key, app=app, env=env, user_id=user_id,
         hostname_count=len(data) if isinstance(data, dict) else 0)

    # Last-write-wins: PutItem sovrascrive completamente
    try:
        _schedules_table.put_item(Item={
            "app_env": key,
            "app": app,
            "env": env,
            "schedules": data,
            "last_modified_by": user_id,
            "last_modified_at": now,
        })
    except Exception as e:
        _log("ERROR", "Errore DynamoDB put_item", key=key, error=str(e))
        return _response(500, {"error": f"Errore nel salvataggio: {e}"})

    return _response(200, {"success": True, "key": key, "modified_by": user_id, "modified_at": now})


# ============================================
# GET /users/me
# ============================================
def _handle_users_me(user):
    """Ritorna il profilo dell'utente corrente (sanitizzato)."""
    safe_user = {k: v for k, v in user.items() if k not in ("created_at", "updated_at", "updated_by")}
    return _response(200, {"user": safe_user})


# ============================================
# GET /users — Lista utenti (solo Admin)
# ============================================
def _handle_users_list(user):
    """Ritorna tutti gli utenti. Solo Admin."""
    if user.get("role") != "Admin":
        return _response(403, {"error": "Solo gli amministratori possono visualizzare la lista utenti"})

    try:
        resp = _users_table.scan()
        users = resp.get("Items", [])
        # Gestisci paginazione per tabelle grandi
        while "LastEvaluatedKey" in resp:
            resp = _users_table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
            users.extend(resp.get("Items", []))
    except Exception as e:
        _log("ERROR", "Errore DynamoDB scan users", error=str(e))
        return _response(500, {"error": f"Errore nel recupero utenti: {e}"})

    _log("INFO", "Users list", count=len(users), requested_by=user.get("user_id"))
    return _response(200, {"users": users})


# ============================================
# POST /users — Crea o aggiorna utente (solo Admin)
# ============================================
def _handle_users_upsert(event, user):
    """Crea o aggiorna un utente. Solo Admin."""
    if user.get("role") != "Admin":
        return _response(403, {"error": "Solo gli amministratori possono gestire gli utenti"})

    body = _parse_body(event)
    new_user = body.get("user")
    if not new_user:
        return _response(400, {"error": "Campo 'user' mancante"})

    user_id = new_user.get("user_id") or new_user.get("id")
    if not user_id:
        return _response(400, {"error": "Campo 'user_id' obbligatorio"})

    # Campi obbligatori
    required = ["name", "github_user", "role"]
    missing = [f for f in required if not new_user.get(f)]
    if missing:
        return _response(400, {"error": f"Campi obbligatori mancanti: {', '.join(missing)}"})

    # Validazione ruolo
    valid_roles = ["Admin", "Application_owner", "Read-Only"]
    if new_user["role"] not in valid_roles:
        return _response(400, {"error": f"Ruolo non valido. Valori consentiti: {', '.join(valid_roles)}"})

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # Verifica se esiste già
    existing = _get_user_by_id(user_id)

    item = {
        "user_id": user_id,
        "name": new_user["name"],
        "github_user": new_user["github_user"].lower(),
        "role": new_user["role"],
        "applications": new_user.get("applications", ["*"] if new_user["role"] == "Admin" else {}),
        "updated_at": now,
        "updated_by": user.get("user_id"),
    }
    if not existing:
        item["created_at"] = now

    try:
        _users_table.put_item(Item=item)
    except Exception as e:
        _log("ERROR", "Errore DynamoDB put_item user", user_id=user_id, error=str(e))
        return _response(500, {"error": f"Errore nel salvataggio utente: {e}"})

    action = "aggiornato" if existing else "creato"
    _log("INFO", f"Utente {action}", user_id=user_id, by=user.get("user_id"))
    return _response(200, {"success": True, "user_id": user_id, "action": action})


# ============================================
# DELETE /users/{id} — Elimina utente (solo Admin)
# ============================================
def _handle_users_delete(event, raw_path, user):
    """Elimina un utente. Solo Admin. Non puoi eliminare te stesso."""
    if user.get("role") != "Admin":
        return _response(403, {"error": "Solo gli amministratori possono eliminare utenti"})

    # Estrai user_id dall'URL: /users/mario.rossi
    parts = raw_path.rstrip("/").split("/")
    target_id = parts[-1] if parts else ""

    if not target_id or target_id == "users":
        return _response(400, {"error": "user_id mancante nell'URL"})

    # Non puoi eliminare te stesso
    if target_id == user.get("user_id"):
        return _response(400, {"error": "Non puoi eliminare il tuo stesso account"})

    # Verifica che esista
    existing = _get_user_by_id(target_id)
    if not existing:
        return _response(404, {"error": f"Utente '{target_id}' non trovato"})

    try:
        _users_table.delete_item(Key={"user_id": target_id})
    except Exception as e:
        _log("ERROR", "Errore DynamoDB delete_item user", user_id=target_id, error=str(e))
        return _response(500, {"error": f"Errore nell'eliminazione: {e}"})

    _log("INFO", "Utente eliminato", user_id=target_id, by=user.get("user_id"))
    return _response(200, {"success": True, "deleted": target_id})


# ============================================
# Helper: parse body
# ============================================
def _parse_body(event):
    """Parsa il body della richiesta (supporta base64)."""
    raw = event.get("body") or ""
    is_b64 = event.get("isBase64Encoded", False)

    _log("DEBUG", "Parse body",
         body_len=len(raw),
         isBase64Encoded=is_b64,
         body_preview=raw[:100] + "..." if len(raw) > 100 else raw)

    if is_b64:
        try:
            raw = base64.b64decode(raw).decode("utf-8")
            _log("DEBUG", "Body decoded from base64", decoded_len=len(raw))
        except Exception as e:
            _log("WARN", "Body base64 decode failed", error=str(e))
            return {}
    try:
        parsed = json.loads(raw) if raw else {}
        _log("DEBUG", "Body parsed", keys=list(parsed.keys()) if isinstance(parsed, dict) else "not_dict")
        return parsed
    except (json.JSONDecodeError, TypeError) as e:
        _log("WARN", "Body JSON parse failed", error=str(e), raw_preview=raw[:200])
        return {}


# ============================================
# Log configurazione all'avvio (cold start)
# ============================================
_log("INFO", "=== LAMBDA COLD START ===",
     signing_secret_configured=bool(SIGNING_SECRET),
     signing_secret_len=len(SIGNING_SECRET) if SIGNING_SECRET else 0,
     schedules_table=SCHEDULES_TABLE,
     users_table=USERS_TABLE,
     cors_origin=CORS_ORIGIN,
     users_gsi_name=USERS_GSI_NAME)
