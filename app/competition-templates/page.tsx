"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import { supabase } from "@/lib/supabase/client";

type TemplateSearchFilters = {
  name: string;
  date: string;
  discipline: string;
  ground: string;
};

type TemplateSearchResult = {
  id: string;
  name: string;
  competition_date: string;
  shooting_ground: string | null;
  discipline: string;
  creator_label: string;
  post_count: number;
  target_count: number;
  is_complete: boolean;
  template_version: number;
  updated_at: string;
};

const emptyFilters: TemplateSearchFilters = { name: "", date: "", discipline: "", ground: "" };

function SearchFilters({ filters, onChange, onSearch }: { filters: TemplateSearchFilters; onChange: (filters: TemplateSearchFilters) => void; onSearch: () => void }) {
  return (
    <div className="card">
      <h1>Competition templates</h1>
      <p className="small muted">Search reusable target setup snapshots. Search is exact/filter-based, not fuzzy or automatic matching.</p>
      <div className="row">
        <div>
          <label>Name</label>
          <input value={filters.name} onChange={(event) => onChange({ ...filters, name: event.target.value })} />
        </div>
        <div>
          <label>Date</label>
          <input type="date" value={filters.date} onChange={(event) => onChange({ ...filters, date: event.target.value })} />
        </div>
        <div>
          <label>Discipline</label>
          <select value={filters.discipline} onChange={(event) => onChange({ ...filters, discipline: event.target.value })}>
            <option value="">Any</option>
            {DISCIPLINE_OPTIONS.map((discipline) => <option key={discipline}>{discipline}</option>)}
          </select>
        </div>
        <div>
          <label>Place</label>
          <input value={filters.ground} onChange={(event) => onChange({ ...filters, ground: event.target.value })} />
        </div>
      </div>
      <button onClick={onSearch}>Search</button>
    </div>
  );
}

function TemplateResultCard({ template }: { template: TemplateSearchResult }) {
  return (
    <div className="subcard">
      <h3>{template.name}</h3>
      <p>{template.competition_date} · {template.shooting_ground || "No ground"} · {template.discipline}</p>
      <p className="small">
        {template.creator_label} · {template.post_count} posts/stands/series · {template.target_count} targets · {template.is_complete ? "Complete" : "Incomplete setup"} · Updated {new Date(template.updated_at).toLocaleDateString()}
      </p>
      <div className="btns">
        <Link className="button secondary" href={`/competition-templates/${template.id}`}>Preview</Link>
        <Link className="button" href={`/competition-templates/${template.id}?use=1`}>Use as starting point</Link>
      </div>
    </div>
  );
}

export default function CompetitionTemplatesPage() {
  const [filters, setFilters] = useState<TemplateSearchFilters>(emptyFilters);
  const [rows, setRows] = useState<TemplateSearchResult[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void search();
  }, []);

  async function search() {
    setMessage("");
    const { data, error } = await supabase.rpc("search_competition_templates", {
      p_name: filters.name || null,
      p_date: filters.date || null,
      p_discipline: filters.discipline || null,
      p_shooting_ground: filters.ground || null,
    });
    if (error) {
      setMessage("Could not search templates right now. Try again when online.");
      return;
    }
    setRows((data || []) as TemplateSearchResult[]);
  }

  return (
    <main>
      <SearchFilters filters={filters} onChange={setFilters} onSearch={search} />
      {message && <div className="card error">{message}</div>}
      <div className="card">
        <h2>Results</h2>
        {rows.length === 0 ? <p className="small muted">No searchable templates found.</p> : rows.map((template) => <TemplateResultCard key={template.id} template={template} />)}
      </div>
    </main>
  );
}
