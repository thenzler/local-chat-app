// Import required dependencies
const express = require('express');
const cors = require('cors');
const { Ollama } = require('node-ollama');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Import modules
const vectorDB = require('./vector-db');
const modelRoutes = require('./routes/models');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Enhanced logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Configure logging level
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const logLevels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

function log(level, ...args) {
  if (logLevels[level] >= logLevels[LOG_LEVEL]) {
    const timestamp = new Date().toISOString();
    console[level](`[${timestamp}] [${level.toUpperCase()}]`, ...args);
  }
}

// Initialize Ollama client
const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://localhost:11434'
});

// Initialize VectorDB
vectorDB.initialize().catch(err => {
  log('error', 'Fehler bei der Initialisierung der VectorDB:', err);
});

// System prompt for the LLM
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || `Du bist ein präziser Recherche-Assistent, der NUR auf Deutsch antwortet.

PRIORITÄT 1: Wenn Informationen in den bereitgestellten Dokumenten verfügbar sind:
- Verwende AUSSCHLIESSLICH diese dokumentierten Informationen
- Bei JEDER Information aus den Dokumenten MUSST du die genaue Quelle in Klammern direkt dahinter angeben
- Format für Dokumentquellen: (Quelle: Dokumentname, Seite X)

PRIORITÄT 2: Wenn keine relevanten Informationen in den Dokumenten zu finden sind:
- Gib klar an: "In den verfügbaren Dokumenten konnte ich keine spezifischen Informationen zu dieser Frage finden."
- Danach kannst du eine allgemeine Antwort basierend auf deinem eigenen Wissen geben, aber kennzeichne diese klar mit: "[Allgemeinwissen]"

Formatierungsanweisungen:
1. Gliedere deine Antwort in klare Absätze
2. Stelle die wichtigsten Informationen an den Anfang
3. Nenne bei JEDER Information aus Dokumenten die Quelle als (Quelle: Dokumentname, Seite X)
4. Trenne dokumentierte Informationen klar von allgemeinem Wissen`;

// API Routes
app.use('/api/models', modelRoutes);

// API endpoint to handle chat requests
app.post('/api/chat', async (req, res) => {
  try {
    // Validate request body
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    log('info', `Neue Benutzeranfrage: "${message}"`);
    
    try {
      await handleChatWithLocalLLM(message, res);
    } catch (innerError) {
      log('error', 'Fehler bei der Verarbeitung der Anfrage:', innerError);
      throw innerError;
    }
  } catch (error) {
    log('error', 'Fehler bei der Kommunikation mit dem lokalen LLM:', error.message);
    
    return res.status(500).json({ 
      error: 'Fehler bei der Antwort vom lokalen LLM',
      details: error.message
    });
  }
});

/**
 * Verarbeitet Chat-Anfragen mit einem lokalen LLM via Ollama
 */
async function handleChatWithLocalLLM(message, res) {
  try {
    log('debug', 'Starte Chat mit lokalem LLM (Ollama)');
    
    // 1. Relevante Dokumente aus der Vektordatenbank abrufen
    const { contextText, documents } = await retrieveRelevantDocuments(message);
    
    // 2. Prüfen, ob Dokumente gefunden wurden
    let userPrompt;
    
    if (documents.length === 0) {
      log('info', "Keine relevanten Dokumente gefunden");
      userPrompt = `
Zu folgender Frage wurden keine relevanten Informationen in den Dokumenten gefunden: "${message}"

Bitte antworte wie folgt:
1. Erwähne zuerst, dass keine spezifischen Informationen in den Dokumenten gefunden wurden
2. Gib dann eine allgemeine Antwort basierend auf deinem Wissen, deutlich mit "[Allgemeinwissen]:" gekennzeichnet`;
    } else {
      // Normal mit gefundenen Dokumenten fortfahren
      userPrompt = `Beantworte folgende Frage basierend auf den gegebenen Dokumentausschnitten. Verwende NUR Informationen aus diesen Ausschnitten und gib für jede Information die Quelle mit Dokumentnamen und Seitenzahl an.

Frage: ${message}

Hier sind die relevanten Dokumentausschnitte:

${contextText}`;
    }

    // 3. Lokale LLM-Anfrage stellen
    const localModel = process.env.OLLAMA_MODEL || 'mistral';
    
    log('info', `Sende Anfrage an lokales Modell: ${localModel}`);
    
    const result = await ollama.chat({
      model: localModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      options: {
        temperature: parseFloat(process.env.TEMPERATURE || 0.1),
        num_predict: parseInt(process.env.MAX_TOKENS || 4000),
      }
    });

    // 4. Antwort verarbeiten
    const botReply = result.message.content;
    log('info', `Bot-Antwort: "${botReply.substring(0, 100)}..."`);
    
    // 5. Quellen extrahieren
    const sources = extractSourcesFromText(botReply);
    log('info', `${sources.length} eindeutige Quellen extrahiert`);
    
    // 6. Antwort senden
    return res.json({
      reply: botReply,
      sources: sources
    });
    
  } catch (error) {
    log('error', 'Fehler bei der lokalen LLM-Anfrage:', error);
    throw error;
  }
}

/**
 * Extrahiert Quellenangaben aus dem Text im Format (Quelle: Dokumentname, Seite X)
 */
function extractSourcesFromText(text) {
  const sources = [];
  const sourceRegex = /\(Quelle: ([^,]+), Seite (\d+)\)/g;
  let match;
  
  while ((match = sourceRegex.exec(text)) !== null) {
    const document = match[1].trim();
    const page = parseInt(match[2]);
    
    // Nur eindeutige Quellen hinzufügen
    if (!sources.some(s => s.document === document && s.page === page)) {
      sources.push({ document, page });
    }
  }
  
  return sources;
}

/**
 * Relevante Dokumente aus der Vektordatenbank abrufen (verbesserte Version mit VectorDB)
 */
async function retrieveRelevantDocuments(query) {
  log('debug', `Suche nach relevanten Dokumenten für: "${query}" in Vektordatenbank`);
  
  try {
    // Prüfen, ob die VectorDB initialisiert ist
    const stats = await vectorDB.getStats();
    
    if (!stats.exists || stats.count === 0) {
      log('warn', 'Vektordatenbank ist leer oder existiert nicht. Bitte zuerst Dokumente indexieren.');
      return { contextText: "", documents: [] };
    }
    
    // Semantische Suche verwenden, wenn aktiviert
    const useSemanticSearch = process.env.USE_SEMANTIC_SEARCH !== 'false';
    
    // Suche mit der verbesserten VectorDB ausführen
    const searchResults = await vectorDB.search(query, {
      limit: 10,
      minScore: 0.2,
      useSemanticSearch: useSemanticSearch
    });
    
    // Ergebnisse verarbeiten
    const results = [];
    let contextText = "";
    let totalTokenCount = 0;
    const MAX_TOKEN_ESTIMATE = 10000;
    
    if (searchResults.count === 0) {
      log('info', 'Keine relevanten Dokumente in der Vektordatenbank gefunden');
      return { contextText: "", documents: [] };
    }
    
    // Jeden gefundenen Treffer verarbeiten
    for (const result of searchResults.results) {
      const content = result.content || "";
      const documentName = result.documentName || "Unbekanntes Dokument";
      const pageNumber = result.pageNumber || 1;
      
      // Token-Größe schätzen - ungefähr 4 Zeichen pro Token als grobe Schätzung
      const estimatedTokens = Math.ceil(content.length / 4);
      
      // Wenn das Token-Limit überschritten wird, nicht mehr hinzufügen
      if (totalTokenCount + estimatedTokens > MAX_TOKEN_ESTIMATE) {
        log('warn', `Token-Limit erreicht, überspringe restliche Dokumente`);
        break;
      }
      
      // Dokument gegebenenfalls kürzen
      let processedContent = content;
      if (estimatedTokens > 2000) {
        const charLimit = 2000 * 4;
        processedContent = content.substring(0, charLimit) + "... [Dokument gekürzt wegen Größe]";
        log('warn', `Großes Dokument gekürzt: ${documentName}`);
      }
      
      const doc = {
        content: processedContent,
        documentName,
        pageNumber,
        score: result.score
      };
      
      contextText += `Dokument: ${doc.documentName}\n`;
      contextText += `Seite: ${doc.pageNumber}\n`;
      contextText += `Relevanz: ${Math.round(doc.score * 100)}%\n`;
      contextText += `Inhalt: ${doc.content}\n\n`;
      
      totalTokenCount += estimatedTokens;
      results.push(doc);
    }
    
    log('info', `${results.length} relevante Dokumentenabschnitte mit ${useSemanticSearch ? 'semantischer' : 'keyword-basierter'} Suche gefunden`);
    log('debug', `Geschätzte Token-Anzahl: ${totalTokenCount}`);
    
    return { contextText, documents: results };
    
  } catch (error) {
    log('error', 'Fehler bei der Dokumentensuche:', error);
    return { contextText: "", documents: [] };
  }
}

// Test search functionality
app.get('/api/test-search', async (req, res) => {
  try {
    const query = req.query.q || 'test query';
    const useSemanticSearch = req.query.semantic !== 'false';
    
    log('info', `Test-Suche: "${query}" (Semantisch: ${useSemanticSearch ? 'ja' : 'nein'})`);
    
    // VectorDB für die Suche verwenden
    const searchResults = await vectorDB.search(query, {
      limit: 5,
      useSemanticSearch: useSemanticSearch
    });
    
    return res.json({
      query,
      useSemanticSearch,
      documentCount: searchResults.count,
      documents: searchResults.results.map(doc => ({
        name: doc.documentName,
        page: doc.pageNumber,
        score: doc.score,
        preview: doc.content.substring(0, 200) + '...'
      }))
    });
  } catch (error) {
    console.error('Error testing search:', error);
    return res.status(500).json({ error: 'Error testing search', details: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Check if Ollama is running
app.get('/api/check-ollama', async (req, res) => {
  try {
    const models = await ollama.list();
    return res.json({
      status: 'ok',
      models: models.models.map(m => m.name),
      recommended: process.env.OLLAMA_MODEL || 'mistral'
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Ollama ist nicht erreichbar. Bitte stellen Sie sicher, dass Ollama läuft.',
      details: error.message
    });
  }
});

// Check if Vector DB is running and get statistics
app.get('/api/check-vectordb', async (req, res) => {
  try {
    const stats = await vectorDB.getStats();
    
    return res.json({
      status: stats.exists ? 'ok' : 'warning',
      message: stats.exists ? `Vektordatenbank bereit mit ${stats.count} indizierten Dokumenten` : 'Vektordatenbank ist leer oder existiert nicht',
      ...stats
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Vektordatenbank ist nicht erreichbar',
      details: error.message
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`System-Prompt konfiguriert mit ${SYSTEM_PROMPT.length} Zeichen`);
  console.log(`Verwendetes lokales Modell: ${process.env.OLLAMA_MODEL || 'mistral'}`);
  console.log(`Gesundheitscheck verfügbar unter http://localhost:${PORT}/health`);
  console.log(`Suchtest verfügbar unter http://localhost:${PORT}/api/test-search?q=ihre+suchanfrage`);
  console.log(`Modellprüfung verfügbar unter http://localhost:${PORT}/api/check-ollama`);
  console.log(`Vektordatenbank-Status verfügbar unter http://localhost:${PORT}/api/check-vectordb`);
});