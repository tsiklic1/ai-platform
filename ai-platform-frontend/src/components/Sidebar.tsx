import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BrandSwitcher } from './BrandSwitcher'

const linkBase = 'flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors'
const linkActive = 'bg-gray-900 text-white'
const linkInactive = 'text-gray-300 hover:bg-gray-700 hover:text-white'

function SidebarLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkInactive}`}
    >
      {children}
    </NavLink>
  )
}

export function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-gray-800 px-3 py-4">
      <div className="mb-6">
        <BrandSwitcher />
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        <SidebarLink to="/skills">Skills</SidebarLink>
        <SidebarLink to="/contentTypes">Content Types</SidebarLink>
        <SidebarLink to="/images">Pictures</SidebarLink>
        <SidebarLink to="/captions">Captions</SidebarLink>
        <SidebarLink to="/videos">Videos</SidebarLink>
        <SidebarLink to="/identity">Brand Identity</SidebarLink>
        <SidebarLink to="/brands">Manage Brands</SidebarLink>
      </nav>

      <div className="border-t border-gray-700 pt-3 mt-3 px-3">
        <p className="text-xs text-gray-400 truncate mb-2">{user?.email}</p>
        <button
          onClick={logout}
          className="w-full text-left text-sm text-gray-300 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
