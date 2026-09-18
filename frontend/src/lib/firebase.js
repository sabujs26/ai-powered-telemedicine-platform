import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Values come from your Firebase project settings — copy them into
// frontend/.env.local (see .env.example) as VITE_FIREBASE_*.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
