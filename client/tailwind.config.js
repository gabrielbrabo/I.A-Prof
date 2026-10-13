/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Pisca a borda/fundo do card que precisa ser conferido (palpite da I.A)
      keyframes: {
        alertaVermelho: {
          "0%, 100%": { borderColor: "rgb(244 63 94)", boxShadow: "0 0 0 0 rgba(244, 63, 94, 0)" },
          "50%": { borderColor: "rgb(190 18 60)", boxShadow: "0 0 0 4px rgba(244, 63, 94, 0.35)" },
        },
        alerta: {
          "0%, 100%": { borderColor: "rgb(251 191 36)", boxShadow: "0 0 0 0 rgba(245, 158, 11, 0)", backgroundColor: "rgb(255 255 255)" },
          "50%": { borderColor: "rgb(217 119 6)", boxShadow: "0 0 0 4px rgba(245, 158, 11, 0.35)", backgroundColor: "rgb(255 251 235)" },
        },
      },
      animation: {
        alerta: "alerta 1.2s ease-in-out infinite",
        alertaVermelho: "alertaVermelho 1s ease-in-out infinite", // datas do periodo ainda nao cadastradas
      },
    },
  },
  plugins: [],
};
