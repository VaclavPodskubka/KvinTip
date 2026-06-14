'use client'

import { useAuth } from '@/lib/AuthContext'
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useSound } from '@/app/hooks/useSound' // <-- 1. Import našeho zvukového hooku

const ADMIN_UID = 'N6AQOKObzKX8vppAVL1siq6bnaG3'

export default function Navbar() {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { playSound } = useSound() // <-- 2. Aktivace hooku uvnitř komponenty
  const [sliderStyle, setSliderStyle] = useState({ left: 0, width: 0 })
  const [menuOpen, setMenuOpen] = useState(false)
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
    playSound('click') // <-- Zvuk při kliknutí na odhlášení
    await signOut(auth)
    router.push('/login')
  }

  const closeMenu = () => setMenuOpen(false)

  return (
    <>
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

        {/* DESKTOP — liquid glass pill, skryje se na mobilu */}
        <div ref={containerRef} className="relative hidden md:flex items-center rounded-full p-1"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: `
              inset 0 0 0 1px rgba(255,255,255,0.05),
              inset 1.8px 3px 0px -2px rgba(255,255,255,0.12),
              inset 0px 3px 4px -2px rgba(0,0,0,0.3),
              0px 6px 16px 0px rgba(0,0,0,0.2)
            `,
          }}
        >
          {sliderStyle.width > 0 && (
            <div className="absolute rounded-full pointer-events-none"
              style={{
                left: sliderStyle.left,
                width: sliderStyle.width,
                top: '4px',
                bottom: '4px',
                background: 'rgba(168,85,247,0.25)',
                border: '1px solid rgba(168,85,247,0.45)',
                boxShadow: `0 0 12px rgba(168,85,247,0.2), inset 2px 1px 0px -1px rgba(255,255,255,0.25)`,
                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          )}
          {links.map((link, i) => {
            const active = pathname === link.href
            return (
              <Link key={link.href} href={link.href}
                ref={el => { linkRefs.current[i] = el }}
                onClick={() => playSound('click')} // <-- Zvuk při kliknutí na odkaz v desktop menu
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

        {/* DESKTOP logout */}
        <button onClick={handleLogout}
          className="hidden md:block text-sm px-4 py-2 rounded-xl font-medium transition-all duration-200"
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

        {/* MOBIL — hamburger tlačítko */}
        <button
          onClick={() => {
            playSound('click') // <-- Zvuk při kliknutí na otevření/zavření mobilního menu
            setMenuOpen(prev => !prev)
          }}
          className="md:hidden flex flex-col justify-center items-center w-10 h-10 rounded-xl transition-all"
          style={{
            background: menuOpen ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.05)',
            border: menuOpen ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span className="block w-5 h-0.5 transition-all duration-300"
            style={{
              background: 'rgba(255,255,255,0.8)',
              transform: menuOpen ? 'rotate(45deg) translate(0px, 6px)' : 'none',
              marginBottom: '4px',
            }} />
          <span className="block w-5 h-0.5 transition-all duration-300"
            style={{
              background: 'rgba(255,255,255,0.8)',
              opacity: menuOpen ? 0 : 1,
              marginBottom: '4px',
            }} />
          <span className="block w-5 h-0.5 transition-all duration-300"
            style={{
              background: 'rgba(255,255,255,0.8)',
              transform: menuOpen ? 'rotate(-45deg) translate(0px, -6px)' : 'none',
            }} />
        </button>
      </nav>

      {/* MOBIL — dropdown menu */}
      {menuOpen && (
        <div className="md:hidden fixed top-14 left-0 right-0 z-40 p-4"
          style={{
            background: 'rgba(10,10,15,0.95)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <div className="flex flex-col gap-1">
            {links.map(link => {
              const active = pathname === link.href
              return (
                <Link key={link.href} href={link.href}
                  onClick={() => {
                    playSound('click') // <-- Zvuk při kliknutí na odkaz v mobilním menu
                    closeMenu()
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all"
                  style={{
                    background: active ? 'rgba(168,85,247,0.2)' : 'transparent',
                    border: active ? '1px solid rgba(168,85,247,0.35)' : '1px solid transparent',
                    color: active ? 'white' : 'rgba(255,255,255,0.5)',
                  }}
                >
                  <span className="text-lg">{link.emoji}</span>
                  <span>{link.label}</span>
                  {active && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: '#a855f7' }} />
                  )}
                </Link>
              )
            })}

            <button
              onClick={() => { closeMenu(); handleLogout() }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm mt-2 w-full transition-all"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              <span className="text-lg">🚪</span>
              <span>Odhlásit se</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}