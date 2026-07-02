"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { CompetitionTemplateCandidate, CompetitionTemplateSuggestionMetadata } from "@/app/components/CompetitionTemplateSuggestions";

type CandidateSearchKey = {
  name: string;
  competitionDate: string;
  shootingGround: string;
  discipline: string;
  targetCount: number | null;
};

function normalizeKey(metadata: CompetitionTemplateSuggestionMetadata): CandidateSearchKey {
  return {
    name: metadata.name.trim(),
    competitionDate: metadata.competitionDate,
    shootingGround: metadata.shootingGround.trim(),
    discipline: metadata.discipline,
    targetCount: metadata.targetCount,
  };
}

export function useCompetitionTemplateCandidates(metadata: CompetitionTemplateSuggestionMetadata) {
  const [candidates, setCandidates] = useState<CompetitionTemplateCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const requestId = useRef(0);
  const key = useMemo(() => normalizeKey(metadata), [metadata.name, metadata.competitionDate, metadata.shootingGround, metadata.discipline, metadata.targetCount]);
  const keyString = JSON.stringify(key);
  const canFind = Boolean(key.discipline && key.competitionDate);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    requestId.current += 1;
    setCandidates([]);
    setError("");
    setLoading(false);
  }, [keyString]);

  async function findCandidates() {
    if (!canFind || loading) return;
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setLoading(true);
    setError("");
    const { data, error } = await supabase.rpc("find_competition_template_candidates", {
      p_name: key.name || null,
      p_competition_date: key.competitionDate,
      p_shooting_ground: key.shootingGround || null,
      p_discipline: key.discipline,
      p_target_count: key.targetCount,
      p_limit: 5,
    });
    if (!mounted.current || requestId.current !== currentRequest) return;
    setLoading(false);
    if (error) {
      setError("Could not check for shared setups. You can continue without one.");
      setCandidates([]);
      return;
    }
    setCandidates(((data || []) as CompetitionTemplateCandidate[]).filter((candidate) => candidate.discipline === key.discipline));
  }

  return { candidates, loading, error, canFind, findCandidates, searchKey: keyString };
}
