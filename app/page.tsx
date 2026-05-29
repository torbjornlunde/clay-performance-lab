import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <div className="heroCard publicHero">
        <div>
          <p className="eyebrow">Clay Performance Lab</p>
          <h2>Mobile-first performance logging for clay target shooters.</h2>
          <p>Log training and competition misses, save result-only scores, and review performance against winning scores.</p>
        </div>
        <div className="btns heroActions">
          <Link href="/login" className="button">
            Login / create account
          </Link>
        </div>
      </div>
    </main>
  );
}
