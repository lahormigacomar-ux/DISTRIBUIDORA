/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                "primary": "#2563eb",
                "analyst": {
                    "50": "#f8fafc",
                    "100": "#f1f5f9",
                    "200": "#e2e8f0",
                    "300": "#cbd5e1",
                    "400": "#94a3b8",
                    "500": "#64748b",
                    "600": "#475569",
                    "700": "#334155",
                    "800": "#1e293b",
                    "900": "#0f172a",
                },
                "border-light": "#e2e8f0",
                "bg-main": "#f8fafc",
                "card-white": "#ffffff",
            },
            fontFamily: {
                "display": ["Inter", "sans-serif"]
            },
            borderRadius: {
                "DEFAULT": "4px",
                "lg": "8px",
                "xl": "12px",
                "full": "9999px"
            },
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/container-queries'),
        require('@tailwindcss/typography'),
    ],
}
