// lib/notifications.ts
import { getMessaging, getToken } from "firebase/messaging";
// OPRAVA: Importujeme 'app' (inicializovanou aplikaci) místo firebaseConfig
import { app, db } from "./firebase"; 
import { doc, updateDoc, arrayUnion } from "firebase/firestore";

const VAPID_KEY = "gF06RpQ2x9AzELbqMpWfcKdjbJ3kLVc5W3ecHbabnJk";

export async function requestNotificationPermission(userId: string) {
  // Ověříme, že jsme v prohlížeči a že prohlížeč notifikace podporuje
  if (typeof window === "undefined" || !("Notification" in window)) {
    console.log("Notifikace nejsou tímto zařízením podporovány.");
    return;
  }

  try {
    // 1. Vyvoláme systémové okno na povolení push zpráv
    const permission = await Notification.requestPermission();
    
    if (permission === "granted") {
      // OPRAVA: Předáváme hotovou 'app', kterou TypeScript vyžaduje
      const messaging = getMessaging(app); 
      
      // 2. Získáme unikátní Token mobilu/počítače od Firebase
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      
      if (token) {
        console.log("Push token získán:", token);
        
        // 3. Uložíme token do Firestore k přihlášenému uživateli do pole 'pushTokens'
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
          pushTokens: arrayUnion(token)
        });
        
        console.log("Token úspěšně uložen k uživateli do Firestore!");
        return token;
      }
    } else {
      console.log("Uživatel nepovolil notifikace.");
    }
  } catch (error) {
    console.error("Chyba při získávání push tokenu:", error);
  }
}