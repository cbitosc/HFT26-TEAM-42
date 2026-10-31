import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "var(--ink-950)", 900: "var(--ink-900)", 800: "var(--ink-800)" },
        mist: { 100: "var(--mist-100)", 300: "var(--mist-300)", 500: "var(--mist-500)" },
        verified: "var(--verified)",
        regression: "var(--regression)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [],
};

export default config;
