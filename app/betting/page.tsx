'use client'

import { useAuth } from '@/lib/AuthContext'
import { useEffect, useState } from 'react'
import { db } from '@/lib/firebase'
import { collection, onSnapshot, addDoc, doc, updateDoc } from 'firebase/firestore'
import toast from 'react-hot-toast'

const ADMIN_UID = 'N6AQOKObzKX8vppAVL1siq6bnaG3'
const LOCK_MINUTES_BEFORE = 5

interface BettingEvent {
  id: string
  title: string
  sport: string
  teamA: string
  teamB: string
  matchTime: string
  status: 'open' | 'locked' | 'finished'
  odds: { a: number; draw: number; b: number }
  result?: 'a' | 'draw' | 'b'
  createdAt: Date
}

interface Bet {
  id: string
  eventId: string
  userId: string
  pick: 'a' | 'draw' | 'b'
  amount: number
  odds: number
  status: 'pending' | 'won' | 'lost'
}

interface Player {
  uid: string
  displayName: string
  credits: number
  avatar?: string
}

interface OddsForm {
  oddsA: number
  oddsDraw: number
  oddsB: number
  [key: string]: string | number
}

const glass = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1.25rem',
}

export default function Betting() {
  const { user } = useAuth()
  const isAdmin = user?.uid === ADMIN_UID
  const [events, setEvents] = useState<BettingEvent[]>([])
  const [bets, setBets] = useState<Bet[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [showForm, setShowForm] = useState(false)
  const [betAmounts, setBetAmounts] = useState<Record<string, number>>({})
  const [betPicks, setBetPicks] = useState<Record<string, 'a' | 'draw' | 'b'>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())
  const [view, setView] = useState<'upcoming' | 'finished'>('upcoming')

  const [form, setForm] = useState<OddsForm & { title: string; sport: string; teamA: string; teamB: string; matchTime: string }>({
    title: '',
    sport: 'Fotbal',
    teamA: '',
    teamB: '',
    matchTime: '',
    oddsA: 2.0,
    oddsDraw: 3.0,
    oddsB: 2.0,
  })

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    events.forEach(async (event) => {
      if (event.status !== 'open') return
      const matchDate = new Date(event.matchTime)
      const diffMinutes = (matchDate.getTime() - now.getTime()) / 60000
      if (diffMinutes <= LOCK_MINUTES_BEFORE) {
        await updateDoc(doc(db, 'bettingEvents', event.id), { status: 'locked' })
      }
    })
  }, [now, events])

  useEffect(() => {
    return onSnapshot(collection(db, 'bettingEvents'), (snap) => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as BettingEvent))
        .sort((a, b) => new Date(a.matchTime).getTime() - new Date(b.matchTime).getTime())
      setEvents(data)
    })
  }, [])

  useEffect(() => {
    if (!user) return
    return onSnapshot(collection(db, 'bets'), (snap) => {
      setBets(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bet)))
    })
  }, [user])

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setPlayers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Player)))
    })
  }, [])

  const getPlayer = (uid: string) => players.find(p => p.uid === uid)
  const myBetForEvent = (eventId: string) =>
    bets.find(b => b.eventId === eventId && b.userId === user?.uid)
  const betsForEvent = (eventId: string) => bets.filter(b => b.eventId === eventId)

  const timeUntilMatch = (matchTime: string) => {
    const diff = new Date(matchTime).getTime() - now.getTime()
    if (diff <= 0) return 'Právě hraje'
    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    if (hours > 24) return `za ${Math.floor(hours / 24)} dní`
    if (hours > 0) return `za ${hours}h ${minutes}m`
    return `za ${minutes} min`
  }

  const formatMatchTime = (matchTime: string) => {
    return new Date(matchTime).toLocaleString('cs-CZ', {
      day: 'numeric', month: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const createEvent = async () => {
    if (!form.teamA || !form.teamB || !form.matchTime) {
      toast.error('Vyplň všechna pole!')
      return
    }
    await addDoc(collection(db, 'bettingEvents'), {
      title: form.title || `${form.teamA} vs ${form.teamB}`,
      sport: form.sport,
      teamA: form.teamA,
      teamB: form.teamB,
      matchTime: form.matchTime,
      status: 'open',
      odds: { a: form.oddsA, draw: form.oddsDraw, b: form.oddsB },
      result: null,
      createdAt: new Date(),
    })
    toast.success('Zápas přidán!')
    setShowForm(false)
    setForm({ title: '', sport: 'Fotbal', teamA: '', teamB: '', matchTime: '', oddsA: 2.0, oddsDraw: 3.0, oddsB: 2.0 })
  }

  const settleEvent = async (eventId: string, result: 'a' | 'draw' | 'b') => {
    const event = events.find(e => e.id === eventId)
    if (!event) return
    if (!confirm(`Vyhodnotit jako "${result === 'a' ? event.teamA : result === 'b' ? event.teamB : 'Remíza'}"?`)) return

    const eventBets = betsForEvent(eventId)
    for (const bet of eventBets) {
      const won = bet.pick === result
      const player = getPlayer(bet.userId)
      if (!player) continue
      if (won) {
        await updateDoc(doc(db, 'users', bet.userId), {
          credits: (player.credits ?? 0) + Math.round(bet.amount * bet.odds)
        })
        await updateDoc(doc(db, 'bets', bet.id), { status: 'won' })
      } else {
        await updateDoc(doc(db, 'bets', bet.id), { status: 'lost' })
      }
    }
    await updateDoc(doc(db, 'bettingEvents', eventId), { status: 'finished', result })
    toast.success('Výsledek vyhodnocen!')
  }

  const placeBet = async (event: BettingEvent) => {
    const pick = betPicks[event.id]
    const amount = betAmounts[event.id]
    if (!pick) { toast.error('Vyber výsledek!'); return }
    if (!amount || amount <= 0) { toast.error('Zadej částku!'); return }

    const player = getPlayer(user!.uid)
    if (!player || player.credits < amount) { toast.error('Nemáš dost kreditů!'); return }
    if (myBetForEvent(event.id)) { toast.error('Už jsi vsadil!'); return }

    setSubmitting(event.id)
    const odds = pick === 'a' ? event.odds.a : pick === 'b' ? event.odds.b : event.odds.draw

    await addDoc(collection(db, 'bets'), {
      eventId: event.id,
      userId: user!.uid,
      pick, amount, odds,
      status: 'pending',
      createdAt: new Date(),
    })
    await updateDoc(doc(db, 'users', user!.uid), {
      credits: (player.credits ?? 0) - amount
    })
    toast.success(`Vsazeno ${amount} kreditů na kurz ${odds}!`)
    setBetAmounts(prev => ({ ...prev, [event.id]: 0 }))
    setBetPicks(prev => {
      const next = { ...prev }
      delete next[event.id]
      return next
    })
    setSubmitting(null)
  }

  const sports = ['Fotbal', 'Hokej', 'Tenis', 'Basketball', 'Stolní fotbálek']
  const filteredEvents = events.filter(e =>
    view === 'upcoming' ? e.status !== 'finished' : e.status === 'finished'
  )

  const oddsFields: { label: string; key: keyof OddsForm }[] = [
    { label: `Kurz — ${form.teamA || 'Tým A'}`, key: 'oddsA' },
    { label: 'Kurz — Remíza', key: 'oddsDraw' },
    { label: `Kurz — ${form.teamB || 'Tým B'}`, key: 'oddsB' },
  ]

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
          top: '10%', left: '5%', width: '400px', height: '400px',
          background: 'radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)',
          filter: 'blur(40px)', borderRadius: '50%',
        }} />

      <div className="flex items-center justify-between mb-8 opacity-100 translate-y-0 transition-all duration-700">
        <div>
          <p style={{ color: 'rgba(168,85,247,0.7)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            Sázkový systém · zamykání {LOCK_MINUTES_BEFORE} min před zápasem
          </p>
          <h1 className="text-3xl font-black tracking-tight" style={{ color: 'white' }}>Sázky</h1>
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm(!showForm)}
            className="font-bold py-2.5 px-6 rounded-xl text-sm transition-all duration-200"
            style={{
              background: showForm ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
              border: showForm ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(168,85,247,0.5)',
              color: 'white',
              boxShadow: showForm ? 'none' : '0 0 20px rgba(168,85,247,0.3)',
            }}>
            {showForm ? '✕ Zavřít' : '+ Přidat zápas'}
          </button>
        )}
      </div>

      {isAdmin && showForm && (
        <div className="mb-6 p-6 opacity-100 translate-y-0 transition-all duration-700" style={glass}>
          <h2 className="font-bold text-lg mb-6" style={{ color: 'white' }}>Nový zápas</h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Sport</p>
              <select value={form.sport} onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                {sports.map(s => <option key={s} style={{ background: '#1a1a2e' }}>{s}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Datum a čas</p>
              <input type="datetime-local" value={form.matchTime}
                onChange={e => setForm(f => ({ ...f, matchTime: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Tým A</p>
              <input type="text" placeholder="např. Manchester City" value={form.teamA}
                onChange={e => setForm(f => ({ ...f, teamA: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            </div>
            <div>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Tým B</p>
              <input type="text" placeholder="např. Arsenal" value={form.teamB}
                onChange={e => setForm(f => ({ ...f, teamB: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Volitelný název</p>
            <input type="text" placeholder="např. Premier League · Kolo 38" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            {oddsFields.map(({ label, key }) => (
              <div key={key}>
                <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
                <input type="number" step="0.01" min="1"
                  value={form[key] as number}
                  onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                  className="w-full rounded-xl px-3 py-2 text-sm text-center font-bold"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={createEvent}
              className="font-bold py-2.5 px-6 rounded-xl text-sm"
              style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)', border: '1px solid rgba(168,85,247,0.5)', color: 'white', boxShadow: '0 0 20px rgba(168,85,247,0.25)' }}>
              Přidat zápas
            </button>
            <button onClick={() => setShowForm(false)}
              className="font-medium py-2.5 px-6 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
              Zrušit
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6 opacity-100 translate-y-0 transition-all duration-700">
        <button onClick={() => setView('upcoming')} style={view === 'upcoming' ? btnActive : btnInactive}>
          🟢 Nadcházející
        </button>
        <button onClick={() => setView('finished')} style={view === 'finished' ? { ...btnActive, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' } : btnInactive}>
          🏁 Proběhlé
        </button>
      </div>

      {filteredEvents.length === 0 && (
        <div className="p-10 text-center" style={glass}>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>
            {view === 'upcoming' ? 'Žádné nadcházející zápasy.' : 'Žádné proběhlé zápasy.'}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {filteredEvents.map((event) => {
          const myBet = myBetForEvent(event.id)
          const eventBets = betsForEvent(event.id)
          const totalPool = eventBets.reduce((s, b) => s + b.amount, 0)
          const isLocked = event.status === 'locked' || event.status === 'finished'

          const cardStyle = event.status === 'finished'
            ? { ...glass, opacity: 0.7 }
            : event.status === 'locked'
            ? { ...glass, border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.03)' }
            : { ...glass, border: '1px solid rgba(168,85,247,0.15)' }

          return (
            <div key={event.id} className="p-5 opacity-100 translate-y-0 transition-all duration-700" style={cardStyle}>

              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc' }}>
                      {event.sport}
                    </span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                      style={
                        event.status === 'open' ? { background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' } :
                        event.status === 'locked' ? { background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' } :
                        { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }
                      }>
                      {event.status === 'open' ? '🟢 Otevřeno' : event.status === 'locked' ? '🔒 Uzamčeno' : '🏁 Hotovo'}
                    </span>
                    {event.status === 'open' && (
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
                        ⏱ {timeUntilMatch(event.matchTime)}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-black" style={{ color: 'white' }}>{event.title}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>📅 {formatMatchTime(event.matchTime)}</p>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
                  <p>{eventBets.length} sázek</p>
                  <p style={{ color: '#c084fc' }}>{totalPool} kr</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {(['a', 'draw', 'b'] as const).map(pick => {
                  const label = pick === 'a' ? event.teamA : pick === 'b' ? event.teamB : 'Remíza'
                  const odds = pick === 'a' ? event.odds.a : pick === 'b' ? event.odds.b : event.odds.draw
                  const isSelected = betPicks[event.id] === pick
                  const isResult = event.result === pick
                  const myPick = myBet?.pick === pick

                  return (
                    <button key={pick}
                      onClick={() => {
                        if (event.status === 'open' && !myBet)
                          setBetPicks(prev => ({ ...prev, [event.id]: pick }))
                      }}
                      disabled={isLocked || !!myBet}
                      className="rounded-2xl p-3 text-center transition-all duration-200"
                      style={{
                        background: isResult ? 'rgba(74,222,128,0.15)' :
                          myPick ? 'rgba(59,130,246,0.15)' :
                          isSelected ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
                        border: isResult ? '1px solid rgba(74,222,128,0.4)' :
                          myPick ? '1px solid rgba(59,130,246,0.4)' :
                          isSelected ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.07)',
                        cursor: isLocked || myBet ? 'default' : 'pointer',
                        boxShadow: isResult ? '0 0 16px rgba(74,222,128,0.15)' : isSelected ? '0 0 16px rgba(168,85,247,0.15)' : 'none',
                      }}
                    >
                      <p className="text-xs font-bold truncate mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{label}</p>
                      <p className="text-2xl font-black" style={{ color: isResult ? '#4ade80' : isSelected || myPick ? '#e9d5ff' : '#a855f7' }}>
                        {odds.toFixed(2)}
                      </p>
                      {myPick && <p style={{ fontSize: '0.65rem', color: '#93c5fd', marginTop: '0.2rem' }}>✓ Tvoje</p>}
                      {isResult && <p style={{ fontSize: '0.65rem', color: '#4ade80', marginTop: '0.2rem' }}>🏆 Výsledek</p>}
                    </button>
                  )
                })}
              </div>

              {myBet && (
                <div className="rounded-xl p-3.5 mb-3"
                  style={{
                    background: myBet.status === 'won' ? 'rgba(74,222,128,0.08)' :
                      myBet.status === 'lost' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                    border: myBet.status === 'won' ? '1px solid rgba(74,222,128,0.25)' :
                      myBet.status === 'lost' ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.07)',
                  }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginBottom: '0.15rem' }}>Tvoje sázka</p>
                      <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'white' }}>
                        {myBet.pick === 'a' ? event.teamA : myBet.pick === 'b' ? event.teamB : 'Remíza'}
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}> · {myBet.amount} kr · kurz {myBet.odds}</span>
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {myBet.status === 'won' && <p style={{ fontSize: '1rem', fontWeight: 800, color: '#4ade80' }}>+{Math.round(myBet.amount * myBet.odds)} kr</p>}
                      {myBet.status === 'lost' && <p style={{ fontSize: '1rem', fontWeight: 800, color: '#f87171' }}>-{myBet.amount} kr</p>}
                      {myBet.status === 'pending' && <p style={{ fontSize: '0.75rem', color: '#fbbf24' }}>⏳ Čeká</p>}
                    </div>
                  </div>
                </div>
              )}

              {event.status === 'open' && !myBet && (
                <div className="flex gap-2">
                  <input type="number" min={1} placeholder="Kolik kreditů vsadit?"
                    value={betAmounts[event.id] || ''}
                    onChange={e => setBetAmounts(prev => ({ ...prev, [event.id]: Number(e.target.value) }))}
                    className="flex-1 rounded-xl px-4 py-2.5 text-sm"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                  <button onClick={() => placeBet(event)} disabled={submitting === event.id}
                    className="font-bold px-5 py-2.5 rounded-xl text-sm transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                      border: '1px solid rgba(168,85,247,0.5)',
                      color: 'white',
                      opacity: submitting === event.id ? 0.5 : 1,
                      boxShadow: '0 0 16px rgba(168,85,247,0.25)',
                    }}>
                    {submitting === event.id ? '...' : 'Vsadit'}
                  </button>
                </div>
              )}

              {event.status === 'locked' && !myBet && (
                <p style={{ fontSize: '0.8rem', color: '#fbbf24' }}>🔒 Sázky jsou uzamčeny</p>
              )}

              {isAdmin && event.status !== 'finished' && (
                <div className="mt-4 pt-4 flex flex-col gap-2"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    ⚙️ Admin — vyhodnotit
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => settleEvent(event.id, 'a')}
                      className="text-xs font-bold px-4 py-2 rounded-xl transition-all"
                      style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', color: '#93c5fd' }}>
                      🏆 {event.teamA}
                    </button>
                    <button onClick={() => settleEvent(event.id, 'draw')}
                      className="text-xs font-bold px-4 py-2 rounded-xl transition-all"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                      🤝 Remíza
                    </button>
                    <button onClick={() => settleEvent(event.id, 'b')}
                      className="text-xs font-bold px-4 py-2 rounded-xl transition-all"
                      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5' }}>
                      🏆 {event.teamB}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}