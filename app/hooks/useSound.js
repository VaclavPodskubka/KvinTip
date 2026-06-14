'use client';

// Mapování akcí na konkrétní soubory ve složce public/sounds/
const SOUND_FILES = {
  click: '/sounds/click.mp3',
  matchCreate: '/sounds/match-create.mp3',
  success: '/sounds/success.mp3',
  chat: '/sounds/chat.mp3',
};

export function useSound() {
  const playSound = (soundType) => {
    // Pojistka pro Next.js: Kód nesmí běžet při SSR (na serveru), pouze v prohlížeči
    if (typeof window === 'undefined') return;

    // Zkontrolujeme, zda zadaný typ zvuku existuje v našem mapování
    const soundPath = SOUND_FILES[soundType];
    
    if (!soundPath) {
      console.warn(`[useSound] Zvuk pro typ "${soundType}" nebyl nalezen v konfiguraci.`);
      return;
    }

    try {
      const audio = new Audio(soundPath);
      
      // Nastavení hlasitosti (0.0 = ticho, 1.0 = max). 
      // Pro UI efekty je 0.25 až 0.3 ideální, aby to nerušilo.
      audio.volume = 0.3; 

      // Spuštění zvuku
      audio.play().catch((err) => {
        // Zachycení situace, kdy prohlížeč zablokuje audio před první interakcí
        console.log("[useSound] Prohlížeč zablokoval automatické přehrání:", err.message);
      });
    } catch (error) {
      console.error("[useSound] Nepodařilo se přehrát zvuk:", error);
    }
  };

  return { playSound };
}