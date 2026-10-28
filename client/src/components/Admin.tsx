import { useEffect, useMemo, useState } from "react";
import { adminApi, DetalheAdmin, LinhaAdmin } from "../api/admin";
import { ANOS } from "../lib/formatarRegistro";
import { htmlDaAtividade } from "./atividades/impressao";

// Painel admin SO LEITURA: como cada professor esta usando o I.A Prof. Nada aqui altera dados ou gasta I.A.
const fmtData = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtReais = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const nomeSerie = (a: string) => ANOS.find((x) => x.valor === a)?.nome ?? a;
const corAcesso = (a: string | null) =>
  a === "assinante" ? "bg-emerald-100 text-emerald-800" : a === "teste" ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-700";

export default function Admin() {
  const [lista, setLista] = useState<LinhaAdmin[] | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<"recentes" | "uso" | "parados">("recentes");

  useEffect(() => {
    adminApi
      .usuarios()
      .then(setLista)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar"));
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const l = (lista ?? []).filter((u) => !q || u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    if (ordem === "uso") return [...l].sort((a, b) => b.usoPercentual - a.usoPercentual);
    if (ordem === "parados") return [...l].sort((a, b) => new Date(a.ultimoUso ?? 0).getTime() - new Date(b.ultimoUso ?? 0).getTime());
    return l;
  }, [lista, busca, ordem]);

  if (aberto) return <DetalheUsuario id={aberto} onVoltar={() => setAberto(null)} />;

  const tot = (lista ?? []).reduce(
    (t, u) => ({ ...t, [u.acesso ?? "bloqueado"]: (t[u.acesso ?? "bloqueado"] ?? 0) + 1 }),
    {} as Record<string, number>
  );
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">🔒 Painel admin</h1>
        <p className="text-sm text-slate-500">Só leitura: veja como os professores estão usando. Nada aqui altera a conta deles nem gasta I.A. Cada acesso fica registrado.</p>
      </div>
      {erro && <p className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{erro}</p>}
      {lista && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Professores", lista.length],
            ["Assinantes", tot.assinante ?? 0],
            ["Em teste", tot.teste ?? 0],
            ["Sem acesso", tot.bloqueado ?? 0],
          ].map(([r, n]) => (
            <div key={r} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">{r}</p>
              <p className="text-lg font-bold text-slate-900">{n}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          placeholder="Buscar por nome ou e-mail…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
          <option value="recentes">Cadastro mais recente</option>
          <option value="uso">Maior uso de I.A</option>
          <option value="parados">Há mais tempo sem usar</option>
        </select>
      </div>
      {!lista && !erro && <p className="text-sm text-slate-500">Carregando…</p>}
      <ul className="space-y-2">
        {filtrados.map((u) => (
          <li key={u.id}>
            <button onClick={() => setAberto(u.id)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/40">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{u.nome}</span>
                <span className="text-xs text-slate-500">{u.email}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${corAcesso(u.acesso)}`}>
                  {u.acesso === "assinante" ? u.planoNome ?? "Assinante" : u.acesso === "teste" ? "Teste" : "Sem acesso"}
                </span>
                {u.devConectado && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">D.E.V</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span>⚡ I.A: {u.usoPercentual}%</span>
                <span>📚 {u.aulas} aulas</span>
                <span>📝 {u.atividades} atividades</span>
                <span>✅ {u.correcoes} correções</span>
                <span className={u.planosCurso ? "" : "font-semibold text-amber-700"}>📘 {u.planosCurso ? `${u.planosCurso} plano(s) de curso` : "sem plano de curso"}</span>
                <span>🕒 último uso: {fmtData(u.ultimoUso)}</span>
                <span>cadastro: {fmtData(u.criadoEm)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetalheUsuario({ id, onVoltar }: { id: string; onVoltar: () => void }) {
  const [d, setD] = useState<DetalheAdmin | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"aulas" | "atividades" | "planos" | "consumo">("aulas");
  const [aulaAberta, setAulaAberta] = useState<string | null>(null);
  const [folha, setFolha] = useState<{ titulo: string; html: string } | null>(null);

  useEffect(() => {
    adminApi
      .usuario(id)
      .then(setD)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar"));
  }, [id]);

  async function verFolha(atividadeId: string) {
    try {
      const a = await adminApi.atividade(atividadeId);
      setFolha({ titulo: a.titulo, html: htmlDaAtividade(a) });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao abrir a atividade");
    }
  }

  const botaoAba = (id2: typeof aba, rotulo: string) => (
    <button
      key={id2}
      onClick={() => setAba(id2)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${aba === id2 ? "bg-indigo-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
    >
      {rotulo}
    </button>
  );

  return (
    <div className="space-y-4">
      <button onClick={onVoltar} className="text-sm font-medium text-indigo-600 hover:underline">
        ← Voltar para a lista
      </button>
      {erro && <p className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{erro}</p>}
      {!d && !erro && <p className="text-sm text-slate-500">Carregando…</p>}
      {d && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-lg font-bold text-slate-900">{d.usuario.nome}</p>
            <p className="text-sm text-slate-500">{d.usuario.email}</p>
            <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-slate-700 sm:grid-cols-2">
              <span>
                Situação: <b>{d.situacao?.acesso === "assinante" ? `Assinante ${d.situacao.planoNome ?? ""}` : d.situacao?.acesso === "teste" ? "Teste grátis" : "Sem acesso"}</b>
              </span>
              <span>Uso de I.A no ciclo: <b>{d.situacao?.uso.percentual ?? 0}%</b></span>
              {d.assinatura && (
                <span>
                  Assinatura: {d.assinatura.planoId} · {d.assinatura.ciclo} · {d.assinatura.metodo} · {d.assinatura.status}
                  {d.assinatura.cancelarNoFim ? " (cancela no fim)" : ""} · até {fmtData(d.assinatura.periodoFim)}
                </span>
              )}
              <span>Teste: {d.usuario.testeAulas} aulas e {d.usuario.testeAtividades} atividades usadas · até {fmtData(d.usuario.testeAte)}</span>
              <span>Créditos extras: {fmtReais(d.usuario.creditosCentavos)}</span>
              <span>D.E.V: {d.usuario.dev ? `${d.usuario.dev.nome ?? "conectado"} (${d.usuario.dev.escolas.join(", ")})` : "não conectado"}</span>
              <span>Cadastro: {fmtData(d.usuario.criadoEm)}</span>
            </div>
            {d.situacao?.motivo && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{d.situacao.motivo}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            {botaoAba("aulas", `📚 Aulas (${d.aulas.length})`)}
            {botaoAba("atividades", `📝 Atividades (${d.atividades.length})`)}
            {botaoAba("planos", `📘 Planos de curso (${d.planos.length})`)}
            {botaoAba("consumo", "⚡ Consumo")}
          </div>

          {aba === "aulas" && (
            <ul className="space-y-2">
              {!d.aulas.length && <p className="text-sm text-slate-500">Nenhuma aula salva.</p>}
              {d.aulas.map((a) => (
                <li key={a._id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <button className="w-full text-left" onClick={() => setAulaAberta(aulaAberta === a._id ? null : a._id)}>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <b>{a.data.split("-").reverse().join("/")}</b>
                      <span className="text-slate-600">
                        {nomeSerie(a.ano)}
                        {a.turma ? ` · ${a.turma}` : ""}
                        {a.periodo ? ` · ${a.periodo}º período` : ""}
                      </span>
                      {a.diarioEnviadoEm && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">no D.E.V</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      <b>Digitou:</b> {a.entrada}
                    </p>
                  </button>
                  {aulaAberta === a._id && (
                    <div className="mt-2 space-y-2 border-t border-slate-100 pt-2 text-sm">
                      {a.itens.map((it, i) => (
                        <div key={i}>
                          <b className="text-indigo-700">{it.componente}:</b> {it.conteudo}{" "}
                          <span className="text-xs text-slate-500">{it.habilidades.map((h) => h.codigo).join(", ")}</span>
                        </div>
                      ))}
                      <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-700">{a.textoFinal}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {aba === "atividades" && (
            <ul className="space-y-2">
              {!d.atividades.length && <p className="text-sm text-slate-500">Nenhuma atividade salva.</p>}
              {d.atividades.map((a) => (
                <li key={a._id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{a.titulo}</p>
                    <p className="text-xs text-slate-600">
                      {fmtData(a.createdAt)} · {nomeSerie(a.ano)} · {a.componente}
                      {a.periodo ? ` · ${a.periodo}º período` : ""} · {a.questoes} questões · {a.semNota ? "sem nota" : `vale ${a.valorTotal}`}
                      {a.origem === "externa" ? " · feita fora (gabarito)" : ""}
                    </p>
                    {a.detalhes && (
                      <p className="mt-1 text-xs text-slate-500">
                        <b>Pediu:</b> {a.detalhes}
                      </p>
                    )}
                  </div>
                  {a.origem !== "externa" && (
                    <button onClick={() => verFolha(a._id)} className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">
                      👁️ Ver folha
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {aba === "planos" && (
            <ul className="space-y-2">
              {!d.planos.length && <p className="text-sm text-slate-500">Sem plano de curso cadastrado (usa a base do sistema).</p>}
              {d.planos.map((p) => (
                <li key={p._id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <b>
                    {nomeSerie(p.ano)} · {p.anoLetivo}
                  </b>
                  {p.turma ? ` · ${p.turma}` : ""} · {p.tipoPeriodo}
                  <p className="text-xs text-slate-600">{p.periodos.map((x) => `${x.numero}º: ${x.habilidades} habilidades`).join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}

          {aba === "consumo" && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Ciclo</th>
                    <th className="px-3 py-2">Custo de I.A</th>
                    <th className="px-3 py-2">Aulas</th>
                    <th className="px-3 py-2">Atividades</th>
                    <th className="px-3 py-2">Correções</th>
                  </tr>
                </thead>
                <tbody>
                  {d.usos.map((u) => (
                    <tr key={u.mes} className="border-t border-slate-100">
                      <td className="px-3 py-2">{u.mes === "teste" ? "Teste grátis" : u.mes.replace(/^c/, "desde ").replace(/(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1")}</td>
                      <td className="px-3 py-2">{fmtReais(u.custoCentavos)}</td>
                      <td className="px-3 py-2">{u.aulas}</td>
                      <td className="px-3 py-2">{u.atividades}</td>
                      <td className="px-3 py-2">{u.correcoes}</td>
                    </tr>
                  ))}
                  {!d.usos.length && (
                    <tr>
                      <td className="px-3 py-2 text-slate-500" colSpan={5}>
                        Ainda não usou I.A.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {folha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm" role="dialog">
          <div className="flex h-full max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <p className="truncate text-sm font-semibold">{folha.titulo}</p>
              <button onClick={() => setFolha(null)} className="rounded-lg px-3 py-1 text-sm text-slate-600 hover:bg-slate-100">
                Fechar
              </button>
            </div>
            <iframe title="Folha da atividade" srcDoc={folha.html} className="w-full flex-1 bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}
