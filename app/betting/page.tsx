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
  // expanded = which events show the full bets list
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [form, setForm] = useState<OddsForm & {
    title: string; sport: string; teamA: string; teamB: string; matchTime: string
  }>({
    title: '', sport: 'Fotbal', teamA: '', teamB: '', matchTime: '',
    oddsA: 2.0, oddsDraw: 3.0, oddsB: 2.0,
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
    return onSnapshot(collection(db, 'bets'), (snap) => {
      setBets(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bet)))
    })
  }, [])

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setPlayers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Player)))
    })
  }, [])

  const getPlayer = (uid: string) => players.find(p => p.uid === uid)
  const getName = (uid: string) => players.find(p => p.uid === uid)?.displayName ?? 'Neznámý'
  const myBetForEvent = (eventId: string) => bets.find(b => b.eventId === eventId && b.userId === user?.uid)
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

  const formatMatchTime = (matchTime: string) =>
    new Date(matchTime).toLocaleString('cs-CZ', {
      day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
    })

  const createEvent = async () => {
    if (!form.teamA || !form.teamB || !form.matchTime) { toast.error('Vyplň všechna pole!'); return }
    await addDoc(collection(db, 'bettingEvents'), {
      title: form.title || `${form.teamA} vs ${form.teamB}`,
      sport: form.sport, teamA: form.teamA, teamB: form.teamB,
      matchTime: form.matchTime, status: 'open',
      odds: { a: form.oddsA, draw: form.oddsDraw, b: form.oddsB },
      result: null, createdAt: new Date(),
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
          credits: (player.credits ?? 0) + Math.round(bet.amount * bet.odds),
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
      eventId: event.id, userId: user!.uid, pick, amount, odds,
      status: 'pending', createdAt: new Date(),
    })
    await updateDoc(doc(db, 'users', user!.uid), { credits: (player.credits ?? 0) - amount })
    toast.success(`Vsazeno ${amount} kreditů na kurz ${odds}!`)
    setBetAmounts(prev => ({ ...prev, [event.id]: 0 }))
    setBetPicks(prev => { const next = { ...prev }; delete next[event.id]; return next })
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
    background: 'rgba(168,85,247,0.25)', border: '1px solid rgba(168,85,247,0.5)',
    color: '#e9d5ff', borderRadius: '0.75rem', padding: '0.5rem 1.25rem',
    fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
  }
  const btnInactive = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.4)', borderRadius: '0.75rem', padding: '0.5rem 1.25rem',
    fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
  }

  // Group bets for an event by pick for display
  const groupBetsByPick = (eventId: string) => {
    const eventBets = betsForEvent(eventId)
    const groups: Record<'a' | 'draw' | 'b', Bet[]> = { a: [], draw: [], b: [] }
    eventBets.forEach(b => { if (b.pick in groups) groups[b.pick].push(b) })
    return groups
  }

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto">
      <div className="fixed pointer-events-none"
        style={{ top: '10%', left: '5%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)', filter: 'blur(40px)', borderRadius: '50%' }} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div>
          <p style={{ color: 'rgba(168,85,247,0.7)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            Sázkový systém
          </p>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight" style={{ color: 'white' }}>Sázky</h1>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              fontWeight: 700, padding: '10px 20px', borderRadius: '12px', fontSize: '0.875rem',
              background: showForm ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
              border: showForm ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(168,85,247,0.5)',
              color: 'white', boxShadow: showForm ? 'none' : '0 0 20px rgba(168,85,247,0.3)',
              cursor: 'pointer',
            }}
          >
            {showForm ? '✕' : '+ Přidat'}
          </button>
        )}
      </div>

      {/* Admin formulář */}
      {isAdmin && showForm && (
        <div className="mb-6 p-4 md:p-6" style={glass}>
          <h2 style={{ fontWeight: 700, fontSize: '1rem', color: 'white', marginBottom: '16px' }}>Nový zápas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Sport</p>
              <select
                value={form.sport}
                onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}
                style={{ width: '100%', borderRadius: '12px', padding: '9px 12px', fontSize: '0.875rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
              >
                {sports.map(s => <option key={s} style={{ background: '#1a1a2e' }}>{s}</option>)}
              </select>
            </div>
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Datum a čas</p>
              <input
                type="datetime-local" value={form.matchTime}
                onChange={e => setForm(f => ({ ...f, matchTime: e.target.value }))}
                style={{ width: '100%', borderRadius: '12px', padding: '9px 12px', fontSize: '16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {(['teamA', 'teamB'] as const).map((key, i) => (
              <div key={key}>
                <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                  {i === 0 ? 'Tým A' : 'Tým B'}
                </p>
                <input
                  type="text"
                  placeholder={i === 0 ? 'Man City' : 'Arsenal'}
                  value={form[key] as string}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: '100%', borderRadius: '12px', padding: '9px 12px', fontSize: '16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
          <div className="mb-3">
            <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Volitelný název</p>
            <input
              type="text" placeholder="Premier League · Kolo 38" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ width: '100%', borderRadius: '12px', padding: '9px 12px', fontSize: '16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {oddsFields.map(({ label, key }) => (
              <div key={String(key)}>
                <p style={{ fontSize: '0.68rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {label}
                </p>
                <input
                  type="number" step="0.01" min="1" value={form[key] as number}
                  onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                  style={{ width: '100%', borderRadius: '12px', padding: '9px 6px', fontSize: '16px', textAlign: 'center', fontWeight: 700, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={createEvent}
              style={{ flex: 1, fontWeight: 700, padding: '11px', borderRadius: '12px', fontSize: '0.9rem', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', border: '1px solid rgba(168,85,247,0.5)', color: 'white', boxShadow: '0 0 20px rgba(168,85,247,0.25)', cursor: 'pointer' }}
            >
              Přidat zápas
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{ fontWeight: 500, padding: '11px 16px', borderRadius: '12px', fontSize: '0.9rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
            >
              Zrušit
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button onClick={() => setView('upcoming')} style={view === 'upcoming' ? btnActive : btnInactive}>
          🟢 Nadcházející
        </button>
        <button
          onClick={() => setView('finished')}
          style={view === 'finished' ? { ...btnActive, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' } : btnInactive}
        >
          🏁 Proběhlé
        </button>
      </div>

      {filteredEvents.length === 0 && (
        <div style={{ ...glass, padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>
            {view === 'upcoming' ? 'Žádné nadcházející zápasy.' : 'Žádné proběhlé zápasy.'}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredEvents.map((event) => {
          const myBet = myBetForEvent(event.id)
          const eventBets = betsForEvent(event.id)
          const totalPool = eventBets.reduce((s, b) => s + b.amount, 0)
          const isLocked = event.status === 'locked' || event.status === 'finished'
          const isOpen = event.status === 'open'
          const betGroups = groupBetsByPick(event.id)
          const showBets = expanded[event.id]

          const cardStyle = event.status === 'finished'
            ? { ...glass, opacity: 0.85 }
            : event.status === 'locked'
            ? { ...glass, border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.03)' }
            : { ...glass, border: '1px solid rgba(168,85,247,0.15)' }

          return (
            <div key={event.id} style={{ ...cardStyle, padding: '18px 18px 16px' }}>

              {/* ROW 1: Sport + Status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc' }}>
                  {event.sport}
                </span>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: '20px',
                  ...(isOpen
                    ? { background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }
                    : event.status === 'locked'
                    ? { background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }
                    : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }),
                }}>
                  {isOpen ? '🟢 Otevřeno' : event.status === 'locked' ? '🔒 Uzamčeno' : '🏁 Hotovo'}
                </span>
              </div>

              {/* ROW 2: Název + meta */}
              <div style={{ marginBottom: '14px' }}>
                <h3 style={{ fontWeight: 900, fontSize: '1.05rem', color: 'white', lineHeight: 1.3, margin: '0 0 4px' }}>
                  {event.title}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                    📅 {formatMatchTime(event.matchTime)}
                  </span>
                  {isOpen && (
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>
                      · ⏱ {timeUntilMatch(event.matchTime)}
                    </span>
                  )}
                  {/* Clickable bet count */}
                  <button
                    onClick={() => setExpanded(prev => ({ ...prev, [event.id]: !prev[event.id] }))}
                    style={{
                      fontSize: '0.7rem', color: showBets ? '#c084fc' : 'rgba(192,132,252,0.7)',
                      fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer',
                      padding: '0', textDecoration: showBets ? 'underline' : 'none',
                    }}
                  >
                    {eventBets.length} {eventBets.length === 1 ? 'sázka' : eventBets.length < 5 ? 'sázky' : 'sázek'} · {totalPool} kr {showBets ? '▲' : '▼'}
                  </button>
                </div>
              </div>

              {/* ── KDO VSADIL — rozbalovací sekce ── */}
              {showBets && eventBets.length > 0 && (
                <div style={{
                  marginBottom: '14px', padding: '12px 14px', borderRadius: '12px',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
                    Kdo vsadil
                  </p>
                  {/* Three columns: teamA | remíza | teamB */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', alignItems: 'start' }}>
                    {/* Team A column */}
                    <div>
                      <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#93c5fd', marginBottom: '6px', textAlign: 'left' }}>
                        {event.teamA} ({betGroups.a.length})
                      </p>
                      {betGroups.a.length === 0 ? (
                        <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>–</p>
                      ) : betGroups.a.map(bet => (
                        <div key={bet.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.75rem', color: bet.userId === user?.uid ? '#e9d5ff' : 'rgba(255,255,255,0.65)', fontWeight: bet.userId === user?.uid ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {bet.userId === user?.uid ? '👤 ' : ''}{getName(bet.userId)}
                          </span>
                          <span style={{
                            fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
                            color: bet.status === 'won' ? '#4ade80' : bet.status === 'lost' ? '#f87171' : 'rgba(255,255,255,0.5)',
                          }}>
                            {bet.amount} kr
                            {bet.status === 'won' && ' ✓'}
                            {bet.status === 'lost' && ' ✗'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Divider */}
                    <div style={{ width: '1px', background: 'rgba(255,255,255,0.08)', alignSelf: 'stretch', margin: '0 4px' }} />

                    {/* Team B column */}
                    <div>
                      <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#fca5a5', marginBottom: '6px', textAlign: 'right' }}>
                        ({betGroups.b.length}) {event.teamB}
                      </p>
                      {betGroups.b.length === 0 ? (
                        <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', textAlign: 'right' }}>–</p>
                      ) : betGroups.b.map(bet => (
                        <div key={bet.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', marginBottom: '4px' }}>
                          <span style={{
                            fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
                            color: bet.status === 'won' ? '#4ade80' : bet.status === 'lost' ? '#f87171' : 'rgba(255,255,255,0.5)',
                          }}>
                            {bet.status === 'won' && '✓ '}
                            {bet.status === 'lost' && '✗ '}
                            {bet.amount} kr
                          </span>
                          <span style={{ fontSize: '0.75rem', color: bet.userId === user?.uid ? '#e9d5ff' : 'rgba(255,255,255,0.65)', fontWeight: bet.userId === user?.uid ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            {getName(bet.userId)}{bet.userId === user?.uid ? ' 👤' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Remíza row — below if any */}
                  {betGroups.draw.length > 0 && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
                        Remíza ({betGroups.draw.length})
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {betGroups.draw.map(bet => (
                          <span key={bet.id} style={{
                            fontSize: '0.72rem', padding: '3px 8px', borderRadius: '8px',
                            background: 'rgba(255,255,255,0.05)',
                            color: bet.userId === user?.uid ? '#e9d5ff' : 'rgba(255,255,255,0.55)',
                            fontWeight: bet.userId === user?.uid ? 700 : 400,
                          }}>
                            {getName(bet.userId)} · {bet.amount} kr
                            {bet.status === 'won' && ' ✓'}
                            {bet.status === 'lost' && ' ✗'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {showBets && eventBets.length === 0 && (
                <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>Zatím nikdo nesázeil.</p>
                </div>
              )}

              {/* ODDS: 3 buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                {(['a', 'draw', 'b'] as const).map(pick => {
                  const label = pick === 'a' ? event.teamA : pick === 'b' ? event.teamB : 'Remíza'
                  const odds = pick === 'a' ? event.odds.a : pick === 'b' ? event.odds.b : event.odds.draw
                  const isSelected = betPicks[event.id] === pick
                  const isResult = event.result === pick
                  const myPick = myBet?.pick === pick

                  return (
                    <button
                      key={pick}
                      onClick={() => {
                        if (isOpen && !myBet) setBetPicks(prev => ({ ...prev, [event.id]: pick }))
                      }}
                      disabled={isLocked || !!myBet}
                      style={{
                        borderRadius: '12px', padding: '10px 6px', textAlign: 'center',
                        transition: 'all 0.2s',
                        background: isResult ? 'rgba(74,222,128,0.15)' : myPick ? 'rgba(59,130,246,0.15)' : isSelected ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
                        border: isResult ? '1px solid rgba(74,222,128,0.4)' : myPick ? '1px solid rgba(59,130,246,0.4)' : isSelected ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.07)',
                        cursor: isLocked || myBet ? 'default' : 'pointer',
                        boxShadow: isResult ? '0 0 16px rgba(74,222,128,0.15)' : isSelected ? '0 0 16px rgba(168,85,247,0.15)' : 'none',
                      }}
                    >
                      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </p>
                      <p style={{ fontSize: '1.35rem', fontWeight: 900, color: isResult ? '#4ade80' : isSelected || myPick ? '#e9d5ff' : '#a855f7', margin: 0 }}>
                        {odds.toFixed(2)}
                      </p>
                      {myPick && <p style={{ fontSize: '0.6rem', color: '#93c5fd', marginTop: '3px' }}>✓ Tvoje</p>}
                      {isResult && <p style={{ fontSize: '0.6rem', color: '#4ade80', marginTop: '3px' }}>🏆 Výsledek</p>}
                    </button>
                  )
                })}
              </div>

              {/* Tvoje sázka */}
              {myBet && (
                <div style={{
                  borderRadius: '12px', padding: '12px 14px', marginBottom: '10px',
                  background: myBet.status === 'won' ? 'rgba(74,222,128,0.08)' : myBet.status === 'lost' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                  border: myBet.status === 'won' ? '1px solid rgba(74,222,128,0.25)' : myBet.status === 'lost' ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginBottom: '3px' }}>Tvoje sázka</p>
                      <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'white', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {myBet.pick === 'a' ? event.teamA : myBet.pick === 'b' ? event.teamB : 'Remíza'}
                      </p>
                      <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
                        {myBet.amount} kr · kurz {myBet.odds}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {myBet.status === 'won' && <p style={{ fontSize: '1.05rem', fontWeight: 800, color: '#4ade80', margin: 0 }}>+{Math.round(myBet.amount * myBet.odds)} kr</p>}
                      {myBet.status === 'lost' && <p style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f87171', margin: 0 }}>−{myBet.amount} kr</p>}
                      {myBet.status === 'pending' && <p style={{ fontSize: '0.8rem', color: '#fbbf24', margin: 0 }}>⏳ Čeká</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Vsadit input */}
              {isOpen && !myBet && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="number" min={1} placeholder="Kolik kreditů?"
                    value={betAmounts[event.id] || ''}
                    onChange={e => setBetAmounts(prev => ({ ...prev, [event.id]: Number(e.target.value) }))}
                    // 16px prevents iOS zoom
                    style={{ flex: 1, fontSize: '16px', padding: '10px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none', minWidth: 0 }}
                  />
                  <button
                    onClick={() => placeBet(event)}
                    disabled={submitting === event.id}
                    style={{
                      fontWeight: 700, padding: '10px 20px', borderRadius: '12px', fontSize: '0.9rem',
                      background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                      border: '1px solid rgba(168,85,247,0.5)', color: 'white',
                      opacity: submitting === event.id ? 0.5 : 1,
                      boxShadow: '0 0 16px rgba(168,85,247,0.25)', cursor: 'pointer',
                    }}
                  >
                    {submitting === event.id ? '...' : 'Vsadit'}
                  </button>
                </div>
              )}

              {event.status === 'locked' && !myBet && (
                <p style={{ fontSize: '0.82rem', color: '#fbbf24', margin: 0 }}>🔒 Sázky jsou uzamčeny</p>
              )}

              {/* Admin panel */}
              {isAdmin && event.status !== 'finished' && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                    ⚙️ Admin — vyhodnotit
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    <button
                      onClick={() => settleEvent(event.id, 'a')}
                      style={{ fontSize: '0.75rem', fontWeight: 700, padding: '8px 4px', borderRadius: '10px', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', color: '#93c5fd', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      🏆 {event.teamA}
                    </button>
                    <button
                      onClick={() => settleEvent(event.id, 'draw')}
                      style={{ fontSize: '0.75rem', fontWeight: 700, padding: '8px 4px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
                    >
                      🤝 Remíza
                    </button>
                    <button
                      onClick={() => settleEvent(event.id, 'b')}
                      style={{ fontSize: '0.75rem', fontWeight: 700, padding: '8px 4px', borderRadius: '10px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
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