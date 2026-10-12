-- Banco unificado de sinais de Libras
CREATE TABLE fontes (
    codigo TEXT PRIMARY KEY,
    nome   TEXT NOT NULL,
    site   TEXT NOT NULL
);

CREATE TABLE sinais (
    id                   INTEGER PRIMARY KEY,
    palavra              TEXT NOT NULL,           -- como aparece na fonte
    palavra_normalizada  TEXT NOT NULL,           -- minúsculas, sem acento, para busca
    tipo                 TEXT NOT NULL CHECK (tipo IN ('letra', 'numero', 'palavra', 'expressao')),
    fonte                TEXT NOT NULL REFERENCES fontes(codigo),
    categoria            TEXT,                    -- tema, quando a fonte informa
    descricao            TEXT,                    -- significado / acepção
    exemplo_portugues    TEXT,
    exemplo_libras_glosa TEXT,                    -- frase de exemplo em glosa (INES)
    video_url            TEXT,                    -- mp4 direto ou link do YouTube
    youtube_id           TEXT,
    imagem_url           TEXT,
    pagina_url           TEXT                     -- página do sinal na fonte
);

CREATE INDEX idx_sinais_norm ON sinais(palavra_normalizada);
CREATE INDEX idx_sinais_tipo ON sinais(tipo);

CREATE VIRTUAL TABLE sinais_busca USING fts5(
    palavra_normalizada, palavra, descricao,
    content='sinais', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
);
