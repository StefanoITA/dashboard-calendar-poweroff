"""
Lambda Authorizer — API Gateway Token Verifier (REQUEST type)

Authorizer unico per tutti gli endpoint dell'API Gateway.
Verifica token HMAC-SHA256 (transit typ="t" o session typ="s") e genera IAM policy.

Comportamento:
  - Estrae il token da Authorization: Bearer <token>
  - Verifica firma HMAC-SHA256 con SIGNING_SECRET
  - Verifica scadenza (exp)
  - Determina automaticamente il tipo di token (transit/session)
  - Passa username e tipo token alla Lambda backend via context

Configurazione API Gateway:
  - Authorizer Type: REQUEST
  - Identity Source: $request.header.Authorization
  - Token Validation: (vuoto, la validazione è nella Lambda)
  - TTL: 0 (o breve, per non cacheare transit token scaduti)

  Assegnazione per route:
    POST /st_exchange       → questo authorizer (accetta typ="t")
    POST /schedules/fetch   → questo authorizer (accetta typ="s")
    POST /schedules/save    → questo authorizer (accetta typ="s")
    GET  /users/*           → questo authorizer (accetta typ="s")
    GET  /oauth/callback    → NESSUN authorizer (redirect GitHub)
    OPTIONS *               → NESSUN authorizer (CORS preflight)

  L'authorizer NON filtra per tipo — accetta sia "t" che "s".
  È responsabilità della Lambda backend verificare che il tipo sia quello atteso
  per la route specifica (es. /st_exchange accetta solo "t").

Variabili d'ambiente:
  SIGNING_SECRET — Stessa chiave HMAC delle Lambda OAuth e FinOps API
  LOG_LEVEL      — DEBUG, INFO, WARN, ERROR (default: INFO)
"""

import base64
import hashlib
import hmac
import json
import os
import time


# ============================================
# Configurazione
# ============================================
SIGNING_SECRET = os.environ.get("SIGNING_SECRET", "")
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()

_LOG_LEVELS = {"DEBUG": 0, "INFO": 1, "WARN": 2, "ERROR": 3}


# ============================================
# Logging
# ============================================
def _log(level, message, **extra):
    if _LOG_LEVELS.get(level, 1) < _LOG_LEVELS.get(LOG_LEVEL, 1):
        return
    entry = {
        "level": level,
        "message": message,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    entry.update(extra)
    print(json.dumps(entry, default=str))


# ============================================
# Token HMAC verification
# ============================================
def _verify_token(token_str):
    """Verifica firma HMAC-SHA256, scadenza, e ritorna payload se valido."""
    if not token_str or "." not in token_str:
        _log("WARN", "Token formato non valido",
             token_length=len(token_str) if token_str else 0)
        return None

    parts = token_str.split(".", 1)
    if len(parts) != 2:
        return None

    payload_b64, sig_received = parts

    if not SIGNING_SECRET:
        _log("ERROR", "SIGNING_SECRET non configurato")
        return None

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
        _log("INFO", "Token scaduto",
             sub=payload.get("sub"), typ=payload.get("typ"),
             expired_ago_seconds=int(now - exp))
        return None

    typ = payload.get("typ")
    if typ not in ("t", "s"):
        _log("WARN", "Tipo token sconosciuto", typ=typ)
        return None

    return payload


# ============================================
# Policy builder
# ============================================
def _build_policy(principal_id, effect, method_arn, context=None):
    """Genera IAM policy per API Gateway."""
    # Usa wildcard sull'ARN per permettere il caching cross-route
    # Formato ARN: arn:aws:execute-api:region:account:api-id/stage/METHOD/resource
    arn_parts = method_arn.split(":")
    api_gw_arn = ":".join(arn_parts[:5])
    api_id_stage = arn_parts[5].split("/")
    resource_arn = f"{api_gw_arn}:{api_id_stage[0]}/{api_id_stage[1]}/*"

    policy = {
        "principalId": principal_id,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [{
                "Action": "execute-api:Invoke",
                "Effect": effect,
                "Resource": resource_arn,
            }],
        },
    }

    if context:
        policy["context"] = context

    return policy


# ============================================
# Token extraction
# ============================================
def _extract_token(event):
    """Estrae Bearer token dall'header Authorization."""
    # API Gateway REQUEST authorizer: headers in event["headers"]
    headers = event.get("headers", {})
    if not headers:
        return None

    # Header names possono essere lowercase (HTTP API v2) o mixed case (REST API v1)
    auth_header = headers.get("Authorization") or headers.get("authorization", "")

    if not auth_header:
        return None

    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()

    # Fallback: token senza prefisso Bearer
    return auth_header.strip() if auth_header else None


# ============================================
# Handler
# ============================================
def lambda_handler(event, context):
    _log("DEBUG", "Authorizer invocato",
         event_keys=list(event.keys()),
         method_arn=event.get("methodArn", "N/A"),
         has_headers=bool(event.get("headers")))

    method_arn = event.get("methodArn", "")

    # Estrai token
    token_str = _extract_token(event)
    if not token_str:
        _log("WARN", "Token assente nella richiesta")
        raise Exception("Unauthorized")  # API GW ritorna 401

    # Verifica token
    payload = _verify_token(token_str)
    if payload is None:
        _log("WARN", "Token non valido — Deny")
        raise Exception("Unauthorized")  # API GW ritorna 401

    username = payload.get("sub", "unknown")
    token_type = payload.get("typ", "unknown")
    exp = payload.get("exp", 0)

    _log("INFO", "Token verificato — Allow",
         username=username, typ=token_type,
         exp=exp, remaining_seconds=int(exp - time.time()))

    # Ritorna Allow con context per la Lambda backend
    return _build_policy(
        principal_id=username,
        effect="Allow",
        method_arn=method_arn,
        context={
            "username": username,
            "tokenType": token_type,
            "exp": str(exp),
        },
    )
