
import { createContext, useContext, ReactNode } from 'react'
import { useSpotifyAuth } from '../hooks/useSpotifyAuth'

type SpotifyAuthContextType = ReturnType<typeof useSpotifyAuth>

const SpotifyAuthContext = createContext<SpotifyAuthContextType | null>(null)

export function SpotifyAuthProvider({ children }: { children: ReactNode }) {
    const auth = useSpotifyAuth()
    return (
        <SpotifyAuthContext.Provider value={auth}>
            {children}
        </SpotifyAuthContext.Provider>
    )
}

export function useSpotifyAuthContext() {
    const context = useContext(SpotifyAuthContext)
    if (!context) {
        throw new Error('useSpotifyAuthContext must be used within a SpotifyAuthProvider')
    }
    return context
}
