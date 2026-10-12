"""Five equal elevation intervals shared by every survey, from full-resolution MDTs."""
from pathlib import Path
import json, math
import numpy as np
from osgeo import gdal
gdal.UseExceptions()
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/data'
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8-sig'))
limits=[]
for m in manifest['months']:
    ds=gdal.Open(str(ROOT.parent/'mdt'/f"mdt_{m['id']}.tif"))
    low,high=ds.GetRasterBand(1).ComputeRasterMinMax(False)
    if not (math.isfinite(low) and math.isfinite(high) and low<high): raise ValueError(m['id'])
    m['sourceElevationMin']=low; m['sourceElevationMax']=high
    limits.append((low,high))
    print(m['id'],'cotas originais:',low,high,flush=True)
low=min(v[0] for v in limits); high=max(v[1] for v in limits)
# Round outward to centimetres so the legend and classification use identical boundaries.
start=math.floor(low*100)/100; end=math.ceil(high*100)/100
edges=[round(start+(end-start)*i/5,2) for i in range(6)]
colors=['#2166ac','#67a9cf','#d1e5b0','#efb366','#a95332']
palette=np.array([[int(c[i:i+2],16) for i in (1,3,5)] for c in colors],dtype='uint8')
classification=dict(method='equal_interval',unit='m',sourceMin=low,sourceMax=high,edges=edges,colors=colors,source='Full-resolution MDTs; NoData excluded')
print('Classes comuns:',edges,flush=True)
for m in manifest['months']:
    source=str(ROOT.parent/'mdt'/f"mdt_{m['id']}.tif")
    # Preserve the exact projected rectangle used by the existing image overlay.
    vrt=gdal.Warp('',source,format='VRT',dstSRS='EPSG:3857')
    width=1300; height=round(width*vrt.RasterYSize/vrt.RasterXSize)
    ds=gdal.Warp('',source,format='MEM',dstSRS='EPSG:3857',width=width,height=height,resampleAlg='bilinear',dstNodata=-32767)
    a=ds.ReadAsArray(); valid=np.isfinite(a)&(a!=-32767)
    classes=np.clip(np.searchsorted(edges[1:-1],a,side='right'),0,4)
    rgb=palette[classes]
    mem=gdal.GetDriverByName('MEM').Create('',width,height,4,gdal.GDT_Byte)
    for c in range(3): mem.GetRasterBand(c+1).WriteArray(rgb[:,:,c])
    mem.GetRasterBand(4).WriteArray(valid.astype('uint8')*255)
    temp=OUT/m['id']/'terrain-classes.tmp.png'
    gdal.Translate(str(temp),mem,format='PNG')
    temp.replace(OUT/m['id']/'terrain-web.png')
    m['terrainClassCounts']=[int(np.count_nonzero(valid&(classes==i))) for i in range(5)]
    print(m['id'],'MDT classificado',flush=True)
manifest['terrainClassification']=classification
for r in manifest['references']:
    if r['id']=='area_diretamente_afetada': r.update(label='Área Diretamente Afetada',color='#e02626',weight=1.6)
    elif r['id']=='rede_drenagem': r.update(weight=1.2)
temp=OUT/'manifest.tmp.json'
temp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
temp.replace(OUT/'manifest.json')
print('Classificacao concluida.',flush=True)
