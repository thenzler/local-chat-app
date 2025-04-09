document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const systemInfoContainer = document.getElementById('system-info');
    const installedModelsContainer = document.getElementById('installed-models');
    const recommendedModelsContainer = document.getElementById('recommended-models');
    const refreshModelsButton = document.getElementById('refresh-models');
    const tabButtons = document.querySelectorAll('.tab-button');
    const modalElement = document.getElementById('model-action-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modelNameSpan = document.getElementById('model-name');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const closeModalButton = document.getElementById('close-modal');
    const cancelActionButton = document.getElementById('cancel-action');
    const confirmActionButton = document.getElementById('confirm-action');

    // State
    const state = {
        installedModels: [],
        recommendedModels: {},
        systemInfo: null,
        currentCategory: 'general',
        activeModel: null,
        modalAction: null,
        modalModelName: null
    };

    // Initialize
    function init() {
        loadSystemInfo();
        loadInstalledModels();
        setupEventListeners();
    }

    // Setup event listeners
    function setupEventListeners() {
        // Refresh models button
        refreshModelsButton.addEventListener('click', () => {
            loadInstalledModels(true);
        });

        // Tab buttons
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const category = button.dataset.category;
                switchCategory(category);
            });
        });

        // Modal close button
        closeModalButton.addEventListener('click', closeModal);
        
        // Cancel button
        cancelActionButton.addEventListener('click', closeModal);
        
        // Confirm action button
        confirmActionButton.addEventListener('click', performModelAction);
    }

    // Load system information
    async function loadSystemInfo() {
        try {
            const response = await fetch('/api/models/system-info');
            
            if (!response.ok) {
                throw new Error(`Server responded with status ${response.status}`);
            }
            
            const data = await response.json();
            state.systemInfo = data;
            
            renderSystemInfo(data);
        } catch (error) {
            console.error('Error loading system info:', error);
            systemInfoContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Fehler beim Laden der Systemdaten. Bitte versuchen Sie es später erneut.</p>
                </div>
            `;
        }
    }

    // Load installed models
    async function loadInstalledModels(isRefresh = false) {
        try {
            if (isRefresh) {
                installedModelsContainer.innerHTML = `
                    <div class="loading-indicator">
                        <div class="spinner"></div>
                        <span>Aktualisiere Modelle...</span>
                    </div>
                `;
            }
            
            const response = await fetch('/api/models/installed');
            
            if (!response.ok) {
                throw new Error(`Server responded with status ${response.status}`);
            }
            
            const data = await response.json();
            state.installedModels = data.models;
            state.activeModel = data.activeModel;
            
            renderInstalledModels(data.models, data.activeModel);
            
            // After loading installed models, load recommended models
            loadRecommendedModels();
        } catch (error) {
            console.error('Error loading installed models:', error);
            installedModelsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Fehler beim Laden der installierten Modelle. Bitte versuchen Sie es später erneut.</p>
                </div>
            `;
        }
    }

    // Load recommended models
    async function loadRecommendedModels() {
        try {
            recommendedModelsContainer.innerHTML = `
                <div class="loading-indicator">
                    <div class="spinner"></div>
                    <span>Lade Modellempfehlungen...</span>
                </div>
            `;
            
            const response = await fetch('/api/models/recommendations');
            
            if (!response.ok) {
                throw new Error(`Server responded with status ${response.status}`);
            }
            
            const data = await response.json();
            state.recommendedModels = data.recommendedModels;
            
            renderRecommendedModels(state.recommendedModels[state.currentCategory] || []);
        } catch (error) {
            console.error('Error loading recommended models:', error);
            recommendedModelsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Fehler beim Laden der Modellempfehlungen. Bitte versuchen Sie es später erneut.</p>
                </div>
            `;
        }
    }

    // Render system information
    function renderSystemInfo(data) {
        const { systemTier, tierDescription, systemInfo } = data;
        
        let html = `
            <div class="system-tier">
                <div>
                    <span class="tier-badge">${getTierName(systemTier)}</span>
                    <span class="tier-description">${tierDescription}</span>
                </div>
            </div>
        `;
        
        // Memory
        html += `
            <div class="system-info-card">
                <div class="system-info-title">Arbeitsspeicher</div>
                <div class="system-info-value">${systemInfo.totalMemoryGB} GB</div>
            </div>
        `;
        
        // CPU
        html += `
            <div class="system-info-card">
                <div class="system-info-title">CPU Kerne</div>
                <div class="system-info-value">${systemInfo.cpuCores}</div>
            </div>
        `;
        
        // GPU
        html += `
            <div class="system-info-card">
                <div class="system-info-title">GPU</div>
                <div class="system-info-value">${systemInfo.hasGPU ? systemInfo.gpuInfo || 'Verfügbar' : 'Nicht verfügbar'}</div>
            </div>
        `;
        
        systemInfoContainer.innerHTML = html;
    }

    // Render installed models
    function renderInstalledModels(models, activeModel) {
        if (!models || models.length === 0) {
            installedModelsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-database"></i>
                    <p>Keine Modelle installiert. Installieren Sie ein Modell aus den Empfehlungen.</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        models.forEach(model => {
            const isActive = model.name === activeModel;
            
            html += `
                <div class="model-card installed">
                    ${isActive ? '<span class="model-badge active">Aktiv</span>' : ''}
                    <div class="model-name">${model.name}</div>
                    <div class="model-info">
                        <div class="model-size">
                            <i class="fas fa-hdd"></i>
                            ${formatSize(model.size)}
                        </div>
                        <div class="model-date">
                            <i class="fas fa-calendar-alt"></i>
                            ${formatDate(model.modified)}
                        </div>
                    </div>
                    <div class="model-actions">
                        ${!isActive ? `
                            <button class="action-button" data-action="activate" data-model="${model.name}">
                                <i class="fas fa-check-circle"></i>
                                Aktivieren
                            </button>
                        ` : ''}
                        <button class="action-button danger" data-action="delete" data-model="${model.name}">
                            <i class="fas fa-trash-alt"></i>
                            Löschen
                        </button>
                    </div>
                </div>
            `;
        });
        
        installedModelsContainer.innerHTML = html;
        
        // Add event listeners to action buttons
        const actionButtons = installedModelsContainer.querySelectorAll('.action-button');
        actionButtons.forEach(button => {
            button.addEventListener('click', handleModelAction);
        });
    }

    // Render recommended models
    function renderRecommendedModels(models) {
        if (!models || models.length === 0) {
            recommendedModelsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-robot"></i>
                    <p>Keine Modellempfehlungen verfügbar für diese Kategorie.</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        models.forEach(model => {
            const isInstalled = state.installedModels.some(m => m.name === model.name);
            
            html += `
                <div class="model-card ${isInstalled ? 'installed' : 'recommended'}">
                    <span class="model-badge tier">${getTierName(model.tier)}</span>
                    <div class="model-name">${model.name}</div>
                    <div class="model-description">${getModelDescription(model.name)}</div>
                    <div class="model-actions">
                        ${!isInstalled ? `
                            <button class="action-button" data-action="install" data-model="${model.name}">
                                <i class="fas fa-download"></i>
                                Installieren
                            </button>
                        ` : `
                            <button class="action-button secondary" disabled>
                                <i class="fas fa-check"></i>
                                Installiert
                            </button>
                        `}
                    </div>
                </div>
            `;
        });
        
        recommendedModelsContainer.innerHTML = html;
        
        // Add event listeners to action buttons
        const actionButtons = recommendedModelsContainer.querySelectorAll('.action-button:not([disabled])');
        actionButtons.forEach(button => {
            button.addEventListener('click', handleModelAction);
        });
    }

    // Switch tab category
    function switchCategory(category) {
        // Update active tab button
        tabButtons.forEach(button => {
            if (button.dataset.category === category) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
        
        // Update state
        state.currentCategory = category;
        
        // Render models for the selected category
        if (state.recommendedModels[category]) {
            renderRecommendedModels(state.recommendedModels[category]);
        } else {
            // If we don't have data for this category yet, show loading state
            recommendedModelsContainer.innerHTML = `
                <div class="loading-indicator">
                    <div class="spinner"></div>
                    <span>Lade Modellempfehlungen...</span>
                </div>
            `;
            
            // Load recommendations for this category
            loadRecommendedModels();
        }
    }

    // Handle model action (install, activate, delete)
    function handleModelAction(event) {
        const button = event.currentTarget;
        const action = button.dataset.action;
        const modelName = button.dataset.model;
        
        // Set modal state
        state.modalAction = action;
        state.modalModelName = modelName;
        
        // Update modal content based on action
        switch (action) {
            case 'install':
                modalTitle.textContent = 'Modell installieren';
                modalMessage.innerHTML = `Möchten Sie das Modell <strong>${modelName}</strong> installieren? 
                    Dies kann je nach Modellgröße und Ihrer Internetverbindung mehrere Minuten dauern.`;
                confirmActionButton.textContent = 'Installieren';
                break;
                
            case 'activate':
                modalTitle.textContent = 'Modell aktivieren';
                modalMessage.innerHTML = `Möchten Sie das Modell <strong>${modelName}</strong> als Standard-Modell aktivieren?`;
                confirmActionButton.textContent = 'Aktivieren';
                break;
                
            case 'delete':
                modalTitle.textContent = 'Modell löschen';
                modalMessage.innerHTML = `Möchten Sie das Modell <strong>${modelName}</strong> wirklich löschen? 
                    Dies kann nicht rückgängig gemacht werden.`;
                confirmActionButton.textContent = 'Löschen';
                confirmActionButton.classList.add('danger');
                break;
        }
        
        // Show modal
        modelNameSpan.textContent = modelName;
        progressContainer.classList.add('hidden');
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        
        modalElement.classList.add('visible');
    }

    // Perform the selected model action
    async function performModelAction() {
        const { modalAction, modalModelName } = state;
        
        if (!modalAction || !modalModelName) {
            closeModal();
            return;
        }
        
        // Disable buttons
        confirmActionButton.disabled = true;
        cancelActionButton.disabled = true;
        
        // Show progress for install
        if (modalAction === 'install') {
            progressContainer.classList.remove('hidden');
            simulateProgress();
        }
        
        try {
            const endpoint = `/api/models/${modalAction}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ modelName: modalModelName })
            });
            
            if (!response.ok) {
                throw new Error(`Server responded with status ${response.status}`);
            }
            
            const data = await response.json();
            
            // Close modal after some delay to show completion
            setTimeout(() => {
                closeModal();
                
                // Refresh models list
                loadInstalledModels(true);
                
                // Show success message
                showNotification(data.message, 'success');
            }, modalAction === 'install' ? 1000 : 500);
        } catch (error) {
            console.error(`Error during model ${modalAction}:`, error);
            
            // Show error in modal
            progressContainer.classList.add('hidden');
            modalMessage.innerHTML = `<span style="color: var(--error-color);">
                <i class="fas fa-exclamation-triangle"></i> 
                Fehler: ${error.message}
            </span>`;
            
            // Re-enable cancel button
            cancelActionButton.disabled = false;
            
            // Show error notification
            showNotification(`Fehler beim ${getActionText(modalAction)} des Modells: ${error.message}`, 'error');
        }
    }

    // Simulate progress for model installation
    function simulateProgress() {
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 2;
            
            if (progress >= 95) {
                clearInterval(interval);
                progress = 95;
            }
            
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${Math.round(progress)}%`;
        }, 500);
        
        // Store interval in state so we can clear it
        state.progressInterval = interval;
    }

    // Close the modal
    function closeModal() {
        modalElement.classList.remove('visible');
        
        // Clear progress interval if it exists
        if (state.progressInterval) {
            clearInterval(state.progressInterval);
            state.progressInterval = null;
        }
        
        // Reset button state
        confirmActionButton.disabled = false;
        cancelActionButton.disabled = false;
        confirmActionButton.classList.remove('danger');
        
        // Clear state
        state.modalAction = null;
        state.modalModelName = null;
    }

    // Show notification
    function showNotification(message, type = 'info') {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('notification');
        
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.className = 'notification';
            document.body.appendChild(notification);
            
            // Add styles if they don't exist
            if (!document.getElementById('notification-styles')) {
                const style = document.createElement('style');
                style.id = 'notification-styles';
                style.textContent = `
                    .notification {
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        max-width: 400px;
                        padding: 1rem;
                        border-radius: var(--border-radius);
                        background-color: var(--chat-bg);
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                        z-index: 1001;
                        transform: translateY(100px);
                        opacity: 0;
                        transition: transform 0.3s ease, opacity 0.3s ease;
                    }
                    .notification.visible {
                        transform: translateY(0);
                        opacity: 1;
                    }
                    .notification.success {
                        border-left: 4px solid var(--success-color);
                    }
                    .notification.error {
                        border-left: 4px solid var(--error-color);
                    }
                    .notification.info {
                        border-left: 4px solid var(--primary-color);
                    }
                    .notification.warning {
                        border-left: 4px solid var(--warning-color);
                    }
                `;
                document.head.appendChild(style);
            }
        }
        
        // Set notification content and type
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${getNotificationIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;
        notification.className = `notification ${type}`;
        
        // Show notification
        setTimeout(() => {
            notification.classList.add('visible');
        }, 10);
        
        // Hide notification after some time
        setTimeout(() => {
            notification.classList.remove('visible');
            
            // Remove notification after animation
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 5000);
    }

    // Helper functions
    function formatSize(sizeInBytes) {
        if (!sizeInBytes) return 'Unbekannt';
        
        const KB = 1024;
        const MB = KB * 1024;
        const GB = MB * 1024;
        
        if (sizeInBytes >= GB) {
            return `${(sizeInBytes / GB).toFixed(2)} GB`;
        } else if (sizeInBytes >= MB) {
            return `${(sizeInBytes / MB).toFixed(2)} MB`;
        } else if (sizeInBytes >= KB) {
            return `${(sizeInBytes / KB).toFixed(2)} KB`;
        } else {
            return `${sizeInBytes} B`;
        }
    }

    function formatDate(dateString) {
        if (!dateString) return 'Unbekannt';
        
        const date = new Date(dateString);
        return date.toLocaleDateString('de-DE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    function getTierName(tier) {
        switch (tier) {
            case 'tiny': return 'Mini';
            case 'basic': return 'Basic';
            case 'standard': return 'Standard';
            case 'premium': return 'Premium';
            default: return tier;
        }
    }

    function getModelDescription(modelName) {
        const descriptions = {
            'mistral': 'Ausgewogenes Modell mit guter Leistung und Vielseitigkeit, ideal für allgemeine Anwendungen.',
            'llama3': 'Offenes LLM von Meta mit hervorragender Leistung für zahlreiche Aufgaben.',
            'llama3:8b': 'Kompakte Version von Llama 3 mit guter Leistung bei geringerem Ressourcenbedarf.',
            'qwen2': 'Effizientes und leistungsstarkes Modell von Alibaba mit umfassenden multilingualen Fähigkeiten.',
            'qwen2-coder': 'Auf Programmierung spezialisiertes Modell mit verbesserter Code-Generierung und -Verständnis.',
            'tinyllama': 'Extrem ressourcensparendes Modell für Geräte mit begrenztem Speicher.',
            'phi3:14b-mini': 'Von Microsoft entwickeltes Modell mit fortschrittlichen Reasoning-Fähigkeiten.',
            'gemma:7b': 'Von Google veröffentlichtes leichtgewichtiges Modell mit guter Allround-Leistung.',
            'gemma:2b': 'Ultra-kompaktes Modell für Geräte mit sehr begrenzten Ressourcen.',
            'orca-mini:3b-de': 'Kleineres Modell mit speziellem Training für die deutsche Sprache.',
            'mistral-de': 'Deutsche Version des Mistral-Modells mit optimierter Leistung für deutsche Texte.',
            'neural-chat:7b': 'Konversationsmodell mit natürlichem Dialogverhalten und guter Kontexterfassung.',
            'codellama': 'Speziell auf die Erzeugung und Analyse von Quellcode trainiertes Modell.',
            'deepseek-coder': 'Hochspezialisiertes Coding-Modell mit Unterstützung für zahlreiche Programmiersprachen.',
            'yi': 'Leistungsstarkes Foundation Model mit breitem Wissen und guter Multilingualität.',
            'mistral-medium': 'Mittelgroßes Mistral-Modell mit verbesserter Leistung und Kontextlänge.',
            'llama3:70b': 'Größtes Llama 3 Modell mit überragender Leistung, benötigt entsprechende Hardware.',
            'deepseek-r1-qwen-32b': 'Hochentwickeltes Reasoning-Modell mit fortschrittlicher Problemlösungsfähigkeit.',
            'qwen2:72b': 'Größtes Qwen2-Modell mit herausragender Leistung in vielen Bereichen.',
            'mistral-large': 'Leistungsstärkstes Mistral-Modell mit hervorragender Kontexterkennung und Reasoning.'
        };
        
        return descriptions[modelName] || 'Ein KI-Sprachmodell für die lokale Ausführung.';
    }

    function getActionText(action) {
        switch (action) {
            case 'install': return 'Installieren';
            case 'activate': return 'Aktivieren';
            case 'delete': return 'Löschen';
            default: return action;
        }
    }

    function getNotificationIcon(type) {
        switch (type) {
            case 'success': return 'check-circle';
            case 'error': return 'exclamation-circle';
            case 'warning': return 'exclamation-triangle';
            case 'info':
            default: return 'info-circle';
        }
    }

    // Initialize
    init();
});