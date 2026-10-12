// Cópia fiel de treino/features.py. Se mudar um, mude o outro e rode o teste de paridade.

export const T = 24;
const POSE_IDX = [0, 2, 5, 9, 10, 11, 12, 13, 14, 15, 16];
export const N_POSE = POSE_IDX.length * 2;
export const N_MAO = 1 + 2 + 20 * 3;
export const N_FEATURES = N_POSE + 2 * N_MAO; // 148

export type Ponto = { x: number; y: number; z?: number; visibility?: number };
export type Mao = { pontos: Ponto[]; direita: boolean };
export type Referencia = { cx: number; cy: number; escala: number };

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Features de um quadro. `pose` são os 33 pontos do PoseLandmarker (ou null). */
export function quadro(
  pose: Ponto[] | null,
  maos: Mao[],
  aspecto: number,
  refAnterior: Referencia | null,
): { f: Float32Array; ref: Referencia; poseOk: boolean } {
  const f = new Float32Array(N_FEATURES);
  const poseOk = !!pose && (pose[11].visibility ?? 0) > 0.3 && (pose[12].visibility ?? 0) > 0.3;
  const px = (i: number) => pose![i].x * aspecto;
  const py = (i: number) => pose![i].y;

  let ref: Referencia;
  if (poseOk) {
    const escala = Math.max(dist(px(11), py(11), px(12), py(12)), 1e-3);
    ref = { cx: (px(11) + px(12)) / 2, cy: (py(11) + py(12)) / 2, escala };
    POSE_IDX.forEach((i, k) => {
      f[2 * k] = (px(i) - ref.cx) / escala;
      f[2 * k + 1] = (py(i) - ref.cy) / escala;
    });
  } else {
    ref = refAnterior ?? { cx: aspecto / 2, cy: 0.5, escala: 0.3 };
  }

  // slot 0 = mão direita da pessoa (punho 16 da pose), slot 1 = mão esquerda (punho 15)
  const m = maos.slice(0, 2);
  const slots: number[] = [];
  const wx = (k: number) => m[k].pontos[0].x * aspecto;
  const wy = (k: number) => m[k].pontos[0].y;
  if (m.length === 2 && poseOk) {
    const dd = (k: number) => dist(wx(k), wy(k), px(16), py(16));
    const de = (k: number) => dist(wx(k), wy(k), px(15), py(15));
    if (dd(0) + de(1) <= dd(1) + de(0)) slots.push(0, 1);
    else slots.push(1, 0);
  } else if (m.length === 1 && poseOk) {
    slots.push(dist(wx(0), wy(0), px(16), py(16)) <= dist(wx(0), wy(0), px(15), py(15)) ? 0 : 1);
  } else {
    const usados = new Set<number>();
    m.forEach((mao) => {
      let s = mao.direita ? 0 : 1;
      if (usados.has(s)) s = 1 - s;
      usados.add(s);
      slots.push(s);
    });
  }

  m.forEach((mao, k) => {
    const s = slots[k];
    const pts = mao.pontos;
    const x0 = pts[0].x * aspecto, y0 = pts[0].y, z0 = pts[0].z ?? 0;
    const tam = Math.max(dist(pts[9].x * aspecto, pts[9].y, x0, y0), 1e-3);
    const base = N_POSE + s * N_MAO;
    f[base] = 1;
    f[base + 1] = (x0 - ref.cx) / ref.escala;
    f[base + 2] = (y0 - ref.cy) / ref.escala;
    for (let j = 1; j < 21; j++) {
      const o = base + 3 + (j - 1) * 3;
      f[o] = (pts[j].x * aspecto - x0) / tam;
      f[o + 1] = (pts[j].y - y0) / tam;
      f[o + 2] = ((pts[j].z ?? 0) - z0) / tam;
    }
  });
  return { f, ref, poseOk };
}

export const temMao = (f: Float32Array) => f[N_POSE] > 0 || f[N_POSE + N_MAO] > 0;

export const LIMIAR_MOVIMENTO = 0.5; // larguras de ombro por segundo; mãos paradas ficam abaixo de ~0,3
export const MARGEM_S = 0.2;

/** Quanto os punhos andaram entre dois quadros (larguras de ombro). Mão que aparece ou some conta um pouco. */
export function deslocamento(a: Float32Array, b: Float32Array) {
  let m = 0;
  for (const base of [N_POSE, N_POSE + N_MAO]) {
    if (a[base] > 0 && b[base] > 0) m += Math.hypot(b[base + 1] - a[base + 1], b[base + 2] - a[base + 2]);
    else if (a[base] !== b[base]) m += 0.01;
  }
  return m;
}

/** Velocidade por quadro com média móvel de 3 quadros (centrada), igual ao treino. */
export function velocidade(seq: Float32Array[], ts: number[]): number[] {
  const v = seq.map((f, t) => (t === 0 ? 0 : deslocamento(seq[t - 1], f) / Math.max(ts[t] - ts[t - 1], 1e-3)));
  return v.map((_, t) => {
    const janela = v.slice(Math.max(t - 1, 0), t + 2);
    return janela.reduce((x, y) => x + y, 0) / janela.length;
  });
}

/** Do primeiro ao último quadro em movimento, com MARGEM_S de folga de cada lado. `ts` em segundos. */
export function recortar(seq: Float32Array[], ts: number[]): { seq: Float32Array[]; ts: number[] } {
  const v = velocidade(seq, ts);
  const mov = v.flatMap((x, i) => (x > LIMIAR_MOVIMENTO ? [i] : []));
  if (mov.length === 0) return { seq, ts };
  const t0 = ts[mov[0]] - MARGEM_S, t1 = ts[mov[mov.length - 1]] + MARGEM_S;
  const k = ts.flatMap((t, i) => (t >= t0 - 1e-3 && t <= t1 + 1e-3 ? [i] : []));
  return { seq: seq.slice(k[0], k[k.length - 1] + 1), ts: ts.slice(k[0], k[k.length - 1] + 1) };
}

/** T quadros igualmente espaçados no tempo; devolve o tensor achatado (T * N_FEATURES). */
export function reamostrar(seq: Float32Array[], ts: number[], t = T): Float32Array {
  const out = new Float32Array(t * N_FEATURES);
  for (let i = 0; i < t; i++) {
    const alvo = t === 1 ? ts[0] : ts[0] + ((ts[ts.length - 1] - ts[0]) * i) / (t - 1);
    let melhor = 0;
    for (let j = 1; j < ts.length; j++) if (Math.abs(ts[j] - alvo) < Math.abs(ts[melhor] - alvo)) melhor = j;
    out.set(seq[melhor], i * N_FEATURES);
  }
  return out;
}

export function preparar(seq: Float32Array[], ts: number[]): Float32Array {
  const r = recortar(seq, ts);
  return reamostrar(r.seq, r.ts);
}
