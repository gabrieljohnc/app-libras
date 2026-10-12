"use client";

import { useRef, useState } from "react";
import { NOMES_FONTES, type Sinal } from "@/lib/supabase";

const VELOCIDADES = [0.5, 1];

export default function VideoSinal({ sinal }: { sinal: Sinal }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [velocidade, setVelocidade] = useState(1);
  const ehYoutube = !!sinal.youtube_id;

  return (
    <article className="cartao">
      <div className="cartao-video">
        {ehYoutube ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${sinal.youtube_id}?rel=0`}
            title={`Sinal de ${sinal.palavra}`}
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            ref={ref}
            src={sinal.video_url ?? undefined}
            poster={sinal.imagem_url ?? undefined}
            controls
            loop
            muted
            playsInline
            preload="metadata"
          />
        )}
      </div>
      <div className="cartao-corpo">
        <div className="cartao-topo">
          <span className="fonte">{NOMES_FONTES[sinal.fonte] ?? sinal.fonte}</span>
          {!ehYoutube && (
            <div className="controles" aria-label="Velocidade">
              {VELOCIDADES.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={velocidade === v}
                  onClick={() => {
                    setVelocidade(v);
                    if (ref.current) {
                      ref.current.playbackRate = v;
                      ref.current.play().catch(() => {});
                    }
                  }}
                >
                  {v}x
                </button>
              ))}
            </div>
          )}
        </div>
        {sinal.categoria && <span className="tag" style={{ alignSelf: "flex-start" }}>{sinal.categoria}</span>}
        {sinal.descricao && <p className="descricao">{sinal.descricao}</p>}
        {sinal.exemplo_portugues && (
          <p className="exemplo">
            <b>Exemplo:</b> {sinal.exemplo_portugues}
          </p>
        )}
        {sinal.exemplo_libras_glosa && (
          <p className="exemplo">
            <b>Em Libras:</b> {sinal.exemplo_libras_glosa}
          </p>
        )}
        {sinal.pagina_url && (
          <a className="link-fonte" href={sinal.pagina_url} target="_blank" rel="noreferrer">
            Ver na fonte original →
          </a>
        )}
      </div>
    </article>
  );
}
