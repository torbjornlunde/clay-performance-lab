export async function readAllSharedRows<Row>(
  fetchPage: (start: number, end: number) => Promise<{ data: Row[] | null; error: { message: string } | null }>,
  pageSize = 500,
  maxRows = 10000,
) {
  const rows: Row[] = [];
  for (let start = 0; start < maxRows; start += pageSize) {
    const { data, error } = await fetchPage(start, start + pageSize - 1);
    if (error) return { rows: [] as Row[], error };
    rows.push(...(data || []));
    if ((data || []).length < pageSize) return { rows, error: null };
  }
  return { rows: [] as Row[], error: new Error("Shared Leirdue name lookup exceeded its safe page limit.") };
}
