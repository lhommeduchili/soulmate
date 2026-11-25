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
          green: "#65d685",
          red: "#c09a9f",
          crimson: "#8e3948",
          oxblood: "#36111d",
          cyan: "#c5d7d4",
          warning: "#c09a9f",
          dark: "#030304",
          text: "#65d685",
        },
        app: {
          bg: "#000000",
          surface: {
            DEFAULT: "#08080a",
            hover: "#111115",
            active: "#1a181d",
          },
          border: "rgba(215, 208, 195, 0.16)",
          line: "rgba(215, 208, 195, 0.34)",
          text: {
            main: "#d7d0c3",
            muted: "#a9a19a",
            dim: "#8f8790",
          },
        },
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "SFMono-Regular",
          "ui-monospace",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
        sans: [
          "JetBrains Mono",
          "SFMono-Regular",
          "ui-monospace",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
        editorial: [
          "Fraunces",
          "Cormorant Garamond",
          "Iowan Old Style",
          "Georgia",
          "Times New Roman",
          "serif",
        ],
      },
    },
  },
  plugins: [require("tailwind-scrollbar")({ nocompatible: true })],
};
