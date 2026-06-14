'use client'

import { useAuth } from '@/lib/AuthContext'
import { db } from '@/lib/firebase'
import { collection, addDoc, onSnapshot } from 'firebase/firestore'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import MatchList from '@/components/MatchList'
import { sendPushNotification } from '@/lib/sendPush' // <-- Přidán import pro push notifikace
import { useSound } from '../hooks/useSound' // <-- 1. Přidán import zvukového hooku

interface Player {
  uid: string
  displayName: string
  credits: number
  elo: number
}

const glass = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1.25rem',
}

export default function Matches() {
  const { user } = useAuth()
  const { playSound } = useSound() // <-- 2. Aktivace hooku uvnitř komponenty
  const [players, setPlayers] = useState<Player[]>([])
  const [sport, setSport] = useState('Stolní fotbálek')
  const [format, setFormat] = useState('1v1')
  const [teamA, setTeamA] = useState<string[]>([])
  const [teamB, setTeamB] = useState<string[]>([])
  // bettingPlayers = subset of players who actually stake credits
  // if empty → all players bet (classic mode)
  const [bettingPlayers, setBettingPlayers] = useState<string[]>([])
  const [bettingMode, setBettingMode] = useState<'all' | 'selected'>('all')
  const [goals, setGoals] = useState(10)
  const [credits, setCredits] = useState(50)
  const [showForm, setShowForm] = useState(false)
  const [referee, setReferee] = useState('')
  const prevFormat = useRef(format)

  const maxPerTeam = format === '1v1' ? 1 : format === '2v2' ? 2 : 3
  const allTeamPlayers = [...teamA, ...teamB]

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setPlayers(snap.docs.map(d => ({
        uid: d.id,
        displayName: d.data().displayName,
        credits: d.data().credits ?? 1000,
        elo: d.data().elo ?? 1200,
      })))
    })
  }, [])

  const handleFormatChange = (f: string) => {
    if (f !== prevFormat.current) {
      prevFormat.current = f
      setFormat(f)
      setTeamA([])
      setTeamB([])
      setReferee('')
      setBettingPlayers([])
    }
  }

  const togglePlayer = (uid: string, team: 'A' | 'B') => {
    if (team === 'A') {
      if (teamA.includes(uid)) {
        setTeamA(prev => prev.filter(id => id !== uid))
        setBettingPlayers(prev => prev.filter(id => id !== uid))
      } else {
        if (teamB.includes(uid)) { toast.error('Hráč už je v týmu B!'); return }
        if (teamA.length >= maxPerTeam) { toast.error(`Tým A může mít max ${maxPerTeam} hráče!`); return }
        setTeamA(prev => [...prev, uid])
        // By default newly added player bets (in "all" mode)
        if (bettingMode === 'all') setBettingPlayers(prev => [...prev, uid])
      }
    } else {
      if (teamB.includes(uid)) {
        setTeamB(prev => prev.filter(id => id !== uid))
        setBettingPlayers(prev => prev.filter(id => id !== uid))
      } else {
        if (teamA.includes(uid)) { toast.error('Hráč už je v týmu A!'); return }
        if (teamB.length >= maxPerTeam) { toast.error(`Tým B může mít max ${maxPerTeam} hráče!`); return }
        setTeamB(prev => [...prev, uid])
        if (bettingMode === 'all') setBettingPlayers(prev => [...prev, uid])
      }
    }
  }

  const toggleBettingPlayer = (uid: string) => {
    setBettingPlayers(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    )
  }

  const handleBettingModeChange = (mode: 'all' | 'selected') => {
    setBettingMode(mode)
    if (mode === 'all') {
      // Everyone in teams bets
      setBettingPlayers([...allTeamPlayers])
    } else {
      // Start with no one selected — user picks
      setBettingPlayers([])
    }
  }

  const availableReferees = players.filter(
    p => !teamA.includes(p.uid) && !teamB.includes(p.uid)
  )

  // Validate: in "selected" mode there must be an even number of bettors
  // (at least 1 from each team, same count per team for fairness)
  const bettingA = bettingPlayers.filter(uid => teamA.includes(uid))
  const bettingB = bettingPlayers.filter(uid => teamB.includes(uid))
  const bettingValid =
    bettingMode === 'all' ||
    (bettingA.length > 0 && bettingB.length > 0 && bettingA.length === bettingB.length)

  const createMatch = async () => {
    if (teamA.length !== maxPerTeam || teamB.length !== maxPerTeam) {
      toast.error(`Každý tým musí mít přesně ${maxPerTeam} hráče!`)
      return
    }
    if (!referee) { toast.error('Vyber rozhodčího!'); return }
    if (!user) return

    if (bettingMode === 'selected' && !bettingValid) {
      toast.error('Musí sázet stejný počet hráčů z každého týmu (min. 1)!')
      return
    }

    const finalBettingPlayers = bettingMode === 'all' ? allTeamPlayers : bettingPlayers

    await addDoc(collection(db, 'matches'), {
      sport, format, teamA, teamB, goals, credits,
      status: 'pending',
      createdBy: user.uid,
      invitedPlayers: [...teamA, ...teamB],
      textToSpeech: false,
      bettingPlayers: finalBettingPlayers,
      acceptedBy: [user.uid],
      createdAt: new Date(),
      result: null,
      referee,
    })

    // ── KROK 5: Rozeslání push notifikací všem pozvaným a rozhodčímu ──
    try {
      const creatorName = players.find(p => p.uid === user.uid)?.displayName || 'Někdo'
      const targets = [...teamA, ...teamB, referee]
      
      targets.forEach(async (targetUserId) => {
        // Neposílej notifikaci sám sobě
        if (targetUserId !== user.uid) {
          const isReferee = targetUserId === referee
          await sendPushNotification({
            targetUserId,
            title: isReferee ? '📋 Žádost o rozhodování zápasu!' : '⚔️ Nová výzva na zápas!',
            body: isReferee 
              ? `${creatorName} tě vybral jako rozhodčího pro zápas v: ${sport}.`
              : `${creatorName} tě zve do zápasu v: ${sport} (${format}) o ${credits} kreditů.`,
            url: '/matches',
          })
        }
      })
    } catch (e) {
      console.error('Chyba při odesílání hromadných push notifikací:', e)
    }

    playSound('matchCreate') // <-- 3. Přehrání zvuku úspěšného vytvoření zápasu
    toast.success('Zápas vytvořen! Pozvánky odeslány.')
    setShowForm(false)
    setTeamA([])
    setTeamB([])
    setReferee('')
    setBettingPlayers([])
    setBettingMode('all')
  }

  const sports = ['Stolní fotbálek', 'Fotbal', 'Florbal', 'Hokej', 'Ping pong']

  const btnActive = {
    background: 'rgba(168,85,247,0.25)',
    border: '1px solid rgba(168,85,247,0.5)',
    color: '#e9d5ff',
    borderRadius: '0.75rem',
    padding: '0.4rem 0.85rem',
    fontSize: '0.82rem',
    fontWeight: 600,
    transition: 'all 0.2s',
    cursor: 'pointer',
  }

  const btnInactive = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.4)',
    borderRadius: '0.75rem',
    padding: '0.4rem 0.85rem',
    fontSize: '0.82rem',
    fontWeight: 500,
    transition: 'all 0.2s',
    cursor: 'pointer',
  }

  const label = {
    fontSize: '0.7rem',
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    marginBottom: '10px',
    display: 'block',
  }

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8 md:mb-10">
        <div>
          <p style={{ color: 'rgba(168,85,247,0.7)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
            Herní systém
          </p>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight" style={{ color: 'white' }}>Zápasy</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="font-bold py-2.5 px-5 md:py-3 md:px-7 rounded-xl transition-all duration-200 text-sm"
          style={{
            background: showForm ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
            border: showForm ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(168,85,247,0.5)',
            color: 'white',
            boxShadow: showForm ? 'none' : '0 0 20px rgba(168,85,247,0.3)',
          }}
        >
          {showForm ? '✕ Zavřít' : '+ Nový zápas'}
        </button>
      </div>

      {/* ── FORMULÁŘ ── */}
      {showForm && (
        <div className="mb-6 p-5 md:p-7" style={glass}>
          <h2 className="font-black text-lg mb-6" style={{ color: 'white' }}>Vytvořit zápas</h2>

          {/* Sport */}
          <div className="mb-6">
            <span style={label}>Sport</span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {sports.map(s => (
                <button key={s} onClick={() => setSport(s)} style={sport === s ? btnActive : btnInactive}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Formát */}
          <div className="mb-6">
            <span style={label}>Formát</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['1v1', '2v2', '3v3'].map(f => (
                <button key={f} onClick={() => handleFormatChange(f)} style={format === f ? btnActive : btnInactive}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Týmy */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {(['A', 'B'] as const).map(team => ( // <-- ZDE OPRAVENO (odstraněno chybné Content =)
              <div key={team} style={{
                padding: '16px',
                borderRadius: '14px',
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${team === 'A' ? 'rgba(59,130,246,0.18)' : 'rgba(239,68,68,0.18)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: team === 'A' ? '#93c5fd' : '#fca5a5', margin: 0 }}>
                    Tým {team}
                  </p>
                  <span style={{
                    padding: '2px 8px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
                    background: team === 'A' ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)',
                    color: team === 'A' ? '#93c5fd' : '#fca5a5',
                  }}>
                    {(team === 'A' ? teamA : teamB).length}/{maxPerTeam}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {players.map(p => {
                    const inA = teamA.includes(p.uid)
                    const inB = teamB.includes(p.uid)
                    const selected = team === 'A' ? inA : inB
                    const disabled = team === 'A' ? inB : inA
                    return (
                      <button key={p.uid}
                        onClick={() => !disabled && togglePlayer(p.uid, team)}
                        disabled={disabled}
                        style={selected ? {
                          ...btnActive,
                          background: team === 'A' ? 'rgba(59,130,246,0.25)' : 'rgba(239,68,68,0.25)',
                          border: team === 'A' ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(239,68,68,0.5)',
                          color: team === 'A' ? '#93c5fd' : '#fca5a5',
                        } : disabled ? {
                          ...btnInactive, opacity: 0.3, cursor: 'not-allowed',
                        } : btnInactive}>
                        {p.displayName}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ── SÁZENÍ — kdo sází ── */}
          {allTeamPlayers.length >= 2 && format !== '1v1' && (
            <div className="mb-6" style={{ padding: '16px', borderRadius: '14px', background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.15)' }}>
              <span style={label}>Kdo sází kredity?</span>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <button
                  onClick={() => handleBettingModeChange('all')}
                  style={bettingMode === 'all' ? btnActive : btnInactive}
                >
                  Všichni hráči
                </button>
                <button
                  onClick={() => handleBettingModeChange('selected')}
                  style={bettingMode === 'selected' ? {
                    ...btnActive,
                    background: 'rgba(251,191,36,0.2)',
                    border: '1px solid rgba(251,191,36,0.45)',
                    color: '#fbbf24',
                  } : btnInactive}
                >
                  Vybraní hráči
                </button>
              </div>

              {bettingMode === 'selected' && allTeamPlayers.length > 0 && (
                <div>
                  <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginBottom: '10px' }}>
                    Vyber kdo vsadí kredity — ostatní hrají bez sázky:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {allTeamPlayers.map(uid => {
                      const p = players.find(pl => pl.uid === uid)
                      if (!p) return null
                      const inA = teamA.includes(uid)
                      const isBetting = bettingPlayers.includes(uid)
                      return (
                        <button
                          key={uid}
                          onClick={() => toggleBettingPlayer(uid)}
                          style={isBetting ? {
                            ...btnActive,
                            background: inA ? 'rgba(59,130,246,0.22)' : 'rgba(239,68,68,0.22)',
                            border: inA ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(239,68,68,0.5)',
                            color: inA ? '#93c5fd' : '#fca5a5',
                          } : {
                            ...btnInactive,
                            borderStyle: 'dashed',
                          }}
                        >
                          {isBetting ? '💰 ' : ''}{p.displayName}
                          <span style={{ marginLeft: '4px', fontSize: '0.7rem', opacity: 0.6 }}>
                            ({inA ? 'A' : 'B'})
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {/* Validační hláška */}
                  {bettingA.length !== bettingB.length && bettingPlayers.length > 0 && (
                    <p style={{ fontSize: '0.72rem', color: '#fbbf24', marginTop: '10px' }}>
                      ⚠️ Musí sázet stejný počet hráčů z každého týmu
                      (A: {bettingA.length}, B: {bettingB.length})
                    </p>
                  )}
                  {bettingValid && bettingPlayers.length > 0 && (
                    <p style={{ fontSize: '0.72rem', color: '#4ade80', marginTop: '10px' }}>
                      ✓ Sázejí: {bettingPlayers.map(uid => players.find(p => p.uid === uid)?.displayName).join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Rozhodčí */}
          <div className="mb-6">
            <span style={label}>Rozhodčí</span>
            {availableReferees.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: '#fbbf24' }}>Nejsou dostupní rozhodčí.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {availableReferees.map(p => (
                  <button key={p.uid} onClick={() => setReferee(p.uid)}
                    style={referee === p.uid ? {
                      ...btnActive,
                      background: 'rgba(251,191,36,0.2)',
                      border: '1px solid rgba(251,191,36,0.4)',
                      color: '#fbbf24',
                    } : btnInactive}>
                    {p.displayName}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Góly a kredity */}
          <div className="grid grid-cols-2 gap-4 mb-7">
            {[
              { label: 'Do kolika gólů', val: goals, set: setGoals },
              { label: 'Kreditů / sázející hráč', val: credits, set: setCredits },
            ].map(({ label: lbl, val, set }) => (
              <div key={lbl}>
                <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                  {lbl}
                </p>
                <input
                  type="number"
                  value={val}
                  onChange={e => set(Number(e.target.value))}
                  style={{
                    width: '100%', textAlign: 'center', borderRadius: '12px',
                    padding: '10px', fontSize: '16px', fontWeight: 700,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)', color: 'white',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
          </div>

          {/* Akce */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={createMatch}
              style={{
                flex: 1, fontWeight: 700, padding: '13px', borderRadius: '14px', fontSize: '0.95rem',
                background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                border: '1px solid rgba(168,85,247,0.5)',
                color: 'white',
                boxShadow: '0 0 20px rgba(168,85,247,0.25)',
                cursor: 'pointer',
              }}
            >
              Poslat pozvánky
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{
                fontWeight: 500, padding: '13px 18px', borderRadius: '14px', fontSize: '0.9rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
              }}
            >
              Zrušit
            </button>
          </div>
        </div>
      )}

      {/* Seznam zápasů */}
      <div className="p-5 md:p-7" style={glass}>
        <h2 style={{ fontWeight: 700, fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '20px' }}>
          Moje zápasy
        </h2>
        <MatchList userId={user?.uid ?? ''} players={players} />
      </div>

    </main>
  )
}