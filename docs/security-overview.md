# FinOps Shutdown Scheduler - Security Architecture Overview

**Data:** 25 Febbraio 2026
**Destinatari:** Team Sicurezza
**Classificazione:** Interno / Confidenziale

---
https://excalidraw.com/#room=b34f83e46b566f38108c,88pQMXzb_N1gXF036uBZqg

## 1. Panoramica del Sistema

Il FinOps Shutdown Scheduler e' una piattaforma web per la gestione delle schedulazioni di accensione/spegnimento delle VM aziendali. L'obiettivo e' ridurre i costi cloud spegnendo automaticamente le macchine fuori orario lavorativo.

**Stack tecnologico:**
- **Frontend:** Single Page Application (vanilla JavaScript), hostato su GitHub Enterprise Pages
- **Backend:** AWS Lambda (Python 3.11) dietro API Gateway
- **Database:** Amazon DynamoDB (2 tabelle)
- **Autenticazione:** OAuth 2.0 via GitHub Enterprise
- **Esecuzione:** Cronjob export verso sistema di orchestrazione (Jenkins)

---

## 2. Architettura di Rete

```
                    +--------------------------+
                    |  GitHub Enterprise Pages |
                    |  (Frontend SPA statico)  |
                    +------------+-------------+
                                 |
                          HTTPS  |
                                 v
                    +------------+-------------+
                    |     API Gateway (AWS)    |
                    |  REST API + CORS policy  |
                    +--+-------+----------+----+
                       |       |          |
                       v       v          v
                 +-----+--+ +-+------+ +-+-------------+
                 | OAuth  | | FinOps | | Cronjob       |
                 | Lambda | | API    | | Exporter      |
                 |        | | Lambda | | Lambda        |
                 +---+----+ +---+----+ +-------+-------+
                     |          |              |
                     v          v              v
              +------+----+ +--+--------------+----+
              | GitHub    | |     DynamoDB         |
              | Enterprise| | +------------------+ |
              | OAuth API | | | Schedules Table  | |
              +-----------+ | +------------------+ |
                            | | Users Table      | |
                            | | + GSI            | |
                            | +------------------+ |
                            +----------------------+
```

---

## 3. Flusso di Autenticazione (OAuth 2.0)

### 3.1 Login Iniziale

```
Utente                  Frontend (SPA)         OAuth Lambda           GitHub Enterprise
  |                          |                      |                       |
  |-- Clicca "Login" ------>|                      |                       |
  |                          |-- Redirect --------->|                       |
  |                          |   /authorize?        |                       |
  |                          |   client_id=X        |                       |
  |                          |   redirect_uri=Y     |                       |
  |                          |   scope=read:user    |                       |
  |                          |                      |                       |
  |<----- Pagina di consenso GitHub ----------------|                       |
  |                          |                      |                       |
  |-- Approva consenso ---->|                      |                       |
  |                          |                      |<-- ?code=AUTH_CODE ---|
  |                          |                      |                       |
  |                          |                      |-- POST /access_token->|
  |                          |                      |   (code + secret)     |
  |                          |                      |                       |
  |                          |                      |<-- access_token ------|
  |                          |                      |                       |
  |                          |                      |-- GET /user --------->|
  |                          |                      |   (Bearer token)      |
  |                          |                      |                       |
  |                          |                      |<-- user profile ------|
  |                          |                      |                       |
  |                          |                      |-- Crea Transit Token  |
  |                          |                      |   (HMAC-SHA256, 5min) |
  |                          |                      |                       |
  |<-- Redirect con ?ghtoken=TRANSIT_TOKEN ---------|                       |
  |                          |                      |                       |
  |                          |-- POST transit ----->|                       |
  |                          |   token              |                       |
  |                          |                      |-- Verifica firma      |
  |                          |                      |-- Verifica scadenza   |
  |                          |                      |-- Verifica tipo="t"   |
  |                          |                      |                       |
  |                          |<-- Session Token ----|                       |
  |                          |   (HMAC, 30 giorni)  |                       |
  |                          |                      |                       |
  |                          |-- Salva in           |                       |
  |                          |   localStorage       |                       |
  |                          |                      |                       |
  |<-- Dashboard caricata --|                      |                       |
```

### 3.2 Dettaglio Token

| Proprieta'          | Transit Token             | Session Token              |
|---------------------|---------------------------|----------------------------|
| **Durata**          | 5 minuti                  | 30 giorni                  |
| **Uso**             | Singolo scambio           | Tutte le chiamate API      |
| **Tipo nel payload**| `typ: "t"`                | `typ: "s"`                 |
| **Formato**         | `base64(payload).hmac`    | `base64(payload).hmac`     |
| **Algoritmo firma** | HMAC-SHA256               | HMAC-SHA256                |
| **Storage client**  | URL parameter (transitorio)| localStorage               |

**Struttura payload:**
```json
{
  "sub": "github-username",
  "typ": "t|s",
  "exp": 1740000000
}
```

### 3.3 Verifica Token (ogni chiamata API)

1. Estrazione token dall'header `Authorization: Bearer <token>`
2. Decodifica Base64 del payload
3. Ricalcolo firma HMAC-SHA256 con `SIGNING_SECRET`
4. Confronto firma calcolata vs firma ricevuta
5. Verifica `exp > now()` (non scaduto)
6. Verifica `typ == "s"` (solo session, non transit)
7. Lookup utente su DynamoDB tramite GSI `github_user-index`
8. Se tutto valido: procedi con la request

---

## 4. Gestione API e Autorizzazioni

### 4.1 Endpoint

| Metodo | Path               | Autenticazione  | Autorizzazione          |
|--------|--------------------|-----------------|-------------------------|
| POST   | `/schedules/fetch` | Bearer Token    | Filtro per app dell'utente |
| POST   | `/schedules/save`  | Bearer Token    | Richiede permesso `rw` su app |
| GET    | `/users/me`        | Bearer Token    | Qualsiasi utente autenticato |
| GET    | `/users`           | Bearer Token    | Solo ruolo `Admin`       |
| POST   | `/users`           | Bearer Token    | Solo ruolo `Admin`       |
| DELETE | `/users/{id}`      | Bearer Token    | Solo ruolo `Admin`       |
| GET    | `/cronjob-export`  | Token statico   | Token dedicato (`EXPORTER_TOKEN`) |

### 4.2 Modello di Permessi (RBAC)

```
                    +-------------------+
                    |      Admin        |
                    | - Accesso totale  |
                    | - Gestione utenti |
                    | - RW su tutto     |
                    +-------------------+
                             |
              +--------------+--------------+
              |                             |
   +----------+----------+    +-------------+---------+
   | Application Owner   |    |    Read-Only          |
   | - RW/RO per app     |    | - Solo lettura        |
   | - Assegnato per app |    | - Nessuna modifica    |
   +---------------------+    +-----------------------+
```

**Regole specifiche:**
- **Admin:** `applications: ["*"]` = accesso completo a tutte le applicazioni
- **Application Owner:** `applications: {"App1": "rw", "App2": "ro"}` = permessi per app
- **Read-Only:** Sola lettura su tutte le app assegnate
- **Protezione Produzione:** Utenti non-Admin hanno automaticamente `ro` su ambienti "Produzione"/"Production"

### 4.3 Flusso Autorizzazione per Salvataggio

```
Request POST /schedules/save
  |
  +-- Token valido? --NO--> 401 Unauthorized
  |
  YES
  |
  +-- Utente trovato in DB? --NO--> 403 Forbidden
  |
  YES
  |
  +-- Utente e' Admin? --SI--> PERMESSO (RW su tutto)
  |
  NO
  |
  +-- Utente ha permesso RW su questa app? --SI--> PERMESSO
  |
  NO
  |
  +-- 403 Forbidden ("Permesso insufficiente")
```

---

## 5. Storage (DynamoDB)

### 5.1 Tabella `FinOpsShutdownScheduler`

| Campo              | Tipo    | Descrizione                              |
|--------------------|---------|------------------------------------------|
| `app_env` (PK)    | String  | Chiave partizione: `App_Name#Environment`|
| `app`              | String  | Nome applicazione originale              |
| `env`              | String  | Nome ambiente originale                  |
| `schedules`        | Map     | `{hostname: [schedule_entries]}`         |
| `last_modified_by` | String  | ID utente ultima modifica                |
| `last_modified_at` | String  | Timestamp ISO 8601                       |

**Nessun indice secondario.** Accesso solo tramite chiave primaria o scan completo.

### 5.2 Tabella `FinOps_Platform_Users`

| Campo              | Tipo    | Descrizione                              |
|--------------------|---------|------------------------------------------|
| `user_id` (PK)    | String  | Chiave partizione (es. `mario.rossi`)    |
| `name`             | String  | Nome completo                            |
| `github_user`      | String  | Username GitHub Enterprise (lowercase)   |
| `role`             | String  | `Admin` / `Application_owner` / `Read-Only` |
| `applications`     | Map/List| Mappa permessi per app                   |
| `created_at`       | String  | Timestamp creazione                      |
| `updated_at`       | String  | Timestamp ultimo aggiornamento           |

**GSI:** `github_user-index` su campo `github_user` (per lookup post-autenticazione)

### 5.3 Policy IAM Lambda

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:DeleteItem",
    "dynamodb:Scan",
    "dynamodb:Query"
  ],
  "Resource": [
    "arn:aws:dynamodb:eu-west-1:ACCOUNT:table/FinOpsShutdownScheduler",
    "arn:aws:dynamodb:eu-west-1:ACCOUNT:table/FinOps_Platform_Users",
    "arn:aws:dynamodb:eu-west-1:ACCOUNT:table/FinOps_Platform_Users/index/github_user-index"
  ]
}
```

---

## 6. Gestione Segreti

| Segreto               | Dove e' usato              | Storage consigliato         |
|------------------------|----------------------------|-----------------------------|
| `SIGNING_SECRET`       | OAuth Lambda + API Lambda  | Lambda Env Vars / Secrets Manager |
| `OAUTH_CLIENT_SECRET`  | OAuth Lambda               | Lambda Env Vars / Secrets Manager |
| `OAUTH_CLIENT_ID`      | OAuth Lambda + Frontend    | Lambda Env Vars (non segreto)     |
| `EXPORTER_TOKEN`       | Cronjob Exporter Lambda    | Lambda Env Vars / Secrets Manager |

**Nota:** Nessun segreto e' hardcoded nel codice sorgente. Tutti i valori sensibili sono passati tramite variabili d'ambiente Lambda.

---

## 7. Sicurezza - Riepilogo Controlli

| Area                    | Implementazione                                          |
|-------------------------|----------------------------------------------------------|
| **Autenticazione**      | OAuth 2.0 + HMAC-SHA256 token firmati                   |
| **Autorizzazione**      | RBAC a 3 livelli, enforced lato server                   |
| **Trasporto**           | HTTPS obbligatorio (API Gateway)                         |
| **CORS**                | Origin specifico configurato (`CORS_ORIGIN`)             |
| **Input validation**    | Sanitizzazione XSS, validazione schedule, key sanitization |
| **Logging**             | Structured JSON, dati sensibili redatti                  |
| **Token scadenza**      | Transit 5min, Session 30gg, verifica ad ogni richiesta   |
| **Protezione Prod**     | Non-Admin hanno RO forzato su Production                 |
| **Segreti**             | Env vars Lambda, no hardcoded                            |
| **Permessi DB**         | IAM role con least-privilege su tabelle specifiche        |

---

## 8. Diagramma Flusso Completo (End-to-End)

```
[Utente Browser]
      |
      | 1. Accede a https://pages.github.AZIENDA.com/org/finops-scheduler/
      |
      v
[GitHub Enterprise Pages] ---- Serve HTML/JS/CSS statici
      |
      | 2. Click "Accedi con GitHub"
      |
      v
[GitHub Enterprise OAuth] ---- Consenso utente
      |
      | 3. Redirect con ?code=XXX
      |
      v
[OAuth Lambda] ---- Scambia code per access_token
      |              Recupera profilo utente
      |              Firma transit token (HMAC)
      |
      | 4. Redirect con ?ghtoken=TRANSIT_TOKEN
      |
      v
[Frontend SPA] ---- POST transit token alla Lambda
      |              Riceve session token (30gg)
      |              Salva in localStorage
      |
      | 5. Ogni chiamata API: Authorization: Bearer <session_token>
      |
      v
[API Gateway] ---- CORS check, route verso Lambda corretta
      |
      v
[FinOps API Lambda]
      |-- Verifica firma HMAC token
      |-- Verifica scadenza
      |-- Lookup utente su DynamoDB (GSI github_user)
      |-- Verifica permessi (RBAC)
      |
      v
[DynamoDB]
      |-- FinOpsShutdownScheduler: lettura/scrittura schedule
      |-- FinOps_Platform_Users: lookup utente e permessi
      |
      v
[Cronjob Exporter Lambda] ---- Chiamata periodica con token statico
      |                          Scan tabella schedule
      |                          Genera output crontab
      |
      v
[Sistema di Orchestrazione (Jenkins)] ---- Esegue start/stop VM
```

---

## Contatti

Per domande tecniche sulla piattaforma, contattare il team FinOps.
