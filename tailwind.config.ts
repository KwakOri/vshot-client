import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // VShot Theme Colors
        primary: {
          DEFAULT: "#FC712B",
          light: "#FD8A4F",
          dark: "#E35F1F",
        },
        secondary: {
          DEFAULT: "#FD9319",
          light: "#FEA741",
          dark: "#E47F0D",
        },
        dark: {
          DEFAULT: "#1B1612",
          50: "#2A2420",
          100: "#38322E",
        },
        light: {
          DEFAULT: "#F3E9E7",
          50: "#FFFFFF",
          100: "#F9F2F0",
        },
        neutral: {
          DEFAULT: "#E2D4C4",
          light: "#EFE4D9",
          dark: "#D5C4B0",
        },
      },
    },
  },
  plugins: [],
};
export default config;
