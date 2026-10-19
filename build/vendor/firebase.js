// Firebase for ACM Docs (accounts + public keys). Built into app/vendor/firebase.js as window.__lib.firebase.
// Only what the app uses: Auth (email/password, Google credential) and Firestore Lite (REST, no websockets).
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  updateProfile, signOut, onAuthStateChanged, reload, deleteUser, reauthenticateWithCredential,
  EmailAuthProvider, GoogleAuthProvider, signInWithCredential,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, query, where, limit, getDocs, serverTimestamp } from 'firebase/firestore/lite';

window.__lib = window.__lib || {};
window.__lib.firebase = {
  initializeApp,
  auth: { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, updateProfile, signOut, onAuthStateChanged, reload, deleteUser, reauthenticateWithCredential, EmailAuthProvider, GoogleAuthProvider, signInWithCredential },
  firestore: { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, query, where, limit, getDocs, serverTimestamp },
};
