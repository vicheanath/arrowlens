/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
      colors: {
        surface: {
          0: "#0d0d14",
          1: "#13131f",
          2: "#181826",
          3: "#1e1e2e",
          4: "#252538",
          5: "#313149",
        },
        border: {
          DEFAULT: "#2a2a3d",
          subtle: "#1e1e2e",
          strong: "#3a3a52",
        },
        text: {
          primary: "#cdd6f4",
          secondary: "#a6adc8",
          muted: "#6c7086",
          inverse: "#1e1e2e",
        },
        accent: {
          blue: "#89b4fa",
          green: "#a6e3a1",
          yellow: "#f9e2af",
          red: "#f38ba8",
          teal: "#94e2d5",
          mauve: "#cba6f7",
          peach: "#fab387",
          sky: "#89dceb",
        },
      },
      boxShadow: {
        panel: "0 0 0 1px rgba(255,255,255,0.05), 0 4px 16px rgba(0,0,0,0.4)",
        tooltip:
          "0 0 0 1px rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
};
