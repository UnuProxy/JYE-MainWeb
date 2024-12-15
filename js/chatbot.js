document.addEventListener('DOMContentLoaded', () => {
    const saveUserForm = document.getElementById('save-user-form');
    const chatForm = document.getElementById('chat-form');
    const messagesContainer = document.getElementById('messages');
    let sessionId = null; // To hold the session ID for the user

    // Save user details and start chat
    saveUserForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const name = document.getElementById('user-name').value.trim();
        const phone = document.getElementById('user-phone').value.trim();

        if (!name || !phone) {
            alert("Please enter both your name and phone number.");
            return;
        }

        // Save user data via the /save-user endpoint
        try {
            const response = await fetch('/save-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone })
            });

            const data = await response.json();
            if (data.success) {
                sessionId = data.sessionId;
                messagesContainer.innerHTML += `<div class="message bot">Welcome, ${name}! How can I help you today?</div>`;
                saveUserForm.reset();
            } else {
                alert("Failed to save user data.");
            }
        } catch (error) {
            console.error("Error saving user data:", error);
            alert("Something went wrong.");
        }
    });

    // Send message to chatbot and receive response
    chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const userInput = document.getElementById('user-input').value.trim();
        if (!userInput) return;

        messagesContainer.innerHTML += `<div class="message user">${userInput}</div>`;
        document.getElementById('user-input').value = ''; // Clear input field
        messagesContainer.scrollTop = messagesContainer.scrollHeight; // Scroll to latest message

        if (!sessionId) {
            alert("Please enter your details first.");
            return;
        }

        // Send the user input to the /chat endpoint
        try {
            const businessInfo = "You are an assistant for Just Enjoy Ibiza, a company specialising in yacht charters, holiday planning, and corporate event services."; // Adjust business info as needed

            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userInput, businessInfo, sessionId })
            });

            const data = await response.json();
            if (data.botResponse) {
                messagesContainer.innerHTML += `<div class="message bot">${data.botResponse}</div>`;
                messagesContainer.scrollTop = messagesContainer.scrollHeight; // Scroll to latest message
            } else {
                alert("Failed to get response from the chatbot.");
            }
        } catch (error) {
            console.error("Error sending message:", error);
            alert("Something went wrong.");
        }
    });
});
