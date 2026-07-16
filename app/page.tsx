import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <div className="heroCard publicHero">
        <div>
          <p className="eyebrow">Clay Performance Lab</p>
          <h2>Your clay shooting results, schemes, and training insights in one place.</h2>
          <p>Plan sessions, view schemes, log misses, save results, and track your progress over time.</p>
        </div>
        <div className="btns heroActions">
          <Link href="/login" className="button">
            Login / create account
          </Link>
          <Link href="/join-beta" className="button secondary">
            Join the closed beta
          </Link>
        </div>
      </div>
    </main>
  );
}
