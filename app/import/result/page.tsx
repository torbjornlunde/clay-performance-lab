import { redirect } from "next/navigation";

// Keep bookmarks from the previous import hub working.
export default function LegacyImportHub() {
  redirect("/import");
}
