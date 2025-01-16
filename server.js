const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Firebase Admin Initialization
const serviceAccount = require('./serviceAccountKey.json'); // Path to your Firebase Admin SDK key
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore(); // Initialize Firestore

// Middleware
app.use(cors());
app.use(express.json()); 


app.use(express.static('public'));

// Root Route to Serve index.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Endpoint to get ChatGPT response
app.post('/chat', async (req, res) => {
    const { userMessage, conversationId } = req.body;

    if (!userMessage) {
        return res.status(400).json({ error: 'User message is required' });
    }

    try {
        // Fetch response from OpenAI
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant for a yacht rental company.' },
                    { role: 'user', content: userMessage },
                ],
                temperature: 0.7,
            }),
        });

        const data = await response.json();
        const botResponse = data.choices[0].message.content;

        // Save user message and bot response to Firestore
        const conversationDoc = db.collection('chatConversations').doc(conversationId);
        await conversationDoc.collection('messages').add({
            role: 'user',
            content: userMessage,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        await conversationDoc.collection('messages').add({
            role: 'bot',
            content: botResponse,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        res.json({ response: botResponse });
    } catch (error) {
        console.error('Error fetching response from OpenAI:', error);
        res.status(500).json({ error: 'Failed to fetch ChatGPT response' });
    }
});

app.get('/get-firebase-config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
    });
});

// Catch-All Route for Serving index.html (Handles SPA Navigation)
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Endpoint to save user details to Google Sheets
app.post('/save-details', async (req, res) => {
    const { fullName, phoneNumber } = req.body;

    if (!fullName || !phoneNumber) {
        return res.status(400).json({ error: 'Full name and phone number are required' });
    }

    try {
        await fetch(process.env.GOOGLE_SHEET_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, phoneNumber }),
        });

        res.json({ success: true, message: 'Details saved successfully' });
    } catch (error) {
        console.error('Error saving details to Google Sheets:', error);
        res.status(500).json({ error: 'Failed to save details' });
    }
});

// Catch-All Route for Serving index.html (Handles SPA Navigation)
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


