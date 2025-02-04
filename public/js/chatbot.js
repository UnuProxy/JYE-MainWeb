//chatbot.js
document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const agentNameElement = document.getElementById('agent-name');
    const agentPhoto = document.getElementById('agent-photo');
    const messagesContainer = document.getElementById('messages');
    const userInputField = document.getElementById('user-input');
    const formContainer = document.getElementById('form-container');
    const BASE_API_URL = window.location.origin;

    // State variables
    let conversationId = localStorage.getItem('conversationId');
    let formDisplayed = false;
    let userDetailsSubmitted = false;
    let isAgentHandling = false;
    let processedMessageIds = new Set();

    if (!conversationId) {
        conversationId = `conv_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        localStorage.setItem('conversationId', conversationId);
    }

    // Initialize Firebase
    try {
        await initFirebase();
        if (!window.db) {
            console.error('Firestore is not initialized. Check your Firebase configuration.');
            return;
        }

        await firebase.auth().signInAnonymously();
        console.log("Anonymous authentication successful");
        setupMessageListeners();
    } catch (error) {
        console.error("Error during Firebase initialization or authentication:", error);
        return;
    }

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

    function setupMessageListeners() {
        // Listen for conversation status changes
        window.db.collection('chatConversations')
            .doc(conversationId)
            .onSnapshot((doc) => {
                const data = doc.data();
                if (data?.status === 'agent-handling' && !isAgentHandling) {
                    console.log('Agent is now handling the conversation');
                    isAgentHandling = true;
                    handleAgentTakeover(data.agentId);
                }
            });

        // Listen for new messages
        window.db.collection('chatConversations')
            .doc(conversationId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added' && !processedMessageIds.has(change.doc.id)) {
                        const message = change.doc.data();
                        displayMessage(message.role, message.content, change.doc.id);
                        processedMessageIds.add(change.doc.id);
                    }
                });
            });
    }

    function displayMessage(role, content, messageId) {
        if (processedMessageIds.has(messageId)) return;

        const messageClass = role === 'user' ? 'user' : 
                           role === 'agent' ? 'agent' : 
                           role === 'system' ? 'system' : 'bot';

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${messageClass}`;
        messageDiv.setAttribute('data-message-id', messageId);
        messageDiv.textContent = content;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async function saveMessageToFirestore(role, content) {
        try {
            const conversationRef = window.db.collection('chatConversations').doc(conversationId);
            
            // Add message to subcollection
            const messageRef = await conversationRef.collection('messages').add({
                role,
                content,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Update conversation metadata
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
        console.log('Handling agent takeover');
        isAgentHandling = true;
        userDetailsSubmitted = true;
        formDisplayed = true;

        const takeoverMessage = document.createElement('div');
        takeoverMessage.className = 'message system';
        takeoverMessage.textContent = 'An agent has joined the conversation and will assist you shortly.';
        messagesContainer.appendChild(takeoverMessage);
        
        if (agentNameElement) {
            agentNameElement.textContent = `${agentId} (Live Agent)`;
        }

        // Remove form if present
        const formWrapper = document.querySelector('.form-wrapper');
        if (formWrapper) {
            formWrapper.remove();
        }
    }

    async function handleFormSubmit(event) {
        event.preventDefault();

        const fullName = event.target.querySelector('#full-name').value.trim();
        const phoneNumber = event.target.querySelector('#phone-number').value.trim();

        if (!fullName || !phoneNumber) {
            alert("Please provide both your full name and phone number.");
            return;
        }

        try {
            const conversationRef = window.db.collection('chatConversations').doc(conversationId);
            await conversationRef.set({
                fullName,
                phoneNumber,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: isAgentHandling ? 'agent-handling' : 'active',
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            await saveMessageToFirestore('system', `Thank you, ${fullName}! 😊 We can now continue our conversation.`);
            
            const formWrapper = document.querySelector('.form-wrapper');
            if (formWrapper) formWrapper.remove();
            userDetailsSubmitted = true;
            formDisplayed = false;
        } catch (error) {
            console.error("Error saving user details:", error);
            saveMessageToFirestore('system', "Something went wrong. Please try again.");
        }
    }

    window.sendMessage = async () => {
        const userInput = userInputField.value.trim();
        if (!userInput) return;

        // Save user message
        await saveMessageToFirestore('user', userInput);
        userInputField.value = '';

        // Check conversation status before proceeding with bot responses
        try {
            const conversationDoc = await window.db
                .collection('chatConversations')
                .doc(conversationId)
                .get();
            
            const conversationData = conversationDoc.data();
            isAgentHandling = conversationData?.status === 'agent-handling';

            // Only proceed with bot logic if not being handled by agent
            if (!isAgentHandling) {
                if (!userDetailsSubmitted) {
                    setTimeout(async () => {
                        await saveMessageToFirestore('bot', "Thank you for reaching out! 😊 How can I assist you today?");
                    }, 500);

                    setTimeout(async () => {
                        await saveMessageToFirestore('bot', 
                            "Before we continue, could you kindly share your full name and phone number? This will help us follow up if needed."
                        );
                        if (!formDisplayed) {
                            const formWrapper = document.createElement('div');
                            formWrapper.className = 'form-wrapper';
                            const formClone = formContainer.cloneNode(true);
                            formClone.style.display = 'block';
                            formWrapper.appendChild(formClone);
                            messagesContainer.appendChild(formWrapper);
                            const userDetailsForm = formClone.querySelector('form');
                            userDetailsForm.addEventListener('submit', handleFormSubmit);
                            formDisplayed = true;
                        }
                    }, 1500);
                } else {
                    await saveMessageToFirestore('bot', "Let me check that for you...");
                    try {
                        const response = await fetch(`${BASE_API_URL}/chat`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userMessage: userInput, conversationId }),
                        });

                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                        const data = await response.json();
                        await saveMessageToFirestore('bot', data.response || "I'm here to assist! Let me know more details.");
                    } catch (error) {
                        console.error("Error fetching bot response:", error);
                        await saveMessageToFirestore('bot', "Sorry, I'm experiencing technical difficulties. Please try again later.");
                    }
                }
            }
            // If agent is handling, just let the message go through without bot response
        } catch (error) {
            console.error('Error checking conversation status:', error);
        }
    };

    window.toggleChat = () => {
        const widget = document.getElementById('chatbot-widget');
        widget.style.display = widget.style.display === 'none' || widget.style.display === '' ? 'flex' : 'none';
        if (widget.style.display === 'flex' && messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    };

    window.closeChat = (event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const widget = document.getElementById('chatbot-widget');
        widget.style.display = 'none';
    };

    // Event listeners
    const userDetailsForm = document.querySelector('#user-details-form');
    if (userDetailsForm) {
        userDetailsForm.addEventListener('submit', handleFormSubmit);
    }

    const sendButton = document.getElementById('send-btn');
    if (sendButton) {
        sendButton.addEventListener('click', window.sendMessage);
    }

    if (userInputField) {
        userInputField.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                window.sendMessage();
            }
        });
    }

    // Initialize
    setDynamicAgentName();
});



