from pathlib import Path
import json, zipfile, xml.etree.ElementTree as ET
from osgeo import ogr,gdal
gdal.UseExceptions()
gdal.SetConfigOption('GDAL_PAM_ENABLED','NO')
ogr.UseExceptions()
root=Path(__file__).resolve().parents[1]
ns={'k':'http://www.opengis.net/kml/2.2'}
manifest=json.loads((root/'dist/data/manifest.json').read_text(encoding='utf-8'))
expected=sum(r['featureCount'] for r in manifest['references'])+next(m['contourCount'] for m in manifest['months'] if m['id']=='2026_09')
path=root/'tmp/files-tests/pacote-setembro.kmz'
with zipfile.ZipFile(path) as z:
    assert z.testzip() is None
    doc=ET.fromstring(z.read('doc.kml'))
    assert len(doc.findall('.//k:Placemark',ns))==expected
    href=doc.find('.//k:GroundOverlay/k:Icon/k:href',ns).text
    assert href in z.namelist()
    assert z.read(href)==(root/'dist/data/downloads/2026_09/ortofoto.png').read_bytes()
    for coords in doc.findall('.//k:coordinates',ns):
        assert all(len(p.split(','))==2 for p in coords.text.split())
source=ogr.Open(str(path))
assert source is not None
assert sum(layer.GetFeatureCount() for layer in source if layer.GetName()!='WebGIS Prosper — Mina Cuité')==expected
catalogue=json.loads((root/'dist/data/kmz-orthophotos.json').read_text())
for month in manifest['months']:
    asset=catalogue[month['id']]
    image=gdal.Open(str(root/'dist'/asset['url']))
    assert image.RasterXSize==asset['width'] and image.RasterYSize==asset['height']
    assert image.RasterCount==4
    assert image.GetRasterBand(4).GetStatistics(False,True)[0]==0
    (s,w),(n,e)=asset['bounds'];(ss,ww),(nn,ee)=month['orthoWebBounds']
    # Reprojection edges differ by at most two output pixels.
    assert max(abs(s-ss),abs(n-nn)) < 2*(n-s)/asset['height']
    assert max(abs(w-ww),abs(e-ee)) < 2*(e-w)/asset['width']
    assert image.GetRasterBand(4).GetStatistics(False,True)[1]==255
print('OGR/XML: todas as feições exportadas em 2D; ZIP íntegro com ortofoto incorporada. Nove ortofotos verificadas: dimensões, transparência e limites geográficos.')
