import {unseal} from './auth.mjs';
const endpoint='https://gmail.googleapis.com/gmail/v1/users/me';
export async function accessToken(env=process.env,sql){
 let refresh=env.DANIEL_GOOGLE_REFRESH_TOKEN;
 if(sql){const [box]=await sql`SELECT encrypted_refresh_token FROM daniel_sales.mailbox WHERE id=1`;if(box?.encrypted_refresh_token)refresh=unseal(box.encrypted_refresh_token,env.DANIEL_SESSION_SECRET);}
 if(!refresh)throw Object.assign(Error('Connect Gmail to authorize this dedicated agent.'),{status:409});
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(15000),body:new URLSearchParams({client_id:env.DANIEL_GOOGLE_CLIENT_ID||env.GOOGLE_CLIENT_ID,client_secret:env.DANIEL_GOOGLE_CLIENT_SECRET||env.GOOGLE_CLIENT_SECRET,refresh_token:refresh,grant_type:'refresh_token'})});
 if(!r.ok)throw Error('Gmail authorization needs attention ('+r.status+')');return (await r.json()).access_token;
}
export async function gmailRequest(token,path,options={}){const r=await fetch(endpoint+path,{...options,signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+token,...options.headers}});if(!r.ok)throw Object.assign(Error('Gmail request failed ('+r.status+')'),{status:r.status});return r.json();}
export function encodeMime({from,to,subject,html,replyTo,messageId,references,rfcMessageId}){
 const clean=s=>String(s||'').replace(/[\r\n]/g,' ').trim();
 const headers=[`From: ${clean(from)}`,`To: ${clean(to)}`,`Subject: =?UTF-8?B?${Buffer.from(clean(subject)).toString('base64')}?=`,'MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64'];
 if(replyTo)headers.push('Reply-To: '+clean(replyTo));
 if(rfcMessageId)headers.push('Message-ID: '+clean(rfcMessageId));
 if(messageId)headers.push('In-Reply-To: '+clean(messageId));
 if(references)headers.push('References: '+clean(references));
 return Buffer.from(headers.join('\r\n')+'\r\n\r\n'+Buffer.from(html).toString('base64').match(/.{1,76}/g).join('\r\n')).toString('base64url');
}
export async function sendGmail(token,message){return gmailRequest(token,'/messages/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({raw:encodeMime(message),threadId:message.threadId||undefined})});}
export async function listGmail(token,query,maxResults=50,pageToken){return gmailRequest(token,'/messages?'+new URLSearchParams({q:query,maxResults:String(maxResults),...(pageToken?{pageToken}:{})}));}
export async function getGmail(token,id){return gmailRequest(token,'/messages/'+encodeURIComponent(id)+'?format=full');}
export function header(message,name){return message.payload?.headers?.find(h=>h.name.toLowerCase()===name.toLowerCase())?.value||'';}
export function bodyText(message){const plain=[],html=[];function walk(p){if(p.body?.data){const s=Buffer.from(p.body.data,'base64url').toString('utf8');if(p.mimeType==='text/plain')plain.push(s);if(p.mimeType==='text/html')html.push(s.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' '));}for(const x of p.parts||[])walk(x)}walk(message.payload||{});return (plain.length?plain:html).join('\n').slice(0,12000);}
