document.addEventListener('DOMContentLoaded', async () => {
    // === DOM Elements (matching your HTML) ===
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

    // Lock flag to prevent duplicate processing
    let isProcessingMessage = false;

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
    } catch (error) {
        console.error("Firebase initialization error:", error);
        return;
    }

    // === Utility Functions ===

    // Set agent name and image based on current time
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

    // Setup listeners for conversation status and messages
    function setupMessageListeners() {
        // Unsubscribe any existing listeners
        if (conversationListenerUnsubscribe) conversationListenerUnsubscribe();
        if (messagesListenerUnsubscribe) messagesListenerUnsubscribe();

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
                    if (change.type === 'added' && !processedMessageIds.has(change.doc.id)) {
                        const message = change.doc.data();
                        displayMessage(message.role, message.content, change.doc.id);
                        processedMessageIds.add(change.doc.id);
                    }
                });
            });
    }

    // Display a new message in the chat window
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
    }

    // Save a message to Firestore and update conversation metadata
    async function saveMessageToFirestore(role, content) {
        try {
            const conversationRef = window.db.collection('chatConversations').doc(conversationId);
            const messageRef = await conversationRef.collection('messages').add({
                role,
                content,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
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

    // Handle agent takeover events
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

    // === Chat Function: Process and send user message ===
    window.sendMessage = async () => {
        // Lock processing if another message is in progress
        if (isProcessingMessage) return;
        isProcessingMessage = true;
        if (sendButton) sendButton.disabled = true;

        const userInput = userInputField.value.trim();
        if (!userInput) {
            isProcessingMessage = false;
            if (sendButton) sendButton.disabled = false;
            return;
        }

        // Save the user's message
        await saveMessageToFirestore('user', userInput);
        userInputField.value = '';

        try {
            // Check conversation status from Firestore
            const conversationDoc = await window.db.collection('chatConversations').doc(conversationId).get();
            const conversationData = conversationDoc.data();
            isAgentHandling = conversationData?.status === 'agent-handling';

            // Only respond if an agent is not handling the conversation
            if (!isAgentHandling) {
                // If we haven't captured the user's name, prompt for it
                if (!userDetailsSubmitted) {
                    const name = prompt("Hi there! Please enter your full name:");
                    if (name && name.trim()) {
                        userName = name.trim();
                        localStorage.setItem('userName', userName);
                        userDetailsSubmitted = true;
                        const conversationRef = window.db.collection('chatConversations').doc(conversationId);
                        await conversationRef.set({
                            userName: userName,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        await saveMessageToFirestore('bot', `Great to meet you, ${userName}! How can I help?`);
                    } else {
                        await saveMessageToFirestore('bot', "I didn't catch your name. Please try again.");
                    }
                } else {
                    // Normal bot response flow
                    await saveMessageToFirestore('bot', "Let me check that...");
                    try {
                        const response = await fetch(`${BASE_API_URL}/chat`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userMessage: userInput, conversationId })
                        });
                        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                        const data = await response.json();
                        await saveMessageToFirestore('bot', data.response || "I'm here to help!");
                    } catch (error) {
                        console.error("API error:", error);
                        await saveMessageToFirestore('bot', "Service temporarily unavailable.");
                    }
                }
            }
            // If an agent is handling, do not generate a bot response.
        } catch (error) {
            console.error('Error checking conversation status:', error);
        } finally {
            isProcessingMessage = false;
            if (sendButton) sendButton.disabled = false;
        }
    };

    // === Chat Toggle and Close Functions ===
    window.toggleChat = () => {
        if (!chatbotWidget) return;
        // Toggle display state
        chatbotWidget.style.display = (chatbotWidget.style.display === 'none' || chatbotWidget.style.display === '')
            ? 'flex'
            : 'none';
        if (chatbotWidget.style.display === 'flex' && messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
        // Unsubscribe Firebase listeners on close
        if (conversationListenerUnsubscribe) conversationListenerUnsubscribe();
        if (messagesListenerUnsubscribe) messagesListenerUnsubscribe();
    };

    // === Attach Event Listeners ===
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






