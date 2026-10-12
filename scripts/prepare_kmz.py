"""Prepare portable EPSG:4326 image overlays from the portal rasters, not full-resolution sources."""
from pathlib import Path
import json
from osgeo import gdal, osr

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/data'
gdal.UseExceptions()
gdal.SetConfigOption('GDAL_PAM_ENABLED', 'NO')
manifest = json.loads((OUT/'manifest.json').read_text(encoding='utf-8-sig'))
catalogue = {}
srs = osr.SpatialReference()
srs.ImportFromEPSG(3857)
wgs = osr.SpatialReference()
wgs.ImportFromEPSG(4326)
wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
transform = osr.CoordinateTransformation(wgs, srs)
for month in manifest['months']:
    key = month['id']
    source = gdal.Translate('', str(OUT/key/'ortho-web.png'), format='MEM')
    (south,west),(north,east) = month['orthoWebBounds']
    x0,y0,_ = transform.TransformPoint(west,north)
    x1,y1,_ = transform.TransformPoint(east,south)
    source.SetProjection(srs.ExportToWkt())
    source.SetGeoTransform((x0,(x1-x0)/source.RasterXSize,0,y0,0,(y1-y0)/source.RasterYSize))
    image = gdal.Warp('',source,format='MEM',dstSRS='EPSG:4326',width=source.RasterXSize,height=0,resampleAlg='bilinear')
    target = OUT/'downloads'/key/'ortofoto.png'
    target.parent.mkdir(parents=True,exist_ok=True)
    gdal.Translate(str(target),image,format='PNG')
    gt=image.GetGeoTransform()
    catalogue[key] = dict(url=f'data/downloads/{key}/ortofoto.png',bounds=[[gt[3]+gt[5]*image.RasterYSize,gt[0]],[gt[3],gt[0]+gt[1]*image.RasterXSize]],width=image.RasterXSize,height=image.RasterYSize,bytes=target.stat().st_size)
    print(key, image.RasterXSize, image.RasterYSize, target.stat().st_size, flush=True)
    source=image=None
(OUT/'kmz-orthophotos.json').write_text(json.dumps(catalogue,ensure_ascii=False,indent=2),encoding='utf-8')
