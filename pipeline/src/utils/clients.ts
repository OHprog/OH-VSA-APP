import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MongoClient, Db } from 'mongodb';
import FirecrawlApp from '@mendable/firecrawl-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { setGlobalDispatcher, EnvHttpProxyAgent } from 'undici';
import * as net from 'net';
export { getAtlasAdmin, closeAtlasAdmin, AtlasAdminClient } from './atlas-admin';
import { closeAtlasAdmin } from './atlas-admin';

dotenv.config();

// ============================================================
// Corporate proxy setup (reads HTTP_PROXY / HTTPS_PROXY from env)
// ============================================================

const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

if (PROXY) {
  // 1. Route all fetch() calls (Supabase, ARES, AIML) through the proxy
  setGlobalDispatcher(new EnvHttpProxyAgent());

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const netModule = require('net') as typeof net;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tlsModule = require('tls') as typeof import('tls');

  const proxyUrl = new URL(PROXY);
  const proxyHost = proxyUrl.hostname;
  const proxyPort = parseInt(proxyUrl.port) || 8080;

  const MONGO_PORTS = new Set([27017, 27015]);

  // 2. Patch tls.connect for encrypted MongoDB Atlas connections.
  //    Strategy: capture TLSSocket's 'connect' listener BEFORE it registers,
  //    connect plainSocket to the proxy, do CONNECT handshake, THEN restore
  //    TLSSocket's listener and emit 'connect' to trigger the TLS handshake.
  const originalTlsConnect = tlsModule.connect.bind(tlsModule);
  (tlsModule as any).connect = function (options: any, ...rest: any[]) {
    const port: number = typeof options === 'number' ? options : options?.port;
    const tlsOptions = typeof options === 'object' ? options : {};
    const host: string = tlsOptions.host || tlsOptions.servername || 'localhost';

    if (MONGO_PORTS.has(port) && !tlsOptions.socket) {
      const plainSocket = new netModule.Socket();

      // Intercept on/once so we capture TLSSocket's 'connect' listener before it fires
      const deferred: { once: boolean; fn: Function }[] = [];
      const origOn   = plainSocket.on.bind(plainSocket);
      const origOnce = plainSocket.once.bind(plainSocket);
      (plainSocket as any).on   = (ev: string, fn: any) => { if (ev === 'connect') { deferred.push({ once: false, fn }); return plainSocket; } return origOn(ev, fn); };
      (plainSocket as any).once = (ev: string, fn: any) => { if (ev === 'connect') { deferred.push({ once: true,  fn }); return plainSocket; } return origOnce(ev, fn); };

      // Create TLSSocket — its `plainSocket.once('connect', _secureEstablish)` is captured above
      const tlsSocket = new tlsModule.TLSSocket(plainSocket, { ...tlsOptions, isServer: false, servername: tlsOptions.servername || host });

      // Restore normal on/once before we connect
      (plainSocket as any).on   = origOn;
      (plainSocket as any).once = origOnce;

      const cb = typeof rest[0] === 'function' ? rest[0] : undefined;
      if (cb) tlsSocket.once('secureConnect', cb);

      // Connect to proxy
      plainSocket.connect({ host: proxyHost, port: proxyPort }, () => {
        plainSocket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
        let buf = '';
        const onData = (chunk: Buffer) => {
          buf += chunk.toString('ascii');
          if (buf.includes('\r\n\r\n')) {
            plainSocket.removeListener('data', onData);
            if (buf.includes(' 200 ')) {
              // Re-attach TLSSocket's deferred 'connect' listener, then emit to start TLS
              for (const { once, fn } of deferred) {
                once ? plainSocket.once('connect', fn as any) : plainSocket.on('connect', fn as any);
              }
              plainSocket.emit('connect'); // → TLSSocket._secureEstablish → TLS over tunnel
            } else {
              tlsSocket.destroy(new Error(`Proxy CONNECT to MongoDB failed: ${buf.split('\r\n')[0]}`));
            }
          }
        };
        plainSocket.on('data', onData);
      });
      plainSocket.on('error', () => { /* swallow — tlsSocket.destroy handles this */ });

      return tlsSocket;
    }
    return originalTlsConnect(options, ...rest);
  };
}

// ============================================================
// Singleton clients
// ============================================================

let supabaseClient: SupabaseClient | null = null;
let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let firecrawlClient: FirecrawlApp | null = null;
let aimlClient: OpenAI | null = null;

// ============================================================
// Supabase (using service role for backend operations)
// ============================================================

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

// ============================================================
// MongoDB Atlas
// ============================================================

export async function getMongoDB(): Promise<Db> {
  if (!mongoDb) {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME || 'supplier-eval';
    if (!uri) throw new Error('Missing MONGODB_URI');
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    mongoDb = mongoClient.db(dbName);
    console.log(`✅ Connected to MongoDB: ${dbName}`);
  }
  return mongoDb;
}

export async function closeMongoDB(): Promise<void> {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    mongoDb = null;
  }
}

// ============================================================
// FireCrawl
// ============================================================

export function getFireCrawl(): FirecrawlApp {
  if (!firecrawlClient) {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error('Missing FIRECRAWL_API_KEY');
    firecrawlClient = new FirecrawlApp({ apiKey });
  }
  return firecrawlClient;
}

// ============================================================
// AIML API (OpenAI-compatible for embeddings)
// ============================================================

export function getAIML(): OpenAI {
  if (!aimlClient) {
    const apiKey = process.env.AIML_API_KEY;
    const baseURL = process.env.AIML_BASE_URL || 'https://api.aimlapi.com/v1';
    if (!apiKey) throw new Error('Missing AIML_API_KEY');
    aimlClient = new OpenAI({ apiKey, baseURL });
  }
  return aimlClient;
}

// ============================================================
// Cleanup
// ============================================================

export async function closeAll(): Promise<void> {
  await closeMongoDB();
  closeAtlasAdmin();
  supabaseClient = null;
  firecrawlClient = null;
  aimlClient = null;
}
