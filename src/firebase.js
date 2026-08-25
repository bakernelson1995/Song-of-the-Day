import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  collection,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
} from "firebase/firestore";
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

// ---------- Data model ----------
// song-of-the-day/shared            -> small doc: { yearFilterEnabled, teachers }
// song-of-the-day/shared/picks/{id} -> ONE DOCUMENT PER SONG
//
// Each song being its own document (instead of one big array on the shared
// doc) is what actually makes this safe for many concurrent users: adding a
// song, rating a song, or importing history only ever touches that one
// song's document. Nobody's action can overwrite anyone else's.

export const metaRef = doc(db, "song-of-the-day", "shared");
export const picksCol = collection(db, "song-of-the-day", "shared", "picks");
export const dayLocksCol = collection(db, "song-of-the-day", "shared", "dayLocks");

// ---------- Shared metadata (year filter setting, teacher registry) ----------

export async function loadMeta() {
  const snap = await getDoc(metaRef);
  return snap.exists() ? snap.data() : null;
}

export function subscribeToMeta(onData, onErr) {
  return onSnapshot(
    metaRef,
    (snap) => onData(snap.exists() ? snap.data() : null),
    (err) => {
      console.error("Meta subscription error:", err);
      if (onErr) onErr(err);
    }
  );
}

export async function setYearFilter(enabled) {
  await setDoc(metaRef, { yearFilterEnabled: enabled }, { merge: true });
}

// Registers/updates just this one person's entry in the shared teachers map,
// using a targeted field update — this avoids clobbering someone else's
// simultaneous sign-up.
export async function registerTeacher(uid, fields) {
  await setDoc(metaRef, { teachers: { [uid]: fields } }, { merge: true });
}

// ---------- Songs (one document each) ----------

export function subscribeToPicks(onData, onErr) {
  const q = query(picksCol, orderBy("date", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const picks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(picks);
    },
    (err) => {
      console.error("Picks subscription error:", err);
      if (onErr) onErr(err);
    }
  );
}

export async function addPick(pickId, fields) {
  await setDoc(doc(picksCol, pickId), fields);
}

export async function updatePick(pickId, fields) {
  await updateDoc(doc(picksCol, pickId), fields);
}

export async function deletePickDoc(pickId) {
  await deleteDoc(doc(picksCol, pickId));
}

// ---------- One-time recovery migration ----------
//
// Before songs were split into individual documents, they lived as one big
// array field (`picks`) on the shared meta document. That old field is
// still sitting there, untouched, since nothing currently writes to it —
// this pulls it out, copies each song into the new picks subcollection
// (skipping anything that looks like a duplicate of something already
// migrated), then removes the old field so this only ever needs to run once.
export async function migrateLegacyPicks() {
  const snap = await getDoc(metaRef);
  if (!snap.exists()) return { migrated: 0, found: 0 };

  const legacy = snap.data().picks;
  if (!Array.isArray(legacy) || legacy.length === 0) return { migrated: 0, found: 0 };

  const existingSnap = await getDocs(picksCol);
  const existingKeys = new Set(
    existingSnap.docs.map((d) => {
      const v = d.data();
      return `${(v.title || "").toLowerCase()}::${(v.artist || "").toLowerCase()}::${v.date}`;
    })
  );

  let migrated = 0;
  for (const p of legacy) {
    const key = `${(p.title || "").toLowerCase()}::${(p.artist || "").toLowerCase()}::${p.date}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    const { id, ...fields } = p;
    const pickId = id || Math.random().toString(36).slice(2, 10);
    await setDoc(doc(picksCol, pickId), fields);
    migrated++;
  }

  await updateDoc(metaRef, { picks: deleteField() });
  return { migrated, found: legacy.length };
}

// Sets or clears one person's rating on one song, touching nothing else on
// that document — this is the operation that used to be the riskiest one
// (every rating write used to resave the entire song list).
export async function setRating(pickId, uid, value) {
  if (value === null || value === undefined) {
    await updateDoc(doc(picksCol, pickId), { [`ratings.${uid}`]: deleteField() });
  } else {
    await updateDoc(doc(picksCol, pickId), { [`ratings.${uid}`]: value });
  }
}

// ---------- One-roll-per-day, enforced by the database itself ----------
//
// Each calendar date has a small "lock" document tracking which pick (if
// any) is the currently-active one for that day. claimAndAddPick reads that
// lock and writes the new song in a single atomic transaction — if two
// people trigger this within the same instant, Firestore guarantees only
// one of them can win; the other's transaction is retried and then sees
// the lock already taken and fails cleanly, instead of both succeeding.

export async function claimAndAddPick(date, pickId, fields) {
  const lockRef = doc(dayLocksCol, date);
  const pickRef = doc(picksCol, pickId);

  await runTransaction(db, async (tx) => {
    const lockSnap = await tx.get(lockRef);
    const activeId = lockSnap.exists() ? lockSnap.data().activePickId : null;

    if (activeId) {
      const activePickSnap = await tx.get(doc(picksCol, activeId));
      const stillActive = activePickSnap.exists() && !activePickSnap.data().rejected;
      if (stillActive) {
        const err = new Error("Today's song was already picked.");
        err.code = "ALREADY_PICKED_TODAY";
        throw err;
      }
    }

    tx.set(pickRef, fields);
    tx.set(lockRef, { activePickId: pickId });
  });
}

// Marks a pick as rejected and releases that day's lock in one atomic step,
// so the "re-roll" button that appears afterward is guaranteed to work
// rather than racing another reject/roll happening at the same moment.
export async function rejectPickAndUnlock(date, pickId) {
  const lockRef = doc(dayLocksCol, date);
  const pickRef = doc(picksCol, pickId);

  await runTransaction(db, async (tx) => {
    tx.update(pickRef, { rejected: true, previewed: false });
    tx.set(lockRef, { activePickId: null });
  });
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
