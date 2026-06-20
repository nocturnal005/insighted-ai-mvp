import type { Config } from "tailwindcss";

/**
 * Minimalist design system. A single calm accent over a near-neutral zinc scale,
 * generous whitespace, and AA-contrast text tokens. Restraint over decoration.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
        // Semantic, low-saturation status hues
        positive: { 50: "#ecfdf5", 600: "#059669", 700: "#047857" },
        caution: { 50: "#fffbeb", 600: "#d97706", 700: "#b45309" },
        critical: { 50: "#fef2f2", 600: "#dc2626", 700: "#b91c1c" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        card: "0 1px 3px rgba(16,24,40,0.06), 0 8px 24px -12px rgba(16,24,40,0.12)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
