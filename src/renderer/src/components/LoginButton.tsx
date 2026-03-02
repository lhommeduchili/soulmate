import { useState } from 'react'

interface Props {
    onClick: () => void
}

export function LoginButton({ onClick }: Props): JSX.Element {
    const [isLoggedIn] = useState(false) // This specific internal state seems unused or legacy? 
    // The component below returns "Connected" if isLoggedIn is true.
    // Ideally we remove this internal state and rely on parent, but let's keep it minimal change for now
    // except passing onClick.

    // Actually, if we use it in LoginPage which checks isAuthenticated, we might not need "Connected" state here.
    // But let's support passing it in if needed? No, LoginPage handles redirection.
    // So just onClick.

    if (isLoggedIn) {
        return (
            <div className="flex items-center gap-2 text-soul-green font-mono uppercase bg-soul-green/10 px-4 py-2 rounded-full border border-soul-green/20">
                <span className="w-2 h-2 bg-soul-green rounded-full animate-pulse"></span>
                Connected
            </div>
        )
    }

    return (
        <button
            onClick={onClick}
            className="group relative px-8 py-4 bg-soul-green text-app-bg font-bold uppercase tracking-widest rounded-full hover:bg-green-400 hover:scale-105 transition-all shadow-[0_0_20px_rgba(0,255,65,0.3)] hover:shadow-[0_0_40px_rgba(0,255,65,0.5)] overflow-hidden"
        >
            <span className="relative z-10 flex items-center gap-3">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.48.66.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141 4.32-1.38 9.841-.719 13.44 1.441.42.3.6.84.3 1.26zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                </svg>
                Connect Spotify
            </span>
            <div className="absolute inset-0 bg-app-text-main/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
        </button>
    )
}
