async function initFirebase() {
    try {
        if (window.db) {
            console.warn('Firebase is already initialized.');
            return; // Stop if Firebase is already initialized
        }

        // Fetch Firebase configuration from your backend endpoint
        const response = await fetch('/get-firebase-config');
        if (!response.ok) {
            throw new Error(`Failed to fetch Firebase config: HTTP ${response.status} - ${response.statusText}`);
        }

        const firebaseConfig = await response.json();

        // Initialize Firebase only if it hasn't been initialized
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            window.db = firebase.firestore();
            console.log('Firebase initialized successfully');
        } else {
            console.warn('Firebase was already initialized elsewhere.');
            window.db = firebase.firestore(); // Assign Firestore in case it's needed
        }
    } catch (error) {
        console.error('Error initializing Firebase:', error.message);
    }
}

// Make the function globally accessible
window.initFirebase = initFirebase;





