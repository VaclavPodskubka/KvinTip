// app/api/send-push/route.ts
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
    // Odstraníme případné duplicity přímo v poli pro jistotu
    const rawTokens: string[] = userData?.pushTokens || [];
    const tokens = Array.from(new Set(rawTokens)); 

    if (tokens.length === 0) {
      return NextResponse.json({ message: 'Uživatel nemá registrované push notifikace' }, { status: 200 });
    }

    // 2. Připravíme zprávy pro všechna zařízení uživatele
    const messages = tokens.map(token => ({
      token: token,
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
          // 'apns-push-type': 'alert' dává iOS vědět, že jde o viditelnou zprávu a ne o tiché pozadí
          'apns-push-type': 'alert', 
        },
        payload: {
          aps: {
            sound: 'default',
            // contentAvailable: true odebíráme, protože v kombinaci s hlavním 'notification' 
            // objektem nutilo iOS probouzet service worker a vytvářet druhou (duplicitní) zprávu
          },
        },
      },
    }));

    console.log(`Posílám balíček s ${messages.length} zprávami do Firebase...`);

    // 3. Odešleme notifikace na všechna zařízení
    const response = await messaging.sendEach(messages);
    console.log(`Úspěšně odesláno ${response.successCount} notifikací. Selhalo: ${response.failureCount}`);

    return NextResponse.json({ success: true, sentCount: response.successCount });
  } catch (error: unknown) {
    console.error('Chyba při odesílání push notifikace:', error);
    const errorMessage = error instanceof Error ? error.message : 'Neznámá chyba serveru';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}