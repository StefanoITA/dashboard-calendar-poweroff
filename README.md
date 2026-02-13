# Shutdown Scheduler

Dashboard web per pianificare e coordinare i periodi di **spegnimento e accensione** degli ambienti applicativi aziendali, gestendo le dipendenze tra applicazioni e prevenendo conflitti tra Application Owner.

## Panoramica

Shutdown Scheduler e un'applicazione frontend statica (HTML/CSS/JS) che permette di:

- **Pianificare finestre orarie** di accensione/spegnimento per ogni server
- **Gestire shutdown completi** per periodi specifici
- **Coordinare tra Application Owner** tramite un calendario generale condiviso
- **Generare cronjob** automaticamente per ogni server in base alla pianificazione
- **Persistere le configurazioni** su DynamoDB tramite API Gateway (opzionale)

## Struttura del Progetto

```
shutdown-scheduler/
├── index.html              # Pagina principale
├── css/
│   └── style.css           # Stili completi (light/dark theme)
├── js/
│   ├── app.js              # Logica principale dell'applicazione
│   ├── data.js             # Layer dati: parsing CSV, stato, ruoli, note
│   ├── dynamo.js           # Servizio DynamoDB con retry
│   └── audit.js            # Registro attivita (audit log)
├── data/
│   ├── machines.csv        # Inventario server
│   ├── users.json          # Configurazione utenti e permessi
│   └── messages.json       # Messaggi di sistema
└── README.md
```

## Configurazione

### 1. Inventario Server (`data/machines.csv`)

File CSV con l'elenco di tutti i server gestiti. Campi:

| Campo | Descrizione | Esempio |
|-------|-------------|---------|
| `application` | Nome applicazione | `Portale Clienti` |
| `environment` | Ambiente | `Development`, `Integration`, `Produzione`, ecc. |
| `machine_name` | Nome descrittivo | `Web Server 1` |
| `hostname` | Hostname tecnico | `web-dev-01.internal` |
| `instance_type` | Tipo istanza cloud | `t3.medium`, `m6i.large` |
| `server_type` | Tipologia | `Web Server`, `Application Server`, `Database Server` |
| `description` | Descrizione ruolo | `Frontend Apache - ambiente sviluppo` |

### 2. Utenti e Permessi (`data/users.json`)

Ogni utente ha un campo `github_user` che corrisponde al proprio username GitHub Enterprise, usato per l'autenticazione SSO automatica (vedi sezione dedicata).

Il sistema supporta tre livelli di accesso:

#### Admin
Accesso completo a tutte le applicazioni in lettura e scrittura.

```json
{
  "id": "mario.rossi",
  "name": "Mario Rossi",
  "github_user": "mario-rossi",
  "role": "Admin",
  "applications": ["*"]
}
```

#### Application Owner (per-app RW/RO)
Accesso granulare per applicazione con permessi `rw` (lettura/scrittura) o `ro` (sola lettura).

```json
{
  "id": "luca.bianchi",
  "name": "Luca Bianchi",
  "role": "Application_owner",
  "applications": {
    "Portale Clienti": "rw",
    "CRM Aziendale": "rw",
    "Gestionale HR": "ro"
  }
}
```

#### Read-Only
Accesso in sola lettura. Puo essere globale (`["*"]`) o specifico per applicazione.

```json
{
  "id": "viewer",
  "name": "Visualizzatore Globale",
  "role": "Read-Only",
  "applications": ["*"]
}
```

**Permesso speciale `lista_server`**: Permette l'accesso alla vista "Elenco VM" per utenti Read-Only con applicazioni specifiche.

```json
{
  "applications": {
    "Portale Clienti": "ro",
    "lista_server": "ro"
  }
}
```

### 3. Messaggi di Sistema (`data/messages.json`)

Messaggi mostrati nella dashboard principale. Supportano targeting per utente.

```json
{
  "id": "msg1",
  "type": "warning",
  "title": "Manutenzione programmata",
  "text": "Descrizione del messaggio...",
  "target": "*",
  "date": "2026-02-13",
  "expires": "2026-02-16"
}
```

Tipi supportati: `warning`, `info`, `success`. Il campo `target` accetta `"*"` per tutti gli utenti oppure un array di ID utente specifici.

## Funzionalita Principali

### Dashboard
- Saluto personalizzato con nome utente
- Messaggi di sistema filtrati per utente e data di scadenza
- Elenco applicazioni con indicazione permessi (RW/RO)
- Attivita recenti

### Gestione Pianificazioni
- **Finestra Oraria**: Definisci orario di accensione e spegnimento
- **Shutdown Completo**: Il server resta spento per i giorni selezionati
- **Ricorrenza**: Giorni specifici, ogni giorno, Lun-Ven, Sab-Dom
- **Pianifica Ambiente**: Applica la stessa pianificazione a tutti i server di un ambiente
- **Gruppi Ambiente**: I server pianificati insieme condividono un `envGroupId`, permettendo la modifica/rimozione in blocco

### Calendario Generale
- Vista mensile con tutte le pianificazioni di tutte le applicazioni
- Filtri multi-selezione per applicazioni e ambienti (chip)
- Colori distinti per applicazione e ambiente
- Tooltip con dettagli orari per ogni giorno

### Elenco VM
- Tabella completa di tutti i server con filtri multi-selezione
- Ordinamento per colonna (click sull'intestazione)
- Copia hostname/nome server con un click
- Copia tabella formattata negli appunti
- Badge colorati per ambiente e tipo server

### Note Private
- Note per singolo server salvate localmente nel browser (`localStorage`)
- Non sincronizzate con DynamoDB per privacy

### Temi
- Supporto Light e Dark mode
- Toggle nel topbar, preferenza salvata in `localStorage`

### Sicurezza e UX
- Rilevamento modifiche non salvate con popup di promemoria (dopo 10 secondi)
- Conferma prima della chiusura pagina (`beforeunload`)
- Dialogo di conferma dettagliato prima del salvataggio con diff delle modifiche
- Ctrl+S come scorciatoia per salvare
- Registro attivita (audit log) per tracciare le azioni

## Configurazione DynamoDB

### Architettura

```
Browser  -->  API Gateway  -->  Lambda  -->  DynamoDB
```

Il frontend comunica con DynamoDB attraverso un API Gateway REST che espone due endpoint Lambda.

### Tabella DynamoDB

Crea una tabella con la seguente configurazione:

| Parametro | Valore |
|-----------|--------|
| **Nome tabella** | `ShutdownScheduler` (o a scelta) |
| **Partition Key** | `pk` (String) — formato: `App_Env` es. `Portale Clienti_Development` |
| **Billing Mode** | On-Demand (consigliato) o Provisioned |

#### Struttura Item

```json
{
  "pk": "Portale Clienti_Development",
  "data": {
    "web-dev-01.internal": [
      {
        "id": "m1abc2def",
        "type": "window",
        "startTime": "08:00",
        "stopTime": "20:00",
        "recurring": "weekdays",
        "dates": [],
        "cronjobs": {
          "start": "0 8 * * 1-5",
          "stop": "0 20 * * 1-5"
        }
      }
    ],
    "app-dev-01.internal": []
  },
  "user": "mario.rossi",
  "timestamp": "2026-02-13T10:30:00.000Z"
}
```

Ogni item rappresenta tutte le pianificazioni per una combinazione applicazione/ambiente. La chiave `data` mappa ogni hostname ai rispettivi schedule entry.

### API Gateway — Endpoint

Configura un API Gateway REST con due route POST:

#### `POST /schedules/fetch`

Recupera le pianificazioni per piu combinazioni app/ambiente.

**Request:**
```json
{
  "keys": ["Portale Clienti_Development", "CRM Aziendale_Integration"]
}
```

**Response:**
```json
{
  "items": {
    "Portale Clienti_Development": {
      "web-dev-01.internal": [...],
      "app-dev-01.internal": [...]
    },
    "CRM Aziendale_Integration": {
      "crm-int-01.internal": [...]
    }
  }
}
```

#### `POST /schedules/save`

Salva la pianificazione per una combinazione app/ambiente.

**Request:**
```json
{
  "key": "Portale Clienti_Development",
  "data": {
    "web-dev-01.internal": [
      {
        "id": "m1abc2def",
        "type": "window",
        "startTime": "08:00",
        "stopTime": "20:00",
        "recurring": "weekdays",
        "dates": [],
        "cronjobs": { "start": "0 8 * * 1-5", "stop": "0 20 * * 1-5" }
      }
    ]
  },
  "user": "mario.rossi",
  "timestamp": "2026-02-13T10:30:00.000Z"
}
```

**Response:**
```json
{
  "success": true
}
```

### Lambda di Esempio (Node.js)

#### Fetch Lambda

```javascript
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME || 'ShutdownScheduler';

exports.handler = async (event) => {
    const { keys } = JSON.parse(event.body);
    const items = {};

    // BatchGetItem supporta max 100 chiavi per volta
    const chunks = [];
    for (let i = 0; i < keys.length; i += 100) {
        chunks.push(keys.slice(i, i + 100));
    }

    for (const chunk of chunks) {
        const result = await client.send(new BatchGetCommand({
            RequestItems: {
                [TABLE]: { Keys: chunk.map(pk => ({ pk })) }
            }
        }));
        (result.Responses[TABLE] || []).forEach(item => {
            items[item.pk] = item.data || {};
        });
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ items })
    };
};
```

#### Save Lambda

```javascript
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME || 'ShutdownScheduler';

exports.handler = async (event) => {
    const { key, data, user, timestamp } = JSON.parse(event.body);

    await client.send(new PutCommand({
        TableName: TABLE,
        Item: { pk: key, data, user, timestamp }
    }));

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: true })
    };
};
```

### Abilitare DynamoDB nel Frontend

In `js/dynamo.js`, modifica la configurazione:

```javascript
const CONFIG = {
    enabled: true,  // Cambia da false a true
    endpoint: 'https://YOUR_API_GATEWAY.execute-api.eu-west-1.amazonaws.com/prod',
    retryAttempts: 4,
    retryBaseDelay: 2000
};
```

### Retry e Resilienza

Il servizio DynamoDB implementa retry automatico con **backoff esponenziale**:

- Tentativo 1: immediato
- Tentativo 2: dopo 2 secondi
- Tentativo 3: dopo 4 secondi
- Tentativo 4: dopo 8 secondi
- Tentativo 5: dopo 16 secondi

Ogni operazione di salvataggio e caricamento e protetta da questo meccanismo.

### Permessi IAM (Lambda)

Le Lambda necessitano di una policy IAM con i seguenti permessi sulla tabella:

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:BatchGetItem",
    "dynamodb:PutItem"
  ],
  "Resource": "arn:aws:dynamodb:eu-west-1:ACCOUNT_ID:table/ShutdownScheduler"
}
```

### CORS

Configura CORS sull'API Gateway per permettere le chiamate dal browser:

- **Allowed Origins**: Il dominio dove e ospitata l'applicazione (o `*` per sviluppo)
- **Allowed Methods**: `POST, OPTIONS`
- **Allowed Headers**: `Content-Type`

## Autenticazione SSO (GitHub Enterprise)

Quando l'applicazione e ospitata su **GitHub Enterprise Pages** (es. `pages.github.azienda.com`), l'autenticazione avviene automaticamente tramite il cookie SSO.

### Come Funziona

1. L'utente accede a GitHub Enterprise e si autentica tramite SSO (PingID, Okta, Azure AD, ecc.)
2. GitHub Enterprise imposta il cookie `dotcom_user` sul dominio `.github.azienda.com`
3. All'apertura dell'app, il JavaScript legge il cookie `dotcom_user` dal browser
4. Il valore del cookie (es. `stefano-serafini-consultant`) viene confrontato con il campo `github_user` in `users.json`
5. Se viene trovata una corrispondenza, l'utente e autenticato automaticamente con i permessi configurati
6. Se non viene trovata, appare la schermata "Accesso non autorizzato"

### Requisiti

- Il cookie `dotcom_user` deve essere accessibile dal sottodominio Pages (dominio `.github.azienda.com`)
- Il cookie **non deve** avere il flag `HttpOnly` (standard di GitHub Enterprise)
- Ogni utente deve avere il campo `github_user` nel file `users.json`

### Configurare un Nuovo Utente

Per aggiungere un nuovo utente, inserire un oggetto nel file `data/users.json`:

```json
{
  "id": "nome.cognome",
  "name": "Nome Cognome",
  "github_user": "username-github-enterprise",
  "role": "Application_owner",
  "applications": {
    "Portale Clienti": "rw",
    "CRM Aziendale": "ro"
  }
}
```

Il campo `github_user` deve corrispondere esattamente allo username GitHub Enterprise dell'utente (case-insensitive).

### Sviluppo Locale

In ambiente locale (senza cookie `dotcom_user`), l'applicazione mostra un selettore dropdown che permette di scegliere manualmente l'utente. Questo facilita il testing dei diversi ruoli senza necessita di autenticazione SSO.

## Deployment

L'applicazione e completamente statica e puo essere servita da qualsiasi web server o servizio di hosting:

- **S3 + CloudFront**: Hosting statico su AWS
- **GitHub Pages**: Per ambienti di test/demo
- **Nginx/Apache**: Server web tradizionale
- **Qualsiasi CDN**: Nessuna build necessaria

Non sono richiesti build tool, bundler o framework. Basta servire i file cosi come sono.

## Tecnologie

- **HTML5 / CSS3**: Layout responsive con CSS custom properties
- **JavaScript ES6+**: Moduli IIFE, async/await, Fetch API
- **Inter**: Google Font per la tipografia
- **DynamoDB**: Persistenza dati (opzionale)
- **API Gateway + Lambda**: Backend serverless (opzionale)
