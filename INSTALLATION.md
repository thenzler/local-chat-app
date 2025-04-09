# Installations- und Benutzeranleitung

Diese Anleitung führt Sie durch die Einrichtung und Verwendung der Local Chat App, einer vollständig lokalen Alternative zu Azure OpenAI und ähnlichen Cloud-Diensten.

## Inhaltsverzeichnis
1. [Systemanforderungen](#systemanforderungen)
2. [Installation](#installation)
3. [Dokumente indexieren](#dokumente-indexieren)
4. [Die Anwendung starten](#die-anwendung-starten)
5. [Benutzung](#benutzung)
6. [Fehlerbehebung](#fehlerbehebung)
7. [Konfiguration und Anpassung](#konfiguration-und-anpassung)

## Systemanforderungen

- **Betriebssystem:** Windows 10/11, macOS oder Linux
- **Hardware:** 
  - Mindestens 8 GB RAM 
  - 10 GB freier Festplattenspeicher
  - CPU mit 4+ Kernen empfohlen
  - GPU (optional, aber empfohlen für schnellere Antworten)
- **Software:**
  - Node.js 18+ und npm
  - Docker (für Qdrant)
  - Git

## Installation

### 1. Repository klonen

```bash
git clone https://github.com/thenzler/local-chat-app.git
cd local-chat-app
```

### 2. Node.js-Abhängigkeiten installieren

```bash
npm install
```

### 3. Ollama installieren

Ollama ist ein Tool, das lokale Ausführung von Large Language Models (LLMs) ermöglicht.

**Für macOS:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Für Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Für Windows:**
1. Besuchen Sie [https://ollama.com/download/windows](https://ollama.com/download/windows)
2. Laden Sie das Windows-Installationsprogramm herunter
3. Führen Sie die Installationsdatei aus und folgen Sie den Anweisungen

### 4. Qdrant installieren und starten (mit Docker)

Qdrant ist eine Vektordatenbank, die für die Speicherung und Suche von Dokumenten verwendet wird.

```bash
docker run -d -p 6333:6333 -p 6334:6334 -v ./qdrant_storage:/qdrant/storage qdrant/qdrant
```

Hinweis: Stellen Sie sicher, dass Docker auf Ihrem System installiert und gestartet ist.

### 5. Umgebungsvariablen konfigurieren

```bash
# Kopieren Sie die Beispiel-.env-Datei
cp .env.example .env
```

Bearbeiten Sie dann die `.env`-Datei nach Bedarf. Die Standardwerte sollten in den meisten Fällen funktionieren.

### 6. LLM-Modell herunterladen

Sie müssen ein Modell für Ollama herunterladen:

```bash
# Für ein kleines, schnelles Modell (1-2 GB)
ollama pull tinyllama

# Für ein mittelgroßes Modell mit besserer Qualität (4-5 GB)
ollama pull mistral

# Für das beste Ergebnis (8-10 GB)
ollama pull llama3

# Lokalisiertes deutsches Modell (5-6 GB)
ollama pull orca-mini:3b-de
```

Aktualisieren Sie nach dem Herunterladen des Modells die `.env`-Datei, um das gewählte Modell zu verwenden:

```
OLLAMA_MODEL=mistral
```

## Dokumente indexieren

### 1. Dokumente vorbereiten

Legen Sie Ihre Dokumente im Verzeichnis `documents` ab. Unterstützte Formate sind:
- PDF (*.pdf)
- Word (*.docx)
- Text (*.txt)
- Markdown (*.md)
- HTML (*.html)

### 2. Indexierungsprozess starten

```bash
npm run index-docs
```

Der Indexierungsprozess extrahiert Text aus Ihren Dokumenten, teilt ihn in Abschnitte auf und speichert ihn mit Vektorembeddings in Qdrant.

## Die Anwendung starten

### 1. Server starten

```bash
npm start
```

### 2. Zugriff auf die Anwendung

Öffnen Sie Ihren Browser und navigieren Sie zu:

```
http://localhost:3000
```

## Benutzung

### Chat-Interface

1. **Fragen stellen:** Geben Sie Ihre Frage in das Eingabefeld am unteren Rand ein und drücken Sie Enter oder klicken Sie auf den Senden-Button.

2. **Dokumentquellen anzeigen:** Wenn die Antwort auf Dokumenten basiert, wird ein "X Quellen" Button angezeigt. Klicken Sie darauf, um die Quellendokumente einzusehen.

3. **Allgemeines Wissen vs. Dokumentwissen:** 
   - Wenn Informationen aus Dokumenten stammen, werden diese mit "(Quelle: Dokumentname, Seite X)" angegeben
   - Wenn keine relevanten Informationen in den Dokumenten gefunden werden, antwortet die KI mit ihrem allgemeinen Wissen, gekennzeichnet mit "[Allgemeinwissen]:"

### Systemstatus

Im oberen Bereich der Anwendung werden zwei Status-Indikatoren angezeigt:

- **Ollama:** Zeigt an, ob das lokale LLM verfügbar ist
- **Qdrant:** Zeigt an, ob die Vektordatenbank verfügbar ist

Falls einer der Dienste nicht erreichbar ist, erhalten Sie eine entsprechende Meldung.

## Fehlerbehebung

### Ollama startet nicht

1. Stellen Sie sicher, dass Sie genügend Speicherplatz haben
2. Prüfen Sie, ob ein anderer Prozess Port 11434 belegt
3. Starten Sie den Dienst manuell:
   ```bash
   ollama serve
   ```

### Qdrant ist nicht erreichbar

1. Prüfen Sie, ob Docker läuft
2. Starten Sie den Qdrant-Container neu:
   ```bash
   docker restart CONTAINER_ID
   ```
   (Ersetzen Sie CONTAINER_ID durch die tatsächliche Container-ID)

### Indexierung schlägt fehl

1. Prüfen Sie, ob die Dokumente in unterstützten Formaten vorliegen
2. Stellen Sie sicher, dass die Dokumente lesbar und nicht passwortgeschützt sind
3. Prüfen Sie die Konsolenausgabe auf spezifische Fehlermeldungen

### LLM-Antworten sind langsam

1. Wählen Sie ein kleineres Modell in der `.env`-Datei
2. Wenn verfügbar, aktivieren Sie die GPU-Beschleunigung in Ollama
3. Erhöhen Sie die RAM-Zuweisung für Docker (für Qdrant)

## Konfiguration und Anpassung

### Ändern des verwendeten LLM-Modells

Bearbeiten Sie die `.env`-Datei und ändern Sie `OLLAMA_MODEL` auf eines Ihrer installierten Modelle.

### Anpassen der Vektorsuche

- `CHUNK_SIZE`: Größe der Textabschnitte (Standard: 500 Zeichen)
- `CHUNK_OVERLAP`: Überlappung zwischen Abschnitten (Standard: 50 Zeichen)

### Anpassen des System-Prompts

Der System-Prompt definiert, wie die KI antworten soll. Sie können diesen in der `.env`-Datei unter `SYSTEM_PROMPT` anpassen.

### Frontend anpassen

Das Frontend verwendet Vanilla HTML, CSS und JavaScript. Sie können die Dateien im `frontend`-Verzeichnis bearbeiten, um das Aussehen und Verhalten anzupassen.

### Erweiterung für mehrere Benutzer

Die Standardkonfiguration ist für einen einzelnen Benutzer gedacht. Für eine Mehrbenutzerkonfiguration müssten Sie:

1. Eine Benutzerauthentifizierung implementieren
2. Separate Vektorsammlungen pro Benutzer erstellen
3. Die Speicherung der Chat-Historie pro Benutzer anpassen