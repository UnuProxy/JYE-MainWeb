document.addEventListener('DOMContentLoaded', async () => {
    // === DOM Elements ===
    const chatbotWidget = document.getElementById('chatbot-widget');
    const agentNameElement = document.getElementById('agent-name');
    const agentPhoto = document.getElementById('agent-photo');
    const messagesContainer = document.getElementById('messages');
    const userInputField = document.getElementById('user-input');
    const sendButton = document.getElementById('send-btn');
    const BASE_API_URL = window.location.origin;

    // === State Variables ===
    let conversationId = localStorage.getItem('conversationId');
    let userName = localStorage.getItem('userName');
    let userDetailsSubmitted = !!userName;
    let isAgentHandling = false;
    let processedMessageIds = new Set();
    let isProcessingMessage = false;
    let isFirstMessage = true;
    let isWaitingForName = false;

    // Firebase listener unsubscribe functions
    let conversationListenerUnsubscribe = null;
    let messagesListenerUnsubscribe = null;

    // Generate a new conversationId if none exists
    if (!conversationId) {
        conversationId = `conv_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        localStorage.setItem('conversationId', conversationId);
    }

    // === Firebase Initialization ===
    try {
        await initFirebase();
        if (!window.db) {
            console.error('Firestore not initialized. Check Firebase configuration.');
            return;
        }
        await firebase.auth().signInAnonymously();
        console.log("Firebase anonymous authentication successful");
        setupMessageListeners();
        // Send welcome message after initialization
        if (!userName) {
            showWelcomeMessage();
        }
    } catch (error) {
        console.error("Firebase initialization error:", error);
        return;
    }

    // === Utility Functions ===
    function setDynamicAgentName() {
        const currentHour = new Date().getHours();
        let agentName = "Just Enjoy Ibiza Assistant";
        let photoSrc = "img/team/default.jpg";
        if (currentHour >= 7 && currentHour < 19) {
            agentName = "Julian (Available)";
            photoSrc = "img/team/Julian-small.png";
        } else {
            agentName = "Alin (Available)";
            photoSrc = "img/team/alin.png";
        }
        if (agentNameElement) agentNameElement.textContent = agentName;
        if (agentPhoto) agentPhoto.src = photoSrc;
    }

    async function showWelcomeMessage() {
        const welcomeMessage = "Hi there! 👋 I'm here to help you discover the best of Ibiza. What's your name so I can assist you better?";
        await saveMessageToFirestore('bot', welcomeMessage);
        isWaitingForName = true;
    }

    function setupMessageListeners() {
        if (conversationListenerUnsubscribe) conversationListenerUnsubscribe();
        if (messagesListenerUnsubscribe) messagesListenerUnsubscribe();

        let processedMessages = new Set(); // Local set for this listener instance

        conversationListenerUnsubscribe = window.db.collection('chatConversations')
            .doc(conversationId)
            .onSnapshot(doc => {
                const data = doc.data();
                if (data?.status === 'agent-handling' && !isAgentHandling) {
                    isAgentHandling = true;
                    handleAgentTakeover(data.agentId);
                }
            });

        messagesListenerUnsubscribe = window.db.collection('chatConversations')
            .doc(conversationId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const messageId = change.doc.id;
                        if (!processedMessages.has(messageId)) {
                            const message = change.doc.data();
                            displayMessage(message.role, message.content, messageId);
                            processedMessages.add(messageId);
                        }
                    }
                });
            });
    }

    function displayMessage(role, content, messageId) {
        if (processedMessageIds.has(messageId)) return;
        
        const messageClass = role === 'user' ? 'user'
            : role === 'agent' ? 'agent'
            : role === 'system' ? 'system'
            : 'bot';

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${messageClass}`;
        messageDiv.setAttribute('data-message-id', messageId);
        messageDiv.textContent = content;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        processedMessageIds.add(messageId);
    }

    async function saveMessageToFirestore(role, content) {
        try {
            const conversationRef = window.db.collection('chatConversations').doc(conversationId);
            const messageRef = await conversationRef.collection('messages').add({
                role,
                content,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Only update conversation metadata after saving message
            await conversationRef.set({
                lastMessage: content,
                lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastMessageRole: role,
                status: role === 'agent' ? 'agent-handling' : (isAgentHandling ? 'agent-handling' : 'active')
            }, { merge: true });

            return messageRef.id;
        } catch (error) {
            console.error('Error saving message:', error);
            return null;
        }
    }

    function handleAgentTakeover(agentId) {
        isAgentHandling = true;
        userDetailsSubmitted = true;
        const takeoverMessage = document.createElement('div');
        takeoverMessage.className = 'message system';
        takeoverMessage.textContent = 'An agent has joined the conversation and will assist you shortly.';
        messagesContainer.appendChild(takeoverMessage);
        if (agentNameElement) {
            agentNameElement.textContent = `${agentId} (Live Agent)`;
        }
    }

    async function handleNameInput(userInput) {
        const name = userInput.trim();
        if (name.length > 0) {
            userName = name;
            localStorage.setItem('userName', userName);
            userDetailsSubmitted = true;
            isWaitingForName = false;

            await window.db.collection('chatConversations')
                .doc(conversationId)
                .set({
                    userName: userName,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

            await saveMessageToFirestore('bot', `Nice to meet you, ${userName}! How can I help you explore Ibiza today?`);
            return true;
        }
        await saveMessageToFirestore('bot', "I didn't quite catch your name. Could you please tell me again?");
        return false;
    }

    window.sendMessage = async () => {
        if (isProcessingMessage) return;
        isProcessingMessage = true;
        if (sendButton) sendButton.disabled = true;

        const userInput = userInputField.value.trim();
        if (!userInput) {
            isProcessingMessage = false;
            if (sendButton) sendButton.disabled = false;
            return;
        }

        try {
            await saveMessageToFirestore('user', userInput);
            userInputField.value = '';

            if (!isAgentHandling) {
                if (isWaitingForName) {
                    await handleNameInput(userInput);
                } else {
                    try {
                        const response = await fetch(`${BASE_API_URL}/chat`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                userMessage: userInput, 
                                conversationId,
                                userName
                            })
                        });

                        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                        const data = await response.json();
                        
                        // Check if still not agent handling before sending bot response
                        const currentStatus = (await window.db.collection('chatConversations')
                            .doc(conversationId)
                            .get()).data()?.status;
                            
                        if (currentStatus !== 'agent-handling') {
                            await saveMessageToFirestore('bot', data.response || "I'm here to help!");
                        }
                    } catch (error) {
                        console.error("API error:", error);
                        await saveMessageToFirestore('bot', "Service temporarily unavailable.");
                    }
                }
            }
        } catch (error) {
            console.error('Error in sendMessage:', error);
        } finally {
            isProcessingMessage = false;
            if (sendButton) sendButton.disabled = false;
        }
    };

    window.toggleChat = () => {
        if (!chatbotWidget) return;
        const isCurrentlyHidden = chatbotWidget.style.display === 'none' || chatbotWidget.style.display === '';
        chatbotWidget.style.display = isCurrentlyHidden ? 'flex' : 'none';
        
        if (isCurrentlyHidden) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            // Show welcome message if this is the first time opening
            if (!userName && isFirstMessage) {
                isFirstMessage = false;
                showWelcomeMessage();
            }
        }
    };

    window.closeChat = (event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (chatbotWidget) {
            chatbotWidget.style.display = 'none';
        }
        if (conversationListenerUnsubscribe) conversationListenerUnsubscribe();
        if (messagesListenerUnsubscribe) messagesListenerUnsubscribe();
    };

    // === Event Listeners ===
    if (sendButton) {
        sendButton.addEventListener('click', window.sendMessage);
    }
    if (userInputField) {
        userInputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.sendMessage();
            }
        });
    }

    // Set the initial dynamic agent name
    setDynamicAgentName();
});






