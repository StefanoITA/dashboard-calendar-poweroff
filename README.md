# Power Schedule Dashboard

Dashboard statica per la pianificazione delle finestre di spegnimento di ambienti e VM AWS.

## Funzionalita

- Selezione applicazione e ambiente (Development, Integration, Pre-Produzione, Training, Bugfixing, Produzione)
- Visualizzazione elenco server con tipo (Web Server, Application Server, Database Server)
- Pianificazione per singolo server o intero ambiente
- Calendario interattivo con selezione multi-giorno
- Finestra oraria (start/stop) o shutdown completo
- Preset rapidi (Natale, chiusura estiva, weekend, notti)
- Import CSV per dati macchine
- Export JSON delle pianificazioni
- Persistenza locale via localStorage
- Dark mode, design minimal e responsivo

## Struttura

```
index.html          # Single Page Application
css/style.css       # Dark mode theme
js/data.js          # CSV parsing e gestione dati
js/app.js           # Logica applicativa
data/machines.csv   # Dati di esempio
```

## Utilizzo

Aprire `index.html` nel browser oppure hostare su S3 (nessun web server necessario).

### Formato CSV

```csv
application,environment,machine_name,hostname,server_type,ip_address
Portale Clienti,Development,Web Server 1,web-dev-01.internal,Web Server,10.0.1.10
```

Colonne richieste: `application`, `environment`, `machine_name`, `hostname`, `server_type`, `ip_address`
