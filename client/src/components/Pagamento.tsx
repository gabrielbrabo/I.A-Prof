import { useState } from "react";
import { DadosPix, reais } from "../api/conta";

// Pecas de pagamento usadas na assinatura e na compra de creditos extras
const campo = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";
export const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

export type Metodo = "PIX" | "CREDIT_CARD";
export interface DadosForm {
  metodo: Metodo;
  cpf: string;
  tel: string;
  cartao: { nome: string; numero: string; validade: string; cvv: string; cep: string; numeroEnd: string };
}
export const formVazio = (): DadosForm => ({ metodo: "PIX", cpf: "", tel: "", cartao: { nome: "", numero: "", validade: "", cvv: "", cep: "", numeroEnd: "" } });

// Corpo enviado ao servidor (mesmo formato na assinatura e nos creditos)
export function corpoPagamento(f: DadosForm) {
  const [mm, aa] = f.cartao.validade.split("/").map((x) => x.trim());
  return {
    metodo: f.metodo,
    cpfCnpj: f.cpf,
    telefone: f.tel,
    ...(f.metodo === "CREDIT_CARD"
      ? {
          cartao: {
            holderName: f.cartao.nome,
            number: f.cartao.numero.replace(/\s/g, ""),
            expiryMonth: mm ?? "",
            expiryYear: aa && aa.length === 2 ? `20${aa}` : aa ?? "",
            ccv: f.cartao.cvv,
          },
          titular: { postalCode: f.cartao.cep, addressNumber: f.cartao.numeroEnd, phone: f.tel },
        }
      : {}),
  };
}

export function CamposPagamento({ valor, onChange }: { valor: DadosForm; onChange: (f: DadosForm) => void }) {
  const c = valor.cartao;
  const setC = (x: Partial<DadosForm["cartao"]>) => onChange({ ...valor, cartao: { ...c, ...x } });
  return (
    <>
      <div className="mb-3 flex gap-2">
        {(["PIX", "CREDIT_CARD"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange({ ...valor, metodo: m })}
            className={`flex-1 rounded-lg border px-4 py-2 text-sm sm:flex-none ${valor.metodo === m ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700" : "border-slate-300 text-slate-600"}`}
          >
            {m === "PIX" ? "PIX" : "Cartão de crédito"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-500">
          CPF ou CNPJ
          <input className={campo} inputMode="numeric" autoComplete="off" value={valor.cpf} onChange={(e) => onChange({ ...valor, cpf: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-slate-500">
          Celular
          <input className={campo} type="tel" inputMode="tel" value={valor.tel} onChange={(e) => onChange({ ...valor, tel: e.target.value })} placeholder="(00) 00000-0000" />
        </label>
        {valor.metodo === "CREDIT_CARD" && (
          <>
            <label className="text-xs font-medium text-slate-500 sm:col-span-2">
              Nome impresso no cartão
              <input className={campo} value={c.nome} onChange={(e) => setC({ nome: e.target.value })} />
            </label>
            <label className="text-xs font-medium text-slate-500 sm:col-span-2">
              Número do cartão
              <input className={campo} inputMode="numeric" value={c.numero} onChange={(e) => setC({ numero: e.target.value })} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Validade (MM/AA)
              <input className={campo} value={c.validade} onChange={(e) => setC({ validade: e.target.value })} placeholder="08/29" />
            </label>
            <label className="text-xs font-medium text-slate-500">
              CVV
              <input className={campo} inputMode="numeric" value={c.cvv} onChange={(e) => setC({ cvv: e.target.value })} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              CEP
              <input className={campo} value={c.cep} onChange={(e) => setC({ cep: e.target.value })} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Nº do endereço
              <input className={campo} value={c.numeroEnd} onChange={(e) => setC({ numeroEnd: e.target.value })} />
            </label>
            <p className="text-[11px] text-slate-400 sm:col-span-2">CEP, número e celular são exigência antifraude da operadora do cartão.</p>
          </>
        )}
      </div>
    </>
  );
}

// QR Code + copia e cola do PIX
export function CaixaPix({ pix, erro, passoFinal }: { pix: DadosPix | null; erro: string | null; passoFinal: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.copiaECola);
    } catch {
      /* sem permissao: o professor copia do campo */
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }
  if (!pix)
    return (
      <div className="mt-2 text-xs text-slate-600">
        {erro ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">{erro} Tentando de novo automaticamente…</p> : <p>Gerando o QR Code do PIX…</p>}
      </div>
    );
  return (
    <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <img src={`data:image/png;base64,${pix.imagem}`} alt="QR Code PIX" className="order-2 h-40 w-40 rounded-lg bg-white p-2 ring-1 ring-emerald-200 sm:order-none sm:h-48 sm:w-48" />
      <div className="order-1 w-full min-w-0 flex-1 space-y-2 sm:order-none">
        {pix.valorCentavos != null && (
          <p className="text-sm text-slate-700">
            Valor: <b>{reais(pix.valorCentavos)}</b>
          </p>
        )}
        <ol className="list-decimal space-y-0.5 pl-4 text-xs text-slate-600">
          <li>Abra o app do seu banco e escolha pagar com PIX.</li>
          <li>Aponte a câmera para o QR Code ou use o código copia e cola.</li>
          <li>{passoFinal}</li>
        </ol>
        <label className="block text-xs font-medium text-slate-500">
          PIX copia e cola
          <textarea
            readOnly
            rows={3}
            value={pix.copiaECola}
            onFocus={(e) => e.target.select()}
            className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-[11px] text-slate-700"
          />
        </label>
        <button onClick={copiar} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto sm:py-2">
          {copiado ? "✓ Código copiado!" : "Copiar código PIX"}
        </button>
        {pix.expira && <p className="text-[11px] text-slate-500">Válido até {dataBR(pix.expira)}.</p>}
      </div>
    </div>
  );
}
