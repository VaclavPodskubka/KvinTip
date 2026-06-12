'use client'

import './globals.css'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/lib/AuthContext'
import { useAuth } from '@/lib/AuthContext'
import { usePathname } from 'next/navigation'
import Navbar from '@/components/Navbar'

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const pathname = usePathname()
  const showNavbar = user && pathname !== '/login'

  return (
    <>
      {showNavbar && <Navbar />}
      {children}
    </>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="cs">
      <head>
        <title>Kvintip</title>
        <meta name="description" content="Školní ligový systém" />
        
        {/* Sladění barvy s pozadím aplikace pro čistý transition */}
        <meta name="theme-color" content="#0a0a0f" />

        {/* Klíčové tagy pro iOS, aby se skryly lišty prohlížeče */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Kvintip" />

        {/* Normální ikona */}
        <link rel="icon" href="/favicon.png" type="image/png" />

        {/* Apple ikona */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

        {/* Android ikony */}
        <link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png" />

        {/* OPRAVA: Odkaz na správný manifest.json */}
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="bg-gray-950 min-h-screen">
        <AuthProvider>
          <LayoutContent>
            {children}
          </LayoutContent>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1a1a1a',
                color: '#f5f5f5',
                border: '1px solid #333',
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  )
}