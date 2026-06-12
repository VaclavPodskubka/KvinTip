// lib/notifications.ts
import { getMessaging, getToken } from "firebase/messaging";
import { app, db } from "./firebase"; 
import { doc, updateDoc, arrayUnion } from "firebase/firestore";

const VAPID_KEY = "BNbNC4nO-uzF4memw1D2sOks_g3KMTIf11w2yFmoj8bfX4hDITjs4hdR2QsJlTOhPw9diaRP0D1bMC0YErvoVLQ";

export async function requestNotificationPermission(userId: string) {
  // 1. Ověříme, že jsme v prohlížeči a že notifikace existují
  if (typeof window === "undefined" || !("Notification" in window)) {
    console.log("Notifikace nejsou tímto zařízením podporovány.");
    alert("Notifikace nejsou tímto zařízením podporovány.");
    return;
  }

  // 2. APPLE/iOS FIX: Žádost o povolení musí proběhnout OKAMŽITĚ na začátku, bez awaitů okolo
  const permission = await Notification.requestPermission();
  
  if (permission !== "granted") {
    console.log("Uživatel nepovolil notifikace.");
    alert("Oznámení nebyla povolena. Zkontrolujte nastavení prohlížeče/systému.");
    return;
  }

  // 3. Pokud je povoleno, zbytek už může běžet asynchronně v try/catch
  try {
    const messaging = getMessaging(app); 
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    
    if (token) {
      console.log("Push token získán:", token);
      
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        pushTokens: arrayUnion(token)
      });
      
      console.log("Token úspěšně uložen do Firestore!");
      alert("Oznámení byla úspěšně aktivována!");
      return token;
    } else {
      console.log("Nepodařilo se získat token z Firebase.");
    }
  } catch (error) {
    console.error("Chyba při získávání push tokenu:", error);
    alert("Chyba při propojování s Firebase: " + (error instanceof Error ? error.message : ""));
  }
}