"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ReconhecedorLibras, type Resultado } from "@/lib/reconhecimento/reconhecedor";
import { linkSinal } from "@/lib/util";

const LIGACOES_MAO = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11],
  [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const LIGACOES_CORPO = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];

type Estado = "parado" | "carregando" | "pronto" | "erro";

export default function CameraLibras({ alvo }: { alvo?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const telaRef = useRef<HTMLCanvasElement>(null);
  const recRef = useRef<ReconhecedorLibras | null>(null);
  const [estado, setEstado] = useState<Estado>("parado");
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [historico, setHistorico] = useState<{ termo: string; prob: number }[]>([]);
  const [vocabulario, setVocabulario] = useState<string[]>([]);
  const [termoExemplo, setTermoExemplo] = useState(alvo ?? "");
  const [aviso, setAviso] = useState("");

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

  async function ligar() {
    setEstado("carregando");
    try {
      const rec = new ReconhecedorLibras({
        baseModelos: "/libras",
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
      setVocabulario(rec.vocabulario);
      setEstado("pronto");
    } catch (e) {
      setErro((e as Error).message);
      setEstado("erro");
    }
  }

  async function gravarExemplo() {
    const rec = recRef.current;
    const termo = termoExemplo.trim().toLowerCase();
    if (!rec || !vocabulario.includes(termo)) {
      setAviso("Escolha um sinal da lista.");
      return;
    }
    setAviso(`Faça o sinal “${termo}” agora.`);
    await rec.gravarExemplo(termo);
    setAviso(`Exemplo de “${termo}” guardado neste aparelho.`);
  }

  const top = resultado?.palpites[0];
  const acertouAlvo = alvo && resultado?.final && top?.termo === alvo;

  return (
    <div className="camera-libras">
      <div>
        <div className="camera-palco">
          <video ref={videoRef} playsInline muted />
          <canvas ref={telaRef} />
          {estado !== "pronto" && (
            <div className="camera-capa">
              {estado === "parado" && (
                <button className="botao" onClick={ligar}>Ligar câmera</button>
              )}
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
        {alvo && (
          <p className={`camera-alvo${acertouAlvo ? " ok" : ""}`}>
            {acertouAlvo ? `Isso! Reconheci “${alvo}”.` : `Pratique: faça o sinal de “${alvo}”.`}
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
          <>
            <h3>Ensinar o seu jeito</h3>
            <p className="camera-dica">Se ele errar um sinal, grave 2 ou 3 exemplos seus. Fica salvo só neste navegador.</p>
            <div className="camera-exemplo">
              <input list="vocab-libras" value={termoExemplo} onChange={(e) => setTermoExemplo(e.target.value)} placeholder="sinal" />
              <datalist id="vocab-libras">{vocabulario.map((t) => <option key={t} value={t} />)}</datalist>
              <button className="botao" onClick={gravarExemplo}>Gravar</button>
              <button className="botao botao-claro" onClick={() => { recRef.current?.apagarExemplos(); setAviso("Exemplos apagados."); }}>
                Apagar meus exemplos
              </button>
            </div>
            {aviso && <p className="camera-dica">{aviso}</p>}
            <details className="camera-dica">
              <summary>{vocabulario.length} sinais que eu reconheço</summary>
              <p>{vocabulario.join(", ")}</p>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
