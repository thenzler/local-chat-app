// Import required dependencies
const { QdrantClient } = require('@qdrant/js-client');
const { pipeline } = require('@xenova/transformers');
require('dotenv').config();

/**
 * Eine Wrapper-Klasse für Qdrant mit verbesserter Vektorsuche und Embedding-Unterstützung
 */
class VectorDatabase {
  constructor() {
    // Konfiguration
    this.config = {
      qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
      collectionName: process.env.QDRANT_COLLECTION || 'knowledge-collection',
      embeddingModel: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384  // Standard für all-MiniLM-L6-v2
    };

    // Qdrant-Client initialisieren
    this.client = new QdrantClient({
      url: this.config.qdrantUrl,
    });

    // Embedding-Pipeline (wird lazy initialisiert)
    this.embedder = null;

    // Logging-Funktion
    this.log = function(level, ...args) {
      const timestamp = new Date().toISOString();
      console[level](`[${timestamp}] [${level.toUpperCase()}] [VectorDB]`, ...args);
    };
  }

  /**
   * Initialisiert die VectorDB und stellt sicher, dass die Collection existiert
   */
  async initialize() {
    try {
      this.log('info', 'Initialisiere VectorDB...');
      
      // Prüfen, ob die Collection existiert
      await this.ensureCollectionExists();
      
      // Embedding-Pipeline initialisieren
      await this.getEmbedder();
      
      this.log('info', 'VectorDB erfolgreich initialisiert');
      return true;
    } catch (error) {
      this.log('error', 'Fehler bei der Initialisierung der VectorDB:', error);
      return false;
    }
  }

  /**
   * Stellt sicher, dass die Qdrant-Collection existiert
   */
  async ensureCollectionExists() {
    try {
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(c => c.name === this.config.collectionName);
      
      if (!collectionExists) {
        this.log('info', `Erstelle neue Collection: ${this.config.collectionName}`);
        
        await this.client.createCollection(this.config.collectionName, {
          vectors: {
            size: this.config.dimensions,
            distance: 'Cosine'
          },
          optimizers_config: {
            default_segment_number: 2
          },
          replication_factor: 1
        });
        
        // Erstelle Index für Textsuche
        await this.client.createPayloadIndex(this.config.collectionName, {
          field_name: 'content',
          field_schema: 'text',
          index_name: 'content_text_index'
        });
        
        this.log('info', `Collection ${this.config.collectionName} erfolgreich erstellt`);
      } else {
        this.log('info', `Collection ${this.config.collectionName} existiert bereits`);
      }
      
      return true;
    } catch (error) {
      this.log('error', 'Fehler beim Prüfen/Erstellen der Collection:', error);
      throw error;
    }
  }

  /**
   * Gibt die Embedding-Pipeline zurück oder initialisiert sie, falls noch nicht geschehen
   */
  async getEmbedder() {
    if (!this.embedder) {
      this.log('info', `Lade Embedding-Modell: ${this.config.embeddingModel}`);
      this.embedder = await pipeline('feature-extraction', this.config.embeddingModel);
    }
    
    return this.embedder;
  }

  /**
   * Erzeugt einen Embedding-Vektor für einen Text
   */
  async createEmbedding(text) {
    try {
      const embedder = await this.getEmbedder();
      const output = await embedder(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (error) {
      this.log('error', 'Fehler beim Erstellen des Embeddings:', error);
      throw error;
    }
  }

  /**
   * Speichert Dokumente in der Vektordatenbank
   * @param {Array} documents - Array von Dokumentobjekten mit { content, metadata }
   */
  async storeDocuments(documents) {
    try {
      if (!documents || documents.length === 0) {
        this.log('warn', 'Keine Dokumente zum Speichern angegeben');
        return { success: false, message: 'Keine Dokumente zum Speichern angegeben' };
      }
      
      this.log('info', `Speichere ${documents.length} Dokumente in Vektordatenbank...`);
      
      // Batch-Größe festlegen (Qdrant empfiehlt maximal 100 Vektoren pro Batch)
      const batchSize = 100;
      const batches = [];
      
      // Dokumente in Batches aufteilen
      for (let i = 0; i < documents.length; i += batchSize) {
        batches.push(documents.slice(i, i + batchSize));
      }
      
      let totalStored = 0;
      
      // Jeden Batch verarbeiten
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        this.log('info', `Verarbeite Batch ${i+1}/${batches.length} (${batch.length} Dokumente)`);
        
        const points = [];
        
        // Für jedes Dokument Embedding erstellen und Punkt vorbereiten
        for (const doc of batch) {
          // Erstelle Embedding für den Inhalt
          const embedding = await this.createEmbedding(doc.content);
          
          // Erstelle eindeutige ID
          const id = `doc_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
          
          // Erstelle Punkt für Qdrant
          points.push({
            id: id,
            vector: embedding,
            payload: {
              content: doc.content,
              documentName: doc.metadata?.documentName || 'Unbekanntes Dokument',
              pageNumber: doc.metadata?.pageNumber || 1,
              path: doc.metadata?.path || null,
              timestamp: new Date().toISOString()
            }
          });
        }
        
        // Speichere Batch in Qdrant
        await this.client.upsert(this.config.collectionName, {
          points: points
        });
        
        totalStored += batch.length;
        this.log('info', `${totalStored}/${documents.length} Dokumente gespeichert`);
      }
      
      return { 
        success: true, 
        message: `${totalStored} Dokumente erfolgreich gespeichert`,
        stored: totalStored
      };
    } catch (error) {
      this.log('error', 'Fehler beim Speichern der Dokumente:', error);
      return { 
        success: false, 
        message: `Fehler beim Speichern der Dokumente: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Sucht nach ähnlichen Dokumenten basierend auf einer Suchanfrage
   * @param {string} query - Suchanfrage
   * @param {Object} options - Suchoptionen (limit, minScore, useSemanticSearch)
   */
  async search(query, options = {}) {
    try {
      const limit = options.limit || 10;
      const minScore = options.minScore || 0.2;
      const useSemanticSearch = options.useSemanticSearch !== false;
      
      this.log('info', `Suche nach: "${query}" (Semantische Suche: ${useSemanticSearch ? 'ja' : 'nein'})`);
      
      let searchResults;
      
      if (useSemanticSearch) {
        // Semantische Suche: Embedding der Anfrage erstellen und nach Vektorähnlichkeit suchen
        const queryEmbedding = await this.createEmbedding(query);
        
        searchResults = await this.client.search(this.config.collectionName, {
          vector: queryEmbedding,
          limit: limit,
          score_threshold: minScore
        });
      } else {
        // Fallback: Keyword-basierte Suche
        const keywords = query.split(/\s+/).filter(word => word.length > 2);
        
        if (keywords.length === 0) {
          this.log('warn', 'Keine gültigen Schlüsselwörter in der Anfrage');
          return { results: [], count: 0 };
        }
        
        // Keyword-Filter erstellen
        searchResults = await this.client.search(this.config.collectionName, {
          filter: {
            must: [
              {
                should: keywords.map(word => ({
                  key: 'content',
                  match: { text: word }
                }))
              }
            ]
          },
          limit: limit
        });
      }
      
      // Ergebnisse verarbeiten
      const results = searchResults.map(result => ({
        content: result.payload.content,
        documentName: result.payload.documentName,
        pageNumber: result.payload.pageNumber,
        score: result.score
      }));
      
      this.log('info', `${results.length} Suchergebnisse gefunden`);
      
      return {
        results,
        count: results.length
      };
    } catch (error) {
      this.log('error', 'Fehler bei der Suche:', error);
      throw error;
    }
  }

  /**
   * Löscht die gesamte Sammlung und erstellt sie neu (für die Neuindexierung)
   */
  async resetCollection() {
    try {
      this.log('info', `Setze Collection ${this.config.collectionName} zurück...`);
      
      // Prüfen, ob die Collection existiert
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(c => c.name === this.config.collectionName);
      
      if (collectionExists) {
        // Collection löschen
        await this.client.deleteCollection(this.config.collectionName);
        this.log('info', `Collection ${this.config.collectionName} gelöscht`);
      }
      
      // Collection neu erstellen
      await this.ensureCollectionExists();
      
      return {
        success: true,
        message: `Collection ${this.config.collectionName} erfolgreich zurückgesetzt`
      };
    } catch (error) {
      this.log('error', 'Fehler beim Zurücksetzen der Collection:', error);
      return {
        success: false,
        message: `Fehler beim Zurücksetzen der Collection: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Gibt Statistiken zur Collection zurück
   */
  async getStats() {
    try {
      this.log('info', `Rufe Statistiken für Collection ${this.config.collectionName} ab...`);
      
      // Prüfen, ob die Collection existiert
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(c => c.name === this.config.collectionName);
      
      if (!collectionExists) {
        return {
          exists: false,
          count: 0,
          message: `Collection ${this.config.collectionName} existiert nicht`
        };
      }
      
      // Collection-Info abrufen
      const collectionInfo = await this.client.getCollection(this.config.collectionName);
      
      // Vektoren zählen
      const countResult = await this.client.count(this.config.collectionName, {});
      
      return {
        exists: true,
        count: countResult.count,
        dimensions: collectionInfo.config.params.vectors.size,
        model: this.config.embeddingModel,
        createdAt: new Date().toISOString() // Qdrant liefert kein Erstellungsdatum
      };
    } catch (error) {
      this.log('error', 'Fehler beim Abrufen der Statistiken:', error);
      return {
        exists: false,
        count: 0,
        error: error.message
      };
    }
  }
}

// Exportiere eine singleton-Instanz
const vectorDB = new VectorDatabase();
module.exports = vectorDB;