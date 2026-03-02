
import { useState, useEffect } from 'react'

export function useSoulseek() {
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const status = await window.api.slskd.status()
                // Check if state is Connected or LoggedIn
                // Slskd /application returns { server: { state: 'Connected, LoggedIn', isLoggedIn: true } }
                const connected = status.server?.isLoggedIn ||
                    status.server?.state?.includes('Connected') ||
                    status.state === 'Connected'

                setIsConnected(!!connected)
            } catch (e) {
                console.error('Failed to check Soulseek status', e)
                setIsConnected(false)
            }
        }

        checkStatus()
        const interval = setInterval(checkStatus, 3000)

        return () => clearInterval(interval)
    }, [])

    return { isConnected }
}
