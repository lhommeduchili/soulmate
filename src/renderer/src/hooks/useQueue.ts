
import { useState, useEffect, useCallback } from 'react'
import { DownloadItem } from '../../../shared/types'

export function useQueue() {
    const [queue, setQueue] = useState<DownloadItem[]>([])

    useEffect(() => {
        // Queue updates via IPC
        const removeListener = window.api.queue.onUpdate((updatedQueue: DownloadItem[]) => {
            setQueue(updatedQueue)
        })
        return () => removeListener()
    }, [])

    const cancelDownload = useCallback((id: string) => {
        window.api.queue.cancel(id)
    }, [])

    const clearQueue = useCallback(() => {
        if (queue.length > 0) {
            window.api.queue.clear()
        }
    }, [queue])

    return { queue, cancelDownload, clearQueue }
}
