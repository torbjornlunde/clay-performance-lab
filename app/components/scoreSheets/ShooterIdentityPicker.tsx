"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCountryLabel } from "@/lib/profile";
import {
  canSearchShooterDirectory,
  identityAlreadyLinked,
  mergeOwnProfileSuggestion,
  normalizeShooterDirectoryQuery,
  type ShooterDirectorySuggestion,
} from "@/lib/scoreSheets/shooterIdentity";
import { supabase } from "@/lib/supabase/client";

type Props = {
  label: string;
  value: string;
  linkedUserId: string | null;
  ownSuggestion: ShooterDirectorySuggestion | null;
  shooters: Array<{ localId: string; linkedUserId: string | null }>;
  localId?: string;
  disabled?: boolean;
  placeholder: string;
  onNameChange: (name: string) => void;
  onSelect: (suggestion: ShooterDirectorySuggestion) => void;
  onUnlink?: () => void;
  onEnter?: () => void;
};

export default function ShooterIdentityPicker(props: Props) {
  const [changeLink, setChangeLink] = useState(false);
  const [suggestions, setSuggestions] = useState<ShooterDirectorySuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const requestRef = useRef(0);
  const searchEnabled = !props.disabled && (!props.linkedUserId || changeLink);
  const query = useMemo(() => normalizeShooterDirectoryQuery(props.value), [props.value]);

  useEffect(() => {
    const request = ++requestRef.current;
    if (!searchEnabled || !canSearchShooterDirectory(query)) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSuggestions(mergeOwnProfileSuggestion(query, props.ownSuggestion, []));
      setMessage("Shooter search unavailable offline — continue as guest.");
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setMessage("");
      const { data, error } = await supabase.rpc("search_shooter_directory", { search_text: query, result_limit: 8 });
      if (request !== requestRef.current) return;
      setSearching(false);
      if (error) {
        setSuggestions(mergeOwnProfileSuggestion(query, props.ownSuggestion, []));
        setMessage("Shooter search is unavailable — continue as guest.");
        return;
      }
      const remote = ((data || []) as Array<{ user_id: string; display_name: string; country: string }>).map((row) => ({
        userId: row.user_id,
        displayName: row.display_name,
        country: getCountryLabel(row.country) || row.country,
      }));
      setSuggestions(mergeOwnProfileSuggestion(query, props.ownSuggestion, remote));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, searchEnabled, props.ownSuggestion]);

  function select(suggestion: ShooterDirectorySuggestion) {
    if (identityAlreadyLinked(suggestion.userId, props.shooters, props.localId)) {
      setMessage("This CPL profile is already added to this score sheet.");
      return;
    }
    props.onSelect(suggestion);
    setSuggestions([]);
    setMessage("");
    setChangeLink(false);
  }

  return <div className="shooterIdentityPicker">
    <label>{props.label}
      <input
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onNameChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setSuggestions([]);
          if (event.key === "Enter" && props.onEnter) { event.preventDefault(); props.onEnter(); }
        }}
        placeholder={props.placeholder}
      />
    </label>
    {props.linkedUserId && <div className="shooterIdentityState">
      <span className="statusBadge">Linked CPL profile</span>
      {!props.disabled && <>
        <button type="button" className="secondary smallButton" onClick={() => setChangeLink(true)}>Change link</button>
        <button type="button" className="secondary smallButton" onClick={() => { props.onUnlink?.(); setChangeLink(false); }}>Unlink</button>
      </>}
    </div>}
    {searchEnabled && searching && <p className="small muted shooterSearchStatus">Searching...</p>}
    {searchEnabled && message && <p className="small muted shooterSearchStatus">{message}</p>}
    {searchEnabled && suggestions.length > 0 && <div className="shooterDirectorySuggestions" aria-label="CPL shooter suggestions">
      {suggestions.map((suggestion) => {
        const unavailable = identityAlreadyLinked(suggestion.userId, props.shooters, props.localId);
        return <button key={suggestion.userId} type="button" disabled={unavailable} onClick={() => select(suggestion)}>
          <strong>{suggestion.displayName}{suggestion.isOwnProfile ? " (You)" : ""}</strong>
          <span>{suggestion.country}{unavailable ? " · Already added" : ""}</span>
        </button>;
      })}
    </div>}
  </div>;
}
