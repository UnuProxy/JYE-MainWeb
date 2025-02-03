document.addEventListener('DOMContentLoaded', async () => {
    const agentNameElement = document.getElementById('agent-name');
    const agentPhoto = document.getElementById('agent-photo');
    const messagesContainer = document.getElementById('messages');
    const userInputField = document.getElementById('user-input');
    const formContainer = document.getElementById('form-container');
    const BASE_API_URL = window.location.origin;

    let conversationId = localStorage.getItem('conversationId');
    let formDisplayed = false;
    let userDetailsSubmitted = false;
    let isAgentHandling = false;
    let processedMessageIds = new Set(); // Track processed messages

    if (!conversationId) {
        conversationId = `conv_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        localStorage.setItem('conversationId', conversationId);
    }

    // Initialise Firebase
    try {
        await initFirebase();
        if (!window.db) {
            console.error('Firestore is not initialised. Check your Firebase configuration.');
            return;
        }
        await firebase.auth().signInAnonymously();
        console.log("Anonymous authentication successful.");
    } catch (error) {
        console.error("Error during Firebase initialization or authentication:", error.message);
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

    setDynamicAgentName();

    // Listen for conversation status changes
    function listenToConversationStatus() {
        const conversationRef = window.db
            .collection('chatConversations')
            .doc(conversationId);

        return conversationRef.onSnapshot((doc) => {
            const data = doc.data();
            if (data?.status === 'agent-handling' && !isAgentHandling) {
                isAgentHandling = true;
                handleAgentTakeover(data.agentId);
            }
        });
    }

    // Listen for new messages
    function listenToMessages() {
        const messagesRef = window.db
            .collection('chatConversations')
            .doc(conversationId)
            .collection('messages')
            .orderBy('timestamp', 'asc');

        return messagesRef.onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const message = change.doc.data();
                    if (!processedMessageIds.has(change.doc.id)) {
                        displayMessage(message.role, message.content, change.doc.id);
                    }
                }
            });
        });
    }

    // Display message with duplicate prevention
    function displayMessage(role, content, messageId) {
        if (processedMessageIds.has(messageId)) return;

        const messageClass = role === 'user' ? 'user' : role === 'agent' ? 'bot agent' : 'bot';
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${messageClass}`;
        messageDiv.setAttribute('data-message-id', messageId);
        messageDiv.textContent = content;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        processedMessageIds.add(messageId);
    }

    // Append message (with optional form integration)
    async function appendMessage(sender, message, isForm = false) {
        const messageClass = sender === 'user' ? 'user' : 'bot';

        if (isForm && !formDisplayed) {
            formDisplayed = true;

            const botMessage = document.createElement('div');
            botMessage.className = 'message bot';
            botMessage.textContent = message;

            const formWrapper = document.createElement('div');
            formWrapper.className = 'form-wrapper';

            const formClone = formContainer.cloneNode(true);
            formClone.style.display = 'block';

            formWrapper.appendChild(formClone);
            messagesContainer.appendChild(botMessage);
            messagesContainer.appendChild(formWrapper);

            const userDetailsForm = formClone.querySelector('form');
            userDetailsForm.addEventListener('submit', handleFormSubmit);
        } else if (!isForm) {
            const newMessage = `<div class="message ${messageClass}">${message}</div>`;
            messagesContainer.insertAdjacentHTML('beforeend', newMessage);
        }

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        await saveMessageToFirestore(sender, message);
    }

    async function saveMessageToFirestore(sender, message) {
        try {
            await window.db
                .collection('chatConversations')
                .doc(conversationId)
                .collection('messages')
                .add({
                    role: sender === 'user' ? 'user' : 'bot',
                    content: message,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                });
        } catch (error) {
            console.error('Error saving message to Firestore:', error);
        }
    }

    function handleAgentTakeover(agentId) {
        isAgentHandling = true;

        // Stop any ongoing bot responses
        fetch(`${BASE_API_URL}/stop-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId }),
        }).catch(error => console.error('Error stopping bot:', error));

        // Update UI to show agent is handling
        const agentTakeoverMessage = document.createElement('div');
        agentTakeoverMessage.className = 'message bot system';
        agentTakeoverMessage.textContent = 'An agent has joined the conversation and will assist you shortly.';
        messagesContainer.appendChild(agentTakeoverMessage);

        if (agentNameElement) {
            agentNameElement.textContent = `${agentId} (Live Agent)`;
        }

        // Modify message handling for user once an agent is active
        window.sendMessage = async () => {
            const userInput = userInputField.value.trim();
            if (!userInput) return;

            const messageId = `msg_${Date.now()}`;
            displayMessage('user', userInput, messageId);
            await saveMessageToFirestore('user', userInput);
            userInputField.value = '';
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        };
    }

    // Modified sendMessage function with restored form logic
    window.sendMessage = async () => {
        const userInput = userInputField.value.trim();
        if (!userInput) return;

        const messageId = `msg_${Date.now()}`;
        displayMessage('user', userInput, messageId);
        await saveMessageToFirestore('user', userInput);
        userInputField.value = '';

        if (!userDetailsSubmitted) {
            // First bot message: greet the user
            setTimeout(() => {
                appendMessage('bot', "Thank you for reaching out! 😊 How can I assist you today?");
            }, 500);

            // Second bot message: prompt for name and phone with an integrated form
            setTimeout(() => {
                appendMessage(
                    'bot',
                    "Before we continue, could you kindly share your full name and phone number? This will help us follow up if needed.",
                    true
                );
            }, 1500);
        } else if (!isAgentHandling) {
            // Normal bot response if the user details have been submitted and no agent is handling the chat
            const thinkingMessageId = `msg_${Date.now()}_thinking`;
            displayMessage('bot', "Let me check that for you...", thinkingMessageId);

            try {
                const botResponse = await fetchChatGPTResponse(userInput);
                const responseMessageId = `msg_${Date.now()}_response`;
                displayMessage('bot', botResponse, responseMessageId);
                saveMessageToFirestore('bot', botResponse);
            } catch (error) {
                console.error("Error getting bot response:", error);
            }
        }
    };

    async function fetchChatGPTResponse(userMessage) {
        try {
            const response = await fetch(`${BASE_API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userMessage, conversationId }),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data.response || "I'm here to assist! Let me know more details.";
        } catch (error) {
            console.error("Error fetching ChatGPT response:", error.message);
            return "Sorry, I'm experiencing technical difficulties. Please try again later.";
        }
    }

    function handleFormSubmit(event) {
        event.preventDefault();

        const fullName = event.target.querySelector('#full-name').value.trim();
        const phoneNumber = event.target.querySelector('#phone-number').value.trim();

        if (!fullName || !phoneNumber) {
            alert("Please provide both your full name and phone number.");
            return;
        }

        fetch(`${BASE_API_URL}/save-details`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                fullName, 
                phoneNumber,
                conversationId 
            }),
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to save details: ${response.status}`);
                }

                appendMessage('bot', `Thank you, ${fullName}! 😊 We can now continue our conversation.`);
                const formWrapper = document.querySelector('.form-wrapper');
                if (formWrapper) formWrapper.remove();
                userDetailsSubmitted = true;
                formDisplayed = false;
            })
            .catch((error) => {
                console.error("Error saving user details:", error.message);
                appendMessage('bot', "Something went wrong. Please try again.");
            });
    }

    window.toggleChat = () => {
        const widget = document.getElementById('chatbot-widget');
        widget.style.display = (widget.style.display === 'none' || widget.style.display === '') ? 'flex' : 'none';
    };

    // Attach the event listener to the floating bubble
    const bubble = document.getElementById('chatbot-floating-bubble');
    if (bubble) {
        bubble.addEventListener('click', window.toggleChat);
    }

    window.closeChat = (event) => {
        event.stopPropagation();
        const widget = document.getElementById('chatbot-widget');
        widget.style.display = 'none';

        // Cleanup listeners
        if (unsubscribeConversation) unsubscribeConversation();
        if (unsubscribeMessages) unsubscribeMessages();
    };

    // Start listeners
    const unsubscribeConversation = listenToConversationStatus();
    const unsubscribeMessages = listenToMessages();
});




