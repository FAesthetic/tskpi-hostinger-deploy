import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0F1011",
          900: "#18191B",
          800: "#222326",
          700: "#303236"
        },
        pulse: {
          300: "#F27BB9",
          400: "#E83B93",
          500: "#E20074",
          600: "#C90067",
          700: "#A90057"
        }
      },
      boxShadow: {
        cockpit: "0 18px 48px rgba(0, 0, 0, 0.22)"
      }
    }
  },
  plugins: []
};

export default config;
