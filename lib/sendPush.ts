interface PushPayload {
  targetUserId: string; // Komu notifikace letí
  title: string;        // Nadpis (např. "⚔️ Nová výzva!")
  body: string;         // Text (např. "Pepa tě vyzval...")
  url?: string;         // Kam ho to hodí po kliknutí
}

// Pomocná cache pro zabránění dvojitému odeslání ve stejný moment
const recentSentPushes = new Map<string, number>();

export async function sendPushNotification({ targetUserId, title, body, url = '/' }: PushPayload) {
  // Vytvoříme unikátní klíč pro tuto konkrétní zprávu
  const pushKey = `${targetUserId}_${title}_${body}`;
  const now = Date.now();
  
  // Pokud byla stejná notifikace odeslána před méně než 2000ms (2 vteřiny), zruš ji
  if (recentSentPushes.has(pushKey)) {
    const lastSentTime = recentSentPushes.get(pushKey) || 0;
    if (now - lastSentTime < 2000) {
      console.warn('⚠️ Zachycen pokus o duplicitní odeslání notifikace. Blokováno.');
      return { success: true, ignoredDuplicate: true };
    }
  }
  
  // Uložíme aktuální čas odeslání
  recentSentPushes.set(pushKey, now);

  // Promazávání staré cache po 5 sekundách, ať nezaplňujeme paměť
  setTimeout(() => {
    if (recentSentPushes.get(pushKey) === now) {
      recentSentPushes.delete(pushKey);
    }
  }, 5000);

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