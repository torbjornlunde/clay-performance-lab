import Link from "next/link";

export default function HomePage() {
  return (
    <main className="authMain">
      <div className="card authCard">
        <p className="eyebrow">Clay Performance Lab</p>
        <h2>Mobile-first performance logging for clay target shooters.</h2>
        <p className="compactCopy">Login or create an account to open your protected shooter workspace.</p>
        <div className="btns stackedOnMobile">
          <Link href="/login" className="button">
            Login
          </Link>
          <Link href="/login" className="button secondary">
            Create account
          </Link>
        </div>
      </div>
    </main>
  );
}
