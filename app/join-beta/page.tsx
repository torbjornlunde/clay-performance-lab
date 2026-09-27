import { redirect } from "next/navigation";

// Existing social links to the old waitlist should lead straight to signup.
export default function JoinBetaPage() {
  redirect("/login?signup=1");
}
