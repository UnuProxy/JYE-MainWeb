const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

requiredEnvVars.forEach((key) => {
    if (!process.env[key]) {
        console.error(`Environment variable ${key} is missing.`);
        process.exit(1);
    }
});

let serviceAccount;
try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!rawKey) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is undefined');
    }
    
    try {
        console.log('Attempting to decode base64 service account key');
        const decoded = Buffer.from(rawKey, 'base64').toString('utf8');
        console.log('Successfully decoded base64. Attempting to parse JSON');
        serviceAccount = JSON.parse(decoded);
        console.log('Successfully parsed JSON');

        // Fix private key formatting
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key
                .replace(/\\n/g, '\n')
                .replace(/"/g, '')
                .replace(/\n\n/g, '\n');  // Remove any double line breaks
        }
        
        // Initialize Firebase
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        console.log('Firebase initialized successfully');
        
    } catch (parseError) {
        console.error('Parsing error:', parseError.message);
        throw parseError;
    }
} catch (error) {
    console.error('Firebase initialization error:', error.message);
    console.error('Service account key format:', typeof process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    console.error('Raw key length:', process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.length);
    process.exit(1);
}

const db = admin.firestore();

const allowedOrigins = [
    'http://localhost:3000', 
    'https://jye-main-web.vercel.app',
    'https://jye-main-1skc9fjoo-julians-projects-41433483.vercel.app',
    'https://jye-main-3gkbudtlw-julians-projects-41433483.vercel.app',
    'https://jye-main-pmab1hdy0-julians-projects-41433483.vercel.app'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.use(express.json());
app.use(express.static('public'));

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


