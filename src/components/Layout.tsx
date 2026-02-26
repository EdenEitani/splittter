import { type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, Settings, ArrowLeft } from 'lucide-react'
import { clsx } from 'clsx'

interface LayoutProps {
  children: ReactNode
  title?: string
  showBack?: boolean
  backTo?: string
  headerRight?: ReactNode
  noPad?: boolean
}

export function Layout({
  children,
  title,
  showBack,
  backTo,
  headerRight,
  noPad,
}: LayoutProps) {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-lg mx-auto">
      {/* Header */}
      {(title || showBack) && (
        <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
          <div className="flex items-center h-14 px-4 gap-2">
            {showBack && (
              <Link
                to={backTo ?? -1 as unknown as string}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors -ml-1"
              >
                <ArrowLeft size={20} className="text-gray-600" />
              </Link>
            )}
            <h1 className="flex-1 text-lg font-semibold text-gray-900 truncate">
              {title}
            </h1>
            {headerRight}
          </div>
        </header>
      )}

      {/* Content */}
      <main className={clsx('flex-1', !noPad && 'p-4')}>
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 z-40 bg-white border-t border-gray-100 safe-area-bottom">
        <div className="flex h-16">
          <NavItem
            to="/"
            icon={<Home size={22} />}
            label="Groups"
            active={location.pathname === '/'}
          />
          <NavItem
            to="/settings"
            icon={<Settings size={22} />}
            label="Settings"
            active={location.pathname === '/settings'}
          />
        </div>
      </nav>
    </div>
  )
}

function NavItem({
  to,
  icon,
  label,
  active,
}: {
  to: string
  icon: ReactNode
  label: string
  active: boolean
}) {
  return (
    <Link
      to={to}
      className={clsx(
        'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors',
        active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
      )}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  )
}
