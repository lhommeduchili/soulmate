
import { net } from 'electron'
import { Playlist, Track } from '../../shared/types'
import log from '../utils/logger'

export class YoutubeService {

    constructor() { }

    private async fetchPage(url: string): Promise<string> {
        // Use net.fetch from Electron main process
        const response = await net.fetch(url)
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
        }
        return await response.text()
    }

    private extractYtData(html: string): unknown | null {
        try {
            const startToken = 'var ytInitialData = '
            const startIdx = html.indexOf(startToken)
            if (startIdx === -1) return null

            const endToken = ';</script>'
            // Look for end token after start
            let endIdx = html.indexOf(endToken, startIdx)
            if (endIdx === -1) {
                // Try looking for just ; at end of line if structured differently
                // But usually it is followed by </script> in typical YouTube DOM
                endIdx = html.indexOf(';', startIdx + startToken.length)
            }

            if (endIdx === -1) return null

            const jsonStr = html.substring(startIdx + startToken.length, endIdx)
            return JSON.parse(jsonStr) as unknown
        } catch (e) {
            log.error('[YoutubeService] Failed to parse ytInitialData', e)
            return null
        }
    }

    async getPlaylist(url: string): Promise<Playlist | null> {
        try {
            // If passed ID, construct URL
            let targetUrl = url
            if (!url.startsWith('http')) {
                targetUrl = `https://www.youtube.com/playlist?list=${url}`
            }

            const html = await this.fetchPage(targetUrl)
            const data = this.extractYtData(html) as Record<string, any>

            if (!data) {
                log.error('[YoutubeService] No data found')
                return null
            }

            // Extract Metadata
            // structure varies, but usually:
            // microformat.microformatDataRenderer.title
            // header.playlistHeaderRenderer.title.simpleText
            const microformat = data.microformat?.microformatDataRenderer
            const header = data.header?.playlistHeaderRenderer



            const title = microformat?.title || header?.title?.simpleText || 'YouTube Playlist'
            const author = microformat?.uploadDate ? (header?.ownerText?.runs?.[0]?.text || 'Unknown') : 'Unknown'

            // Try different locations for thumbnail
            // 1. Microformat (OG metadata)
            // 2. Header Banner (Hero style)
            // 3. Header Thumbnail (Sidebar style)
            let thumbnail = microformat?.thumbnail?.thumbnails?.[0]?.url
                || header?.playlistHeaderBanner?.thumbnails?.[0]?.url
                || header?.playlistHeaderBanner?.heroPlaylistThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url
                || ''

            // If still no thumbnail, try to find it from the first video in the list
            if (!thumbnail) {
                const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs
                const tab = tabs?.find((t: any) => t.tabRenderer?.selected) || tabs?.[0]
                const contents = tab?.tabRenderer?.content?.sectionListRenderer?.contents
                const videoList = contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents
                if (videoList && videoList.length > 0) {
                    thumbnail = videoList[0]?.playlistVideoRenderer?.thumbnail?.thumbnails?.[0]?.url || ''
                }
            }

            // Clean the thumbnail URL (remove query params like sqp/rs that might expire or block)
            if (thumbnail && thumbnail.includes('?')) {
                thumbnail = thumbnail.split('?')[0]
            }

            const description = microformat?.description || ''

            // Track count
            let totalTracks = 0

            // Try microformat first (usually parsing '100 videos')
            // header.numVideosText.runs[0].text -> "50 videos"
            if (header?.numVideosText?.runs?.[0]?.text) {
                totalTracks = parseInt(header.numVideosText.runs[0].text.replace(/[^0-9]/g, ''))
            } else if (data.sidebar) {
                // Fallback: sometimes in sidebar
                // Fallback: sometimes in sidebar
                // const sidebarItems = data.sidebar.playlistSidebarRenderer?.items
                // Deep search for count if needed
            }

            // Fallback: Count from `contents` directly if available in initial data
            if (totalTracks === 0) {
                const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs
                const tab = tabs?.find((t: any) => t.tabRenderer?.selected) || tabs?.[0]
                const contents = tab?.tabRenderer?.content?.sectionListRenderer?.contents
                const videoListRenderer = contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer
                if (videoListRenderer?.contents) {
                    totalTracks = videoListRenderer.contents.length
                }
            }

            // ID
            const id = header?.playlistId || url.match(/[?&]list=([^#\&\?]+)/)?.[1] || 'unknown'

            return {
                id,
                name: title,
                description,
                images: [{ url: thumbnail }],
                tracks: { total: totalTracks },
                owner: { display_name: author },
                public: true,
                type: 'youtube',
                original_url: targetUrl
            }

        } catch (e) {
            log.error('[YoutubeService] Failed to fetch playlist:', e)
            return null
        }
    }

    async getPlaylistTracks(playlistId: string): Promise<Track[]> {
        try {
            const url = `https://www.youtube.com/playlist?list=${playlistId}`
            const html = await this.fetchPage(url)
            const data = this.extractYtData(html) as Record<string, any>

            if (!data) return []

            // Traverse to find videos
            // contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].playlistVideoListRenderer.contents

            const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs
            if (!tabs) return []

            const tab = tabs.find((t: any) => t.tabRenderer?.selected) || tabs[0]
            const contents = tab?.tabRenderer?.content?.sectionListRenderer?.contents

            if (!contents) return []

            const videoListRenderer = contents[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer
            const videoItems = videoListRenderer?.contents || []

            const tracks: any[] = []

            for (const item of videoItems) {
                const renderer = item.playlistVideoRenderer
                if (!renderer) continue

                // renderer has: videoId, title.runs[0].text, index, lengthSeconds, thumbnail
                // shortBylineText.runs[0].text (Channel Name)

                const videoId = renderer.videoId
                const videoTitle = renderer.title?.runs?.[0]?.text || ''
                const channelName = renderer.shortBylineText?.runs?.[0]?.text || 'Unknown'
                const lengthSeconds = parseInt(renderer.lengthSeconds || '0')
                const thumb = renderer.thumbnail?.thumbnails?.[0]?.url

                // Smart parse
                const { artist, name } = this.parseTrackInfo(videoTitle, channelName)

                tracks.push({
                    id: videoId,
                    name: name,
                    artists: [{ name: artist }],
                    album: { name: 'Unknown' },
                    duration_ms: lengthSeconds * 1000,
                    image: thumb,
                    is_youtube: true
                })
            }

            log.info(`[YoutubeService] Parsed ${tracks.length} tracks`)
            return tracks

        } catch (e) {
            log.error('[YoutubeService] Failed to fetch tracks:', e)
            return []
        }
    }

    private parseTrackInfo(title: string, channelName: string): { artist: string, name: string } {
        let cleanTitle = title
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')
            .trim()

        const parts = cleanTitle.split(' - ')
        if (parts.length >= 2) {
            return {
                artist: parts[0].trim(),
                name: parts.slice(1).join(' - ').trim()
            }
        }

        return {
            artist: channelName,
            name: title
        }
    }
}
