import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <div className="card">
        <h2>Clay Performance Lab</h2>
        <p>Mobile-first performance logging for clay target shooters.</p>
        <div className="btns">
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
