import { type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Home, Settings, ArrowLeft, Bell } from 'lucide-react'
import { clsx } from 'clsx'
import appIcon from '@/assets/splittter.png'

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
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* ── Desktop Sidebar ─────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-gray-100 sticky top-0 h-screen flex-shrink-0">
        {/* Logo */}
        <div className="p-4 border-b border-gray-100 flex items-center gap-2.5">
          <img src={appIcon} alt="" className="w-8 h-8 rounded-lg" />
          <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-violet-500 bg-clip-text text-transparent">
            Splittter
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-3 overflow-y-auto space-y-5">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1.5">
              Menu
            </p>
            <div className="space-y-0.5">
              <SidebarItem to="/" icon={<Home size={18} />} label="Dashboard" active={location.pathname === '/'} />
              <SidebarItem to="/notifications" icon={<Bell size={18} />} label="Activity" active={location.pathname === '/notifications'} />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1.5">
              Personal
            </p>
            <div className="space-y-0.5">
              <SidebarItem to="/settings" icon={<Settings size={18} />} label="Settings" active={location.pathname === '/settings'} />
            </div>
          </div>
        </nav>

        {/* Bottom area */}
        <div className="p-3 border-t border-gray-100">
          <Link
            to="/create-group"
            className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
          >
            + New Group
          </Link>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Mobile header */}
        {(title || showBack) && (
          <header className="md:hidden sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
            <div className="flex items-center h-14 px-4 gap-2">
              {showBack && (
                backTo ? (
                  <Link
                    to={backTo}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors -ml-1"
                  >
                    <ArrowLeft size={20} className="text-gray-600" />
                  </Link>
                ) : (
                  <button
                    onClick={() => navigate(-1)}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors -ml-1"
                  >
                    <ArrowLeft size={20} className="text-gray-600" />
                  </button>
                )
              )}
              <h1 className="flex-1 text-lg font-semibold text-gray-900 truncate">{title}</h1>
              {headerRight}
              {/* Notification bell – mobile */}
              {!showBack && (
                <Link
                  to="/notifications"
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
                >
                  <Bell size={20} />
                </Link>
              )}
            </div>
          </header>
        )}

        {/* Desktop page header */}
        {(title || headerRight) && (
          <header className="hidden md:flex items-center h-16 px-6 gap-3 bg-white border-b border-gray-100 sticky top-0 z-40">
            {showBack && (
              backTo ? (
                <Link
                  to={backTo}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <ArrowLeft size={20} className="text-gray-600" />
                </Link>
              ) : (
                <button
                  onClick={() => navigate(-1)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <ArrowLeft size={20} className="text-gray-600" />
                </button>
              )
            )}
            <h1 className="flex-1 text-2xl font-bold text-gray-900 truncate">{title}</h1>
            {headerRight}
          </header>
        )}

        {/* Content */}
        <main className={clsx('flex-1', !noPad && 'p-4 md:p-6 md:max-w-4xl md:w-full')}>
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden sticky bottom-0 z-40 bg-white border-t border-gray-100 safe-area-bottom">
          <div className="flex h-16">
            <NavItem to="/" icon={<Home size={22} />} label="Dashboard" active={location.pathname === '/'} />
            <NavItem
              to="/notifications"
              icon={<Bell size={22} />}
              label="Activity"
              active={location.pathname === '/notifications'}
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
    </div>
  )
}

// ── Sidebar nav item (desktop) ─────────────────────────────────────────────────

function SidebarItem({
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
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
        active
          ? 'bg-blue-50 text-blue-700'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      )}
    >
      <span className={clsx(active ? 'text-blue-600' : 'text-gray-400')}>{icon}</span>
      {label}
    </Link>
  )
}

// ── Bottom nav item (mobile) ───────────────────────────────────────────────────

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
