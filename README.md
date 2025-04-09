# Local Chat App

Eine vollständig lokale Chat-Anwendung mit LLM und Vektorsuche, ohne Cloud-Abhängigkeiten oder API-Kosten.

## 🎯 Beschreibung

Diese Anwendung ist eine leistungsstarke, kostengünstige Alternative zu Cloud-basierten Chatbot-Lösungen wie Azure OpenAI. Sie bietet eine moderne, benutzerfreundliche Oberfläche für die Interaktion mit Ihren eigenen Dokumenten durch lokale Sprachmodelle (LLMs) und ermöglicht semantische Suche ohne Abhängigkeit von externen Diensten oder API-Kosten.

## 📋 Features

- **Lokale Sprachmodelle**: Integration mit Ollama für vollständig lokale LLM-Ausführung
- **Intelligente Modellverwaltung**: Automatische Hardwareerkennung und Modellempfehlungen
- **Semantische Vektorsuche**: Leistungsstarke Qdrant-Integration mit Vektoreinbettungen
- **Dokumentenreferenzierung**: Indizierung von PDF-, Word- und Textdateien mit Quellenangaben
- **Moderne Chat-UI**: Responsive Benutzeroberfläche mit Echtzeit-Interaktionen
- **Automatische Quellenangaben**: Alle aus Dokumenten stammenden Informationen werden mit Quellen zitiert
- **Fallback zu allgemeinem Wissen**: Kennzeichnung von Antworten aus dem Modellwissen vs. Dokumentenwissen
- **Token-Limitierung**: Intelligente Verwaltung von Kontextgröße für optimale Leistung

## 🤔 Warum Local Chat App statt Azure OpenAI?

### 💰 Kosteneinsparung
- **Keine API-Kosten**: Azure OpenAI berechnet pro Token (Eingabe und Ausgabe)
- **Keine Überraschungen**: Keine unerwarteten Rechnungen durch intensive Nutzung

### 🛡️ Datenschutz und Kontrolle
- **Daten bleiben lokal**: Alle Dokumente und Anfragen bleiben in Ihrer Kontrolle
- **Keine Datenbereitstellung**: Ihre Unternehmensdaten werden nicht für AI-Training verwendet

### 🚀 Leistung und Anpassbarkeit
- **Modellauswahl**: Flexibilität beim Wechsel zwischen verschiedenen Modellen
- **Angepasste Systemanforderungen**: Auswahl von Modellen basierend auf Ihrer Hardware
- **Vollständige Anpassungskontrolle**: Ändern Sie den Code nach Ihren Bedürfnissen

### 🔌 Offlinefähigkeit
- **Keine Internetabhängigkeit**: Funktioniert vollständig ohne Internetverbindung
- **Keine Ausfallzeiten**: Nicht betroffen von Cloud-Dienst-Unterbrechungen

## 🛠️ Technologie-Stack

### Frontend
- HTML5, CSS3 mit Custom Properties und responsivem Design
- Vanilla JavaScript ohne externe Frameworks

### Backend
- Node.js mit Express
- Ollama für lokale LLM-Integration
- Qdrant für Vektordatenbank
- Transformers.js für Einbettungen

## 🚀 Erste Schritte

Eine detaillierte Installations- und Benutzungsanleitung finden Sie in der [INSTALLATION.md](INSTALLATION.md).

## 🧙‍♂️ Verbesserte Funktionen

Im Vergleich zur ursprünglichen Azure-basierten Version bietet diese Anwendung:

1. **Modellverwaltung**: Einfache Installation, Aktivierung und Verwaltung von LLMs
2. **Hardware-bewusste Empfehlungen**: Automatische Anpassung an Ihr System
3. **Verbesserte semantische Suche**: Hochwertige Vektorsuche mit optimierten Einbettungen
4. **Effizientes Chunking**: Intelligentes Aufteilen von Dokumenten an Satzgrenzen
5. **Größere Dokumentunterstützung**: Verbesserte Token-Verwaltung ermöglicht größere Dokumente

## 📊 Leistungsvergleich

| Funktion | Local Chat App | Azure OpenAI |
|---|---|---|
| Kosten | Einmalige Server-/Hardware-Kosten | Fortlaufende API-Kosten pro Token |
| Latenz | Abhängig von lokaler Hardware | Abhängig von Internetverbindung |
| Datenschutz | 100% lokal | Daten werden an Azure gesendet |
| Anpassbarkeit | Vollständiger Code-Zugriff | Begrenzt auf API-Parameter |
| Modellanpassung | Freie Modellauswahl | Begrenzt auf verfügbare Azure-Modelle |
| Offlinebetrieb | Vollständig offlinefähig | Erfordert Internetverbindung |

## 🔧 Konfiguration

Die Anwendung ist hochgradig konfigurierbar durch Umgebungsvariablen. Detaillierte Informationen finden Sie in der `.env.example`-Datei.

## 🚧 In Entwicklung

- [ ] Chat-Verlaufs-Management mit lokaler Datenbank
- [ ] Mehrbenutzer-Unterstützung und Authentifizierung
- [ ] Web-basierte Dokumenten-Upload-Schnittstelle
- [ ] Erweiterte Analyseoptionen für indizierte Dokumente

## 📚 Referenzen

- [Ollama](https://ollama.com/) - Framework für lokale LLMs
- [Qdrant](https://qdrant.tech/) - Vektordatenbank für Ähnlichkeitssuche
- [Transformers.js](https://huggingface.co/docs/transformers.js) - ML-Modelle für den Browser und Node.js

## 📄 Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert - siehe die [LICENSE](LICENSE) Datei für Details.