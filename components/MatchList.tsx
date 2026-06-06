'use client'

import { db } from '@/lib/firebase'
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { calculateElo } from '@/lib/elo'

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

interface PlayerStats {
  wins?: number
  losses?: number
  matches?: number
}

interface Player {
  uid: string
  displayName: string
  credits: number
  elo: number
  stats?: PlayerStats
}

interface Props {
  userId: string
  players: Player[]
  filterStatus?: string[]
}

const glass = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
}

const glassGreen = {
  background: 'rgba(34,197,94,0.07)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(34,197,94,0.35)',
  borderRadius: '1rem',
  boxShadow: '0 0 30px rgba(34,197,94,0.12), inset 0 1px 0 rgba(34,197,94,0.15)',
}

export default function MatchList({ userId, players, filterStatus }: Props) {
  const [matches, setMatches] = useState<Match[]>([])
  const [scores, setScores] = useState<Record<string, { a: number; b: number }>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'matches'), (snap) => {
      let data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Match))
        .filter(m =>
          m.invitedPlayers?.includes(userId) ||
          m.createdBy === userId ||
          m.referee === userId
        )
      if (filterStatus) {
        data = data.filter(m => filterStatus.includes(m.status))
      }
      data.sort((a, b) => {
        const order: Record<string, number> = { pending: 0, playing: 1, finished: 2 }
        return (order[a.status] ?? 3) - (order[b.status] ?? 3)
      })
      setMatches(data)
    })
    return unsubscribe
  }, [userId, filterStatus])

  const getName = (uid: string) =>
    players.find(p => p.uid === uid)?.displayName ?? 'Neznámý'

  const getPlayer = (uid: string) =>
    players.find(p => p.uid === uid)

  const allPlayerUids = (match: Match) => [...match.teamA, ...match.teamB]

  const whoNotAccepted = (match: Match) => {
    const all = [...allPlayerUids(match), match.referee].filter(Boolean) as string[]
    return all.filter(uid => !match.acceptedBy?.includes(uid))
  }

  const acceptMatch = async (match: Match) => {
    const player = getPlayer(userId)
    if (!player) return

    const isPlayer = allPlayerUids(match).includes(userId)
    if (isPlayer && (player.credits ?? 0) < match.credits) {
      toast.error('Nemáš dostatek kreditů!')
      return
    }

    const newAccepted = [...(match.acceptedBy ?? []), userId]
    const allRequired = [...allPlayerUids(match), match.referee].filter(Boolean) as string[]
    const allAccepted = allRequired.every(uid => newAccepted.includes(uid))

    if (allAccepted) {
      for (const uid of allPlayerUids(match)) {
        const p = getPlayer(uid)
        if (!p) continue
        await updateDoc(doc(db, 'users', uid), {
          credits: Math.max(0, (p.credits ?? 0) - match.credits)
        })
      }
      await updateDoc(doc(db, 'matches', match.id), {
        acceptedBy: newAccepted,
        status: 'playing',
        liveScoreA: 0,
        liveScoreB: 0,
      })
      toast.success('Všichni přijali! Zápas začíná, kredity strženy.')
    } else {
      await updateDoc(doc(db, 'matches', match.id), {
        acceptedBy: newAccepted,
      })
      toast.success('Přijato! Čeká se na ostatní.')
    }
  }

  const updateLiveScore = async (match: Match) => {
    const a = scores[match.id]?.a ?? match.liveScoreA ?? 0
    const b = scores[match.id]?.b ?? match.liveScoreB ?? 0
    await updateDoc(doc(db, 'matches', match.id), { liveScoreA: a, liveScoreB: b })
    toast.success('Live skóre aktualizováno!')
  }

  const finishMatch = async (match: Match) => {
    const scoreA = scores[match.id]?.a ?? match.liveScoreA ?? 0
    const scoreB = scores[match.id]?.b ?? match.liveScoreB ?? 0

    if (scoreA === scoreB) {
      toast.error('Skóre nemůže být remíza!')
      return
    }

    setSubmitting(match.id)
    try {
      const winnerTeam = scoreA > scoreB ? 'A' : 'B'
      const winners = winnerTeam === 'A' ? match.teamA : match.teamB
      const losers = winnerTeam === 'A' ? match.teamB : match.teamA
      const totalPot = match.credits * allPlayerUids(match).length
      const winnings = Math.round(totalPot / winners.length)

      for (const uid of winners) {
        const player = getPlayer(uid)
        if (!player) continue
        const opponent = getPlayer(losers[0])
        if (!opponent) continue
        const { newRatingA } = calculateElo(player.elo ?? 1200, opponent.elo ?? 1200, 'A')
        await updateDoc(doc(db, 'users', uid), {
          credits: (player.credits ?? 0) + winnings,
          elo: newRatingA,
          'stats.wins': (player.stats?.wins ?? 0) + 1,
          'stats.matches': (player.stats?.matches ?? 0) + 1,
        })
      }

      for (const uid of losers) {
        const player = getPlayer(uid)
        if (!player) continue
        const opponent = getPlayer(winners[0])
        if (!opponent) continue
        const { newRatingB } = calculateElo(opponent.elo ?? 1200, player.elo ?? 1200, 'A')
        await updateDoc(doc(db, 'users', uid), {
          elo: newRatingB,
          'stats.losses': (player.stats?.losses ?? 0) + 1,
          'stats.matches': (player.stats?.matches ?? 0) + 1,
        })
      }

      await updateDoc(doc(db, 'matches', match.id), {
        status: 'finished',
        result: { scoreA, scoreB },
        liveScoreA: scoreA,
        liveScoreB: scoreB,
      })

      toast.success(`Zápas dokončen! Vítěz dostává ${winnings} kreditů.`)
    } catch (e) {
      console.error(e)
      toast.error('Něco se pokazilo.')
    }
    setSubmitting(null)
  }

  if (matches.length === 0) return (
    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Žádné zápasy zatím...</p>
  )

  return (
    <div className="flex flex-col gap-3">
      {matches.map(match => {
        const notAccepted = whoNotAccepted(match)
        const isReferee = match.referee === userId
        const hasAccepted = match.acceptedBy?.includes(userId)
        const isLive = match.status === 'playing'
        const isFinished = match.status === 'finished'

        return (
          <div key={match.id} style={isLive ? glassGreen : glass}
            className="p-4 relative overflow-hidden">

            {isLive && (
              <>
                <div className="absolute inset-0 rounded-2xl pointer-events-none animate-pulse"
                  style={{ boxShadow: '0 0 40px rgba(34,197,94,0.15)', borderRadius: '1rem' }} />
                <div className="absolute top-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(34,197,94,0.8), transparent)' }} />
              </>
            )}

            {/* Status badge — nahoře na středu na mobilu */}
            <div className="flex justify-center mb-3">
              <span className="text-xs font-bold px-3 py-1 rounded-full"
                style={
                  isLive ? {
                    background: 'rgba(34,197,94,0.2)',
                    border: '1px solid rgba(34,197,94,0.5)',
                    color: '#4ade80',
                    boxShadow: '0 0 10px rgba(34,197,94,0.2)',
                  } : isFinished ? {
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.4)',
                  } : {
                    background: 'rgba(251,191,36,0.12)',
                    border: '1px solid rgba(251,191,36,0.25)',
                    color: '#fbbf24',
                  }
                }>
                {isLive ? '🟢 Hraje se' : isFinished ? '🏁 Dokončeno' : '⏳ Čeká na schválení'}
              </span>
            </div>

            {/* Sport + formát */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{
                  background: 'rgba(168,85,247,0.15)',
                  border: '1px solid rgba(168,85,247,0.25)',
                  color: '#c084fc',
                }}>
                {match.sport}
              </span>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{match.format}</span>
            </div>

            {/* Týmy + skóre — vždy na střed */}
            <div className="flex flex-col items-center gap-2 mb-3">
              <span className="font-bold text-sm text-center" style={{ color: '#93c5fd' }}>
                {match.teamA.map(getName).join(' + ')}
              </span>

              {(isLive || isFinished) ? (
                <div className="flex items-center gap-3 px-4 py-2 rounded-xl"
                  style={{
                    background: isLive ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
                    border: isLive ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: isLive ? '0 0 16px rgba(34,197,94,0.15)' : 'none',
                  }}>
                  <span className="text-2xl font-black" style={{ color: 'white', fontVariantNumeric: 'tabular-nums' }}>
                    {isFinished && match.result ? match.result.scoreA : (match.liveScoreA ?? 0)}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '1.25rem' }}>:</span>
                  <span className="text-2xl font-black" style={{ color: 'white', fontVariantNumeric: 'tabular-nums' }}>
                    {isFinished && match.result ? match.result.scoreB : (match.liveScoreB ?? 0)}
                  </span>
                </div>
              ) : (
                <span className="text-xs font-semibold px-3 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  vs
                </span>
              )}

              <span className="font-bold text-sm text-center" style={{ color: '#fca5a5' }}>
                {match.teamB.map(getName).join(' + ')}
              </span>
            </div>

            {/* Info řádek */}
            <div className="flex gap-2 flex-wrap justify-center mb-3">
              {[
                `⚽ Do ${match.goals} gólů`,
                `💰 ${match.credits} kr/hráč`,
              ].map(info => (
                <span key={info} className="text-xs px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {info}
                </span>
              ))}
              {match.referee && (
                <span className="text-xs px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
                  ⚖️ {getName(match.referee)}
                </span>
              )}
            </div>

            {/* Čeká na */}
            {match.status === 'pending' && notAccepted.length > 0 && (
              <div className="mb-3 px-3 py-2 rounded-xl text-xs text-center"
                style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', color: 'rgba(255,255,255,0.4)' }}>
                Čeká na:{' '}
                <span style={{ color: '#fbbf24' }}>{notAccepted.map(getName).join(', ')}</span>
              </div>
            )}

            {/* Přijmout / Přijato */}
            {match.status === 'pending' && (
              <div className="flex justify-center">
                {!hasAccepted ? (
                  <button onClick={() => acceptMatch(match)}
                    className="text-sm font-bold px-5 py-2 rounded-xl transition-all duration-200 w-full"
                    style={{
                      background: 'rgba(168,85,247,0.2)',
                      border: '1px solid rgba(168,85,247,0.4)',
                      color: '#e9d5ff',
                      maxWidth: '280px',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLButtonElement
                      el.style.background = 'rgba(168,85,247,0.35)'
                      el.style.boxShadow = '0 0 16px rgba(168,85,247,0.3)'
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLButtonElement
                      el.style.background = 'rgba(168,85,247,0.2)'
                      el.style.boxShadow = 'none'
                    }}
                  >
                    Přijmout · {match.credits} kreditů
                  </button>
                ) : (
                  <span className="text-xs font-medium px-3 py-1.5 rounded-full"
                    style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80' }}>
                    ✓ Přijato tebou
                  </span>
                )}
              </div>
            )}

            {/* Rozhodčí panel */}
            {isLive && isReferee && (
              <div className="mt-4 pt-4 flex flex-col gap-3 items-center"
                style={{ borderTop: '1px solid rgba(34,197,94,0.2)' }}>
                <p className="text-xs font-bold" style={{ color: '#fbbf24' }}>⚖️ Rozhodčí — aktualizuj skóre</p>
                <div className="flex items-center gap-3 flex-wrap justify-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: '#93c5fd' }}>Tým A</span>
                    <input type="number" min={0}
                      value={scores[match.id]?.a ?? match.liveScoreA ?? 0}
                      onChange={e => setScores(prev => ({
                        ...prev, [match.id]: { ...prev[match.id], a: Number(e.target.value) }
                      }))}
                      className="w-14 text-sm text-center rounded-xl px-2 py-1.5"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }}
                    />
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>:</span>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0}
                      value={scores[match.id]?.b ?? match.liveScoreB ?? 0}
                      onChange={e => setScores(prev => ({
                        ...prev, [match.id]: { ...prev[match.id], b: Number(e.target.value) }
                      }))}
                      className="w-14 text-sm text-center rounded-xl px-2 py-1.5"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }}
                    />
                    <span className="text-xs" style={{ color: '#fca5a5' }}>Tým B</span>
                  </div>
                </div>
                <div className="flex gap-2 w-full justify-center">
                  <button onClick={() => updateLiveScore(match)}
                    className="text-xs font-bold px-4 py-2 rounded-xl transition-all flex-1"
                    style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#93c5fd', maxWidth: '140px' }}>
                    Aktualizovat
                  </button>
                  <button onClick={() => finishMatch(match)} disabled={submitting === match.id}
                    className="text-xs font-bold px-4 py-2 rounded-xl transition-all flex-1"
                    style={{
                      background: 'rgba(34,197,94,0.2)',
                      border: '1px solid rgba(34,197,94,0.5)',
                      color: '#4ade80',
                      boxShadow: '0 0 12px rgba(34,197,94,0.15)',
                      maxWidth: '140px',
                    }}>
                    {submitting === match.id ? 'Ukládám...' : 'Dokončit'}
                  </button>
                </div>
              </div>
            )}

            {isLive && !isReferee && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#4ade80' }} />
                <p className="text-xs font-medium" style={{ color: '#4ade80' }}>Zápas právě probíhá</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}