import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid'; // For generating unique session IDs

const app = express();
const PORT = process.env.PORT || 3000;

// OpenAI API Key
const apiKey = process.env.OPENAI_API_KEY;

// Firebase Configuration
try {
    const firebaseConfig = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
    };

    admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig),
    });
    console.log("Firebase Admin initialized successfully.");
} catch (error) {
    console.error("Error initializing Firebase Admin:", error.message);
    process.exit(1);
}

const db = admin.firestore();

app.use(cors());
app.use(express.json());

// Endpoint: Save User Details
app.post('/save-user', async (req, res) => {
    const { name, phone } = req.body;

    if (!name || !phone) {
        return res.status(400).json({ error: "Name and phone are required." });
    }

    try {
        const sessionId = uuidv4(); // Generate a unique session ID
        const docRef = await db.collection('chatbot-users').add({
            name,
            phone,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            sessionId
        });

        console.log(`User data saved. Session ID: ${sessionId}`);
        res.json({ success: true, sessionId });
    } catch (error) {
        console.error('Error saving user data:', error.message);
        res.status(500).json({ error: 'Failed to save user data' });
    }
});

// Endpoint: Chat with OpenAI and Save Conversations
app.post('/chat', async (req, res) => {
    const { userInput, businessInfo, sessionId } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required." });
    }

    try {
        // Fetch response from OpenAI
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [
                    { role: 'system', content: businessInfo },
                    { role: 'user', content: userInput }
                ],
                max_tokens: 300,
                temperature: 0.7
            })
        });

        const data = await response.json();
        const botResponse = data.choices[0]?.message?.content.trim() || "No response from the model.";

        // Save conversation to Firestore
        const conversationRef = db.collection('chatbot-conversations').doc(sessionId);
        const doc = await conversationRef.get();

        if (!doc.exists) {
            await conversationRef.set({
                sessionId,
                messages: [{ role: 'user', content: userInput }, { role: 'bot', content: botResponse }],
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await conversationRef.update({
                messages: admin.firestore.FieldValue.arrayUnion(
                    { role: 'user', content: userInput },
                    { role: 'bot', content: botResponse }
                )
            });
        }

        res.json({ botResponse });
    } catch (error) {
        console.error('Error processing chat:', error.message);
        res.status(500).json({ error: 'Failed to fetch response.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
