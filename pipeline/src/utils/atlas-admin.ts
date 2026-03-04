import { fetch } from 'undici';

// ============================================================
// MongoDB Atlas Admin API client — Service Account: OH-VSA-APP
// Uses OAuth 2.0 Client Credentials (mdb_sa_id_* format)
// Permissions: Org Owner, Org Project Creator, Stream Processing Admin
// ============================================================

const ATLAS_TOKEN_URL = 'https://services.cloud.mongodb.com/api/oauth/token';
const ATLAS_API_BASE  = 'https://cloud.mongodb.com/api/atlas/v2';
const ATLAS_API_DATE  = 'application/vnd.atlas.2023-11-15+json';

// ============================================================
// Types
// ============================================================

export interface AtlasOrg {
  id: string;
  name: string;
  isDeleted: boolean;
}

export interface AtlasProject {
  id: string;
  name: string;
  orgId: string;
  created: string;
  clusterCount: number;
}

export interface AtlasCluster {
  id: string;
  name: string;
  groupId: string;
  stateName: string;
  mongoDBVersion: string;
  providerSettings: {
    providerName: string;
    regionName: string;
    instanceSizeName: string;
  };
}

interface CachedToken {
  access_token: string;
  expires_at: number; // ms timestamp
}

// ============================================================
// AtlasAdminClient
// ============================================================

export class AtlasAdminClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly orgId: string;
  private token: CachedToken | null = null;

  constructor(clientId: string, clientSecret: string, orgId: string) {
    this.clientId     = clientId;
    this.clientSecret = clientSecret;
    this.orgId        = orgId;
  }

  // ----------------------------------------------------------
  // OAuth 2.0 — Client Credentials
  // ----------------------------------------------------------

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (refresh 60 s before expiry)
    if (this.token && Date.now() < this.token.expires_at - 60_000) {
      return this.token.access_token;
    }

    const body = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await fetch(ATLAS_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Atlas OAuth failed (${res.status}): ${text}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };

    this.token = {
      access_token: data.access_token,
      expires_at:   Date.now() + data.expires_in * 1000,
    };

    return this.token.access_token;
  }

  // ----------------------------------------------------------
  // Internal request helper
  // ----------------------------------------------------------

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getAccessToken();

    const res = await fetch(`${ATLAS_API_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept':        ATLAS_API_DATE,
        'Content-Type':  'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Atlas API ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  // ----------------------------------------------------------
  // Organization
  // ----------------------------------------------------------

  async getOrganization(): Promise<AtlasOrg> {
    return this.request<AtlasOrg>('GET', `/orgs/${this.orgId}`);
  }

  // ----------------------------------------------------------
  // Projects
  // ----------------------------------------------------------

  async listProjects(): Promise<AtlasProject[]> {
    const res = await this.request<{ results: AtlasProject[] }>('GET', `/orgs/${this.orgId}/groups`);
    return res.results;
  }

  async createProject(name: string): Promise<AtlasProject> {
    return this.request<AtlasProject>('POST', '/groups', { name, orgId: this.orgId });
  }

  // ----------------------------------------------------------
  // Clusters (project-scoped)
  // ----------------------------------------------------------

  async listClusters(projectId: string): Promise<AtlasCluster[]> {
    const res = await this.request<{ results: AtlasCluster[] }>('GET', `/groups/${projectId}/clusters`);
    return res.results;
  }

  // ----------------------------------------------------------
  // Stream Processing (project-scoped)
  // ----------------------------------------------------------

  async listStreamProcessors(projectId: string): Promise<any[]> {
    const res = await this.request<{ results: any[] }>('GET', `/groups/${projectId}/streams`);
    return res.results ?? [];
  }
}

// ============================================================
// Singleton factory (mirrors pattern in clients.ts)
// ============================================================

let atlasAdminClient: AtlasAdminClient | null = null;

export function getAtlasAdmin(): AtlasAdminClient {
  if (!atlasAdminClient) {
    const clientId     = process.env.MONGODB_CLIENT_ID;
    const clientSecret = process.env.MONGODB_CLIENT_SECRET;
    const orgId        = process.env.MONGODB_ORG_ID;

    if (!clientId || !clientSecret || !orgId) {
      throw new Error('Missing MONGODB_CLIENT_ID, MONGODB_CLIENT_SECRET, or MONGODB_ORG_ID');
    }

    atlasAdminClient = new AtlasAdminClient(clientId, clientSecret, orgId);
  }
  return atlasAdminClient;
}

export function closeAtlasAdmin(): void {
  atlasAdminClient = null;
}
