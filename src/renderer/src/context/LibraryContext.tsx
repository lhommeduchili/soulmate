
import { createContext, useContext, ReactNode } from 'react'
import { useLibrary } from '../hooks/useLibrary'

type LibraryContextType = ReturnType<typeof useLibrary>

const LibraryContext = createContext<LibraryContextType | null>(null)

export function LibraryProvider({ children }: { children: ReactNode }) {
    const library = useLibrary()
    return (
        <LibraryContext.Provider value={library}>
            {children}
        </LibraryContext.Provider>
    )
}

export function useLibraryContext() {
    const context = useContext(LibraryContext)
    if (!context) {
        throw new Error('useLibraryContext must be used within a LibraryProvider')
    }
    return context
}
