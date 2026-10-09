/** @type {import('tailwindcss').Config} */
const v = (name) => `var(--${name})`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: v("page"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        ink: v("ink"),
        "ink-2": v("ink-2"),
        muted: v("muted"),
        grid: v("grid"),
        axis: v("axis"),
        line: v("border"),
        accent: v("accent"),
        good: v("good"),
        critical: v("critical"),
        run: v("series-1"),
        ride: v("series-2"),
        swim: v("series-3"),
      },
    },
  },
  plugins: [],
};
