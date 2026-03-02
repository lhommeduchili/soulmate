/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/renderer/index.html",
        "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                soul: {
                    green: '#00FF41',
                    red: '#FF3333',
                    warning: '#FFD700',
                    dark: '#0D0208',
                    text: '#008F11',
                },
                app: {
                    bg: '#000000',
                    surface: {
                        DEFAULT: '#18181b',      // zinc-900
                        hover: '#27272a',        // zinc-800
                        active: '#3f3f46',       // zinc-700
                    },
                    border: '#27272a',           // zinc-800
                    line: '#3f3f46',             // zinc-700
                    text: {
                        main: '#ffffff',
                        muted: '#a1a1aa',        // zinc-400
                        dim: '#71717a',          // zinc-500
                    }
                }
            },
            fontFamily: {
                mono: ['Courier Prime', 'monospace'],
                sans: ['Inter', 'system-ui', 'sans-serif']
            }
        },
    },
    plugins: [
        require('tailwind-scrollbar')({ nocompatible: true }),
    ],
}
