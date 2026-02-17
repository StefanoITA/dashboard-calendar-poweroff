# FinOps Platform — Architettura DynamoDB Sicura

## Panoramica

L'architettura DynamoDB gestisce la persistenza delle schedule di spegnimento e degli utenti della piattaforma FinOps, garantendo che ogni operazione sia autenticata e autorizzata.

```
Browser (GHE Pages)
    │
    │  Authorization: Bearer <session_token>
    ▼
API Gateway (HTTPS)
    │
    ▼
Lambda finops-api.py
    │
    ├── 1. Verifica token HMAC (stesso SIGNING_SECRET della Lambda OAuth)
    ├── 2. Lookup utente in FinOps_Platform_Users (GSI su github_user)
    ├── 3. Verifica permessi (RW/RO per app)
    │
    ▼
DynamoDB
    ├── FinOpsShutdownScheduler  (schedule)
    └── FinOps_Platform_Users    (utenti)
```

---

## Tabelle DynamoDB

### 1. `FinOpsShutdownScheduler`

Contiene tutte le schedule di spegnimento per applicazione/ambiente.

| Attributo | Tipo | Descrizione |
|-----------|------|-------------|
| `app_env` (PK) | String | Chiave primaria: `NomeApp#Ambiente` (spazi → `_`) |
| `app` | String | Nome originale dell'applicazione |
| `env` | String | Nome originale dell'ambiente |
| `schedules` | Map | `{ "hostname1": [entries], "hostname2": [entries] }` |
| `last_modified_by` | String | `user_id` di chi ha salvato per ultimo |
| `last_modified_at` | String | Timestamp ISO 8601 dell'ultima modifica |

**Formato chiave primaria (PK):**
```
Applicazione Prova Uno 1 + Development → Applicazione_Prova_Uno_1#Development
CRM Aziendale + Pre-Produzione        → CRM_Aziendale#Pre-Produzione
```

**Regola:** spazi diventano `_`, app e env sono separati da `#`.

**Formato entry schedule:**
```json
{
  "hostname1": [
    {
      "id": "unique_id",
      "type": "window",
      "recurring": "weekdays",
      "startTime": "08:00",
      "stopTime": "20:00",
      "dates": [],
      "envGroupId": "group_id",
      "cronjobs": [
        { "action": "startup", "expression": "0 8 * * 1-5" },
        { "action": "shutdown", "expression": "0 20 * * 1-5" }
      ]
    }
  ]
}
```

**Creazione tabella (AWS CLI):**
```bash
aws dynamodb create-table \
  --table-name FinOpsShutdownScheduler \
  --attribute-definitions AttributeName=app_env,AttributeType=S \
  --key-schema AttributeName=app_env,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

### 2. `FinOps_Platform_Users`

Contiene tutti gli utenti e i loro permessi.

| Attributo | Tipo | Descrizione |
|-----------|------|-------------|
| `user_id` (PK) | String | ID utente (es. `mario.rossi`) |
| `name` | String | Nome completo (es. `Mario Rossi`) |
| `github_user` | String | Username GitHub Enterprise (**lowercase**) |
| `role` | String | Ruolo: `Admin`, `Application_owner`, `Read-Only` |
| `applications` | Map/List | Permessi per applicazione |
| `created_at` | String | Data creazione (ISO 8601) |
| `updated_at` | String | Data ultimo aggiornamento |
| `updated_by` | String | Chi ha modificato l'utente |

**GSI richiesto:** `github_user-index` su attributo `github_user` per il lookup durante l'autenticazione.

**Formato permessi `applications`:**
```json
// Admin: accesso totale
{ "applications": ["*"] }

// Application_owner: permessi per app
{
  "applications": {
    "Portale Clienti": "rw",
    "CRM Aziendale": "rw",
    "Gestionale HR": "ro"
  }
}

// Read-Only globale
{ "applications": ["*"] }

// Read-Only specifico
{
  "applications": {
    "Portale Clienti": "ro",
    "CRM Aziendale": "ro"
  }
}
```

**Creazione tabella + GSI (AWS CLI):**
```bash
aws dynamodb create-table \
  --table-name FinOps_Platform_Users \
  --attribute-definitions \
    AttributeName=user_id,AttributeType=S \
    AttributeName=github_user,AttributeType=S \
  --key-schema AttributeName=user_id,KeyType=HASH \
  --global-secondary-indexes '[
    {
      "IndexName": "github_user-index",
      "KeySchema": [{"AttributeName":"github_user","KeyType":"HASH"}],
      "Projection": {"ProjectionType":"ALL"}
    }
  ]' \
  --billing-mode PAY_PER_REQUEST
```

---

## Flusso di Sicurezza

### Autenticazione (ogni richiesta)

```
1. Frontend invia richiesta con header:
   Authorization: Bearer <session_token>

2. Lambda estrae il token e verifica:
   a. Firma HMAC (SHA-256) con SIGNING_SECRET
   b. Scadenza (exp > now)
   c. Tipo = "s" (session, non transit)

3. Dal token estrae github_user (campo "sub")

4. Query DynamoDB: FinOps_Platform_Users GSI github_user-index
   → Trova l'utente corrispondente

5. Se utente non trovato → 403 Forbidden
```

### Autorizzazione (per operazione)

```
LETTURA schedule (/schedules/fetch):
  - Qualsiasi utente autenticato
  - Filtra silenziosamente le app a cui non ha accesso
  - Admin: vede tutto
  - Application_owner: solo le sue app (rw o ro)
  - Read-Only: solo le sue app (ro)

SCRITTURA schedule (/schedules/save):
  - Solo utenti con permesso "rw" su quell'applicazione
  - Admin: può scrivere ovunque
  - Application_owner: solo le app con "rw"
  - Read-Only: SEMPRE bloccato (403)

GESTIONE utenti (/users):
  - Solo Admin può: listare, creare, modificare, eliminare
  - Non puoi eliminare te stesso
  - Qualsiasi utente autenticato può vedere il proprio profilo (/users/me)
```

### Last-Write-Wins

Se Mario e Luigi modificano entrambi `App1#Development`:
1. Mario salva alle 10:00 → PutItem sovrascrive completamente
2. Luigi salva alle 10:01 → PutItem sovrascrive con i dati di Luigi
3. Risultato: i dati di Luigi (l'ultimo a salvare) sono quelli in DynamoDB
4. `last_modified_by` e `last_modified_at` tracciano chi ha scritto per ultimo

Non serve concurrency control perche' le schedule vengono modificate raramente e l'override totale e' il comportamento desiderato.

---

## API Endpoints

### Schedules

#### `POST /schedules/fetch`

Legge le schedule per le chiavi specificate.

**Request:**
```json
{
  "keys": [
    "Portale_Clienti#Development",
    "CRM_Aziendale#Produzione"
  ]
}
```

**Response (200):**
```json
{
  "items": {
    "Portale_Clienti#Development": {
      "server01.example.com": [
        {
          "id": "abc123",
          "type": "window",
          "startTime": "08:00",
          "stopTime": "20:00",
          "recurring": "weekdays"
        }
      ]
    },
    "CRM_Aziendale#Produzione": {}
  }
}
```

#### `POST /schedules/save`

Salva le schedule per un singolo app_env. **Richiede permesso RW.**

**Request:**
```json
{
  "key": "Portale_Clienti#Development",
  "data": {
    "server01.example.com": [
      {
        "id": "abc123",
        "type": "window",
        "startTime": "08:00",
        "stopTime": "20:00",
        "recurring": "weekdays",
        "cronjobs": [
          { "action": "startup", "expression": "0 8 * * 1-5" },
          { "action": "shutdown", "expression": "0 20 * * 1-5" }
        ]
      }
    ]
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "key": "Portale_Clienti#Development",
  "modified_by": "mario.rossi",
  "modified_at": "2026-02-17T10:30:00Z"
}
```

**Response (403) — Permesso negato:**
```json
{
  "error": "Non hai permesso di scrittura per 'Portale Clienti'. Permesso attuale: ro"
}
```

### Users

#### `GET /users/me`

Ritorna il profilo dell'utente corrente.

**Response (200):**
```json
{
  "user": {
    "user_id": "mario.rossi",
    "name": "Mario Rossi",
    "github_user": "mario-rossi",
    "role": "Application_owner",
    "applications": {
      "Portale Clienti": "rw",
      "CRM Aziendale": "rw"
    }
  }
}
```

#### `GET /users` (solo Admin)

Ritorna la lista di tutti gli utenti.

**Response (200):**
```json
{
  "users": [
    { "user_id": "mario.rossi", "name": "Mario Rossi", ... },
    { "user_id": "luigi.verdi", "name": "Luigi Verdi", ... }
  ]
}
```

#### `POST /users` (solo Admin)

Crea o aggiorna un utente.

**Request:**
```json
{
  "user": {
    "user_id": "nuovo.utente",
    "name": "Nuovo Utente",
    "github_user": "nuovo-utente",
    "role": "Application_owner",
    "applications": {
      "Portale Clienti": "rw",
      "ERP Finance": "ro"
    }
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "user_id": "nuovo.utente",
  "action": "creato"
}
```

#### `DELETE /users/{user_id}` (solo Admin)

Elimina un utente. Non puoi eliminare te stesso.

**Response (200):**
```json
{
  "success": true,
  "deleted": "vecchio.utente"
}
```

---

## Deployment

### Prerequisiti
- Account AWS con DynamoDB e Lambda
- API Gateway configurato
- Stessa `SIGNING_SECRET` della Lambda OAuth

### 1. Creare le tabelle DynamoDB

Usare i comandi AWS CLI nella sezione "Tabelle DynamoDB" sopra.

### 2. Inserire il primo utente Admin

```bash
aws dynamodb put-item \
  --table-name FinOps_Platform_Users \
  --item '{
    "user_id": {"S": "admin.user"},
    "name": {"S": "Admin User"},
    "github_user": {"S": "admin-github-username"},
    "role": {"S": "Admin"},
    "applications": {"L": [{"S": "*"}]},
    "created_at": {"S": "2026-02-17T00:00:00Z"},
    "updated_at": {"S": "2026-02-17T00:00:00Z"},
    "updated_by": {"S": "system"}
  }'
```

### 3. Deploy Lambda finops-api

```bash
# Pacchetto (boto3 e' gia' nel runtime Lambda Python)
zip finops-api.zip lambda/finops-api.py

# Variabili d'ambiente richieste:
# SIGNING_SECRET     = <stessa chiave della lambda OAuth>
# SCHEDULES_TABLE    = FinOpsShutdownScheduler
# USERS_TABLE        = FinOps_Platform_Users
# CORS_ORIGIN        = https://pages.github.AZIENDA.com
# USERS_GSI_NAME     = github_user-index
```

**Permessi IAM Lambda (policy):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
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
        "arn:aws:dynamodb:*:*:table/FinOpsShutdownScheduler",
        "arn:aws:dynamodb:*:*:table/FinOps_Platform_Users",
        "arn:aws:dynamodb:*:*:table/FinOps_Platform_Users/index/github_user-index"
      ]
    }
  ]
}
```

### 4. Configurare API Gateway

Creare un HTTP API (v2) con route:
```
POST   /schedules/fetch   → Lambda finops-api
POST   /schedules/save    → Lambda finops-api
GET    /users             → Lambda finops-api
GET    /users/me          → Lambda finops-api
POST   /users             → Lambda finops-api
DELETE /users/{id}        → Lambda finops-api
OPTIONS /{proxy+}         → Lambda finops-api (CORS)
```

### 5. Attivare nel frontend

In `js/dynamo.js`:
```javascript
const CONFIG = {
    enabled: true,
    endpoint: 'https://YOUR_API_GATEWAY.execute-api.eu-west-1.amazonaws.com/prod',
    ...
};
```

In `js/data.js`:
```javascript
const USERS_CONFIG = {
    source: 'dynamodb',  // Cambiare da 'json' a 'dynamodb'
    ...
};
```

---

## Migrazione da JSON a DynamoDB

### Passo 1: Deploy infrastruttura
Creare tabelle, Lambda, API Gateway come sopra.

### Passo 2: Inserire utenti da users.json
Script di migrazione (eseguire una volta):
```python
import json
import boto3
import time

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('FinOps_Platform_Users')

with open('data/users.json') as f:
    data = json.load(f)

now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

for user in data['users']:
    table.put_item(Item={
        'user_id': user['id'],
        'name': user['name'],
        'github_user': user.get('github_user', '').lower(),
        'role': user['role'],
        'applications': user.get('applications', ['*']),
        'created_at': now,
        'updated_at': now,
        'updated_by': 'migration_script'
    })
    print(f"Migrato: {user['id']}")
```

### Passo 3: Test
1. Attivare `DynamoService.CONFIG.enabled = true`
2. Mantenere `USERS_CONFIG.source = 'json'` come fallback
3. Verificare che fetch e save funzionino
4. Quando tutto OK, switchare a `USERS_CONFIG.source = 'dynamodb'`

### Passo 4: Cleanup
- Rimuovere `data/users.json` dal repository (contiene dati sensibili!)
- Aggiornare `.gitignore` per escludere file utenti

---

## Accesso programmatico (per Jenkins)

La pipeline Jenkins puo' leggere le schedule direttamente da DynamoDB senza passare per l'API (accesso server-side con IAM role):

```python
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('FinOpsShutdownScheduler')

# Leggi schedule per un'app/env
response = table.get_item(Key={'app_env': 'Portale_Clienti#Development'})
item = response.get('Item', {})
schedules = item.get('schedules', {})

for hostname, entries in schedules.items():
    for entry in entries:
        for cron in entry.get('cronjobs', []):
            print(f"{hostname}: {cron['action']} → {cron['expression']}")
```

La chiave e' sempre nel formato `NomeApp#Ambiente` con spazi sostituiti da `_`. Per ricostruire i nomi originali: split per `#`, replace `_` con spazio.
