import {createHash, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv} from 'node:crypto';
export const hash=s=>createHash('sha256').update(String(s)).digest('hex');
export function secureEqual(a,b){return timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));}
export function cookies(req){return Object.fromEntries((req.headers.get('cookie')||'').split(';').map(x=>x.trim().split('=')));}
export async function session(req,sql){const raw=cookies(req).daniel_session;if(!raw)return null;const [s]=await sql`SELECT actor,token_hash FROM daniel_sales.sessions WHERE token_hash=${hash(raw)} AND expires_at>now()`;return s||null;}
export async function login(req,sql,env,ip='unknown'){
 const {password}=await req.json(); const ipHash=hash(ip);
 const [rate]=await sql`INSERT INTO daniel_sales.login_attempts(ip_hash,attempts) VALUES(${ipHash},1) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN daniel_sales.login_attempts.window_start < now()-interval '15 minutes' THEN 1 ELSE daniel_sales.login_attempts.attempts+1 END,window_start=CASE WHEN daniel_sales.login_attempts.window_start < now()-interval '15 minutes' THEN now() ELSE daniel_sales.login_attempts.window_start END RETURNING attempts`;
 if(rate.attempts>10)return {status:429,error:'Too many attempts. Try again in 15 minutes.'};
 const expected=env.DANIEL_ADMIN_PASSWORD||env.ADMIN_PASSWORD;
 if(!expected||typeof password!=='string'||!secureEqual(password,expected))return {status:401,error:'Incorrect password'};
 const token=randomBytes(32).toString('base64url');
 await sql`INSERT INTO daniel_sales.sessions(token_hash,actor,expires_at) VALUES(${hash(token)},'Brandon',now()+interval '8 hours')`;
 await sql`DELETE FROM daniel_sales.login_attempts WHERE ip_hash=${ipHash}`;
 return {status:200,token};
}
export function seal(text,secret){if(!secret||secret.length<32)throw Error('Encryption key unavailable');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(hash(secret),'hex'),iv);return Buffer.concat([iv,cipher.update(text),cipher.final(),cipher.getAuthTag()]).toString('base64url');}
export function unseal(text,secret){const b=Buffer.from(text,'base64url'),dec=createDecipheriv('aes-256-gcm',Buffer.from(hash(secret),'hex'),b.subarray(0,12));dec.setAuthTag(b.subarray(-16));return Buffer.concat([dec.update(b.subarray(12,-16)),dec.final()]).toString();}
export function cookie(token,maxAge=28800){return `daniel_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;}
