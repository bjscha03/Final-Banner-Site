import fontkit from '@pdf-lib/fontkit';
import {PDFDocument,PDFName,PDFNumber,rgb,pushGraphicsState,popGraphicsState,concatTransformationMatrix} from 'pdf-lib';

/** The guide uses the same dimensions, outline and safety guides as the editor. */
export async function createSpecialtyTemplateGuide(template, title, fonts) {
  const scale=template.exportScale||1;
  if (![template.widthIn,template.heightIn,scale].every(n=>Number.isFinite(n)&&n>0)) throw new Error('Choose valid artwork dimensions.');
  const userUnit=Math.max(1,Math.max(template.widthIn,template.heightIn)*72*scale/14400);
  const width=template.widthIn*72*scale/userUnit,height=template.heightIn*72*scale/userUnit;
  const doc=await PDFDocument.create();
  doc.setTitle(`${title} - artwork guide`);doc.setAuthor('Banners On The Fly');
  doc.registerFontkit(fontkit);
  const font=await doc.embedFont(fonts.regular,{subset:true});
  const bold=await doc.embedFont(fonts.bold,{subset:true});
  const page=doc.addPage([width,height]);
  if(userUnit>1)page.node.set(PDFName.of('UserUnit'),PDFNumber.of(userUnit));
  const ink=rgb(.043,.122,.227),safe=rgb(.1,.55,.68),orange=rgb(.79,.306,0);
  page.drawRectangle({x:0,y:0,width,height,color:rgb(1,1,1)});
  const path=(d,color,dashed=false)=>{
    page.pushOperators(pushGraphicsState(),concatTransformationMatrix(width/100,0,0,height/100,0,0));
    page.drawSvgPath(d,{x:0,y:100,borderColor:color,borderWidth:100/Math.max(width,height),borderDashArray:dashed?[.8,.5]:undefined});
    page.pushOperators(popGraphicsState());
  };
  path(template.outline||'M0 0H100V100H0Z',orange);
  for(const guide of template.guides||[])path(guide.d,safe,guide.dashed);
  if(!template.guides?.length){
    const [top,right,bottom,left]=template.safeInsetsIn||[.5,.5,.5,.5];
    page.drawRectangle({x:left*72*scale/userUnit,y:bottom*72*scale/userUnit,width:Math.max(1,width-(left+right)*72*scale/userUnit),height:Math.max(1,height-(top+bottom)*72*scale/userUnit),borderColor:safe,borderWidth:1,borderDashArray:[5,4]});
  }
  for(const [name,face] of Object.entries(template.faces||{})){
    const x=face[0]*width,y=height-(face[1]+face[3])*height,w=face[2]*width,h=face[3]*height;
    page.drawRectangle({x,y,width:w,height:h,borderColor:safe,borderWidth:1,borderDashArray:[5,4]});
    page.drawText(name.toUpperCase(),{x:x+10,y:y+h-22,font:bold,size:Math.min(14,w/8),color:safe});
  }
  const size=Math.max(7,Math.min(22,width/30)),margin=Math.max(12,width*.065);
  const clean=s=>String(s).replace(/[^\x20-\x7E]/g,' ');
  const lines=['BANNERS ON THE FLY',clean(title),`${template.widthIn} x ${template.heightIn} inches at finished size`,scale===1?'PDF scale: 100% (1:1)':`PDF scale: ${scale*100}% (1:${1/scale})`,'Orange: print boundary. Blue: safe area / fold guides.','REMOVE ALL GUIDE MARKS BEFORE UPLOADING PRINT ARTWORK.'];
  let y=height*.61;
  for(const line of lines){
    const f=line===lines[0]?bold:font;const fit=Math.min(size,(width-margin*2)/Math.max(1,f.widthOfTextAtSize(line,1)));
    page.drawText(line,{x:margin,y,font:f,size:fit,color:ink});y-=size*1.65;
  }
  const info=doc.addPage([612,792]);
  info.drawText('Artwork setup',{x:48,y:734,font:bold,size:24,color:ink});
  const paragraphs=[clean(title),`Finished artwork: ${template.widthIn} x ${template.heightIn} in. PDF scale: ${scale*100}%.`,clean(template.fitNotes||''),'Keep text and logos inside the safe area. Extend backgrounds to the full print boundary.','Delete the guide artwork before exporting your print file. Export a single-page PDF, JPG or PNG for each selected print panel. This two-page guide is a setup aid, not a print-ready upload.'];
  let row=695;
  for(const paragraph of paragraphs){let line='';for(const word of paragraph.split(' ')){if(font.widthOfTextAtSize((line+' '+word).trim(),11)>510){info.drawText(line,{x:48,y:row,font,size:11,color:ink});row-=17;line=word;}else line=(line+' '+word).trim();}if(line){info.drawText(line,{x:48,y:row,font,size:11,color:ink});row-=17;}row-=17;}
  return doc.save();
}
