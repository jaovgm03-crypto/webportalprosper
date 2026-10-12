from pathlib import Path
import json
import numpy as np
from osgeo import gdal
ROOT=Path(__file__).resolve().parents[1]/'dist/data'
manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf8'))
c=manifest['terrainClassification']; edges=c['edges']; colors=c['colors']
assert len(edges)==6 and len(colors)==5
assert min(np.diff(edges))>0 and np.ptp(np.diff(edges))<.011
assert edges[0]<=min(m['sourceElevationMin'] for m in manifest['months'])
assert edges[-1]>=max(m['sourceElevationMax'] for m in manifest['months'])
palette=np.array([[int(color[i:i+2],16) for i in (1,3,5)] for color in colors])
for m in manifest['months']:
    ds=gdal.Open(str(ROOT/m['id']/'terrain-web.png'))
    a=ds.ReadAsArray(); valid=a[3]>0
    rgb=a[:3].transpose(1,2,0)
    counts=[int(np.count_nonzero(valid&np.all(rgb==color,axis=2))) for color in palette]
    assert counts==m['terrainClassCounts'],m['id']
    assert sum(counts)==int(valid.sum()),'Unclassified or interpolated colors'
    assert np.any(~valid),'NoData mask lost'
    for filename,limit in [('ortho-mobile.png',1600),('surface-texture-mobile.jpg',2048)]:
        small=gdal.Open(str(ROOT/m['id']/filename))
        assert max(small.RasterXSize,small.RasterYSize)<=limit
print(json.dumps({'status':'passed','surveys':len(manifest['months']),'classes':5,'edges':edges,'nodata':'transparent','mobileAssets':len(manifest['months'])*2},ensure_ascii=False))
