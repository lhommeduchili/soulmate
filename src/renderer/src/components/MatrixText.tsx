import { useState, useEffect } from 'react'

export function MatrixText({ text, delay = 0 }: { text: string; delay?: number }): JSX.Element {
    const [display, setDisplay] = useState('')
    const [finalText] = useState(text.toLowerCase())
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789$#@%&'

    useEffect(() => {
        let timeout: NodeJS.Timeout
        let frame = 0
        const totalFrames = 20 // How long the animation lasts

        const animate = () => {
            if (frame > totalFrames) {
                setDisplay(finalText)
                return
            }

            const current = finalText.split('').map((char, i) => {
                if (frame > (i % 5) * 2 + 10) return char
                return chars[Math.floor(Math.random() * chars.length)]
            }).join('')

            setDisplay(current)
            frame++
            timeout = setTimeout(animate, 50)
        }

        timeout = setTimeout(animate, delay)
        return () => clearTimeout(timeout)
    }, [finalText, delay])

    return <span>{display}</span>
}
