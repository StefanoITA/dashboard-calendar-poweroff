"""
Lambda: Jenkins Orchestrator Trigger

Triggera job Jenkins dell'orchestratore e fornisce link per monitoring con polling.

HTTP Methods:
  POST /trigger  → Avvia job Jenkins, ritorna job URL e queue ID per polling
  GET  /status   → Verifica stato job tramite queue ID o build number
  OPTIONS        → CORS preflight

Variabili d'ambiente:
  JENKINS_URL           — URL base Jenkins (es. https://jenkins.company.com)
  JENKINS_USER          — Username per autenticazione Jenkins
  JENKINS_API_TOKEN     — API token Jenkins
  JENKINS_JOB_NAME      — Nome del job da triggerare (es. "orchestrator/poweroff")
  POLLING_TIMEOUT       — Timeout in secondi per polling (default: 60)
  CORS_ORIGIN           — Origin per CORS (default: *)
  SSL_VERIFY            — "true" (default) o "false" per certificati interni
"""

import base64
import json
import os
import ssl
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, Any, Optional


# ============================================
# Configurazione
# ============================================
JENKINS_URL = os.environ.get("JENKINS_URL", "")
JENKINS_USER = os.environ.get("JENKINS_USER", "")
JENKINS_API_TOKEN = os.environ.get("JENKINS_API_TOKEN", "")
JENKINS_JOB_NAME = os.environ.get("JENKINS_JOB_NAME", "orchestrator/poweroff")
POLLING_TIMEOUT = int(os.environ.get("POLLING_TIMEOUT", "60"))
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
HTTP_TIMEOUT = 30
MAX_RETRIES = 3
RETRY_BACKOFF = 2


# ============================================
# Structured logging
# ============================================
_request_id = "-"


def _log(level: str, message: str, **extra):
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
    for var in ("JENKINS_URL", "JENKINS_USER", "JENKINS_API_TOKEN", "JENKINS_JOB_NAME"):
        val = os.environ.get(var, "")
        if not val:
            missing.append(var)
    if missing:
        _log("ERROR", "Variabili d'ambiente mancanti", missing_vars=missing)
        return False
    return True


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


def _jenkins_request(path: str, method: str = "GET", data: Optional[Dict] = None, max_retries: int = MAX_RETRIES):
    """
    Esegue richiesta HTTP a Jenkins con retry automatico.

    Args:
        path: Path relativo (es. "/job/orchestrator/build")
        method: HTTP method
        data: Dati da inviare (dict)
        max_retries: Numero massimo di retry

    Returns:
        Tuple (status_code, response_data, headers)
    """
    url = f"{JENKINS_URL.rstrip('/')}{path}"
    headers = {}

    # Basic Auth
    auth_str = f"{JENKINS_USER}:{JENKINS_API_TOKEN}"
    auth_b64 = base64.b64encode(auth_str.encode()).decode()
    headers["Authorization"] = f"Basic {auth_b64}"

    # Dati POST
    post_data = None
    if data:
        post_data = urllib.parse.urlencode(data).encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded"

    last_exception = None

    for attempt in range(max_retries):
        try:
            _log("DEBUG", "Jenkins request", method=method, url=url,
                 attempt=attempt + 1, max_retries=max_retries)

            req = urllib.request.Request(url, data=post_data, headers=headers, method=method)
            ctx = _get_ssl_context()

            with urllib.request.urlopen(req, context=ctx, timeout=HTTP_TIMEOUT) as resp:
                status = resp.status
                response_headers = dict(resp.headers)

                # Jenkins può ritornare 201 per build trigger
                if status in (200, 201):
                    try:
                        body = resp.read().decode("utf-8")
                        data = json.loads(body) if body.strip() else {}
                    except json.JSONDecodeError:
                        data = {}

                    _log("DEBUG", "Jenkins response OK", status=status,
                         has_data=bool(data), headers=list(response_headers.keys()))
                    return status, data, response_headers
                else:
                    _log("WARN", "Jenkins response non-200", status=status)
                    return status, {}, response_headers

        except urllib.error.HTTPError as e:
            # Non fare retry per errori client (4xx) tranne 429
            if 400 <= e.code < 500 and e.code != 429:
                _log("ERROR", "Jenkins HTTP error (no retry)", status=e.code, url=url)
                raise RuntimeError(f"Jenkins HTTP {e.code}: {e.reason}") from e

            last_exception = e
            _log("WARN", f"Jenkins HTTP error (attempt {attempt + 1}/{max_retries})",
                 status=e.code, url=url)

        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last_exception = e
            _log("WARN", f"Network/timeout error (attempt {attempt + 1}/{max_retries})",
                 url=url, error=str(e))

        # Retry con backoff
        if attempt < max_retries - 1:
            wait = RETRY_BACKOFF ** attempt
            _log("INFO", f"Retry dopo {wait}s", attempt=attempt + 1)
            time.sleep(wait)

    # Tutti i retry falliti
    if isinstance(last_exception, urllib.error.HTTPError):
        raise RuntimeError(f"Jenkins HTTP {last_exception.code} dopo {max_retries} tentativi")
    else:
        raise RuntimeError(f"Jenkins request failed dopo {max_retries} tentativi: {last_exception}")


def _cors_headers():
    return {
        "Access-Control-Allow-Origin": CORS_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


def _json_response(status: int, body: Dict):
    _log("DEBUG", "JSON response", status=status, body=body)
    return {
        "statusCode": status,
        "headers": {**_cors_headers(), "Content-Type": "application/json"},
        "body": json.dumps(body),
    }


# ============================================
# Jenkins API Operations
# ============================================
def _trigger_jenkins_job(params: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Triggera il job Jenkins e ritorna informazioni per il monitoring.

    Returns:
        {
            "queue_url": "https://jenkins.../queue/item/123/",
            "queue_id": 123,
            "job_url": "https://jenkins.../job/orchestrator/",
            "monitoring_url": "https://jenkins.../job/orchestrator/lastBuild/console"
        }
    """
    # Build path
    if params:
        path = f"/job/{JENKINS_JOB_NAME.strip('/')}/buildWithParameters"
    else:
        path = f"/job/{JENKINS_JOB_NAME.strip('/')}/build"

    _log("INFO", "Triggering Jenkins job", job=JENKINS_JOB_NAME, params=params)

    # Trigger build
    status, data, headers = _jenkins_request(path, method="POST", data=params or {})

    if status not in (200, 201):
        raise RuntimeError(f"Jenkins build trigger fallito: HTTP {status}")

    # Estrai queue location dalla risposta
    queue_location = headers.get("Location", "")
    queue_id = None

    if queue_location:
        # Es: "https://jenkins.../queue/item/123/"
        parts = queue_location.rstrip("/").split("/")
        if len(parts) >= 2 and parts[-2] == "item":
            try:
                queue_id = int(parts[-1])
            except ValueError:
                pass

    job_url = f"{JENKINS_URL.rstrip('/')}/job/{JENKINS_JOB_NAME.strip('/')}/"

    result = {
        "queue_url": queue_location,
        "queue_id": queue_id,
        "job_url": job_url,
        "monitoring_url": f"{job_url}lastBuild/console",
        "status": "queued"
    }

    _log("INFO", "Job triggered successfully", queue_id=queue_id, queue_url=queue_location)

    return result


def _get_queue_status(queue_id: int) -> Dict[str, Any]:
    """
    Verifica lo stato del job in coda.

    Returns:
        {
            "status": "queued" | "running" | "completed",
            "build_number": 123 (se disponibile),
            "build_url": "https://..." (se disponibile)
        }
    """
    path = f"/queue/item/{queue_id}/api/json"

    try:
        status, data, headers = _jenkins_request(path, method="GET")

        if status == 404:
            # Queue item non più in coda - potrebbe essere già in esecuzione o completato
            # Proviamo a prendere lastBuild
            return {"status": "unknown", "message": "Queue item not found - job may have started"}

        # Controlla se il job è stato assegnato a un executor
        executable = data.get("executable")
        if executable:
            build_number = executable.get("number")
            build_url = executable.get("url")
            return {
                "status": "running",
                "build_number": build_number,
                "build_url": build_url,
                "console_url": f"{build_url}console" if build_url else None
            }

        # Ancora in coda
        return {
            "status": "queued",
            "why": data.get("why", "Waiting in queue"),
            "stuck": data.get("stuck", False)
        }

    except Exception as e:
        _log("ERROR", "Failed to get queue status", queue_id=queue_id, error=str(e))
        return {"status": "error", "error": str(e)}


def _get_build_status(build_number: Optional[int] = None) -> Dict[str, Any]:
    """
    Verifica lo stato di una build specifica o dell'ultima build.

    Returns:
        {
            "status": "running" | "success" | "failure" | "aborted",
            "build_number": 123,
            "build_url": "https://...",
            "duration": 12345,
            "result": "SUCCESS" | "FAILURE" | None (se in esecuzione)
        }
    """
    if build_number:
        path = f"/job/{JENKINS_JOB_NAME.strip('/')}/{build_number}/api/json"
    else:
        path = f"/job/{JENKINS_JOB_NAME.strip('/')}/lastBuild/api/json"

    try:
        status, data, headers = _jenkins_request(path, method="GET")

        if status == 404:
            return {"status": "not_found", "error": "Build not found"}

        building = data.get("building", False)
        result = data.get("result")  # SUCCESS, FAILURE, ABORTED, etc.

        build_status = "running" if building else (result.lower() if result else "unknown")

        return {
            "status": build_status,
            "build_number": data.get("number"),
            "build_url": data.get("url"),
            "console_url": f"{data.get('url')}console" if data.get("url") else None,
            "duration": data.get("duration", 0),
            "result": result,
            "timestamp": data.get("timestamp")
        }

    except Exception as e:
        _log("ERROR", "Failed to get build status", build_number=build_number, error=str(e))
        return {"status": "error", "error": str(e)}


# ============================================
# Handler principale
# ============================================
def lambda_handler(event, context):
    global _request_id
    _request_id = getattr(context, "aws_request_id", "-") if context else "-"

    _log("INFO", "Lambda invocata", event_keys=list(event.keys()),
         httpMethod=event.get("httpMethod"), path=event.get("path"))

    # Valida configurazione
    if not _validate_config():
        return _json_response(500, {
            "error": "Configurazione Lambda incompleta — verifica variabili d'ambiente"
        })

    # Determina metodo HTTP
    method = (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method", "")
    ).upper()

    try:
        if method == "OPTIONS":
            return _json_response(200, {})

        if method == "POST":
            return _handle_trigger(event)

        if method == "GET":
            return _handle_status(event)

        return _json_response(405, {"error": "Method not allowed"})

    except Exception as e:
        _log("ERROR", "Errore non gestito nel handler",
             error=str(e), traceback=traceback.format_exc())
        return _json_response(500, {"error": "Internal Server Error", "message": str(e)})


# ============================================
# POST: Trigger job Jenkins
# ============================================
def _handle_trigger(event):
    """Triggera il job Jenkins con parametri opzionali."""

    # Estrai parametri dal body
    raw_body = event.get("body") or "{}"
    is_base64 = event.get("isBase64Encoded", False)

    if is_base64:
        try:
            raw_body = base64.b64decode(raw_body).decode("utf-8")
        except Exception as e:
            _log("ERROR", "Decodifica base64 body fallita", error=str(e))
            return _json_response(400, {"error": "Invalid base64 body"})

    try:
        body = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError as e:
        _log("ERROR", "JSON body non valido", error=str(e))
        return _json_response(400, {"error": "Invalid JSON body"})

    # Parametri per il job Jenkins
    job_params = body.get("parameters", {})

    _log("INFO", "Triggering job", job=JENKINS_JOB_NAME, params=job_params)

    try:
        result = _trigger_jenkins_job(job_params if job_params else None)

        # Se c'è un queue_id, prova a fare un polling immediato per vedere se il job è già partito
        if result.get("queue_id"):
            time.sleep(1)  # Aspetta 1 secondo
            queue_status = _get_queue_status(result["queue_id"])
            result.update(queue_status)

        return _json_response(200, {
            "success": True,
            "message": "Job triggered successfully",
            **result
        })

    except Exception as e:
        _log("ERROR", "Failed to trigger job", error=str(e), traceback=traceback.format_exc())
        return _json_response(500, {
            "success": False,
            "error": str(e)
        })


# ============================================
# GET: Status job Jenkins
# ============================================
def _handle_status(event):
    """Verifica lo stato del job tramite queue_id o build_number."""

    # Estrai parametri dalla query string
    params = event.get("queryStringParameters") or {}
    queue_id = params.get("queue_id")
    build_number = params.get("build_number")

    _log("INFO", "Status check", queue_id=queue_id, build_number=build_number)

    try:
        if queue_id:
            result = _get_queue_status(int(queue_id))
        elif build_number:
            result = _get_build_status(int(build_number))
        else:
            # Ritorna status dell'ultima build
            result = _get_build_status()

        return _json_response(200, {
            "success": True,
            **result
        })

    except Exception as e:
        _log("ERROR", "Failed to get status", error=str(e), traceback=traceback.format_exc())
        return _json_response(500, {
            "success": False,
            "error": str(e)
        })
