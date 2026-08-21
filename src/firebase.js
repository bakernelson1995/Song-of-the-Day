import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// One shared document holds { names, picks } — same shape the artifact used.
export const dataRef = doc(db, "song-of-the-day", "shared");

export async function loadData() {
  const snap = await getDoc(dataRef);
  return snap.exists() ? snap.data() : null;
}

export async function saveData(data) {
  await setDoc(dataRef, data);
}

// Real-time listener — every teacher's screen updates live when anyone else
// picks a song, rates one, or edits settings. onErr fires on read failures
// (e.g. offline, or Firestore rules rejecting the read).
export function subscribeToData(onData, onErr) {
  return onSnapshot(
    dataRef,
    (snap) => {
      onData(snap.exists() ? snap.data() : null);
    },
    (err) => {
      console.error("Firestore subscription error:", err);
      if (onErr) onErr(err);
    }
  );
}
