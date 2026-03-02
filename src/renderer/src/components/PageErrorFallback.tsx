import { useNavigate } from 'react-router-dom'

interface PageErrorFallbackProps {
    page: string
}

export function PageErrorFallback({ page }: PageErrorFallbackProps): JSX.Element {
    const navigate = useNavigate()

    return (
        <div
            className="flex flex-col items-center justify-center h-full bg-app-bg text-app-text-dim p-8"
            role="alert"
            aria-live="assertive"
        >
            <div className="text-4xl mb-4" aria-hidden="true">⚠️</div>
            <h2 className="text-lg font-bold text-red-400 mb-2 lowercase">
                something went wrong on the {page} page
            </h2>
            <p className="text-sm text-app-text-muted mb-6 text-center max-w-md">
                an unexpected error occurred. you can try going back home or reloading the app.
            </p>
            <div className="flex gap-3">
                <button
                    onClick={() => navigate('/')}
                    className="px-4 py-2 bg-soul-green text-app-bg font-bold rounded-full text-sm uppercase tracking-wide hover:bg-green-400 transition-all focus:outline-none"
                    aria-label="Go back to home page"
                >
                    go home
                </button>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-app-surface hover:bg-app-surface-hover text-app-text-main rounded-full text-sm uppercase tracking-wide transition-all focus:outline-none"
                    aria-label="Reload the application"
                >
                    reload
                </button>
            </div>
        </div>
    )
}
