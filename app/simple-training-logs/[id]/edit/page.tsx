"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { SimpleTrainingLogForm, type SimpleTrainingLogFormValues } from "../../SimpleTrainingLogForm";
import { supabase } from "@/lib/supabase/client";
import { userFacingLoadError } from "@/lib/userFacingErrors";

type SimpleTrainingLogRow = SimpleTrainingLogFormValues & {
  source_type: string;
  upgraded_session_id?: string | null;
};

export default function EditSimpleTrainingLogPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [log, setLog] = useState<SimpleTrainingLogRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;

    async function loadLog() {
      setLoading(true);
      setErr("");

      const { data: userData } = await supabase.auth.getUser();
      if (!active) return;

      if (!userData.user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("training_logs")
        .select("id,date,targets_fired,hits,discipline,location,notes,source_type,equipment_weapon_id,equipment_ammunition_profile_id,equipment_snapshot,upgraded_session_id")
        .eq("id", params.id)
        .eq("source_type", "simple_training")
        .maybeSingle<SimpleTrainingLogRow>();

      if (!active) return;

      if (error) {
        setErr(userFacingLoadError(error, "Could not load this training log right now. Try again when online."));
        setLog(null);
        setLoading(false);
        return;
      }

      if (!data) {
        setErr("This simple training log was not found, or you do not have access to it.");
        setLog(null);
        setLoading(false);
        return;
      }

      if (data.upgraded_session_id) {
        router.replace(`/sessions/${data.upgraded_session_id}`);
        return;
      }

      setLog(data);
      setLoading(false);
    }

    loadLog();

    return () => {
      active = false;
    };
  }, [params.id, router]);

  return (
    <main className="container narrow">
      {loading ? (
        <div className="card">
          <p>Loading training log...</p>
        </div>
      ) : err ? (
        <div className="card">
          <div className="error">{err}</div>
          <div className="btns">
            <Link href="/log-training" className="button secondary">Back to Log training</Link>
          </div>
        </div>
      ) : log ? (
        <SimpleTrainingLogForm mode="edit" initialValues={log} />
      ) : null}
    </main>
  );
}
