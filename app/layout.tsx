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