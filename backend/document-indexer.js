// Import required dependencies
const fs = require('fs').promises;
const path = require('path');
const { QdrantClient } = require('@qdrant/js-client');
const { pipeline } = require('@xenova/transformers');
const PDFParser = require('pdf-parse');
const mammoth = require('mammoth');
require('dotenv').config();

// Configure logging
function log(level, ...args) {
  const timestamp = new Date().toISOString();
  console[level](`[${timestamp}] [${level.toUpperCase()}]`, ...args);
}

// Initialize Qdrant client
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

// Configuration
const config = {
  documentsDir: process.env.DOCUMENTS_DIR || './documents',
  chunkSize: parseInt(process.env.CHUNK_SIZE || '500'),
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '50'),
  collectionName: process.env.QDRANT_COLLECTION || 'knowledge-collection',
  embeddingModel: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
  dimensions: 384  // Dimensionen für das Standard-Modell 'all-MiniLM-L6-v2'
};

// Hauptfunktion
async function main() {
  try {
    log('info', 'Starte Dokument-Indexierung...');
    log('info', `Verwende Konfiguration: ${JSON.stringify(config, null, 2)}`);
    
    // Erstelle Verzeichnis, falls es nicht existiert
    await ensureDirectoryExists(config.documentsDir);
    
    // Erstelle Qdrant-Collection, falls sie nicht existiert
    await ensureCollectionExists();
    
    // Lade den Embedding-Pipeline
    log('info', `Lade Embedding-Modell: ${config.embeddingModel}`);
    const embedder = await pipeline('feature-extraction', config.embeddingModel);
    
    // Lese und verarbeite alle Dokumente
    const documents = await readAllDocuments();
    log('info', `${documents.length} Dokumente zum Indexieren gefunden`);
    
    if (documents.length === 0) {
      log('warn', `Keine Dokumente im Verzeichnis ${config.documentsDir} gefunden`);
      log('info', 'Bitte legen Sie Dokumente im Verzeichnis ab und führen Sie den Indexer erneut aus');
      return;
    }
    
    // Verarbeite und indexiere jedes Dokument
    for (const doc of documents) {
      log('info', `Verarbeite Dokument: ${doc.filename}`);
      
      try {
        // Extrahiere Text aus Dokument
        const text = await extractTextFromDocument(doc);
        
        if (!text || text.length === 0) {
          log('warn', `Kein Text aus Dokument extrahiert: ${doc.filename}`);
          continue;
        }
        
        log('info', `Text extrahiert (${text.length} Zeichen)`);
        
        // Teile Text in Chunks
        const chunks = createOptimizedChunks(text);
        log('info', `Text in ${chunks.length} Chunks aufgeteilt`);
        
        // Erstelle Embeddings und speichere sie in Qdrant
        await processAndStoreChunks(chunks, doc, embedder);
        
        log('info', `Dokument erfolgreich indexiert: ${doc.filename}`);
      } catch (docError) {
        log('error', `Fehler beim Verarbeiten von Dokument ${doc.filename}:`, docError);
      }
    }
    
    log('info', 'Dokument-Indexierung erfolgreich abgeschlossen');
  } catch (error) {
    log('error', 'Fehler bei der Dokument-Indexierung:', error);
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

// Stelle sicher, dass die Qdrant-Collection existiert
async function ensureCollectionExists() {
  try {
    const collections = await qdrant.getCollections();
    const collectionExists = collections.collections.some(c => c.name === config.collectionName);
    
    if (!collectionExists) {
      log('info', `Erstelle neue Collection: ${config.collectionName}`);
      
      await qdrant.createCollection(config.collectionName, {
        vectors: {
          size: config.dimensions,
          distance: 'Cosine'
        },
        optimizers_config: {
          default_segment_number: 2
        },
        replication_factor: 1
      });
      
      // Erstelle Index für Textsuche
      await qdrant.createPayloadIndex(config.collectionName, {
        field_name: 'content',
        field_schema: 'text',
        index_name: 'content_text_index'
      });
      
      log('info', `Collection ${config.collectionName} erfolgreich erstellt`);
    } else {
      log('info', `Collection ${config.collectionName} existiert bereits`);
    }
  } catch (error) {
    log('error', 'Fehler beim Prüfen/Erstellen der Collection:', error);
    throw error;
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
        if (['.pdf', '.docx', '.txt', '.md', '.html'].includes(extension)) {
          documents.push({
            filename: file,
            path: filePath,
            extension,
            size: stats.size
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

// Verarbeite und speichere Chunks in Qdrant
async function processAndStoreChunks(chunks, doc, embedder) {
  try {
    const points = [];
    let chunkId = 0;
    
    for (const chunk of chunks) {
      // Embedding erstellen
      const embedding = await createEmbedding(chunk, embedder);
      
      // Punkt für Qdrant erstellen
      points.push({
        id: `${Date.now()}_${doc.filename}_${chunkId}`,
        vector: embedding,
        payload: {
          content: chunk,
          documentName: doc.filename,
          pageNumber: estimatePageNumber(chunkId, chunks.length, doc.extension === '.pdf'),
          chunkId: chunkId,
          path: doc.path
        }
      });
      
      chunkId++;
    }
    
    // In Batches von maximal 100 Punkten speichern
    const batchSize = 100;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await qdrant.upsert(config.collectionName, {
        points: batch
      });
      log('info', `Batch von ${batch.length} Chunks gespeichert (${i+1}-${Math.min(i+batchSize, points.length)} von ${points.length})`);
    }
  } catch (error) {
    log('error', 'Fehler beim Verarbeiten und Speichern der Chunks:', error);
    throw error;
  }
}

// Erstelle Embedding für einen Text
async function createEmbedding(text, embedder) {
  try {
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);
    return embedding;
  } catch (error) {
    log('error', 'Fehler beim Erstellen des Embeddings:', error);
    throw error;
  }
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

// Starte das Hauptprogramm
main().catch(error => {
  log('error', 'Unbehandelter Fehler:', error);
  process.exit(1);
});