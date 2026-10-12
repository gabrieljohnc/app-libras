export function linkSinal(palavraNormalizada: string) {
  return `/sinal/${encodeURIComponent(palavraNormalizada)}`;
}
