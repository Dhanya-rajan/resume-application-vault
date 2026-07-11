import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172026",
        steel: "#5d6972",
        mist: "#f4f7f6",
        line: "#d8e0df",
        spruce: "#1f6f61",
        coral: "#c95842",
        marigold: "#d99b2b"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(23, 32, 38, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
