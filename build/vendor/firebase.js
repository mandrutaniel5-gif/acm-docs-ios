// Firebase for ACM Docs (accounts + public keys). Built into app/vendor/firebase.js as window.__lib.firebase.
// Only what the app uses: Auth (email/password, Google credential) and Firestore (live updates for the cloud sync).
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  updateProfile, signOut, onAuthStateChanged, reload, deleteUser, reauthenticateWithCredential,
  EmailAuthProvider, GoogleAuthProvider, signInWithCredential, signInWithCustomToken, getIdTokenResult,
  multiFactor, getMultiFactorResolver, TotpMultiFactorGenerator,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, query, where, limit, getDocs, serverTimestamp, writeBatch, orderBy, updateDoc, onSnapshot } from 'firebase/firestore';

window.__lib = window.__lib || {};
window.__lib.firebase = {
  initializeApp,
  auth: { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, updateProfile, signOut, onAuthStateChanged, reload, deleteUser, reauthenticateWithCredential, EmailAuthProvider, GoogleAuthProvider, signInWithCredential, signInWithCustomToken, getIdTokenResult, multiFactor, getMultiFactorResolver, TotpMultiFactorGenerator },
  functions: { getFunctions, httpsCallable },
  firestore: { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, query, where, limit, getDocs, serverTimestamp, writeBatch, orderBy, updateDoc, onSnapshot },
};
