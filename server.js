const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// List of required environment variables
const requiredEnvVars = [
    'OPENAI_API_KEY',
    'GOOGLE_SHEET_URL',
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_STORAGE_BUCKET',
    'FIREBASE_MESSAGING_SENDER_ID',
    'FIREBASE_APP_ID',
    'FIREBASE_SERVICE_ACCOUNT_KEY'
];

// Ensure all required environment variables are set
requiredEnvVars.forEach((key) => {
    if (!process.env[key]) {
        console.error(`Environment variable ${key} is missing.`);
        process.exit(1);
    }
});

// Firebase Admin initialization
let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
    });

    console.log('Firebase Admin initialized successfully');
} catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error.message);
    process.exit(1);
}

const db = admin.firestore();

// CORS Configuration
const allowedOrigins = [
    'http://localhost:3000',
    /\.vercel\.app$/ // Allow all Vercel subdomains
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.some(o => o instanceof RegExp ? o.test(origin) : o === origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.use(express.json());
app.use(express.static('public'));

// In-memory storage for bot status (replace with a database in a real application)
const botStatuses = {};

// Stop Bot Endpoint
app.post('/stop-bot', (req, res) => {
    const { conversationId } = req.body;

    if (!conversationId) {
        return res.status(400).json({ error: 'Missing conversationId' });
    }

    // In a real application, you'd likely look up the bot's state in a database
    // and update its status there.

    // For this example, we'll just store the status in memory:
    botStatuses[conversationId] = false; // Mark the bot as stopped

    console.log(`Stopping bot for conversation ${conversationId}`);
    res.status(200).json({ message: 'Bot stopped successfully' });
});


// Root Route
app.get('/', (req, res) => {
    try {
        res.sendFile(__dirname + '/public/index.html');
    } catch (error) {
        console.error('Error serving index.html:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Chat Endpoint
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
        if (!response.ok || !data.choices || !data.choices.length) {
            console.error('OpenAI API Error:', data);
            throw new Error('Failed to fetch a valid response from OpenAI API.');
        }
        const botResponse = data.choices[0].message.content;

        // Save messages to Firestore
        const conversationDoc = db.collection('chatConversations').doc(conversationId || 'default');
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

// Firebase Config Endpoint
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

// Save User Details Endpoint (Google Sheets)
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

// Catch-All Route
app.get('*', (req, res) => {
    try {
        res.sendFile(__dirname + '/public/index.html');
    } catch (error) {
        console.error('Error serving index.html:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Start the Server
app.listen(PORT, () => {
    console.log(`Server is running on ${process.env.NODE_ENV === 'production' ? 'production' : 'localhost'}:${PORT}`);
});
