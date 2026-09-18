/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F7F9FA",
        ink: "#16211F",
        muted: "#5B6B69",
        line: "#DDE4E3",
        danger: "#B3261E",
        "danger-light": "#FBEAE9",
        teal: {
          DEFAULT: "#0F6B65",
          dark: "#0B4F4B",
          light: "#E4F0EE",
        },
        amber: {
          DEFAULT: "#C98A3B",
          light: "#FBF1E4",
        },
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
