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
        <meta name="theme-color" content="#a855f7" />

        {/* Normální ikona */}
        <link rel="icon" href="/favicon.png" type="image/png" />

        {/* Apple ikona */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

        {/* Android ikony */}
        <link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png" />

        {/* PWA manifest pro Android */}
        <link rel="manifest" href="/site.webmanifest" />
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