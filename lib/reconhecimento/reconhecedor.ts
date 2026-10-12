// Reconhecimento de sinais de Libras ao vivo, todo no navegador.
// Câmera -> MediaPipe (pose + mãos) -> features -> modelo ONNX -> palpites.
// Nada sai do aparelho: nem vídeo nem pontos são enviados a servidor.
//
// Dependências: @mediapipe/tasks-vision, onnxruntime-web

import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import * as ort from "onnxruntime-web";
import { LIMIAR_MOVIMENTO, N_FEATURES, T, deslocamento, preparar, quadro, temMao, type Mao, type Referencia } from "./features";

export type Palpite = { termo: string; prob: number };
export type Resultado = {
  palpites: Palpite[]; // top 5, do mais provável ao menos
  final: boolean; // false = palpite parcial enquanto o sinal ainda está sendo feito
  duracaoMs: number;
};
export type Opcoes = {
  /** Pasta pública com modelo.onnx e rotulos.json. */
  baseModelos?: string;
  /** Onde estão os .task e .wasm do MediaPipe e os .wasm do ONNX (padrão: CDNs oficiais). */
  urlsMediapipe?: { wasm: string; maos: string; pose: string };
  wasmOnnx?: string;
  onResultado?: (r: Resultado) => void;
  /** Pontos de cada quadro, para desenhar o esqueleto por cima do vídeo. */
  onQuadro?: (pose: { x: number; y: number }[] | null, maos: Mao[]) => void;
  /** Força CPU ou GPU no MediaPipe (padrão: tenta GPU e cai para CPU). */
  delegate?: "GPU" | "CPU";
  /** Probabilidade mínima para anunciar um sinal como final. */
  confiancaMinima?: number;
};

const PRE_S = 0.6; // guarda o que veio logo antes do movimento começar
const PARADO_FIM_S = 0.5; // mãos paradas (ou fora da imagem) por esse tempo encerram o sinal
const MAX_SINAL_S = 6;
const MIN_SINAL_S = 0.4;
const INTERVALO_PARCIAL_S = 0.25;
const CHAVE_EXEMPLOS = "libras-exemplos-v1";
const MEDIAPIPE_PADRAO = {
  wasm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  maos: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};

export class ReconhecedorLibras {
  private maos!: HandLandmarker;
  private pose!: PoseLandmarker;
  private sessao!: ort.InferenceSession;
  private rotulos: string[] = [];
  private video: HTMLVideoElement | null = null;
  private rodando = false;
  private ref: Referencia | null = null;

  // quadros recentes (antes do sinal) e do sinal em andamento, com o instante em segundos
  private quadros: Float32Array[] = [];
  private tempos: number[] = [];
  private velocidades: number[] = [];
  private emSinal = false;
  private inicioSinal = 0;
  private ultimoMovimento = 0;
  private ultimoParcial = 0;
  private inferindo = false;
  private exemplos: { termo: string; emb: number[] }[] = [];
  private gravando: { termo: string; ok: () => void } | null = null;

  constructor(private opcoes: Opcoes = {}) {}

  async carregar() {
    const base = this.opcoes.baseModelos ?? "/libras";
    const mp = this.opcoes.urlsMediapipe ?? MEDIAPIPE_PADRAO;
    ort.env.wasm.wasmPaths = this.opcoes.wasmOnnx ?? "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";
    const visao = await FilesetResolver.forVisionTasks(mp.wasm);
    // GPU quando o navegador deixa; senão CPU (mais lento, mas funciona)
    const criar = async (delegate: "GPU" | "CPU") =>
      Promise.all([
        HandLandmarker.createFromOptions(visao, {
          baseOptions: { modelAssetPath: mp.maos, delegate },
          runningMode: "VIDEO",
          numHands: 2,
        }),
        PoseLandmarker.createFromOptions(visao, {
          baseOptions: { modelAssetPath: mp.pose, delegate },
          runningMode: "VIDEO",
        }),
      ]);
    const [[maos, pose], sessao, rotulos] = await Promise.all([
      this.opcoes.delegate ? criar(this.opcoes.delegate) : criar("GPU").catch(() => criar("CPU")),
      ort.InferenceSession.create(`${base}/modelo.onnx`, { executionProviders: ["wasm"] }),
      fetch(`${base}/rotulos.json`).then((r) => r.json()),
    ]);
    Object.assign(this, { maos, pose, sessao, rotulos: rotulos.rotulos as string[] });
    if (rotulos.T !== T || rotulos.n_features !== N_FEATURES) {
      throw new Error("Modelo e features.ts estão em versões diferentes");
    }
    try {
      this.exemplos = JSON.parse(localStorage.getItem(CHAVE_EXEMPLOS) ?? "[]");
    } catch {
      this.exemplos = [];
    }
  }

  /** Começa a ler o <video> (já com a câmera ligada) e a reconhecer. */
  iniciar(video: HTMLVideoElement) {
    this.video = video;
    this.rodando = true;
    this.agendar();
  }

  parar() {
    this.rodando = false;
    this.quadros = [];
    this.tempos = [];
    this.velocidades = [];
    this.emSinal = false;
  }

  get vocabulario() {
    return [...this.rotulos];
  }

  private agendar() {
    if (!this.rodando || !this.video) return;
    const v = this.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => this.processar());
    else requestAnimationFrame(() => this.processar());
  }

  private processar() {
    const v = this.video!;
    if (v.readyState >= 2 && v.videoWidth > 0) {
      const agora = performance.now();
      const rp = this.pose.detectForVideo(v, agora);
      const rm = this.maos.detectForVideo(v, agora);
      const pose = rp.landmarks?.[0] ?? null;
      const maos: Mao[] = rm.landmarks.map((pontos, k) => ({
        pontos,
        direita: rm.handednesses[k]?.[0]?.categoryName === "Right",
      }));
      this.opcoes.onQuadro?.(pose, maos);

      const { f, ref, poseOk } = quadro(pose, maos, v.videoWidth / v.videoHeight, this.ref);
      if (poseOk) this.ref = ref;
      this.acumular(f, agora);
    }
    this.agendar();
  }

  private acumular(f: Float32Array, agoraMs: number) {
    const t = agoraMs / 1000;
    const n = this.quadros.length;
    const v = n === 0 ? 0 : deslocamento(this.quadros[n - 1], f) / Math.max(t - this.tempos[n - 1], 1e-3);
    this.quadros.push(f);
    this.tempos.push(t);
    this.velocidades.push(v);
    const ult = this.velocidades.slice(-3);
    const movendo = ult.reduce((a, b) => a + b, 0) / ult.length > LIMIAR_MOVIMENTO;

    if (!this.emSinal) {
      // fora de um sinal só guardamos os últimos PRE_S segundos
      while (this.tempos.length > 1 && t - this.tempos[0] > PRE_S) {
        this.quadros.shift();
        this.tempos.shift();
        this.velocidades.shift();
      }
      if (movendo && temMao(f)) {
        this.emSinal = true;
        this.inicioSinal = t;
        this.ultimoMovimento = t;
      }
      return;
    }

    if (movendo) this.ultimoMovimento = t;
    const duracao = t - this.inicioSinal;
    if (t - this.ultimoMovimento > PARADO_FIM_S || duracao > MAX_SINAL_S) {
      const seq = this.quadros, ts = this.tempos;
      this.quadros = [];
      this.tempos = [];
      this.velocidades = [];
      this.emSinal = false;
      if (this.ultimoMovimento - this.inicioSinal >= MIN_SINAL_S) void this.classificar(seq, ts, true, duracao);
    } else if (duracao >= MIN_SINAL_S && t - this.ultimoParcial > INTERVALO_PARCIAL_S) {
      this.ultimoParcial = t;
      void this.classificar(this.quadros.slice(), this.tempos.slice(), false, duracao);
    }
  }

  private async inferir(seq: Float32Array[], ts: number[]) {
    const entrada = new ort.Tensor("float32", preparar(seq, ts), [1, T, N_FEATURES]);
    const saida = await this.sessao.run({ sequencia: entrada });
    return { logits: saida.logits.data as Float32Array, emb: Array.from(saida.embedding.data as Float32Array) };
  }

  private async classificar(seq: Float32Array[], ts: number[], final: boolean, duracaoS: number) {
    if (this.inferindo && !final) return; // parciais podem ser pulados, o final nunca
    this.inferindo = true;
    try {
      const { logits, emb } = await this.inferir(seq, ts);
      if (final && this.gravando) {
        this.exemplos.push({ termo: this.gravando.termo, emb });
        try {
          localStorage.setItem(CHAVE_EXEMPLOS, JSON.stringify(this.exemplos));
        } catch {
          // sem armazenamento (aba anônima): o exemplo vale só nesta sessão
        }
        this.gravando.ok();
        this.gravando = null;
        return;
      }
      const probs = softmax(logits);
      // exemplos gravados pela própria pessoa reforçam os sinais dela (vizinho mais próximo)
      for (const ex of this.exemplos) {
        const k = this.rotulos.indexOf(ex.termo);
        if (k < 0) continue;
        const sim = ex.emb.reduce((s, v, i) => s + v * emb[i], 0);
        if (sim > 0.75) probs[k] += (sim - 0.75) * 2;
      }
      const soma = probs.reduce((a, b) => a + b, 0);
      const palpites = Array.from(probs, (p, k) => ({ termo: this.rotulos[k], prob: p / soma }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, 5);
      const minimo = this.opcoes.confiancaMinima ?? 0.15;
      if (final && palpites[0].prob < minimo) return;
      this.opcoes.onResultado?.({ palpites, final, duracaoMs: duracaoS * 1000 });
    } finally {
      this.inferindo = false;
    }
  }

  /**
   * Grava o próximo sinal feito na câmera como exemplo de `termo` e guarda no aparelho.
   * Com 2 ou 3 exemplos por sinal a precisão para aquela pessoa sobe bastante.
   */
  gravarExemplo(termo: string): Promise<void> {
    return new Promise((ok) => (this.gravando = { termo, ok }));
  }

  apagarExemplos() {
    this.exemplos = [];
    try {
      localStorage.removeItem(CHAVE_EXEMPLOS);
    } catch {}
  }
}

function softmax(x: Float32Array) {
  const m = Math.max(...x);
  const e = Array.from(x, (v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}
