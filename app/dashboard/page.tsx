'use client'

import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { db } from '@/lib/firebase'
import { doc, onSnapshot, collection } from 'firebase/firestore'
import Link from 'next/link'

interface UserProfile {
  displayName: string
  credits: number
  elo: number
  stats?: {
    matches?: number
    wins?: number
    losses?: number
    currentStreak?: number
  }
}

interface Match {
  id: string
  sport: string
  format: string
  teamA: string[]
  teamB: string[]
  goals: number
  credits: number
  status: string
  invitedPlayers: string[]
  acceptedBy: string[]
  createdBy: string
  referee: string | null
  liveScoreA?: number
  liveScoreB?: number
  result: { scoreA: number; scoreB: number } | null
}

interface Player {
  uid: string
  displayName: string
}

const glassCard = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1.25rem',
}

export default function Dashboard() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [pendingMatches, setPendingMatches] = useState<Match[]>([])
  const [liveMatches, setLiveMatches] = useState<Match[]>([])
  const [players, setPlayers] = useState<Player[]>([])

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) setProfile(snap.data() as UserProfile)
    })
  }, [user])

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setPlayers(snap.docs.map(d => ({ uid: d.id, displayName: d.data().displayName })))
    })
  }, [])

  useEffect(() => {
    if (!user) return
    return onSnapshot(collection(db, 'matches'), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match))
      setPendingMatches(all.filter(m =>
        m.status === 'pending' &&
        (m.invitedPlayers?.includes(user.uid) || m.referee === user.uid) &&
        !m.acceptedBy?.includes(user.uid)
      ))
      setLiveMatches(all.filter(m => m.status === 'playing'))
    })
  }, [user])

  const getName = (uid: string) =>
    players.find(p => p.uid === uid)?.displayName ?? 'Neznámý'

  if (loading || !profile) return (
    <main className="flex min-h-screen items-center justify-center" style={{ background: '#0a0a0f' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full animate-spin"
          style={{ border: '2px solid rgba(168,85,247,0.1)', borderTop: '2px solid #a855f7' }} />
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Načítání...</p>
      </div>
    </main>
  )

  const stats = [
    { label: 'Kredity', value: profile.credits ?? 1000, icon: '💰', color: '#a855f7', glow: 'rgba(168,85,247,0.3)' },
    { label: 'ELO Rating', value: profile.elo ?? 1200, icon: '⚡', color: '#818cf8', glow: 'rgba(129,140,248,0.3)' },
    { label: 'Zápasy', value: profile.stats?.matches ?? 0, icon: '⚽', color: '#c084fc', glow: 'rgba(192,132,252,0.3)' },
    { label: 'Výhry', value: profile.stats?.wins ?? 0, icon: '🏆', color: '#e879f9', glow: 'rgba(232,121,249,0.3)' },
  ]

  const quickLinks = [
    { href: '/matches', emoji: '⚽', label: 'Zápasy', desc: 'Vytvořit nebo přijmout' },
    { href: '/leaderboard', emoji: '🏆', label: 'Žebříček', desc: 'Kdo vede?' },
    { href: '/betting', emoji: '🎯', label: 'Sázky', desc: 'Premier League a více' },
    { href: '/profile', emoji: '👤', label: 'Profil', desc: 'Tvoje statistiky' },
  ]

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-6xl mx-auto" style={{ background: 'transparent' }}>

      <div className="fixed pointer-events-none"
        style={{ top: '10%', left: '5%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)', filter: 'blur(40px)', borderRadius: '50%' }} />
      <div className="fixed pointer-events-none"
        style={{ bottom: '20%', right: '10%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)', filter: 'blur(30px)', borderRadius: '50%' }} />

      {/* Header */}
      <div className="mb-6 md:mb-8">
        <p style={{ color: 'rgba(168,85,247,0.7)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          Vítej zpět
        </p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight" style={{ color: 'white' }}>
          {profile.displayName}
          <span style={{ marginLeft: '0.5rem' }}>👋</span>
        </h1>
      </div>

      {/* Stat karty — 2 sloupce na mobilu, 4 na PC */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        {stats.map((stat, i) => (
          <div key={stat.label}
            className="relative overflow-hidden p-4 md:p-5 group cursor-default"
            style={{ ...glassCard, transition: 'all 0.3s ease', animationDelay: `${i * 100}ms` }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLDivElement
              el.style.transform = 'translateY(-2px)'
              el.style.borderColor = 'rgba(168,85,247,0.3)'
              el.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(168,85,247,0.15)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLDivElement
              el.style.transform = 'translateY(0)'
              el.style.borderColor = 'rgba(255,255,255,0.08)'
              el.style.boxShadow = 'none'
            }}
          >
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20"
              style={{ background: stat.glow, filter: 'blur(12px)' }} />
            <div className="text-xl md:text-2xl mb-2 md:mb-3">{stat.icon}</div>
            <p className="text-2xl md:text-3xl font-black mb-1" style={{ color: 'white' }}>
              {stat.value.toLocaleString()}
            </p>
            <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>{stat.label}</p>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{ background: `linear-gradient(90deg, transparent, ${stat.color}, transparent)` }} />
          </div>
        ))}
      </div>

      {/* Čekající pozvánky */}
      {pendingMatches.length > 0 && (
        <div className="mb-6 p-4 md:p-6"
          style={{ ...glassCard, border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.04)' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#fbbf24' }} />
            <h2 className="font-bold text-base" style={{ color: '#fbbf24' }}>Čekající pozvánky</h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
              {pendingMatches.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {pendingMatches.map(match => (
              <div key={match.id} className="p-3 md:p-4 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {/* Mobil: svisle, PC: vedle sebe */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.2)' }}>
                        {match.sport}
                      </span>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{match.format}</span>
                      {match.referee === user?.uid && (
                        <span className="text-xs" style={{ color: '#fbbf24' }}>⚖️ Jsi rozhodčí</span>
                      )}
                    </div>
                    {/* Týmy na mobilu pod sebou */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: '#93c5fd' }}>
                        {match.teamA.map(getName).join(' + ')}
                      </span>
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>vs</span>
                      <span className="text-sm font-semibold" style={{ color: '#fca5a5' }}>
                        {match.teamB.map(getName).join(' + ')}
                      </span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      Do {match.goals} gólů · {match.credits} kr/hráč
                    </p>
                  </div>
                  <Link href="/matches"
                    className="text-sm font-bold px-4 py-2 rounded-xl transition-all duration-200 text-center"
                    style={{ background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', color: '#e9d5ff' }}>
                    Přijmout →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live zápasy */}
      {liveMatches.length > 0 && (
        <div className="mb-6 p-4 md:p-6"
          style={{ ...glassCard, border: '1px solid rgba(74,222,128,0.2)', background: 'rgba(74,222,128,0.03)' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#4ade80' }} />
            <h2 className="font-bold text-base" style={{ color: '#4ade80' }}>Právě se hraje</h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
              {liveMatches.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {liveMatches.map(match => (
              <div key={match.id} className="p-3 md:p-4 rounded-xl"
                style={{ background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.12)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}>
                    {match.sport}
                  </span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{match.format}</span>
                </div>

                {/* Live skóre — na mobilu svisle */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <span className="font-bold text-sm" style={{ color: '#93c5fd' }}>
                    {match.teamA.map(getName).join(' + ')}
                  </span>
                  <div className="flex items-center gap-2 px-4 py-1.5 rounded-xl self-start md:self-auto"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span className="text-2xl font-black" style={{ color: 'white' }}>{match.liveScoreA ?? 0}</span>
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '1.2rem' }}>:</span>
                    <span className="text-2xl font-black" style={{ color: 'white' }}>{match.liveScoreB ?? 0}</span>
                  </div>
                  <span className="font-bold text-sm" style={{ color: '#fca5a5' }}>
                    {match.teamB.map(getName).join(' + ')}
                  </span>
                </div>

                <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Do {match.goals} gólů · {match.credits} kr/hráč · ⚖️ {getName(match.referee ?? '')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rychlý přístup */}
      <div className="p-4 md:p-6" style={glassCard}>
        <h2 className="font-bold text-base mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>Rychlý přístup</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}
              className="p-3 md:p-4 rounded-xl text-center transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.background = 'rgba(168,85,247,0.1)'
                el.style.borderColor = 'rgba(168,85,247,0.25)'
                el.style.transform = 'translateY(-2px)'
                el.style.boxShadow = '0 8px 24px rgba(168,85,247,0.15)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.background = 'rgba(255,255,255,0.03)'
                el.style.borderColor = 'rgba(255,255,255,0.06)'
                el.style.transform = 'translateY(0)'
                el.style.boxShadow = 'none'
              }}
            >
              <p className="text-2xl md:text-3xl mb-1 md:mb-2">{link.emoji}</p>
              <p className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>{link.label}</p>
              <p className="text-xs mt-0.5 hidden md:block" style={{ color: 'rgba(255,255,255,0.3)' }}>{link.desc}</p>
            </Link>
          ))}
        </div>
      </div>

    </main>
  )
}