import { useState, useEffect } from 'react'
import { FormatSelector } from './FormatSelector'

interface Props {
    isOpen: boolean
    onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: Props): JSX.Element | null {
    const [downloadDir, setDownloadDir] = useState<string>('')
    const [isDirChanged, setIsDirChanged] = useState(false)

    useEffect(() => {
        if (isOpen) {
            window.api.settings.getDownloadDir().then(setDownloadDir)
            setIsDirChanged(false)
        }
    }, [isOpen])

    if (!isOpen) return null

    const handleChangeDir = async () => {
        const newPath = await window.api.settings.selectDirectory()
        if (newPath) {
            setDownloadDir(newPath)
            setIsDirChanged(true)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/80 backdrop-blur-sm">
            <div className="bg-app-surface border border-app-line rounded-lg p-6 w-full max-w-md relative shadow-2xl">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-app-text-dim hover:text-app-text-main"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <h2 className="text-xl font-bold text-app-text-main mb-6 tracking-tight lowercase">settings</h2>

                <div className="space-y-6">
                    <div className="space-y-2 flex flex-col items-center w-full">
                        <label className="text-app-text-dim text-xs font-mono uppercase mb-2 tracking-widest text-center">DOWNLOADS DIRECTORY</label>
                        <div className="flex gap-2 w-full">
                            <div className="flex-1 min-w-0 bg-app-bg border border-app-border rounded px-3 py-2 text-xs text-app-text-muted font-mono truncate cursor-default" title={downloadDir}>
                                {downloadDir || 'loading...'}
                            </div>
                            <button
                                onClick={handleChangeDir}
                                className="px-3 py-2 bg-app-surface-hover hover:bg-app-surface-active text-app-text-main rounded text-xs font-bold transition-colors"
                            >
                                CHANGE
                            </button>
                        </div>
                        {isDirChanged && (
                            <div className="text-[10px] text-soul-warning">
                                ⚠ restart app to apply changes
                            </div>
                        )}
                    </div>

                    <div className="border-t border-app-border pt-4">
                        <FormatSelector />
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-app-border text-center">
                    <button
                        onClick={onClose}
                        className="text-sm text-soul-green hover:bg-soul-green/10 rounded px-4 py-2 font-mono lowercase transition-colors"
                    >
                        close configuration
                    </button>
                </div>
            </div>
        </div>
    )
}
