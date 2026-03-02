
import { useState, useEffect, useCallback } from 'react'

export function useSpotifyAuth() {
    const [isAuthenticated, setIsAuthenticated] = useState(false)

    useEffect(() => {
        // Initial Auth Check
        window.api.spotify.status().then((isAuth: boolean) => {
            setIsAuthenticated(isAuth)
        })

        // Listen for successful Spotify login from deep link
        const removeListener = window.api.spotify.onConnected(() => {
            console.log('[useSpotifyAuth] Spotify Connected!')
            setIsAuthenticated(true)
        })

        return () => {
            removeListener()
        }
    }, [])

    const login = useCallback(async () => {
        await window.api.spotify.login()
    }, [])

    const logout = useCallback(async () => {
        await window.api.spotify.logout()
        setIsAuthenticated(false)
    }, [])

    return { isAuthenticated, login, logout }
}
