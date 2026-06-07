// app/player/[uid]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { doc, onSnapshot, collection } from 'firebase/firestore'
import Image from 'next/image'

interface UserProfile {
  displayName: string
  credits: number
  elo: number
  avatar?: string
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
  status: string
  result: { scoreA: number; scoreB: number } | null
  credits: number
  createdAt: { seconds: number } | null
}

interface Player {
  uid: string
  displayName: string
}

interface Bet {
  id: string
  eventId: string
  userId: string
  pick: 'a' | 'draw' | 'b'
  amount: number
  odds: number
  status: 'pending' | 'won' | 'lost'
  createdAt: { seconds: number } | null
}

interface BettingEvent {
  id: string
  title: string
  teamA: string
  teamB: string
}

const glass = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1.25rem',
}

export default function PublicProfile() {
  const params = useParams()
  const router = useRouter()
  const uid = params?.uid as string

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [matches, setMatches] = useState<Match[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [bets, setBets] = useState<Bet[]>([])
  const [bettingEvents, setBettingEvents] = useState<BettingEvent[]>([])

  useEffect(() => {
    if (!uid) return
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (snap.exists()) {
        setProfile(snap.data() as UserProfile)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
    return unsub
  }, [uid])

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setPlayers(snap.docs.map(d => ({ uid: d.id, displayName: d.data().displayName })))
    })
  }, [])

  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'matches'), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match))
      const finished = all
        .filter(m => m.status === 'finished' && (m.teamA?.includes(uid) || m.teamB?.includes(uid)))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
        .slice(0, 10)
      setMatches(finished)
    })
  }, [uid])

  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'bets'), (snap) => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Bet))
        .filter(b => b.userId === uid)
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setBets(data)
    })
  }, [uid])

  useEffect(() => {
    return onSnapshot(collection(db, 'bettingEvents'), (snap) => {
      setBettingEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as BettingEvent)))
    })
  }, [])

  const getName = (id: string) => players.find(p => p.uid === id)?.displayName ?? 'Neznámý'

  const winRate = () => {
    const m = profile?.stats?.matches ?? 0
    const w = profile?.stats?.wins ?? 0
    if (m === 0) return '—'
    return Math.round((w / m) * 100) + '%'
  }

  const getMatchResult = (match: Match) => {
    if (!match.result) return null
    const inA = match.teamA?.includes(uid)
    const scoreMe = inA ? match.result.scoreA : match.result.scoreB
    const scoreOp = inA ? match.result.scoreB : match.result.scoreA
    return { won: scoreMe > scoreOp, scoreMe, scoreOp }
  }

  const betStats = {
    won: bets.filter(b => b.status === 'won').length,
    lost: bets.filter(b => b.status === 'lost').length,
    profit: bets.reduce((sum, b) => {
      if (b.status === 'won') return sum + Math.round(b.amount * b.odds) - b.amount
      if (b.status === 'lost') return sum - b.amount
      return sum
    }, 0),
  }

  if (loading) return (
    <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid rgba(168,85,247,0.1)', borderTop: '2px solid #a855f7', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Načítání profilu...</p>
      </div>
    </main>
  )

  if (!profile) return (
    <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1rem' }}>Hráč nenalezen.</p>
      <button onClick={() => router.back()} style={{ fontSize: '0.875rem', color: '#c084fc', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
        ← Zpět
      </button>
    </main>
  )

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-2xl mx-auto">
      <div className="fixed pointer-events-none"
        style={{ top: '10%', right: '5%', width: '350px', height: '350px', background: 'radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)', filter: 'blur(40px)', borderRadius: '50%' }} />

      {/* Back button */}
      <button
        onClick={() => router.back()}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px',
          fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer',
          padding: 0,
        }}
      >
        ← Zpět
      </button>

      {/* ── PROFIL KARTA ── */}
      <div style={{ ...glass, padding: '20px', marginBottom: '16px' }}>

        {/* Avatar + kredity nahoře */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
          {/* Avatar — readonly, no click */}
          <div style={{ width: '68px', height: '68px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid rgba(168,85,247,0.4)' }}>
            {profile.avatar ? (
              <Image src={profile.avatar} alt="Avatar" width={68} height={68}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.6rem', background: 'rgba(168,85,247,0.3)', color: '#e9d5ff' }}>
                {profile.displayName?.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          {/* Kredity */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontWeight: 900, fontSize: '1.6rem', color: '#c084fc', margin: 0, lineHeight: 1 }}>
              {(profile.credits ?? 1000).toLocaleString()}
            </p>
            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>kreditů</p>
          </div>
        </div>

        {/* Jméno + ELO */}
        <div style={{ marginBottom: '16px' }}>
          <h1 style={{ fontWeight: 900, fontSize: '1.4rem', color: 'white', margin: '0 0 6px', wordBreak: 'break-word' }}>
            {profile.displayName}
          </h1>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: 'rgba(129,140,248,0.15)', border: '1px solid rgba(129,140,248,0.3)', color: '#818cf8' }}>
            ⚡ {profile.elo ?? 1200} ELO
          </span>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {[
            { label: 'Zápasy', value: profile.stats?.matches ?? 0, color: '#c084fc' },
            { label: 'Výhry', value: profile.stats?.wins ?? 0, color: '#4ade80' },
            { label: 'Prohry', value: profile.stats?.losses ?? 0, color: '#f87171' },
            { label: 'Úspěšnost', value: winRate(), color: '#fbbf24' },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center', padding: '10px 4px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontWeight: 900, fontSize: '1.2rem', color: stat.color, margin: '0 0 2px' }}>{stat.value}</p>
              <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', margin: 0 }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── HISTORIE ZÁPASŮ ── */}
      <div style={{ ...glass, padding: '18px', marginBottom: '16px' }}>
        <h2 style={{ fontWeight: 700, fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px' }}>
          📋 Historie zápasů
        </h2>
        {matches.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Žádné dokončené zápasy.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {matches.map(match => {
              const result = getMatchResult(match)
              const opponent = match.teamA?.includes(uid)
                ? match.teamB?.map(getName).join(' + ')
                : match.teamA?.map(getName).join(' + ')
              const won = result?.won
              return (
                <div key={match.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: '12px', gap: '8px',
                  background: won ? 'rgba(74,222,128,0.07)' : 'rgba(239,68,68,0.06)',
                  border: won ? '1px solid rgba(74,222,128,0.2)' : '1px solid rgba(239,68,68,0.18)',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '8px',
                        background: won ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.2)',
                        border: won ? '1px solid rgba(74,222,128,0.35)' : '1px solid rgba(239,68,68,0.3)',
                        color: won ? '#4ade80' : '#f87171',
                      }}>
                        {won ? 'VÝHRA' : 'PROHRA'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{match.sport}</span>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', margin: 0, wordBreak: 'break-word' }}>
                      vs {opponent}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontWeight: 900, fontSize: '1rem', color: 'white', margin: '0 0 2px' }}>
                      {result?.scoreMe} : {result?.scoreOp}
                    </p>
                    <p style={{ fontSize: '0.72rem', fontWeight: 700, color: won ? '#4ade80' : '#f87171', margin: 0 }}>
                      {won ? `+${match.credits * 2}` : `-${match.credits}`} kr
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── SÁZKOVÉ TIKETY ── */}
      <div style={{ ...glass, padding: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h2 style={{ fontWeight: 700, fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            🎯 Tikety
          </h2>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '8px', background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }}>
              {betStats.won}W
            </span>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
              {betStats.lost}L
            </span>
            <span style={{
              fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '8px',
              background: betStats.profit >= 0 ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)',
              border: betStats.profit >= 0 ? '1px solid rgba(74,222,128,0.25)' : '1px solid rgba(239,68,68,0.25)',
              color: betStats.profit >= 0 ? '#4ade80' : '#f87171',
            }}>
              {betStats.profit >= 0 ? '+' : ''}{betStats.profit} kr
            </span>
          </div>
        </div>

        {bets.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Žádné sázky.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {bets.map(bet => {
              const event = bettingEvents.find(e => e.id === bet.eventId)
              const pickLabel = bet.pick === 'a' ? event?.teamA : bet.pick === 'b' ? event?.teamB : 'Remíza'
              const potentialWin = Math.round(bet.amount * bet.odds)
              const isWon = bet.status === 'won'
              const isLost = bet.status === 'lost'

              return (
                <div key={bet.id} style={{
                  padding: '12px 14px', borderRadius: '12px',
                  background: isWon ? 'rgba(74,222,128,0.07)' : isLost ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
                  border: isWon ? '1px solid rgba(74,222,128,0.2)' : isLost ? '1px solid rgba(239,68,68,0.18)' : '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                    <p style={{ fontWeight: 700, fontSize: '0.82rem', color: 'white', margin: 0, flex: 1, wordBreak: 'break-word' }}>
                      {event?.teamA ?? '?'} vs {event?.teamB ?? '?'}
                    </p>
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: '8px', flexShrink: 0,
                      background: isWon ? 'rgba(74,222,128,0.2)' : isLost ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.15)',
                      border: isWon ? '1px solid rgba(74,222,128,0.35)' : isLost ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(251,191,36,0.3)',
                      color: isWon ? '#4ade80' : isLost ? '#f87171' : '#fbbf24',
                    }}>
                      {isWon ? 'VÝHRA' : isLost ? 'PROHRA' : '⏳'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', margin: 0 }}>
                      Tip: <span style={{ color: 'rgba(255,255,255,0.7)' }}>{pickLabel}</span>
                      {' · '}kurz <span style={{ color: '#a855f7', fontWeight: 700 }}>{bet.odds}</span>
                      {' · '}{bet.amount} kr
                    </p>
                    <div style={{ textAlign: 'right' }}>
                      {isWon && <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#4ade80', margin: 0 }}>+{potentialWin - bet.amount} kr</p>}
                      {isLost && <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f87171', margin: 0 }}>−{bet.amount} kr</p>}
                      {bet.status === 'pending' && <p style={{ fontSize: '0.7rem', color: '#fbbf24', margin: 0 }}>možná: {potentialWin} kr</p>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}