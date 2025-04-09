// Import required dependencies
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { Ollama } = require('node-ollama');
const util = require('util');
const execPromise = util.promisify(exec);

// Configure logger
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

// Model performance guidelines - estimates based on typical hardware requirements
const modelPerformanceProfiles = {
  'tiny': {
    ram: '4GB',
    recommendedModels: ['tinyllama', 'orca-mini:3b', 'gemma:2b', 'phi:2.7b'],
    description: 'Sehr leichtgewichtige Modelle, die auf fast jedem Computer funktionieren, aber mit begrenzten Fähigkeiten.'
  },
  'basic': {
    ram: '8GB',
    recommendedModels: ['mistral:7b', 'gemma:7b', 'llama3:8b', 'phi3:14b-mini'],
    description: 'Gute Balance zwischen Leistung und Ressourcenverbrauch, geeignet für die meisten Anwendungsfälle.'
  },
  'standard': {
    ram: '16GB',
    recommendedModels: ['llama3', 'mistral-medium', 'qwen2:7b', 'neural-chat:7b'],
    description: 'Leistungsstarke Modelle mit guter Allroundleistung und hoher Qualität.'
  },
  'premium': {
    ram: '24GB+',
    recommendedModels: ['llama3:70b', 'deepseek-r1-qwen-32b', 'qwen2:72b', 'mistral-large'],
    description: 'Hochleistungsmodelle für anspruchsvolle Aufgaben, benötigen erhebliche Ressourcen.'
  }
};

// Model categories for different use cases
const modelCategories = {
  'general': ['llama3', 'mistral', 'qwen2', 'yi'],
  'coding': ['codellama', 'deepseek-coder', 'qwen2-coder', 'phi3'],
  'german': ['llama3:8b-instruct-de', 'orca-mini:3b-de', 'mistral-de'],
  'small': ['tinyllama', 'phi:2.7b', 'gemma:2b', 'orca-mini:3b']
};

// Model Manager class
class ModelManager {
  constructor() {
    this.availableModels = [];
    this.recommendedModel = null;
    this.systemInfo = null;
  }

  // Initialize the model manager
  async initialize() {
    try {
      log('info', 'Initialisiere Model Manager...');
      
      // Get system information
      await this.detectSystemSpecs();
      
      // Get available models
      await this.refreshAvailableModels();
      
      // Determine best model based on system capabilities
      this.recommendedModel = await this.suggestBestModel();
      
      log('info', `Model Manager initialisiert. Empfohlenes Modell: ${this.recommendedModel}`);
      return true;
    } catch (error) {
      log('error', 'Fehler bei der Initialisierung des Model Managers:', error);
      return false;
    }
  }

  // Refresh the list of available models
  async refreshAvailableModels() {
    try {
      log('debug', 'Aktualisiere verfügbare Modelle...');
      
      const models = await ollama.list();
      this.availableModels = models.models || [];
      
      log('info', `${this.availableModels.length} Modelle gefunden`);
      return this.availableModels;
    } catch (error) {
      log('error', 'Fehler beim Abrufen der verfügbaren Modelle:', error);
      this.availableModels = [];
      return [];
    }
  }

  // Get available models
  async getAvailableModels() {
    if (this.availableModels.length === 0) {
      await this.refreshAvailableModels();
    }
    return this.availableModels;
  }

  // Get model information
  async getModelInfo(modelName) {
    try {
      const availableModels = await this.getAvailableModels();
      return availableModels.find(model => model.name === modelName);
    } catch (error) {
      log('error', `Fehler beim Abrufen von Informationen für Modell ${modelName}:`, error);
      return null;
    }
  }

  // Pull a model from Ollama
  async pullModel(modelName) {
    try {
      log('info', `Lade Modell herunter: ${modelName}`);
      
      // Check if model is already available
      const availableModels = await this.getAvailableModels();
      const modelExists = availableModels.some(model => model.name === modelName);
      
      if (modelExists) {
        log('info', `Modell ${modelName} ist bereits verfügbar`);
        return { success: true, message: `Modell ${modelName} ist bereits verfügbar` };
      }
      
      // Pull the model - this is a background operation
      // We'll use the exec method to run it as a separate process
      const command = `ollama pull ${modelName}`;
      
      log('info', `Starte Download im Hintergrund: ${command}`);
      
      // Execute the command
      exec(command, (error, stdout, stderr) => {
        if (error) {
          log('error', `Fehler beim Herunterladen des Modells ${modelName}:`, error);
          return;
        }
        
        log('info', `Modell ${modelName} erfolgreich heruntergeladen`);
        
        // Refresh available models
        this.refreshAvailableModels().catch(err => {
          log('error', 'Fehler beim Aktualisieren der verfügbaren Modelle:', err);
        });
      });
      
      return { 
        success: true, 
        message: `Download für Modell ${modelName} gestartet. Dies kann einige Minuten dauern.`
      };
    } catch (error) {
      log('error', `Fehler beim Herunterladen des Modells ${modelName}:`, error);
      return { 
        success: false, 
        message: `Fehler beim Herunterladen des Modells ${modelName}: ${error.message}`
      };
    }
  }

  // Delete a model
  async deleteModel(modelName) {
    try {
      log('info', `Lösche Modell: ${modelName}`);
      
      // Check if model exists
      const availableModels = await this.getAvailableModels();
      const modelExists = availableModels.some(model => model.name === modelName);
      
      if (!modelExists) {
        return { 
          success: false, 
          message: `Modell ${modelName} ist nicht verfügbar`
        };
      }
      
      // Delete the model
      await execPromise(`ollama rm ${modelName}`);
      
      // Refresh available models
      await this.refreshAvailableModels();
      
      return { 
        success: true, 
        message: `Modell ${modelName} erfolgreich gelöscht`
      };
    } catch (error) {
      log('error', `Fehler beim Löschen des Modells ${modelName}:`, error);
      return { 
        success: false, 
        message: `Fehler beim Löschen des Modells ${modelName}: ${error.message}`
      };
    }
  }

  // Get model recommendations based on system specs
  async getModelRecommendations() {
    try {
      if (!this.systemInfo) {
        await this.detectSystemSpecs();
      }
      
      // Determine performance tier based on available RAM
      let tier = 'tiny';
      const ramGB = this.systemInfo.totalMemoryGB;
      
      if (ramGB >= 24) {
        tier = 'premium';
      } else if (ramGB >= 16) {
        tier = 'standard';
      } else if (ramGB >= 8) {
        tier = 'basic';
      }
      
      const profile = modelPerformanceProfiles[tier];
      
      // Check which recommended models are available or can be downloaded
      const installedModels = await this.getAvailableModels();
      const installedModelNames = installedModels.map(model => model.name);
      
      // Find models that match our tier and are either installed or available
      const recommendedModels = profile.recommendedModels.map(modelName => {
        const isInstalled = installedModelNames.includes(modelName);
        return {
          name: modelName,
          installed: isInstalled,
          tier: tier
        };
      });
      
      return {
        systemTier: tier,
        tierDescription: profile.description,
        systemInfo: this.systemInfo,
        recommendedModels: recommendedModels
      };
    } catch (error) {
      log('error', 'Fehler beim Abrufen der Modellempfehlungen:', error);
      return {
        systemTier: 'unknown',
        tierDescription: 'Konnte Systemspezifikationen nicht ermitteln',
        systemInfo: null,
        recommendedModels: []
      };
    }
  }

  // Suggest the best model based on system specs and available models
  async suggestBestModel() {
    try {
      const recommendations = await this.getModelRecommendations();
      const installedModels = await this.getAvailableModels();
      
      // Prefer installed models first
      const installedRecommendations = recommendations.recommendedModels.filter(model => 
        installedModels.some(installed => installed.name === model.name)
      );
      
      if (installedRecommendations.length > 0) {
        // Return the first installed recommended model
        return installedRecommendations[0].name;
      }
      
      // If no recommended models are installed, check if any model is installed
      if (installedModels.length > 0) {
        // Return the first installed model
        return installedModels[0].name;
      }
      
      // If no models are installed, return the first recommended model for their tier
      if (recommendations.recommendedModels.length > 0) {
        return recommendations.recommendedModels[0].name;
      }
      
      // Fallback to a basic model
      return 'mistral';
    } catch (error) {
      log('error', 'Fehler bei der Bestimmung des besten Modells:', error);
      return 'mistral'; // Default fallback
    }
  }

  // Detect system specifications
  async detectSystemSpecs() {
    try {
      log('debug', 'Ermittle Systemspezifikationen...');
      
      let totalMemoryGB = 8; // Default fallback
      let cpuCores = 4;
      let hasGPU = false;
      let gpuInfo = null;
      
      // Get total memory
      try {
        const { stdout: memInfo } = await execPromise('free -b');
        const memoryMatch = memInfo.match(/^Mem:\s+(\d+)/m);
        if (memoryMatch && memoryMatch[1]) {
          const totalMemoryBytes = parseInt(memoryMatch[1]);
          totalMemoryGB = Math.round(totalMemoryBytes / (1024 * 1024 * 1024));
        }
      } catch (memError) {
        log('warn', 'Konnte Speicherinformationen nicht abrufen:', memError);
        
        // Try alternative method for Windows
        try {
          const { stdout: windowsMemInfo } = await execPromise('wmic OS get TotalVisibleMemorySize /Value');
          const memoryMatch = windowsMemInfo.match(/TotalVisibleMemorySize=(\d+)/);
          if (memoryMatch && memoryMatch[1]) {
            const totalMemoryKB = parseInt(memoryMatch[1]);
            totalMemoryGB = Math.round(totalMemoryKB / (1024 * 1024));
          }
        } catch (windowsMemError) {
          log('warn', 'Konnte Windows-Speicherinformationen nicht abrufen:', windowsMemError);
        }
      }
      
      // Get CPU cores
      try {
        const { stdout: cpuInfo } = await execPromise('nproc');
        cpuCores = parseInt(cpuInfo.trim());
      } catch (cpuError) {
        log('warn', 'Konnte CPU-Informationen nicht abrufen:', cpuError);
        
        // Try alternative method for Windows
        try {
          const { stdout: windowsCpuInfo } = await execPromise('wmic cpu get NumberOfCores');
          const cpuMatch = windowsCpuInfo.match(/NumberOfCores\s+(\d+)/);
          if (cpuMatch && cpuMatch[1]) {
            cpuCores = parseInt(cpuMatch[1]);
          }
        } catch (windowsCpuError) {
          log('warn', 'Konnte Windows-CPU-Informationen nicht abrufen:', windowsCpuError);
        }
      }
      
      // Check for GPU (NVIDIA)
      try {
        const { stdout: gpuInfo } = await execPromise('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader');
        if (gpuInfo && gpuInfo.trim()) {
          hasGPU = true;
          gpuInfo = gpuInfo.trim();
        }
      } catch (gpuError) {
        // Try AMD GPU
        try {
          const { stdout: amdGpuInfo } = await execPromise('rocm-smi --showproductname');
          if (amdGpuInfo && amdGpuInfo.includes('GPU')) {
            hasGPU = true;
            gpuInfo = amdGpuInfo.trim();
          }
        } catch (amdGpuError) {
          log('debug', 'Keine GPU erkannt oder GPU-Tools nicht installiert');
        }
      }
      
      this.systemInfo = {
        totalMemoryGB,
        cpuCores,
        hasGPU,
        gpuInfo
      };
      
      log('info', 'Systemspezifikationen:', this.systemInfo);
      return this.systemInfo;
    } catch (error) {
      log('error', 'Fehler beim Ermitteln der Systemspezifikationen:', error);
      
      // Set default values
      this.systemInfo = {
        totalMemoryGB: 8,
        cpuCores: 4,
        hasGPU: false,
        gpuInfo: null
      };
      
      return this.systemInfo;
    }
  }

  // Get model categories
  getModelCategories() {
    return modelCategories;
  }

  // Get performance profiles
  getPerformanceProfiles() {
    return modelPerformanceProfiles;
  }
}

module.exports = new ModelManager();
