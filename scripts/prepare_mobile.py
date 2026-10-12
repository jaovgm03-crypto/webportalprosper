from pathlib import Path
import json
from osgeo import gdal
gdal.UseExceptions()
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/data'
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8-sig'))
for m in manifest['months']:
    folder=OUT/m['id']
    for name,target,maximum,driver in [('ortho-web.png','ortho-mobile.png',1600,'PNG'),('surface-texture.jpg','surface-texture-mobile.jpg',2048,'JPEG')]:
        ds=gdal.Open(str(folder/name))
        factor=min(1,maximum/max(ds.RasterXSize,ds.RasterYSize))
        args=dict(format=driver,width=round(ds.RasterXSize*factor),height=round(ds.RasterYSize*factor),resampleAlg='average')
        if driver=='JPEG': args['creationOptions']=['QUALITY=90']
        gdal.Translate(str(folder/target),ds,**args)
    print(m['id'],'imagens para celular prontas',flush=True)
