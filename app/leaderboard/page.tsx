'use client'

import { useEffect, useRef, useState } from 'react'
import { db } from '@/lib/firebase'
import { collection, onSnapshot } from 'firebase/firestore'
import { useAuth } from '@/lib/AuthContext'
import Image from 'next/image'

interface Player {
  uid: string
  displayName: string
  credits: number
  elo: number
  avatar?: string
  stats?: {
    matches?: number
    wins?: number
    losses?: number
  }
}

const glass = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1.25rem',
}

export default function Leaderboard() {
  const { user } = useAuth()
  const [players, setPlayers] = useState<Player[]>([])
  const [sortBy, setSortBy] = useState<'credits' | 'elo'>('credits')
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
  }, [])

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snap) => {
      const data = snap.docs.map(d => ({ uid: d.id, ...d.data() } as Player))
      setPlayers(data)
    })
    return unsubscribe
  }, [])

  const sorted = [...players].sort((a, b) =>
    sortBy === 'credits'
      ? (b.credits ?? 0) - (a.credits ?? 0)
      : (b.elo ?? 1200) - (a.elo ?? 1200)
  )

  const getWinRate = (player: Player) => {
    const matches = player.stats?.matches ?? 0
    const wins = player.stats?.wins ?? 0
    if (matches === 0) return 0
    return Math.round((wins / matches) * 100)
  }

  const medals = ['🥇', '🥈', '🥉']

  const btnActive = {
    background: 'rgba(168,85,247,0.25)',
    border: '1px solid rgba(168,85,247,0.5)',
    color: '#e9d5ff',
    borderRadius: '0.75rem',
    padding: '0.5rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  }

  const btnInactive = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.4)',
    borderRadius: '0.75rem',
    padding: '0.5rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  }

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">

      {/* Dekorativní orb */}
      <div className="fixed pointer-events-none"
        style={{
          top: '15%', right: '10%', width: '350px', height: '350px',
          background: 'radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)',
          filter: 'blur(40px)', borderRadius: '50%',
        }} />

      {/* Header */}
      <div className="mb-8">
        <p style={{ color: 'rgba(168,85,247,0.7)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          Pořadí hráčů
        </p>
        <h1 className="text-3xl font-black tracking-tight" style={{ color: 'white' }}>Žebříček</h1>
      </div>

      {/* Přepínač řazení */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setSortBy('credits')} style={sortBy === 'credits' ? btnActive : btnInactive}>
          💰 Podle kreditů
        </button>
        <button onClick={() => setSortBy('elo')} style={sortBy === 'elo' ? btnActive : btnInactive}>
          ⚡ Podle ELO
        </button>
      </div>

      {/* Tabulka */}
      <div className="overflow-hidden" style={glass}>

        {/* Hlavička */}
        <div className="grid px-5 py-3"
          style={{
            gridTemplateColumns: '2.5rem 1fr 5rem 5rem 5rem 6rem 5rem 6rem',
            gap: '0.5rem',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
          }}>
          {['#', 'Hráč', 'Zápasy', 'Výhry', 'Prohry', 'Úspěšnost', 'ELO', 'Kredity'].map((h) => (
            <span key={h} style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: h === 'Hráč' ? 'left' : 'center' }}>
              {h}
            </span>
          ))}
        </div>

        {/* Řádky */}
        {sorted.map((player, index) => {
          const isMe = player.uid === user?.uid
          const winRate = getWinRate(player)

          return (
            <div key={player.uid}
              className="grid px-5 py-3.5 items-center transition-all duration-150"
              style={{
                gridTemplateColumns: '2.5rem 1fr 5rem 5rem 5rem 6rem 5rem 6rem',
                gap: '0.5rem',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                borderLeft: isMe ? '2px solid rgba(168,85,247,0.6)' : '2px solid transparent',
                background: isMe ? 'rgba(168,85,247,0.05)' : 'transparent',
              }}
              onMouseEnter={e => {
                if (!isMe) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.025)'
              }}
              onMouseLeave={e => {
                if (!isMe) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
              }}
            >
              {/* Pozice */}
              <div style={{ textAlign: 'center' }}>
                {index < 3
                  ? <span style={{ fontSize: '1.1rem' }}>{medals[index]}</span>
                  : <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>{index + 1}</span>
                }
              </div>

              {/* Hráč */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: isMe ? '1.5px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.1)' }}>
                  {player.avatar ? (
                    <Image
                      src={player.avatar}
                      alt={player.displayName}
                      width={36}
                      height={36}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'rgba(168,85,247,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e9d5ff', fontWeight: 700, fontSize: '0.8rem' }}>
                      {player.displayName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 700, color: isMe ? '#e9d5ff' : 'white', margin: 0 }}>
                    {player.displayName}
                  </p>
                  {isMe && (
                    <p style={{ fontSize: '0.65rem', color: 'rgba(168,85,247,0.7)', margin: 0, fontWeight: 600 }}>ty</p>
                  )}
                </div>
              </div>

              {/* Zápasy */}
              <div style={{ textAlign: 'center', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
                {player.stats?.matches ?? 0}
              </div>

              {/* Výhry */}
              <div style={{ textAlign: 'center', fontSize: '0.875rem', fontWeight: 700, color: '#4ade80' }}>
                {player.stats?.wins ?? 0}
              </div>

              {/* Prohry */}
              <div style={{ textAlign: 'center', fontSize: '0.875rem', fontWeight: 700, color: '#f87171' }}>
                {player.stats?.losses ?? 0}
              </div>

              {/* Úspěšnost */}
              <div style={{ textAlign: 'center' }}>
                <span style={{
                  fontSize: '0.8rem', fontWeight: 700,
                  color: player.stats?.matches === 0 ? 'rgba(255,255,255,0.2)' :
                    winRate >= 60 ? '#4ade80' :
                    winRate >= 40 ? '#fbbf24' : '#f87171',
                }}>
                  {player.stats?.matches === 0 ? '—' : `${winRate}%`}
                </span>
              </div>

              {/* ELO */}
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#c084fc' }}>
                  {player.elo ?? 1200}
                </span>
              </div>

              {/* Kredity */}
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: sortBy === 'credits' ? '#e9d5ff' : 'white' }}>
                  {(player.credits ?? 1000).toLocaleString()}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginLeft: '0.25rem' }}>kr</span>
              </div>
            </div>
          )
        })}

        {sorted.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>
            Žádní hráči zatím...
          </div>
        )}
      </div>
    </main>
  )
}