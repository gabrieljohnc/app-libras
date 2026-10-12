export function linkSinal(palavraNormalizada: string) {
  return `/sinal/${encodeURIComponent(palavraNormalizada)}`;
}

export const NOMES_FONTES: Record<string, string> = {
  INES: "INES",
  "RedeSurdos-UFC": "Rede Surdos (UFC)",
  SpreadTheSign: "Spread the Sign",
  "LibrasAcademica-UFF": "Libras Acadêmica (UFF)",
  UFV: "UFV",
};
