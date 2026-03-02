import { useState, useEffect } from 'react'
import logo from '../assets/logo.png'
import { MatrixText } from './MatrixText'
import { useQueue } from '../hooks/useQueue'

export function Sidebar(): JSX.Element {
    // --- Footer Logic ---
    const [footerText, setFooterText] = useState('')
    const [phraseIndex, setPhraseIndex] = useState(0)
    const [isDeleting, setIsDeleting] = useState(false)
    const [cursorVisible, setCursorVisible] = useState(true)

    const phrases = ["made with love", "by pabli & alφ", "buy us a coffee"]
    const TYPING_SPEED = 100
    const DELETING_SPEED = 50
    const PAUSE_DURATION = 2000

    useEffect(() => {
        const cursorInterval = setInterval(() => {
            setCursorVisible(v => !v)
        }, 500)
        return () => clearInterval(cursorInterval)
    }, [])

    useEffect(() => {
        let timer: NodeJS.Timeout
        const handleTyping = () => {
            const currentPhrase = phrases[phraseIndex]
            if (isDeleting) {
                setFooterText(prev => prev.slice(0, -1))
                if (footerText === '') {
                    setIsDeleting(false)
                    setPhraseIndex(prev => (prev + 1) % phrases.length)
                }
            } else {
                setFooterText(currentPhrase.slice(0, footerText.length + 1))
                if (footerText === currentPhrase) {
                    timer = setTimeout(() => setIsDeleting(true), PAUSE_DURATION)
                    return
                }
            }
        }
        timer = setTimeout(handleTyping, isDeleting ? DELETING_SPEED : TYPING_SPEED)
        return () => clearTimeout(timer)
    }, [footerText, isDeleting, phraseIndex])

    const handleFooterClick = () => {
        window.open('https://buymeacoffee.com/lhommeduchili', '_blank')
    }
    // --------------------

    const { queue, cancelDownload, clearQueue } = useQueue()

    const handleCancel = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        cancelDownload(id)
    }

    return (
        <aside className="w-64 bg-app-bg flex flex-col h-screen border-r border-app-border overflow-hidden relative" aria-label="Main sidebar">
            <div className="p-6">
                <div className="text-xl font-bold tracking-tight text-app-text-main flex items-center gap-3 lowercase mb-4">
                    <img src={logo} className="w-10 h-10 object-contain" alt="soulmate logo" />
                    soulmate
                </div>
            </div>

            {/* Matrix Download Queue */}
            <div className="flex-1 px-6 space-y-4 overflow-hidden flex flex-col" aria-label="Download queue">
                <div className="flex items-center justify-between font-mono text-xs uppercase tracking-widest mb-2 shrink-0 group">
                    <h2 className="flex items-center gap-2 text-soul-green">
                        <span>download queue</span>
                    </h2>
                    <button
                        onClick={clearQueue}
                        className="text-app-text-dim hover:text-soul-red opacity-0 focus:opacity-100 group-hover:opacity-100 transition-opacity text-[10px] font-bold pr-1 focus:outline-none rounded-sm"
                        aria-label="Clear download queue"
                    >
                        CLEAR
                    </button>
                </div>

                <div className="space-y-4 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-app-surface-hover scrollbar-track-transparent pr-2 h-full" role="list">
                    {queue.length === 0 && (
                        <div className="text-app-text-dim font-mono text-[10px] lowercase text-center pt-8" role="status">
                            queue empty
                        </div>
                    )}

                    {queue.map((item, idx) => (
                        <div key={item.id} className="font-mono text-xs space-y-1 group relative" role="listitem">
                            <div className={`flex justify-between items-center lowercase gap-2 ${['offline', 'failed'].includes(item.status) ? 'text-soul-red' : 'text-app-text-muted'}`}>
                                <div className="relative overflow-hidden flex-1 min-w-0 group/text">
                                    <div className="truncate group-hover/text:animate-marquee whitespace-nowrap" aria-label={`${item.track.name} by ${item.track.artists?.[0]?.name || 'Unknown'}`}>
                                        <MatrixText text={`${item.track.artists?.[0]?.name || 'Unknown'} - ${item.track.name}`} delay={idx * 200} />
                                    </div>
                                </div>
                                {/* Cancel Button - visible on hover */}
                                <button
                                    onClick={(e) => handleCancel(e, item.id)}
                                    className="text-app-text-dim hover:text-soul-red opacity-0 focus:opacity-100 group-hover:opacity-100 transition-all text-xs p-1 flex-shrink-0 focus:outline-none rounded-sm"
                                    aria-label={`Cancel download for ${item.track.name}`}
                                >
                                    ✕
                                </button>
                            </div>

                            {['offline', 'failed'].includes(item.status) ? (
                                <div className="text-right text-[10px] text-soul-red font-bold">
                                    {item.status === 'failed' ? 'NOT FOUND' : 'OFFLINE'}
                                </div>
                            ) : (
                                <>
                                    <div className="w-full bg-app-surface h-1 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-soul-green shadow-[0_0_10px_rgba(30,215,96,0.6)] transition-all duration-200 ease-out"
                                            style={{ width: `${item.progress}%` }}
                                        ></div>
                                    </div>
                                    <div className="text-right text-[10px] text-app-text-dim">
                                        {item.status === 'completed'
                                            ? <span className="text-soul-green font-bold">COMPLETE</span>
                                            : item.status === 'searching'
                                                ? <span className="animate-pulse">SEARCHING...</span>
                                                : item.status === 'queued'
                                                    ? 'QUEUED'
                                                    : <span className="font-mono">{Math.floor(item.progress)}%</span>
                                        }
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-4 border-t border-app-border">
                <div
                    onClick={handleFooterClick}
                    className="text-xs text-app-text-dim font-mono text-center lowercase cursor-pointer hover:text-soul-green transition-colors h-4 flex items-center justify-center"
                >
                    <span>{footerText}</span>
                    <span className={`${cursorVisible ? 'opacity-100' : 'opacity-0'} ml-0.5`}>█</span>
                </div>
            </div>
        </aside>
    )
}
