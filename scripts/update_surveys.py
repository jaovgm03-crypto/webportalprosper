"""Update monthly assets and fixed reference layers; never modify the source data."""
from pathlib import Path
import sys, json, csv, runpy
ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent
OUT = ROOT / 'dist/data'
sys.path.append(str(ROOT / 'python_packages'))
import numpy as np
import laspy
from osgeo import gdal, ogr, osr
gdal.UseExceptions()

def crs(code):
    s = osr.SpatialReference(); s.ImportFromEPSG(code)
    s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return s

def vectors(source):
    ds = ogr.Open(str(source)); layer = ds.GetLayer()
    src = layer.GetSpatialRef().Clone()
    src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transform = osr.CoordinateTransformation(src, crs(4326))
    features = []
    for f in layer:
        if not f.GetGeometryRef(): continue
        g = f.GetGeometryRef().Clone(); g.Transform(transform)
        # Reference boundaries remain exact; monthly curves are simplified for rendering.
        if source.parent.name == 'curvas_nivel': g = g.SimplifyPreserveTopology(.0000045)
        features.append(dict(type='Feature', id=f.GetFID(), properties=dict(f.items()), geometry=json.loads(g.ExportToJson())))
    return dict(type='FeatureCollection', features=features)

def save_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf8')

manifest = json.loads((OUT / 'manifest.json').read_text(encoding='utf-8-sig'))
existing = {m['id']:m for m in manifest['months']}
origin = np.array(manifest['sceneOriginUTM'])
labels = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
rows = list(csv.reader((BASE / 'volume_pilhas/historico_volume_pilhas.csv').read_text(encoding='cp1252').splitlines(), delimiter=';'))
records = []
for row in rows[1:]:
    if not row or not row[0].strip(): continue
    key = row[0].strip(); year, month = map(int, key.split('_'))
    out = OUT / key; out.mkdir(exist_ok=True)
    rec = existing.get(key, {'id':key})
    rec.update(label=f'{labels[month-1]} {year}', volume=float(row[1].replace(',','.')), density=float(row[2].replace(',','.')), tonnes=float(row[3].replace(',','.')))
    print(key, 'preparando imagens e vetores', flush=True)
    for kind, prefix in [('ortho','ortofoto'), ('terrain','mdt')]:
        source = BASE / prefix / f'{prefix}_{key}.tif'
        target = out / f'{kind}-web.png'
        warp = gdal.Warp('', str(source), format='VRT', dstSRS='EPSG:3857')
        gt = warp.GetGeoTransform()
        transform = osr.CoordinateTransformation(crs(3857), crs(4326))
        west, south, _ = transform.TransformPoint(gt[0], gt[3]+gt[5]*warp.RasterYSize)
        east, north, _ = transform.TransformPoint(gt[0]+gt[1]*warp.RasterXSize, gt[3])
        rec[kind+'WebBounds'] = [[south,west],[north,east]]
        rec.setdefault(kind+'Bounds', rec[kind+'WebBounds'])
        if not target.exists():
            width = 3000 if kind == 'ortho' else 1300
            small = gdal.Warp('', str(source), format='MEM', dstSRS='EPSG:3857', width=width, height=round(width*warp.RasterYSize/warp.RasterXSize), resampleAlg='bilinear', **({'dstAlpha':True} if kind=='ortho' else {'dstNodata':-32767}))
            if kind == 'ortho':
                gdal.Translate(str(target), small, format='PNG')
            else:
                a = small.ReadAsArray(); valid = np.isfinite(a) & (a != -32767)
                rec['elevationMin'] = float(a[valid].min()); rec['elevationMax'] = float(a[valid].max())
                t = np.clip((a-680)/340,0,1)
                stops = np.array([[25,80,107],[44,148,153],[135,188,122],[228,202,128],[164,103,72]])
                mem = gdal.GetDriverByName('MEM').Create('',a.shape[1],a.shape[0],4,gdal.GDT_Byte)
                for c in range(3): mem.GetRasterBand(c+1).WriteArray(np.interp(t,np.linspace(0,1,5),stops[:,c]).astype('uint8'))
                mem.GetRasterBand(4).WriteArray(valid.astype('uint8')*255)
                gdal.Translate(str(target),mem,format='PNG')
        warp = small = None
    data = vectors(BASE / 'curvas_nivel' / f'cn_1m_{key}.shp')
    save_json(out/'contours.geojson',data); rec['contourCount'] = len(data['features'])
    if not rec.get('cloudChunks'):
        cloud = laspy.read(BASE / '3d' / f'nuvem_pontos_{str(year)[2:]}_{month:02d}.copc.laz')
        src = osr.SpatialReference(); src.ImportFromWkt(cloud.header.parse_crs().to_wkt()); src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        xyz = np.array(osr.CoordinateTransformation(src,crs(32723)).TransformPoints(np.column_stack((cloud.x,cloud.y,cloud.z))))
        pos = np.column_stack((xyz[:,0]-origin[0],xyz[:,2]-origin[2],origin[1]-xyz[:,1])).astype('<f4')
        rgb = np.column_stack((cloud.red,cloud.green,cloud.blue)); rgb = (rgb/257 if rgb.max()>255 else rgb).astype('uint8')
        chunks = []
        for j in range(5):
            p = f'points-full-{j}.bin'; c = f'colors-full-{j}.bin'
            pos[j::5].tofile(out/p); rgb[j::5].tofile(out/c)
            chunks.append(dict(positions=p,colors=c,count=len(pos[j::5])))
        rec.update(cloudChunks=chunks,fullPointCount=len(pos),pointCount=len(pos),cloudOriginUTM=origin.tolist(),cloudDisplayCRS='EPSG:32723',cloudExtent=np.ptp(pos,axis=0).tolist())
        del cloud, xyz, pos, rgb
    save_json(out/'metadata.json',rec)
    records.append(rec)
    print(key, rec['contourCount'], 'curvas;',rec['fullPointCount'],'pontos',flush=True)

refs = []
(OUT/'references').mkdir(exist_ok=True)
styles = {
 'area_diretamente_afetada':dict(label='Área Diretamente Afetada',color='#e02626',weight=1.6),
 'rede_drenagem':dict(label='Hidrografia',color='#169fda',weight=1.2),
 'direitos_minerarios':dict(label='Direitos Minerários',color='#ffe000',weight=1.5,dashArray='7 5'),
 'propriedades_rurais':dict(label='Propriedades Rurais',color='#d3d3d3',weight=1.5),
 'reserva_legal':dict(label='Reserva Legal',color='#98d98e',weight=1,fill=True,fillOpacity=0.5,defaultVisible=False),
 'servidao_ambiental_perpetua':dict(label='Servidão Ambiental Perpétua',color='#f39a38',weight=1,fill=True,fillOpacity=0.5,defaultVisible=False)
}
for source in sorted((BASE/'vetores_referencia').glob('*.shp')):
    key=source.stem
    style=styles.get(key,dict(label=key.replace('_',' ').title(),color='#b7bbc2',weight=1.5))
    label=style['label']; color=style['color']
    data = vectors(BASE / 'vetores_referencia' / f'{key}.shp')
    save_json(OUT/'references'/f'{key}.geojson',data)
    refs.append(dict(id=key,**style,url=f'data/references/{key}.geojson',featureCount=len(data['features'])))
    print('Referencia:',label,len(data['features']),'feicoes; campos:',list(data['features'][0]['properties']),flush=True)
manifest.update(months=sorted(records,key=lambda m:m['id']),references=refs,rasterDisplayCRS='EPSG:3857')
save_json(OUT/'manifest.json',manifest)
with (OUT/'volumes.csv').open('w',encoding='utf-8-sig',newline='') as f: csv.writer(f,delimiter=';').writerows(rows)
runpy.run_path(str(ROOT/'scripts/generate_highres_mesh.py'),run_name='__main__')
runpy.run_path(str(ROOT/'scripts/classify_terrain.py'),run_name='__main__')
runpy.run_path(str(ROOT/'scripts/prepare_mobile.py'),run_name='__main__')
runpy.run_path(str(ROOT/'scripts/prepare_kmz.py'),run_name='__main__')
print('Atualizacao concluida.',flush=True)
