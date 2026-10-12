"""Monta o banco unificado de sinais de Libras a partir da base multi-fonte."""
import csv, json, re, sqlite3, sys, unicodedata
from collections import Counter
from urllib.parse import urlparse, parse_qs

SRC, OUT = sys.argv[1], sys.argv[2]

FONTES = {
    'INES': ('INES', 'Dicionário da Língua Brasileira de Sinais (INES)', 'https://dicionario.ines.gov.br/'),
    'SpreadTheSign': ('SpreadTheSign', 'Spread the Sign, European Sign Language Centre', 'https://www.spreadthesign.com/pt.br/'),
    'RedeSurdos': ('RedeSurdos-UFC', 'Rede Surdos Ceará (UFC)', 'https://redesurdosce.ufc.br/'),
    'UFV': ('UFV', 'Dicionário de Libras CEAD/UFV', 'https://sistemas.cead.ufv.br/capes/dicionario/'),
    'LibrasAcademicaUFF': ('LibrasAcademica-UFF', 'Libras Acadêmica (UFF)', 'https://librasacademica.uff.br/'),
}


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = s.replace('@', 'o')
    return re.sub(r'\s+', ' ', s).strip()


def tipo(palavra):
    p = palavra.strip()
    if re.fullmatch(r'[A-Za-zÇç]', p):
        return 'letra'
    if re.fullmatch(r'[\d\s.,ºª°]+', p):
        return 'numero'
    if re.search(r'[\s]', p):
        return 'expressao'
    return 'palavra'


def categoria(row):
    fonte, desc, link = row['source'], row['description'] or '', row['link'] or ''
    if fonte == 'SpreadTheSign':
        m = re.match(r'Categoria:\s*(.+)', desc)
        return m.group(1).strip() if m else None
    if fonte == 'UFV':
        v = parse_qs(urlparse(link).query).get('value')
        return v[0].replace('-', ' ') if v else None
    return None


def limpa_desc(row):
    d = row['description']
    if not d:
        return None
    if row['source'] == 'SpreadTheSign' and d.startswith('Categoria:'):
        return None
    d = re.sub(r'\s*…\s*Continue lendo.*$', '', d).strip()
    return d or None


src = sqlite3.connect(SRC)
src.row_factory = sqlite3.Row
rows = src.execute('select * from signs order by norm_word, source, id').fetchall()

out = sqlite3.connect(OUT + '/sinais_libras.db')
out.executescript(open(OUT + '/schema.sql').read())
for k, (cod, nome, site) in FONTES.items():
    out.execute('insert into fontes(codigo, nome, site) values (?,?,?)', (cod, nome, site))

seen = set()
registros = []
for r in rows:
    palavra = r['title'].strip()
    key = (norm(palavra), r['source'], r['video_url'] or r['youtube_id'])
    if key in seen:
        continue
    seen.add(key)
    yt = r['youtube_id']
    rec = dict(
        palavra=palavra,
        palavra_normalizada=norm(palavra),
        tipo=tipo(palavra),
        fonte=FONTES[r['source']][0],
        categoria=categoria(r),
        descricao=limpa_desc(r),
        exemplo_portugues=r['exemplo'],
        exemplo_libras_glosa=r['libras'],
        video_url=r['video_url'] or (f'https://www.youtube.com/watch?v={yt}' if yt else None),
        youtube_id=yt,
        imagem_url=r['image_url'],
        pagina_url=r['link'],
    )
    registros.append(rec)

cols = list(registros[0].keys())
out.executemany(
    f'insert into sinais({",".join(cols)}) values ({",".join("?" * len(cols))})',
    [tuple(r[c] for c in cols) for r in registros],
)
out.execute("insert into sinais_busca(sinais_busca) values ('rebuild')")
out.commit()

with open(OUT + '/sinais_libras.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    w.writerows(registros)
with open(OUT + '/sinais_libras.json', 'w', encoding='utf-8') as f:
    json.dump(registros, f, ensure_ascii=False, indent=0)

print('registros', len(registros))
print('termos distintos', len({r['palavra_normalizada'] for r in registros}))
print('por fonte', Counter(r['fonte'] for r in registros))
print('por tipo', Counter(r['tipo'] for r in registros))
print('letras', sorted({r['palavra'].upper() for r in registros if r['tipo'] == 'letra'}))
print('sem video', sum(1 for r in registros if not r['video_url']))
