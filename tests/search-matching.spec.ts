import { test, expect } from '@playwright/test'
import { MatchMaker } from '../src/main/services/MatchMaker'

test.describe('soulseek search matching', () => {
    let matchMaker: MatchMaker

    test.beforeEach(() => {
        matchMaker = new MatchMaker(['aiff', 'wav', 'flac', 'mp3'])
    })

    test('matches exact artist and track name', () => {
        const track = {
            id: '1',
            name: 'Bohemian Rhapsody',
            artists: [{ name: 'Queen' }],
            album: { name: 'A Night at the Opera' },
            duration_ms: 354000
        }

        const searchResults = [
            {
                filename: 'Queen - Bohemian Rhapsody.flac',
                bitRate: 1411,
                size: 50000000,
                username: 'user1',
                speed: 5000000,
                slotsFree: true,
                queueLength: 0
            },
            {
                filename: 'Some Other Artist - Random Song.mp3',
                bitRate: 320,
                size: 10000000,
                username: 'user2',
                speed: 3000000,
                slotsFree: true,
                queueLength: 0
            }
        ]

        const result = matchMaker.findBestMatch(track, searchResults)

        expect(result).not.toBeNull()
        expect(result?.filename).toBe('Queen - Bohemian Rhapsody.flac')
    })

    test('matches with special characters and different casing', () => {
        const track = {
            id: '2',
            name: "Don't Stop Me Now",
            artists: [{ name: 'Queen' }],
            album: { name: 'Jazz' },
            duration_ms: 210000
        }

        const searchResults = [
            {
                filename: "queen_-_don't_stop_me_now_(1979).mp3",
                bitRate: 320,
                size: 8000000,
                username: 'user3',
                speed: 4000000,
                slotsFree: true,
                queueLength: 0
            }
        ]

        const result = matchMaker.findBestMatch(track, searchResults)

        expect(result).not.toBeNull()
        expect(result?.filename).toBe("queen_-_don't_stop_me_now_(1979).mp3")
    })

    test('filters out files with wrong artist', () => {
        const track = {
            id: '3',
            name: 'Bohemian Rhapsody',
            artists: [{ name: 'Queen' }],
            album: { name: 'A Night at the Opera' },
            duration_ms: 354000
        }

        const searchResults = [
            {
                filename: 'The Beatles - Bohemian Rhapsody.flac',
                bitRate: 1411,
                size: 50000000,
                username: 'user4',
                speed: 5000000,
                slotsFree: true,
                queueLength: 0
            }
        ]

        const result = matchMaker.findBestMatch(track, searchResults)

        expect(result).toBeNull()
    })

    test('filters out files with wrong track name', () => {
        const track = {
            id: '4',
            name: 'Bohemian Rhapsody',
            artists: [{ name: 'Queen' }],
            album: { name: 'A Night at the Opera' },
            duration_ms: 354000
        }

        const searchResults = [
            {
                filename: 'Queen - We Will Rock You.mp3',
                bitRate: 320,
                size: 8000000,
                username: 'user5',
                speed: 3000000,
                slotsFree: true,
                queueLength: 0
            }
        ]

        const result = matchMaker.findBestMatch(track, searchResults)

        expect(result).toBeNull()
    })

    test('prefers FLAC over MP3 when both match', () => {
        const track = {
            id: '5',
            name: 'Bohemian Rhapsody',
            artists: [{ name: 'Queen' }],
            album: { name: 'A Night at the Opera' },
            duration_ms: 354000
        }

        const searchResults = [
            {
                filename: 'Queen - Bohemian Rhapsody.mp3',
                bitRate: 320,
                size: 8000000,
                username: 'user6',
                speed: 5000000,
                slotsFree: true,
                queueLength: 0
            },
            {
                filename: 'Queen - Bohemian Rhapsody.flac',
                bitRate: 1411,
                size: 50000000,
                username: 'user7',
                speed: 5000000,
                slotsFree: true,
                queueLength: 0
            }
        ]

        const result = matchMaker.findBestMatch(track, searchResults)

        expect(result).not.toBeNull()
        expect(result?.filename).toBe('Queen - Bohemian Rhapsody.flac')
    })

    test('handles filenames with brackets and parentheses', () => {
        const track = {
            id: '6',
            name: 'Bohemian Rhapsody',
            artists: [{ name: 'Queen' }],
            album: { name: 'A Night at the Opera' },
            duration_ms: 354000
        }

        const searchResults = [
            {
                filename: '[HQ] Queen - Bohemian Rhapsody [Original Mix] (1975).flac',
                bitRate: 1411,
                size: 50000000,
                username: 'user8',
                speed: 5000000,
                slotsFree: true,
                queueLength: 0
            }
        ]

        const result = matchMaker.findBestMatch(track, searchResults)

        expect(result).not.toBeNull()
        expect(result?.filename).toBe('[HQ] Queen - Bohemian Rhapsody [Original Mix] (1975).flac')
    })

    test('returns null when no files match relevance criteria', () => {
        const track = {
            id: '7',
            name: 'Bohemian Rhapsody',
            artists: [{ name: 'Queen' }],
            album: { name: 'A Night at the Opera' },
            duration_ms: 354000
        }

        const searchResults = [
            {
                filename: 'The Beatles - Yesterday.mp3',
                bitRate: 320,
                size: 8000000,
                username: 'user9',
                speed: 5000000,
                slotsFree: true,
                queueLength: 0
            },
            {
                filename: 'Pink Floyd - Comfortably Numb.flac',
                bitRate: 1411,
                size: 50000000,
                username: 'user10',
                speed: 5000000,
                slotsFree: true,
                queueLength: 0
            }
        ]

        const result = matchMaker.findBestMatch(track, searchResults)

        expect(result).toBeNull()
    })

    test('prefers files with free slots over queued when quality is equal', () => {
        const track = {
            id: '8',
            name: 'Bohemian Rhapsody',
            artists: [{ name: 'Queen' }],
            album: { name: 'A Night at the Opera' },
            duration_ms: 354000
        }

        const searchResults = [
            {
                filename: 'Queen - Bohemian Rhapsody.flac',
                bitRate: 1411,
                size: 50000000,
                username: 'user11',
                speed: 5000000,
                slotsFree: false,
                queueLength: 5
            },
            {
                filename: 'Queen - Bohemian Rhapsody.flac',
                bitRate: 1411,
                size: 50000000,
                username: 'user12',
                speed: 5000000,
                slotsFree: true,
                queueLength: 0
            }
        ]

        const result = matchMaker.findBestMatch(track, searchResults)

        expect(result).not.toBeNull()
        expect(result?.username).toBe('user12')
    })
})
