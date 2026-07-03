"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { canManageBetaAccess, type UserAccessProfile } from "@/lib/access";
import { betaFeedbackMailto } from "@/lib/betaFeedback";
import { supabase } from "@/lib/supabase/client";
import { exportMyDataForCurrentUser } from "@/lib/export/exportMyDataClient";

function ClayTargetIcon() {
  return (
    <span className="mark" role="img" aria-label="Orange clay target icon">
      <svg viewBox="0 0 64 48" focusable="false" aria-hidden="true">
        <defs>
          <linearGradient id="clayTargetTop" x1="12" y1="10" x2="54" y2="31" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffd16a" />
            <stop offset="22%" stopColor="#ff8a1c" />
            <stop offset="58%" stopColor="#ff5a05" />
            <stop offset="100%" stopColor="#c93305" />
          </linearGradient>
          <linearGradient id="clayTargetSide" x1="14" y1="25" x2="49" y2="43" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ff7412" />
            <stop offset="46%" stopColor="#df3f05" />
            <stop offset="100%" stopColor="#6f1a05" />
          </linearGradient>
          <radialGradient id="clayTargetRecess" cx="38%" cy="30%" r="72%">
            <stop offset="0%" stopColor="#ffbd4c" />
            <stop offset="48%" stopColor="#ff5b05" />
            <stop offset="100%" stopColor="#8f2104" />
          </radialGradient>
        </defs>
        <ellipse cx="32" cy="38" rx="24" ry="5.4" fill="#05070b" opacity="0.34" />
        <path d="M7.6 21.2c2.1-8 13.4-13.3 27-12.6 13.8.8 24.1 7.6 24.3 16.2l-2.2 7.4c-2.4 7.1-13.8 11.4-27 10.3C16.2 41.4 6.2 34.9 6 27.4l1.6-6.2Z" fill="url(#clayTargetSide)" />
        <path d="M7.7 21.2c1.9-8.3 13.3-13.9 27.1-13.1 14.1.8 24.7 7.9 24 16.2-.7 8.1-12.3 13.7-26.1 12.7C18.7 36 6 29.3 7.7 21.2Z" fill="url(#clayTargetTop)" />
        <path d="M9.2 26.1c4.2 5.7 13 9.7 23.5 10.5 11 .8 20.7-2.9 24.4-8.8l-1.2 4c-3.4 6-13.7 9.7-25.1 8.8-11.3-.9-20.5-5.8-23.5-12.1l.7-2.6 1.2.2Z" fill="#7b1d04" opacity="0.48" />
        <ellipse cx="33.2" cy="22.3" rx="20.4" ry="8.5" transform="rotate(4 33.2 22.3)" fill="none" stroke="#9e2604" strokeWidth="2.9" opacity="0.76" />
        <ellipse cx="33.2" cy="22.2" rx="14.2" ry="5.7" transform="rotate(4 33.2 22.2)" fill="url(#clayTargetRecess)" stroke="#be3105" strokeWidth="1.6" opacity="0.98" />
        <ellipse cx="33.2" cy="22.1" rx="7.4" ry="2.9" transform="rotate(4 33.2 22.1)" fill="#c83204" stroke="#7f1b03" strokeWidth="1.4" opacity="0.9" />
        <path d="M11.9 20.1c3.1-6.1 12.3-9.8 23.2-9.1 8.5.5 15.7 3.8 19 8.2" fill="none" stroke="#ffe5a3" strokeWidth="2.5" strokeLinecap="round" opacity="0.76" />
        <path d="M15.1 29.4c4.3 2.5 10.5 4.1 17.5 4.5 7.4.4 14.1-.9 18.7-3.6" fill="none" stroke="#f44504" strokeWidth="2" strokeLinecap="round" opacity="0.72" />
      </svg>
    </span>
  );
}

export default function AuthHeader() {
  const router = useRouter();
  const menuId = useId();
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const shouldFocusMenuRef = useRef(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [showBetaAdmin, setShowBetaAdmin] = useState(false);
  const [feedbackHref, setFeedbackHref] = useState("");
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    let active = true;
    async function refreshAuthHeader() {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setAuthenticated(Boolean(data.user));
      if (data.user) {
        await supabase.rpc("sync_my_access_profile");
        const { data: accessProfile } = await supabase
          .from("user_access_profiles")
          .select("access_status,system_role")
          .eq("user_id", data.user.id)
          .maybeSingle<Pick<UserAccessProfile, "access_status" | "system_role">>();
        if (!active) return;
        setShowBetaAdmin(canManageBetaAccess(accessProfile));
      } else {
        setShowBetaAdmin(false);
      }
      setFeedbackHref(betaFeedbackMailto("General beta"));
      setReady(true);
    }

    refreshAuthHeader();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session?.user));
      if (!session?.user) setShowBetaAdmin(false);
      refreshAuthHeader();
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  function getMenuItems() {
    return Array.from(
      menuWrapRef.current?.querySelectorAll<HTMLElement>(
        'a[role="menuitem"], button[role="menuitem"]:not(:disabled)',
      ) || [],
    );
  }

  function closeMenu({ restoreFocus = false } = {}) {
    shouldFocusMenuRef.current = false;
    setMenuOpen(false);
    if (restoreFocus) requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  function openMenu({ focusFirstItem = false } = {}) {
    shouldFocusMenuRef.current = focusFirstItem;
    setMenuOpen(true);
  }

  function handleMenuButtonKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu({ focusFirstItem: true });
    }
    if (event.key === "Enter" || event.key === " ") shouldFocusMenuRef.current = true;
  }

  useEffect(() => {
    if (!menuOpen) return;

    if (shouldFocusMenuRef.current) {
      requestAnimationFrame(() => {
        getMenuItems()[0]?.focus();
        shouldFocusMenuRef.current = false;
      });
    }

    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuWrapRef.current?.contains(event.target as Node)) closeMenu();
    }

    function handleMenuKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu({ restoreFocus: true });
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const menuItems = getMenuItems();
      if (menuItems.length === 0) return;
      event.preventDefault();
      const activeIndex = menuItems.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.key === "ArrowDown"
        ? (activeIndex + 1) % menuItems.length
        : (activeIndex - 1 + menuItems.length) % menuItems.length;
      menuItems[nextIndex].focus();
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", handleMenuKeyDown);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", handleMenuKeyDown);
      if (menuWrapRef.current?.contains(document.activeElement)) menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  async function exportMyData() {
    setExportError("");
    setExporting(true);
    try {
      const result = await exportMyDataForCurrentUser();
      if (!result.authenticated) router.push("/login");
    } catch (error) {
      setExportError("Could not export your data right now. Refresh and try again.");
    } finally {
      setExporting(false);
    }
  }

  async function logout() {
    closeMenu();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="header">
      <div className="logoRow">
        <Link href={authenticated ? "/dashboard" : "/"} className="brandLockup" aria-label="Clay Performance Lab home">
          <ClayTargetIcon />
          <div>
            <h1>Clay Performance Lab</h1>
            <div className="small muted">Performance analysis for clay target shooters</div>
          </div>
        </Link>
        {ready && authenticated && (
          <nav className="topNav" aria-label="Primary navigation">
            <Link className="desktopNavItem" href="/dashboard">Dashboard</Link>
            <Link className="desktopNavItem" href="/stats">Performance</Link>
            <div className="globalMenuWrap" ref={menuWrapRef}>
              <button
                type="button"
                className="globalMenuButton"
                ref={menuButtonRef}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-controls={menuId}
                onClick={() => menuOpen ? closeMenu() : openMenu()}
                onKeyDown={handleMenuButtonKeyDown}
              >
                Menu
              </button>
              {menuOpen && (
                <div className="globalMenu" id={menuId} role="menu" aria-label="Global menu">
                  <Link className="mobileMenuItem" role="menuitem" href="/dashboard" onClick={() => closeMenu()}>Dashboard</Link>
                  <Link className="mobileMenuItem" role="menuitem" href="/stats" onClick={() => closeMenu()}>Performance</Link>
                  <Link role="menuitem" href="/log-competition" onClick={() => closeMenu()}>Log competition</Link>
                  <Link role="menuitem" href="/log-training" onClick={() => closeMenu()}>Log training</Link>
                  <Link role="menuitem" href="/profile" onClick={() => closeMenu()}>Shooter profile</Link>
                  <Link role="menuitem" href="/equipment" onClick={() => closeMenu()}>Equipment</Link>
                  <Link role="menuitem" href="/settings" onClick={() => closeMenu()}>Settings</Link>
                  <button role="menuitem" type="button" onClick={() => { closeMenu({ restoreFocus: true }); exportMyData(); }} disabled={exporting}>{exporting ? "Exporting..." : "Export my data"}</button>
                  {feedbackHref && <a role="menuitem" href={feedbackHref} onClick={() => closeMenu()}>Send feedback</a>}
                  {showBetaAdmin && <Link role="menuitem" href="/beta/admin" onClick={() => closeMenu()}>Beta approvals</Link>}
                  <button role="menuitem" type="button" className="danger" onClick={logout}>Sign out</button>
                </div>
              )}
              {exportError && <p className="globalMenuStatus small dangerText" role="alert">{exportError}</p>}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
