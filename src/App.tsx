import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useAuth } from '@/hooks/useAuth'

// Pages
import { AuthPage } from '@/pages/AuthPage'
import { GroupsPage } from '@/pages/GroupsPage'
import { GroupDetailPage } from '@/pages/GroupDetailPage'
import { CreateGroupPage } from '@/pages/CreateGroupPage'
import { AddExpensePage } from '@/pages/AddExpensePage'
import { AddPaymentPage } from '@/pages/AddPaymentPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { GroupSettingsPage } from '@/pages/GroupSettingsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 5,
    },
  },
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl animate-bounce">⚡</div>
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/auth" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl animate-bounce">⚡</div>
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      {/* Auth */}
      <Route
        path="/auth"
        element={session ? <Navigate to="/" replace /> : <AuthPage />}
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <GroupsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/create-group"
        element={
          <ProtectedRoute>
            <CreateGroupPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/group/:groupId"
        element={
          <ProtectedRoute>
            <GroupDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/group/:groupId/add-expense"
        element={
          <ProtectedRoute>
            <AddExpensePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/group/:groupId/edit-expense/:expenseId"
        element={
          <ProtectedRoute>
            <AddExpensePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/group/:groupId/add-payment"
        element={
          <ProtectedRoute>
            <AddPaymentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/group/:groupId/settings"
        element={
          <ProtectedRoute>
            <GroupSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AppRoutes />
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
