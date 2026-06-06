'use client'

import { useAuth } from '@/lib/AuthContext'
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

const ADMIN_UID = 'N6AQOKObzKX8vppAVL1siq6bnaG3'

export default function Navbar() {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sliderStyle, setSliderStyle] = useState({ left: 0, width: 0 })
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const links = [
    { href: '/dashboard', emoji: '🏠', label: 'Dashboard' },
    { href: '/matches', emoji: '⚽', label: 'Zápasy' },
    { href: '/leaderboard', emoji: '🏆', label: 'Žebříček' },
    { href: '/betting', emoji: '🎯', label: 'Sázky' },
    { href: '/chat', emoji: '💬', label: 'Chat' },
    { href: '/profile', emoji: '👤', label: 'Profil' },
    ...(user?.uid === ADMIN_UID ? [{ href: '/admin', emoji: '⚙️', label: 'Admin' }] : []),
  ]

  const activeIndex = links.findIndex(l => l.href === pathname)

  useEffect(() => {
    const activeEl = linkRefs.current[activeIndex]
    const containerEl = containerRef.current
    if (!activeEl || !containerEl) return

    const containerRect = containerEl.getBoundingClientRect()
    const activeRect = activeEl.getBoundingClientRect()

    setSliderStyle({
      left: activeRect.left - containerRect.left,
      width: activeRect.width,
    })
  }, [activeIndex, pathname])

  const handleLogout = async () => {
    await signOut(auth)
    router.push('/login')
  }

  return (
    <nav className="sticky top-0 z-50 px-6 py-3 flex items-center justify-between"
      style={{
        background: 'rgba(10, 10, 15, 0.65)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Logo */}
      <span className="font-black text-xl tracking-tight select-none"
        style={{
          background: 'linear-gradient(135deg, #e9d5ff, #a855f7)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
        Kvintip
      </span>

      {/* Pill container */}
      <div ref={containerRef} className="relative flex items-center rounded-full p-1"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: `
            inset 0 0 0 1px rgba(255,255,255,0.05),
            inset 1.8px 3px 0px -2px rgba(255,255,255,0.12),
            inset -2px -2px 0px -2px rgba(255,255,255,0.08),
            inset 0px 3px 4px -2px rgba(0,0,0,0.3),
            0px 6px 16px 0px rgba(0,0,0,0.2)
          `,
        }}
      >
        {/* Sliding indicator — pozicovaný přesně podle DOM elementu */}
        {sliderStyle.width > 0 && (
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              left: sliderStyle.left,
              width: sliderStyle.width,
              top: '4px',
              bottom: '4px',
              background: 'rgba(168,85,247,0.25)',
              border: '1px solid rgba(168,85,247,0.45)',
              boxShadow: `
                0 0 12px rgba(168,85,247,0.2),
                inset 2px 1px 0px -1px rgba(255,255,255,0.25),
                inset -1.5px -1px 0px -1px rgba(255,255,255,0.1),
                inset -1px 2px 3px -1px rgba(0,0,0,0.2)
              `,
              transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        )}

        {/* Links */}
        {links.map((link, i) => {
          const active = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              ref={el => { linkRefs.current[i] = el }}
              className="relative z-10 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-colors duration-200 whitespace-nowrap"
              style={{
                color: active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
                textShadow: active ? '0 0 20px rgba(168,85,247,0.6)' : 'none',
              }}
            >
              <span className="text-base leading-none">{link.emoji}</span>
              <span className="hidden lg:inline">{link.label}</span>
            </Link>
          )
        })}
      </div>

      {/* Logout */}
      <button onClick={handleLogout}
        className="text-sm px-4 py-2 rounded-xl font-medium transition-all duration-200"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.5)',
        }}
        onMouseEnter={e => {
          const b = e.currentTarget as HTMLButtonElement
          b.style.background = 'rgba(168,85,247,0.15)'
          b.style.borderColor = 'rgba(168,85,247,0.4)'
          b.style.color = 'white'
        }}
        onMouseLeave={e => {
          const b = e.currentTarget as HTMLButtonElement
          b.style.background = 'rgba(255,255,255,0.05)'
          b.style.borderColor = 'rgba(255,255,255,0.08)'
          b.style.color = 'rgba(255,255,255,0.5)'
        }}
      >
        Odhlásit
      </button>
    </nav>
  )
}