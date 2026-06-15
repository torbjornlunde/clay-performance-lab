"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canManageBetaAccess, type UserAccessProfile } from "@/lib/access";
import { isShooterProfileComplete, type ShooterProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase/client";

const ONBOARDING_PROFILE_PATH = "/onboarding/profile";
const BETA_ACCESS_PATH = "/beta/access";
const BETA_ADMIN_PATH = "/beta/admin";
const COMPLETE_PROFILE_PATH = "/complete-profile";

function isPublicPath(pathname: string) {
  return pathname === "/" || pathname === "/login";
}

function isBetaBlockedPath(pathname: string) {
  return pathname === BETA_ACCESS_PATH;
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

      await supabase.rpc("sync_my_access_profile");
      const { data: accessProfile, error: accessError } = await supabase
        .from("user_access_profiles")
        .select("user_id,email,full_name,access_status,system_role,account_type,created_at,updated_at,approved_at,approved_by")
        .eq("user_id", userData.user.id)
        .maybeSingle<UserAccessProfile>();

      if (!active) return;

      if (accessError) {
        if (!isBetaBlockedPath(currentPath)) {
          router.replace(BETA_ACCESS_PATH);
          setReady(false);
          return;
        }
        setReady(true);
        return;
      }

      const hasFullName = Boolean(accessProfile?.full_name?.trim());
      const managesBetaAccess = canManageBetaAccess(accessProfile);

      if (!hasFullName && !managesBetaAccess) {
        if (currentPath !== COMPLETE_PROFILE_PATH) {
          router.replace(COMPLETE_PROFILE_PATH);
          setReady(false);
          return;
        }
        setReady(true);
        return;
      }

      if (currentPath === COMPLETE_PROFILE_PATH) {
        router.replace(accessProfile?.access_status === "approved" ? "/dashboard" : BETA_ACCESS_PATH);
        setReady(false);
        return;
      }

      if (accessProfile?.access_status !== "approved") {
        if (!isBetaBlockedPath(currentPath)) {
          router.replace(BETA_ACCESS_PATH);
          setReady(false);
          return;
        }
        setReady(true);
        return;
      }

      if (isBetaBlockedPath(currentPath)) {
        router.replace("/dashboard");
        setReady(false);
        return;
      }

      if (currentPath === BETA_ADMIN_PATH) {
        if (!canManageBetaAccess(accessProfile)) {
          router.replace("/dashboard");
          setReady(false);
          return;
        }
        setReady(true);
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
