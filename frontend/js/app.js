document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const statusMessage = document.getElementById('status-message');
    const sourcesPanel = document.getElementById('sources-panel');
    const sourcesList = document.getElementById('sources-list');
    const closeSourcesButton = document.getElementById('close-sources');
    const ollamaStatus = document.getElementById('ollama-status');
    const qdrantStatus = document.getElementById('qdrant-status');

    // Chat state
    const chatState = {
        messages: [],
        isWaitingForResponse: false,
        currentSources: [],
        ollamaOnline: false,
        qdrantOnline: false
    };

    // Initialize the chat
    function initChat() {
        checkSystemStatus();
        setupEventListeners();
        autoResizeInput();
        loadChatHistory();
    }

    // Check if Ollama and Qdrant are running
    async function checkSystemStatus() {
        updateStatusMessage('Prüfe Systemstatus...');
        
        try {
            // Check Ollama status
            const ollamaResponse = await fetch('/api/check-ollama');
            const ollamaData = await ollamaResponse.json();
            
            if (ollamaResponse.ok) {
                chatState.ollamaOnline = true;
                updateStatusElement(ollamaStatus, 'online', `Ollama (${ollamaData.recommended})`);
                console.log('Verfügbare Ollama-Modelle:', ollamaData.models);
            } else {
                chatState.ollamaOnline = false;
                updateStatusElement(ollamaStatus, 'offline', 'Ollama (offline)');
                updateStatusMessage('Ollama ist nicht erreichbar. Bitte starten Sie den Dienst.');
            }
            
            // Check Qdrant status
            const qdrantResponse = await fetch('/api/check-qdrant');
            const qdrantData = await qdrantResponse.json();
            
            if (qdrantResponse.ok) {
                chatState.qdrantOnline = true;
                updateStatusElement(qdrantStatus, 'online', 'Qdrant');
                
                if (!qdrantData.collectionExists) {
                    updateStatusMessage('Qdrant ist erreichbar, aber keine Dokumente indexiert. Bitte indexieren Sie Dokumente.');
                }
            } else {
                chatState.qdrantOnline = false;
                updateStatusElement(qdrantStatus, 'offline', 'Qdrant (offline)');
                updateStatusMessage('Qdrant ist nicht erreichbar. Bitte starten Sie den Dienst.');
            }
            
            // If both systems are online
            if (chatState.ollamaOnline && chatState.qdrantOnline) {
                if (qdrantData && qdrantData.collectionExists) {
                    updateStatusMessage('Systeme sind bereit. Sie können jetzt chatten!', 3000);
                }
            }
        } catch (error) {
            console.error('Fehler beim Prüfen des Systemstatus:', error);
            updateStatusMessage('Fehler beim Verbinden mit den Servern. Bitte überprüfen Sie, ob der Backend-Server läuft.');
            updateStatusElement(ollamaStatus, 'offline');
            updateStatusElement(qdrantStatus, 'offline');
        }
    }

    // Set up event listeners
    function setupEventListeners() {
        // Send message when the send button is clicked
        sendButton.addEventListener('click', sendMessage);
        
        // Send message when Enter is pressed (without Shift)
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // Auto-resize input as user types
        chatInput.addEventListener('input', autoResizeInput);
        
        // Close sources panel
        closeSourcesButton.addEventListener('click', () => {
            sourcesPanel.classList.remove('open');
        });
    }

    // Auto-resize textarea based on content
    function autoResizeInput() {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
    }

    // Send a message to the server
    async function sendMessage() {
        const message = chatInput.value.trim();
        
        if (message === '' || chatState.isWaitingForResponse) {
            return;
        }
        
        // Add user message to chat
        addMessageToChat('user', message);
        
        // Clear input and reset height
        chatInput.value = '';
        chatInput.style.height = 'auto';
        
        // Save chat history
        saveChatHistory();
        
        // Show typing indicator
        showTypingIndicator();
        
        try {
            chatState.isWaitingForResponse = true;
            sendButton.disabled = true;
            
            // Send message to server
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message })
            });
            
            if (!response.ok) {
                throw new Error(`Server responded with status ${response.status}`);
            }
            
            const data = await response.json();
            
            // Hide typing indicator
            hideTypingIndicator();
            
            // Add bot message to chat
            addMessageToChat('bot', data.reply, data.sources);
            
            // Save chat history
            saveChatHistory();
            
        } catch (error) {
            console.error('Error sending message:', error);
            hideTypingIndicator();
            addMessageToChat('system', 'Es gab einen Fehler bei der Kommunikation mit dem Server. Bitte versuchen Sie es erneut.');
        } finally {
            chatState.isWaitingForResponse = false;
            sendButton.disabled = false;
        }
    }

    // Add a message to the chat
    function addMessageToChat(sender, text, sources = []) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Process markdown-like formatting and source citations
        const formattedText = formatMessageText(text);
        contentDiv.innerHTML = formattedText;
        
        messageDiv.appendChild(contentDiv);
        
        // Add metadata (time, sources button)
        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta';
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = getCurrentTime();
        metaDiv.appendChild(timeSpan);
        
        // Add sources button if applicable
        if (sender === 'bot' && sources && sources.length > 0) {
            chatState.currentSources = sources;
            
            const sourcesButton = document.createElement('span');
            sourcesButton.className = 'sources-button';
            sourcesButton.innerHTML = `<i class="fas fa-book"></i> ${sources.length} Quellen`;
            
            sourcesButton.addEventListener('click', () => {
                showSources(sources);
            });
            
            metaDiv.appendChild(sourcesButton);
        }
        
        messageDiv.appendChild(metaDiv);
        
        // Add message to chat
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Add to state
        chatState.messages.push({
            sender,
            text,
            time: getCurrentTime(),
            sources: sources || []
        });
    }

    // Format message text (handle markdown-like syntax and source citations)
    function formatMessageText(text) {
        // Handle paragraph breaks
        let formattedText = text.replace(/\n\n/g, '</p><p>');
        
        // Bold text
        formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Italic text
        formattedText = formattedText.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Handle code blocks
        formattedText = formattedText.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        // Handle inline code
        formattedText = formattedText.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Handle source citations
        formattedText = formattedText.replace(/\(Quelle: ([^,]+), Seite (\d+)\)/g, 
            '<span class="sources-tag">(Quelle: $1, Seite $2)</span>');
        
        // Handle [Allgemeinwissen] tag
        formattedText = formattedText.replace(/\[Allgemeinwissen\]:/g, 
            '<span class="allgemeines-wissen">[Allgemeinwissen]:</span>');
        
        return `<p>${formattedText}</p>`;
    }

    // Show typing indicator
    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot-message typing-indicator-container';
        typingDiv.id = 'typing-indicator';
        
        const typingContent = document.createElement('div');
        typingContent.className = 'typing-indicator';
        
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'typing-dot';
            typingContent.appendChild(dot);
        }
        
        typingDiv.appendChild(typingContent);
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Hide typing indicator
    function hideTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    // Show sources panel
    function showSources(sources) {
        // Clear previous sources
        sourcesList.innerHTML = '';
        
        if (!sources || sources.length === 0) {
            sourcesList.innerHTML = '<p class="no-sources">Keine Quellen für die aktuelle Antwort.</p>';
        } else {
            // Add each source
            sources.forEach(source => {
                const sourceItem = document.createElement('div');
                sourceItem.className = 'source-item';
                
                const sourceHeader = document.createElement('div');
                sourceHeader.className = 'source-header';
                sourceHeader.textContent = source.document;
                sourceItem.appendChild(sourceHeader);
                
                const sourcePage = document.createElement('div');
                sourcePage.className = 'source-page';
                sourcePage.textContent = `Seite ${source.page}`;
                sourceItem.appendChild(sourcePage);
                
                sourcesList.appendChild(sourceItem);
            });
        }
        
        // Open panel
        sourcesPanel.classList.add('open');
    }

    // Update status message
    function updateStatusMessage(message, autoDismissTime = 0) {
        statusMessage.querySelector('span').textContent = message;
        statusMessage.classList.remove('hidden');
        
        if (autoDismissTime > 0) {
            setTimeout(() => {
                statusMessage.classList.add('hidden');
            }, autoDismissTime);
        }
    }

    // Update status element
    function updateStatusElement(element, status, text = null) {
        // Remove existing status classes
        element.classList.remove('status-online', 'status-offline', 'status-connecting');
        
        // Add appropriate class
        element.classList.add(`status-${status}`);
        
        // Update text if provided
        if (text) {
            element.querySelector('span').textContent = text;
        }
    }

    // Get current time in HH:MM format
    function getCurrentTime() {
        const now = new Date();
        return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }

    // Save chat history to localStorage
    function saveChatHistory() {
        localStorage.setItem('chatHistory', JSON.stringify(chatState.messages));
    }

    // Load chat history from localStorage
    function loadChatHistory() {
        try {
            const savedHistory = localStorage.getItem('chatHistory');
            
            if (savedHistory) {
                const messages = JSON.parse(savedHistory);
                
                // Clear existing messages
                chatState.messages = [];
                chatMessages.innerHTML = '';
                
                // Add system welcome message again
                const welcomeDiv = document.createElement('div');
                welcomeDiv.className = 'message system-message';
                welcomeDiv.innerHTML = `
                    <div class="message-content">
                        <p>Willkommen bei Local Chat App! Sie können mir Fragen zu Ihren Dokumenten stellen oder allgemeine Fragen, die ich mit meinem Wissen beantworten werde.</p>
                    </div>
                `;
                chatMessages.appendChild(welcomeDiv);
                
                // Add saved messages
                messages.forEach(msg => {
                    addMessageToChat(msg.sender, msg.text, msg.sources);
                });
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }

    // Initialize the chat
    initChat();
});