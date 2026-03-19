/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/ui/index.html",
    "./src/ui/app.js",
  ],
  theme: {
    extend: {
      boxShadow: {
        glass: "0 24px 80px rgba(15, 23, 42, 0.18)",
        soft: "0 18px 48px rgba(30, 41, 59, 0.14)",
      },
      fontFamily: {
        body: ["Noto Sans SC", "IBM Plex Sans", "Segoe UI", "sans-serif"],
        display: ["Space Grotesk", "Noto Sans SC", "sans-serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
