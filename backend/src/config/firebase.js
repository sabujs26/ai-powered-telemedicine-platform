import admin from "firebase-admin";

// Initializes the Firebase Admin SDK once, using service-account credentials
// from environment variables (see .env.example). Used by auth middleware to
// verify ID tokens sent from the React frontend.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Render/most hosts store multi-line keys with literal "\n" — convert back.
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

export default admin;
