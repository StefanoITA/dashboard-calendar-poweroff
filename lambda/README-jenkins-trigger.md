# Jenkins Orchestrator Trigger Lambda

Lambda function per triggerare job Jenkins dell'orchestratore con monitoring e polling automatico.

## Features

- ✅ Trigger job Jenkins tramite API
- ✅ Retry automatico con backoff esponenziale (3 tentativi)
- ✅ Supporto parametri job
- ✅ Polling stato job (queued → running → completed)
- ✅ Link diretti per monitoring console Jenkins
- ✅ CORS configurabile
- ✅ Logging strutturato per CloudWatch

## Variabili d'Ambiente

| Variabile | Descrizione | Obbligatorio | Default |
|-----------|-------------|--------------|---------|
| `JENKINS_URL` | URL base Jenkins (es. `https://jenkins.company.com`) | ✅ | - |
| `JENKINS_USER` | Username per autenticazione Jenkins | ✅ | - |
| `JENKINS_API_TOKEN` | API token Jenkins | ✅ | - |
| `JENKINS_JOB_NAME` | Nome del job (es. `orchestrator/poweroff`) | ✅ | - |
| `POLLING_TIMEOUT` | Timeout polling in secondi | ❌ | `60` |
| `CORS_ORIGIN` | Origin per CORS | ❌ | `*` |
| `SSL_VERIFY` | Verifica certificati SSL (`true`/`false`) | ❌ | `true` |

## Endpoints

### POST /trigger

Triggera il job Jenkins.

**Request Body:**
```json
{
  "parameters": {
    "ENVIRONMENT": "production",
    "ACTION": "shutdown",
    "DRY_RUN": "false"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Job triggered successfully",
  "queue_id": 12345,
  "queue_url": "https://jenkins.company.com/queue/item/12345/",
  "job_url": "https://jenkins.company.com/job/orchestrator/",
  "monitoring_url": "https://jenkins.company.com/job/orchestrator/lastBuild/console",
  "status": "queued"
}
```

**Se il job è già partito dopo 1 secondo:**
```json
{
  "success": true,
  "message": "Job triggered successfully",
  "queue_id": 12345,
  "status": "running",
  "build_number": 789,
  "build_url": "https://jenkins.company.com/job/orchestrator/789/",
  "console_url": "https://jenkins.company.com/job/orchestrator/789/console"
}
```

### GET /status?queue_id=12345

Verifica lo stato del job tramite queue ID.

**Response (200 OK):**

**Job in coda:**
```json
{
  "success": true,
  "status": "queued",
  "why": "Waiting for next available executor",
  "stuck": false
}
```

**Job in esecuzione:**
```json
{
  "success": true,
  "status": "running",
  "build_number": 789,
  "build_url": "https://jenkins.company.com/job/orchestrator/789/",
  "console_url": "https://jenkins.company.com/job/orchestrator/789/console"
}
```

### GET /status?build_number=789

Verifica lo stato di una build specifica.

**Response (200 OK):**

**Build completata con successo:**
```json
{
  "success": true,
  "status": "success",
  "build_number": 789,
  "build_url": "https://jenkins.company.com/job/orchestrator/789/",
  "console_url": "https://jenkins.company.com/job/orchestrator/789/console",
  "duration": 125000,
  "result": "SUCCESS",
  "timestamp": 1676543210000
}
```

**Build fallita:**
```json
{
  "success": true,
  "status": "failure",
  "build_number": 789,
  "result": "FAILURE",
  ...
}
```

### GET /status

Verifica lo stato dell'ultima build (senza parametri).

## Deploy su AWS Lambda

### 1. Crea la Lambda Function

```bash
cd lambda
zip jenkins-orchestrator-trigger.zip jenkins-orchestrator-trigger.py

aws lambda create-function \
  --function-name JenkinsOrchestratorTrigger \
  --runtime python3.11 \
  --handler jenkins-orchestrator-trigger.lambda_handler \
  --zip-file fileb://jenkins-orchestrator-trigger.zip \
  --role arn:aws:iam::ACCOUNT_ID:role/lambda-execution-role \
  --timeout 60 \
  --memory-size 256 \
  --environment Variables="{
    JENKINS_URL=https://jenkins.company.com,
    JENKINS_USER=api-user,
    JENKINS_API_TOKEN=11234567890abcdef,
    JENKINS_JOB_NAME=orchestrator/poweroff,
    CORS_ORIGIN=https://pages.github.company.com
  }"
```

### 2. Crea Lambda Function URL (opzionale)

```bash
aws lambda create-function-url-config \
  --function-name JenkinsOrchestratorTrigger \
  --auth-type NONE \
  --cors AllowOrigins="https://pages.github.company.com",AllowMethods="GET,POST,OPTIONS"
```

### 3. Oppure usa API Gateway

Crea un API Gateway HTTP API e collega la lambda agli endpoints:
- `POST /trigger` → lambda
- `GET /status` → lambda

## Generare Jenkins API Token

1. Login a Jenkins
2. Vai a **User Icon (in alto a destra)** → **Configure**
3. Sezione **API Token** → Click **Add new Token**
4. Copia il token generato e usalo come `JENKINS_API_TOKEN`

## Esempio di utilizzo da JavaScript

```javascript
// Trigger job
async function triggerOrchestrator(params) {
  const response = await fetch('https://lambda-url/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parameters: params })
  });

  const data = await response.json();
  console.log('Job triggered:', data);

  // Se abbiamo un queue_id, fai polling per monitorare
  if (data.queue_id) {
    return pollJobStatus(data.queue_id);
  }

  return data;
}

// Polling stato job
async function pollJobStatus(queueId, maxAttempts = 30, interval = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`https://lambda-url/status?queue_id=${queueId}`);
    const data = await response.json();

    console.log(`Polling attempt ${i + 1}: status=${data.status}`);

    if (data.status === 'running' && data.build_number) {
      console.log('Job started! Build number:', data.build_number);
      console.log('Console:', data.console_url);
      return data;
    }

    if (data.status === 'success' || data.status === 'failure') {
      console.log('Job completed:', data.result);
      return data;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Polling timeout - job still in queue');
}

// Esempio d'uso
triggerOrchestrator({
  ENVIRONMENT: 'production',
  ACTION: 'shutdown',
  DRY_RUN: 'false'
}).then(result => {
  console.log('Final result:', result);
}).catch(err => {
  console.error('Error:', err);
});
```

## Monitoring e Debug

### CloudWatch Logs

La lambda logga in formato JSON strutturato. Query utili per CloudWatch Logs Insights:

```sql
# Tutti i job triggerati
fields @timestamp, message, job, queue_id, status
| filter level = "INFO" and message = "Job triggered successfully"
| sort @timestamp desc

# Errori
fields @timestamp, level, message, error
| filter level = "ERROR"
| sort @timestamp desc

# Retry
fields @timestamp, message, attempt, max_retries, url
| filter message like /retry/i
| sort @timestamp desc
```

### Status Codes

- `200` - Operazione completata con successo
- `400` - Request non valida (JSON malformato, parametri mancanti)
- `405` - Metodo HTTP non supportato
- `500` - Errore interno (Jenkins non raggiungibile, configurazione errata)

## Sicurezza

⚠️ **IMPORTANTE:**

1. **Non committare token Jenkins nel codice!** Usa sempre variabili d'ambiente o AWS Secrets Manager.
2. **Limita l'accesso alla Lambda** usando IAM policies o API Gateway authorizers.
3. **Configura CORS** correttamente per limitare le origini autorizzate.
4. **Usa HTTPS** per tutte le comunicazioni.
5. **Ruota i token** Jenkins periodicamente.

## Troubleshooting

### "Configurazione Lambda incompleta"
Verifica che tutte le variabili d'ambiente obbligatorie siano configurate.

### "Jenkins HTTP 401"
Il token Jenkins è scaduto o non valido. Rigeneralo.

### "Jenkins HTTP 404"
Il job name è errato. Verifica che il path sia corretto (usa `/` per job in cartelle).

### "SSL verification failed"
Se usi certificati self-signed in sviluppo, imposta `SSL_VERIFY=false`.

### "Queue item not found"
Il job è già partito. Usa il `build_number` per continuare il monitoring.

## Limiti

- **Timeout Lambda**: Default 60 secondi (configurabile)
- **Retry**: 3 tentativi con backoff esponenziale (2s, 4s, 8s)
- **HTTP Timeout**: 30 secondi per richiesta a Jenkins
- **Polling**: Consigliato intervallo 2-5 secondi per non sovraccaricare Jenkins

## Estensioni Future

- [ ] Webhook Jenkins per notifiche asincrone
- [ ] Supporto per build parametrizzate complesse (file upload)
- [ ] Cache stato job in DynamoDB per polling distribuito
- [ ] Notifiche SNS/SQS quando job completa
- [ ] Dashboard real-time con WebSocket
