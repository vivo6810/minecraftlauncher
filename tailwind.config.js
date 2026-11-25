/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--tw-bg)",
        surface: "var(--tw-surface)",
        elevated: "var(--tw-elevated)",
        border: "var(--tw-border)",
        fg: "var(--tw-fg)",
        muted: "var(--tw-muted)",
        accent: "var(--tw-accent)",
        "accent-fg": "var(--tw-accent-fg)",
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
