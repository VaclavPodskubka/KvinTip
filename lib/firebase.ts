import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAM2V_YgVEpZgz-uDXwQ4jxEfwhOSsJQUA",
  authDomain: "kvintip-dfa19.firebaseapp.com",
  projectId: "kvintip-dfa19",
  storageBucket: "kvintip-dfa19.firebasestorage.app",
  messagingSenderId: "533176587446",
  appId: "1:533176587446:web:b030dc7abb3c44a2af4217"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const provider = new GoogleAuthProvider()
export const db = getFirestore(app)

setPersistence(auth, browserLocalPersistence)