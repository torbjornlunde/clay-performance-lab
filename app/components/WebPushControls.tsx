"use client";

import { useEffect, useState } from "react";
import { deleteMyWebPushSubscription, upsertMyWebPushSubscription } from "@/lib/notifications/client";
import { pushSupported, urlBase64ToUint8Array, type PushState } from "@/lib/notifications/push";

export default function WebPushControls() {
  const [state, setState] = useState<PushState>("disabled");
  const [message, setMessage] = useState("Web Push is optional. In-app notifications still work without it.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) { setState("unsupported"); setMessage("This browser does not support Web Push. In-app notifications still work."); return; }
    if (Notification.permission === "denied") { setState("blocked"); setMessage("Notifications are blocked in this browser. Change site settings to enable them."); return; }
    navigator.serviceWorker.ready.then(async (registration) => {
      const subscription = await registration.pushManager.getSubscription();
      setState(subscription ? "enabled" : "disabled");
      setMessage(subscription ? "Web Push is enabled on this device." : "Enable Web Push to receive useful admin notifications on this device.");
    }).catch(() => setState("unsupported"));
  }, []);

  async function enablePush() {
    if (!pushSupported() || Notification.permission === "denied") return;
    setBusy(true); setMessage("Preparing Web Push...");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "blocked" : "disabled"); setMessage(permission === "denied" ? "Notifications are blocked in this browser." : "Web Push was not enabled."); return; }
      const keyResult = await fetch("/api/notifications/vapid-public-key");
      const { publicKey } = await keyResult.json() as { publicKey?: string };
      if (!publicKey) throw new Error("Web Push is not configured yet.");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Browser returned an incomplete subscription.");
      const { error } = await upsertMyWebPushSubscription({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }, navigator.userAgent);
      if (error) throw error;
      setState("enabled"); setMessage("Web Push is enabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Web Push could not be enabled right now.");
    } finally { setBusy(false); }
  }

  async function disablePush() {
    setBusy(true); setMessage("Disabling Web Push...");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;
      if (subscription) await subscription.unsubscribe();
      if (endpoint) await deleteMyWebPushSubscription(endpoint);
      setState("disabled"); setMessage("Web Push is disabled on this device. In-app notifications still work.");
    } catch { setMessage("Web Push could not be disabled right now."); }
    finally { setBusy(false); }
  }

  return <section className="card webPushControls" aria-label="Web Push notifications">
    <div><h3>Push notifications</h3><p>{message}</p></div>
    {state === "enabled" ? <button type="button" className="secondary" onClick={disablePush} disabled={busy}>Disable on this device</button> : null}
    {state === "disabled" ? <button type="button" onClick={enablePush} disabled={busy}>{busy ? "Working..." : "Enable on this device"}</button> : null}
  </section>;
}
