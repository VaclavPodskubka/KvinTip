'use client'

import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { db } from '@/lib/firebase'
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import toast from 'react-hot-toast'

const ADMIN_UID = 'N6AQOKObzKX8vppAVL1siq6bnaG3'

interface PlayerStats {
  matches?: number
  wins?: number
  losses?: number
  currentStreak?: number
}

interface Player {
  uid: string
  displayName: string
  credits: number
  elo: number
  stats?: PlayerStats
}

interface Match {
  id: string
  sport: string
  format: string
  teamA: string[]
  teamB: string[]
  credits: number
  status: string
  result: { scoreA: number; scoreB: number } | null
  createdAt: { seconds: number } | null
  adminFixed?: boolean
}

const glass = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1.25rem',
}

export default function Admin() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [creditAmounts, setCreditAmounts] = useState<Record<string, number>>({})
  const [eloAmounts, setEloAmounts] = useState<Record<string, number>>({})
  const [tab, setTab] = useState<'players' | 'matches'>('players')
  const [fixing, setFixing] = useState<string | null>(null)
  const [editScores, setEditScores] = useState<Record<string, { a: number; b: number }>>({})
  const [editStatus, setEditStatus] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!loading && (!user || user.uid !== ADMIN_UID)) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setPlayers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Player)))
    })
  }, [])

  useEffect(() => {
    return onSnapshot(collection(db, 'matches'), (snap) => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Match))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
        .slice(0, 30)
      setMatches(data)
    })
  }, [])

  const getName = (uid: string) =>
    players.find(p => p.uid === uid)?.displayName ?? 'Neznámý'

  const getPlayer = (uid: string) =>
    players.find(p => p.uid === uid)

  const addCredits = async (uid: string, displayName: string) => {
    const amount = creditAmounts[uid]
    if (!amount || amount === 0) { toast.error('Zadej částku!'); return }
    const player = getPlayer(uid)
    if (!player) return
    await updateDoc(doc(db, 'users', uid), {
      credits: Math.max(0, (player.credits ?? 0) + amount)
    })
    toast.success(`${amount > 0 ? '+' : ''}${amount} kreditů → ${displayName}`)
    setCreditAmounts(prev => ({ ...prev, [uid]: 0 }))
  }

  const setElo = async (uid: string, displayName: string) => {
    const amount = eloAmounts[uid]
    if (!amount || amount <= 0) { toast.error('Zadej ELO!'); return }
    await updateDoc(doc(db, 'users', uid), { elo: amount })
    toast.success(`ELO nastaveno na ${amount} → ${displayName}`)
    setEloAmounts(prev => ({ ...prev, [uid]: 0 }))
  }

  const resetStats = async (uid: string, displayName: string) => {
    if (!confirm(`Opravdu resetovat statistiky pro ${displayName}?`)) return
    await updateDoc(doc(db, 'users', uid), {
      credits: 1000,
      elo: 1200,
      stats: { matches: 0, wins: 0, losses: 0, currentStreak: 0 }
    })
    toast.success(`Statistiky resetovány → ${displayName}`)
  }

  const fixMatch = async (match: Match) => {
    if (!match.result) return
    if (!confirm('Opravdu přehodit výsledek tohoto zápasu?')) return
    setFixing(match.id)
    try {
      const oldWinners = match.result.scoreA > match.result.scoreB ? match.teamA : match.teamB
      const oldLosers = match.result.scoreA > match.result.scoreB ? match.teamB : match.teamA
      const newWinners = oldLosers
      const totalPot = match.credits * (match.teamA.length + match.teamB.length)
      const winnings = Math.round(totalPot / newWinners.length)

      for (const uid of oldWinners) {
        const player = getPlayer(uid)
        if (!player) continue
        await updateDoc(doc(db, 'users', uid), {
          credits: Math.max(0, (player.credits ?? 0) - winnings - match.credits),
          'stats.wins': Math.max(0, (player.stats?.wins ?? 1) - 1),
          'stats.losses': (player.stats?.losses ?? 0) + 1,
        })
      }
      for (const uid of newWinners) {
        const player = getPlayer(uid)
        if (!player) continue
        await updateDoc(doc(db, 'users', uid), {
          credits: (player.credits ?? 0) + winnings + match.credits,
          'stats.wins': (player.stats?.wins ?? 0) + 1,
          'stats.losses': Math.max(0, (player.stats?.losses ?? 1) - 1),
        })
      }
      await updateDoc(doc(db, 'matches', match.id), {
        result: { scoreA: match.result.scoreB, scoreB: match.result.scoreA },
        adminFixed: true,
      })
      toast.success('Výsledek přehozen! Kredity přepočítány.')
    } catch (e) {
      console.error(e)
      toast.error('Něco se pokazilo.')
    }
    setFixing(null)
  }

  const saveScore = async (match: Match) => {
    const a = editScores[match.id]?.a
    const b = editScores[match.id]?.b
    if (a === undefined || b === undefined) { toast.error('Zadej skóre!'); return }
    if (a === b) { toast.error('Skóre nemůže být remíza!'); return }
    if (!confirm(`Nastavit výsledek ${a} : ${b}? Kredity se NEPŘEPOČÍTAJÍ — jen se uloží skóre.`)) return
    await updateDoc(doc(db, 'matches', match.id), {
      result: { scoreA: a, scoreB: b },
      liveScoreA: a,
      liveScoreB: b,
      adminFixed: true,
    })
    toast.success(`Skóre upraveno na ${a} : ${b}`)
  }

  const saveStatus = async (match: Match) => {
    const newStatus = editStatus[match.id]
    if (!newStatus) { toast.error('Vyber status!'); return }
    if (!confirm(`Opravdu změnit status na "${newStatus}"?`)) return

    const updates: Record<string, unknown> = { status: newStatus, adminFixed: true }
    if (newStatus === 'playing') {
      updates.liveScoreA = match.result?.scoreA ?? 0
      updates.liveScoreB = match.result?.scoreB ?? 0
    }
    await updateDoc(doc(db, 'matches', match.id), updates)
    toast.success(`Status změněn na: ${newStatus}`)
  }

  const statusLabel = (status: string) => {
    if (status === 'pending') return '⏳ Čeká'
    if (status === 'playing') return '🟢 Hraje se'
    if (status === 'finished') return '🏁 Dokončeno'
    return status
  }

  if (loading) return (
    <main className="flex min-h-screen items-center justify-center" style={{ background: '#0a0a0f' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full animate-spin"
          style={{ border: '2px solid rgba(168,85,247,0.1)', borderTop: '2px solid #a855f7' }} />
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Načítání...</p>
      </div>
    </main>
  )

  if (user?.uid !== ADMIN_UID) return null

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
    <main className="min-h-screen p-6 max-w-4xl mx-auto">

      <div className="fixed pointer-events-none"
        style={{
          top: '5%', right: '10%', width: '350px', height: '350px',
          background: 'radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)',
          filter: 'blur(40px)', borderRadius: '50%',
        }} />

      <div className="mb-8 opacity-100 translate-y-0 transition-all duration-700">
        <p style={{ color: 'rgba(168,85,247,0.7)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          Správa systému
        </p>
        <h1 className="text-3xl font-black tracking-tight" style={{ color: 'white' }}>Admin panel</h1>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Správa hráčů, kreditů a zápasů
        </p>
      </div>

      <div className="flex gap-2 mb-6 opacity-100 translate-y-0 transition-all duration-700">
        <button onClick={() => setTab('players')} style={tab === 'players' ? btnActive : btnInactive}>
          👥 Hráči
        </button>
        <button onClick={() => setTab('matches')} style={tab === 'matches' ? btnActive : btnInactive}>
          ⚽ Zápasy
        </button>
      </div>

      {tab === 'players' && (
        <div className="flex flex-col gap-4">
          {players.map((player, i) => (
            <div key={player.uid}
              className="p-5 opacity-100 translate-y-0 transition-all duration-700"
              style={{ ...glass, transitionDelay: `${i * 60}ms` }}>

              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-base shrink-0"
                    style={{ background: 'rgba(168,85,247,0.25)', border: '1px solid rgba(168,85,247,0.35)', color: '#e9d5ff' }}>
                    {player.displayName?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold" style={{ color: 'white' }}>{player.displayName}</p>
                    <div className="flex gap-3 mt-0.5">
                      <span style={{ fontSize: '0.75rem', color: '#c084fc' }}>{player.credits ?? 0} kr</span>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>·</span>
                      <span style={{ fontSize: '0.75rem', color: '#818cf8' }}>ELO {player.elo ?? 1200}</span>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>·</span>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{player.stats?.matches ?? 0} zápasů</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => resetStats(player.uid, player.displayName)}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLButtonElement
                    el.style.background = 'rgba(239,68,68,0.2)'
                    el.style.borderColor = 'rgba(239,68,68,0.45)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLButtonElement
                    el.style.background = 'rgba(239,68,68,0.1)'
                    el.style.borderColor = 'rgba(239,68,68,0.25)'
                  }}
                >
                  Reset
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Přidat / odebrat kredity
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="např. 500 nebo -100"
                      value={creditAmounts[player.uid] || ''}
                      onChange={e => setCreditAmounts(prev => ({ ...prev, [player.uid]: Number(e.target.value) }))}
                      className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                    />
                    <button
                      onClick={() => addCredits(player.uid, player.displayName)}
                      className="font-bold text-sm px-3 py-2 rounded-xl transition-all"
                      style={{ background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', color: '#e9d5ff' }}>
                      OK
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Nastavit ELO
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="např. 1200"
                      value={eloAmounts[player.uid] || ''}
                      onChange={e => setEloAmounts(prev => ({ ...prev, [player.uid]: Number(e.target.value) }))}
                      className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                    />
                    <button
                      onClick={() => setElo(player.uid, player.displayName)}
                      className="font-bold text-sm px-3 py-2 rounded-xl transition-all"
                      style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}>
                      OK
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'matches' && (
        <div className="flex flex-col gap-4">
          {matches.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Žádné zápasy.</p>
          )}
          {matches.map((match, i) => {
            const scoreA = match.result?.scoreA ?? 0
            const scoreB = match.result?.scoreB ?? 0
            const winnersOriginal = scoreA > scoreB ? match.teamA : match.teamB
            const losersOriginal = scoreA > scoreB ? match.teamB : match.teamA

            const statusColor =
              match.status === 'playing' ? '#4ade80' :
              match.status === 'pending' ? '#fbbf24' :
              'rgba(255,255,255,0.35)'

            return (
              <div key={match.id}
                className="p-5 opacity-100 translate-y-0 transition-all duration-700"
                style={{ ...glass, transitionDelay: `${i * 50}ms` }}>

                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc' }}>
                      {match.sport}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>{match.format}</span>
                    <span className="text-xs font-bold" style={{ color: statusColor }}>
                      {statusLabel(match.status)}
                    </span>
                    {match.adminFixed && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                        ✏️ Admin
                      </span>
                    )}
                  </div>
                  {match.result && (
                    <span className="font-black text-lg" style={{ color: 'white' }}>{scoreA} : {scoreB}</span>
                  )}
                </div>

                <div className="flex items-center gap-3 mb-4">
                  <p className="font-bold text-sm flex-1" style={{ color: '#93c5fd' }}>
                    {match.teamA.map(getName).join(' + ')}
                  </p>
                  <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)' }}>vs</span>
                  <p className="font-bold text-sm flex-1 text-right" style={{ color: '#fca5a5' }}>
                    {match.teamB.map(getName).join(' + ')}
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      Změnit status
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={editStatus[match.id] ?? match.status}
                        onChange={e => setEditStatus(prev => ({ ...prev, [match.id]: e.target.value }))}
                        className="flex-1 px-3 py-2 rounded-xl text-sm"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                        <option value="pending" style={{ background: '#1a1a2e' }}>⏳ Čeká na schválení</option>
                        <option value="playing" style={{ background: '#1a1a2e' }}>🟢 Hraje se</option>
                        <option value="finished" style={{ background: '#1a1a2e' }}>🏁 Dokončeno</option>
                      </select>
                      <button
                        onClick={() => saveStatus(match)}
                        className="font-bold text-sm px-4 py-2 rounded-xl transition-all"
                        style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}>
                        Uložit
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      Upravit skóre <span style={{ textTransform: 'none', fontWeight: 400, color: 'rgba(255,255,255,0.2)' }}>(nepřepočítá kredity)</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: '#93c5fd' }}>Tým A</span>
                      <input
                        type="number" min={0}
                        value={editScores[match.id]?.a ?? scoreA}
                        onChange={e => setEditScores(prev => ({
                          ...prev, [match.id]: { ...prev[match.id], a: Number(e.target.value) }
                        }))}
                        className="w-16 text-sm text-center rounded-xl px-2 py-2"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                      />
                      <span style={{ color: 'rgba(255,255,255,0.2)' }}>:</span>
                      <input
                        type="number" min={0}
                        value={editScores[match.id]?.b ?? scoreB}
                        onChange={e => setEditScores(prev => ({
                          ...prev, [match.id]: { ...prev[match.id], b: Number(e.target.value) }
                        }))}
                        className="w-16 text-sm text-center rounded-xl px-2 py-2"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                      />
                      <span className="text-xs" style={{ color: '#fca5a5' }}>Tým B</span>
                      <button
                        onClick={() => saveScore(match)}
                        className="ml-auto font-bold text-sm px-4 py-2 rounded-xl transition-all"
                        style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}>
                        Uložit
                      </button>
                    </div>
                  </div>

                  {match.status === 'finished' && match.result && (
                    <div className="p-3 rounded-xl"
                      style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
                      <p className="text-xs font-bold mb-2" style={{ color: '#f87171' }}>
                        ⚠️ Přehodit výsledek + přepočítat kredity
                      </p>
                      <div className="flex items-center justify-between mb-3">
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                          <p>🏆 Aktuální vítěz: <span style={{ color: '#4ade80' }}>{winnersOriginal.map(getName).join(' + ')}</span></p>
                          <p>❌ Poražený: <span style={{ color: '#f87171' }}>{losersOriginal.map(getName).join(' + ')}</span></p>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>
                          <p>→ Nový vítěz:</p>
                          <p style={{ color: '#4ade80' }}>{losersOriginal.map(getName).join(' + ')}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => fixMatch(match)}
                        disabled={fixing === match.id}
                        className="w-full font-bold py-2 px-4 rounded-xl text-sm transition-all"
                        style={{
                          background: 'rgba(249,115,22,0.2)',
                          border: '1px solid rgba(249,115,22,0.4)',
                          color: '#fdba74',
                          opacity: fixing === match.id ? 0.5 : 1,
                        }}>
                        {fixing === match.id ? 'Opravuji...' : '🔄 Přehodit výsledek a kredity'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}