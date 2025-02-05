// chat-functions.js
window.toggleChat = function() {
    const widget = document.getElementById('chatbot-widget');
    if (widget) {
        widget.style.display = widget.style.display === 'none' || widget.style.display === '' ? 'flex' : 'none';
        if (widget.style.display === 'flex') {
            const messagesContainer = document.getElementById('messages');
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }
    }
};

window.closeChat = function(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const widget = document.getElementById('chatbot-widget');
    if (widget) {
        widget.style.display = 'none';
    }
};

// Make functions globally available
if (typeof window !== 'undefined') {
    window.chatFunctions = {
        toggleChat: window.toggleChat,
        closeChat: window.closeChat
    };
}