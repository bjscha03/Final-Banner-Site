const endpoint='https://gmail.googleapis.com/gmail/v1/users/me';
export async function accessToken(env=process.env){
 for(const key of ['DANIEL_GOOGLE_CLIENT_ID','DANIEL_GOOGLE_CLIENT_SECRET','DANIEL_GOOGLE_REFRESH_TOKEN'])if(!env[key])throw Error(key+' missing');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.DANIEL_GOOGLE_CLIENT_ID,client_secret:env.DANIEL_GOOGLE_CLIENT_SECRET,refresh_token:env.DANIEL_GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'})});
 if(!r.ok)throw Error('Gmail OAuth token unavailable: '+r.status);return (await r.json()).access_token;
}
export async function gmailRequest(token,path,options={}){const r=await fetch(endpoint+path,{...options,headers:{authorization:'Bearer '+token,...options.headers}});if(!r.ok)throw Error('Gmail request '+r.status);return r.json()}
export function encodeMime({from,to,subject,html,replyTo,messageId,references}){
 const clean=s=>String(s||'').replace(/[\r\n]/g,' ').trim();
 const headers=[`From: ${clean(from)}`,`To: ${clean(to)}`,`Subject: =?UTF-8?B?${Buffer.from(clean(subject)).toString('base64')}?=`,'MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64'];
 if(replyTo)headers.push('Reply-To: '+clean(replyTo));
 if(messageId)headers.push('In-Reply-To: '+clean(messageId));
 if(references)headers.push('References: '+clean(references));
 const mime=headers.join('\r\n')+'\r\n\r\n'+Buffer.from(html).toString('base64');
 return Buffer.from(mime).toString('base64url');
}
export async function sendGmail(token,message){return gmailRequest(token,'/messages/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({raw:encodeMime(message),threadId:message.threadId})})}
export async function listGmail(token,query,maxResults=50){return gmailRequest(token,'/messages?'+new URLSearchParams({q:query,maxResults:String(maxResults)}))}
export async function getGmail(token,id){return gmailRequest(token,'/messages/'+encodeURIComponent(id)+'?format=full')}
export function header(message,name){return message.payload?.headers?.find(h=>h.name.toLowerCase()===name.toLowerCase())?.value||''}
export function bodyText(message){const parts=[];function walk(p){if(p.mimeType==='text/plain'&&p.body?.data)parts.push(Buffer.from(p.body.data,'base64url').toString('utf8'));for(const x of p.parts||[])walk(x)}walk(message.payload||{});return parts.join('\n').slice(0,12000)}
