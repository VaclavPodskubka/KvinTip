'use client'

import { useAuth } from '@/lib/AuthContext'
import { db } from '@/lib/firebase'
import { collection, addDoc, onSnapshot } from 'firebase/firestore'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import MatchList from '@/components/MatchList'

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
  const [players, setPlayers] = useState<Player[]>([])
  const [sport, setSport] = useState('Stolní fotbálek')
  const [format, setFormat] = useState('1v1')
  const [teamA, setTeamA] = useState<string[]>([])
  const [teamB, setTeamB] = useState<string[]>([])
  const [goals, setGoals] = useState(10)
  const [credits, setCredits] = useState(50)
  const [showForm, setShowForm] = useState(false)
  const [referee, setReferee] = useState('')
  const prevFormat = useRef(format)

  const maxPerTeam = format === '1v1' ? 1 : format === '2v2' ? 2 : 3

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
    }
  }

  const togglePlayer = (uid: string, team: 'A' | 'B') => {
    if (team === 'A') {
      if (teamA.includes(uid)) {
        setTeamA(prev => prev.filter(id => id !== uid))
      } else {
        if (teamB.includes(uid)) { toast.error('Hráč už je v týmu B!'); return }
        if (teamA.length >= maxPerTeam) { toast.error(`Tým A může mít max ${maxPerTeam} hráče!`); return }
        setTeamA(prev => [...prev, uid])
      }
    } else {
      if (teamB.includes(uid)) {
        setTeamB(prev => prev.filter(id => id !== uid))
      } else {
        if (teamA.includes(uid)) { toast.error('Hráč už je v týmu A!'); return }
        if (teamB.length >= maxPerTeam) { toast.error(`Tým B může mít max ${maxPerTeam} hráče!`); return }
        setTeamB(prev => [...prev, uid])
      }
    }
  }

  const availableReferees = players.filter(
    p => !teamA.includes(p.uid) && !teamB.includes(p.uid)
  )

  const createMatch = async () => {
    if (teamA.length !== maxPerTeam || teamB.length !== maxPerTeam) {
      toast.error(`Každý tým musí mít přesně ${maxPerTeam} hráče!`)
      return
    }
    if (!referee) { toast.error('Vyber rozhodčího!'); return }
    if (!user) return

    await addDoc(collection(db, 'matches'), {
      sport, format, teamA, teamB, goals, credits,
      status: 'pending',
      createdBy: user.uid,
      invitedPlayers: [...teamA, ...teamB],
      acceptedBy: [user.uid],
      createdAt: new Date(),
      result: null,
      referee,
    })

    toast.success('Zápas vytvořen! Pozvánky odeslány.')
    setShowForm(false)
    setTeamA([])
    setTeamB([])
    setReferee('')
  }

  const sports = ['Stolní fotbálek', 'Fotbal', 'Florbal', 'Hokej', 'Ping pong']

  const btnActive = {
    background: 'rgba(168,85,247,0.25)',
    border: '1px solid rgba(168,85,247,0.5)',
    color: '#e9d5ff',
    borderRadius: '0.75rem',
    padding: '0.375rem 0.75rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    transition: 'all 0.2s',
  }

  const btnInactive = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.4)',
    borderRadius: '0.75rem',
    padding: '0.375rem 0.75rem',
    fontSize: '0.8rem',
    fontWeight: 500,
    transition: 'all 0.2s',
    cursor: 'pointer',
  }

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div>
          <p style={{ color: 'rgba(168,85,247,0.7)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            Herní systém
          </p>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight" style={{ color: 'white' }}>Zápasy</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="font-bold py-2 px-4 md:py-2.5 md:px-6 rounded-xl transition-all duration-200 text-sm"
          style={{
            background: showForm ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
            border: showForm ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(168,85,247,0.5)',
            color: 'white',
            boxShadow: showForm ? 'none' : '0 0 20px rgba(168,85,247,0.3)',
          }}>
          {showForm ? '✕' : '+ Nový'}
        </button>
      </div>

      {/* Formulář */}
      {showForm && (
        <div className="mb-6 p-4 md:p-6" style={glass}>
          <h2 className="font-bold text-lg mb-5" style={{ color: 'white' }}>Vytvořit zápas</h2>

          {/* Sport */}
          <div className="mb-4">
            <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Sport</p>
            <div className="flex gap-2 flex-wrap">
              {sports.map(s => (
                <button key={s} onClick={() => setSport(s)} style={sport === s ? btnActive : btnInactive}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Formát */}
          <div className="mb-4">
            <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Formát</p>
            <div className="flex gap-2">
              {['1v1', '2v2', '3v3'].map(f => (
                <button key={f} onClick={() => handleFormatChange(f)} style={format === f ? btnActive : btnInactive}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Týmy — na mobilu pod sebou, na PC vedle sebe */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {(['A', 'B'] as const).map(team => (
              <div key={team} className="p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-xs font-semibold mb-2 uppercase tracking-wider"
                  style={{ color: team === 'A' ? '#93c5fd' : '#fca5a5' }}>
                  Tým {team}
                  <span className="ml-1 normal-case" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    ({(team === 'A' ? teamA : teamB).length}/{maxPerTeam})
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
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

          {/* Rozhodčí */}
          <div className="mb-4">
            <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Rozhodčí</p>
            {availableReferees.length === 0 ? (
              <p className="text-xs" style={{ color: '#fbbf24' }}>Nejsou dostupní rozhodčí.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
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

          {/* Góly a kredity — na mobilu vedle sebe */}
          <div className="flex gap-4 mb-5">
            {[
              { label: 'Do kolika gólů', val: goals, set: setGoals },
              { label: 'Kreditů/hráč', val: credits, set: setCredits },
            ].map(({ label, val, set }) => (
              <div key={label} className="flex-1">
                <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
                <input type="number" value={val}
                  onChange={e => set(Number(e.target.value))}
                  className="w-full text-center rounded-xl px-3 py-2 text-sm font-bold"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              </div>
            ))}
          </div>

          {/* Akce */}
          <div className="flex gap-3">
            <button onClick={createMatch}
              className="flex-1 md:flex-none font-bold py-2.5 px-6 rounded-xl text-sm transition-all"
              style={{
                background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                border: '1px solid rgba(168,85,247,0.5)',
                color: 'white',
                boxShadow: '0 0 20px rgba(168,85,247,0.25)',
              }}>
              Poslat pozvánky
            </button>
            <button onClick={() => setShowForm(false)}
              className="font-medium py-2.5 px-4 rounded-xl text-sm transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
              Zrušit
            </button>
          </div>
        </div>
      )}

      {/* Seznam zápasů */}
      <div className="p-4 md:p-6" style={glass}>
        <h2 className="font-bold text-base mb-5" style={{ color: 'rgba(255,255,255,0.6)' }}>Moje zápasy</h2>
        <MatchList userId={user?.uid ?? ''} players={players} />
      </div>
    </main>
  )
}