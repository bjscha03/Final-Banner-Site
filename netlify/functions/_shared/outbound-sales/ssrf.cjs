'use strict';

const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const { domainToASCII } = require('node:url');

const MAX_WEBSITE_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 8000;
const ALLOWED_CONTENT_TYPES = new Set(['text/html', 'application/xhtml+xml', 'text/plain']);
const BLOCKED_HOST_SUFFIXES = Object.freeze([
  '.localhost', '.local', '.internal', '.home.arpa', '.onion', '.test', '.example', '.invalid',
]);

function ssrfError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function ipv4Number(address) {
  const parts = String(address).split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return parts.reduce((value, part) => ((value * 256) + Number(part)) >>> 0, 0) >>> 0;
}

function ipv4InCidr(address, network, prefix) {
  const value = ipv4Number(address);
  const base = ipv4Number(network);
  if (value === null || base === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function ipv6Bytes(address) {
  let source = String(address || '').toLowerCase();
  if (source.includes('%')) return null;
  if (source.includes('.')) {
    const lastColon = source.lastIndexOf(':');
    const v4 = ipv4Number(source.slice(lastColon + 1));
    if (v4 === null) return null;
    source = `${source.slice(0, lastColon)}:${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  if ((source.match(/::/g) || []).length > 1) return null;
  const [leftRaw, rightRaw = ''] = source.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  const omitted = 8 - left.length - right.length;
  if (omitted < 0 || (!source.includes('::') && omitted !== 0)) return null;
  const groups = [...left, ...Array(omitted).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  const bytes = [];
  for (const group of groups) {
    const value = Number.parseInt(group, 16);
    bytes.push(value >>> 8, value & 0xff);
  }
  return bytes;
}

function mappedIpv4(bytes) {
  if (!bytes || bytes.length !== 16) return null;
  const prefixIsMapped = bytes.slice(0, 10).every((value) => value === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (!prefixIsMapped) return null;
  return bytes.slice(12).join('.');
}

function ipv6InPrefix(bytes, networkAddress, prefixLength) {
  const network = ipv6Bytes(networkAddress);
  if (!bytes || !network || prefixLength < 0 || prefixLength > 128) return false;
  const wholeBytes = Math.floor(prefixLength / 8);
  const remainingBits = prefixLength % 8;
  for (let index = 0; index < wholeBytes; index += 1) {
    if (bytes[index] !== network[index]) return false;
  }
  if (!remainingBits) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (bytes[wholeBytes] & mask) === (network[wholeBytes] & mask);
}

function isPublicIp(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const blocked = [
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
      ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
      ['224.0.0.0', 4], ['240.0.0.0', 4],
    ];
    return !blocked.some(([network, prefix]) => ipv4InCidr(address, network, prefix));
  }
  if (family === 6) {
    const bytes = ipv6Bytes(address);
    if (!bytes) return false;
    const v4 = mappedIpv4(bytes);
    if (v4) return isPublicIp(v4);
    // Only globally routable unicast space is allowed. This excludes loopback,
    // unique-local, link-local, multicast, unspecified, and transition space.
    if ((bytes[0] & 0xe0) !== 0x20) return false;
    const reservedGlobalPrefixes = [
      ['2001::', 32], // Teredo and protocol assignments.
      ['2001:2::', 48], // Benchmarking.
      ['2001:10::', 28], // Deprecated ORCHID.
      ['2001:20::', 28], // ORCHIDv2.
      ['2001:db8::', 32], // Documentation.
      ['2002::', 16], // 6to4 transition space.
      ['3fff::', 20], // Documentation.
    ];
    if (reservedGlobalPrefixes.some(([network, prefix]) => ipv6InPrefix(bytes, network, prefix))) return false;
    return true;
  }
  return false;
}

function normalizeWebsiteUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw ssrfError('WEBSITE_URL_INVALID', 'Website URL is invalid.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw ssrfError('WEBSITE_PROTOCOL_BLOCKED', 'Only HTTP and HTTPS websites are supported.');
  if (url.username || url.password) throw ssrfError('WEBSITE_CREDENTIALS_BLOCKED', 'Website URLs cannot contain credentials.');
  const expectedPort = url.protocol === 'https:' ? '443' : '80';
  if (url.port && url.port !== expectedPort) throw ssrfError('WEBSITE_PORT_BLOCKED', 'Non-standard website ports are blocked.');
  const hostname = domainToASCII(url.hostname.toLowerCase().replace(/\.$/, ''));
  if (!hostname || hostname.length > 253) throw ssrfError('WEBSITE_HOST_INVALID', 'Website hostname is invalid.');
  if (net.isIP(hostname)) throw ssrfError('WEBSITE_IP_LITERAL_BLOCKED', 'IP-literal website URLs are blocked.');
  if (hostname === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw ssrfError('WEBSITE_HOST_BLOCKED', 'Private or reserved website hostnames are blocked.');
  }
  url.hostname = hostname;
  url.hash = '';
  return url;
}

async function resolvePublicHost(hostname, lookup = dns.lookup) {
  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw ssrfError('WEBSITE_DNS_FAILED', 'Website DNS lookup failed.');
  }
  const normalized = (Array.isArray(records) ? records : [records])
    .map((record) => ({ address: record?.address, family: Number(record?.family) }))
    .filter((record) => record.address && [4, 6].includes(record.family));
  if (!normalized.length) throw ssrfError('WEBSITE_DNS_EMPTY', 'Website DNS returned no usable addresses.');
  if (normalized.some((record) => !isPublicIp(record.address))) {
    throw ssrfError('WEBSITE_PRIVATE_ADDRESS_BLOCKED', 'Website DNS resolved to a private or reserved address.');
  }
  return normalized;
}

function sameAddress(left, right) {
  if (left === right) return true;
  const leftBytes = ipv6Bytes(left);
  const rightBytes = ipv6Bytes(right);
  const leftV4 = mappedIpv4(leftBytes);
  const rightV4 = mappedIpv4(rightBytes);
  if (leftV4 || rightV4) return (leftV4 || left) === (rightV4 || right);
  return Boolean(leftBytes && rightBytes && leftBytes.every((value, index) => value === rightBytes[index]));
}

function boundedHeader(value, maxLength = 2048) {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' ? text.slice(0, maxLength) : null;
}

function defaultRequest(url, options, onResponse) {
  return (url.protocol === 'https:' ? https : http).request(url, options, onResponse);
}

async function fetchWebsitePage(value, options = {}) {
  const maxBytes = Math.max(1024, Math.min(MAX_WEBSITE_BYTES, Number(options.maxBytes) || MAX_WEBSITE_BYTES));
  const requestedRedirects = Number(options.maxRedirects);
  const maxRedirects = Number.isFinite(requestedRedirects)
    ? Math.max(0, Math.min(MAX_REDIRECTS, requestedRedirects))
    : MAX_REDIRECTS;
  const timeoutMs = Math.max(500, Math.min(30000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS));
  const lookup = options.lookup || dns.lookup;
  const requestImpl = options.requestImpl || defaultRequest;
  const headers = {
    Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5',
    'Accept-Encoding': 'identity',
    'Cache-Control': 'no-cache',
    'User-Agent': 'BannersOnTheFly-ResearchBot/2.0 (+https://bannersonthefly.com)',
  };
  if (options.etag) headers['If-None-Match'] = String(options.etag).slice(0, 500);
  if (options.lastModified) headers['If-Modified-Since'] = String(options.lastModified).slice(0, 200);

  async function attempt(input, redirectsRemaining) {
    const url = normalizeWebsiteUrl(input);
    const approvedAddresses = await resolvePublicHost(url.hostname, lookup);
    const pinned = approvedAddresses[0];
    const response = await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, result) => {
        if (settled) return;
        settled = true;
        callback(result);
      };
      const request = requestImpl(url, {
        method: 'GET',
        headers,
        servername: url.hostname,
        lookup(_hostname, _lookupOptions, callback) {
          callback(null, pinned.address, pinned.family);
        },
      }, (incoming) => {
        const remoteAddress = incoming.socket?.remoteAddress;
        if (!remoteAddress || !isPublicIp(remoteAddress) || !sameAddress(remoteAddress, pinned.address)) {
          incoming.destroy();
          finish(reject, ssrfError('WEBSITE_CONNECTION_ADDRESS_MISMATCH', 'Website connection did not use the approved public address.'));
          return;
        }
        finish(resolve, incoming);
      });
      request.setTimeout(timeoutMs, () => request.destroy(ssrfError('WEBSITE_TIMEOUT', 'Website request timed out.')));
      request.on('error', (error) => finish(reject, error?.code?.startsWith?.('WEBSITE_') ? error : ssrfError('WEBSITE_FETCH_FAILED', 'Website request failed.')));
      request.end();
    });

    const status = Number(response.statusCode) || 0;
    const location = boundedHeader(response.headers.location);
    if ([301, 302, 303, 307, 308].includes(status)) {
      response.resume();
      if (!location || redirectsRemaining <= 0) throw ssrfError('WEBSITE_REDIRECT_BLOCKED', 'Website redirect limit was reached.');
      let next;
      try { next = new URL(location, url); } catch { throw ssrfError('WEBSITE_REDIRECT_INVALID', 'Website returned an invalid redirect.'); }
      if (url.protocol === 'https:' && next.protocol === 'http:') {
        throw ssrfError('WEBSITE_REDIRECT_DOWNGRADE_BLOCKED', 'HTTPS-to-HTTP website redirects are blocked.');
      }
      return attempt(next.toString(), redirectsRemaining - 1);
    }

    const rawContentType = boundedHeader(response.headers['content-type'], 200) || '';
    const contentType = rawContentType.split(';')[0].trim().toLowerCase();
    if (status === 304) {
      response.resume();
      return {
        status, finalUrl: url.toString(), contentType: null, body: null, bytes: 0, notModified: true,
        etag: boundedHeader(response.headers.etag, 500),
        lastModified: boundedHeader(response.headers['last-modified'], 200),
      };
    }
    if (status < 200 || status >= 300) {
      response.resume();
      throw ssrfError('WEBSITE_HTTP_REJECTED', `Website returned HTTP ${status}.`);
    }
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      response.resume();
      throw ssrfError('WEBSITE_CONTENT_TYPE_BLOCKED', 'Website content type is not safe for text extraction.');
    }
    const declaredLength = Number(response.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      response.destroy();
      throw ssrfError('WEBSITE_RESPONSE_TOO_LARGE', 'Website response exceeded the byte limit.');
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        response.destroy();
        throw ssrfError('WEBSITE_RESPONSE_TOO_LARGE', 'Website response exceeded the byte limit.');
      }
      chunks.push(chunk);
    }
    return {
      status,
      finalUrl: url.toString(),
      contentType,
      body: Buffer.concat(chunks).toString('utf8'),
      bytes,
      notModified: false,
      etag: boundedHeader(response.headers.etag, 500),
      lastModified: boundedHeader(response.headers['last-modified'], 200),
    };
  }

  return attempt(value, maxRedirects);
}

module.exports = {
  MAX_WEBSITE_BYTES,
  MAX_REDIRECTS,
  ALLOWED_CONTENT_TYPES,
  isPublicIp,
  normalizeWebsiteUrl,
  resolvePublicHost,
  fetchWebsitePage,
};
