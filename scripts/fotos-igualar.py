"""fotos-igualar.py — iguala el color de TODAS las fotos de media/ con un mismo tratamiento.

Las fotos de un pueblo llegan de cámaras y años muy distintos (un cartel de 2014,
Commons, la web del Ayuntamiento) y juntas en «Conocer» y «Qué ver» se nota: una
fría, otra quemada, otra oscura y naranja. Este script no recorta ni cambia
fondos ni inventa nada: SOLO COLOR, y el mismo para todas. Cada foto se mide y se
lleva hacia un mismo punto de llegada, con topes para que las buenas apenas se
toquen y las malas no se fuercen:

  1. balance de blancos: la media de los grises de la foto (píxeles poco
     saturados de luz media o clara) se lleva a gris, a medias (FUERZA_BLANCOS)
     y con la ganancia de cada canal limitada (TOPE_BLANCOS). Si la foto no tiene
     grises suficientes (un plato de dulces), no se toca el balance;
  2. niveles: el 0,5 % más oscuro de la luminancia a NEGRO y el 99,5 % a BLANCO,
     con un estiramiento como mucho de TOPE_NIVELES; luego una gamma que acerca
     la mediana a MEDIANA (con la gamma entre GAMMA_MIN y GAMMA_MAX);
  3. saturación: la croma media se acerca a CROMA (factor entre SAT_MIN y
     SAT_MAX: una foto casi en blanco y negro sigue casi en blanco y negro);
  4. tono cálido muy leve y común (CALIDO): un poco más de rojo y un poco menos
     de azul en los medios tonos, nada en los blancos ni en los negros;
  5. nitidez suave (máscara de enfoque) después de reducir, en cada tamaño.

Es repetible e idempotente: siempre parte de media/originales/<nombre>.jpg (que
se conserva y no se toca) y escribe media/<nombre>.jpg (1600 px de lado largo
como mucho, o el tamaño del original si es menor) y media/<nombre>-800.jpg.
Correrlo dos veces da los mismos bytes.

  python scripts/fotos-igualar.py                    todas las de media/originales/
  python scripts/fotos-igualar.py --guardar-originales
        la primera vez: copia media/<nombre>.jpg a media/originales/ (si no estaba)
  python scripts/fotos-igualar.py --salida carpeta   escribe en otra carpeta (pruebas)
  python scripts/fotos-igualar.py --comparativa      además, media/_comparativa-igualado.jpg
                                                     (antes arriba, después abajo; no se sirve)

Lo medido y lo aplicado a cada foto queda en media/_igualado.json.
"""
import json, os, shutil, sys
import numpy as np
from PIL import Image, ImageFilter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA = os.path.join(RAIZ, 'media')
ORIGINALES = os.path.join(MEDIA, 'originales')
LADO, LADO_MOVIL = 1600, 800

# ── el punto de llegada común (ver INFORME y RESKIN.md §6) ──
FUERZA_BLANCOS = 0.6      # cuánto se corrige la dominante (0 nada, 1 todo)
TOPE_BLANCOS = 0.07       # ganancia de cada canal entre 0,93 y 1,07
MIN_GRISES = 0.03         # fracción mínima de píxeles grises para tocar el balance
NEGRO, BLANCO = 0.025, 0.965
TOPE_NIVELES = 1.30       # el rango como mucho se estira ×1,3
MEDIANA = 0.52
GAMMA_MIN, GAMMA_MAX = 0.80, 1.10
CROMA = 0.115             # croma media de llegada (máx − mín de RGB)
SAT_MIN, SAT_MAX = 0.85, 1.12
CALIDO = 0.012            # +1,2 % de rojo y −1,2 % de azul en los medios tonos
NITIDEZ = dict(radius=1.0, percent=35, threshold=3)
CALIDAD, CALIDAD_MOVIL = 84, 82
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def medir(a):
    luma = (a * LUMA).sum(-1)
    croma = a.max(-1) - a.min(-1)
    return luma, croma


def igualar(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    luma, croma = medir(a)
    p = {}

    # 1. balance de blancos sobre los grises de la foto
    grises = (croma < 0.10) & (luma > 0.30) & (luma < 0.97)
    p['grises'] = round(float(grises.mean()), 3)
    if grises.mean() >= MIN_GRISES:
        media = a[grises].mean(0)
        g = 1 + FUERZA_BLANCOS * (media.mean() / np.maximum(media, 1e-3) - 1)
        g = np.clip(g, 1 - TOPE_BLANCOS, 1 + TOPE_BLANCOS)
        g = g / (g * LUMA).sum()              # sin cambiar la luminancia media
        a = np.clip(a * g, 0, 1)
        p['ganancia_rgb'] = [round(float(x), 3) for x in g]
    else:
        p['ganancia_rgb'] = [1.0, 1.0, 1.0]

    # 2. niveles y gamma, sobre la luminancia (el color se escala con ella)
    luma, _ = medir(a)
    lo, hi = np.percentile(luma, [0.5, 99.5])
    estira = min((BLANCO - NEGRO) / max(hi - lo, 1e-3), TOPE_NIVELES)
    centro_o, centro_d = (lo + hi) / 2, (NEGRO + BLANCO) / 2
    nueva = np.clip((luma - centro_o) * estira + centro_d, 0, 1)
    med = float(np.median(nueva))
    gamma = float(np.clip(np.log(MEDIANA) / np.log(min(max(med, 0.05), 0.95)), GAMMA_MIN, GAMMA_MAX))
    nueva = nueva ** gamma
    a = a + (nueva - luma)[..., None]          # mismo desplazamiento en los tres canales: el matiz no cambia
    p.update(niveles=[round(float(lo), 3), round(float(hi), 3)], estira=round(estira, 3), gamma=round(gamma, 3))

    # 3. saturación hacia la croma común
    luma, croma = medir(np.clip(a, 0, 1))
    c = float(croma.mean())
    f = float(np.clip((CROMA / max(c, 1e-3)) ** 0.5, SAT_MIN, SAT_MAX))
    a = luma[..., None] + (a - luma[..., None]) * f
    p.update(croma_antes=round(c, 3), saturacion=round(f, 3))

    # 4. un punto cálido común, solo en los medios tonos
    peso = 4 * luma * (1 - luma)
    a[..., 0] += CALIDO * peso
    a[..., 2] -= CALIDO * peso

    out = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    luma, croma = medir(np.asarray(out).astype(np.float32) / 255)
    p.update(croma_despues=round(float(croma.mean()), 3), mediana_despues=round(float(np.median(luma)), 3))
    return out, p


def reducir(im, lado):
    r = im.copy()
    if max(r.size) > lado:
        r.thumbnail((lado, lado), Image.LANCZOS)
    return r.filter(ImageFilter.UnsharpMask(**NITIDEZ))


def guardar(im, ruta, calidad):
    # sin metadatos ni marcas de tiempo: los bytes solo dependen de los píxeles
    im.save(ruta, 'JPEG', quality=calidad, optimize=True, progressive=True, subsampling='4:2:0')


def nombres():
    if not os.path.isdir(ORIGINALES):
        return []
    return sorted(os.path.splitext(f)[0] for f in os.listdir(ORIGINALES) if f.lower().endswith('.jpg'))


def guardar_originales():
    os.makedirs(ORIGINALES, exist_ok=True)
    for f in sorted(os.listdir(MEDIA)):
        if f.endswith('.jpg') and not f.endswith('-800.jpg') and not f.startswith('_'):
            dest = os.path.join(ORIGINALES, f)
            if not os.path.exists(dest):
                shutil.copyfile(os.path.join(MEDIA, f), dest)
                print('  original guardado: media/originales/' + f)


def comparativa(pares, ruta):
    """Hoja de contacto: cada foto antes (arriba) y después (abajo), a 300 px de alto."""
    alto = 300
    cols = []
    for antes, despues in pares:
        a, d = antes.copy(), despues.copy()
        for x in (a, d):
            x.thumbnail((10000, alto))
        cols.append((a, d))
    ancho = sum(max(a.width, d.width) for a, d in cols) + 8 * (len(cols) + 1)
    hoja = Image.new('RGB', (ancho, alto * 2 + 24), (250, 249, 245))
    x = 8
    for a, d in cols:
        hoja.paste(a, (x, 8)); hoja.paste(d, (x, alto + 16))
        x += max(a.width, d.width) + 8
    hoja.save(ruta, 'JPEG', quality=80)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    args = sys.argv[1:]
    if '--guardar-originales' in args:
        guardar_originales()
    salida = os.path.abspath(args[args.index('--salida') + 1]) if '--salida' in args else MEDIA
    os.makedirs(salida, exist_ok=True)
    lista = nombres()
    if not lista:
        print('No hay fotos en media/originales/. La primera vez: --guardar-originales')
        return
    informe, pares = {}, []
    for n in lista:
        orig = Image.open(os.path.join(ORIGINALES, n + '.jpg')).convert('RGB')
        igual, p = igualar(orig)
        grande, movil = reducir(igual, LADO), reducir(igual, LADO_MOVIL)
        guardar(grande, os.path.join(salida, n + '.jpg'), CALIDAD)
        guardar(movil, os.path.join(salida, n + '-800.jpg'), CALIDAD_MOVIL)
        p['tamano'] = list(grande.size)
        informe[n] = p
        pares.append((orig, igual))
        print('%-22s %4dx%-4d  balance %s  niveles ×%.2f γ %.2f  saturación ×%.2f' % (n, grande.width, grande.height, p['ganancia_rgb'], p['estira'], p['gamma'], p['saturacion']))
    if salida == MEDIA:
        with open(os.path.join(MEDIA, '_igualado.json'), 'w', encoding='utf-8') as fh:
            json.dump({'_leeme': 'Lo escribe scripts/fotos-igualar.py: lo medido y lo aplicado a cada foto (no editar).',
                       'parametros': {k: v for k, v in globals().items() if k.isupper() and k not in ('RAIZ', 'MEDIA', 'ORIGINALES', 'LUMA')},
                       'fotos': informe}, fh, ensure_ascii=False, indent=1)
            fh.write('\n')
    if '--comparativa' in args:
        comparativa(pares, os.path.join(MEDIA, '_comparativa-igualado.jpg'))
        print('✓ media/_comparativa-igualado.jpg (antes arriba, después abajo)')


if __name__ == '__main__':
    main()
