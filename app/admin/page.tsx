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
    if (!confirm(`Nastavit výsledek ${a} : ${b}? Kredity se NEPŘEPOČÍTAJÍ.`)) return
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
    if (status === 'finished') return '🏁 Hotovo'
    return status
  }

  const statusColor = (status: string) => {
    if (status === 'playing') return '#4ade80'
    if (status === 'pending') return '#fbbf24'
    return 'rgba(255,255,255,0.35)'
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

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto">

      <div className="fixed pointer-events-none"
        style={{
          top: '5%', right: '10%', width: '350px', height: '350px',
          background: 'radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)',
          filter: 'blur(40px)', borderRadius: '50%',
        }} />

      {/* Header */}
      <div className="mb-6 md:mb-8">
        <p style={{ color: 'rgba(168,85,247,0.7)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          Správa systému
        </p>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight" style={{ color: 'white' }}>Admin panel</h1>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
          Správa hráčů, kreditů a zápasů
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 md:mb-6">
        {(['players', 'matches'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: tab === t ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: tab === t ? 'rgba(168,85,247,0.25)' : 'rgba(255,255,255,0.04)',
              border: tab === t ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.08)',
              color: tab === t ? '#e9d5ff' : 'rgba(255,255,255,0.4)',
            }}
          >
            {t === 'players' ? '👥 Hráči' : '⚽ Zápasy'}
          </button>
        ))}
      </div>

      {/* ── HRÁČI ── */}
      {tab === 'players' && (
        <div className="flex flex-col gap-4">
          {players.map((player) => (
            <div key={player.uid} className="p-4 md:p-5" style={glass}>

              {/* Hráč info + Reset */}
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center font-black text-base shrink-0"
                    style={{
                      width: '44px', height: '44px', borderRadius: '50%',
                      background: 'rgba(168,85,247,0.25)',
                      border: '1px solid rgba(168,85,247,0.35)',
                      color: '#e9d5ff',
                    }}
                  >
                    {player.displayName?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-sm md:text-base" style={{ color: 'white', marginBottom: '4px' }}>
                      {player.displayName}
                    </p>
                    {/* Stats row — wraps on small screens */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <span style={{ fontSize: '0.72rem', color: '#c084fc', fontWeight: 600 }}>
                        {(player.credits ?? 0).toLocaleString()} kr
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#818cf8' }}>
                        ELO {player.elo ?? 1200}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>
                        {player.stats?.matches ?? 0} zápasů · {player.stats?.wins ?? 0}W / {player.stats?.losses ?? 0}L
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => resetStats(player.uid, player.displayName)}
                  style={{
                    flexShrink: 0,
                    fontSize: '0.75rem', fontWeight: 700,
                    padding: '6px 12px', borderRadius: '10px',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#f87171',
                    cursor: 'pointer',
                  }}
                >
                  Reset
                </button>
              </div>

              {/* Kredity + ELO — grid na všech velikostech */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                {/* Kredity */}
                <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                    Přidat / odebrat kredity
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="number"
                      placeholder="500 nebo -100"
                      value={creditAmounts[player.uid] || ''}
                      onChange={e => setCreditAmounts(prev => ({ ...prev, [player.uid]: Number(e.target.value) }))}
                      // 16px prevents iOS zoom
                      style={{
                        flex: 1, minWidth: 0,
                        fontSize: '16px', padding: '9px 12px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)', color: 'white',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => addCredits(player.uid, player.displayName)}
                      style={{
                        fontWeight: 700, fontSize: '0.85rem', padding: '9px 16px', borderRadius: '10px',
                        background: 'rgba(168,85,247,0.2)',
                        border: '1px solid rgba(168,85,247,0.4)',
                        color: '#e9d5ff', cursor: 'pointer',
                      }}
                    >
                      OK
                    </button>
                  </div>
                </div>

                {/* ELO */}
                <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                    Nastavit ELO
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="number"
                      placeholder="např. 1200"
                      value={eloAmounts[player.uid] || ''}
                      onChange={e => setEloAmounts(prev => ({ ...prev, [player.uid]: Number(e.target.value) }))}
                      style={{
                        flex: 1, minWidth: 0,
                        fontSize: '16px', padding: '9px 12px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)', color: 'white',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => setElo(player.uid, player.displayName)}
                      style={{
                        fontWeight: 700, fontSize: '0.85rem', padding: '9px 16px', borderRadius: '10px',
                        background: 'rgba(99,102,241,0.2)',
                        border: '1px solid rgba(99,102,241,0.4)',
                        color: '#a5b4fc', cursor: 'pointer',
                      }}
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ZÁPASY ── */}
      {tab === 'matches' && (
        <div className="flex flex-col gap-4">
          {matches.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Žádné zápasy.</p>
          )}
          {matches.map((match) => {
            const scoreA = match.result?.scoreA ?? 0
            const scoreB = match.result?.scoreB ?? 0
            const winnersOriginal = scoreA > scoreB ? match.teamA : match.teamB
            const losersOriginal = scoreA > scoreB ? match.teamB : match.teamA

            return (
              <div key={match.id} className="p-4 md:p-5" style={glass}>

                {/* Řádek 1: sport + formát + status + skóre */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700,
                      padding: '3px 10px', borderRadius: '20px',
                      background: 'rgba(168,85,247,0.15)',
                      border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc',
                    }}>
                      {match.sport}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>{match.format}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: statusColor(match.status) }}>
                      {statusLabel(match.status)}
                    </span>
                    {match.adminFixed && (
                      <span style={{
                        fontSize: '0.68rem', padding: '2px 8px', borderRadius: '20px',
                        background: 'rgba(251,191,36,0.1)',
                        border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24',
                      }}>
                        ✏️ Admin
                      </span>
                    )}
                  </div>
                  {match.result && (
                    <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white' }}>
                      {scoreA} : {scoreB}
                    </span>
                  )}
                </div>

                {/* Řádek 2: Týmy */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <p style={{ flex: 1, fontWeight: 700, fontSize: '0.875rem', color: '#93c5fd', wordBreak: 'break-word' }}>
                    {match.teamA.map(getName).join(' + ')}
                  </p>
                  <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>vs</span>
                  <p style={{ flex: 1, fontWeight: 700, fontSize: '0.875rem', color: '#fca5a5', textAlign: 'right', wordBreak: 'break-word' }}>
                    {match.teamB.map(getName).join(' + ')}
                  </p>
                </div>

                {/* Akce */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                  {/* Změnit status */}
                  <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                      Změnit status
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        value={editStatus[match.id] ?? match.status}
                        onChange={e => setEditStatus(prev => ({ ...prev, [match.id]: e.target.value }))}
                        style={{
                          flex: 1, fontSize: '0.875rem', padding: '9px 12px', borderRadius: '10px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)', color: 'white',
                          outline: 'none',
                        }}
                      >
                        <option value="pending" style={{ background: '#1a1a2e' }}>⏳ Čeká na schválení</option>
                        <option value="playing" style={{ background: '#1a1a2e' }}>🟢 Hraje se</option>
                        <option value="finished" style={{ background: '#1a1a2e' }}>🏁 Dokončeno</option>
                      </select>
                      <button
                        onClick={() => saveStatus(match)}
                        style={{
                          fontWeight: 700, fontSize: '0.85rem', padding: '9px 16px', borderRadius: '10px',
                          background: 'rgba(99,102,241,0.2)',
                          border: '1px solid rgba(99,102,241,0.4)',
                          color: '#a5b4fc', cursor: 'pointer',
                        }}
                      >
                        Uložit
                      </button>
                    </div>
                  </div>

                  {/* Upravit skóre */}
                  <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                      Upravit skóre{' '}
                      <span style={{ textTransform: 'none', fontWeight: 400, color: 'rgba(255,255,255,0.2)' }}>
                        (nepřepočítá kredity)
                      </span>
                    </p>
                    {/* Na mobilu: Score inputs zarovnány přehledně */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '160px' }}>
                        <span style={{ fontSize: '0.72rem', color: '#93c5fd', flexShrink: 0 }}>A</span>
                        <input
                          type="number" min={0}
                          value={editScores[match.id]?.a ?? scoreA}
                          onChange={e => setEditScores(prev => ({
                            ...prev, [match.id]: { ...prev[match.id], a: Number(e.target.value) }
                          }))}
                          style={{
                            width: '56px', fontSize: '16px', textAlign: 'center',
                            padding: '8px 6px', borderRadius: '10px',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none',
                          }}
                        />
                        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '1rem' }}>:</span>
                        <input
                          type="number" min={0}
                          value={editScores[match.id]?.b ?? scoreB}
                          onChange={e => setEditScores(prev => ({
                            ...prev, [match.id]: { ...prev[match.id], b: Number(e.target.value) }
                          }))}
                          style={{
                            width: '56px', fontSize: '16px', textAlign: 'center',
                            padding: '8px 6px', borderRadius: '10px',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none',
                          }}
                        />
                        <span style={{ fontSize: '0.72rem', color: '#fca5a5', flexShrink: 0 }}>B</span>
                      </div>
                      <button
                        onClick={() => saveScore(match)}
                        style={{
                          fontWeight: 700, fontSize: '0.85rem', padding: '9px 16px', borderRadius: '10px',
                          background: 'rgba(99,102,241,0.2)',
                          border: '1px solid rgba(99,102,241,0.4)',
                          color: '#a5b4fc', cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        Uložit
                      </button>
                    </div>
                  </div>

                  {/* Přehodit výsledek — jen dokončené */}
                  {match.status === 'finished' && match.result && (
                    <div style={{
                      padding: '14px', borderRadius: '12px',
                      background: 'rgba(239,68,68,0.05)',
                      border: '1px solid rgba(239,68,68,0.18)',
                    }}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f87171', marginBottom: '12px' }}>
                        ⚠️ Přehodit výsledek + přepočítat kredity
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                          🏆 Aktuální vítěz:{' '}
                          <span style={{ color: '#4ade80', fontWeight: 600 }}>
                            {winnersOriginal.map(getName).join(' + ')}
                          </span>
                        </p>
                        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                          ❌ Poražený:{' '}
                          <span style={{ color: '#f87171', fontWeight: 600 }}>
                            {losersOriginal.map(getName).join(' + ')}
                          </span>
                        </p>
                        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
                          → Nový vítěz:{' '}
                          <span style={{ color: '#4ade80' }}>
                            {losersOriginal.map(getName).join(' + ')}
                          </span>
                        </p>
                      </div>
                      <button
                        onClick={() => fixMatch(match)}
                        disabled={fixing === match.id}
                        style={{
                          width: '100%', fontWeight: 700, fontSize: '0.875rem',
                          padding: '11px', borderRadius: '10px',
                          background: 'rgba(249,115,22,0.18)',
                          border: '1px solid rgba(249,115,22,0.35)',
                          color: '#fdba74', cursor: fixing === match.id ? 'not-allowed' : 'pointer',
                          opacity: fixing === match.id ? 0.5 : 1,
                          transition: 'all 0.2s',
                        }}
                      >
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