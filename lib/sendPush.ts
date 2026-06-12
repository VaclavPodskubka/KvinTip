// lib/sendPush.ts

interface PushPayload {
  targetUserId: string; // Komu notifikace letí
  title: string;        // Nadpis (např. "⚔️ Nová výzva!")
  body: string;         // Text (např. "Pepa tě vyzval...")
  url?: string;         // Kam ho to hodí po kliknutí
}

export async function sendPushNotification({ targetUserId, title, body, url = '/' }: PushPayload) {
  try {
    const response = await fetch('/api/send-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targetUserId, title, body, url }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Chyba při odesílání push notifikace:', error);
    return null;
  }
}