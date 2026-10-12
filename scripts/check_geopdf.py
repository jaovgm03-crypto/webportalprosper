from osgeo import gdal,osr
import json,math
gdal.UseExceptions()
ds=gdal.Open('tmp/geopdf-test.pdf')
assert ds is not None
assert ds.GetSpatialRef() is not None,'Sem sistema de coordenadas'
g=ds.GetGeoTransform()
assert g[1]>0 and g[5]<0
print('PDF reconhecido pelo GDAL:',ds.GetSpatialRef().GetAuthorityCode(None),ds.RasterXSize,ds.RasterYSize,g)
src=ds.GetSpatialRef();src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
dst=osr.SpatialReference();dst.ImportFromEPSG(4326);dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
t=osr.CoordinateTransformation(src,dst)
layout=json.load(open('tmp/expected-layout.json'))
assert abs(max(layout['pageWidth'],layout['pageHeight'])*25.4/72-297)<.01
assert abs(min(layout['pageWidth'],layout['pageHeight'])*25.4/72-210)<.01
ratio=ds.RasterXSize/layout['pageWidth']
def ll(x,y):return t.TransformPoint(g[0]+x*g[1]+y*g[2],g[3]+x*g[4]+y*g[5])[:2]
left=layout['left'];top=layout['pageHeight']-layout['bottom']-layout['height']
nw=ll(left*ratio,top*ratio);se=ll((left+layout['width'])*ratio,(top+layout['height'])*ratio)
w,s,e,n=json.load(open('tmp/expected-bounds.json'))
assert max(abs(nw[0]-w),abs(nw[1]-n),abs(se[0]-e),abs(se[1]-s))<.00003,(nw,se,(w,s,e,n))
gdal.Translate('tmp/geopdf-render.png',ds,format='PNG',width=1000)
print('Coordenadas dos cantos verificadas e PDF renderizado.')
