import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    }

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo)
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback
            }
            return (
                <div className="flex flex-col items-center justify-center h-screen bg-[#0E0E0E] text-[#B0B0B0] p-8">
                    <h1 className="text-2xl font-bold text-red-500 mb-4">Something went wrong.</h1>
                    <div className="bg-black/50 p-4 rounded-md overflow-auto max-w-full text-sm font-mono border border-white/10">
                        {this.state.error?.message || 'Unknown Error'}
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-6 px-4 py-2 bg-white/10 hover:bg-white/20 rounded transition-colors"
                        aria-label="Reload application"
                    >
                        Reload
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}
