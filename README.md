# Shutdown Scheduler

Dashboard statica per la pianificazione delle finestre di spegnimento di ambienti e VM AWS.

## Funzionalita

- Light mode di default, switch dark mode con icona in alto a destra
- Selezione applicazione e ambiente (Development, Integration, Pre-Produzione, Training, Bugfixing, Produzione)
- Visualizzazione elenco server con tipo, hostname e descrizione configurabile
- Pianificazione per singolo server o intero ambiente
- Calendario interattivo con selezione multi-giorno (senza glitch grafici)
- Finestra oraria (start/stop 24H) o shutdown completo
- Ricorrenze: ogni giorno, Lun-Ven, Sab-Dom
- Import CSV per dati macchine, Export JSON delle pianificazioni
- Persistenza locale via localStorage
- Design minimal e responsivo, zero dipendenze

## Struttura

```
index.html          # Single Page Application
css/style.css       # Light/Dark theme
js/data.js          # CSV parsing e gestione dati
js/app.js           # Logica applicativa
data/machines.csv   # Dati di esempio
```

## Utilizzo

Aprire `index.html` nel browser oppure hostare su S3 (nessun web server necessario).

### Formato CSV

```csv
application,environment,machine_name,hostname,server_type,description
Portale Clienti,Development,Web Server 1,web-dev-01.internal,Web Server,Frontend Apache - ambiente sviluppo
```

Colonne: `application`, `environment`, `machine_name`, `hostname`, `server_type`, `description`
