
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SpotifyAuthProvider } from './context/SpotifyAuthContext'
import { LibraryProvider } from './context/LibraryContext'
import { Layout } from './components/Layout'
import { LoadingOverlay } from './components/LoadingOverlay'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PageErrorFallback } from './components/PageErrorFallback'
import { useSoulseek } from './hooks/useSoulseek'

import { LoginPage } from './pages/LoginPage'
import { PlaylistsPage } from './pages/PlaylistsPage'
import { ReviewPage } from './pages/ReviewPage'

function AppContent(): JSX.Element {
    const { isConnected: isSoulseekConnected } = useSoulseek()

    return (
        <Layout>
            {!isSoulseekConnected && (
                <div className="fixed inset-0 z-50 pointer-events-none">
                    <div className="pointer-events-auto h-full w-full">
                        <LoadingOverlay text="connecting to soulseek network..." />
                    </div>
                </div>
            )}

            <Routes>
                <Route path="/login" element={
                    <ErrorBoundary fallback={<PageErrorFallback page="login" />}>
                        <LoginPage />
                    </ErrorBoundary>
                } />
                <Route path="/" element={
                    <ErrorBoundary fallback={<PageErrorFallback page="playlists" />}>
                        <PlaylistsPage />
                    </ErrorBoundary>
                } />
                <Route path="/review/:type/:id" element={
                    <ErrorBoundary fallback={<PageErrorFallback page="review" />}>
                        <ReviewPage />
                    </ErrorBoundary>
                } />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Layout>
    )
}

function App(): JSX.Element {
    return (
        <ErrorBoundary>
            <SpotifyAuthProvider>
                <LibraryProvider>
                    <HashRouter>
                        <ErrorBoundary>
                            <AppContent />
                        </ErrorBoundary>
                    </HashRouter>
                </LibraryProvider>
            </SpotifyAuthProvider>
        </ErrorBoundary>
    )
}

export default App
