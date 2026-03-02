import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useLocation } from 'react-router-dom'

interface Props {
    children: ReactNode
}

export function Layout({ children }: Props): JSX.Element {
    const location = useLocation()
    const isLogin = location.pathname === '/login'

    if (isLogin) {
        return <div className="h-screen w-screen bg-app-bg">{children}</div>
    }

    return (
        <div className="flex h-screen w-screen bg-app-bg overflow-hidden">
            <Sidebar />
            <main className="flex-1 flex flex-col min-w-0 bg-gradient-to-b from-app-surface to-app-bg overflow-auto relative scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-app-surface-active scrollbar-track-transparent">
                <TopBar />
                {children}
            </main>
        </div>
    )
}
