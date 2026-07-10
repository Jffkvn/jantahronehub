import type { AuthGateway } from '../modules/auth/AuthGateway'
import { AuthProvider } from '../modules/auth/AuthProvider'
import { AppRouter } from './router'

export function App({ authGateway }: { authGateway?: AuthGateway }) {
  return (
    <AuthProvider gateway={authGateway}>
      <AppRouter />
    </AuthProvider>
  )
}
