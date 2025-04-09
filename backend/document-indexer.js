// Import required dependencies
const fs = require('fs').promises;
const path = require('path');
const PDFParser = require('pdf-parse');
const mammoth = require('mammoth');
const vectorDB = require('./vector-db');
require('dotenv').config();

// Configure logging
function log(level, ...args) {
  const timestamp = new Date().toISOString();
  console[level](`[${timestamp}] [${level.toUpperCase()}] [Indexer]`, ...args);
}

// Configuration
const config = {
  documentsDir: process.env.DOCUMENTS_DIR || './documents',
  chunkSize: parseInt(process.env.CHUNK_SIZE || '500'),
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '50'),
  resetCollection: process.env.RESET_COLLECTION === 'true', // true = Vollständige Neuindexierung
  skipExisting: process.env.SKIP_EXISTING === 'true', // true = Vorhandene Dokumente überspringen
  supportedExtensions: ['.pdf', '.docx', '.txt', '.md', '.html']
};

// Hauptfunktion
async function main() {
  try {
    log('info', 'Starte Dokument-Indexierung...');
    log('info', `Verwende Konfiguration: ${JSON.stringify(config, null, 2)}`);
    
    // Erstelle Verzeichnis, falls es nicht existiert
    await ensureDirectoryExists(config.documentsDir);
    
    // Initialisiere Vector DB
    await vectorDB.initialize();
    
    // Collection zurücksetzen, falls gewünscht
    if (config.resetCollection) {
      log('info', 'Setze Collection zurück für komplette Neuindexierung...');
      await vectorDB.resetCollection();
    }
    
    // Statistiken abrufen
    const stats = await vectorDB.getStats();
    log('info', `Aktuelle Vektordatenbank-Statistiken: ${stats.count} Dokumente, ${stats.model} Modell`);
    
    // Lese und verarbeite alle Dokumente
    const documents = await readAllDocuments();
    log('info', `${documents.length} Dokumente zum Indexieren gefunden`);
    
    if (documents.length === 0) {
      log('warn', `Keine Dokumente im Verzeichnis ${config.documentsDir} gefunden`);
      log('info', 'Bitte legen Sie Dokumente im Verzeichnis ab und führen Sie den Indexer erneut aus');
      return;
    }
    
    let indexedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Verarbeite und indexiere jedes Dokument
    for (const doc of documents) {
      log('info', `Verarbeite Dokument: ${doc.filename}`);
      
      try {
        // Extrahiere Text aus Dokument
        const text = await extractTextFromDocument(doc);
        
        if (!text || text.length === 0) {
          log('warn', `Kein Text aus Dokument extrahiert: ${doc.filename}`);
          errorCount++;
          continue;
        }
        
        log('info', `Text extrahiert (${text.length} Zeichen)`);
        
        // Teile Text in Chunks
        const chunks = createOptimizedChunks(text);
        log('info', `Text in ${chunks.length} Chunks aufgeteilt`);
        
        // Erstelle Dokumente für Vektordatenbank
        const vectorDocuments = chunks.map((chunk, index) => ({
          content: chunk,
          metadata: {
            documentName: doc.filename,
            pageNumber: estimatePageNumber(index, chunks.length, doc.extension === '.pdf'),
            path: doc.path
          }
        }));
        
        // Speichere Chunks in der Vektordatenbank
        const result = await vectorDB.storeDocuments(vectorDocuments);
        
        if (result.success) {
          log('info', `Dokument erfolgreich indexiert: ${doc.filename}`);
          indexedCount++;
        } else {
          log('error', `Fehler beim Indexieren von Dokument ${doc.filename}: ${result.message}`);
          errorCount++;
        }
      } catch (docError) {
        log('error', `Fehler beim Verarbeiten von Dokument ${doc.filename}:`, docError);
        errorCount++;
      }
    }
    
    // Abschließende Statistiken anzeigen
    log('info', 'Dokument-Indexierung abgeschlossen:');
    log('info', `- ${indexedCount} Dokumente erfolgreich indexiert`);
    log('info', `- ${skippedCount} Dokumente übersprungen`);
    log('info', `- ${errorCount} Dokumente mit Fehlern`);
    
    // Aktuelle Statistiken abrufen
    const finalStats = await vectorDB.getStats();
    log('info', `Vektordatenbank enthält jetzt insgesamt ${finalStats.count} Dokumente`);
  } catch (error) {
    log('error', 'Fehler bei der Dokument-Indexierung:', error);
    process.exit(1);
  }
}

// Stelle sicher, dass ein Verzeichnis existiert
async function ensureDirectoryExists(directory) {
  try {
    await fs.access(directory);
  } catch {
    log('info', `Erstelle Verzeichnis: ${directory}`);
    await fs.mkdir(directory, { recursive: true });
  }
}

// Lese alle Dokumente aus dem Verzeichnis
async function readAllDocuments() {
  try {
    const files = await fs.readdir(config.documentsDir);
    
    const documents = [];
    
    for (const file of files) {
      const filePath = path.join(config.documentsDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isFile()) {
        const extension = path.extname(file).toLowerCase();
        
        // Unterstützte Dateitypen
        if (config.supportedExtensions.includes(extension)) {
          documents.push({
            filename: file,
            path: filePath,
            extension,
            size: stats.size,
            lastModified: stats.mtime
          });
        }
      }
    }
    
    return documents;
  } catch (error) {
    log('error', 'Fehler beim Lesen der Dokumente:', error);
    return [];
  }
}

// Extrahiere Text aus verschiedenen Dokumentformaten
async function extractTextFromDocument(doc) {
  try {
    const fileBuffer = await fs.readFile(doc.path);
    
    switch (doc.extension) {
      case '.pdf':
        const pdfData = await PDFParser(fileBuffer);
        return pdfData.text;
        
      case '.docx':
        const docxResult = await mammoth.extractRawText({ buffer: fileBuffer });
        return docxResult.value;
        
      case '.txt':
      case '.md':
      case '.html':
        return fileBuffer.toString('utf-8');
        
      default:
        throw new Error(`Nicht unterstütztes Dateiformat: ${doc.extension}`);
    }
  } catch (error) {
    log('error', `Fehler beim Extrahieren von Text aus ${doc.filename}:`, error);
    throw error;
  }
}

// Optimierte Funktion zum Aufteilen von Text in Chunks
function createOptimizedChunks(text) {
  const chunkSize = config.chunkSize;
  const chunkOverlap = config.chunkOverlap;
  
  // Bereinige den Text (entferne mehrfache Leerzeichen, Umbrüche usw.)
  text = text.replace(/\s+/g, ' ').trim();
  
  // Chunks an Satzgrenzen teilen, nicht mitten im Satz
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  const chunks = [];
  let currentChunk = "";
  
  for (const sentence of sentences) {
    // Wenn das Hinzufügen dieses Satzes den Chunk zu groß machen würde
    if (currentChunk.length + sentence.length > chunkSize) {
      // Speichere aktuellen Chunk, wenn nicht leer
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
      }
      
      // Neuen Chunk beginnen mit Überlappung
      const overlapText = currentChunk.length > chunkOverlap 
        ? currentChunk.substring(currentChunk.length - chunkOverlap) 
        : currentChunk;
        
      currentChunk = overlapText + sentence;
    } else {
      // Satz zum aktuellen Chunk hinzufügen
      currentChunk += sentence;
    }
  }
  
  // Letzten Chunk hinzufügen, wenn nicht leer
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// Schätze Seitennummer basierend auf Position im Dokument
function estimatePageNumber(chunkId, totalChunks, isPdf) {
  if (isPdf) {
    // Für PDFs: Nehmen wir an, dass jede Seite ungefähr gleich viele Chunks hat
    // und dass ein typisches Dokument ~500 Wörter pro Seite hat
    const chunksPerPage = 5; // Annahme: ~5 Chunks pro Seite mit 500 Zeichen pro Chunk
    return Math.floor(chunkId / chunksPerPage) + 1;
  } else {
    // Für andere Dokumente: Einfach aufsteigende Zahlen verwenden
    return 1;
  }
}

// Starte das Hauptprogramm, wenn direkt ausgeführt
if (require.main === module) {
  main().catch(error => {
    log('error', 'Unbehandelter Fehler:', error);
    process.exit(1);
  });
}

// Exportiere Funktionen für Tests und externe Verwendung
module.exports = {
  indexDocuments: main,
  createOptimizedChunks,
  extractTextFromDocument
};