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

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setPlayers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Player)))
    })
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'globalChat'), orderBy('createdAt', 'asc'))
    return onSnapshot(q, (snap) => {
      setGlobalMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)))
    })
  }, [])

  useEffect(() => {
    if (!user) return
    return onSnapshot(collection(db, 'chatGroups'), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Group))
      const mine = all.filter(g =>
        g.members.includes(user.uid) || g.pendingMembers?.includes(user.uid)
      )
      setGroups(mine)
    })
  }, [user])

  useEffect(() => {
    if (!user) return
    const unsubs: (() => void)[] = []
    groups.forEach(group => {
      if (!group.members.includes(user.uid)) return
      const q = query(
        collection(db, 'chatGroups', group.id, 'messages'),
        orderBy('createdAt', 'asc')
      )
      const unsub = onSnapshot(q, (snap) => {
        setGroupMessages(prev => ({
          ...prev,
          [group.id]: snap.docs.map(d => ({ id: d.id, ...d.data() } as Message))
        }))
      })
      unsubs.push(unsub)
    })
    return () => unsubs.forEach(u => u())
  }, [groups, user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [globalMessages, groupMessages, activeTab])

  const getName = (uid: string) =>
    players.find(p => p.uid === uid)?.displayName ?? 'Neznámý'

  const sendMessage = async () => {
    if (!text.trim() || !user) return
    const profile = players.find(p => p.uid === user.uid)

    if (activeTab === 'global') {
      await addDoc(collection(db, 'globalChat'), {
        text: text.trim(),
        userId: user.uid,
        userName: profile?.displayName ?? 'Neznámý',
        userAvatar: profile?.avatar ?? null,
        createdAt: serverTimestamp(),
      })
    } else {
      await addDoc(collection(db, 'chatGroups', activeTab, 'messages'), {
        text: text.trim(),
        userId: user.uid,
        userName: profile?.displayName ?? 'Neznámý',
        userAvatar: profile?.avatar ?? null,
        createdAt: serverTimestamp(),
      })
    }
    setText('')
  }

  const createGroup = async () => {
    if (!groupName.trim() || !user) return
    if (inviteMembers.length === 0) return

    await addDoc(collection(db, 'chatGroups'), {
      name: groupName.trim(),
      createdBy: user.uid,
      members: [user.uid],
      pendingMembers: inviteMembers,
      createdAt: serverTimestamp(),
    })
    setGroupName('')
    setInviteMembers([])
    setShowNewGroup(false)
  }

  const acceptGroupInvite = async (groupId: string) => {
    if (!user) return
    await updateDoc(doc(db, 'chatGroups', groupId), {
      members: arrayUnion(user.uid),
      pendingMembers: groups
        .find(g => g.id === groupId)
        ?.pendingMembers.filter(uid => uid !== user.uid) ?? []
    })
  }

  const activeMessages = activeTab === 'global'
    ? globalMessages
    : groupMessages[activeTab] ?? []

  const activeGroup = groups.find(g => g.id === activeTab)
  const isPending = activeGroup && !activeGroup.members.includes(user?.uid ?? '')

  const formatTime = (ts: Timestamp | null) => {
    if (!ts?.seconds) return ''
    return new Date(ts.seconds * 1000).toLocaleTimeString('cs-CZ', {
      hour: '2-digit', minute: '2-digit'
    })
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

  return (
    <main className="flex" style={{ height: 'calc(100vh - 57px)', background: 'transparent' }}>

      {/* Sidebar */}
      <div className="w-64 flex flex-col shrink-0"
        style={{
          background: 'rgba(255,255,255,0.03)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}>

        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p style={{ color: 'rgba(168,85,247,0.7)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Zprávy
            </p>
            <h2 className="font-black text-base" style={{ color: 'white' }}>Chat</h2>
          </div>
          <button
            onClick={() => setShowNewGroup(true)}
            className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all duration-200"
            style={{
              background: 'rgba(168,85,247,0.15)',
              border: '1px solid rgba(168,85,247,0.3)',
              color: '#e9d5ff',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = 'rgba(168,85,247,0.25)'
              el.style.boxShadow = '0 0 12px rgba(168,85,247,0.2)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = 'rgba(168,85,247,0.15)'
              el.style.boxShadow = 'none'
            }}
          >
            + Skupina
          </button>
        </div>

        {/* Sidebar seznam */}
        <div className="flex-1 overflow-y-auto py-2">
          {/* Globální chat */}
          <button
            onClick={() => setActiveTab('global')}
            className="w-full text-left px-3 py-2.5 flex items-center gap-3 mx-1 rounded-xl transition-all duration-200"
            style={{
              width: 'calc(100% - 8px)',
              background: activeTab === 'global' ? 'rgba(168,85,247,0.15)' : 'transparent',
              border: activeTab === 'global' ? '1px solid rgba(168,85,247,0.25)' : '1px solid transparent',
            }}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
              style={{ background: 'rgba(168,85,247,0.25)', border: '1px solid rgba(168,85,247,0.3)' }}>
              🌍
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: activeTab === 'global' ? '#e9d5ff' : 'rgba(255,255,255,0.7)' }}>
                Globální chat
              </p>
              <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>Všichni hráči</p>
            </div>
          </button>

          {/* Skupiny label */}
          {groups.length > 0 && (
            <div className="px-4 pt-4 pb-1">
              <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Skupiny
              </p>
            </div>
          )}

          {/* Skupiny */}
          {groups.map(group => {
            const pending = group.pendingMembers?.includes(user?.uid ?? '')
            const isActive = activeTab === group.id
            return (
              <button
                key={group.id}
                onClick={() => setActiveTab(group.id)}
                className="text-left px-3 py-2.5 flex items-center gap-3 mx-1 rounded-xl transition-all duration-200"
                style={{
                  width: 'calc(100% - 8px)',
                  background: isActive ? 'rgba(168,85,247,0.15)' : 'transparent',
                  border: isActive ? '1px solid rgba(168,85,247,0.25)' : '1px solid transparent',
                }}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0"
                  style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
                  {group.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: isActive ? '#e9d5ff' : 'rgba(255,255,255,0.7)' }}>
                    {group.name}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{group.members.length} členů</p>
                </div>
                {pending && (
                  <span className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                    style={{ background: '#fbbf24' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Hlavní chat oblast */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Chat header */}
        <div className="px-6 py-3.5 flex items-center"
          style={{
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}>
          {activeTab === 'global' ? (
            <div>
              <p className="font-black text-base" style={{ color: 'white' }}>🌍 Globální chat</p>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>{players.length} hráčů</p>
            </div>
          ) : activeGroup ? (
            <div>
              <p className="font-black text-base" style={{ color: 'white' }}>{activeGroup.name}</p>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
                {activeGroup.members.map(getName).join(', ')}
                {(activeGroup.pendingMembers?.length ?? 0) > 0 && (
                  <span style={{ color: '#fbbf24' }}> · {activeGroup.pendingMembers.length} čeká</span>
                )}
              </p>
            </div>
          ) : null}
        </div>

        {/* Pozvánka banner */}
        {isPending && (
          <div className="px-6 py-3 flex items-center justify-between"
            style={{ background: 'rgba(251,191,36,0.07)', borderBottom: '1px solid rgba(251,191,36,0.15)' }}>
            <p style={{ fontSize: '0.875rem', color: '#fbbf24' }}>
              Byl/a jsi pozván/a do skupiny <span className="font-bold">{activeGroup?.name}</span>
            </p>
            <button
              onClick={() => acceptGroupInvite(activeTab)}
              className="text-sm font-bold px-4 py-1.5 rounded-xl transition-all"
              style={{ background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', color: '#e9d5ff' }}>
              Připojit se
            </button>
          </div>
        )}

        {/* Zprávy */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1.5">
          {isPending ? (
            <div className="flex-1 flex items-center justify-center h-full">
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.875rem' }}>Přijmi pozvánku pro zobrazení zpráv.</p>
            </div>
          ) : activeMessages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center h-full">
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.875rem' }}>Zatím žádné zprávy. Napiš první! 💬</p>
            </div>
          ) : (
            activeMessages.map((msg, i) => {
              const isMe = msg.userId === user?.uid
              const prevMsg = activeMessages[i - 1]
              const showName = !prevMsg || prevMsg.userId !== msg.userId

              return (
                <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>

                  {/* Avatar */}
                  <div className="w-8 h-8 shrink-0">
                    {showName && (
                      msg.userAvatar ? (
                        <Image
                          src={msg.userAvatar}
                          alt=""
                          width={32}
                          height={32}
                          className="w-8 h-8 rounded-full object-cover"
                          style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: isMe ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}>
                          {msg.userName?.charAt(0).toUpperCase()}
                        </div>
                      )
                    )}
                  </div>

                  <div className={`max-w-xs lg:max-w-md flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {showName && !isMe && (
                      <p className="text-xs mb-1 ml-1" style={{ color: 'rgba(168,85,247,0.7)', fontWeight: 600 }}>
                        {msg.userName}
                      </p>
                    )}
                    <div className="px-4 py-2.5 rounded-2xl"
                      style={isMe ? {
                        background: 'rgba(168,85,247,0.3)',
                        border: '1px solid rgba(168,85,247,0.4)',
                        borderBottomRightRadius: '0.35rem',
                      } : {
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderBottomLeftRadius: '0.35rem',
                      }}>
                      <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.9)' }}>
                        {msg.text}
                      </p>
                    </div>
                    <p className="text-xs mt-0.5 mx-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {!isPending && (
          <div className="p-4"
            style={{
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderTop: '1px solid rgba(255,255,255,0.07)',
            }}>
            <div className="flex gap-3">
              <input
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Napiš zprávu..."
                maxLength={500}
                className="flex-1 px-4 py-2.5 text-sm rounded-2xl outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white',
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
                className="font-bold px-5 py-2.5 rounded-2xl transition-all duration-200 text-sm"
                style={{
                  background: text.trim() ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : 'rgba(255,255,255,0.05)',
                  border: text.trim() ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.07)',
                  color: text.trim() ? 'white' : 'rgba(255,255,255,0.2)',
                  boxShadow: text.trim() ? '0 0 16px rgba(168,85,247,0.25)' : 'none',
                }}>
                Odeslat
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal — nová skupina */}
      {showNewGroup && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md p-6 rounded-2xl"
            style={{
              background: 'rgba(15,15,25,0.95)',
              border: '1px solid rgba(168,85,247,0.2)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(168,85,247,0.1)',
            }}>
            <h3 className="font-black text-lg mb-6" style={{ color: 'white' }}>Nová skupina</h3>

            <div className="mb-4">
              <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Název skupiny
              </p>
              <input
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="např. Foosball tým A"
                maxLength={30}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
              />
            </div>

            <div className="mb-6">
              <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Pozvat hráče
              </p>
              <div className="flex flex-wrap gap-2">
                {players
                  .filter(p => p.uid !== user?.uid)
                  .map(p => (
                    <button
                      key={p.uid}
                      onClick={() => setInviteMembers(prev =>
                        prev.includes(p.uid)
                          ? prev.filter(id => id !== p.uid)
                          : [...prev, p.uid]
                      )}
                      className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200"
                      style={inviteMembers.includes(p.uid) ? {
                        background: 'rgba(168,85,247,0.25)',
                        border: '1px solid rgba(168,85,247,0.5)',
                        color: '#e9d5ff',
                      } : {
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {p.displayName}
                    </button>
                  ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={createGroup}
                disabled={!groupName.trim() || inviteMembers.length === 0}
                className="font-bold py-2.5 px-6 rounded-xl text-sm transition-all"
                style={{
                  background: groupName.trim() && inviteMembers.length > 0
                    ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(168,85,247,0.4)',
                  color: 'white',
                  opacity: !groupName.trim() || inviteMembers.length === 0 ? 0.4 : 1,
                }}>
                Vytvořit
              </button>
              <button
                onClick={() => { setShowNewGroup(false); setGroupName(''); setInviteMembers([]) }}
                className="font-medium py-2.5 px-6 rounded-xl text-sm transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                Zrušit
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}