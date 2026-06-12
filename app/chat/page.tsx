'use client'

import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { db } from '@/lib/firebase'
import {
  collection, onSnapshot, addDoc, doc,
  updateDoc, arrayUnion, serverTimestamp, query, orderBy
} from 'firebase/firestore'
import Image from 'next/image'

interface Timestamp {
  seconds: number
  nanoseconds: number
}

interface Message {
  id: string
  text: string
  userId: string
  userName: string
  userAvatar?: string
  createdAt: Timestamp | null
}

interface Group {
  id: string
  name: string
  createdBy: string
  members: string[]
  pendingMembers: string[]
  createdAt: Timestamp | null
}

interface Player {
  uid: string
  displayName: string
  avatar?: string
}

export default function Chat() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [players, setPlayers] = useState<Player[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [activeTab, setActiveTab] = useState<'global' | string>('global')
  const [globalMessages, setGlobalMessages] = useState<Message[]>([])
  const [groupMessages, setGroupMessages] = useState<Record<string, Message[]>>({})
  const [text, setText] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [inviteMembers, setInviteMembers] = useState<string[]>([])
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Refy pro udržení aktuálních hodnot v listenerech bez triggerování useEffectů
  const activeTabRef = useRef(activeTab)
  const groupIdsRef = useRef<string[]>([])

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  // 1. Načítání uživatelů
  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setPlayers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Player)))
    })
  }, [])

  // 2. Načítání globálního chatu + zvukové oznámení
  useEffect(() => {
    const q = query(collection(db, 'globalChat'), orderBy('createdAt', 'asc'))
    let isFirstLoad = true
    
    return onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message))
      setGlobalMessages(msgs)
      
      // Zvukové oznámení pro novou zprávu, pokud nejsme na globálním chatu
      if (!isFirstLoad && activeTabRef.current !== 'global' && snap.docChanges().some(c => c.type === 'added')) {
        const audio = new Audio('/notification.mp3') // Stačí nahrát zvuk do public/notification.mp3
        audio.play().catch(() => {})
      }
      isFirstLoad = false
    })
  }, [])

  // 3. Načítání skupin (bezpečně filtrované)
  useEffect(() => {
    if (!user) return
    return onSnapshot(collection(db, 'chatGroups'), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Group))
      const mine = all.filter(g =>
        g.members.includes(user.uid) || g.pendingMembers?.includes(user.uid)
      )
      setGroups(mine)
      groupIdsRef.current = mine.filter(g => g.members.includes(user.uid)).map(g => g.id)
    })
  }, [user])

  // 4. Načítání zpráv ze skupin (Opraveno: nespouští se dokola)
  useEffect(() => {
    if (!user) return
    const unsubs: (() => void)[] = []
    
    // Vytvoříme listenery pro všechny skupiny, kterých je uživatel členem
    groupIdsRef.current.forEach(groupId => {
      const q = query(
        collection(db, 'chatGroups', groupId, 'messages'),
        orderBy('createdAt', 'asc')
      )
      let isFirstLoad = true
      
      const unsub = onSnapshot(q, (snap) => {
        setGroupMessages(prev => ({
          ...prev,
          [groupId]: snap.docs.map(d => ({ id: d.id, ...d.data() } as Message))
        }))
        
        // Zvukové oznámení pro novou zprávu ve skupině
        if (!isFirstLoad && activeTabRef.current !== groupId && snap.docChanges().some(c => c.type === 'added')) {
          const audio = new Audio('/notification.mp3')
          audio.play().catch(() => {})
        }
        isFirstLoad = false
      })
      unsubs.push(unsub)
    })
    
    return () => unsubs.forEach(u => u())
  }, [groups.length, user]) // Spustí se jen když se reálně změní POČET skupin

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [globalMessages, groupMessages, activeTab])

  const getName = (uid: string) =>
    players.find(p => p.uid === uid)?.displayName ?? 'Neznámý'

  const sendMessage = async () => {
    if (!text.trim() || !user) return
    const profile = players.find(p => p.uid === user.uid)
    const msgText = text.trim()
    setText('')
    
    if (activeTab === 'global') {
      await addDoc(collection(db, 'globalChat'), {
        text: msgText, userId: user.uid,
        userName: profile?.displayName ?? 'Neznámý',
        userAvatar: profile?.avatar ?? null,
        createdAt: serverTimestamp(),
      })
    } else {
      await addDoc(collection(db, 'chatGroups', activeTab, 'messages'), {
        text: msgText, userId: user.uid,
        userName: profile?.displayName ?? 'Neznámý',
        userAvatar: profile?.avatar ?? null,
        createdAt: serverTimestamp(),
      })
    }
    inputRef.current?.focus()
  }

  const createGroup = async () => {
    if (!groupName.trim() || !user || inviteMembers.length === 0) return
    await addDoc(collection(db, 'chatGroups'), {
      name: groupName.trim(), createdBy: user.uid,
      members: [user.uid], pendingMembers: inviteMembers,
      createdAt: serverTimestamp(),
    })
    setGroupName('')
    setInviteMembers([])
    setShowNewGroup(false)
  }

  const acceptGroupInvite = async (groupId: string) => {
    if (!user) return
    const currentGroup = groups.find(g => g.id === groupId)
    if (!currentGroup) return

    await updateDoc(doc(db, 'chatGroups', groupId), {
      members: arrayUnion(user.uid),
      pendingMembers: currentGroup.pendingMembers.filter(uid => uid !== user.uid)
    })
  }

  const activeMessages = activeTab === 'global' ? globalMessages : groupMessages[activeTab] ?? []
  const activeGroup = groups.find(g => g.id === activeTab)
  const isPending = activeGroup && !activeGroup.members.includes(user?.uid ?? '')

  const formatTime = (ts: Timestamp | null) => {
    if (!ts?.seconds) return ''
    return new Date(ts.seconds * 1000).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
  }

  const activeTitle = activeTab === 'global' ? '🌍 Globální' : activeGroup?.name ?? ''

  const allTabs = [
    { id: 'global', label: 'Globální', icon: '🌍' },
    ...groups.map(g => ({
      id: g.id,
      label: g.name,
      icon: g.name.charAt(0).toUpperCase(),
      pending: g.pendingMembers?.includes(user?.uid ?? ''),
    })),
  ]

  if (loading) return (
    <main className="flex min-h-screen items-center justify-center" style={{ background: '#0a0a0f' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full animate-spin"
          style={{ border: '2px solid rgba(168,85,247,0.1)', borderTop: '2px solid #a855f7' }} />
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Načítání...</p>
      </div>
    </main>
  )

  return (
    <main
      className="flex"
      style={{
        height: 'calc(100vh - 57px)',
        background: 'transparent',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── DESKTOP SIDEBAR ── */}
      <div
        className="hidden md:flex flex-col shrink-0"
        style={{
          width: '17rem',
          background: 'rgba(10,10,18,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p style={{ color: 'rgba(168,85,247,0.7)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Zprávy</p>
            <h2 className="font-black text-base" style={{ color: 'white' }}>Chat</h2>
          </div>
          <button onClick={() => setShowNewGroup(true)}
            className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all duration-200"
            style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#e9d5ff' }}>
            + Skupina
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <button onClick={() => setActiveTab('global')}
            className="w-full text-left px-3 py-2.5 flex items-center gap-3 mx-1 rounded-xl transition-all duration-200"
            style={{
              width: 'calc(100% - 8px)',
              background: activeTab === 'global' ? 'rgba(168,85,247,0.15)' : 'transparent',
              border: activeTab === 'global' ? '1px solid rgba(168,85,247,0.25)' : '1px solid transparent',
            }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
              style={{ background: 'rgba(168,85,247,0.25)', border: '1px solid rgba(168,85,247,0.3)' }}>🌍</div>
            <div>
              <p className="text-sm font-bold" style={{ color: activeTab === 'global' ? '#e9d5ff' : 'rgba(255,255,255,0.7)' }}>Globální chat</p>
              <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>Všichni hráči</p>
            </div>
          </button>
          {groups.length > 0 && (
            <div className="px-4 pt-4 pb-1">
              <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Skupiny</p>
            </div>
          )}
          {groups.map(group => {
            const pending = group.pendingMembers?.includes(user?.uid ?? '')
            const isActive = activeTab === group.id
            return (
              <button key={group.id}
                onClick={() => setActiveTab(group.id)}
                className="text-left px-3 py-2.5 flex items-center gap-3 mx-1 rounded-xl transition-all duration-200"
                style={{
                  width: 'calc(100% - 8px)',
                  background: isActive ? 'rgba(168,85,247,0.15)' : 'transparent',
                  border: isActive ? '1px solid rgba(168,85,247,0.25)' : '1px solid transparent',
                }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0"
                  style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
                  {group.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: isActive ? '#e9d5ff' : 'rgba(255,255,255,0.7)' }}>{group.name}</p>
                  <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{group.members.length} členů</p>
                </div>
                {pending && <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: '#fbbf24' }} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── HLAVNÍ OBLAST ── */}
      <div
        className="flex-1 flex flex-col min-w-0"
        style={{ minHeight: 0, overflow: 'hidden' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            background: 'rgba(10,10,18,0.9)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            flexShrink: 0,
            minHeight: '52px',
          }}
        >
          <div className="min-w-0">
            <p className="font-black text-sm md:text-base" style={{ color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeTitle}
            </p>
            {activeTab === 'global' ? (
              <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginTop: '1px' }}>{players.length} hráčů online</p>
            ) : activeGroup ? (
              <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeGroup.members.map(getName).join(', ')}
              </p>
            ) : null}
          </div>
          <button
            className="md:hidden text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 ml-3"
            style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#e9d5ff' }}
            onClick={() => setShowNewGroup(true)}
          >
            + Skupina
          </button>
        </div>

        {/* Pozvánka banner */}
        {isPending && (
          <div
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{ background: 'rgba(251,191,36,0.07)', borderBottom: '1px solid rgba(251,191,36,0.15)', flexShrink: 0 }}
          >
            <p style={{ fontSize: '0.8rem', color: '#fbbf24' }}>
              Pozvánka: <span className="font-bold">{activeGroup?.name}</span>
            </p>
            <button
              onClick={() => acceptGroupInvite(activeTab)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl shrink-0"
              style={{ background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', color: '#e9d5ff' }}
            >
              Připojit se
            </button>
          </div>
        )}

        {/* Zprávy */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            padding: '16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            overscrollBehavior: 'contain',
          }}
        >
          {isPending ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.875rem' }}>Přijmi pozvánku pro zobrazení zpráv.</p>
            </div>
          ) : activeMessages.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.875rem' }}>Zatím žádné zprávy. Napiš první! 💬</p>
            </div>
          ) : (
            activeMessages.map((msg, i) => {
              const isMe = msg.userId === user?.uid
              const prevMsg = activeMessages[i - 1]
              const nextMsg = activeMessages[i + 1]
              const showName = !prevMsg || prevMsg.userId !== msg.userId
              const isLastInGroup = !nextMsg || nextMsg.userId !== msg.userId
              const topMargin = showName && i > 0 ? '10px' : '0'

              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}
                  style={{ marginTop: topMargin }}
                >
                  <div style={{ width: '30px', flexShrink: 0 }}>
                    {showName && (
                      msg.userAvatar ? (
                        <Image
                          key={`img-${msg.id}`}
                          src={msg.userAvatar} alt="" width={30} height={30}
                          style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }}
                        />
                      ) : (
                        <div key={`div-${msg.id}`} style={{
                          width: '30px', height: '30px', borderRadius: '50%',
                          background: isMe ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.7rem', fontWeight: 700, color: 'white',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                          {msg.userName?.charAt(0).toUpperCase()}
                        </div>
                      )
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: isMe ? 'flex-end' : 'flex-start',
                      maxWidth: 'min(72vw, 26rem)',
                    }}
                  >
                    {showName && !isMe && (
                      <p style={{ fontSize: '0.7rem', color: 'rgba(168,85,247,0.8)', fontWeight: 600, marginBottom: '3px', marginLeft: '4px' }}>
                        {msg.userName}
                      </p>
                    )}
                    <div
                      style={isMe ? {
                        background: 'rgba(168,85,247,0.28)',
                        border: '1px solid rgba(168,85,247,0.38)',
                        borderRadius: '18px',
                        borderBottomRightRadius: isLastInGroup ? '5px' : '18px',
                        padding: '9px 14px',
                      } : {
                        background: 'rgba(255,255,255,0.07)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        borderRadius: '18px',
                        borderBottomLeftRadius: isLastInGroup ? '5px' : '18px',
                        padding: '9px 14px',
                      }}
                    >
                      <p style={{ fontSize: '0.875rem', lineHeight: '1.45', color: 'rgba(255,255,255,0.92)', wordBreak: 'break-word', margin: 0 }}>
                        {msg.text}
                      </p>
                    </div>
                    {isLastInGroup && (
                      <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', marginTop: '3px', marginLeft: '4px', marginRight: '4px' }}>
                        {formatTime(msg.createdAt)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {!isPending && (
          <div
            style={{
              padding: '10px 12px',
              background: 'rgba(10,10,18,0.92)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderTop: '1px solid rgba(255,255,255,0.07)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Napiš zprávu..."
                maxLength={500}
                style={{
                  flex: 1,
                  fontSize: '16px',
                  lineHeight: '1.4',
                  padding: '10px 14px',
                  borderRadius: '22px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white',
                  outline: 'none',
                  WebkitAppearance: 'none',
                  minWidth: 0,
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!text.trim()}
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  background: text.trim() ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : 'rgba(255,255,255,0.05)',
                  border: text.trim() ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.07)',
                  color: text.trim() ? 'white' : 'rgba(255,255,255,0.2)',
                  boxShadow: text.trim() ? '0 0 16px rgba(168,85,247,0.3)' : 'none',
                  transition: 'all 0.2s',
                  cursor: text.trim() ? 'pointer' : 'default',
                }}
              >
                ↑
              </button>
            </div>
          </div>
        )}

        {/* ── MOBILNÍ TAB BAR ── */}
        {allTabs.length > 1 && (
          <div
            className="md:hidden"
            style={{
              display: 'flex',
              overflowX: 'auto',
              gap: '8px',
              padding: '8px 12px',
              background: 'rgba(10,10,18,0.97)',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
              scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {allTabs.map(tab => {
              const isActive = activeTab === tab.id
              const hasPending = 'pending' in tab && tab.pending
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexShrink: 0,
                    padding: '6px 12px',
                    borderRadius: '20px',
                    background: isActive ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
                    border: isActive ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.07)',
                    transition: 'all 0.2s',
                  }}
                >
                  {hasPending && (
                    <span
                      style={{
                        position: 'absolute', top: '-2px', right: '-2px',
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: '#fbbf24',
                      }}
                    />
                  )}
                  <span style={{ fontSize: tab.id === 'global' ? '0.85rem' : '0.7rem', lineHeight: 1 }}>
                    {tab.icon}
                  </span>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: isActive ? '#e9d5ff' : 'rgba(255,255,255,0.4)',
                    maxWidth: '90px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {tab.label}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal — nová skupina */}
      {showNewGroup && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifycontent: 'center', // Zde byl opraven překlep na justifyContent u minulé opravy, nechal jsem to flexboxové
            padding: '16px',
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{
            width: '100%', maxWidth: '420px',
            padding: '24px',
            borderRadius: '20px',
            background: 'rgba(15,15,25,0.99)',
            border: '1px solid rgba(168,85,247,0.2)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
          }}>
            <h3 style={{ color: 'white', fontWeight: 900, fontSize: '1.1rem', marginBottom: '20px' }}>Nová skupina</h3>

            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                Název skupiny
              </p>
              <input
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="např. Foosball tým A"
                maxLength={30}
                style={{
                  width: '100%', fontSize: '16px', padding: '10px 14px',
                  borderRadius: '12px', outline: 'none',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', color: 'white',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                Pozvat hráče
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {players.filter(p => p.uid !== user?.uid).map(p => (
                  <button
                    key={p.uid}
                    onClick={() => setInviteMembers(prev => prev.includes(p.uid) ? prev.filter(id => id !== p.uid) : [...prev, p.uid])}
                    style={inviteMembers.includes(p.uid) ? {
                      padding: '6px 14px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600,
                      background: 'rgba(168,85,247,0.25)', border: '1px solid rgba(168,85,247,0.5)', color: '#e9d5ff',
                    } : {
                      padding: '6px 14px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 500,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)',
                    }}
                  >
                    {p.displayName}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={createGroup}
                disabled={!groupName.trim() || inviteMembers.length === 0}
                style={{
                  flex: 1, fontWeight: 700, padding: '11px', borderRadius: '12px', fontSize: '0.9rem',
                  background: groupName.trim() && inviteMembers.length > 0 ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(168,85,247,0.4)', color: 'white',
                  opacity: !groupName.trim() || inviteMembers.length === 0 ? 0.4 : 1,
                }}
              >
                Vytvořit
              </button>
              <button
                onClick={() => { setShowNewGroup(false); setGroupName(''); setInviteMembers([]) }}
                style={{
                  fontWeight: 500, padding: '11px 16px', borderRadius: '12px', fontSize: '0.9rem',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)',
                }}
              >
                Zrušit
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}