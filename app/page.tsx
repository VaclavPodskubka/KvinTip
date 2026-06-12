'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/dashboard')
      } else {
        router.push('/login')
      }
    })
    return unsubscribe
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="w-10 h-10 rounded-full animate-spin"
        style={{ border: '2px solid rgba(168,85,247,0.1)', borderTop: '2px solid #a855f7' }} />
    </main>
  )
}