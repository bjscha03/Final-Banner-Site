import json,re,urllib.request,hashlib,concurrent.futures
from pathlib import Path
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Image,Table,TableStyle,KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.utils import ImageReader
from xml.sax.saxutils import escape
import fitz
R=Path(__file__).resolve().parents[1];P=R/'shared/specialty-supplier.json';S=json.loads(P.read_text());out=R/'public/downloads/products';out.mkdir(parents=True,exist_ok=True);temp=Path('/tmp/bof-guide-images');temp.mkdir(exist_ok=True)
styles=getSampleStyleSheet();styles.add(ParagraphStyle(name='Brand',fontName='Helvetica-Bold',fontSize=10,textColor=colors.HexColor('#c94e00'),spaceAfter=15));styles.add(ParagraphStyle(name='Title2',fontName='Helvetica-Bold',fontSize=25,leading=30,textColor=colors.HexColor('#0b1f3a'),spaceAfter=15));styles.add(ParagraphStyle(name='StepText',fontName='Helvetica',fontSize=11,leading=16,textColor=colors.HexColor('#334155'),spaceBefore=8,spaceAfter=10));styles.add(ParagraphStyle(name='SmallText',fontName='Helvetica',fontSize=8,leading=12,textColor=colors.HexColor('#64748b')))
for slug,d in S.items():
 if not d.get('installation') or any(x['kind']=='installation' and not x.get('localUrl') for x in d['downloads']):continue
 d['downloads']=[x for x in d['downloads'] if not x.get('localUrl')]
 if slug=='step-repeat-backdrop':
  texts=['Join the two horizontal pole pairs at their B-B and C-C ends. Extend the telescopic A ends.','Insert each upright pole into its base at end C. Secure the hex bolt from underneath the base.','Feed the horizontal poles through the top and bottom pockets in the printed backdrop.','Attach the horizontal poles to the uprights with the black thumb screws.'];imgs=[url for step in d['installation'] for url in step['images']];d['installation']=[{'text':t,'images':[imgs[i]]} for i,t in enumerate(texts)]
 else:
  texts=['Lay out all sections of the pole set.','Connect the pole sections securely.','Feed the assembled pole into the flag sleeve.','Secure the flag at the lower pole attachment.']
  for i,step in enumerate(d['installation']):step['text']=texts[i]
 path=out/(slug+'-installation.pdf');flow=[Paragraph('BANNERS ON THE FLY',styles['Brand']),Paragraph(escape(d['name']),styles['Title2']),Paragraph('Assembly guide',styles['Heading2']),Paragraph('Use the manufacturer illustrations below for your selected hardware kit.',styles['StepText']),Spacer(1,8)];cells=[]
 for i,step in enumerate(d['installation']):
  cell=[]
  for url in step['images']:
   imagefile=temp/(hashlib.sha256(url.encode()).hexdigest()[:16]+'.jpg')
   if not imagefile.exists():imagefile.write_bytes(urllib.request.urlopen(url,timeout=30).read())
   iw,ih=ImageReader(str(imagefile)).getSize();scale=min(225/iw,160/ih);cell.append(Image(str(imagefile),width=iw*scale,height=ih*scale))
  cell.append(Paragraph(f'<b>{i+1}.</b> '+escape(step['text']),styles['StepText']));cells.append(cell)
 rows=[cells[i:i+2] for i in range(0,len(cells),2)];table=Table(rows,colWidths=[248,248],hAlign='LEFT');table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BOX',(0,0),(-1,-1),.5,colors.HexColor('#cbd5e1')),('INNERGRID',(0,0),(-1,-1),.5,colors.HexColor('#e2e8f0')),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),10)]));flow.append(table)
 if slug!='step-repeat-backdrop':flow.extend([Spacer(1,12),Paragraph('Tension the lower elastic cord if the flag is loose or wrinkled. Use the base selected with your order.',styles['StepText'])])
 flow.extend([Spacer(1,15),Paragraph('Illustrations: B2Sign manufacturer installation instructions. Source checked October 12, 2026.',styles['SmallText']),Paragraph('<link href="'+escape(d['sourceUrl'])+'">'+escape(d['sourceUrl'])+'</link>',styles['SmallText'])])
 SimpleDocTemplate(str(path),pagesize=(612,792),rightMargin=56,leftMargin=56,topMargin=36,bottomMargin=36,title=d['name']+' - assembly guide',author='Banners On The Fly').build(flow)
 d['downloads'].append({'label':d['name']+' printable assembly guide','url':'/downloads/products/'+path.name,'localUrl':'/downloads/products/'+path.name,'kind':'installation','format':'PDF','sourceUrl':d['sourceUrl']})
 doc=fitz.open(path)
 for i,page in enumerate(doc):page.get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save('/tmp/'+slug+'-guide-'+str(i+1)+'.png')
 print(slug,len(doc),'pages',path.stat().st_size)
P.write_text(json.dumps(S,indent=2,ensure_ascii=False)+'\n')
