import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";

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
export const auth = getAuth(app);

// One shared document holds { picks, teachers }.
// `teachers` maps each signed-in person's account id ->
// { name, joinedAt, invitedBy } so the admin panel has real data to show.
export const dataRef = doc(db, "song-of-the-day", "shared");

export async function loadData() {
  const snap = await getDoc(dataRef);
  return snap.exists() ? snap.data() : null;
}

export async function saveData(data) {
  await setDoc(dataRef, data, { merge: true });
}

// Real-time listener — every teacher's screen updates live when anyone else
// picks a song, rates one, or signs up. onErr fires on read failures
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

// Registers/updates just this one person's entry in the shared teachers map,
// using a targeted field update rather than rewriting the whole document —
// this avoids clobbering someone else's simultaneous sign-up.
export async function registerTeacher(uid, fields) {
  await setDoc(dataRef, { teachers: { [uid]: fields } }, { merge: true });
}

// ---------- Auth ----------

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signUp(email, password, displayName, invitedBy) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  await registerTeacher(cred.user.uid, {
    name: displayName,
    joinedAt: new Date().toISOString(),
    invitedBy: invitedBy || null,
  });
  return cred.user;
}

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOutUser() {
  await firebaseSignOut(auth);
}
