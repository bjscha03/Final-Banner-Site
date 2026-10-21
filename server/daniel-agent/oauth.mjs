import {randomBytes,createHash} from 'node:crypto';
import {hash,seal} from './auth.mjs';
import {gmailRequest} from './gmail.mjs';
import {audit} from './store.mjs';
export async function oauthStart(sql,env,session){
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
 await sql`INSERT INTO daniel_sales.oauth_states(state_hash,session_hash,verifier,expires_at) VALUES(${hash(state)},${session.token_hash},${verifier},now()+interval '10 minutes')`;
 const q=new URLSearchParams({client_id:env.DANIEL_GOOGLE_CLIENT_ID||env.GOOGLE_CLIENT_ID,redirect_uri:`https://${env.DANIEL_ALLOWED_HOST}/api/daniel/oauth/callback`,response_type:'code',scope:'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.settings.basic',access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
 return {url:'https://accounts.google.com/o/oauth2/v2/auth?'+q};
}
export async function oauthComplete(req,sql,env,session){const u=new URL(req.url);if(u.searchParams.has('error'))throw Error('Google authorization was declined');const state=u.searchParams.get('state'),code=u.searchParams.get('code');if(!state||!code)throw Error('Missing OAuth callback parameters');
 const [saved]=await sql`DELETE FROM daniel_sales.oauth_states WHERE state_hash=${hash(state)} AND session_hash=${session.token_hash} AND expires_at>now() RETURNING verifier`;if(!saved)throw Error('OAuth state expired or invalid');
 const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(15000),body:new URLSearchParams({client_id:env.DANIEL_GOOGLE_CLIENT_ID||env.GOOGLE_CLIENT_ID,client_secret:env.DANIEL_GOOGLE_CLIENT_SECRET||env.GOOGLE_CLIENT_SECRET,code,code_verifier:saved.verifier,grant_type:'authorization_code',redirect_uri:`https://${env.DANIEL_ALLOWED_HOST}/api/daniel/oauth/callback`})});
 if(!res.ok)throw Error('Google could not complete authorization');const tokens=await res.json();if(!tokens.refresh_token)throw Error('Google did not issue offline access. Reconnect with consent.');
 const scopes=new Set(String(tokens.scope||'').split(' '));if(!scopes.has('https://www.googleapis.com/auth/gmail.readonly')||!scopes.has('https://www.googleapis.com/auth/gmail.send'))throw Error('Both Gmail read and send permissions are required');
 const profile=await gmailRequest(tokens.access_token,'/profile');const aliases=await gmailRequest(tokens.access_token,'/settings/sendAs');
 const sender=env.DANIEL_SENDER_EMAIL||'info@bannersonthefly.com';if(!aliases.sendAs?.some(x=>x.sendAsEmail.toLowerCase()===sender.toLowerCase()&&x.verificationStatus==='accepted'))throw Error('Authorize a mailbox with the verified BOF sender '+sender);
 await sql`INSERT INTO daniel_sales.mailbox(id,email,encrypted_refresh_token) VALUES(1,${profile.emailAddress},${seal(tokens.refresh_token,env.DANIEL_SESSION_SECRET)}) ON CONFLICT(id) DO UPDATE SET email=excluded.email,encrypted_refresh_token=excluded.encrypted_refresh_token,history_id=NULL,page_token=NULL,sync_start_history=NULL,last_error=NULL`;
 await audit(sql,session.actor,'gmail_connected','mailbox',1,{email:profile.emailAddress});return profile.emailAddress;
}
