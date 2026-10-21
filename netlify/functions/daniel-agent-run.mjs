import {runWorker} from '../../server/daniel-agent/worker.mjs';
import {environment,allowedHost} from '../../server/daniel-agent/config.mjs';
import {secureEqual} from '../../server/daniel-agent/auth.mjs';
export default async function handler(request){const env=environment();if(!allowedHost(request,env))return new Response('Not found',{status:404});if(request.method!=='POST')return new Response('Method not allowed',{status:405});if(!env.DANIEL_CRON_SECRET||!secureEqual(request.headers.get('authorization'),'Bearer '+env.DANIEL_CRON_SECRET))return new Response('Unauthorized',{status:401});try{return Response.json(await runWorker(env))}catch{return Response.json({error:'Worker failed safely'},{status:500})}}
export const config={path:'/api/internal/daniel-agent/run'};
