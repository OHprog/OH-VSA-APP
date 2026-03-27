import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RefCountry {
  code: string;
  name: string;
  sort_order: number;
}

export interface RefSector {
  name: string;
  sort_order: number;
}

export interface RefPrompt {
  id: number;
  prompt: string;
  sort_order: number;
}

// Module-level cache so all consumers share one fetch per session
let cache: {
  countries: RefCountry[];
  sectors: RefSector[];
  prompts: RefPrompt[];
} | null = null;

let fetchPromise: Promise<typeof cache> | null = null;

async function loadAll() {
  if (cache) return cache;
  if (fetchPromise) return fetchPromise;

  fetchPromise = Promise.all([
    supabase.from("ref_countries").select("code, name, sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("ref_sectors").select("name, sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("ref_prompts").select("id, prompt, sort_order").eq("is_active", true).order("sort_order"),
  ]).then(([countries, sectors, prompts]) => {
    cache = {
      countries: (countries.data ?? []) as RefCountry[],
      sectors: (sectors.data ?? []) as RefSector[],
      prompts: (prompts.data ?? []) as RefPrompt[],
    };
    fetchPromise = null;
    return cache;
  });

  return fetchPromise;
}

export function useReferenceData() {
  const [countries, setCountries] = useState<RefCountry[]>(cache?.countries ?? []);
  const [sectors, setSectors] = useState<RefSector[]>(cache?.sectors ?? []);
  const [prompts, setPrompts] = useState<RefPrompt[]>(cache?.prompts ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    loadAll().then((data) => {
      if (!data) return;
      setCountries(data.countries);
      setSectors(data.sectors);
      setPrompts(data.prompts);
      setLoading(false);
    });
  }, []);

  return { countries, sectors, prompts, loading };
}
