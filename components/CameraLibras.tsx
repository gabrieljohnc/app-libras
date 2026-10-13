"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ReconhecedorLibras, type Resultado } from "@/lib/reconhecimento/reconhecedor";
import { linkSinal } from "@/lib/util";

const LIGACOES_MAO = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11],
  [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const LIGACOES_CORPO = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];

// ordem sugerida para calibrar: o que mais se usa primeiro
const PRIORIDADE = ["oi", "tchau", "obrigado", "bom dia", "boa tarde", "boa noite", "tudo bem", "sim", "nao", "eu",
  "voce", "nome", "desculpar", "por favor", "estudar", "escola", "professor", "aprender", "amigo", "familia", "mae",
  "pai", "casa", "comer", "agua", "gostar", "querer", "ajudar", "entender", "surdo", "libras"];
const REPETICOES = 3;

type Estado = "parado" | "carregando" | "pronto" | "erro";
type Modo = "reconhecer" | "calibrar";

async function videoDoSinal(termo: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return null;
  const q = `${url}/rest/v1/sinais?select=video_url&palavra_normalizada=eq.${encodeURIComponent(termo)}` +
    `&video_url=like.*.mp4&order=id&limit=1`;
  try {
    const r = await fetch(q, { headers: { apikey: chave, Authorization: `Bearer ${chave}` } });
    const [linha] = await r.json();
    return linha?.video_url ?? null;
  } catch {
    return null;
  }
}

export default function CameraLibras({ alvo }: { alvo?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const telaRef = useRef<HTMLCanvasElement>(null);
  const recRef = useRef<ReconhecedorLibras | null>(null);
  const [estado, setEstado] = useState<Estado>("parado");
  const [modo, setModo] = useState<Modo>("reconhecer");
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [historico, setHistorico] = useState<{ termo: string; prob: number }[]>([]);
  const [vocabulario, setVocabulario] = useState<string[]>([]);
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [sinalCalibrando, setSinalCalibrando] = useState<string | null>(null);
  const [videoReferencia, setVideoReferencia] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const cancelarRef = useRef<() => void>(() => {});

  useEffect(
    () => () => {
      recRef.current?.parar();
      (videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  function desenhar(pose: { x: number; y: number }[] | null, maos: { pontos: { x: number; y: number }[] }[]) {
    const tela = telaRef.current, video = videoRef.current;
    if (!tela || !video) return;
    tela.width = video.videoWidth;
    tela.height = video.videoHeight;
    const ctx = tela.getContext("2d")!;
    ctx.clearRect(0, 0, tela.width, tela.height);
    ctx.lineWidth = 3;
    const linhas = (pts: { x: number; y: number }[], pares: number[][], cor: string) => {
      ctx.strokeStyle = cor;
      for (const [a, b] of pares) {
        ctx.beginPath();
        ctx.moveTo(pts[a].x * tela.width, pts[a].y * tela.height);
        ctx.lineTo(pts[b].x * tela.width, pts[b].y * tela.height);
        ctx.stroke();
      }
    };
    if (pose) linhas(pose, LIGACOES_CORPO, "rgba(221, 214, 254, 0.8)");
    for (const m of maos) linhas(m.pontos, LIGACOES_MAO, "#fbbf24");
  }

  function atualizarListas() {
    const rec = recRef.current;
    if (!rec) return;
    setVocabulario(rec.vocabulario);
    setContagem(rec.exemplosPorSinal);
  }

  async function ligar() {
    setEstado("carregando");
    try {
      const rec = new ReconhecedorLibras({
        baseModelos: "/libras",
        // ?cpu=1 força o MediaPipe na CPU (útil em navegador sem GPU, como nos testes automáticos)
        delegate: new URLSearchParams(location.search).has("cpu") ? "CPU" : undefined,
        onQuadro: desenhar,
        onResultado: (r) => {
          setResultado(r);
          if (r.final) setHistorico((h) => [{ termo: r.palpites[0].termo, prob: r.palpites[0].prob }, ...h].slice(0, 12));
        },
      });
      const [stream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false }),
        rec.carregar(),
      ]);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      rec.iniciar(video);
      recRef.current = rec;
      atualizarListas();
      setEstado("pronto");
    } catch (e) {
      setErro((e as Error).message);
      setEstado("erro");
    }
  }

  function ordemCalibracao() {
    const basicos = recRef.current?.sinaisBasicos ?? [];
    return [...PRIORIDADE.filter((t) => basicos.includes(t)), ...basicos.filter((t) => !PRIORIDADE.includes(t))];
  }

  async function calibrar(termo: string) {
    const rec = recRef.current;
    if (!rec) return;
    setSinalCalibrando(termo);
    setVideoReferencia(null);
    void videoDoSinal(termo).then(setVideoReferencia);
    let feitos = rec.exemplosPorSinal[termo] ?? 0;
    while (feitos < REPETICOES) {
      setAviso(`Faça o sinal “${termo}” e abaixe as mãos (${feitos + 1} de ${REPETICOES}).`);
      const cancelado = await Promise.race([
        rec.gravarExemplo(termo).then(() => false),
        new Promise<boolean>((ok) => (cancelarRef.current = () => ok(true))),
      ]);
      if (cancelado) {
        rec.cancelarGravacao();
        return;
      }
      feitos++;
      atualizarListas();
    }
    // próximo sinal ainda sem os 3 exemplos
    const proximo = ordemCalibracao().find((t) => (rec.exemplosPorSinal[t] ?? 0) < REPETICOES);
    if (proximo) void calibrar(proximo);
    else {
      setSinalCalibrando(null);
      setAviso("Todos os sinais básicos calibrados.");
    }
  }
  function pararCalibracao() {
    cancelarRef.current();
    setSinalCalibrando(null);
    setAviso("");
  }

  function pular() {
    const atual = sinalCalibrando;
    cancelarRef.current();
    const ordem = ordemCalibracao();
    const proximo = ordem.slice(ordem.indexOf(atual ?? "") + 1)
      .find((t) => (recRef.current?.exemplosPorSinal[t] ?? 0) < REPETICOES);
    if (proximo) void calibrar(proximo);
    else setSinalCalibrando(null);
  }

  function exportar() {
    const rec = recRef.current;
    if (!rec) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rec.exportarExemplos()], { type: "application/json" }));
    a.download = "meus-sinais.json";
    a.click();
  }

  async function importar(arquivo: File | undefined) {
    if (!arquivo || !recRef.current) return;
    try {
      recRef.current.importarExemplos(await arquivo.text());
      atualizarListas();
      setAviso("Exemplos carregados.");
    } catch (e) {
      setAviso((e as Error).message);
    }
  }

  const top = resultado?.palpites[0];
  const acertouAlvo = alvo && resultado?.final && top?.termo === alvo;
  const calibrados = Object.values(contagem).filter((n) => n >= REPETICOES).length;

  return (
    <div className="camera-libras">
      <div>
        <div className="camera-palco">
          <video ref={videoRef} playsInline muted />
          <canvas ref={telaRef} />
          {estado !== "pronto" && (
            <div className="camera-capa">
              {estado === "parado" && <button className="botao" onClick={ligar}>Ligar câmera</button>}
              {estado === "carregando" && <p>Carregando o reconhecimento…</p>}
              {estado === "erro" && (
                <>
                  <p>Não deu para usar a câmera. {erro}</p>
                  <button className="botao" onClick={ligar}>Tentar de novo</button>
                </>
              )}
            </div>
          )}
        </div>
        <p className="camera-dica">
          Fique com o rosto e o peito na imagem, faça o sinal e abaixe as mãos. O vídeo não sai do seu aparelho.
        </p>
      </div>

      <div className="camera-painel">
        {estado === "pronto" && (
          <div className="camera-abas" role="tablist">
            <button role="tab" aria-selected={modo === "reconhecer"} onClick={() => { pararCalibracao(); setModo("reconhecer"); }}>
              Reconhecer
            </button>
            <button role="tab" aria-selected={modo === "calibrar"} onClick={() => setModo("calibrar")}>
              Calibrar {calibrados > 0 && <span className="tag">{calibrados}</span>}
            </button>
          </div>
        )}

        {modo === "reconhecer" && (
          <>
            {alvo && (
              <p className={`camera-alvo${acertouAlvo ? " ok" : ""}`}>
                {acertouAlvo ? `Isso! Reconheci “${alvo}”.` : `Pratique: faça o sinal de “${alvo}”.`}
              </p>
            )}
            {estado === "pronto" && calibrados === 0 && (
              <p className="camera-alvo">
                Dica: calibre primeiro. Fazendo cada sinal 3 vezes, eu passo a reconhecer o seu jeito.
              </p>
            )}
            <div className={`camera-atual${resultado?.final ? "" : " parcial"}`}>{top ? top.termo : "…"}</div>
            <ol className="camera-palpites">
              {resultado?.palpites.map((p) => (
                <li key={p.termo}>
                  <Link href={linkSinal(p.termo)}>{p.termo}</Link>
                  <span className="camera-barra"><span style={{ width: `${Math.round(p.prob * 100)}%` }} /></span>
                  <b>{Math.round(p.prob * 100)}%</b>
                </li>
              ))}
            </ol>
            {historico.length > 0 && (
              <>
                <h3>Reconhecidos</h3>
                <div className="sugestoes" style={{ marginTop: 8 }}>
                  {historico.map((h, i) => (
                    <Link key={i} href={linkSinal(h.termo)} className="chip chip-claro">{h.termo}</Link>
                  ))}
                </div>
              </>
            )}
            {estado === "pronto" && (
              <details className="camera-dica">
                <summary>{vocabulario.length} sinais que eu reconheço</summary>
                <p>{vocabulario.join(", ")}</p>
              </details>
            )}
          </>
        )}

        {modo === "calibrar" && estado === "pronto" && (
          <>
            {sinalCalibrando ? (
              <div className="calibrar-atual">
                <div className="camera-atual">{sinalCalibrando}</div>
                {videoReferencia && (
                  <video className="calibrar-video" src={videoReferencia} autoPlay loop muted playsInline />
                )}
                <p className="camera-alvo">{aviso}</p>
                <div className="camera-exemplo">
                  <button className="botao botao-claro" onClick={pular}>Pular</button>
                  <button className="botao botao-claro" onClick={pararCalibracao}>Parar</button>
                </div>
              </div>
            ) : (
              <>
                <p className="camera-dica">
                  Faça cada sinal {REPETICOES} vezes, do seu jeito. Os exemplos ficam só neste navegador e deixam o
                  reconhecimento bem mais certeiro para você. {aviso}
                </p>
                <button
                  className="botao"
                  onClick={() => {
                    const p = ordemCalibracao().find((t) => (contagem[t] ?? 0) < REPETICOES);
                    if (p) void calibrar(p);
                  }}
                >
                  {calibrados > 0 ? "Continuar calibração" : "Começar calibração"}
                </button>
              </>
            )}
            <h3>Sinais ({calibrados} de {ordemCalibracao().length} calibrados)</h3>
            <div className="sugestoes" style={{ marginTop: 8 }}>
              {ordemCalibracao().map((t) => (
                <button
                  key={t}
                  className={`chip chip-claro${(contagem[t] ?? 0) >= REPETICOES ? " chip-feito" : ""}`}
                  onClick={() => { cancelarRef.current(); void calibrar(t); }}
                  title={`${contagem[t] ?? 0} de ${REPETICOES} exemplos`}
                >
                  {t}{(contagem[t] ?? 0) > 0 && ` ${Math.min(contagem[t], REPETICOES)}/${REPETICOES}`}
                </button>
              ))}
            </div>
            <div className="camera-exemplo" style={{ marginTop: 16 }}>
              <button className="botao botao-claro" onClick={exportar}>Salvar meus exemplos</button>
              <label className="botao botao-claro">
                Carregar exemplos
                <input type="file" accept="application/json" hidden onChange={(e) => importar(e.target.files?.[0])} />
              </label>
              {sinalCalibrando && (
                <button className="botao botao-claro" onClick={() => {
                  const t = sinalCalibrando;
                  cancelarRef.current();
                  recRef.current?.apagarExemplos(t);
                  atualizarListas();
                  void calibrar(t);
                }}>
                  Refazer “{sinalCalibrando}”
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
