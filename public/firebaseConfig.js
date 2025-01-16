async function initFirebase() {
    try {
        const response = await fetch('/get-firebase-config');
        if (!response.ok) {
            throw new Error(`Failed to fetch Firebase config: ${response.status}`);
        }

        const firebaseConfig = await response.json();

        
        firebase.initializeApp(firebaseConfig);

        
        const db = firebase.firestore();
        window.db = db;

        console.log('Firebase initialized successfully');
    } catch (error) {
        console.error('Error initializing Firebase:', error);
    }
}

window.initFirebase = initFirebase;



