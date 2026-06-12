'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Předběžně načte stránky do paměti prohlížeče pro okamžitý skok
    router.prefetch('/dashboard')
    router.prefetch('/login')

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // router.replace je rychlejší a uživatel se nemůže vrátit zpět na načítání
        router.replace('/dashboard')
      } else {
        router.replace('/login')
      }
    })

    return () => unsubscribe()
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full animate-spin"
          style={{ border: '2px solid rgba(168,85,247,0.1)', borderTop: '2px solid #a855f7' }} />
      </div>
    </main>
  )
}