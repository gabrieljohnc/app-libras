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
  /** false = todos os sinais do modelo concorrem, não só o vocabulário básico (padrão: só o básico). */
  somenteBasico?: boolean;
  /** Probabilidade mínima para anunciar um sinal como final. */
  confiancaMinima?: number;
};

const PRE_S = 0.6; // guarda o que veio logo antes do movimento começar
const PARADO_FIM_S = 0.5; // mãos paradas (ou fora da imagem) por esse tempo encerram o sinal
const MAX_SINAL_S = 6;
const MIN_SINAL_S = 0.4;
const INTERVALO_PARCIAL_S = 0.25;
// os embeddings mudam a cada modelo treinado, então os exemplos ficam guardados por versão
const CHAVE_EXEMPLOS = "libras-exemplos";
// mistura com os exemplos da pessoa (ver pontuar)
const PESO_KNN = 0.8;
const SIM_MINIMA = 0.3; // sinais diferentes ficam perto de 0; o mesmo sinal de outra pessoa, perto de 0,65
const SIM_FORTE = 0.7;
const TEMPERATURA_KNN = 15;
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
  private basico: string[] = [];
  private ativos: number[] = []; // índices dos rótulos que concorrem (o vocabulário básico, se houver)
  private versaoModelo = "";
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
  private gravando: { termo: string; ok: () => void; desde: number } | null = null;

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
    this.versaoModelo = rotulos.versao ?? "1";
    this.basico = rotulos.basico ?? [];
    const usar = this.opcoes.somenteBasico === false || this.basico.length === 0 ? this.rotulos : this.basico;
    this.ativos = usar.map((t) => this.rotulos.indexOf(t)).filter((k) => k >= 0);
    try {
      this.exemplos = JSON.parse(localStorage.getItem(this.chaveExemplos) ?? "[]");
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

  /** Sinais que podem aparecer como palpite. */
  get vocabulario() {
    return [...new Set([...this.ativos.map((k) => this.rotulos[k]), ...this.exemplos.map((e) => e.termo)])].sort();
  }

  /** Sinais básicos, na ordem sugerida para calibrar. */
  get sinaisBasicos() {
    return [...this.basico];
  }

  private get chaveExemplos() {
    return `${CHAVE_EXEMPLOS}-${this.versaoModelo}`;
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
      // só vale como exemplo um sinal que começou depois do pedido de gravação
      if (final && this.gravando && ts[ts.length - 1] - duracaoS >= this.gravando.desde) {
        this.exemplos.push({ termo: this.gravando.termo, emb });
        this.salvarExemplos();
        this.gravando.ok();
        this.gravando = null;
        return;
      }
      const palpites = this.pontuar(logits, emb);
      const minimo = this.opcoes.confiancaMinima ?? 0.15;
      if (final && palpites[0].prob < minimo) return;
      this.opcoes.onResultado?.({ palpites, final, duracaoMs: duracaoS * 1000 });
    } finally {
      this.inferindo = false;
    }
  }

  /**
   * Junta o modelo genérico com os exemplos gravados pela própria pessoa.
   * O modelo só conhece os vídeos dos dicionários; os exemplos (vizinho mais próximo no embedding)
   * pesam mais quanto mais parecido o sinal feito agora estiver de um deles, e valem também
   * para sinais que o modelo não conhece.
   */
  private pontuar(logits: Float32Array, emb: number[]): Palpite[] {
    const pontos = new Map<string, number>();
    const modelo = softmax(Array.from(this.ativos, (k) => logits[k]));
    this.ativos.forEach((k, i) => pontos.set(this.rotulos[k], modelo[i]));

    const melhor = new Map<string, number>(); // maior similaridade por sinal
    for (const ex of this.exemplos) {
      const sim = ex.emb.reduce((s, v, i) => s + v * emb[i], 0);
      melhor.set(ex.termo, Math.max(melhor.get(ex.termo) ?? -1, sim));
    }
    if (melhor.size > 0) {
      const termos = [...melhor.keys()];
      const knn = softmax(termos.map((t) => melhor.get(t)! * TEMPERATURA_KNN));
      const simMax = Math.max(...melhor.values());
      const peso = PESO_KNN * Math.min(Math.max((simMax - SIM_MINIMA) / (SIM_FORTE - SIM_MINIMA), 0), 1);
      for (const [t, p] of pontos) pontos.set(t, p * (1 - peso));
      termos.forEach((t, i) => pontos.set(t, (pontos.get(t) ?? 0) + peso * knn[i]));
    }
    return [...pontos]
      .map(([termo, prob]) => ({ termo, prob }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 5);
  }

  /**
   * Grava o próximo sinal feito na câmera como exemplo de `termo` e guarda no aparelho.
   * Com 2 ou 3 exemplos por sinal a precisão para aquela pessoa sobe bastante.
   */
  gravarExemplo(termo: string): Promise<void> {
    return new Promise((ok) => (this.gravando = { termo, ok, desde: performance.now() / 1000 }));
  }

  /** Cancela uma gravação pedida e ainda não feita. */
  cancelarGravacao() {
    this.gravando = null;
  }

  /** Quantos exemplos a pessoa já gravou de cada sinal. */
  get exemplosPorSinal(): Record<string, number> {
    const n: Record<string, number> = {};
    for (const ex of this.exemplos) n[ex.termo] = (n[ex.termo] ?? 0) + 1;
    return n;
  }

  apagarExemplos(termo?: string) {
    this.exemplos = termo ? this.exemplos.filter((e) => e.termo !== termo) : [];
    this.salvarExemplos();
  }

  /** Exemplos em JSON, para guardar num arquivo ou levar para outro navegador. */
  exportarExemplos() {
    return JSON.stringify({ versao: this.versaoModelo, exemplos: this.exemplos });
  }

  importarExemplos(json: string) {
    const dados = JSON.parse(json);
    if (dados.versao !== this.versaoModelo) throw new Error("Esses exemplos são de outra versão do modelo.");
    this.exemplos = dados.exemplos;
    this.salvarExemplos();
  }

  private salvarExemplos() {
    try {
      localStorage.setItem(this.chaveExemplos, JSON.stringify(this.exemplos));
    } catch {
      // sem armazenamento (aba anônima): os exemplos valem só nesta sessão
    }
  }
}

function softmax(x: number[]) {
  const m = Math.max(...x);
  const e = Array.from(x, (v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}
