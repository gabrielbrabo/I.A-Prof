# I.A Prof

Assistente com I.A para professores preencherem o diário escolar.

**MVP atual: Registro de aula.** O professor escreve abreviado (ex.: `mat tabuada 0 a 10, port texto dia da mulher`) e a I.A devolve o texto no padrão do diário, já com os códigos BNCC / currículo estadual:

```
Matemática: Multiplicação: Tabuada de 0 a 10 -(EF04MA30MG) Operar com os números naturais.../ -Língua Portuguesa: Estudo do texto: Dia Internacional da Mulher -(EF15LP03) Localizar informações explícitas em textos
```

## Como funciona (e por que não inventa código)

1. **Claude separa** o texto do professor em itens por componente (Matemática, Língua Portuguesa...).
2. **O banco ranqueia** as habilidades daquele componente + série (BNCC + currículo da UF).
3. **Claude escolhe** o código entre essas candidatas.
4. **O servidor valida**: só aceita código que veio do banco, e a **descrição sai do banco**, nunca da I.A.
5. O professor revisa (pode trocar a habilidade ou buscar outra), copia o texto ou salva.

## Plano de curso

Aba **Plano de curso**: o professor escolhe série, turma, UF, ano letivo e a divisão do ano (bimestre, trimestre ou semestre), ajusta as datas de cada período e envia o plano:

- **Um arquivo com o ano todo**: a I.A identifica o período de cada habilidade. Se o documento não divide por período, distribui em ordem e avisa.
- **Um arquivo por período**: escolhe o período e envia.

Formatos: **PDF (inclusive escaneado)**, Word (.docx), Excel (.xlsx), CSV, TXT e foto (JPG/PNG/WEBP). Até 10 arquivos de 20 MB por envio. O `.doc` antigo não é aceito (salve como .docx ou PDF).

O professor revisa (remove, move de período, adiciona habilidade buscando na base) e salva. Códigos do plano que não existem na base (ex.: currículo estadual ainda não importado) são cadastrados com fonte `PLANO-CURSO` (só se a UF estiver preenchida).

No **Registro de aula**, a data define o período: as habilidades do plano daquele período viram candidatas prioritárias para a I.A (marcadas "do plano").

## Estrutura

```
server/   Node + TS + Express + MongoDB + Claude API
  data/bncc.json            1.576 habilidades da BNCC (Infantil, Fundamental, Médio)
  data/curriculos/*.csv     currículos estaduais/municipais (MG-exemplo.csv)
  src/services/registroAula.ts      fluxo da I.A
  src/services/buscaHabilidades.ts  ranqueamento das candidatas
client/   React + TS + Vite + Tailwind
```

## Rodando (PowerShell)

```powershell
# 1) Backend
cd server
copy .env.example .env      # preencha ANTHROPIC_API_KEY e MONGODB_URI
npm install
npm run seed:bncc           # importa a BNCC no Mongo (uma vez)
npm run import:curriculo -- --arquivo data/curriculos/MG-exemplo.csv --uf MG --fonte CRMG
npm run dev                 # http://localhost:4000

# 2) Frontend (outro terminal)
cd client
copy .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

Checagem de tipos: `npm run typecheck` em cada pasta.

## Currículos estaduais (MG e outros)

Códigos como `EF04MA30MG` e `EF04GE01X` são do **Currículo Referência de Minas Gerais**, não da BNCC. Cada estado tem o seu. Para incluir um estado, monte um CSV (separador `;` ou `,`):

| codigo | componente | anos | habilidade | unidade_tematica (opcional) | objeto_conhecimento (opcional) |
|---|---|---|---|---|---|
| EF04MA30MG | Matemática | 4 | Operar com os números naturais... | | |

- `componente` deve usar o mesmo nome da BNCC (`Matemática`, `Língua Portuguesa`, `Geografia`...).
- `anos`: `4`, `1-5` ou `4,5`. Infantil: `EI01`, `EI02`, `EI03`. Médio: `EM`.

Depois: `npm run import:curriculo -- --arquivo data/curriculos/MG.csv --uf MG --fonte CRMG`

O `MG-exemplo.csv` tem só os 2 códigos do exemplo real. **É preciso importar o CRMG completo.**

## Endpoints

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/registro-aula/gerar` | `{ texto, ano, uf }` → itens com códigos + texto final (não salva) |
| POST | `/api/registro-aula` | salva o registro revisado |
| GET | `/api/registro-aula` | últimos 50 registros |
| DELETE | `/api/registro-aula/:id` | exclui |
| GET | `/api/habilidades?ano=4&componente=Matemática&uf=MG&q=fração` | busca habilidades |
| GET | `/api/habilidades/componentes?ano=4&uf=MG` | componentes da série |
| GET | `/api/planos-curso/padrao?tipo=trimestre&anoLetivo=2026` | períodos com datas padrão |
| POST | `/api/planos-curso/extrair` | multipart `arquivos[]` + `ano`, `uf`, `tipoPeriodo`, `periodo` (`todos` ou nº) → habilidades por período (não salva) |
| POST | `/api/planos-curso` | salva/substitui o plano da série+turma no ano letivo |
| GET | `/api/planos-curso?ano=4&anoLetivo=2026&turma=...` | plano salvo |
| DELETE | `/api/planos-curso/:id` | exclui |

## Fonte dos dados

BNCC (MEC, domínio público), transcrita a partir de [dfdb76/bncc-mcp](https://github.com/dfdb76/bncc-mcp). Usamos só os campos oficiais da BNCC (código, habilidade, unidade temática, objeto de conhecimento). As colunas "Mapa de Foco" desse repositório (Instituto Reúna, uso não comercial) **não** foram incluídas.

## Próximos passos

- [ ] Importar CRMG completo (e outros estados)
- [ ] Login do professor + multi-escola
- [ ] Integração direta com o Diário escolar (gravar o registro no banco do diário)
- [ ] Relatório individual do aluno
- [ ] Correção de provas
