// Prevent multiple initializations
if (window.chatInitialized) {
    console.log('Chat already initialized, cleaning up old instance');
    if (window.cleanupChat) {
        window.cleanupChat();
    }
}

// Message handler class for better encapsulation
class MessageHandler {
    constructor(db, conversationId) {
        this.db = db;
        this.conversationId = conversationId;
        this.pendingMessages = new Map(); // Using Map for better timeout handling
        this.processedMessageIds = new Set();
        this.messageDebounceTime = 2000; // 2 seconds debounce
    }

    async saveMessage(role, content) {
        const messageKey = `${role}-${content}-${Date.now()}`;
        
        // Check for pending duplicates with timeout
        if (this.isDuplicatePending(messageKey)) {
            return null;
        }

        // Add to pending with timeout
        const timeoutId = setTimeout(() => {
            this.pendingMessages.delete(messageKey);
        }, this.messageDebounceTime);
        
        this.pendingMessages.set(messageKey, {
            timestamp: Date.now(),
            timeoutId
        });

        try {
            const messagesRef = this.db.collection('chatConversations')
                .doc(this.conversationId)
                .collection('messages');

            // Use transaction for atomic operations
            const messageId = await this.db.runTransaction(async (transaction) => {
                // Check for recent duplicates
                const recentMessages = await transaction.get(
                    messagesRef
                        .orderBy('timestamp', 'desc')
                        .limit(3)
                );

                const isDuplicate = recentMessages.docs.some(doc => {
                    const data = doc.data();
                    return data.role === role && 
                           data.content === content &&
                           Date.now() - data.timestamp.toMillis() < this.messageDebounceTime;
                });

                if (isDuplicate) {
                    return null;
                }

                // Create new message
                const newMessageRef = messagesRef.doc();
                const timestamp = this.db.FieldValue.serverTimestamp();

                transaction.set(newMessageRef, {
                    role,
                    content,
                    timestamp,
                    clientTimestamp: Date.now() // For local ordering
                });

                // Update conversation metadata
                transaction.set(
                    this.db.collection('chatConversations').doc(this.conversationId),
                    {
                        lastMessage: content,
                        lastMessageAt: timestamp,
                        lastMessageRole: role,
                        updatedAt: timestamp
                    },
                    { merge: true }
                );

                return newMessageRef.id;
            });

            return messageId;

        } catch (error) {
            console.error('Error saving message:', error);
            return null;
        } finally {
            // Clean up pending state
            const pending = this.pendingMessages.get(messageKey);
            if (pending) {
                clearTimeout(pending.timeoutId);
                this.pendingMessages.delete(messageKey);
            }
        }
    }

    isDuplicatePending(messageKey) {
        // Check if a similar message is being processed
        for (const [key, value] of this.pendingMessages.entries()) {
            // Compare message keys without timestamps
            const [currentRole, currentContent] = key.split('-');
            const [newRole, newContent] = messageKey.split('-');
            
            if (currentRole === newRole && 
                currentContent === newContent && 
                Date.now() - value.timestamp < this.messageDebounceTime) {
                return true;
            }
        }
        return false;
    }

    displayMessage(role, content, messageId) {
        if (this.processedMessageIds.has(messageId)) {
            return false;
        }

        this.processedMessageIds.add(messageId);
        return true;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (window.chatInitialized) return;
    window.chatInitialized = true;
    console.log('Initializing chat...', Date.now());

    // DOM Elements
    const agentNameElement = document.getElementById('agent-name');
    const agentPhoto = document.getElementById('agent-photo');
    const messagesContainer = document.getElementById('messages');
    const userInputField = document.getElementById('user-input');
    const BASE_API_URL = window.location.origin;

    // State variables
    let conversationId = localStorage.getItem('conversationId');
    let userName = localStorage.getItem('userName');
    let isAgentHandling = false;
    let isWaitingForName = false;

    if (!conversationId) {
        conversationId = `conv_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        localStorage.setItem('conversationId', conversationId);
    }

    // Initialize Firebase and Message Handler
    try {
        await initFirebase();
        if (!window.db) {
            console.error('Firestore is not initialized.');
            return;
        }
        await firebase.auth().signInAnonymously();
        const messageHandler = new MessageHandler(window.db, conversationId);
        setupMessageListeners(messageHandler);
    } catch (error) {
        console.error("Firebase initialization error:", error);
        return;
    }

    function setDynamicAgentName() {
        const currentHour = new Date().getHours();
        let agentName = "Just Enjoy Ibiza";
        let photoSrc = "img/team/default.jpg";

        if (currentHour >= 7 && currentHour < 19) {
            agentName = "Julian";
            photoSrc = "img/team/Julian-small.png";
        } else {
            agentName = "Alin";
            photoSrc = "img/team/alin.png";
        }

        if (agentNameElement) agentNameElement.textContent = agentName;
        if (agentPhoto) agentPhoto.src = photoSrc;
    }

    function setupMessageListeners(messageHandler) {
        // Listen for conversation status changes
        window.db.collection('chatConversations')
            .doc(conversationId)
            .onSnapshot((doc) => {
                const data = doc.data();
                if (data?.status === 'agent-handling' && !isAgentHandling) {
                    isAgentHandling = true;
                    handleAgentTakeover(data.agentId);
                }
            });

        // Listen for new messages
        const messagesQuery = window.db.collection('chatConversations')
            .doc(conversationId)
            .collection('messages')
            .orderBy('timestamp', 'asc');

        const unsubscribe = messagesQuery.onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' && messageHandler.displayMessage(change.doc.data().role, change.doc.data().content, change.doc.id)) {
                    const message = change.doc.data();
                    renderMessage(message.role, message.content, change.doc.id);
                }
            });
        });

        window.chatUnsubscribe = unsubscribe;
    }

    function renderMessage(role, content, messageId) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        messageDiv.setAttribute('data-message-id', messageId);

        if (role === 'bot' || role === 'agent') {
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'message-avatar';
            const avatarImg = document.createElement('img');
            avatarImg.src = agentPhoto.src;
            avatarDiv.appendChild(avatarImg);
            messageDiv.appendChild(avatarDiv);
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;
        messageDiv.appendChild(contentDiv);

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function showTypingIndicator(duration = 1000) {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-avatar">
                <img src="${agentPhoto.src}" alt="Agent" />
            </div>
            <div class="message-content">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        return new Promise(resolve => {
            setTimeout(() => {
                if (typingDiv && typingDiv.parentNode) {
                    typingDiv.remove();
                }
                resolve();
            }, duration);
        });
    }

    function handleAgentTakeover(agentId) {
        isAgentHandling = true;
        isWaitingForName = false;
        
        const takeoverMessage = "An agent has joined to assist you. 👋";
        messageHandler.saveMessage('system', takeoverMessage);
        
        if (agentNameElement) {
            agentNameElement.textContent = `${agentId} (Live Agent)`;
            agentNameElement.classList.add('agent-active');
        }

        const availabilityDot = document.getElementById('availability-dot');
        if (availabilityDot) {
            availabilityDot.style.background = '#22c55e';
        }
    }

    window.sendMessage = async () => {
        const userInput = userInputField.value.trim();
        if (!userInput) return;

        userInputField.value = '';

        try {
            const messageId = await messageHandler.saveMessage('user', userInput);
            if (!messageId) {
                console.log('Message not saved - likely duplicate');
                return;
            }

            if (!isAgentHandling) {
                if (!userName && !isWaitingForName) {
                    isWaitingForName = true;
                    await showTypingIndicator(1500);
                    await messageHandler.saveMessage('bot', "Hi there! 👋 I'd love to know who I'm chatting with. What's your name?");
                } else if (isWaitingForName) {
                    userName = userInput;
                    localStorage.setItem('userName', userName);
                    isWaitingForName = false;

                    await window.db.collection('chatConversations').doc(conversationId).set({
                        userName: userName,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                    await showTypingIndicator(1500);
                    await messageHandler.saveMessage('bot', `Great to meet you, ${userName}! 😊 How can I help you today?`);
                } else {
                    await showTypingIndicator(2000);
                    try {
                        const response = await fetch(`${BASE_API_URL}/chat`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                userMessage: userInput, 
                                conversationId,
                                userName 
                            }),
                        });

                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                        const data = await response.json();
                        await messageHandler.saveMessage('bot', data.response || "How else can I assist you today?");
                    } catch (error) {
                        console.error("Error fetching bot response:", error);
                        await messageHandler.saveMessage('bot', "I'm experiencing technical difficulties. Please try again later.");
                    }
                }
            }
        } catch (error) {
            console.error('Error in message handling:', error);
        }
    };

    window.toggleChat = () => {
        const widget = document.getElementById('chatbot-widget');
        const isHidden = widget.style.display === 'none' || widget.style.display === '';
        widget.style.display = isHidden ? 'flex' : 'none';
        
        if (isHidden) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            if (!userName && !messageHandler.processedMessageIds.size) {
                showTypingIndicator(1500).then(() => {
                    messageHandler.saveMessage('bot', "Hi there! 👋 I'd love to know who I'm chatting with. What's your name?");
                    isWaitingForName = true;
                });
            }
        }
    };

    window.closeChat = (event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        document.getElementById('chatbot-widget').style.display = 'none';
    };

    // Event listeners
    userInputField?.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            window.sendMessage();
        }
    });

    const sendButton = document.getElementById('send-btn');
    sendButton?.addEventListener('click', window.sendMessage);

    // Initialize
    setDynamicAgentName();

    // Cleanup function
    window.cleanupChat = () => {
        if (window.chatUnsubscribe) {
            window.chatUnsubscribe();
        }
        window.chatInitialized = false;
    };
});


