import {environment,mode} from '../../server/daniel-agent/config.mjs';
import {runWorker} from '../../server/daniel-agent/worker.mjs';
export default async function(){const env=environment();if(mode(env)!=='live')return;await runWorker(env);}
export const config={schedule:'*/15 * * * *'};
