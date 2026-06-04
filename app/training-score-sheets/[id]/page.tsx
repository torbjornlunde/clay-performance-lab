"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DISCIPLINE_OPTIONS, LEIRDUESTI } from "@/lib/disciplines";
import { supabase } from "@/lib/supabase/client";

type ShooterDraft = {
  localId: string;
  name: string;
  scores: number[];
};

type TargetResultValue = "hit" | "miss";

type TargetResultMap = Record<
  string,
  Record<number, Record<number, TargetResultValue>>
>;

type InputHistoryItem = {
  shooterId: string;
  postNumber: number;
  targetNumber: number;
  previousResult: TargetResultValue | null;
};

type ScoreSheetRow = {
  id: string;
  title: string;
  session_date: string;
  location: string | null;
  discipline: string;
  session_type: string;
  number_of_posts: number;
  targets_per_post: number;
  total_targets: number;
};

type ShooterRow = {
  id: string;
  shooter_name: string;
  display_order: number | null;
  total_score: number | null;
};

type ScoreRow = {
  shooter_id: string;
  post_number: number;
  score: number;
};

type TargetResultRow = {
  shooter_id: string;
  post_number: number;
  target_number: number;
  result: TargetResultValue;
};

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function makeScores(postCount: number, existing: number[] = []) {
  return Array.from({ length: postCount }, (_, index) => existing[index] ?? 0);
}

function makeShooter(name = ""): ShooterDraft {
  return { localId: crypto.randomUUID(), name, scores: makeScores(5) };
}

function capitalizeNamePart(part: string) {
  if (!part) return part;
  const [firstCharacter, ...rest] = Array.from(part);
  return `${firstCharacter.toLocaleUpperCase()}${rest.join("").toLocaleLowerCase()}`;
}

function formatShooterName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.split("-").map(capitalizeNamePart).join("-"))
    .join(" ");
}

function sessionTypeLabel(value: string) {
  return value === "shared_training" ? "Shared training" : "Training";
}

function clampScore(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), max);
}

function hasTargetResults(
  targetResults: TargetResultMap,
  shooterId: string,
  postNumber: number,
) {
  return Object.keys(targetResults[shooterId]?.[postNumber] || {}).length > 0;
}

function scoreFromTargetResults(
  targetResults: TargetResultMap,
  shooterId: string,
  postNumber: number,
) {
  return Object.values(targetResults[shooterId]?.[postNumber] || {}).filter(
    (result) => result === "hit",
  ).length;
}

function displayedPostScore(
  shooter: ShooterDraft,
  postIndex: number,
  targetResults: TargetResultMap,
) {
  const postNumber = postIndex + 1;
  return hasTargetResults(targetResults, shooter.localId, postNumber)
    ? scoreFromTargetResults(targetResults, shooter.localId, postNumber)
    : shooter.scores[postIndex] || 0;
}

function totalFor(shooter: ShooterDraft, targetResults: TargetResultMap) {
  return shooter.scores.reduce(
    (sum, score, postIndex) =>
      sum + displayedPostScore(shooter, postIndex, targetResults),
    0,
  );
}

export default function TrainingScoreSheetPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sheetId = params.id;
  const isNew = sheetId === "new";

  const [title, setTitle] = useState("Sporting training");
  const [sessionDate, setSessionDate] = useState(todayValue());
  const [location, setLocation] = useState("");
  const [discipline, setDiscipline] = useState(LEIRDUESTI);
  const [sessionType, setSessionType] = useState("training");
  const [numberOfPosts, setNumberOfPosts] = useState(5);
  const [targetsPerPost, setTargetsPerPost] = useState(10);
  const [shooters, setShooters] = useState<ShooterDraft[]>([makeShooter()]);
  const [targetResults, setTargetResults] = useState<TargetResultMap>({});
  const [inputHistory, setInputHistory] = useState<InputHistoryItem[]>([]);
  const [liveMode, setLiveMode] = useState(false);
  const [currentShooterId, setCurrentShooterId] = useState("");
  const [currentPost, setCurrentPost] = useState(1);
  const [currentTarget, setCurrentTarget] = useState(1);
  const [newShooterName, setNewShooterName] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const postNumbers = useMemo(
    () => Array.from({ length: numberOfPosts }, (_, index) => index + 1),
    [numberOfPosts],
  );
  const sheetTotalTargets = numberOfPosts * targetsPerPost;
  const hasEnteredScores = shooters.some((shooter) =>
    shooter.scores.some(
      (score, index) => displayedPostScore(shooter, index, targetResults) > 0,
    ),
  );
  const validShooters = useMemo(
    () =>
      shooters
        .map((shooter) => ({
          ...shooter,
          displayName: formatShooterName(shooter.name),
        }))
        .filter((shooter) => shooter.displayName.length > 0),
    [shooters],
  );
  const targetNumbers = useMemo(
    () => Array.from({ length: targetsPerPost }, (_, index) => index + 1),
    [targetsPerPost],
  );
  const currentShooter = validShooters.find(
    (shooter) => shooter.localId === currentShooterId,
  );

  useEffect(() => {
    if (isNew) return;
    loadScoreSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId, isNew]);

  useEffect(() => {
    if (validShooters.length === 0) {
      setCurrentShooterId("");
      return;
    }
    if (
      !validShooters.some((shooter) => shooter.localId === currentShooterId)
    ) {
      setCurrentShooterId(validShooters[0].localId);
    }
  }, [currentShooterId, validShooters]);

  useEffect(() => {
    setCurrentPost((value) => Math.min(Math.max(value, 1), numberOfPosts));
    setCurrentTarget((value) => Math.min(Math.max(value, 1), targetsPerPost));
  }, [numberOfPosts, targetsPerPost]);

  async function loadScoreSheet() {
    setLoading(true);
    setErr("");

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/login");
      return;
    }

    const { data: sheet, error: sheetError } = await supabase
      .from("training_score_sheets")
      .select(
        "id,title,session_date,location,discipline,session_type,number_of_posts,targets_per_post,total_targets",
      )
      .eq("id", sheetId)
      .single<ScoreSheetRow>();

    if (sheetError || !sheet) {
      setErr(sheetError?.message || "Could not load training score sheet.");
      setLoading(false);
      return;
    }

    const { data: shooterRows, error: shooterError } = await supabase
      .from("training_score_sheet_shooters")
      .select("id,shooter_name,display_order,total_score")
      .eq("score_sheet_id", sheetId)
      .order("display_order")
      .returns<ShooterRow[]>();

    const { data: scoreRows, error: scoreError } = await supabase
      .from("training_score_sheet_scores")
      .select("shooter_id,post_number,score")
      .eq("score_sheet_id", sheetId)
      .returns<ScoreRow[]>();

    const { data: targetRows, error: targetError } = await supabase
      .from("training_score_sheet_target_results")
      .select("shooter_id,post_number,target_number,result")
      .eq("score_sheet_id", sheetId)
      .returns<TargetResultRow[]>();

    if (shooterError || scoreError || targetError) {
      setErr(
        shooterError?.message ||
          scoreError?.message ||
          targetError?.message ||
          "Could not load scores.",
      );
      setLoading(false);
      return;
    }

    setTitle(sheet.title || "Training score sheet");
    setSessionDate((sheet.session_date || todayValue()).slice(0, 10));
    setLocation(sheet.location || "");
    setDiscipline(sheet.discipline || LEIRDUESTI);
    setSessionType(sheet.session_type || "training");
    setNumberOfPosts(sheet.number_of_posts || 5);
    setTargetsPerPost(sheet.targets_per_post || 10);

    const loadedTargetResults: TargetResultMap = {};
    (targetRows || []).forEach((target) => {
      if (
        target.post_number < 1 ||
        target.post_number > (sheet.number_of_posts || 5)
      )
        return;
      if (
        target.target_number < 1 ||
        target.target_number > (sheet.targets_per_post || 10)
      )
        return;
      loadedTargetResults[target.shooter_id] =
        loadedTargetResults[target.shooter_id] || {};
      loadedTargetResults[target.shooter_id][target.post_number] =
        loadedTargetResults[target.shooter_id][target.post_number] || {};
      loadedTargetResults[target.shooter_id][target.post_number][
        target.target_number
      ] = target.result;
    });

    const loadedShooters = (shooterRows || []).map((shooter) => {
      const scores = makeScores(sheet.number_of_posts || 5);
      (scoreRows || [])
        .filter((score) => score.shooter_id === shooter.id)
        .forEach((score) => {
          if (score.post_number >= 1 && score.post_number <= scores.length) {
            scores[score.post_number - 1] = clampScore(
              score.score,
              sheet.targets_per_post || 10,
            );
          }
        });
      return {
        localId: shooter.id,
        name: formatShooterName(shooter.shooter_name),
        scores,
      };
    });

    setShooters(loadedShooters.length > 0 ? loadedShooters : [makeShooter()]);
    setTargetResults(loadedTargetResults);
    setInputHistory([]);
    setLoading(false);
  }

  function updatePostCount(nextCount: number) {
    const safeCount = Math.min(Math.max(nextCount || 1, 1), 20);
    setNumberOfPosts(safeCount);
    setShooters((current) =>
      current.map((shooter) => ({
        ...shooter,
        scores: makeScores(safeCount, shooter.scores),
      })),
    );
    setTargetResults((current) =>
      trimTargetResults(current, safeCount, targetsPerPost),
    );
  }

  function updateTargetsPerPost(nextValue: number) {
    const safeTargets = Math.min(Math.max(nextValue || 1, 1), 100);
    setTargetsPerPost(safeTargets);
    setShooters((current) =>
      current.map((shooter) => ({
        ...shooter,
        scores: shooter.scores.map((score) => clampScore(score, safeTargets)),
      })),
    );
    setTargetResults((current) =>
      trimTargetResults(current, numberOfPosts, safeTargets),
    );
  }

  function updateShooterName(localId: string, name: string) {
    setShooters((current) =>
      current.map((shooter) =>
        shooter.localId === localId ? { ...shooter, name } : shooter,
      ),
    );
  }

  function formatShooterNameInList(localId: string) {
    setShooters((current) =>
      current.map((shooter) =>
        shooter.localId === localId
          ? { ...shooter, name: formatShooterName(shooter.name) }
          : shooter,
      ),
    );
  }

  function focusNextScoreField(scoreIndex: number) {
    const nextField = document.querySelector<HTMLInputElement>(
      `[data-score-index="${scoreIndex + 1}"]`,
    );
    nextField?.focus();
    nextField?.select();
  }

  function trimTargetResults(
    current: TargetResultMap,
    maxPosts: number,
    maxTargets: number,
  ) {
    const next: TargetResultMap = {};
    Object.entries(current).forEach(([shooterId, posts]) => {
      Object.entries(posts).forEach(([postKey, targets]) => {
        const postNumber = Number(postKey);
        if (postNumber < 1 || postNumber > maxPosts) return;
        Object.entries(targets).forEach(([targetKey, result]) => {
          const targetNumber = Number(targetKey);
          if (targetNumber < 1 || targetNumber > maxTargets) return;
          next[shooterId] = next[shooterId] || {};
          next[shooterId][postNumber] = next[shooterId][postNumber] || {};
          next[shooterId][postNumber][targetNumber] = result;
        });
      });
    });
    return next;
  }

  function updateScore(localId: string, postIndex: number, value: string) {
    const score = value === "" ? 0 : clampScore(Number(value), targetsPerPost);
    setShooters((current) =>
      current.map((shooter) => {
        if (shooter.localId !== localId) return shooter;
        const scores = [...shooter.scores];
        scores[postIndex] = score;
        return { ...shooter, scores };
      }),
    );
  }

  function addShooter() {
    const name = formatShooterName(newShooterName);
    setShooters((current) => [
      ...current,
      { localId: crypto.randomUUID(), name, scores: makeScores(numberOfPosts) },
    ]);
    setNewShooterName("");
  }

  function removeShooter(localId: string) {
    setShooters((current) =>
      current.length === 1
        ? current
        : current.filter((shooter) => shooter.localId !== localId),
    );
    setTargetResults((current) => {
      const next = { ...current };
      delete next[localId];
      return next;
    });
  }

  function syncShooterPostScore(
    shooterId: string,
    postNumber: number,
    nextTargetResults: TargetResultMap,
  ) {
    setShooters((current) =>
      current.map((shooter) => {
        if (shooter.localId !== shooterId) return shooter;
        const scores = [...shooter.scores];
        scores[postNumber - 1] = scoreFromTargetResults(
          nextTargetResults,
          shooterId,
          postNumber,
        );
        return { ...shooter, scores };
      }),
    );
  }

  function advanceLiveCursor() {
    const shooterIndex = validShooters.findIndex(
      (shooter) => shooter.localId === currentShooterId,
    );
    if (shooterIndex < 0) return;
    if (currentTarget < targetsPerPost) {
      setCurrentTarget((value) => value + 1);
      return;
    }
    if (shooterIndex < validShooters.length - 1) {
      setCurrentShooterId(validShooters[shooterIndex + 1].localId);
      setCurrentTarget(1);
      return;
    }
    if (currentPost < numberOfPosts) {
      setCurrentPost((value) => value + 1);
      setCurrentShooterId(validShooters[0].localId);
      setCurrentTarget(1);
    }
  }

  function markTarget(result: TargetResultValue) {
    if (!currentShooterId) return;
    const previousResult =
      targetResults[currentShooterId]?.[currentPost]?.[currentTarget] || null;
    const nextTargetResults: TargetResultMap = {
      ...targetResults,
      [currentShooterId]: {
        ...(targetResults[currentShooterId] || {}),
        [currentPost]: {
          ...(targetResults[currentShooterId]?.[currentPost] || {}),
          [currentTarget]: result,
        },
      },
    };
    setTargetResults(nextTargetResults);
    syncShooterPostScore(currentShooterId, currentPost, nextTargetResults);
    setInputHistory((current) => [
      ...current,
      {
        shooterId: currentShooterId,
        postNumber: currentPost,
        targetNumber: currentTarget,
        previousResult,
      },
    ]);
    advanceLiveCursor();
  }

  function correctTarget(
    shooterId: string,
    postNumber: number,
    targetNumber: number,
  ) {
    setCurrentShooterId(shooterId);
    setCurrentPost(postNumber);
    setCurrentTarget(targetNumber);
  }

  function undoLastInput() {
    const lastInput = inputHistory[inputHistory.length - 1];
    if (!lastInput) return;
    const nextTargetResults: TargetResultMap = {
      ...targetResults,
      [lastInput.shooterId]: { ...(targetResults[lastInput.shooterId] || {}) },
    };
    nextTargetResults[lastInput.shooterId][lastInput.postNumber] = {
      ...(nextTargetResults[lastInput.shooterId][lastInput.postNumber] || {}),
    };
    if (lastInput.previousResult)
      nextTargetResults[lastInput.shooterId][lastInput.postNumber][
        lastInput.targetNumber
      ] = lastInput.previousResult;
    else
      delete nextTargetResults[lastInput.shooterId][lastInput.postNumber][
        lastInput.targetNumber
      ];
    if (
      Object.keys(nextTargetResults[lastInput.shooterId][lastInput.postNumber])
        .length === 0
    )
      delete nextTargetResults[lastInput.shooterId][lastInput.postNumber];
    if (Object.keys(nextTargetResults[lastInput.shooterId]).length === 0)
      delete nextTargetResults[lastInput.shooterId];
    setTargetResults(nextTargetResults);
    syncShooterPostScore(
      lastInput.shooterId,
      lastInput.postNumber,
      nextTargetResults,
    );
    setInputHistory((current) => current.slice(0, -1));
    setCurrentShooterId(lastInput.shooterId);
    setCurrentPost(lastInput.postNumber);
    setCurrentTarget(lastInput.targetNumber);
  }

  function validate() {
    const namedShooters = shooters.filter((shooter) =>
      formatShooterName(shooter.name),
    );
    if (!title.trim()) return "Add a training name.";
    if (!sessionDate) return "Choose a date.";
    if (!discipline) return "Choose a discipline.";
    if (numberOfPosts < 1) return "Add at least one post.";
    if (targetsPerPost < 1) return "Targets per post must be at least 1.";
    if (namedShooters.length === 0) return "Add at least one shooter.";
    for (const shooter of namedShooters) {
      for (
        let postIndex = 0;
        postIndex < shooter.scores.length;
        postIndex += 1
      ) {
        if (
          displayedPostScore(shooter, postIndex, targetResults) > targetsPerPost
        ) {
          return `${formatShooterName(shooter.name)} has a score above ${targetsPerPost}.`;
        }
      }
    }
    return "";
  }

  async function save() {
    setErr("");
    setSavedMessage("");
    const validationError = validate();
    if (validationError) {
      setErr(validationError);
      return;
    }

    setSaving(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      setErr(userError.message);
      setSaving(false);
      return;
    }
    if (!userData.user) {
      router.push("/login");
      return;
    }

    const sheetPayload = {
      title: title.trim(),
      session_date: sessionDate,
      location: location.trim() || null,
      discipline,
      session_type: sessionType,
      number_of_posts: numberOfPosts,
      targets_per_post: targetsPerPost,
      total_targets: sheetTotalTargets,
    };

    const { data: savedSheet, error: sheetError } = isNew
      ? await supabase
          .from("training_score_sheets")
          .insert({ ...sheetPayload, owner_user_id: userData.user.id })
          .select("id")
          .single<{ id: string }>()
      : await supabase
          .from("training_score_sheets")
          .update(sheetPayload)
          .eq("id", sheetId)
          .select("id")
          .single<{ id: string }>();

    if (sheetError || !savedSheet) {
      setErr(sheetError?.message || "Could not save training score sheet.");
      setSaving(false);
      return;
    }

    if (!isNew) {
      const { error: targetDeleteError } = await supabase
        .from("training_score_sheet_target_results")
        .delete()
        .eq("score_sheet_id", savedSheet.id);
      const { error: scoreDeleteError } = await supabase
        .from("training_score_sheet_scores")
        .delete()
        .eq("score_sheet_id", savedSheet.id);
      const { error: shooterDeleteError } = await supabase
        .from("training_score_sheet_shooters")
        .delete()
        .eq("score_sheet_id", savedSheet.id);
      if (targetDeleteError || scoreDeleteError || shooterDeleteError) {
        setErr(
          targetDeleteError?.message ||
            scoreDeleteError?.message ||
            shooterDeleteError?.message ||
            "Could not replace old scores.",
        );
        setSaving(false);
        return;
      }
    }

    const namedShooters = shooters
      .map((shooter) => ({
        ...shooter,
        displayName: formatShooterName(shooter.name),
      }))
      .filter((shooter) => shooter.displayName);
    setShooters((current) =>
      current.map((shooter) => ({
        ...shooter,
        name: formatShooterName(shooter.name),
      })),
    );
    const shooterRows = namedShooters.map((shooter, index) => ({
      score_sheet_id: savedSheet.id,
      shooter_name: shooter.displayName,
      display_order: index + 1,
      total_score: totalFor(shooter, targetResults),
    }));

    const { data: insertedShooters, error: shooterError } = await supabase
      .from("training_score_sheet_shooters")
      .insert(shooterRows)
      .select("id,display_order")
      .returns<Array<{ id: string; display_order: number }>>();

    if (shooterError || !insertedShooters) {
      setErr(shooterError?.message || "Could not save shooters.");
      setSaving(false);
      return;
    }

    const scoreRows = insertedShooters.flatMap(
      (insertedShooter, shooterIndex) =>
        namedShooters[shooterIndex].scores.map((score, scoreIndex) => ({
          score_sheet_id: savedSheet.id,
          shooter_id: insertedShooter.id,
          post_number: scoreIndex + 1,
          score: clampScore(
            displayedPostScore(
              namedShooters[shooterIndex],
              scoreIndex,
              targetResults,
            ),
            targetsPerPost,
          ),
          max_score: targetsPerPost,
        })),
    );

    const { error: scoresError } = await supabase
      .from("training_score_sheet_scores")
      .insert(scoreRows);
    if (scoresError) {
      setErr(scoresError.message);
      setSaving(false);
      return;
    }

    const shooterIdMap = new Map(
      insertedShooters.map((insertedShooter, shooterIndex) => [
        namedShooters[shooterIndex].localId,
        insertedShooter.id,
      ]),
    );
    const targetRows = namedShooters.flatMap((shooter) => {
      const savedShooterId = shooterIdMap.get(shooter.localId);
      if (!savedShooterId) return [];
      return Object.entries(targetResults[shooter.localId] || {}).flatMap(
        ([postKey, targets]) =>
          Object.entries(targets).map(([targetKey, result]) => ({
            score_sheet_id: savedSheet.id,
            shooter_id: savedShooterId,
            post_number: Number(postKey),
            target_number: Number(targetKey),
            result,
          })),
      );
    });

    if (targetRows.length > 0) {
      const { error: targetError } = await supabase
        .from("training_score_sheet_target_results")
        .insert(targetRows);
      if (targetError) {
        setErr(targetError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setSavedMessage("Training score sheet saved.");
    if (isNew) router.replace(`/training-score-sheets/${savedSheet.id}`);
    else loadScoreSheet();
  }

  if (loading) {
    return (
      <main>
        <div className="card">Loading training score sheet...</div>
      </main>
    );
  }

  return (
    <main>
      <div className="card trainingScoreSheetCard">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Training Score Sheet</p>
            <h2>{isNew ? "New training score sheet" : title}</h2>
            <p className="small muted">
              Fast post-by-post scoring for one organizer and multiple shooters.
            </p>
          </div>
          <span className="badge badgeGreen">
            {sessionTypeLabel(sessionType)}
          </span>
        </div>

        <div className="subcard">
          <div className="row">
            <div>
              <label>Training name</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Thursday sporting practice"
              />
            </div>
            <div>
              <label>Date</label>
              <input
                className="compactDateInput"
                value={sessionDate}
                onChange={(event) => setSessionDate(event.target.value)}
                type="date"
              />
            </div>
          </div>
          <label>Location / shooting ground (optional)</label>
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Kismul, Karmøy, Stavanger..."
          />
          <div className="row">
            <div>
              <label>Discipline</label>
              <select
                value={discipline}
                onChange={(event) => setDiscipline(event.target.value)}
              >
                {[
                  LEIRDUESTI,
                  "Sporting",
                  ...DISCIPLINE_OPTIONS.filter(
                    (option) => option !== LEIRDUESTI && option !== "Sporting",
                  ),
                ].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Session type</label>
              <select
                value={sessionType}
                onChange={(event) => setSessionType(event.target.value)}
              >
                <option value="training">Training</option>
                <option value="shared_training">Shared training</option>
              </select>
            </div>
          </div>
          <div className="row">
            <div>
              <label>Number of posts / stations</label>
              <input
                value={numberOfPosts}
                onChange={(event) =>
                  updatePostCount(Number(event.target.value))
                }
                type="number"
                min="1"
                max="20"
                inputMode="numeric"
              />
            </div>
            <div>
              <label>Targets per post</label>
              <input
                value={targetsPerPost}
                onChange={(event) =>
                  updateTargetsPerPost(Number(event.target.value))
                }
                type="number"
                min="1"
                max="100"
                inputMode="numeric"
              />
            </div>
          </div>
          {hasEnteredScores && (
            <p className="small muted">
              Changing post setup keeps existing scores where possible and
              clamps scores to the new max.
            </p>
          )}
          <p className="small muted">
            Total targets per shooter: {sheetTotalTargets}
          </p>
        </div>

        <div className="subcard">
          <h3>Shooters</h3>
          <div className="addShooterRow">
            <input
              value={newShooterName}
              onChange={(event) => setNewShooterName(event.target.value)}
              placeholder="Shooter name"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addShooter();
                }
              }}
            />
            <button type="button" className="secondary" onClick={addShooter}>
              Add shooter
            </button>
          </div>
          <div className="shooterNameList">
            {shooters.map((shooter, index) => (
              <div className="shooterNameRow" key={shooter.localId}>
                <span className="small muted">#{index + 1}</span>
                <input
                  value={shooter.name}
                  onChange={(event) =>
                    updateShooterName(shooter.localId, event.target.value)
                  }
                  onBlur={() => formatShooterNameInList(shooter.localId)}
                  placeholder="Shooter name"
                />
                <button
                  type="button"
                  className="secondary smallButton"
                  onClick={() => removeShooter(shooter.localId)}
                  disabled={shooters.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="subcard liveScoringCard">
          <div className="sectionHeader compactSectionHeader">
            <div>
              <h3>Live scoring mode</h3>
              <p className="small muted">
                Mark every target as hit or miss. Target-by-target results
                become the source of truth for that shooter and post.
              </p>
            </div>
            <button
              type="button"
              className={liveMode ? "secondary" : ""}
              onClick={() => setLiveMode((value) => !value)}
            >
              {liveMode ? "Hide live scoring" : "Start live scoring"}
            </button>
          </div>
          {liveMode && (
            <div className="liveScoringPanel">
              <div className="liveScoringStatus">
                <div>
                  <span className="small muted">Current shooter</span>
                  <strong>
                    {currentShooter?.displayName || "Add a shooter"}
                  </strong>
                </div>
                <div>
                  <span className="small muted">Current post</span>
                  <strong>{currentPost}</strong>
                </div>
                <div>
                  <span className="small muted">Current target</span>
                  <strong>{currentTarget}</strong>
                </div>
              </div>
              <div className="liveScoringSelectors">
                <label>
                  Shooter
                  <select
                    value={currentShooterId}
                    onChange={(event) =>
                      setCurrentShooterId(event.target.value)
                    }
                  >
                    {validShooters.map((shooter) => (
                      <option key={shooter.localId} value={shooter.localId}>
                        {shooter.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Post
                  <select
                    value={currentPost}
                    onChange={(event) =>
                      setCurrentPost(Number(event.target.value))
                    }
                  >
                    {postNumbers.map((post) => (
                      <option key={post} value={post}>
                        Post {post}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="liveScoringActions">
                <button
                  type="button"
                  className="hitButton"
                  onClick={() => markTarget("hit")}
                  disabled={!currentShooter}
                >
                  Hit
                </button>
                <button
                  type="button"
                  className="missButton"
                  onClick={() => markTarget("miss")}
                  disabled={!currentShooter}
                >
                  Miss
                </button>
              </div>
              <div className="btns">
                <button
                  type="button"
                  className="secondary smallButton"
                  onClick={undoLastInput}
                  disabled={inputHistory.length === 0}
                >
                  Undo last input
                </button>
              </div>
              {currentShooter && (
                <div
                  className="targetCorrectionGrid"
                  aria-label="Target correction grid"
                >
                  {targetNumbers.map((targetNumber) => {
                    const result =
                      targetResults[currentShooter.localId]?.[currentPost]?.[
                        targetNumber
                      ];
                    const isCurrentTarget = targetNumber === currentTarget;
                    return (
                      <button
                        key={targetNumber}
                        type="button"
                        className={`targetCorrectionButton ${result || "empty"} ${
                          isCurrentTarget ? "selected" : ""
                        }`}
                        onClick={() =>
                          correctTarget(
                            currentShooter.localId,
                            currentPost,
                            targetNumber,
                          )
                        }
                        aria-label={`${currentShooter.displayName} post ${currentPost} target ${targetNumber} ${result || "not scored"}`}
                      >
                        <span>{targetNumber}</span>
                        <strong>
                          {result === "hit"
                            ? "H"
                            : result === "miss"
                              ? "M"
                              : "—"}
                        </strong>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="subcard">
          <div className="sectionHeader compactSectionHeader">
            <div>
              <h3>Scores by post</h3>
              <p className="small muted">
                Existing post-total score entry remains available. When a post
                has live target results, its target hits calculate the post
                total.
              </p>
            </div>
          </div>
          <div
            className="scoreSheetScroller"
            role="region"
            aria-label="Training score entry table"
          >
            <table className="trainingScoreTable">
              <thead>
                <tr>
                  <th>Shooter</th>
                  {postNumbers.map((post) => (
                    <th key={post}>Post {post}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {validShooters.length === 0 ? (
                  <tr>
                    <td
                      colSpan={postNumbers.length + 2}
                      className="emptyScoreGridCell"
                    >
                      Add at least one shooter.
                    </td>
                  </tr>
                ) : (
                  validShooters.map((shooter, shooterIndex) => (
                    <tr key={shooter.localId}>
                      <th scope="row">{shooter.displayName}</th>
                      {postNumbers.map((post, index) => {
                        const scoreIndex = shooterIndex * numberOfPosts + index;
                        return (
                          <td key={post}>
                            <input
                              aria-label={`${shooter.displayName} post ${post}`}
                              data-score-index={scoreIndex}
                              value={
                                displayedPostScore(
                                  shooter,
                                  index,
                                  targetResults,
                                ) || ""
                              }
                              onChange={(event) =>
                                updateScore(
                                  shooter.localId,
                                  index,
                                  event.target.value,
                                )
                              }
                              disabled={hasTargetResults(
                                targetResults,
                                shooter.localId,
                                post,
                              )}
                              title={
                                hasTargetResults(
                                  targetResults,
                                  shooter.localId,
                                  post,
                                )
                                  ? "Calculated from live target results"
                                  : "Manual post-total score"
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  focusNextScoreField(scoreIndex);
                                }
                              }}
                              type="number"
                              min="0"
                              max={targetsPerPost}
                              inputMode="numeric"
                              enterKeyHint="next"
                              pattern="[0-9]*"
                            />
                          </td>
                        );
                      })}
                      <td className="scoreTotalCell">
                        {totalFor(shooter, targetResults)} / {sheetTotalTargets}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {err && <div className="error">{err}</div>}
        {savedMessage && <div className="successMessage">{savedMessage}</div>}
        <div className="btns stackedOnMobile">
          <button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save training score sheet"}
          </button>
          <Link href="/dashboard" className="button secondary">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
