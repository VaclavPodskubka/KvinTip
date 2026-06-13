import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccountKey) {
  throw new Error("Chybí proměnná prostředí FIREBASE_SERVICE_ACCOUNT_KEY. Nastav ji ve Vercelu nebo v .env.local");
}

const serviceAccount = JSON.parse(serviceAccountKey) as ServiceAccount;

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const firestore = getFirestore();
const messaging = getMessaging();

export async function POST(request: Request) {
  try {
    const { targetUserId, title, body, url } = await request.json();

    if (!targetUserId || !title || !body) {
      return NextResponse.json({ error: 'Chybí povinné údaje' }, { status: 400 });
    }

    // 1. Vytáhneme si uživatele z Firestore admin SDK
    const userDoc = await firestore.collection('users').doc(targetUserId).get();
    
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'Uživatel nenalezen' }, { status: 404 });
    }

    const userData = userDoc.data();
    // Přísná filtrace duplicitních tokenů v poli
    const rawTokens: string[] = userData?.pushTokens || [];
    const tokens = Array.from(new Set(rawTokens.filter(t => typeof t === 'string' && t.trim() !== ''))); 

    if (tokens.length === 0) {
      return NextResponse.json({ message: 'Uživatel nemá registrované push notifikace' }, { status: 200 });
    }

    // 2. Použijeme Multicast zprávu - posílá jeden čistý payload na více tokenů najednou
    // Tím eliminujeme duplicitní chování smyček a dvojení na straně Apple APNS
    const multicastMessage = {
      tokens: tokens, // Pole všech tokenů uživatele
      notification: {
        title: title,
        body: body,
      },
      data: {
        url: url || '/',
      },
      android: {
        priority: 'high' as const,
        notification: {
          sound: 'default',
        }
      },
      apns: {
        headers: {
          'apns-push-type': 'alert',
          'apns-priority': '10', // Okamžité doručení
        },
        payload: {
          aps: {
            alert: {
              title: title,
              body: body,
            },
            sound: 'default',
          },
        },
      },
    };

    console.log(`Posílám multicast notifikaci pro uživatele ${targetUserId} na ${tokens.length} tokenů...`);

    // 3. Odešleme pomocí hromadného multicastu
    const response = await messaging.sendEachForMulticast(multicastMessage);
    console.log(`Úspěšně odesláno ${response.successCount} notifikací. Selhalo: ${response.failureCount}`);

    // Nepovinné, ale doporučené: Pokud nějaké tokeny selhaly (uživatel smazal appku), 
    // bylo by dobré je z Firestore časem vymazat, aby se pole nezanášelo mrtvými tokeny.

    return NextResponse.json({ success: true, sentCount: response.successCount });
  } catch (error: unknown) {
    console.error('Chyba při odesílání push notifikace:', error);
    const errorMessage = error instanceof Error ? error.message : 'Neznámá chyba serveru';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}