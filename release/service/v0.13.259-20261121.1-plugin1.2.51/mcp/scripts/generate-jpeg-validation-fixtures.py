"""Deterministic synthetic JPEGs; never phone screenshots or user content."""
from pathlib import Path
from PIL import Image, ImageDraw
import io,json,base64,hashlib

output=Path('tests/fixtures/jpeg-validation.json')
output.parent.mkdir(parents=True,exist_ok=True)
fixtures=[]
def emit(name,image,**options):
    data=io.BytesIO();image.save(data,format='JPEG',quality=70,**options);blob=data.getvalue()
    fixtures.append({'name':name,'width':image.width,'height':image.height,'mode':image.mode,
        'options':options,'sha256':hashlib.sha256(blob).hexdigest(),'jpeg_base64':base64.b64encode(blob).decode()})

for size in [(1,1),(17,31),(64,97)]:
    rgb=Image.new('RGB',size)
    pixels=rgb.load()
    for y in range(size[1]):
        for x in range(size[0]):pixels[x,y]=((17*x+3*y)%256,(7*x+23*y)%256,(x^y)*11%256)
    for mode in ['RGB','L','CMYK']:
        for progressive in [False,True]:
            for subsampling in [0,2]:emit(f'{mode}-{size[0]}x{size[1]}-p{int(progressive)}-s{subsampling}',rgb.convert(mode),progressive=progressive,subsampling=subsampling)

for width,height in [(443,960),(960,443),(886,1920)]:
    image=Image.new('RGB',(width,height),'#f5f5f5');draw=ImageDraw.Draw(image)
    draw.rectangle((0,0,width,80),fill='#36a8b6')
    draw.text((18,30),'SYNTHETIC VALIDATION FIXTURE',fill='white')
    for y in range(100,height-30,65):
        draw.rectangle((15,y,width-15,y+48),fill='white',outline='#d0d0d0')
        draw.text((25,y+14),f'Fixture row {y}: generated test data 0123456789',fill='black')
    emit(f'ui-{width}x{height}',image,subsampling=2)

# Exercise the existing pixel and memory limits without large fixture files.
for width,height in [(1400,1600),(1500,1600),(2048,2048),(2048,2052)]:
    emit(f'limits-{width}x{height}',Image.new('RGB',(width,height),'#79a7b4'),subsampling=0)

report={'synthetic_fixture':True,'provenance':'Pillow synthetic arrays and UI-like rectangles/text; no device access',
    'fixtures':fixtures}
output.write_text(json.dumps(report,separators=(',',':'))+'\n',encoding='utf8')
print(json.dumps({'output':str(output),'fixtures':len(fixtures),'json_bytes':output.stat().st_size}))
