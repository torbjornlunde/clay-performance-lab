"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { COMPAK_SPORTING, DISCIPLINE_OPTIONS, LEIRDUESTI } from "@/lib/disciplines";
import {
  type CompakSchemeRow,
  getAllSchemeNumbers,
  getCompakSchemeType,
  getExpectedPresentationRows,
  getMachineLabelFromRow,
  getPresentationLabel,
} from "@/lib/fitasc/compakSchemes";
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
  compak_scheme_id: string | null;
  compak_shooting_mode: CompakShootingMode | null;
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

type CompakShootingMode = "Squad" | "Inline";

type CompakSequenceTarget = {
  targetNumber: number;
  targetInSequence: number;
  machine: string | null;
};

type CompakSequence = {
  sequenceIndex: number;
  standNumber: number;
  eventNumber: number;
  presentation: string | null;
  firstMachine: string | null;
  secondMachine: string | null;
  hasSchemeData: boolean;
  targets: CompakSequenceTarget[];
};

const COMPAK_DEFAULT_STANDS = 5;
const COMPAK_TARGETS_PER_STAND = 5;
const COMPAK_TOTAL_TARGETS = COMPAK_DEFAULT_STANDS * COMPAK_TARGETS_PER_STAND;
const DEFAULT_COMPAK_SCHEME = 1;

function isCompakSporting(discipline: string) {
  return discipline.trim().toLowerCase() === COMPAK_SPORTING.toLowerCase();
}

function normalizeCompakSchemeId(value: string | number | null | undefined) {
  const parsed = Number(value);
  return getAllSchemeNumbers().includes(parsed) ? parsed : DEFAULT_COMPAK_SCHEME;
}

function targetsInPresentation(presentation: string | null | undefined) {
  return presentation?.toLowerCase() === "report_pair" || presentation?.toLowerCase() === "simo_pair" ? 2 : 1;
}

function normalizeCompakShootingMode(value: string | null | undefined): CompakShootingMode {
  return value === "Inline" ? "Inline" : "Squad";
}

function buildCompakStandSequences(
  schemeNumber: number,
  standNumber: number,
  schemeRows: CompakSchemeRow[],
): CompakSequence[] {
  const rowsForStand = schemeRows
    .filter((row) => row.scheme_number === schemeNumber && row.plate_number === standNumber)
    .sort((a, b) => a.event_number - b.event_number);
  const hasSchemeData = rowsForStand.length > 0;
  const sourceRows = hasSchemeData
    ? rowsForStand
    : getExpectedPresentationRows(schemeNumber).map((presentation, index) => ({
        scheme_number: schemeNumber,
        plate_number: standNumber,
        event_number: index + 1,
        presentation,
        first_machine: null,
        second_machine: null,
        is_verified: null,
      }));

  let nextTargetNumber = 1;
  const sequences = sourceRows.flatMap((row) => {
    if (nextTargetNumber > COMPAK_TARGETS_PER_STAND) return [];
    const targetCount = Math.min(
      targetsInPresentation(row.presentation),
      COMPAK_TARGETS_PER_STAND - nextTargetNumber + 1,
    );
    const targets = Array.from({ length: targetCount }, (_, index) => ({
      targetNumber: nextTargetNumber + index,
      targetInSequence: index + 1,
      machine: index === 0 ? row.first_machine : row.second_machine,
    }));
    nextTargetNumber += targetCount;
    return [{
      sequenceIndex: 0,
      standNumber,
      eventNumber: row.event_number,
      presentation: row.presentation,
      firstMachine: row.first_machine,
      secondMachine: row.second_machine,
      hasSchemeData,
      targets,
    }];
  });

  while (nextTargetNumber <= COMPAK_TARGETS_PER_STAND) {
    sequences.push({
      sequenceIndex: 0,
      standNumber,
      eventNumber: sequences.length + 1,
      presentation: "unknown",
      firstMachine: null,
      secondMachine: null,
      hasSchemeData: false,
      targets: [
        {
          targetNumber: nextTargetNumber,
          targetInSequence: 1,
          machine: null,
        },
      ],
    });
    nextTargetNumber += 1;
  }

  return sequences;
}

function buildCompakRoundProgram(
  schemeNumber: number,
  startStand: number,
  schemeRows: CompakSchemeRow[],
): CompakSequence[] {
  return plateRotation(startStand)
    .flatMap((standNumber) =>
      buildCompakStandSequences(schemeNumber, standNumber, schemeRows),
    )
    .map((sequence, index) => ({ ...sequence, sequenceIndex: index }));
}

function plateRotation(start: number) {
  return Array.from(
    { length: COMPAK_DEFAULT_STANDS },
    (_, index) => ((start - 1 + index) % COMPAK_DEFAULT_STANDS) + 1,
  );
}

function compakStartPlateForOrderNumber(orderNumber: number) {
  if (orderNumber >= 1 && orderNumber <= COMPAK_DEFAULT_STANDS) return orderNumber;
  return 1;
}

function compakStartPlateForOrder(orderNumber: number) {
  if (orderNumber >= 1 && orderNumber <= COMPAK_DEFAULT_STANDS) return `Stand ${orderNumber}`;
  return "Stand 1 (basic v1 fallback)";
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatTitleDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

function generateTrainingScoreSheetTitle(
  discipline: string,
  location: string,
  sessionDate: string,
) {
  const titleParts = [`${discipline || "Training"} training`];
  const cleanLocation = location.trim();
  if (cleanLocation) titleParts.push(cleanLocation);
  if (sessionDate) titleParts.push(formatTitleDate(sessionDate));
  return titleParts.join(" – ");
}

function makeScores(postCount: number, existing: number[] = []) {
  return Array.from({ length: postCount }, (_, index) => existing[index] ?? 0);
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

function orderedShootersForPost<T>(shooters: T[], postNumber: number) {
  if (shooters.length === 0) return shooters;
  const startIndex = (Math.max(postNumber, 1) - 1) % shooters.length;
  return shooters.slice(startIndex).concat(shooters.slice(0, startIndex));
}

export default function TrainingScoreSheetPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sheetId = params.id;
  const isNew = sheetId === "new";

  const [title, setTitle] = useState(() =>
    generateTrainingScoreSheetTitle(LEIRDUESTI, "", todayValue()),
  );
  const [titleAutoGenerated, setTitleAutoGenerated] = useState(isNew);
  const [sessionDate, setSessionDate] = useState(todayValue());
  const [location, setLocation] = useState("");
  const [discipline, setDiscipline] = useState(LEIRDUESTI);
  const [sessionType, setSessionType] = useState("training");
  const [numberOfPosts, setNumberOfPosts] = useState(5);
  const [targetsPerPost, setTargetsPerPost] = useState(10);
  const [compakSchemeId, setCompakSchemeId] = useState(DEFAULT_COMPAK_SCHEME);
  const [compakShootingMode, setCompakShootingMode] = useState<CompakShootingMode>("Squad");
  const [compakSchemeRows, setCompakSchemeRows] = useState<CompakSchemeRow[]>([]);
  const [shooters, setShooters] = useState<ShooterDraft[]>([]);
  const [targetResults, setTargetResults] = useState<TargetResultMap>({});
  const [inputHistory, setInputHistory] = useState<InputHistoryItem[]>([]);
  const [liveMode, setLiveMode] = useState(false);
  const [showSetupDuringLive, setShowSetupDuringLive] = useState(false);
  const [currentShooterId, setCurrentShooterId] = useState("");
  const [currentPost, setCurrentPost] = useState(1);
  const [currentTarget, setCurrentTarget] = useState(1);
  const [currentCompakSequenceIndex, setCurrentCompakSequenceIndex] = useState(0);
  const [currentCompakTargetInSequence, setCurrentCompakTargetInSequence] = useState(1);
  const [newShooterName, setNewShooterName] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const postNumbers = useMemo(
    () => Array.from({ length: numberOfPosts }, (_, index) => index + 1),
    [numberOfPosts],
  );
  const isCompak = isCompakSporting(discipline);
  const sheetTotalTargets = numberOfPosts * targetsPerPost;
  const setupSectionsOpen = !liveMode || showSetupDuringLive;
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
  const currentPostShooters = useMemo(
    () =>
      isCompak ? validShooters : orderedShootersForPost(validShooters, currentPost),
    [currentPost, isCompak, validShooters],
  );
  const currentShooterNumber = currentShooterId
    ? validShooters.findIndex((shooter) => shooter.localId === currentShooterId) + 1
    : 0;
  const currentCompakStartStand = isCompak
    ? compakStartPlateForOrderNumber(currentShooterNumber)
    : 1;
  const currentCompakProgram = useMemo(
    () =>
      isCompak
        ? buildCompakRoundProgram(
            compakSchemeId,
            currentCompakStartStand,
            compakSchemeRows,
          )
        : [],
    [compakSchemeId, compakSchemeRows, currentCompakStartStand, isCompak],
  );
  const currentCompakSequence = isCompak
    ? currentCompakProgram[currentCompakSequenceIndex] || null
    : null;
  const currentCompakTarget = currentCompakSequence
    ? currentCompakSequence.targets[currentCompakTargetInSequence - 1] ||
      currentCompakSequence.targets[0]
    : null;
  const currentShooter = validShooters.find(
    (shooter) => shooter.localId === currentShooterId,
  );
  const currentShooterOrderIndex = currentPostShooters.findIndex(
    (shooter) => shooter.localId === currentShooterId,
  );
  const activePostNumber = isCompak
    ? currentCompakSequence?.standNumber || currentPost
    : currentPost;
  const activeTargetNumber = isCompak
    ? currentCompakTarget?.targetNumber || currentTarget
    : currentTarget;
  const currentPostResults = currentShooter
    ? targetResults[currentShooter.localId]?.[activePostNumber] || {}
    : {};
  const currentShooterPostScore = currentShooter
    ? displayedPostScore(currentShooter, activePostNumber - 1, targetResults)
    : 0;
  const currentShooterTotal = currentShooter
    ? totalFor(currentShooter, targetResults)
    : 0;
  const currentShooterScoredTargets = Object.keys(currentPostResults).length;
  const currentShooterScoredRoundTargets = currentShooter
    ? Object.values(targetResults[currentShooter.localId] || {}).reduce(
        (sum, postResults) => sum + Object.keys(postResults).length,
        0,
      )
    : 0;
  const currentShooterRemainingTargets = Math.max(
    (isCompak ? COMPAK_TOTAL_TARGETS : targetsPerPost) -
      (isCompak ? currentShooterScoredRoundTargets : currentShooterScoredTargets),
    0,
  );

  useEffect(() => {
    if (isNew) return;
    loadScoreSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId, isNew]);

  useEffect(() => {
    if (!titleAutoGenerated) return;
    setTitle(generateTrainingScoreSheetTitle(discipline, location, sessionDate));
  }, [discipline, location, sessionDate, titleAutoGenerated]);

  useEffect(() => {
    if (validShooters.length === 0) {
      setCurrentShooterId("");
      return;
    }
    if (
      !validShooters.some((shooter) => shooter.localId === currentShooterId)
    ) {
      setCurrentShooterId(
        orderedShootersForPost(validShooters, currentPost)[0].localId,
      );
    }
  }, [currentPost, currentShooterId, validShooters]);

  useEffect(() => {
    setCurrentPost((value) => Math.min(Math.max(value, 1), numberOfPosts));
    setCurrentTarget((value) => Math.min(Math.max(value, 1), targetsPerPost));
  }, [numberOfPosts, targetsPerPost]);

  useEffect(() => {
    if (!isCompak) return;
    setCurrentCompakSequenceIndex((value) =>
      Math.min(Math.max(value, 0), Math.max(currentCompakProgram.length - 1, 0)),
    );
    setCurrentCompakTargetInSequence((value) =>
      Math.min(
        Math.max(value, 1),
        Math.max(currentCompakSequence?.targets.length || 1, 1),
      ),
    );
    if (currentCompakSequence) setCurrentPost(currentCompakSequence.standNumber);
    if (currentCompakTarget) setCurrentTarget(currentCompakTarget.targetNumber);
  }, [currentCompakProgram.length, currentCompakSequence, currentCompakTarget, isCompak]);

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
        "id,title,session_date,location,discipline,session_type,number_of_posts,targets_per_post,total_targets,compak_scheme_id,compak_shooting_mode",
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

    setTitleAutoGenerated(false);
    setTitle(sheet.title || "Training score sheet");
    setSessionDate((sheet.session_date || todayValue()).slice(0, 10));
    setLocation(sheet.location || "");
    setDiscipline(sheet.discipline || LEIRDUESTI);
    setSessionType(sheet.session_type || "training");
    setNumberOfPosts(sheet.number_of_posts || 5);
    setTargetsPerPost(sheet.targets_per_post || 10);
    setCompakSchemeId(normalizeCompakSchemeId(sheet.compak_scheme_id));
    setCompakShootingMode(normalizeCompakShootingMode(sheet.compak_shooting_mode));

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

    setShooters(loadedShooters);
    setTargetResults(loadedTargetResults);
    setInputHistory([]);
    if (isCompakSporting(sheet.discipline || "")) {
      await loadCompakSchemeRows(normalizeCompakSchemeId(sheet.compak_scheme_id));
    }
    setLoading(false);
  }

  async function loadCompakSchemeRows(schemeNumber: number) {
    const { data, error } = await supabase
      .from("fitasc_compak_schemes")
      .select("scheme_number,plate_number,event_number,presentation,first_machine,second_machine,is_verified")
      .eq("scheme_number", schemeNumber)
      .returns<CompakSchemeRow[]>();
    if (!error) setCompakSchemeRows(data || []);
  }

  function applyCompakDefaults() {
    setNumberOfPosts(COMPAK_DEFAULT_STANDS);
    setTargetsPerPost(COMPAK_TARGETS_PER_STAND);
    setSessionType((value) => (value === "shared_training" ? value : "training"));
    setShooters((current) =>
      current.map((shooter) => ({
        ...shooter,
        scores: makeScores(COMPAK_DEFAULT_STANDS, shooter.scores).map((score) =>
          clampScore(score, COMPAK_TARGETS_PER_STAND),
        ),
      })),
    );
    setTargetResults((current) =>
      trimTargetResults(current, COMPAK_DEFAULT_STANDS, COMPAK_TARGETS_PER_STAND),
    );
  }

  function updateTrainingTitle(nextTitle: string) {
    setTitle(nextTitle);
    setTitleAutoGenerated(false);
  }

  function updateDiscipline(nextDiscipline: string) {
    setDiscipline(nextDiscipline);
    if (isCompakSporting(nextDiscipline)) {
      applyCompakDefaults();
      loadCompakSchemeRows(compakSchemeId);
    }
  }

  function updateCompakScheme(nextScheme: number) {
    const safeScheme = normalizeCompakSchemeId(nextScheme);
    setCompakSchemeId(safeScheme);
    loadCompakSchemeRows(safeScheme);
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

  function moveShooter(localId: string, direction: 1 | -1) {
    if (hasEnteredScores) {
      const confirmed = window.confirm(
        "Scores stay attached to each shooter, but this changes the display order and Compak shooter numbers. Continue?",
      );
      if (!confirmed) return;
    }
    setShooters((current) => {
      const index = current.findIndex((shooter) => shooter.localId === localId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function addShooter() {
    const name = formatShooterName(newShooterName);
    if (!name) {
      setErr("Enter a shooter name before adding a new shooter.");
      return;
    }
    setErr("");
    setShooters((current) => [
      ...current,
      { localId: crypto.randomUUID(), name, scores: makeScores(numberOfPosts) },
    ]);
    setNewShooterName("");
  }

  function removeShooter(localId: string) {
    setShooters((current) =>
      current.filter((shooter) => shooter.localId !== localId),
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

  function setPostAndStartingShooter(postNumber: number) {
    const safePost = Math.min(Math.max(postNumber, 1), numberOfPosts);
    setCurrentPost(safePost);
    if (isCompak) {
      const sequenceIndex = currentCompakProgram.findIndex(
        (sequence) => sequence.standNumber === safePost,
      );
      if (sequenceIndex >= 0) setCurrentCompakSequenceIndex(sequenceIndex);
      setCurrentCompakTargetInSequence(1);
      if (validShooters[0] && !currentShooterId) {
        setCurrentShooterId(validShooters[0].localId);
      }
      return;
    }
    const orderedShooters = orderedShootersForPost(validShooters, safePost);
    if (orderedShooters[0]) setCurrentShooterId(orderedShooters[0].localId);
    setCurrentTarget(1);
  }

  function goToAdjacentShooter(direction: 1 | -1) {
    if (currentPostShooters.length === 0) return;
    const activeIndex =
      currentShooterOrderIndex >= 0 ? currentShooterOrderIndex : 0;
    const nextIndex =
      (activeIndex + direction + currentPostShooters.length) %
      currentPostShooters.length;
    setCurrentShooterId(currentPostShooters[nextIndex].localId);
    setCurrentCompakTargetInSequence(1);
    setCurrentTarget(1);
  }

  function advanceCompakLiveCursor(scoredSequence: CompakSequence) {
    if (!currentShooter) return;
    if (currentCompakTargetInSequence < scoredSequence.targets.length) {
      setCurrentCompakTargetInSequence((value) => value + 1);
      return;
    }

    setCurrentCompakTargetInSequence(1);
    if (compakShootingMode === "Squad") {
      if (currentShooterOrderIndex < currentPostShooters.length - 1) {
        setCurrentShooterId(currentPostShooters[currentShooterOrderIndex + 1].localId);
        return;
      }
      setCurrentShooterId(currentPostShooters[0]?.localId || "");
      setCurrentCompakSequenceIndex((value) =>
        Math.min(value + 1, Math.max(currentCompakProgram.length - 1, 0)),
      );
      return;
    }

    // Inline mode is intentionally separate: one shooter advances through the
    // scheme sequence before moving to the next shooter. Full FITASC inline
    // field movement can be refined later without changing target storage.
    if (currentCompakSequenceIndex < currentCompakProgram.length - 1) {
      setCurrentCompakSequenceIndex((value) => value + 1);
      return;
    }
    if (currentShooterOrderIndex < currentPostShooters.length - 1) {
      setCurrentShooterId(currentPostShooters[currentShooterOrderIndex + 1].localId);
      setCurrentCompakSequenceIndex(0);
    }
  }

  function advanceLiveCursor() {
    if (isCompak) {
      if (currentCompakSequence) advanceCompakLiveCursor(currentCompakSequence);
      return;
    }
    if (currentShooterOrderIndex < 0) return;
    if (currentTarget < targetsPerPost) {
      setCurrentTarget((value) => value + 1);
      return;
    }
    if (currentShooterOrderIndex < currentPostShooters.length - 1) {
      setCurrentShooterId(
        currentPostShooters[currentShooterOrderIndex + 1].localId,
      );
      setCurrentTarget(1);
      return;
    }
    if (currentPost < numberOfPosts) {
      const nextPost = currentPost + 1;
      setCurrentPost(nextPost);
      const nextPostShooters = orderedShootersForPost(validShooters, nextPost);
      if (nextPostShooters[0]) {
        setCurrentShooterId(nextPostShooters[0].localId);
      }
      setCurrentTarget(1);
    }
  }

  function toggleLiveMode() {
    setLiveMode((value) => {
      const nextValue = !value;
      setShowSetupDuringLive(false);
      if (nextValue && validShooters.length > 0) {
        if (isCompak) {
          setCurrentShooterId(validShooters[0].localId);
          setCurrentCompakSequenceIndex(0);
          setCurrentCompakTargetInSequence(1);
        } else {
          const orderedShooters = orderedShootersForPost(
            validShooters,
            currentPost,
          );
          if (orderedShooters[0]) {
            setCurrentShooterId(orderedShooters[0].localId);
          }
        }
      }
      return nextValue;
    });
  }

  function markTarget(result: TargetResultValue) {
    if (!currentShooterId) return;
    const postNumber = activePostNumber;
    const targetNumber = activeTargetNumber;
    const previousResult =
      targetResults[currentShooterId]?.[postNumber]?.[targetNumber] || null;
    const nextTargetResults: TargetResultMap = {
      ...targetResults,
      [currentShooterId]: {
        ...(targetResults[currentShooterId] || {}),
        [postNumber]: {
          ...(targetResults[currentShooterId]?.[postNumber] || {}),
          [targetNumber]: result,
        },
      },
    };
    setTargetResults(nextTargetResults);
    syncShooterPostScore(currentShooterId, postNumber, nextTargetResults);
    setInputHistory((current) => [
      ...current,
      {
        shooterId: currentShooterId,
        postNumber,
        targetNumber,
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
    if (isCompak) {
      const shooterOrder =
        validShooters.findIndex((shooter) => shooter.localId === shooterId) + 1;
      const program = buildCompakRoundProgram(
        compakSchemeId,
        compakStartPlateForOrderNumber(shooterOrder),
        compakSchemeRows,
      );
      const sequenceIndex = program.findIndex(
        (sequence) =>
          sequence.standNumber === postNumber &&
          sequence.targets.some((target) => target.targetNumber === targetNumber),
      );
      if (sequenceIndex >= 0) {
        const targetIndex = program[sequenceIndex].targets.findIndex(
          (target) => target.targetNumber === targetNumber,
        );
        setCurrentCompakSequenceIndex(sequenceIndex);
        setCurrentCompakTargetInSequence(targetIndex + 1);
      }
    }
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
    correctTarget(
      lastInput.shooterId,
      lastInput.postNumber,
      lastInput.targetNumber,
    );
  }

  function validate() {
    const namedShooters = shooters.filter((shooter) =>
      formatShooterName(shooter.name),
    );
    if (!title.trim()) return "Add a training name.";
    if (!sessionDate) return "Choose a date.";
    if (!discipline) return "Choose a discipline.";
    if (numberOfPosts < 1) return isCompak ? "Add at least one stand." : "Add at least one post.";
    if (targetsPerPost < 1) return isCompak ? "Targets per stand must be at least 1." : "Targets per post must be at least 1.";
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
      compak_scheme_id: isCompak ? String(compakSchemeId) : null,
      compak_shooting_mode: isCompak ? compakShootingMode : null,
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

    if (!isNew) {
      const { error: targetDeleteError } = await supabase
        .from("training_score_sheet_target_results")
        .delete()
        .eq("score_sheet_id", savedSheet.id);
      const { error: scoreDeleteError } = await supabase
        .from("training_score_sheet_scores")
        .delete()
        .eq("score_sheet_id", savedSheet.id);
      const keptShooterIds = namedShooters.map((shooter) => shooter.localId);
      const removedShooterDelete = supabase
        .from("training_score_sheet_shooters")
        .delete()
        .eq("score_sheet_id", savedSheet.id);
      const { error: shooterDeleteError } = keptShooterIds.length > 0
        ? await removedShooterDelete.not("id", "in", `(${keptShooterIds.join(",")})`)
        : await removedShooterDelete;
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

    const shooterRows = namedShooters.map((shooter, index) => ({
      id: shooter.localId,
      score_sheet_id: savedSheet.id,
      shooter_name: shooter.displayName,
      display_order: index + 1,
      total_score: totalFor(shooter, targetResults),
    }));

    const { error: shooterError } = await supabase
      .from("training_score_sheet_shooters")
      .upsert(shooterRows, { onConflict: "id" });

    if (shooterError) {
      setErr(shooterError.message || "Could not save shooters.");
      setSaving(false);
      return;
    }

    const scoreRows = namedShooters.flatMap((shooter) =>
      shooter.scores.map((score, scoreIndex) => ({
        score_sheet_id: savedSheet.id,
        shooter_id: shooter.localId,
        post_number: scoreIndex + 1,
        score: clampScore(
          displayedPostScore(shooter, scoreIndex, targetResults),
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

    const targetRows = namedShooters.flatMap((shooter) =>
      Object.entries(targetResults[shooter.localId] || {}).flatMap(
        ([postKey, targets]) =>
          Object.entries(targets).map(([targetKey, result]) => ({
            score_sheet_id: savedSheet.id,
            shooter_id: shooter.localId,
            post_number: Number(postKey),
            target_number: Number(targetKey),
            result,
          })),
      ),
    );

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
              {isCompak
                ? "Compak Sporting training setup with shooter order and target-by-target scoring."
                : "Fast post-by-post scoring for one organizer and multiple shooters."}
            </p>
          </div>
          <span className="badge badgeGreen">
            {sessionTypeLabel(sessionType)}
          </span>
        </div>

        {liveMode && (
          <div className="setupVisibilityToggle">
            <button
              type="button"
              className="secondary smallButton"
              onClick={() => setShowSetupDuringLive((value) => !value)}
            >
              {showSetupDuringLive ? "Hide setup" : "Show setup"}
            </button>
            <span className="small muted">
              Setup is hidden by default so live scoring stays front and center.
            </span>
          </div>
        )}

        <details
          className={`subcard collapsibleSubcard ${
            setupSectionsOpen ? "" : "setupSectionHidden"
          }`}
          open={setupSectionsOpen}
        >
          <summary>
            <span>Training details</span>
            <span className="small muted">
              {isCompak ? `${COMPAK_DEFAULT_STANDS} stands × ${COMPAK_TARGETS_PER_STAND} targets` : `${numberOfPosts} posts × ${targetsPerPost} targets`}
            </span>
          </summary>
          <div className="row">
            <div>
              <label>Training name</label>
              <input
                value={title}
                onChange={(event) => updateTrainingTitle(event.target.value)}
                placeholder={generateTrainingScoreSheetTitle(discipline, location, sessionDate)}
              />
              <p className="small muted">
                {titleAutoGenerated
                  ? "Auto-generated from discipline, location and date."
                  : "Custom title: discipline, location and date changes will not overwrite it."}
              </p>
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
                onChange={(event) => updateDiscipline(event.target.value)}
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
              <label>{isCompak ? "Number of stands / plates" : "Number of posts / stations"}</label>
              <input
                value={numberOfPosts}
                onChange={(event) =>
                  updatePostCount(Number(event.target.value))
                }
                disabled={isCompak}
                type="number"
                min="1"
                max="20"
                inputMode="numeric"
              />
            </div>
            <div>
              <label>{isCompak ? "Targets per stand" : "Targets per post"}</label>
              <input
                value={targetsPerPost}
                onChange={(event) =>
                  updateTargetsPerPost(Number(event.target.value))
                }
                disabled={isCompak}
                type="number"
                min="1"
                max="100"
                inputMode="numeric"
              />
            </div>
          </div>
          {isCompak && (
            <div className="compakSettingsPanel">
              <div>
                <h3>Compak Sporting training – basic scoring</h3>
                <p className="small muted">
                  Compak training uses 5 stands/plates, shooter numbers, start
                  plates and a selected scheme/program for a {COMPAK_TOTAL_TARGETS}-target round.
                  This mode reuses the target-by-target scoring engine while
                  keeping Compak-specific setup separate from ordinary post scoring.
                </p>
              </div>
              <div className="row">
                <div>
                  <label>Compak scheme / program</label>
                  <select
                    value={compakSchemeId}
                    onChange={(event) => updateCompakScheme(Number(event.target.value))}
                  >
                    {getAllSchemeNumbers().map((schemeNumber) => (
                      <option key={schemeNumber} value={schemeNumber}>
                        Scheme {schemeNumber} · {getCompakSchemeType(schemeNumber)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Shooting mode</label>
                  <select
                    value={compakShootingMode}
                    onChange={(event) =>
                      setCompakShootingMode(
                        normalizeCompakShootingMode(event.target.value),
                      )
                    }
                  >
                    <option>Squad</option>
                    <option>Inline</option>
                  </select>
                </div>
              </div>
              <p className="small muted">
                {compakSchemeRows.length > 0
                  ? "Loaded built-in FITASC/Compak scheme details for scheme-driven target labels."
                  : "No verified target-machine grid is stored for this scheme yet; live scoring follows the expected Compak presentation structure as a safe placeholder."}
                {compakShootingMode === "Inline"
                  ? " Inline mode is a basic per-shooter scheme flow until full field movement rules are added."
                  : " Squad mode rotates shooters after every scheme sequence."}
              </p>
            </div>
          )}
          {hasEnteredScores && (
            <p className="small muted">
              Changing post setup keeps existing scores where possible and
              clamps scores to the new max.
            </p>
          )}
          <p className="small muted">
            Total targets per shooter: {sheetTotalTargets}
          </p>
        </details>

        <details
          className={`subcard collapsibleSubcard ${
            setupSectionsOpen ? "" : "setupSectionHidden"
          }`}
          open={setupSectionsOpen}
        >
          <summary>
            <span>Shooter setup</span>
            <span className="small muted">
              {validShooters.length || 0} ready
            </span>
          </summary>
          <div className="shooterSetupHelp">
            <h3>Add a new shooter</h3>
            <p className="small muted">
              Use this field only to add another shooter to the score sheet.
              Existing shooters are edited in the numbered list below.
            </p>
          </div>
          <div className="addShooterRow">
            <label>
              New shooter name
              <input
                value={newShooterName}
                onChange={(event) => setNewShooterName(event.target.value)}
                placeholder="Type a new shooter name"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addShooter();
                  }
                }}
              />
            </label>
            <button type="button" className="secondary" onClick={addShooter}>
              Add shooter
            </button>
          </div>
          <div className="shooterSetupHelp editExistingShootersHeader">
            <h3>Edit existing shooters</h3>
            <p className="small muted">
              Numbered rows are existing shooters. Edit a name here only when
              correcting that shooter.
            </p>
          </div>
          <div className="shooterNameList">
            {shooters.length === 0 ? (
              <p className="emptyShooterListMessage">
                No shooters added yet. Add the first shooter above.
              </p>
            ) : (
              shooters.map((shooter, index) => (
                <div className="shooterNameRow" key={shooter.localId}>
                  <span className="shooterOrderBadge">
                    {isCompak ? `Shooter #${index + 1}` : `#${index + 1}`}
                    {isCompak && (
                      <small>{compakStartPlateForOrder(index + 1)}</small>
                    )}
                  </span>
                  <label>
                    Existing shooter {index + 1}
                    <input
                      value={shooter.name}
                      onChange={(event) =>
                        updateShooterName(shooter.localId, event.target.value)
                      }
                      onBlur={() => formatShooterNameInList(shooter.localId)}
                      placeholder={`Edit shooter ${index + 1} name`}
                    />
                  </label>
                  <div className="shooterOrderControls">
                    <button
                      type="button"
                      className="secondary smallButton"
                      onClick={() => moveShooter(shooter.localId, -1)}
                      disabled={index === 0}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="secondary smallButton"
                      onClick={() => moveShooter(shooter.localId, 1)}
                      disabled={index === shooters.length - 1}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className="secondary smallButton"
                      onClick={() => removeShooter(shooter.localId)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </details>

        <div className="subcard liveScoringCard">
          <div className="sectionHeader compactSectionHeader">
            <div>
              <h3>Live scoring mode</h3>
              <p className="small muted">
                Mark every target as hit or miss. Target-by-target results
                become the source of truth for that shooter and {isCompak ? "stand" : "post"}.
              </p>
            </div>
            <button
              type="button"
              className={liveMode ? "secondary" : ""}
              onClick={toggleLiveMode}
            >
              {liveMode ? "Hide live scoring" : "Start live scoring"}
            </button>
          </div>
          {liveMode && (
            <div className="liveScoringPanel">
              <div className="liveHero">
                <div>
                  <span className="small muted">{isCompak ? "Current stand / plate" : "Current post"}</span>
                  <strong>{isCompak ? `Stand ${activePostNumber}` : `Post ${currentPost}`}</strong>
                </div>
                <div>
                  <span className="small muted">Current shooter</span>
                  <strong>
                    {currentShooter?.displayName || "Add a shooter"}
                  </strong>
                  {isCompak && currentShooterNumber > 0 && (
                    <span className="small muted">Shooter #{currentShooterNumber} · starts {compakStartPlateForOrder(currentShooterNumber)}</span>
                  )}
                </div>
                <div>
                  <span className="small muted">{isCompak ? "Current scheme target" : "Current target"}</span>
                  <strong>Target {activeTargetNumber}</strong>
                  {isCompak && currentCompakSequence && currentCompakTarget && (
                    <span className="small muted">
                      Sequence {currentCompakSequence.sequenceIndex + 1} / {currentCompakProgram.length} · Event {currentCompakSequence.eventNumber} · {getPresentationLabel(currentCompakSequence.presentation)}
                      {currentCompakSequence.targets.length > 1
                        ? ` · target ${currentCompakTarget.targetInSequence} of ${currentCompakSequence.targets.length}`
                        : ""}
                    </span>
                  )}
                </div>
              </div>
              <div className="liveScoringStatus">
                <div>
                  <span className="small muted">{isCompak ? "Stand score" : "Post score"}</span>
                  <strong>
                    {currentShooterPostScore} / {targetsPerPost}
                  </strong>
                </div>
                <div>
                  <span className="small muted">Shooter total</span>
                  <strong>
                    {currentShooterTotal} / {sheetTotalTargets}
                  </strong>
                </div>
                <div>
                  <span className="small muted">{isCompak ? "Round targets left" : "Remaining targets"}</span>
                  <strong>{currentShooterRemainingTargets}</strong>
                </div>
              </div>
              {isCompak && currentCompakSequence && (
                <div className="compakLiveProgram">
                  <span className="small muted">Selected program</span>
                  <strong>Scheme {compakSchemeId} · {compakShootingMode}</strong>
                  <span>
                    Stand {currentCompakSequence.standNumber} · Event {currentCompakSequence.eventNumber} · {getPresentationLabel(currentCompakSequence.presentation)} · {currentCompakSequence.hasSchemeData
                      ? getMachineLabelFromRow({
                          first_machine: currentCompakSequence.firstMachine,
                          second_machine: currentCompakSequence.secondMachine,
                        })
                      : "Machine labels not stored yet"}
                  </span>
                  <span className="small muted">
                    Target letters: {currentCompakSequence.targets.map((target) => target.machine || "?").join(" + ")}
                  </span>
                </div>
              )}
              <div className="postShootingOrder">
                <h4>{isCompak ? `${compakShootingMode} shooting order` : `Post ${currentPost} shooting order`}</h4>
                <ol>
                  {currentPostShooters.map((shooter, index) => (
                    <li
                      key={shooter.localId}
                      className={
                        shooter.localId === currentShooterId ? "active" : ""
                      }
                    >
                      <span>{isCompak ? validShooters.findIndex((item) => item.localId === shooter.localId) + 1 : index + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentShooterId(shooter.localId);
                          setCurrentCompakTargetInSequence(1);
                          setCurrentTarget(1);
                        }}
                      >
                        {shooter.displayName}
                      </button>
                    </li>
                  ))}
                </ol>
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
                    {currentPostShooters.map((shooter) => (
                      <option key={shooter.localId} value={shooter.localId}>
                        {shooter.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {isCompak ? "Scheme sequence" : "Post"}
                  {isCompak ? (
                    <select
                      value={currentCompakSequenceIndex}
                      onChange={(event) => {
                        setCurrentCompakSequenceIndex(Number(event.target.value));
                        setCurrentCompakTargetInSequence(1);
                      }}
                    >
                      {currentCompakProgram.map((sequence) => (
                        <option key={sequence.sequenceIndex} value={sequence.sequenceIndex}>
                          {sequence.sequenceIndex + 1}. Stand {sequence.standNumber} · Event {sequence.eventNumber} · {getPresentationLabel(sequence.presentation)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={currentPost}
                      onChange={(event) =>
                        setPostAndStartingShooter(Number(event.target.value))
                      }
                    >
                      {postNumbers.map((post) => (
                        <option key={post} value={post}>
                          Post {post}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              </div>
              <div className="liveNavigationControls">
                <button
                  type="button"
                  className="secondary smallButton"
                  onClick={() => {
                    if (isCompak) {
                      setCurrentCompakSequenceIndex((value) => Math.max(value - 1, 0));
                      setCurrentCompakTargetInSequence(1);
                    } else {
                      setPostAndStartingShooter(currentPost - 1);
                    }
                  }}
                  disabled={isCompak ? currentCompakSequenceIndex <= 0 : currentPost <= 1}
                >
                  {isCompak ? "Previous sequence" : "Previous post"}
                </button>
                <button
                  type="button"
                  className="secondary smallButton"
                  onClick={() => goToAdjacentShooter(-1)}
                  disabled={currentPostShooters.length < 2}
                >
                  Previous shooter
                </button>
                <button
                  type="button"
                  className="secondary smallButton"
                  onClick={() => goToAdjacentShooter(1)}
                  disabled={currentPostShooters.length < 2}
                >
                  Next shooter
                </button>
                <button
                  type="button"
                  className="secondary smallButton"
                  onClick={() => {
                    if (isCompak) {
                      setCurrentCompakSequenceIndex((value) =>
                        Math.min(value + 1, Math.max(currentCompakProgram.length - 1, 0)),
                      );
                      setCurrentCompakTargetInSequence(1);
                    } else {
                      setPostAndStartingShooter(currentPost + 1);
                    }
                  }}
                  disabled={
                    isCompak
                      ? currentCompakSequenceIndex >= currentCompakProgram.length - 1
                      : currentPost >= numberOfPosts
                  }
                >
                  {isCompak ? "Next sequence" : "Next post"}
                </button>
              </div>
              <div className="liveScoringActions">
                <button
                  type="button"
                  className="hitButton"
                  onClick={() => markTarget("hit")}
                  disabled={!currentShooter || (isCompak && !currentCompakTarget)}
                >
                  {isCompak && currentCompakTarget?.machine
                    ? `Hit ${currentCompakTarget.machine}`
                    : "Hit"}
                </button>
                <button
                  type="button"
                  className="missButton"
                  onClick={() => markTarget("miss")}
                  disabled={!currentShooter || (isCompak && !currentCompakTarget)}
                >
                  {isCompak && currentCompakTarget?.machine
                    ? `Miss ${currentCompakTarget.machine}`
                    : "Miss"}
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
                <div className="targetProgressPanel">
                  <div className="compactPanelHeader">
                    <h4>{currentShooter.displayName} target progress</h4>
                    <span className="small muted">
                      Tap a scored target to correct it.
                    </span>
                  </div>
                  <div
                    className="targetCorrectionGrid"
                    aria-label="Target correction grid"
                  >
                    {targetNumbers.map((targetNumber) => {
                      const result = currentPostResults[targetNumber];
                      const isCurrentTarget = targetNumber === activeTargetNumber;
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
                              activePostNumber,
                              targetNumber,
                            )
                          }
                          aria-label={`${currentShooter.displayName} ${isCompak ? "stand" : "post"} ${activePostNumber} target ${targetNumber} ${result || "not scored"}`}
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
                </div>
              )}
            </div>
          )}
        </div>

        <details
          className={`subcard collapsibleSubcard ${
            setupSectionsOpen ? "" : "setupSectionHidden"
          }`}
          open={setupSectionsOpen}
        >
          <summary>
            <span>{isCompak ? "Scores by stand" : "Scores by post"}</span>
            <span className="small muted">{isCompak ? "Stand-total overview" : "Post-total overview"}</span>
          </summary>
          <div className="sectionHeader compactSectionHeader">
            <div>
              <h3>{isCompak ? "Scores by stand" : "Scores by post"}</h3>
              <p className="small muted">
                Existing {isCompak ? "stand-total" : "post-total"} score entry remains available. When a {isCompak ? "stand" : "post"}
                has live target results, its target hits calculate the {isCompak ? "stand" : "post"}
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
                    <th key={post}>{isCompak ? `Stand ${post}` : `Post ${post}`}</th>
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
                              aria-label={`${shooter.displayName} ${isCompak ? "stand" : "post"} ${post}`}
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
        </details>

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
