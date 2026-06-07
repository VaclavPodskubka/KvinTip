'use client'

import { useEffect, useRef, useState } from 'react'
import { db } from '@/lib/firebase'
import { collection, onSnapshot } from 'firebase/firestore'
import { useAuth } from '@/lib/AuthContext'
import Image from 'next/image'
import Link from 'next/link'

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

  useEffect(() => { mountedRef.current = true }, [])

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setPlayers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Player)))
    })
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

  const rowStyle = (isMe: boolean) => ({
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    borderLeft: isMe ? '2px solid rgba(168,85,247,0.6)' : '2px solid transparent',
    background: isMe ? 'rgba(168,85,247,0.05)' : 'transparent',
    textDecoration: 'none',
    display: 'grid',
    gridTemplateColumns: '2.5rem 1fr 5rem 5rem 5rem 6rem 5rem 6rem',
    gap: '0.5rem',
    padding: '0.875rem 1.25rem',
    alignItems: 'center',
    transition: 'background 0.15s',
  })

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-5xl mx-auto">
      <div className="fixed pointer-events-none"
        style={{ top: '15%', right: '10%', width: '350px', height: '350px', background: 'radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)', filter: 'blur(40px)', borderRadius: '50%' }} />

      <div className="mb-6 md:mb-8">
        <p style={{ color: 'rgba(168,85,247,0.7)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          Pořadí hráčů
        </p>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight" style={{ color: 'white' }}>Žebříček</h1>
      </div>

      <div className="flex gap-2 mb-4 md:mb-6">
        <button onClick={() => setSortBy('credits')} style={sortBy === 'credits' ? btnActive : btnInactive}>
          💰 Kredity
        </button>
        <button onClick={() => setSortBy('elo')} style={sortBy === 'elo' ? btnActive : btnInactive}>
          ⚡ ELO
        </button>
      </div>

      {/* ── DESKTOP tabulka ── */}
      <div className="hidden md:block overflow-hidden" style={glass}>
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

        {/* Řádky — klikatelné */}
        {sorted.map((player, index) => {
          const isMe = player.uid === user?.uid
          const winRate = getWinRate(player)
          return (
            <Link
              key={player.uid}
              href={`/player/${player.uid}`}
              style={rowStyle(isMe)}
              onMouseEnter={e => { if (!isMe) (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.025)' }}
              onMouseLeave={e => { if (!isMe) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
            >
              <div style={{ textAlign: 'center' }}>
                {index < 3 ? <span style={{ fontSize: '1.1rem' }}>{medals[index]}</span>
                  : <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>{index + 1}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: isMe ? '1.5px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.1)' }}>
                  {player.avatar ? (
                    <Image src={player.avatar} alt={player.displayName} width={36} height={36} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'rgba(168,85,247,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e9d5ff', fontWeight: 700, fontSize: '0.8rem' }}>
                      {player.displayName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 700, color: isMe ? '#e9d5ff' : 'white', margin: 0 }}>{player.displayName}</p>
                  {isMe && <p style={{ fontSize: '0.65rem', color: 'rgba(168,85,247,0.7)', margin: 0, fontWeight: 600 }}>ty</p>}
                </div>
              </div>
              <div style={{ textAlign: 'center', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>{player.stats?.matches ?? 0}</div>
              <div style={{ textAlign: 'center', fontSize: '0.875rem', fontWeight: 700, color: '#4ade80' }}>{player.stats?.wins ?? 0}</div>
              <div style={{ textAlign: 'center', fontSize: '0.875rem', fontWeight: 700, color: '#f87171' }}>{player.stats?.losses ?? 0}</div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: player.stats?.matches === 0 ? 'rgba(255,255,255,0.2)' : winRate >= 60 ? '#4ade80' : winRate >= 40 ? '#fbbf24' : '#f87171' }}>
                  {player.stats?.matches === 0 ? '—' : `${winRate}%`}
                </span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#c084fc' }}>{player.elo ?? 1200}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: sortBy === 'credits' ? '#e9d5ff' : 'white' }}>{(player.credits ?? 1000).toLocaleString()}</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginLeft: '0.25rem' }}>kr</span>
              </div>
            </Link>
          )
        })}
        {sorted.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Žádní hráči zatím...</div>
        )}
      </div>

      {/* ── MOBIL karty ── */}
      <div className="flex flex-col gap-2 md:hidden">
        {sorted.map((player, index) => {
          const isMe = player.uid === user?.uid
          const winRate = getWinRate(player)
          return (
            <Link
              key={player.uid}
              href={`/player/${player.uid}`}
              className="p-3 flex items-center gap-3"
              style={{
                ...glass,
                borderRadius: '1rem',
                borderLeft: isMe ? '2px solid rgba(168,85,247,0.6)' : '2px solid transparent',
                background: isMe ? 'rgba(168,85,247,0.07)' : 'rgba(255,255,255,0.04)',
                textDecoration: 'none',
              }}
            >
              {/* Pozice */}
              <div style={{ width: '2rem', textAlign: 'center', flexShrink: 0 }}>
                {index < 3
                  ? <span style={{ fontSize: '1.3rem' }}>{medals[index]}</span>
                  : <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)' }}>{index + 1}</span>}
              </div>

              {/* Avatar */}
              <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: isMe ? '2px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.1)' }}>
                {player.avatar ? (
                  <Image src={player.avatar} alt={player.displayName} width={40} height={40} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: 'rgba(168,85,247,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e9d5ff', fontWeight: 700, fontSize: '0.9rem' }}>
                    {player.displayName?.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Jméno + stats */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: isMe ? '#e9d5ff' : 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {player.displayName}
                  </p>
                  {isMe && <span style={{ fontSize: '0.6rem', color: '#a855f7', fontWeight: 700, background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '0.4rem', padding: '0.1rem 0.4rem' }}>TY</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{player.stats?.matches ?? 0} zápasů</span>
                  <span style={{ fontSize: '0.7rem', color: '#4ade80' }}>{player.stats?.wins ?? 0}W</span>
                  <span style={{ fontSize: '0.7rem', color: '#f87171' }}>{player.stats?.losses ?? 0}L</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: player.stats?.matches === 0 ? 'rgba(255,255,255,0.2)' : winRate >= 60 ? '#4ade80' : winRate >= 40 ? '#fbbf24' : '#f87171' }}>
                    {player.stats?.matches === 0 ? '—' : `${winRate}%`}
                  </span>
                </div>
              </div>

              {/* ELO + Kredity */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 800, color: sortBy === 'credits' ? '#e9d5ff' : 'white', margin: 0 }}>
                  {sortBy === 'credits' ? `${(player.credits ?? 1000).toLocaleString()} kr` : `${player.elo ?? 1200}`}
                </p>
                <p style={{ fontSize: '0.7rem', color: sortBy === 'credits' ? '#c084fc' : 'rgba(255,255,255,0.3)', margin: 0 }}>
                  {sortBy === 'credits' ? `⚡ ${player.elo ?? 1200} ELO` : '⚡ ELO'}
                </p>
              </div>
            </Link>
          )
        })}
        {sorted.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Žádní hráči zatím...</div>
        )}
      </div>
    </main>
  )
}