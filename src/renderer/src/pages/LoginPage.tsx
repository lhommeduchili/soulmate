
import { useSpotifyAuthContext } from '../context/SpotifyAuthContext'
import { LoginButton } from '../components/LoginButton'
import { Navigate } from 'react-router-dom'

export function LoginPage() {
    const { isAuthenticated, login } = useSpotifyAuthContext()

    if (isAuthenticated) {
        return <Navigate to="/" replace />
    }

    return (
        <div className="flex flex-col items-center justify-center h-full space-y-8">
            <LoginButton onClick={login} />
            <div className="text-zinc-500 font-mono text-sm">
                connect with spotify to access your library
            </div>
        </div>
    )
}
