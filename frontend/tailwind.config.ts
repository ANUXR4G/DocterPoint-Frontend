import type { Config } from "tailwindcss"
import defaultTheme from "tailwindcss/defaultTheme"

const config: Config = {
  darkMode: "selector",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: {
      xxs: "375px",
      xs: "475px",
      ...defaultTheme.screens,
      "2xl": "1440px",
      "3xl": "1536px",
    },
    extend: {
      colors: {
        solune: {
          canvas: "var(--solune-canvas)",
          surface: "var(--solune-surface)",
          ink: "var(--solune-ink)",
          muted: "var(--solune-muted)",
          purple: "var(--solune-purple)",
          green: "var(--solune-green)",
          coral: "var(--solune-coral)",
          amber: "var(--solune-amber)",
        },
        gg: {
          canvas: "var(--solune-canvas)",
          iris: "#1a1816",
          shadow: "#242220",
          elevated: "#2e2b28",
          glow: "#2e2b28",
          pulse: "#2e2b28",
          accent: "var(--theme-primary)",
          border: "rgba(255,255,255,0.08)",
          veil: "#2e2b28",
          lilac: "#a8a29e",
          mist: "#a8a29e",
          cyan: "var(--theme-primary)",
          "cyan-soft": "var(--theme-primary)",
          mint: "var(--solune-green)",
          teal: "var(--theme-primary)",
          fog: "#8a8580",
          ash: "rgba(255,255,255,0.12)",
          pearl: "#ffffff",
          cloud: "#f5f2ee",
          ink: "var(--solune-ink)",
        },
        practo: {
          navy: "#2d2a26",
          cyan: "var(--theme-primary)",
          ink: "var(--solune-ink)",
          muted: "var(--solune-muted)",
          line: "var(--solune-border)",
          page: "var(--solune-canvas)",
        },
        primary: {
          DEFAULT: "var(--theme-primary)",
          foreground: "var(--theme-primary-foreground)",
          hover: "var(--theme-primary-hover)",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", ...defaultTheme.fontFamily.sans],
        display: ["var(--font-body)", ...defaultTheme.fontFamily.sans],
      },
      boxShadow: {
        iris: "var(--solune-shadow-soft)",
        "iris-soft": "var(--solune-shadow-card)",
        solune: "var(--solune-shadow-soft)",
        "solune-card": "var(--solune-shadow-card)",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        fade: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        rise: "rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "rise-delay": "rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both",
        "rise-late": "rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both",
        fade: "fade 0.9s ease-out both",
      },
      transformOrigin: {
        "0": "0% 0%",
        "top-bottom": "0% 100%",
      },
    },
  },
  plugins: [],
}
export default config
