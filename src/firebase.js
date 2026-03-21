import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAXWE-x7XbNx8YC_myqfTlxP3LPSak-eWk",
  authDomain: "morning-scroll-14e60.firebaseapp.com",
  projectId: "morning-scroll-14e60",
  storageBucket: "morning-scroll-14e60.firebasestorage.app",
  messagingSenderId: "302985952930",
  appId: "1:302985952930:web:218961064c7a89033521fb",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
