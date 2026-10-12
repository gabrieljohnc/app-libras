import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export type Sinal = {
  id: number;
  palavra: string;
  palavra_normalizada: string;
  tipo: "letra" | "numero" | "palavra" | "expressao";
  fonte: string;
  categoria: string | null;
  descricao: string | null;
  exemplo_portugues: string | null;
  exemplo_libras_glosa: string | null;
  video_url: string | null;
  youtube_id: string | null;
  imagem_url: string | null;
  pagina_url: string | null;
};

export type Resultado = {
  palavra_normalizada: string;
  palavra: string;
  tipo: string;
  fontes: string[];
  total: number;
};

export const NOMES_FONTES: Record<string, string> = {
  INES: "INES",
  "RedeSurdos-UFC": "Rede Surdos (UFC)",
  SpreadTheSign: "Spread the Sign",
  "LibrasAcademica-UFF": "Libras Acadêmica (UFF)",
  UFV: "UFV",
};
