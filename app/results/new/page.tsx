"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DISCIPLINE_OPTIONS } from "@/lib/disciplines";
import { normalizeDisciplines, prioritizedDisciplineOptions, type ShooterProfile } from "@/lib/profile";
import { EquipmentUsedSelector } from "@/app/components/EquipmentUsedSelector";
import { supabase } from "@/lib/supabase/client";
import { type EquipmentSelection } from "@/lib/equipment/logSnapshots";
import { userFacingSaveError } from "@/lib/userFacingErrors";

export default function NewResultPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [competitionDate, setCompetitionDate] = useState(new Date().toISOString().slice(0, 10));
  const [discipline, setDiscipline] = useState("Compak Sporting");
  const [shootingGround, setShootingGround] = useState("");
  const [totalTargets, setTotalTargets] = useState("100");
  const [ownScore, setOwnScore] = useState("");
  const [winningScore, setWinningScore] = useState("");
  const [leirdueResultUrl, setLeirdueResultUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [myDisciplines, setMyDisciplines] = useState<string[]>([]);
  const [equipmentSelection, setEquipmentSelection] = useState<EquipmentSelection>({ weaponId: "", ammunitionId: "", includeChokes: true });
  const [equipmentSnapshot, setEquipmentSnapshot] = useState<any>(null);
  const disciplineOptions = useMemo(
    () => prioritizedDisciplineOptions(DISCIPLINE_OPTIONS, myDisciplines),
    [myDisciplines],
  );

  useEffect(() => {
    let active = true;

    async function loadPreferredDisciplines() {
      const { data: userData } = await supabase.auth.getUser();
      if (!active || !userData.user) return;

      const { data } = await supabase
        .from("shooter_profiles")
        .select("my_disciplines")
        .eq("user_id", userData.user.id)
        .maybeSingle<Pick<ShooterProfile, "my_disciplines">>();

      if (active) setMyDisciplines(normalizeDisciplines(data?.my_disciplines));
    }

    loadPreferredDisciplines();

    return () => {
      active = false;
    };
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErr("");
    if (!name.trim() || !competitionDate || !totalTargets || !ownScore || !winningScore) {
      setErr("Competition name, date, total targets, own score and winning score are required.");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }
    const { error } = await supabase.from("sessions").insert({
      user_id: u.user.id,
      name: name.trim(),
      discipline,
      session_type: "Competition",
      shooting_format: null,
      course_count: null,
      total_targets: Number(totalTargets),
      competition_date: competitionDate,
      shooting_ground: shootingGround.trim() || null,
      own_score: Number(ownScore),
      winning_score: Number(winningScore),
      leirdue_result_url: leirdueResultUrl.trim() || null,
        equipment_weapon_id: equipmentSelection.weaponId || null,
        equipment_ammunition_profile_id: equipmentSelection.ammunitionId || null,
        equipment_snapshot: equipmentSnapshot,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      setErr(userFacingSaveError(error, "Could not save this result right now. Try again when online."));
      return;
    }
    router.push("/stats");
  }

  return (
    <main>
      <form className="card" onSubmit={save}>
        <p className="eyebrow">Result only mode</p>
        <h2>Add result only</h2>
        <p>Use this when you only want score statistics, without logging misses.</p>
        <label>Competition name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Competition name" required />
        <div className="row">
          <div>
            <label>Date</label>
            <input value={competitionDate} onChange={(e) => setCompetitionDate(e.target.value)} type="date" required />
          </div>
          <div>
            <label>Discipline</label>
            <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
              {disciplineOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
        <label>Shooting ground</label>
        <input value={shootingGround} onChange={(e) => setShootingGround(e.target.value)} placeholder="Kismul, Karmøy, Stavanger..." />
        <div className="row">
          <div>
            <label>Total targets</label>
            <input value={totalTargets} onChange={(e) => setTotalTargets(e.target.value)} type="number" min="1" inputMode="numeric" required />
          </div>
          <div>
            <label>Own score</label>
            <input value={ownScore} onChange={(e) => setOwnScore(e.target.value)} type="number" min="0" inputMode="numeric" required />
          </div>
        </div>
        <label>Winning score</label>
        <input value={winningScore} onChange={(e) => setWinningScore(e.target.value)} type="number" min="1" inputMode="numeric" required />
        <label>Leirdue.net result URL</label>
        <input value={leirdueResultUrl} onChange={(e) => setLeirdueResultUrl(e.target.value)} type="url" placeholder="Optional" />

        <EquipmentUsedSelector
          value={equipmentSelection}
          onChange={(selection, snapshot) => { setEquipmentSelection(selection); setEquipmentSnapshot(snapshot); }}
        />
        <label>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        {err && <div className="error">{err}</div>}
        <div className="btns">
          <button disabled={saving}>{saving ? "Saving..." : "Save result"}</button>
          <Link className="button secondary" href="/dashboard">Cancel</Link>
        </div>
      </form>
    </main>
  );
}
