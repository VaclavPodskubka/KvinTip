// app/api/send-push/route.ts
import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import serviceAccountJson from '@/firebase-admin.json';

// Převedeme importovaný JSON na typ ServiceAccount, který Firebase Admin nativně zná
const serviceAccount = serviceAccountJson as ServiceAccount;

// Inicializace Firebase Admin
if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

// Inicializace konkrétních služeb
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
    const tokens: string[] = userData?.pushTokens || [];

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
        payload: {
          aps: {
            sound: 'default',
            contentAvailable: true
          },
        },
      },
    }));

    // 3. Odešleme notifikace na všechna zařízení
    const response = await messaging.sendEach(messages);
    console.log(`Úspěšně odesláno ${response.successCount} notifikací.`);

    return NextResponse.json({ success: true, sentCount: response.successCount });
  } catch (error: unknown) {
    console.error('Chyba při odesílání push notifikace:', error);
    const errorMessage = error instanceof Error ? error.message : 'Neznámá chyba serveru';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}