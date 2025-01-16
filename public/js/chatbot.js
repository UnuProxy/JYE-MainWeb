document.addEventListener('DOMContentLoaded', async () => {
    const agentNameElement = document.getElementById('agent-name'); 
    const agentPhoto = document.getElementById('agent-photo');      
    const BASE_API_URL = window.location.origin;

     

    // Initialize Firebase
    await initFirebase();
    if (!window.db) {
        console.error('Firestore is not initialized. Check your Firebase configuration.');
        return;
    }
    await firebase.auth().signInAnonymously()
    .then(() => {
        console.log("Anonymous authentication successful.");
    })
    .catch((error) => {
        console.error("Anonymous authentication failed:", error.code, error.message);
        return; 
    });

    let conversationId = localStorage.getItem('conversationId');
    if (!conversationId) {
        conversationId = `conv_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        localStorage.setItem('conversationId', conversationId);
    }

    /**
     * Set dynamic agent name and photo based on time of day.
     */
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

        // Update the DOM with the dynamic name and photo
        if (agentNameElement) agentNameElement.textContent = agentName;
        if (agentPhoto) agentPhoto.src = photoSrc;
    }

    // Call the function to update name and photo dynamically
    setDynamicAgentName();

    const messagesContainer = document.getElementById('messages');
    const userInputField = document.getElementById('user-input');
    const formContainer = document.getElementById('form-container');

    let formDisplayed = false; // Prevent multiple form displays
    let userDetailsSubmitted = false; // Ensure user details are saved only once

    /**
     * Append a message to the chat and save it to Firestore.
     */
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

        // Save message to Firestore
        await saveMessageToFirestore(sender, message);
    }

    /**
     * Save a message to Firestore.
     */
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
    

    /**
     * Handle user input and send message to ChatGPT.
     */
    window.sendMessage = async () => {
        const userInput = userInputField.value.trim();
        if (!userInput) return;

        // Append user's message and save to Firestore
        appendMessage('user', userInput);
        userInputField.value = '';

        if (!userDetailsSubmitted) {
            setTimeout(() => {
                appendMessage('bot', "Thank you for reaching out! 😊 How can I assist you today?");
            }, 500);

            setTimeout(() => {
                appendMessage(
                    'bot',
                    "Before we continue, could you kindly share your full name and phone number? This will help us follow up if needed.",
                    true
                );
            }, 1500);
        } else {
            // Fetch response from ChatGPT backend
            appendMessage('bot', "Let me check that for you...");
            const botResponse = await fetchChatGPTResponse(userInput);
            appendMessage('bot', botResponse);
        }
    };

    /**
     * Fetch ChatGPT response from the backend.
     */
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

    /**
     * Handle form submission to save user details.
     */
    function handleFormSubmit(event) {
        event.preventDefault();

        const fullName = event.target.querySelector('#full-name').value.trim();
        const phoneNumber = event.target.querySelector('#phone-number').value.trim();

        if (!fullName || !phoneNumber) {
            alert("Please provide both your full name and phone number.");
            return;
        }

        // Save user details and reset form
        fetch(`${BASE_API_URL}/save-details`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, phoneNumber, conversationId }),
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

    /**
     * Close chatbot widget.
     */
    window.closeChat = (event) => {
        event.stopPropagation();
        const widget = document.getElementById('chatbot-widget');
        widget.style.display = 'none';
    };

    /**
     * Toggle chatbot visibility.
     */
    window.toggleChat = () => {
        const widget = document.getElementById('chatbot-widget');
        widget.style.display = widget.style.display === 'none' || widget.style.display === '' ? 'flex' : 'none';
    };
});


