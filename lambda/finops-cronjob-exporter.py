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
  - Formato: <cron_expression> <action> MPI <hostname> <application_name> <environment>

Variabili d'ambiente:
  EXPORTER_TOKEN      — Token statico per autenticazione (obbligatorio)
  SCHEDULES_TABLE     — Nome tabella DynamoDB (default: FinOpsShutdownScheduler)
  DEBUG               — Abilita log di debug (default: false)

Edge case gestiti:
  - Schedule ambiente-wide (envGroupId): già espanse per macchina in DynamoDB
  - Eccezioni: macchine escluse non hanno l'entry con quel envGroupId
  - Merge finestre sovrapposte: se due window si sovrappongono sulla stessa macchina
    e stesso pattern ricorrente, viene preso lo start più presto e lo stop più tardi
  - Deduplicazione: dopo il merge, cron identici (stessa macchina, stessa expression,
    stessa action) producono una sola riga
  - Validazione orari: ore 0-23, minuti 0-59, startTime < stopTime per window
  - Date specifiche: raggruppate per mese per compattezza, validate (mese 1-12, giorno 1-31)
  - Tipi schedule: window (start+stop) e shutdown (solo stop)
  - Recurring: daily, weekdays, weekends, one-time (dates)
  - Output deterministico: ordinato per app → env → hostname
"""

import json
import os
import time
import traceback
from collections import defaultdict

import boto3
import botocore.exceptions

# ============================================
# Configurazione
# ============================================
EXPORTER_TOKEN = os.environ.get("EXPORTER_TOKEN", "")
SCHEDULES_TABLE = os.environ.get("SCHEDULES_TABLE", "FinOpsShutdownScheduler")
DEBUG = os.environ.get("DEBUG", "false").lower() in ("true", "1", "yes")

_VALID_RECURRING = {"daily", "weekdays", "weekends", "none"}
_VALID_TYPES = {"window", "shutdown"}
_DAYS_IN_MONTH = {1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
                  7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}


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
# Validazione
# ============================================
def _parse_time(time_str):
    """Parsa 'HH:MM' e ritorna (hour, minute) o None se invalido."""
    if not time_str or not isinstance(time_str, str) or ":" not in time_str:
        return None
    try:
        parts = time_str.split(":")
        h, m = int(parts[0]), int(parts[1])
        if 0 <= h <= 23 and 0 <= m <= 59:
            return (h, m)
        _log("WARN", "Orario fuori range", time_str=time_str, hour=h, minute=m)
        return None
    except (ValueError, IndexError):
        _log("WARN", "Orario non parsabile", time_str=time_str)
        return None


def _time_to_minutes(h, m):
    """Converte ore e minuti in minuti dall'inizio del giorno."""
    return h * 60 + m


def _validate_entry(entry, hostname):
    """Valida un singolo entry di schedule. Ritorna l'entry normalizzato o None."""
    entry_type = entry.get("type", "")
    recurring = entry.get("recurring", "none")

    if entry_type not in _VALID_TYPES:
        _log("WARN", "Tipo entry non valido, ignorato",
             hostname=hostname, type=entry_type)
        return None

    if recurring not in _VALID_RECURRING:
        _log("WARN", "Ricorrenza non valida, ignorata",
             hostname=hostname, recurring=recurring)
        return None

    if entry_type == "window":
        start = _parse_time(entry.get("startTime"))
        stop = _parse_time(entry.get("stopTime"))
        if start is None or stop is None:
            _log("WARN", "Orario mancante o invalido per window, ignorato",
                 hostname=hostname,
                 startTime=entry.get("startTime"),
                 stopTime=entry.get("stopTime"))
            return None
        if _time_to_minutes(*start) >= _time_to_minutes(*stop):
            _log("WARN", "startTime >= stopTime per window, ignorato",
                 hostname=hostname,
                 startTime=entry.get("startTime"),
                 stopTime=entry.get("stopTime"))
            return None

    # Valida date per schedule one-time
    if recurring == "none":
        dates = entry.get("dates", [])
        if not dates or not isinstance(dates, list):
            _log("WARN", "Schedule one-time senza date, ignorata", hostname=hostname)
            return None
        valid_dates = []
        for d in dates:
            if not isinstance(d, str) or len(d) != 10:
                continue
            try:
                parts = d.split("-")
                y, mo, day = int(parts[0]), int(parts[1]), int(parts[2])
                if 1 <= mo <= 12 and 1 <= day <= _DAYS_IN_MONTH.get(mo, 31):
                    valid_dates.append(d)
                else:
                    _log("WARN", "Data fuori range, ignorata", date=d, hostname=hostname)
            except (ValueError, IndexError):
                _log("WARN", "Data non parsabile, ignorata", date=d, hostname=hostname)
        if not valid_dates:
            _log("WARN", "Nessuna data valida per entry one-time, ignorata",
                 hostname=hostname)
            return None
        entry = dict(entry)
        entry["dates"] = valid_dates

    return entry


# ============================================
# Merge finestre sovrapposte
# ============================================
def _merge_overlapping_windows(entries):
    """
    Per ogni pattern ricorrente, se ci sono più window che si sovrappongono,
    le fonde prendendo lo start più presto e lo stop più tardi.

    Esempio:
      Entry A: 08:00-20:00 daily
      Entry B: 09:00-22:00 daily
      → Merge: 08:00-22:00 daily

    Le entry di tipo 'shutdown' non vengono toccate.
    Le date one-time vengono raggruppate per pattern (stesso set di date).
    """
    if not entries:
        return entries

    # Separa shutdown da window
    shutdowns = [e for e in entries if e.get("type") != "window"]
    windows = [e for e in entries if e.get("type") == "window"]

    if len(windows) <= 1:
        return entries

    # Raggruppa window per chiave ricorrente
    # Per recurring: la chiave è il valore (daily, weekdays, weekends)
    # Per one-time: la chiave è la tupla di date ordinate
    groups = defaultdict(list)
    for w in windows:
        recurring = w.get("recurring", "none")
        if recurring == "none":
            # Raggruppa per date identiche
            dates_key = tuple(sorted(w.get("dates", [])))
            key = ("dates", dates_key)
        else:
            key = ("recurring", recurring)
        groups[key].append(w)

    merged_windows = []
    for group_key, group_entries in groups.items():
        if len(group_entries) == 1:
            merged_windows.append(group_entries[0])
            continue

        # Merge: prendi start più presto, stop più tardi
        merged = _merge_time_ranges(group_entries)
        merged_windows.extend(merged)

    return shutdowns + merged_windows


def _merge_time_ranges(entries):
    """
    Fonde entry con finestre sovrapposte o adiacenti.
    Usa algoritmo di merge intervalli classico.
    """
    # Converti in intervalli (start_min, stop_min, entry)
    intervals = []
    for e in entries:
        start = _parse_time(e.get("startTime"))
        stop = _parse_time(e.get("stopTime"))
        if start is None or stop is None:
            continue
        s_min = _time_to_minutes(*start)
        e_min = _time_to_minutes(*stop)
        if s_min < e_min:
            intervals.append((s_min, e_min, e))

    if not intervals:
        return entries

    # Ordina per start
    intervals.sort(key=lambda x: x[0])

    # Merge
    merged = []
    curr_start, curr_end, curr_entry = intervals[0]
    for s, e, entry in intervals[1:]:
        if s <= curr_end:
            # Sovrapposto o adiacente: estendi
            if e > curr_end:
                curr_end = e
            _log("DEBUG", "Merge finestre sovrapposte",
                 original_start=curr_entry.get("startTime"),
                 original_stop=curr_entry.get("stopTime"),
                 overlap_start=entry.get("startTime"),
                 overlap_stop=entry.get("stopTime"))
        else:
            # Non sovrapposto: chiudi corrente, apri nuovo
            merged.append(_build_merged_entry(curr_entry, curr_start, curr_end))
            curr_start, curr_end, curr_entry = s, e, entry

    merged.append(_build_merged_entry(curr_entry, curr_start, curr_end))
    return merged


def _build_merged_entry(template_entry, start_min, end_min):
    """Costruisce un entry con gli orari dal merge, preservando il resto dal template."""
    result = dict(template_entry)
    result["startTime"] = f"{start_min // 60:02d}:{start_min % 60:02d}"
    result["stopTime"] = f"{end_min // 60:02d}:{end_min % 60:02d}"
    return result


# ============================================
# Generazione Cronjob
# ============================================
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
    dates = entry.get("dates", [])
    crons = []

    if entry_type == "window":
        start = _parse_time(entry.get("startTime"))
        stop = _parse_time(entry.get("stopTime"))
        if start is None or stop is None:
            return crons
        start_h, start_m = start
        stop_h, stop_m = stop
    else:
        start_h = start_m = stop_h = stop_m = 0

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
                continue

        for ym_key in sorted(by_month.keys()):
            group = by_month[ym_key]
            days_str = ",".join(str(d) for d in sorted(group["days"]))
            month = group["month"]
            if entry_type == "window":
                crons.append(("start", f"{start_m} {start_h} {days_str} {month} *"))
                crons.append(("stop", f"{stop_m} {stop_h} {days_str} {month} *"))
            else:
                crons.append(("stop", f"0 0 {days_str} {month} *"))

    return crons


# ============================================
# Output Builder
# ============================================
def _build_cronjob_output(items):
    """
    Costruisce l'output testuale completo dei cronjob.

    Pipeline per ogni macchina:
      1. Validazione entry (scarta invalidi con log)
      2. Merge finestre sovrapposte (per stesso recurring pattern)
      3. Generazione cron expressions
      4. Deduplicazione finale (stessa expression + action = una riga)

    Struttura output:
      # =========================================
      # Applicazione: <app> | Ambiente: <env>
      # =========================================
      # <hostname>
      <cron_expression> <action> MPI <hostname> <app> <env>
    """
    # Ordina items per app, poi per env, per output deterministico
    sorted_items = sorted(items, key=lambda x: (
        x.get("app", ""),
        x.get("env", ""),
    ))

    lines = []
    lines.append("# FinOps Cronjob Export")
    lines.append(f"# Generato: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    lines.append(f"# Tabella: {SCHEDULES_TABLE}")
    lines.append("")

    total_crons = 0
    total_machines = 0
    total_envs = 0
    warnings = 0

    for item in sorted_items:
        app = item.get("app", item.get("app_env", "???"))
        env = item.get("env", "")
        schedules = item.get("schedules", {})

        if not schedules or not isinstance(schedules, dict):
            continue

        sorted_hostnames = sorted(schedules.keys())
        env_crons = []

        for hostname in sorted_hostnames:
            entries = schedules[hostname]
            if not entries or not isinstance(entries, list):
                continue

            # Step 1: Validazione
            valid_entries = []
            for entry in entries:
                if not isinstance(entry, dict):
                    _log("WARN", "Entry non è un dizionario, ignorata",
                         hostname=hostname, entry_type=type(entry).__name__)
                    warnings += 1
                    continue
                validated = _validate_entry(entry, hostname)
                if validated is None:
                    warnings += 1
                    continue
                valid_entries.append(validated)

            if not valid_entries:
                continue

            # Step 2: Merge finestre sovrapposte
            merged_entries = _merge_overlapping_windows(valid_entries)

            # Step 3: Genera cron
            # Step 4: Deduplicazione
            seen = set()
            machine_crons = []

            for entry in merged_entries:
                crons = _generate_crons_for_entry(entry)
                for action, expression in crons:
                    dedup_key = (expression, action)
                    if dedup_key in seen:
                        _log("DEBUG", "Cronjob duplicato rimosso dopo merge",
                             hostname=hostname, action=action,
                             expression=expression)
                        continue
                    seen.add(dedup_key)
                    machine_crons.append((expression, action, hostname))

            if machine_crons:
                env_crons.extend(machine_crons)
                total_machines += 1

        if not env_crons:
            continue

        total_envs += 1

        # Intestazione ambiente
        lines.append("# =========================================")
        lines.append(f"# Applicazione: {app} | Ambiente: {env}")
        lines.append("# =========================================")

        # Raggruppa per hostname per leggibilità
        current_hostname = None
        for expression, action, hostname in env_crons:
            if hostname != current_hostname:
                lines.append(f"# {hostname}")
                current_hostname = hostname
            safe_app = app.replace(" ", "_")
            safe_env = env.replace(" ", "_")
            lines.append(f"{expression} {action} MPI {hostname} {safe_app} {safe_env}")
            total_crons += 1

        lines.append("")

    # Footer con statistiche
    lines.append("# ---")
    lines.append(f"# Totale: {total_crons} cronjob, "
                 f"{total_machines} macchine, {total_envs} ambienti")
    if warnings > 0:
        lines.append(f"# Attenzione: {warnings} entry ignorate (vedi log per dettagli)")

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
                "# FinOps Cronjob Export\n"
                f"# Generato: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n"
                "# Nessuna schedule configurata.\n"
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
