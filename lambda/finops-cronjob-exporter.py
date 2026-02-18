"""
Lambda: FinOps Cronjob Exporter — Genera lista cronjob da DynamoDB

Architettura:
  Lambda Function URL → Autenticazione tramite token statico → Scan DynamoDB → Output testo crontab

Endpoint:
  GET /?token=<EXPORTER_TOKEN>   → Restituisce elenco completo cronjob in formato testo

Output:
  Testo plain in formato crontab con:
  - Commenti per identificare applicazione / ambiente
  - Una riga per ogni azione (start/stop) per ogni macchina
  - Formato: <cron_expression>  <hostname>  <action>

Variabili d'ambiente:
  EXPORTER_TOKEN      — Token statico per autenticazione (obbligatorio)
  SCHEDULES_TABLE     — Nome tabella DynamoDB (default: FinOpsShutdownScheduler)
  AWS_REGION          — Regione AWS (default: eu-west-1)
  DEBUG               — Abilita log di debug (default: false)

Edge case gestiti:
  - Schedule ambiente-wide (envGroupId): già espanse per macchina in DynamoDB
  - Eccezioni: macchine escluse non hanno l'entry con quel envGroupId
  - Deduplicazione: se due entry generano lo stesso cronjob (stessa macchina, stesso
    orario, stessa azione), viene mantenuta una sola riga
  - Date specifiche: raggruppate per mese per compattezza
  - Tipi schedule: window (start+stop) e shutdown (solo stop)
  - Recurring: daily, weekdays, weekends, one-time (dates)
"""

import json
import os
import time
import traceback

import boto3
import botocore.exceptions

# ============================================
# Configurazione
# ============================================
EXPORTER_TOKEN = os.environ.get("EXPORTER_TOKEN", "")
SCHEDULES_TABLE = os.environ.get("SCHEDULES_TABLE", "FinOpsShutdownScheduler")
DEBUG = os.environ.get("DEBUG", "false").lower() in ("true", "1", "yes")


# ============================================
# Logging
# ============================================
def _log(level, message, **extra):
    if level == "DEBUG" and not DEBUG:
        return
    entry = {
        "level": level,
        "message": message,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    entry.update(extra)
    print(json.dumps(entry, default=str))


# ============================================
# DynamoDB
# ============================================
_dynamodb = boto3.resource("dynamodb")
_table = _dynamodb.Table(SCHEDULES_TABLE)


def _scan_all_schedules():
    """Scan completo della tabella schedule. Gestisce paginazione."""
    items = []
    kwargs = {}
    while True:
        try:
            resp = _table.scan(**kwargs)
        except botocore.exceptions.ClientError as e:
            code = e.response["Error"]["Code"]
            msg = e.response["Error"]["Message"]
            _log("ERROR", "DynamoDB scan fallito", error_code=code, error_msg=msg)
            raise
        items.extend(resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    _log("DEBUG", "Scan completato", items_count=len(items))
    return items


# ============================================
# Generazione Cronjob
# ============================================
def _parse_time(time_str):
    """Parsa 'HH:MM' e ritorna (hour, minute). Ritorna (0, 0) se invalido."""
    if not time_str or ":" not in time_str:
        return (0, 0)
    try:
        parts = time_str.split(":")
        return (int(parts[0]), int(parts[1]))
    except (ValueError, IndexError):
        return (0, 0)


def _generate_crons_for_entry(entry):
    """
    Converte un singolo entry di schedule in una lista di tuple (action, cron_expression).

    Logica identica a generateCronjobs() di data.js:
    - window + daily       → start MM HH * * *, stop MM HH * * *
    - shutdown + daily     → stop 0 0 * * *
    - window + weekdays    → start MM HH * * 1-5, stop MM HH * * 1-5
    - shutdown + weekdays  → stop 0 0 * * 1-5
    - window + weekends    → start MM HH * * 0,6, stop MM HH * * 0,6
    - shutdown + weekends  → stop 0 0 * * 0,6
    - window + dates       → start/stop per mese raggruppato
    - shutdown + dates     → stop per mese raggruppato
    """
    entry_type = entry.get("type", "")
    recurring = entry.get("recurring", "none")
    start_h, start_m = _parse_time(entry.get("startTime"))
    stop_h, stop_m = _parse_time(entry.get("stopTime"))
    dates = entry.get("dates", [])

    crons = []

    if recurring == "daily":
        if entry_type == "window":
            crons.append(("start", f"{start_m} {start_h} * * *"))
            crons.append(("stop", f"{stop_m} {stop_h} * * *"))
        else:
            crons.append(("stop", "0 0 * * *"))

    elif recurring == "weekdays":
        if entry_type == "window":
            crons.append(("start", f"{start_m} {start_h} * * 1-5"))
            crons.append(("stop", f"{stop_m} {stop_h} * * 1-5"))
        else:
            crons.append(("stop", "0 0 * * 1-5"))

    elif recurring == "weekends":
        if entry_type == "window":
            crons.append(("start", f"{start_m} {start_h} * * 0,6"))
            crons.append(("stop", f"{stop_m} {stop_h} * * 0,6"))
        else:
            crons.append(("stop", "0 0 * * 0,6"))

    elif dates:
        # Raggruppa date per anno-mese per cronjob compatti
        by_month = {}
        for d in dates:
            try:
                parts = d.split("-")
                year_month = f"{parts[0]}-{parts[1]}"
                month = int(parts[1])
                day = int(parts[2])
                if year_month not in by_month:
                    by_month[year_month] = {"month": month, "days": []}
                by_month[year_month]["days"].append(day)
            except (ValueError, IndexError):
                _log("WARN", "Data non valida ignorata", date=d)
                continue

        for group in by_month.values():
            days_str = ",".join(str(d) for d in sorted(group["days"]))
            month = group["month"]
            if entry_type == "window":
                crons.append(("start", f"{start_m} {start_h} {days_str} {month} *"))
                crons.append(("stop", f"{stop_m} {stop_h} {days_str} {month} *"))
            else:
                crons.append(("stop", f"0 0 {days_str} {month} *"))

    return crons


def _build_cronjob_output(items):
    """
    Costruisce l'output testuale completo dei cronjob.

    Struttura output:
      # =========================================
      # Applicazione: <app> | Ambiente: <env>
      # =========================================
      # <hostname>
      <cron_expression>  <hostname>  <action>
      ...

    Deduplicazione:
      Per ogni macchina, se due entry generano la stessa combinazione
      (expression, action) viene mantenuta una sola riga, evitando
      conflitti (es. due start identici allo stesso minuto).
    """
    # Ordina items per app, poi per env, per output deterministico
    sorted_items = sorted(items, key=lambda x: (
        x.get("app", ""),
        x.get("env", ""),
    ))

    lines = []
    lines.append(f"# FinOps Cronjob Export")
    lines.append(f"# Generato: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    lines.append(f"# Tabella: {SCHEDULES_TABLE}")
    lines.append("")

    total_crons = 0
    total_machines = 0
    total_envs = 0

    for item in sorted_items:
        app = item.get("app", item.get("app_env", "???"))
        env = item.get("env", "")
        schedules = item.get("schedules", {})

        if not schedules:
            continue

        # Ordina hostname per output deterministico
        sorted_hostnames = sorted(schedules.keys())

        # Raccogli tutti i cronjob per questo ambiente
        env_crons = []

        for hostname in sorted_hostnames:
            entries = schedules[hostname]
            if not entries or not isinstance(entries, list):
                continue

            # Set per deduplicazione per questa macchina
            # Chiave: (expression, action) → garantisce che non ci siano duplicati
            seen = set()
            machine_crons = []

            for entry in entries:
                crons = _generate_crons_for_entry(entry)
                for action, expression in crons:
                    dedup_key = (expression, action)
                    if dedup_key in seen:
                        _log("DEBUG", "Cronjob duplicato rimosso",
                             hostname=hostname, action=action,
                             expression=expression)
                        continue
                    seen.add(dedup_key)
                    machine_crons.append((expression, hostname, action))

            if machine_crons:
                env_crons.extend(machine_crons)
                total_machines += 1

        if not env_crons:
            continue

        total_envs += 1

        # Intestazione ambiente
        lines.append(f"# =========================================")
        lines.append(f"# Applicazione: {app} | Ambiente: {env}")
        lines.append(f"# =========================================")

        # Raggruppa per hostname per leggibilità
        current_hostname = None
        for expression, hostname, action in env_crons:
            if hostname != current_hostname:
                lines.append(f"# {hostname}")
                current_hostname = hostname
            lines.append(f"{expression}  {hostname}  {action}")
            total_crons += 1

        lines.append("")

    # Footer con statistiche
    lines.append(f"# ---")
    lines.append(f"# Totale: {total_crons} cronjob, "
                 f"{total_machines} macchine, {total_envs} ambienti")

    return "\n".join(lines)


# ============================================
# Handler
# ============================================
def lambda_handler(event, context):
    """Entry point Lambda — invocata via Function URL."""
    _log("INFO", "Richiesta ricevuta",
         path=event.get("rawPath", ""),
         method=event.get("requestContext", {}).get("http", {}).get("method", ""))

    # --- Estrai metodo HTTP ---
    method = (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", "GET")
        .upper()
    )

    # --- CORS preflight ---
    if method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Max-Age": "86400",
            },
            "body": "",
        }

    # --- Solo GET ammesso ---
    if method != "GET":
        _log("WARN", "Metodo non ammesso", method=method)
        return _text_response(405, "Metodo non ammesso. Usa GET.")

    # --- Autenticazione token ---
    if not EXPORTER_TOKEN:
        _log("ERROR", "EXPORTER_TOKEN non configurato")
        return _text_response(500, "Errore configurazione: EXPORTER_TOKEN mancante.")

    # Estrai token da query string
    params = event.get("queryStringParameters") or {}
    token = params.get("token", "")

    if not token:
        _log("WARN", "Token mancante nella richiesta")
        return _text_response(401, "Token mancante. Usa ?token=<token>")

    if token != EXPORTER_TOKEN:
        _log("WARN", "Token non valido",
             token_preview=token[:4] + "..." if len(token) > 4 else "***")
        return _text_response(403, "Token non valido.")

    _log("DEBUG", "Autenticazione OK")

    # --- Fetch e genera ---
    try:
        items = _scan_all_schedules()

        if not items:
            _log("INFO", "Nessuna schedule trovata in DynamoDB")
            return _text_response(200, (
                f"# FinOps Cronjob Export\n"
                f"# Generato: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n"
                f"# Nessuna schedule configurata.\n"
            ))

        output = _build_cronjob_output(items)
        _log("INFO", "Export completato", items_count=len(items),
             output_lines=output.count("\n") + 1)
        return _text_response(200, output)

    except Exception as e:
        _log("ERROR", "Errore durante export",
             error=str(e), traceback=traceback.format_exc())
        return _text_response(500, f"Errore interno: {e}")


def _text_response(status, body):
    """Risposta HTTP con Content-Type text/plain."""
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
        "body": body,
    }
