'use client'

import { auth, provider, db } from '@/lib/firebase'
import { signInWithPopup } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider)
      const user = result.user
      const userRef = doc(db, 'users', user.uid)
      const userSnap = await getDoc(userRef)
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          displayName: user.displayName,
          email: user.email,
          photo: user.photoURL,
          credits: 1000,
          elo: 1200,
          stats: { matches: 0, wins: 0, losses: 0, currentStreak: 0, highestWin: 0 },
          createdAt: new Date(),
        })
      }
      router.push('/dashboard')
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="fixed top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      <div className="fixed bottom-1/4 right-1/4 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%)', filter: 'blur(30px)' }} />

      <div className="glass-card p-10 text-center max-w-sm w-full relative"
        style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(168,85,247,0.1)' }}>

        <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center text-3xl"
          style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.3), rgba(124,58,237,0.3))', border: '1px solid rgba(168,85,247,0.4)' }}>
          🏆
        </div>

        <h1 className="text-4xl font-black mb-2 tracking-tight"
          style={{ background: 'linear-gradient(135deg, #e9d5ff, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Kvintip
        </h1>
        <p className="text-sm mb-10" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Školní ligový systém
        </p>

        {/* Google button */}
        <button onClick={handleLogin}
          className="w-full py-3.5 px-6 flex items-center justify-center gap-3 rounded-2xl font-semibold text-sm transition-all duration-200 group"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(168,85,247,0.35)',
            color: 'white',
            backdropFilter: 'blur(10px)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(168,85,247,0.15)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(168,85,247,0.6)'
            ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 20px rgba(168,85,247,0.25)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(168,85,247,0.35)'
            ;(e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'
          }}
        >
          {/* Google logo SVG */}
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Přihlásit se přes Google
        </button>

        <p className="text-xs mt-6" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Pouze pro přihlášené uživatele
        </p>
      </div>
    </main>
  )
}