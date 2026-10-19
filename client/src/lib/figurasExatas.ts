// Figuras exatas das atividades (relogio, termometro, fracao, grafico de barras) desenhadas em SVG.
// A I.A de imagem erra ponteiros, escalas e numeros; aqui o desenho sai sempre certo com o gabarito.

const n2 = (v: number) => Math.round(v * 100) / 100;
const escTxt = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function svgRelogio(conteudo: string, cor = "#1e66d0"): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(conteudo.trim());
  if (!m) return "";
  const h = Number(m[1]) % 12;
  const min = Number(m[2]);
  const c = 100;
  const p: string[] = [];
  p.push(`<circle cx="${c}" cy="${c}" r="94" fill="#fff" stroke="${cor}" stroke-width="9"/>`);
  for (let i = 0; i < 60; i++) {
    const a = (i * 6 * Math.PI) / 180;
    const grande = i % 5 === 0;
    const r1 = grande ? 74 : 80;
    p.push(
      `<line x1="${n2(c + r1 * Math.sin(a))}" y1="${n2(c - r1 * Math.cos(a))}" x2="${n2(c + 86 * Math.sin(a))}" y2="${n2(c - 86 * Math.cos(a))}" stroke="#222" stroke-width="${grande ? 3 : 1.2}" stroke-linecap="round"/>`
    );
  }
  for (let i = 1; i <= 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    p.push(`<text x="${n2(c + 61 * Math.sin(a))}" y="${n2(c - 61 * Math.cos(a) + 7)}" text-anchor="middle" font-size="20" font-weight="700" font-family="Arial,Helvetica,sans-serif" fill="#111">${i}</text>`);
  }
  const ponteiro = (graus: number, comp: number, larg: number, corP: string) => {
    const a = (graus * Math.PI) / 180;
    const x = c + comp * Math.sin(a);
    const y = c - comp * Math.cos(a);
    return `<line x1="${c}" y1="${c}" x2="${n2(x)}" y2="${n2(y)}" stroke="${corP}" stroke-width="${larg}" stroke-linecap="round"/>`;
  };
  p.push(ponteiro((h + min / 60) * 30, 44, 8, "#1e3a8a")); // horas: curto e grosso
  p.push(ponteiro(min * 6, 70, 5, "#dc2626")); // minutos: longo
  p.push(`<circle cx="${c}" cy="${c}" r="7" fill="#dc2626" stroke="#111" stroke-width="2"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${p.join("")}</svg>`;
}

export function svgTermometro(conteudo: string): string {
  const v = Number(conteudo);
  if (!conteudo.trim() || !Number.isFinite(v)) return "";
  const min = Math.min(-20, Math.floor((v - 10) / 10) * 10);
  const max = Math.max(40, Math.ceil((v + 10) / 10) * 10);
  const topo = 22;
  const base = 222; // fim da escala (acima do bulbo)
  const y = (t: number) => base - ((t - min) / (max - min)) * (base - topo);
  const p: string[] = [];
  p.push(`<rect x="8" y="6" width="104" height="282" rx="16" fill="#fff" stroke="#334155" stroke-width="3"/>`);
  p.push(`<text x="62" y="20" font-size="13" font-weight="700" font-family="Arial,Helvetica,sans-serif" fill="#111">°C</text>`);
  p.push(`<rect x="36" y="${topo - 8}" width="18" height="${base - topo + 30}" rx="9" fill="#f1f5f9" stroke="#334155" stroke-width="2.5"/>`);
  const nivel = y(Math.max(min, Math.min(max, v)));
  p.push(`<rect x="40" y="${n2(nivel)}" width="10" height="${n2(base + 20 - nivel)}" fill="#dc2626"/>`);
  p.push(`<circle cx="45" cy="${base + 32}" r="20" fill="#dc2626" stroke="#334155" stroke-width="2.5"/>`);
  for (let t = min; t <= max; t += 2) {
    const yy = n2(y(t));
    const dez = t % 10 === 0;
    p.push(`<line x1="56" y1="${yy}" x2="${dez ? 70 : 64}" y2="${yy}" stroke="#111" stroke-width="${dez ? 2 : 1}"/>`);
    if (dez) p.push(`<text x="74" y="${n2(y(t) + 4)}" font-size="12" font-weight="700" font-family="Arial,Helvetica,sans-serif" fill="#111">${t}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 294" width="120" height="294">${p.join("")}</svg>`;
}

export function svgFracao(conteudo: string, cor = "#f59e0b"): string {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(conteudo.trim());
  if (!m) return "";
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (b < 1 || a > b) return "";
  const c = 100;
  const r = 88;
  const p: string[] = [];
  if (b === 1) p.push(`<circle cx="${c}" cy="${c}" r="${r}" fill="${a ? cor : "#fff"}" stroke="#111" stroke-width="3"/>`);
  else
    for (let i = 0; i < b; i++) {
      const a1 = (i / b) * 2 * Math.PI - Math.PI / 2;
      const a2 = ((i + 1) / b) * 2 * Math.PI - Math.PI / 2;
      const grande = a2 - a1 > Math.PI ? 1 : 0;
      p.push(
        `<path d="M${c},${c} L${n2(c + r * Math.cos(a1))},${n2(c + r * Math.sin(a1))} A${r},${r} 0 ${grande} 1 ${n2(c + r * Math.cos(a2))},${n2(c + r * Math.sin(a2))} Z" fill="${i < a ? cor : "#fff"}" stroke="#111" stroke-width="3" stroke-linejoin="round"/>`
      );
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${p.join("")}</svg>`;
}

const CORES_BARRAS = ["#1e66d0", "#f07a1a", "#2e9e4f", "#7b3fbf", "#d63a7a", "#0e9aa7", "#e0b400", "#64748b"];
export function svgGrafico(conteudo: string): string {
  const barras = conteudo
    .split(/;\s*/)
    .map((x) => /^(.+):(-?\d+(?:\.\d+)?)$/.exec(x.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ rotulo: m[1].trim(), valor: Number(m[2]) }));
  if (barras.length < 2) return "";
  const maior = Math.max(...barras.map((b) => b.valor), 1);
  // passo "redondo" do eixo (1, 2, 5, 10, 20, 50...)
  const bruto = maior / 5;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((k) => k * pot).find((k) => k >= bruto) ?? 10 * pot;
  const topoEixo = Math.ceil(maior / passo) * passo;
  const L = 360;
  const H = 230;
  const x0 = 44;
  const y0 = 190;
  const alt = 170;
  const larg = (L - x0 - 10) / barras.length;
  const p: string[] = [];
  for (let t = 0; t <= topoEixo + 1e-9; t += passo) {
    const yy = n2(y0 - (t / topoEixo) * alt);
    p.push(`<line x1="${x0}" y1="${yy}" x2="${L - 6}" y2="${yy}" stroke="#cbd5e1" stroke-width="1"/>`);
    p.push(`<text x="${x0 - 6}" y="${n2(yy + 4)}" text-anchor="end" font-size="11" font-family="Arial,Helvetica,sans-serif" fill="#111">${n2(t)}</text>`);
  }
  barras.forEach((b, i) => {
    const h = (b.valor / topoEixo) * alt;
    const x = x0 + i * larg + larg * 0.18;
    p.push(`<rect x="${n2(x)}" y="${n2(y0 - h)}" width="${n2(larg * 0.64)}" height="${n2(h)}" rx="3" fill="${CORES_BARRAS[i % CORES_BARRAS.length]}" stroke="#111" stroke-width="1"/>`);
    p.push(`<text x="${n2(x0 + i * larg + larg / 2)}" y="${y0 + 16}" text-anchor="middle" font-size="${barras.length > 5 ? 10 : 12}" font-family="Arial,Helvetica,sans-serif" fill="#111">${escTxt(b.rotulo.slice(0, 14))}</text>`);
  });
  p.push(`<line x1="${x0}" y1="${y0 - alt - 6}" x2="${x0}" y2="${y0}" stroke="#111" stroke-width="2"/><line x1="${x0}" y1="${y0}" x2="${L - 6}" y2="${y0}" stroke="#111" stroke-width="2"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${H}" width="${L}" height="${H}">${p.join("")}</svg>`;
}

// SVG da figura exata (ou "" se nao for uma figura exata valida)
export function svgFiguraExata(tipo: string, conteudo: string, cor?: string): string {
  if (tipo === "relogio") return svgRelogio(conteudo, cor);
  if (tipo === "termometro") return svgTermometro(conteudo);
  if (tipo === "fracao") return svgFracao(conteudo);
  if (tipo === "grafico") return svgGrafico(conteudo);
  return "";
}
