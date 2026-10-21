export {handler as default} from '../../server/daniel-agent/api.mjs';
export const config={path:['/daniel','/daniel/','/api/daniel/*'],rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:180}};
