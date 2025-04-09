const express = require('express');
const router = express.Router();
const modelManager = require('../model-manager');
const fs = require('fs').promises;
const path = require('path');

// Initialize model manager when this module is loaded
modelManager.initialize().catch(err => {
    console.error('Error initializing model manager:', err);
});

// Get system information
router.get('/system-info', async (req, res) => {
    try {
        const recommendations = await modelManager.getModelRecommendations();
        res.json(recommendations);
    } catch (error) {
        console.error('Error getting system info:', error);
        res.status(500).json({ error: 'Failed to get system information', details: error.message });
    }
});

// Get installed models
router.get('/installed', async (req, res) => {
    try {
        const models = await modelManager.getAvailableModels();
        const activeModel = process.env.OLLAMA_MODEL || await modelManager.suggestBestModel();
        
        res.json({
            models,
            activeModel
        });
    } catch (error) {
        console.error('Error getting installed models:', error);
        res.status(500).json({ error: 'Failed to get installed models', details: error.message });
    }
});

// Get model recommendations
router.get('/recommendations', async (req, res) => {
    try {
        // Get model categories
        const modelCategories = modelManager.getModelCategories();
        
        // Get installed models
        const installedModels = await modelManager.getAvailableModels();
        const installedModelNames = installedModels.map(model => model.name);
        
        // Get recommendations
        const recommendations = await modelManager.getModelRecommendations();
        
        // Prepare response
        const recommendedModels = {};
        
        // For each category, filter recommended models
        Object.keys(modelCategories).forEach(category => {
            const categoryModels = modelCategories[category];
            
            // Get models for this category that match our tier and are either installed or available
            const models = categoryModels.map(modelName => {
                // Determine the tier based on model name
                let tier = determineTierForModel(modelName);
                
                // Check if model is already installed
                const isInstalled = installedModelNames.includes(modelName);
                
                return {
                    name: modelName,
                    installed: isInstalled,
                    tier: tier
                };
            });
            
            recommendedModels[category] = models;
        });
        
        res.json({
            recommendedModels,
            systemTier: recommendations.systemTier
        });
    } catch (error) {
        console.error('Error getting model recommendations:', error);
        res.status(500).json({ error: 'Failed to get model recommendations', details: error.message });
    }
});

// Install a model
router.post('/install', async (req, res) => {
    try {
        const { modelName } = req.body;
        
        if (!modelName) {
            return res.status(400).json({ error: 'Model name is required' });
        }
        
        const result = await modelManager.pullModel(modelName);
        res.json(result);
    } catch (error) {
        console.error('Error installing model:', error);
        res.status(500).json({ error: 'Failed to install model', details: error.message });
    }
});

// Activate a model
router.post('/activate', async (req, res) => {
    try {
        const { modelName } = req.body;
        
        if (!modelName) {
            return res.status(400).json({ error: 'Model name is required' });
        }
        
        // Check if model is installed
        const availableModels = await modelManager.getAvailableModels();
        const modelExists = availableModels.some(model => model.name === modelName);
        
        if (!modelExists) {
            return res.status(404).json({ error: `Model ${modelName} is not installed` });
        }
        
        // Update .env file with new model
        await updateEnvFile('OLLAMA_MODEL', modelName);
        
        // Update environment variable for current process
        process.env.OLLAMA_MODEL = modelName;
        
        res.json({
            success: true,
            message: `Modell ${modelName} wurde erfolgreich aktiviert`,
            activeModel: modelName
        });
    } catch (error) {
        console.error('Error activating model:', error);
        res.status(500).json({ error: 'Failed to activate model', details: error.message });
    }
});

// Delete a model
router.post('/delete', async (req, res) => {
    try {
        const { modelName } = req.body;
        
        if (!modelName) {
            return res.status(400).json({ error: 'Model name is required' });
        }
        
        // Check if this is the active model
        if (modelName === process.env.OLLAMA_MODEL) {
            return res.status(400).json({
                error: 'Cannot delete the active model',
                message: 'Das aktive Modell kann nicht gelöscht werden. Bitte aktivieren Sie zuerst ein anderes Modell.'
            });
        }
        
        const result = await modelManager.deleteModel(modelName);
        res.json(result);
    } catch (error) {
        console.error('Error deleting model:', error);
        res.status(500).json({ error: 'Failed to delete model', details: error.message });
    }
});

// Helper function to update .env file
async function updateEnvFile(key, value) {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        
        // Check if .env file exists
        let envContent;
        try {
            envContent = await fs.readFile(envPath, 'utf8');
        } catch (error) {
            // Create .env file if it doesn't exist
            envContent = '';
        }
        
        // Create a RegExp to find the key
        const regex = new RegExp(`^${key}=.*`, 'm');
        
        // Check if key exists
        if (regex.test(envContent)) {
            // Update existing key
            envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
            // Add new key
            envContent += `\n${key}=${value}`;
        }
        
        // Write back to .env file
        await fs.writeFile(envPath, envContent);
        
        return true;
    } catch (error) {
        console.error('Error updating .env file:', error);
        throw error;
    }
}

// Helper function to determine tier for a model
function determineTierForModel(modelName) {
    // Large models (premium tier)
    if (modelName.includes('70b') || modelName.includes('72b') || modelName.includes('large') || 
        modelName.includes('32b') || modelName.includes('65b')) {
        return 'premium';
    }
    
    // Medium models (standard tier)
    if (modelName.includes('13b') || modelName.includes('14b') || modelName.includes('medium') || 
        modelName.includes('qwen2') || modelName.includes('neural-chat') || 
        (!modelName.includes('8b') && !modelName.includes('7b') && !modelName.includes('3b') && 
         !modelName.includes('2b') && (modelName === 'llama3' || modelName === 'mistral'))) {
        return 'standard';
    }
    
    // Small models (basic tier)
    if (modelName.includes('7b') || modelName.includes('8b')) {
        return 'basic';
    }
    
    // Tiny models
    if (modelName.includes('tiny') || modelName.includes('3b') || modelName.includes('2b')) {
        return 'tiny';
    }
    
    // Default to basic
    return 'basic';
}

module.exports = router;