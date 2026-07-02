import { scoreFromMisses, totalMisses } from "@/lib/misses/scoring";

export type ExportSession = {
  id: string;
  name: string;
  discipline: string;
  session_type: string;
  shooting_format?: string | null;
  course_count?: number | null;
  total_targets?: number | null;
  created_at: string;
  competition_date?: string | null;
  own_score?: number | null;
  winning_score?: number | null;
  calculated_score?: number | null;
  leirdue_result_url?: string | null;
  shooting_ground?: string | null;
  notes?: string | null;
};

export type ExportMiss = {
  session_id: string;
  course_number?: number | null;
  plate?: number | null;
  target_number?: number | null;
  target_label?: string | null;
  target_type?: string | null;
  base_presentation?: string | null;
  actual_presentation?: string | null;
  presented_pair_label?: string | null;
  shooting_order_label?: string | null;
  is_reversed_order?: boolean | null;
  missed_target?: string | null;
  where_miss?: string | null;
  main_reason?: string | null;
  target_read?: string | null;
  comment?: string | null;
  first_where_miss?: string | null;
  first_main_reason?: string | null;
  first_target_read?: string | null;
  first_comment?: string | null;
  second_where_miss?: string | null;
  second_main_reason?: string | null;
  second_target_read?: string | null;
  second_comment?: string | null;
  created_at: string;
};

export type ExportCourse = {
  session_id: string;
  course_number: number;
  fitasc_scheme?: number | null;
  shooter_number?: number | null;
  start_plate?: number | null;
};

export type ExportTargetDefinition = {
  session_id: string;
  course_number: number;
  machine: string;
  target_type?: string | null;
  direction?: string | null;
  angle?: string | null;
  speed?: string | null;
  distance?: string | null;
  difficulty?: string | null;
  notes?: string | null;
};

export type ExportPostTarget = {
  session_id: string;
  post_number: number;
  target_position: number;
  presentation_number: number;
  presentation_type?: string | null;
  position_in_presentation: number;
  target_label?: string | null;
  target_type?: string | null;
  direction?: string | null;
  angle?: string | null;
  speed?: string | null;
  distance?: string | null;
  difficulty?: string | null;
  notes?: string | null;
};

export type ExportUserDataInput = {
  sessions: ExportSession[];
  misses: ExportMiss[];
  courses: ExportCourse[];
  targetDefinitions: ExportTargetDefinition[];
  postTargets?: ExportPostTarget[];
  exportCreatedAt?: Date;
};

type SheetValue = string | number | null;
type SheetRow = Record<string, SheetValue>;
type WorkbookSheet = { name: string; rows: SheetRow[]; headers: string[] };
type UserDataWorkbook = { sheets: WorkbookSheet[] };

function isUsableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanExportLabel(value?: string | null) {
  return (
    value
      ?.replace(/equal pair/gi, "Report pair")
      .replace(/repeated pair/gi, "Report pair") || null
  );
}

function formatDateOnly(value?: string | null) {
  if (!value) return null;
  return value.slice(0, 10);
}

function sessionDate(session: ExportSession) {
  return formatDateOnly(session.competition_date || session.created_at);
}

function missCountFor(sessionId: string, misses: ExportMiss[]) {
  return totalMisses(misses.filter((miss) => miss.session_id === sessionId));
}

function scoreUsed(session: ExportSession, misses: ExportMiss[]) {
  if (isUsableNumber(session.own_score)) return session.own_score;
  if (isUsableNumber(session.calculated_score)) return session.calculated_score;
  if (isUsableNumber(session.total_targets))
    return scoreFromMisses(session.total_targets, missCountFor(session.id, misses));
  return null;
}

function performancePercentage(session: ExportSession, misses: ExportMiss[]) {
  const score = scoreUsed(session, misses);
  if (
    !isUsableNumber(score) ||
    !isUsableNumber(session.winning_score) ||
    session.winning_score <= 0
  )
    return null;
  return (score / session.winning_score) * 100;
}

function isResultOnly(session: ExportSession, misses: ExportMiss[]) {
  return Boolean(
    isUsableNumber(session.own_score) &&
    isUsableNumber(session.winning_score) &&
    missCountFor(session.id, misses) === 0 &&
    !session.course_count,
  );
}

function addSheet(
  workbook: UserDataWorkbook,
  name: string,
  rows: SheetRow[],
  headers: string[],
) {
  workbook.sheets.push({ name, rows, headers });
}

function escapeXml(value: SheetValue) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function spreadsheetCell(value: SheetValue) {
  const type = typeof value === "number" ? "Number" : "String";
  return `<Cell><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`;
}

function workbookToSpreadsheetXml(workbook: UserDataWorkbook) {
  const worksheets = workbook.sheets
    .map((sheet) => {
      const headerRow = `<Row>${sheet.headers.map((header) => spreadsheetCell(header)).join("")}</Row>`;
      const rows = sheet.rows
        .map(
          (row) =>
            `<Row>${sheet.headers.map((header) => spreadsheetCell(row[header] ?? null)).join("")}</Row>`,
        )
        .join("");
      return `<Worksheet ss:Name="${escapeXml(sheet.name)}"><Table>${headerRow}${rows}</Table></Worksheet>`;
    })
    .join("");

  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${worksheets}</Workbook>`;
}

export function createUserDataWorkbook(input: ExportUserDataInput) {
  const exportCreatedAt = input.exportCreatedAt || new Date();
  const workbook: UserDataWorkbook = { sheets: [] };
  const sessionsById = new Map(
    input.sessions.map((session) => [session.id, session]),
  );
  const sortedSessions = input.sessions
    .slice()
    .sort((a, b) =>
      String(sessionDate(b)).localeCompare(String(sessionDate(a))),
    );
  const performanceValues = sortedSessions
    .map((session) => performancePercentage(session, input.misses))
    .filter((value): value is number => value !== null);

  addSheet(
    workbook,
    "Sessions",
    sortedSessions.map((session) => ({
      Date: sessionDate(session),
      Name: session.name,
      Discipline: session.discipline,
      "Shooting ground": session.shooting_ground || null,
      "Session type": session.session_type,
      "Shooting format": session.shooting_format || null,
      "Total targets": session.total_targets ?? null,
      "Own score": scoreUsed(session, input.misses),
      "Winning score": session.winning_score ?? null,
      "Performance %": performancePercentage(session, input.misses),
      "Leirdue URL": session.leirdue_result_url || null,
      Notes: session.notes || null,
      "Created at": session.created_at,
    })),
    [
      "Date",
      "Name",
      "Discipline",
      "Shooting ground",
      "Session type",
      "Shooting format",
      "Total targets",
      "Own score",
      "Winning score",
      "Performance %",
      "Leirdue URL",
      "Notes",
      "Created at",
    ],
  );

  addSheet(
    workbook,
    "Misses",
    input.misses.map((miss) => {
      const session = sessionsById.get(miss.session_id);
      return {
        "Session name": session?.name || null,
        "Session date": session ? sessionDate(session) : null,
        Discipline: session?.discipline || null,
        "Shooting ground": session?.shooting_ground || null,
        "Course/Post": miss.course_number ?? null,
        "Plate/Stand": miss.plate ?? null,
        "Target number / round if available": miss.target_number ?? null,
        "Target label": miss.target_label || null,
        "Target type": cleanExportLabel(miss.target_type),
        "Base presentation": cleanExportLabel(miss.base_presentation),
        "Actual presentation": cleanExportLabel(
          miss.actual_presentation || miss.target_type,
        ),
        "Presented pair": miss.presented_pair_label || null,
        "Shooting order": miss.shooting_order_label || null,
        "Reversed order": miss.is_reversed_order ? "Yes" : "No",
        "Missed target": cleanExportLabel(miss.missed_target),
        "Where miss": miss.where_miss || null,
        "Main reason": miss.main_reason || null,
        "Target read": miss.target_read || null,
        Comment: miss.comment || null,
        "First target where miss": miss.first_where_miss || null,
        "First target reason": miss.first_main_reason || null,
        "First target read": miss.first_target_read || null,
        "First target comment": miss.first_comment || null,
        "Second target where miss": miss.second_where_miss || null,
        "Second target reason": miss.second_main_reason || null,
        "Second target read": miss.second_target_read || null,
        "Second target comment": miss.second_comment || null,
        "Created at": miss.created_at,
      };
    }),
    [
      "Session name",
      "Session date",
      "Discipline",
      "Shooting ground",
      "Course/Post",
      "Plate/Stand",
      "Target number / round if available",
      "Target label",
      "Target type",
      "Base presentation",
      "Actual presentation",
      "Presented pair",
      "Shooting order",
      "Reversed order",
      "Missed target",
      "Where miss",
      "Main reason",
      "Target read",
      "Comment",
      "First target where miss",
      "First target reason",
      "First target read",
      "First target comment",
      "Second target where miss",
      "Second target reason",
      "Second target read",
      "Second target comment",
      "Created at",
    ],
  );

  addSheet(
    workbook,
    "Courses",
    input.courses.map((course) => ({
      "Session name": sessionsById.get(course.session_id)?.name || null,
      "Shooting ground":
        sessionsById.get(course.session_id)?.shooting_ground || null,
      "Course number": course.course_number,
      "FITASC scheme": course.fitasc_scheme ?? null,
      "Shooter number": course.shooter_number ?? null,
      "Start plate": course.start_plate ?? null,
    })),
    [
      "Session name",
      "Shooting ground",
      "Course number",
      "FITASC scheme",
      "Shooter number",
      "Start plate",
    ],
  );

  addSheet(
    workbook,
    "Target definitions",
    input.targetDefinitions.map((definition) => ({
      "Session name": sessionsById.get(definition.session_id)?.name || null,
      "Shooting ground":
        sessionsById.get(definition.session_id)?.shooting_ground || null,
      "Course number": definition.course_number,
      Machine: definition.machine,
      "Target type": cleanExportLabel(definition.target_type),
      Direction: definition.direction || null,
      Angle: definition.angle || null,
      Speed: definition.speed || null,
      Distance: definition.distance || null,
      Difficulty: definition.difficulty || null,
      Notes: definition.notes || null,
    })),
    [
      "Session name",
      "Shooting ground",
      "Course number",
      "Machine",
      "Target type",
      "Direction",
      "Angle",
      "Speed",
      "Distance",
      "Difficulty",
      "Notes",
    ],
  );

  addSheet(
    workbook,
    "Post targets",
    (input.postTargets || []).map((target) => ({
      "Session name": sessionsById.get(target.session_id)?.name || null,
      "Shooting ground":
        sessionsById.get(target.session_id)?.shooting_ground || null,
      "Post/Stand number": target.post_number,
      "Target position": target.target_position,
      "Presentation number": target.presentation_number,
      "Presentation type": cleanExportLabel(target.presentation_type),
      "Position in presentation": target.position_in_presentation,
      "Target label": target.target_label || null,
      "Target type": cleanExportLabel(target.target_type),
      Direction: target.direction || null,
      Angle: target.angle || null,
      Speed: target.speed || null,
      Distance: target.distance || null,
      Difficulty: target.difficulty || null,
      Notes: target.notes || null,
    })),
    [
      "Session name",
      "Shooting ground",
      "Post/Stand number",
      "Target position",
      "Presentation number",
      "Presentation type",
      "Position in presentation",
      "Target label",
      "Target type",
      "Direction",
      "Angle",
      "Speed",
      "Distance",
      "Difficulty",
      "Notes",
    ],
  );

  addSheet(
    workbook,
    "Summary",
    [
      { Metric: "Total sessions", Value: sortedSessions.length },
      {
        Metric: "Total competitions",
        Value: sortedSessions.filter(
          (session) =>
            session.session_type === "Competition" &&
            !isResultOnly(session, input.misses),
        ).length,
      },
      {
        Metric: "Total training sessions",
        Value: sortedSessions.filter(
          (session) =>
            session.session_type !== "Competition" &&
            !isResultOnly(session, input.misses),
        ).length,
      },
      {
        Metric: "Total result-only entries if detectable",
        Value: sortedSessions.filter((session) =>
          isResultOnly(session, input.misses),
        ).length,
      },
      { Metric: "Total misses", Value: totalMisses(input.misses) },
      {
        Metric: "Average performance % where winning score exists",
        Value: performanceValues.length
          ? performanceValues.reduce((sum, value) => sum + value, 0) /
            performanceValues.length
          : null,
      },
      {
        Metric: "Best performance %",
        Value: performanceValues.length ? Math.max(...performanceValues) : null,
      },
      { Metric: "Export created at", Value: exportCreatedAt.toISOString() },
    ],
    ["Metric", "Value"],
  );

  return workbook;
}

export function exportUserDataToExcel(
  input: ExportUserDataInput,
  filename: string,
) {
  const workbookXml = workbookToSpreadsheetXml(createUserDataWorkbook(input));
  const blob = new Blob([workbookXml], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportFileName(date = new Date()) {
  return `clay-performance-lab-export-${date.toISOString().slice(0, 10)}.xls`;
}
