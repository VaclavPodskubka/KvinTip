'use client'

import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { db } from '@/lib/firebase'
import { doc, onSnapshot, collection, updateDoc } from 'firebase/firestore'
import toast from 'react-hot-toast'
import Image from 'next/image'
import { requestNotificationPermission } from '@/lib/notifications' // <-- Krok 4: Import pomocné funkce

interface UserProfile {
  displayName: string
  credits: number
  elo: number
  photo?: string
  avatar?: string
  stats?: {
    matches?: number
    wins?: number
    losses?: number
    currentStreak?: number
  }
}

interface Match {
  id: string
  sport: string
  format: string
  teamA: string[]
  teamB: string[]
  status: string
  result: { scoreA: number; scoreB: number } | null
  credits: number
  createdAt: { seconds: number } | null
}

interface Player {
  uid: string
  displayName: string
}

interface Bet {
  id: string
  eventId: string
  userId: string
  pick: 'a' | 'draw' | 'b'
  amount: number
  odds: number
  status: 'pending' | 'won' | 'lost'
  createdAt: { seconds: number } | null
}

interface BettingEvent {
  id: string
  title: string
  sport: string
  teamA: string
  teamB: string
  result?: 'a' | 'draw' | 'b'
}

const glass = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1.25rem',
}

export default function Profile() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [stakedCredits, setStakedCredits] = useState(0)
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [myBets, setMyBets] = useState<Bet[]>([])
  const [bettingEvents, setBettingEvents] = useState<BettingEvent[]>([])
  const [loadingNotifications, setLoadingNotifications] = useState(false) // <-- Krok 4: Stav pro tlačítko notifikací
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) setProfile(snap.data() as UserProfile)
    })
  }, [user])

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setPlayers(snap.docs.map(d => ({ uid: d.id, displayName: d.data().displayName })))
    })
  }, [])

  useEffect(() => {
    if (!user) return
    return onSnapshot(collection(db, 'matches'), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match))
      const finished = all
        .filter(m => m.status === 'finished' && (m.teamA?.includes(user.uid) || m.teamB?.includes(user.uid)))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
        .slice(0, 10)
      setMatches(finished)
      const staked = all
        .filter(m => m.status === 'playing' && (m.teamA?.includes(user.uid) || m.teamB?.includes(user.uid)))
        .reduce((sum, m) => sum + (m.credits ?? 0), 0)
      setStakedCredits(staked)
    })
  }, [user])

  useEffect(() => {
    if (!user) return
    return onSnapshot(collection(db, 'bets'), (snap) => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Bet))
        .filter(b => b.userId === user.uid)
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setMyBets(data)
    })
  }, [user])

  useEffect(() => {
    return onSnapshot(collection(db, 'bettingEvents'), (snap) => {
      setBettingEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as BettingEvent)))
    })
  }, [])

  const getName = (uid: string) => players.find(p => p.uid === uid)?.displayName ?? 'Neznámý'

  const winRate = () => {
    const m = profile?.stats?.matches ?? 0
    const w = profile?.stats?.wins ?? 0
    if (m === 0) return '—'
    return Math.round((w / m) * 100) + '%'
  }

  const getMatchResult = (match: Match) => {
    if (!match.result || !user) return null
    const inA = match.teamA?.includes(user.uid)
    const scoreMe = inA ? match.result.scoreA : match.result.scoreB
    const scoreOp = inA ? match.result.scoreB : match.result.scoreA
    return { won: scoreMe > scoreOp, scoreMe, scoreOp }
  }

  const saveName = async () => {
    if (!newName.trim()) { toast.error('Zadej jméno!'); return }
    if (newName.trim().length < 2) { toast.error('Jméno musí mít aspoň 2 znaky!'); return }
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid), { displayName: newName.trim() })
    toast.success('Jméno změněno!')
    setEditingName(false)
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!file.type.startsWith('image/')) { toast.error('Vyber obrázek!'); return }
    setUploadingAvatar(true)
    try {
      const base64 = await resizeImage(file, 200)
      await updateDoc(doc(db, 'users', user.uid), { avatar: base64 })
      toast.success('Avatar změněn!')
    } catch { toast.error('Něco se pokazilo.') }
    setUploadingAvatar(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const resizeImage = (file: File, size: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size; canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject('Canvas error'); return }
        const minSide = Math.min(img.width, img.height)
        ctx.drawImage(img, (img.width - minSide) / 2, (img.height - minSide) / 2, minSide, minSide, 0, 0, size, size)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.onerror = reject
      img.src = url
    })
  }

  // <-- Krok 4: Funkce pro vyvolání povolení k push zprávám
  const handleEnableNotifications = async () => {
    if (!user?.uid) return
    setLoadingNotifications(true)
    try {
      const token = await requestNotificationPermission(user.uid)
      if (token) {
        toast.success('Upozornění byla aktivována!')
      } else {
        toast.error('Oznámení nebyla povolena.')
      }
    } catch {
      toast.error('Nepodařilo se nastavit upozornění.')
    } finally {
      setLoadingNotifications(false)
    }
  }

  const betStats = {
    total: myBets.length,
    won: myBets.filter(b => b.status === 'won').length,
    lost: myBets.filter(b => b.status === 'lost').length,
    pending: myBets.filter(b => b.status === 'pending').length,
    profit: myBets.reduce((sum, b) => {
      if (b.status === 'won') return sum + Math.round(b.amount * b.odds) - b.amount
      if (b.status === 'lost') return sum - b.amount
      return sum
    }, 0),
  }

  if (loading || !profile) return (
    <main className="flex min-h-screen items-center justify-center" style={{ background: '#0a0a0f' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full animate-spin"
          style={{ border: '2px solid rgba(168,85,247,0.1)', borderTop: '2px solid #a855f7' }} />
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Načítání...</p>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-2xl mx-auto">
      <div className="fixed pointer-events-none"
        style={{ top: '10%', right: '5%', width: '350px', height: '350px', background: 'radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)', filter: 'blur(40px)', borderRadius: '50%' }} />

      {/* ── PROFIL KARTA ── */}
      <div className="p-4 md:p-6 mb-4" style={glass}>

        {/* Horní část: Avatar vlevo + kredity vpravo */}
        <div className="flex items-start justify-between gap-3 mb-4">

          {/* Avatar */}
          <div className="relative shrink-0"
            onClick={() => fileInputRef.current?.click()}
            style={{ cursor: 'pointer' }}>
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden relative"
              style={{ border: '2px solid rgba(168,85,247,0.4)' }}>
              {profile.avatar ? (
                <Image src={profile.avatar} alt="Avatar" width={80} height={80}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-black text-2xl md:text-3xl"
                  style={{ background: 'rgba(168,85,247,0.3)', color: '#e9d5ff' }}>
                  {profile.displayName?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.55)', opacity: uploadingAvatar ? 1 : 0, transition: 'opacity 0.2s' }}>
                <span className="text-white text-xs font-bold">{uploadingAvatar ? '...' : '📷'}</span>
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs"
              style={{ background: 'rgba(168,85,247,0.8)', border: '2px solid #0a0a0f' }}>
              ✏️
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          </div>

          {/* Kredity vpravo nahoře */}
          <div className="text-right shrink-0">
            <p className="font-black text-2xl md:text-3xl" style={{ color: '#c084fc' }}>
              {(profile.credits ?? 1000).toLocaleString()}
            </p>
            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>kreditů</p>
          </div>
        </div>

        {/* Jméno — celé, bez truncate, pod avatarem */}
        <div className="mb-3">
          {editingName ? (
            <div className="flex gap-2 mb-2">
              <input type="text" value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveName()}
                maxLength={20} autoFocus
                className="flex-1 min-w-0 px-3 py-1.5 rounded-xl text-base font-bold outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(168,85,247,0.5)', color: 'white' }}
              />
              <button onClick={saveName}
                className="font-bold text-sm px-3 py-1.5 rounded-xl shrink-0"
                style={{ background: 'rgba(168,85,247,0.25)', border: '1px solid rgba(168,85,247,0.5)', color: '#e9d5ff' }}>✓</button>
              <button onClick={() => setEditingName(false)}
                className="text-sm px-3 py-1.5 rounded-xl shrink-0"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {/* Jméno bez truncate — zobrazí se celé */}
              <h1 className="text-xl md:text-2xl font-black" style={{ color: 'white', wordBreak: 'break-word' }}>
                {profile.displayName}
              </h1>
              <button onClick={() => { setNewName(profile.displayName); setEditingName(true) }}
                className="text-sm opacity-40 hover:opacity-80 transition-opacity shrink-0"
                style={{ color: 'rgba(255,255,255,0.7)' }}>✏️</button>
            </div>
          )}

          {/* ELO badge + hint */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(129,140,248,0.15)', border: '1px solid rgba(129,140,248,0.3)', color: '#818cf8' }}>
              ⚡ {profile.elo ?? 1200} ELO
            </span>
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)' }}>klikni na foto pro změnu</span>
          </div>
        </div>

        {/* Stat řádek */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Zápasy', value: profile.stats?.matches ?? 0, color: '#c084fc' },
            { label: 'Výhry', value: profile.stats?.wins ?? 0, color: '#4ade80' },
            { label: 'Prohry', value: profile.stats?.losses ?? 0, color: '#f87171' },
            { label: 'Úspěšnost', value: winRate(), color: '#fbbf24' },
          ].map(stat => (
            <div key={stat.label} className="text-center p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-lg md:text-2xl font-black" style={{ color: stat.color }}>{stat.value}</p>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem', marginTop: '0.15rem' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── KROK 4: MOBILNÍ UPOZORNĚNÍ ── */}
      <div className="p-4 md:p-6 mb-4" style={glass}>
        <h2 className="font-black text-sm md:text-base mb-2"
          style={{ color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          🔔 Mobilní upozornění
        </h2>
        <p className="mb-4" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', lineHeight: '1.4' }}>
          Chceš vědět hned, když tě někdo vyzve na zápas nebo dostaneš zprávu? Aktivuj si push notifikace přímo na plochu svého zařízení.
        </p>
        <button
          onClick={handleEnableNotifications}
          disabled={loadingNotifications}
          className="btn-accent px-4 py-2 w-full text-center text-sm rounded-xl cursor-pointer disabled:opacity-50"
        >
          {loadingNotifications ? 'Nastavuji systém...' : 'Zapnout push notifikace na tomto mobilu'}
        </button>
      </div>

      {/* ── VSAZENO ── */}
      {stakedCredits > 0 && (
        <div className="p-4 mb-4 flex items-center justify-between"
          style={{ ...glass, background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <div>
            <p className="font-bold text-sm" style={{ color: '#fbbf24' }}>🎯 Aktuálně vsazeno</p>
            <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.1rem' }}>Probíhající zápasy</p>
          </div>
          <div className="text-right">
            <p className="font-black text-2xl" style={{ color: '#fbbf24' }}>{stakedCredits}</p>
            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>kreditů</p>
          </div>
        </div>
      )}

      {/* ── HISTORIE ZÁPASŮ ── */}
      <div className="p-4 md:p-6 mb-4" style={glass}>
        <h2 className="font-black text-sm md:text-base mb-4"
          style={{ color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          📋 Historie zápasů
        </h2>
        {matches.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Zatím žádné dokončené zápasy.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {matches.map(match => {
              const result = getMatchResult(match)
              const opponent = match.teamA?.includes(user!.uid)
                ? match.teamB?.map(getName).join(' + ')
                : match.teamA?.map(getName).join(' + ')
              const won = result?.won

              return (
                <div key={match.id} className="flex items-center justify-between p-3 rounded-xl gap-2"
                  style={won ? {
                    background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)',
                  } : {
                    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)',
                  }}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={won ? {
                          background: 'rgba(74,222,128,0.2)', border: '1px solid rgba(74,222,128,0.35)', color: '#4ade80',
                        } : {
                          background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171',
                        }}>
                        {won ? 'VÝHRA' : 'PROHRA'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{match.sport}</span>
                    </div>
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)', wordBreak: 'break-word' }}>vs {opponent}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-base md:text-lg" style={{ color: 'white' }}>
                      {result?.scoreMe} : {result?.scoreOp}
                    </p>
                    <p className="text-xs font-bold" style={{ color: won ? '#4ade80' : '#f87171' }}>
                      {won ? `+${match.credits * 2}` : `-${match.credits}`} kr
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── SÁZKOVÉ TIKETY ── */}
      <div className="p-4 md:p-6" style={glass}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-sm md:text-base"
            style={{ color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            🎯 Tikety
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }}>
              {betStats.won}W
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
              {betStats.lost}L
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                background: betStats.profit >= 0 ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)',
                border: betStats.profit >= 0 ? '1px solid rgba(74,222,128,0.25)' : '1px solid rgba(239,68,68,0.25)',
                color: betStats.profit >= 0 ? '#4ade80' : '#f87171',
              }}>
              {betStats.profit >= 0 ? '+' : ''}{betStats.profit} kr
            </span>
          </div>
        </div>

        {myBets.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Zatím žádné sázky.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {myBets.map(bet => {
              const event = bettingEvents.find(e => e.id === bet.eventId)
              const pickLabel = bet.pick === 'a' ? event?.teamA : bet.pick === 'b' ? event?.teamB : 'Remíza'
              const potentialWin = Math.round(bet.amount * bet.odds)
              const isWon = bet.status === 'won'
              const isLost = bet.status === 'lost'

              return (
                <div key={bet.id} className="p-3 rounded-xl"
                  style={isWon ? {
                    background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)',
                  } : isLost ? {
                    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)',
                  } : {
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                  {/* Řádek 1: zápas + status */}
                  <div className="flex items-start justify-between mb-1.5 gap-2">
                    <p className="font-bold text-sm" style={{ color: 'white', flex: 1, wordBreak: 'break-word' }}>
                      {event?.teamA ?? '?'} vs {event?.teamB ?? '?'}
                    </p>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={isWon ? {
                        background: 'rgba(74,222,128,0.2)', border: '1px solid rgba(74,222,128,0.35)', color: '#4ade80',
                      } : isLost ? {
                        background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171',
                      } : {
                        background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24',
                      }}>
                      {isWon ? 'VÝHRA' : isLost ? 'PROHRA' : '⏳'}
                    </span>
                  </div>

                  {/* Řádek 2: tip + vsazeno + výhra */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>
                        Tip: <span style={{ color: 'rgba(255,255,255,0.7)' }}>{pickLabel}</span>
                        {' · '}kurz <span style={{ color: '#a855f7', fontWeight: 700 }}>{bet.odds}</span>
                      </p>
                      <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>Vsazeno: {bet.amount} kr</p>
                    </div>
                    <div className="text-right">
                      {isWon && <p className="text-sm font-bold" style={{ color: '#4ade80' }}>+{potentialWin - bet.amount} kr</p>}
                      {isLost && <p className="text-sm font-bold" style={{ color: '#f87171' }}>−{bet.amount} kr</p>}
                      {bet.status === 'pending' && <p style={{ fontSize: '0.7rem', color: '#fbbf24' }}>možná: {potentialWin} kr</p>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}