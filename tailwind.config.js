/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/ui/index.html",
    "./src/ui/app.js",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#f9f9fe",
          dim: "#d9d9e3",
          bright: "#ffffff",
          "container-lowest": "#ffffff",
          "container-low": "#f3f3fb",
          container: "#edecf4",
          "container-high": "#e7e7ef",
          "container-highest": "#e2e1e9",
        },
        primary: {
          DEFAULT: "#005bc1",
          container: "#d6e3ff",
          on: "#ffffff",
          "on-container": "#001b3e",
        },
        tertiary: {
          DEFAULT: "#8e2fbd",
          container: "#f2daff",
          on: "#ffffff",
          "on-container": "#31004a",
        },
        "on-surface": {
          DEFAULT: "#2c333d",
          variant: "#44474e",
        },
        outline: {
          DEFAULT: "#74777f",
          variant: "#c4c6d0",
        },
      },
      boxShadow: {
        glass: "0 8px 60px rgba(44, 51, 61, 0.06)",
        ambient: "0 4px 30px rgba(44, 51, 61, 0.04)",
        soft: "0 2px 16px rgba(44, 51, 61, 0.05)",
      },
      fontFamily: {
        heading: ["Manrope", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "2rem",
        "4xl": "3rem",
      },
    },
  },
  plugins: [],
};
