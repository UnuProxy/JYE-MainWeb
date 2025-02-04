async function initFirebase() {
    try {
        // Fetch Firebase configuration from your backend endpoint
        const response = await fetch('/get-firebase-config');
        if (!response.ok) {
            throw new Error(`Failed to fetch Firebase config: HTTP ${response.status} - ${response.statusText}`);
        }

        const firebaseConfig = await response.json();

        // Check if Firebase has already been initialized
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);

            // Initialize Firestore
            const db = firebase.firestore();
            window.db = db;

            console.log('Firebase initialized successfully');
        } else {
            console.warn('Firebase is already initialized.');
        }
    } catch (error) {
        console.error('Error initializing Firebase:', error.message);
    }
}

// Make the initFirebase function accessible globally
window.initFirebase = initFirebase;




