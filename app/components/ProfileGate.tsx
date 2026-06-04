"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isShooterProfileComplete, type ShooterProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase/client";

const ONBOARDING_PROFILE_PATH = "/onboarding/profile";

function isPublicPath(pathname: string) {
  return pathname === "/" || pathname === "/login";
}

export default function ProfileGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(isPublicPath(pathname));

  useEffect(() => {
    let active = true;
    const currentPath = pathname;

    if (isPublicPath(currentPath)) {
      setReady(true);
      return () => {
        active = false;
      };
    }

    async function checkProfile() {
      setReady(false);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!active) return;

      if (userError || !userData.user) {
        router.replace("/login");
        setReady(false);
        return;
      }

      const { data, error: profileError } = await supabase
        .from("shooter_profiles")
        .select("shooter_name,country,my_disciplines")
        .eq("user_id", userData.user.id)
        .maybeSingle<Pick<ShooterProfile, "shooter_name" | "country" | "my_disciplines">>();

      if (!active) return;

      if (profileError || !isShooterProfileComplete(data)) {
        if (currentPath !== ONBOARDING_PROFILE_PATH) {
          router.replace(ONBOARDING_PROFILE_PATH);
          setReady(false);
          return;
        }
        setReady(true);
        return;
      }

      if (currentPath === ONBOARDING_PROFILE_PATH) {
        router.replace("/dashboard");
        setReady(false);
        return;
      }

      setReady(true);
    }

    checkProfile();

    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (!ready && !isPublicPath(pathname)) {
    return (
      <main>
        <div className="card">
          <p>Loading profile...</p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
