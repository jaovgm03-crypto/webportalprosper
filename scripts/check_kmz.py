import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from osgeo import ogr, osr

root = Path('tmp')
with zipfile.ZipFile(root / 'measurements-test.kmz') as archive:
    assert archive.namelist() == ['doc.kml']
    assert archive.testzip() is None
    assert archive.read('doc.kml') == (root / 'measurements-test.kml').read_bytes()
    doc = ET.fromstring(archive.read('doc.kml'))
ns = {'k': 'http://www.opengis.net/kml/2.2'}
assert len(doc.findall('.//k:Placemark', ns)) == 4
for coords in doc.findall('.//k:coordinates', ns):
    assert all(len(p.split(',')) == 2 for p in coords.text.split())
for ring in doc.findall('.//k:LinearRing/k:coordinates', ns):
    assert ring.text.split()[0] == ring.text.split()[-1]
assert all(e.text == 'clampToGround' for e in doc.findall('.//k:altitudeMode', ns))
assert all(e.text == 'Teste <original>' for e in doc.findall('.//k:Data[@name="Área & cota"]/k:value', ns))
fixture = json.loads((root / 'measurements-fixture.json').read_text())
src, dst = osr.SpatialReference(), osr.SpatialReference()
src.ImportFromEPSG(4326)
dst.ImportFromEPSG(32723)
src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
transform = osr.CoordinateTransformation(src, dst)
for vertex, coord in zip(fixture['vertices'], fixture['points']):
    e, n, _ = transform.TransformPoint(coord['lng'], coord['lat'])
    assert abs(e - (fixture['origin'][0] + vertex['x'])) < .02
    assert abs(n - (fixture['origin'][1] - vertex['z'])) < .02
dataset = ogr.Open(str(root / 'measurements-test.kmz'))
assert dataset is not None
assert sum(layer.GetFeatureCount() for layer in dataset) == 4
print('KMZ: ZIP integrity, XML, 2D geometries and OGR read passed; UTM accuracy < 2 cm.')
