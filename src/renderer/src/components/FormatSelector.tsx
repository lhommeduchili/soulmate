import { useState, useEffect } from 'react'

const FORMATS = ['aiff', 'wav', 'flac', 'mp3']

export function FormatSelector(): JSX.Element {
    const [priority, setPriority] = useState<string[]>(FORMATS)

    useEffect(() => {
        window.api.queue.getPriority().then((p: string[]) => {
            if (p && p.length > 0) setPriority(p)
        })
    }, [])

    const handleMove = (index: number, direction: -1 | 1) => {
        const newPriority = [...priority]
        const targetIndex = index + direction
        if (targetIndex < 0 || targetIndex >= newPriority.length) return

        const temp = newPriority[index]
        newPriority[index] = newPriority[targetIndex]
        newPriority[targetIndex] = temp

        setPriority(newPriority)
        window.api.queue.setPriority(newPriority)
    }

    return (
        <div className="flex flex-col items-center">
            <h3 className="text-app-text-dim text-xs font-mono uppercase mb-4 tracking-widest">FILE FORMAT PRIORITY</h3>
            <div className="flex bg-app-surface/80 p-1 rounded-lg border border-app-border">
                {priority.map((fmt, idx) => (
                    <div
                        key={fmt}
                        className="group relative flex items-center"
                    >

                        <div className="px-4 py-2 bg-app-bg border border-app-border rounded mx-1 text-app-text-muted font-mono text-sm uppercase group-hover:border-soul-green/50 group-hover:text-soul-green transition-colors cursor-default">
                            {fmt}
                        </div>

                        {/* Hover Controls */}
                        <div className="absolute inset-0 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity px-1 pointer-events-none">
                            <button
                                onClick={(e) => { e.stopPropagation(); handleMove(idx, -1); }}
                                disabled={idx === 0}
                                className="pointer-events-auto text-soul-green disabled:opacity-0 hover:bg-soul-green/20 rounded-full p-1"
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleMove(idx, 1); }}
                                disabled={idx === priority.length - 1}
                                className="pointer-events-auto text-soul-green disabled:opacity-0 hover:bg-soul-green/20 rounded-full p-1"
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <div className="text-[10px] text-app-text-dim mt-2 font-mono">
                HIGHEST
                <span className="mx-2">◄──────────►</span>
                LOWEST
            </div>
        </div>
    )
}
