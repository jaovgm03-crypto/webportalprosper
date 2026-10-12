from pathlib import Path
import sys, json, time
ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT / 'python_packages'))
import numpy as np
from osgeo import gdal, ogr, osr
gdal.UseExceptions()

BASE = ROOT.parent
OUT = ROOT / 'dist/data'
manifest = json.loads((OUT / 'manifest.json').read_text(encoding='utf-8-sig'))
origin = np.array(manifest.get('sceneOriginUTM', [716060., 7854510., 850.]))

for i, rec in enumerate(manifest['months']):
    key = rec['id']
    out = OUT / key
    if rec.get('surface', {}).get('width') == 540 and (out / 'surface-texture.jpg').exists():
        continue
    t0 = time.time()
    print(f'Processando malha 3D de alta resolucao para {key}...', flush=True)
    
    ortho_path = str(BASE / f'ortofoto/ortofoto_{key}.tif')
    ortho = gdal.Warp('', ortho_path, format='VRT', dstSRS='EPSG:32723')
    gt = ortho.GetGeoTransform()
    bounds = [gt[0], gt[3] + gt[5] * ortho.RasterYSize, gt[0] + gt[1] * ortho.RasterXSize, gt[3]]
    ratio = ortho.RasterYSize / ortho.RasterXSize
    
    # Resolução aprimorada: 540 colunas (~1.3m por pixel no MDT), mais de 550 mil vértices
    w = 540
    h = round(w * ratio)
    
    dem = gdal.Warp('', str(BASE / f'mdt/mdt_{key}.tif'), format='MEM', dstSRS='EPSG:32723',
                    outputBounds=bounds, width=w, height=h, resampleAlg='bilinear', dstNodata=-32767)
    elev = dem.ReadAsArray()
    valid = np.isfinite(elev) & (elev != -32767)
    
    dg = dem.GetGeoTransform()
    xx, yy = np.meshgrid(dg[0] + (np.arange(w) + 0.5) * dg[1], dg[3] + (np.arange(h) + 0.5) * dg[5])
    
    # Posições relativas à origem métrica comum da cena
    pos = np.stack((xx - origin[0], np.where(valid, elev, origin[2]) - origin[2], origin[1] - yy), axis=-1).astype('<f4')
    pos.tofile(out / 'surface-positions.bin')
    
    # Geração dos triângulos indexados
    indices = []
    for y in range(h - 1):
        for x in range(w - 1):
            a = y * w + x
            b = a + 1
            c = a + w
            d = c + 1
            if valid[y, x] and valid[y + 1, x] and valid[y, x + 1]:
                indices.extend((a, c, b))
            if valid[y, x + 1] and valid[y + 1, x] and valid[y + 1, x + 1]:
                indices.extend((b, c, d))
                
    indices_arr = np.array(indices, dtype='<u4')
    indices_arr.tofile(out / 'surface-indices.bin')
    
    # Textura
    tex_file = out / 'surface-texture.jpg'
    th = 6500
    tw = round(th / ratio)
    if not tex_file.exists():
        print(f'  Gerando textura {tw}x{th}...', flush=True)
        texture = gdal.Warp('', ortho_path, format='MEM', dstSRS='EPSG:32723',
                            outputBounds=bounds, width=tw, height=th, resampleAlg='bilinear')
        gdal.Translate(str(tex_file), texture, format='JPEG', bandList=[1, 2, 3], creationOptions=['QUALITY=92'])
    
    rec['surface'] = {
        'width': w,
        'height': h,
        'boundsUTM': bounds,
        'vertexCount': w * h,
        'indexCount': len(indices),
        'triangleCount': len(indices) // 3,
        'textureWidth': tw,
        'textureHeight': th,
        'elevationMin': float(np.min(elev[valid])) if np.any(valid) else 0.0,
        'elevationMax': float(np.max(elev[valid])) if np.any(valid) else 0.0,
        'source': 'Modelo Digital do Terreno (MDT) texturizado com Ortofoto RGB de alta resolucao'
    }
    print(f'  Concluido {key}: {w}x{h} ({w*h} vertices, {len(indices)//3} triangulos) em {time.time()-t0:.2f}s', flush=True)

(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
print('Manifesto atualizado com sucesso!', flush=True)
