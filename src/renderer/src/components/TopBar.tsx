import { useState } from 'react'
import { SettingsModal } from './SettingsModal'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSpotifyAuthContext } from '../context/SpotifyAuthContext'
import { useLibraryContext } from '../context/LibraryContext'

export function TopBar(): JSX.Element {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const { isAuthenticated, logout } = useSpotifyAuthContext()
    const { searchTerm, setSearchTerm, search } = useLibraryContext()
    const navigate = useNavigate()
    const location = useLocation()
    const isHome = location.pathname === '/'

    const handleHome = () => {
        navigate('/')
    }

    const handleLogout = () => {
        if (!isAuthenticated) return
        logout()
        navigate('/')
    }

    return (
        <>
            <header className="sticky top-0 z-30 flex justify-between items-center p-4 gap-4 pointer-events-none" aria-label="Top application bar">
                {/* Home Button - Aligned Left */}
                <nav className="pointer-events-auto" aria-label="Main navigation">
                    <button
                        onClick={handleHome}
                        disabled={isHome}
                        aria-label="Navigate to Home"
                        aria-current={isHome ? 'page' : undefined}
                        className={`p-2 rounded-full transition-colors focus:outline-none ${isHome
                            ? 'text-app-text-main/20 cursor-default'
                            : 'text-app-text-muted hover:text-app-text-main hover:bg-app-surface-hover'
                            }`}
                        title="Home"
                    >
                        <svg className="w-6 h-6" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    </button>
                </nav>

                {/* Search Bar - Centered */}
                <div className="pointer-events-auto flex-1 max-w-md mx-4" role="search">
                    <div className="relative group flex items-center">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" aria-hidden="true">
                            {/* Magnifier Icon */}
                            <svg className="h-4 w-4 text-app-text-dim transition-colors group-hover:text-soul-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <label htmlFor="playlist-search" className="sr-only">Search for playlist URL</label>
                        <input
                            id="playlist-search"
                            type="search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    search(searchTerm)
                                }
                            }}
                            className="block w-full pl-10 pr-20 py-2 border border-app-border rounded-full leading-5 bg-app-bg/50 text-app-text-main placeholder-app-text-dim/50 focus:outline-none focus:border-soul-green/50 sm:text-sm transition-all shadow-sm backdrop-blur-sm"
                            placeholder="paste public spotify or youtube playlist url"
                        />
                        {/* Right Side Actions */}
                        <div className="absolute inset-y-0 right-0 flex items-center">
                            <div className="h-4 w-px bg-app-border mx-2"></div>
                            <button
                                className="pr-3 pl-1 text-xs text-app-text-dim hover:text-soul-green focus:text-soul-green transition-colors font-medium lowercase focus:outline-none rounded-r-full"
                                aria-label="Browse playlist URL"
                                onClick={() => search(searchTerm)}
                            >
                                browse
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Actions */}
                <div className="pointer-events-auto flex items-center gap-2 bg-app-bg/50 backdrop-blur rounded-full p-2 border border-app-border">
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        aria-label="Open Settings"
                        aria-haspopup="dialog"
                        className="p-2 text-app-text-muted hover:text-app-text-main hover:bg-app-surface-hover rounded-full transition-colors focus:outline-none"
                        title="Configuration"
                    >
                        <svg className="w-5 h-5" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>

                    <div className="w-px h-4 bg-app-line"></div>

                    <button
                        onClick={handleLogout}
                        aria-label="Log Out"
                        className="p-2 text-app-text-muted hover:text-red-500 hover:bg-app-surface-hover rounded-full transition-colors focus:outline-none"
                        title="Logout"
                    >
                        <svg className="w-5 h-5 ml-1" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </button>
                </div>
            </header>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </>
    )
}
