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
  // bettingPlayers = uids of players who actually stake credits
  // if undefined/empty → all players bet (backward compat)
  bettingPlayers?: string[]
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
  borderRadius: '1.1rem',
}

const glassGreen = {
  background: 'rgba(34,197,94,0.07)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(34,197,94,0.35)',
  borderRadius: '1.1rem',
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

  // Returns who actually bets — falls back to all players for old matches
  const getBettingUids = (match: Match): string[] => {
    if (!match.bettingPlayers || match.bettingPlayers.length === 0) {
      return allPlayerUids(match)
    }
    return match.bettingPlayers
  }

  const whoNotAccepted = (match: Match) => {
    const all = [...allPlayerUids(match), match.referee].filter(Boolean) as string[]
    return all.filter(uid => !match.acceptedBy?.includes(uid))
  }

  const acceptMatch = async (match: Match) => {
    const player = getPlayer(userId)
    if (!player) return

    const bettingUids = getBettingUids(match)
    const isBettingPlayer = bettingUids.includes(userId)

    // Only betting players need enough credits
    if (isBettingPlayer && (player.credits ?? 0) < match.credits) {
      toast.error('Nemáš dostatek kreditů!')
      return
    }

    const newAccepted = [...(match.acceptedBy ?? []), userId]
    const allRequired = [...allPlayerUids(match), match.referee].filter(Boolean) as string[]
    const allAccepted = allRequired.every(uid => newAccepted.includes(uid))

    if (allAccepted) {
      // Deduct credits only from betting players
      for (const uid of bettingUids) {
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

      const bettingUids = getBettingUids(match)
      const bettingWinners = winners.filter(uid => bettingUids.includes(uid))
      const bettingLosers = losers.filter(uid => bettingUids.includes(uid))
      const totalPot = match.credits * bettingUids.length
      const winnings = bettingWinners.length > 0 ? Math.round(totalPot / bettingWinners.length) : 0

      // Update all team members for ELO + stats regardless of betting
      for (const uid of winners) {
        const player = getPlayer(uid)
        if (!player) continue
        const opponent = getPlayer(losers[0])
        if (!opponent) continue
        const { newRatingA } = calculateElo(player.elo ?? 1200, opponent.elo ?? 1200, 'A')
        const updates: Record<string, unknown> = {
          elo: newRatingA,
          'stats.wins': (player.stats?.wins ?? 0) + 1,
          'stats.matches': (player.stats?.matches ?? 0) + 1,
        }
        // Credits only for betting winners
        if (bettingWinners.includes(uid)) {
          updates.credits = (player.credits ?? 0) + winnings
        }
        await updateDoc(doc(db, 'users', uid), updates)
      }

      for (const uid of losers) {
        const player = getPlayer(uid)
        if (!player) continue
        const opponent = getPlayer(winners[0])
        if (!opponent) continue
        const { newRatingB } = calculateElo(opponent.elo ?? 1200, player.elo ?? 1200, 'A')
        const updates: Record<string, unknown> = {
          elo: newRatingB,
          'stats.losses': (player.stats?.losses ?? 0) + 1,
          'stats.matches': (player.stats?.matches ?? 0) + 1,
        }
        // Non-betting losers don't lose credits (already not deducted)
        await updateDoc(doc(db, 'users', uid), updates)
      }

      await updateDoc(doc(db, 'matches', match.id), {
        status: 'finished',
        result: { scoreA, scoreB },
        liveScoreA: scoreA,
        liveScoreB: scoreB,
      })

      const winMsg = winnings > 0
        ? `Zápas dokončen! Každý vítěz dostává ${winnings} kreditů.`
        : 'Zápas dokončen!'
      toast.success(winMsg)
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {matches.map(match => {
        const notAccepted = whoNotAccepted(match)
        const isReferee = match.referee === userId
        const hasAccepted = match.acceptedBy?.includes(userId)
        const isLive = match.status === 'playing'
        const isFinished = match.status === 'finished'
        const bettingUids = getBettingUids(match)
        const iAmBetting = bettingUids.includes(userId)
        const partialBetting = match.bettingPlayers && match.bettingPlayers.length < allPlayerUids(match).length

        return (
          <div
            key={match.id}
            style={{
              ...(isLive ? glassGreen : glass),
              padding: '20px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {isLive && (
              <>
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  boxShadow: '0 0 40px rgba(34,197,94,0.15)', borderRadius: '1.1rem',
                }} />
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
                  background: 'linear-gradient(90deg, transparent, rgba(34,197,94,0.8), transparent)',
                }} />
              </>
            )}

            {/* ── ROW 1: Sport | Format | Status ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{
                fontSize: '0.75rem', fontWeight: 700,
                padding: '4px 10px', borderRadius: '20px',
                background: 'rgba(168,85,247,0.15)',
                border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc',
              }}>
                {match.sport}
              </span>

              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>
                {match.format}
              </span>

              <span style={{
                fontSize: '0.75rem', fontWeight: 700,
                padding: '4px 10px', borderRadius: '20px',
                ...(isLive ? {
                  background: 'rgba(34,197,94,0.2)',
                  border: '1px solid rgba(34,197,94,0.5)', color: '#4ade80',
                  boxShadow: '0 0 10px rgba(34,197,94,0.2)',
                } : isFinished ? {
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)',
                } : {
                  background: 'rgba(251,191,36,0.12)',
                  border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24',
                }),
              }}>
                {isLive ? '🟢 Hraje se' : isFinished ? '🏁 Hotovo' : '⏳ Čeká'}
              </span>
            </div>

            {/* ── ROW 2: Týmy + skóre ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 1, textAlign: 'left' }}>
                {match.teamA.map(uid => (
                  <p key={uid} style={{ fontWeight: 900, fontSize: '1rem', color: '#93c5fd', lineHeight: 1.3, margin: 0 }}>
                    {getName(uid)}
                  </p>
                ))}
              </div>

              {(isLive || isFinished) ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 16px', borderRadius: '14px', flexShrink: 0,
                  background: isLive ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
                  border: isLive ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)',
                  boxShadow: isLive ? '0 0 16px rgba(34,197,94,0.15)' : 'none',
                }}>
                  <span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums' }}>
                    {isFinished && match.result ? match.result.scoreA : (match.liveScoreA ?? 0)}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '1.1rem' }}>:</span>
                  <span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums' }}>
                    {isFinished && match.result ? match.result.scoreB : (match.liveScoreB ?? 0)}
                  </span>
                </div>
              ) : (
                <span style={{
                  fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                  padding: '6px 12px', borderRadius: '20px',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.25)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  vs
                </span>
              )}

              <div style={{ flex: 1, textAlign: 'right' }}>
                {match.teamB.map(uid => (
                  <p key={uid} style={{ fontWeight: 900, fontSize: '1rem', color: '#fca5a5', lineHeight: 1.3, margin: 0 }}>
                    {getName(uid)}
                  </p>
                ))}
              </div>
            </div>

            {/* ── ROW 3: Info chips ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <span style={{
                fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px',
                background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
                ⚽ {match.goals} gólů
              </span>

              {/* Show betting info */}
              {partialBetting ? (
                <span style={{
                  fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px',
                  background: 'rgba(251,191,36,0.1)', color: '#fbbf24',
                  border: '1px solid rgba(251,191,36,0.2)',
                }}>
                  💰 {bettingUids.length}× {match.credits} kr
                </span>
              ) : (
                <span style={{
                  fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px',
                  background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  💰 {match.credits} kr / hráč
                </span>
              )}

              {match.referee && (
                <span style={{
                  fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px',
                  background: 'rgba(251,191,36,0.1)', color: '#fbbf24',
                  border: '1px solid rgba(251,191,36,0.2)',
                }}>
                  ⚖️ {getName(match.referee)}
                </span>
              )}
            </div>

            {/* Kdo nesází (jen info, když je částečné sázení) */}
            {partialBetting && !isFinished && (
              <div style={{
                marginBottom: '12px', padding: '8px 14px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center',
              }}>
                {iAmBetting
                  ? '💰 Ty sázíš kredity'
                  : '🎮 Ty hraješ bez sázky'}
                {' · '}Sázejí:{' '}
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {bettingUids.map(getName).join(', ')}
                </span>
              </div>
            )}

            {/* ── Čeká na ── */}
            {match.status === 'pending' && notAccepted.length > 0 && (
              <div style={{
                marginBottom: '12px', padding: '8px 14px', borderRadius: '12px', textAlign: 'center',
                background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
                fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)',
              }}>
                Čeká na:{' '}
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                  {notAccepted.map(getName).join(', ')}
                </span>
              </div>
            )}

            {/* ── Přijmout / Přijato ── */}
            {match.status === 'pending' && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {!hasAccepted ? (
                  <button
                    onClick={() => acceptMatch(match)}
                    style={{
                      width: '100%', maxWidth: '320px',
                      fontWeight: 700, fontSize: '0.9rem',
                      padding: '12px', borderRadius: '14px',
                      background: 'rgba(168,85,247,0.18)',
                      border: '1px solid rgba(168,85,247,0.4)',
                      color: '#e9d5ff', cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLButtonElement
                      el.style.background = 'rgba(168,85,247,0.32)'
                      el.style.boxShadow = '0 0 20px rgba(168,85,247,0.3)'
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLButtonElement
                      el.style.background = 'rgba(168,85,247,0.18)'
                      el.style.boxShadow = 'none'
                    }}
                  >
                    {iAmBetting
                      ? `Přijmout · vsadím ${match.credits} kr`
                      : 'Přijmout · hraju bez sázky'}
                  </button>
                ) : (
                  <span style={{
                    fontSize: '0.82rem', fontWeight: 600,
                    padding: '8px 16px', borderRadius: '20px',
                    background: 'rgba(34,197,94,0.1)',
                    border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80',
                  }}>
                    ✓ Přijato tebou
                  </span>
                )}
              </div>
            )}

            {/* ── Live info pro hráče ── */}
            {isLive && !isReferee && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4ade80', animation: 'pulse 2s infinite' }} />
                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4ade80', margin: 0 }}>Zápas právě probíhá</p>
              </div>
            )}

            {/* ── Rozhodčí panel ── */}
            {isLive && isReferee && (
              <div style={{
                marginTop: '16px', paddingTop: '16px',
                borderTop: '1px solid rgba(34,197,94,0.2)',
                display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center',
              }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24', margin: 0 }}>
                  ⚖️ Rozhodčí — aktualizuj skóre
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#93c5fd', fontWeight: 600 }}>A</span>
                    <input
                      type="number" min={0}
                      value={scores[match.id]?.a ?? match.liveScoreA ?? 0}
                      onChange={e => setScores(prev => ({
                        ...prev, [match.id]: { ...prev[match.id], a: Number(e.target.value) }
                      }))}
                      style={{
                        width: '56px', fontSize: '16px', textAlign: 'center',
                        padding: '9px 6px', borderRadius: '12px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)', color: 'white', outline: 'none',
                      }}
                    />
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '1.1rem' }}>:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="number" min={0}
                      value={scores[match.id]?.b ?? match.liveScoreB ?? 0}
                      onChange={e => setScores(prev => ({
                        ...prev, [match.id]: { ...prev[match.id], b: Number(e.target.value) }
                      }))}
                      style={{
                        width: '56px', fontSize: '16px', textAlign: 'center',
                        padding: '9px 6px', borderRadius: '12px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)', color: 'white', outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', color: '#fca5a5', fontWeight: 600 }}>B</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'center' }}>
                  <button
                    onClick={() => updateLiveScore(match)}
                    style={{
                      flex: 1, maxWidth: '150px',
                      fontSize: '0.8rem', fontWeight: 700, padding: '10px', borderRadius: '12px',
                      background: 'rgba(59,130,246,0.2)',
                      border: '1px solid rgba(59,130,246,0.4)', color: '#93c5fd', cursor: 'pointer',
                    }}
                  >
                    Aktualizovat
                  </button>
                  <button
                    onClick={() => finishMatch(match)}
                    disabled={submitting === match.id}
                    style={{
                      flex: 1, maxWidth: '150px',
                      fontSize: '0.8rem', fontWeight: 700, padding: '10px', borderRadius: '12px',
                      background: 'rgba(34,197,94,0.2)',
                      border: '1px solid rgba(34,197,94,0.5)', color: '#4ade80',
                      boxShadow: '0 0 12px rgba(34,197,94,0.15)',
                      opacity: submitting === match.id ? 0.5 : 1,
                      cursor: submitting === match.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {submitting === match.id ? 'Ukládám...' : 'Dokončit'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}