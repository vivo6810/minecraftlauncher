/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--tw-bg-rgb) / <alpha-value>)",
        surface: "rgb(var(--tw-surface-rgb) / <alpha-value>)",
        elevated: "rgb(var(--tw-elevated-rgb) / <alpha-value>)",
        border: "rgb(var(--tw-border-rgb) / <alpha-value>)",
        fg: "rgb(var(--tw-fg-rgb) / <alpha-value>)",
        muted: "rgb(var(--tw-muted-rgb) / <alpha-value>)",
        accent: "rgb(var(--tw-accent-rgb) / <alpha-value>)",
        "accent-fg": "rgb(var(--tw-accent-fg-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
