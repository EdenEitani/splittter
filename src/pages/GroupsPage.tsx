import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useGroups } from '@/hooks/useGroups'
import { GroupCard } from '@/components/GroupCard'
import { Layout } from '@/components/Layout'
import { useAuth } from '@/hooks/useAuth'

export function GroupsPage() {
  const { data: groups, isLoading } = useGroups()
  const { profile } = useAuth()

  return (
    <Layout
      title="My Groups"
      headerRight={
        <Link
          to="/create-group"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
        </Link>
      }
    >
      {/* Greeting */}
      <div className="mb-4">
        <p className="text-gray-500 text-sm">
          Welcome, <span className="font-medium text-gray-800">{profile?.display_name ?? '…'}</span>
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : !groups?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-5xl mb-4">🧾</div>
          <h2 className="text-lg font-semibold text-gray-700">No groups yet</h2>
          <p className="text-sm text-gray-400 mt-1">
            Create a group to start splitting expenses
          </p>
          <Link
            to="/create-group"
            className="mt-4 inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            Create group
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}

      {/* FAB — visible on mobile when list is not empty */}
      {groups && groups.length > 0 && (
        <Link
          to="/create-group"
          className="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors z-30"
        >
          <Plus size={24} />
        </Link>
      )}
    </Layout>
  )
}
