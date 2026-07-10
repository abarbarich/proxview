import { create } from 'zustand';
import { api } from '../lib/api';
import type { SitePublic } from '../types';

export interface SiteFormInput {
  name: string;
  kind: 'pve' | 'pbs';
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  tlsVerify: boolean;
  // Optional SSH config for temperature collection
  sshHost?: string;
  sshUser?: string;
  sshPort?: string;
  sshKey?: string;
}

/** Normalise form strings into the API shape (empty → null, port → number). */
function payload(input: SiteFormInput) {
  return {
    name: input.name,
    kind: input.kind,
    baseUrl: input.baseUrl,
    tokenId: input.tokenId,
    tokenSecret: input.tokenSecret,
    tlsVerify: input.tlsVerify,
    sshHost: input.sshHost?.trim() || null,
    sshUser: input.sshUser?.trim() || null,
    sshPort: input.sshPort ? Number(input.sshPort) : null,
    sshKey: input.sshKey?.trim() || null,
  };
}

export interface TestResult {
  ok: boolean;
  message: string;
}

interface SitesState {
  sites: SitePublic[];
  loaded: boolean;
  load: () => Promise<void>;
  test: (input: SiteFormInput) => Promise<TestResult>;
  create: (input: SiteFormInput) => Promise<{ site: SitePublic; test: TestResult }>;
  update: (id: number, input: SiteFormInput) => Promise<{ site: SitePublic; test: TestResult }>;
  remove: (id: number, cleanup?: boolean) => Promise<void>;
  importConfig: (sites: unknown[], replace: boolean) => Promise<number>;
}

export const useSites = create<SitesState>((set, get) => ({
  sites: [],
  loaded: false,

  async load() {
    const data = await api.get<{ sites: SitePublic[] }>('/api/sites');
    set({ sites: data.sites, loaded: true });
  },

  test(input) {
    return api.post<TestResult>('/api/sites/test', payload(input));
  },

  async create(input) {
    const res = await api.post<{ site: SitePublic; test: TestResult }>('/api/sites', payload(input));
    set({ sites: [...get().sites, res.site].sort((a, b) => a.name.localeCompare(b.name)) });
    return res;
  },

  async update(id, input) {
    const res = await api.put<{ site: SitePublic; test: TestResult }>(
      `/api/sites/${id}`,
      payload(input),
    );
    set({
      sites: get()
        .sites.map((s) => (s.id === id ? res.site : s))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
    return res;
  },

  async remove(id, cleanup = false) {
    await api.del(`/api/sites/${id}${cleanup ? '?cleanup=1' : ''}`);
    set({ sites: get().sites.filter((s) => s.id !== id) });
  },

  async importConfig(sites, replace) {
    const res = await api.post<{ ok: boolean; imported: number }>('/api/config/import', {
      sites,
      replace,
    });
    await get().load();
    return res.imported;
  },
}));
