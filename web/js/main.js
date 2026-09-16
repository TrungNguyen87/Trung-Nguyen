/**
 * Entry point: build the chrome, start the router, wire the bits that have to
 * happen once per page load.
 */
import { buildShell } from "./shell.js";
import { startRouter, refresh } from "./router.js";
import { onLanguageChange, getLanguage, t } from "./i18n.js";
import { toast } from "./fx.js";
import { restoreLastPlayer, saveCurrentProfile } from "./state.js";
import { unlock } from "./sound.js";

document.documentElement.lang = getLanguage();

// Pick up whoever was playing last on this device before anything renders, so
// the score in the sidebar is right on the very first paint rather than
// flashing zero and then correcting itself.
restoreLastPlayer();

const root = document.getElementById("app");
document.getElementById("kmg-boot")?.remove();
buildShell(root);
startRouter(document.getElementById("kmg-main"));

// Changing language relabels the chrome (shell.js listens too) and re-renders
// whatever page is open, since its copy came from t() at render time.
onLanguageChange(() => refresh());

// An AudioContext stays suspended until the page has had a real user gesture.
// One listener, removed after it fires.
const unlockAudio = () => {
  unlock();
  window.removeEventListener("pointerdown", unlockAudio);
  window.removeEventListener("keydown", unlockAudio);
};
window.addEventListener("pointerdown", unlockAudio, { once: false });
window.addEventListener("keydown", unlockAudio, { once: false });

// A tablet being closed mid-game is the normal way a session ends, so persist
// on the way out rather than only after an answered question.
window.addEventListener("pagehide", () => saveCurrentProfile());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveCurrentProfile();
});

// The service worker makes the app work with no network at all (see sw.js).
// It is a progressive enhancement: if registration fails the app still runs,
// it just needs the network next time.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js");
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // A new version finished installing while an old one was in control:
          // tell the user rather than swapping the app out mid-question.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            toast(t("app.update_ready"), "🔄", 8000);
          }
        });
      });
    } catch (error) {
      console.info("[app] service worker not registered:", error.message);
    }
  });
}

// "Add to home screen". Chrome and Edge fire this event when the app qualifies;
// Safari has no equivalent, which is why the deployment guide spells out the
// Share -> Add to Home Screen route for iPads by hand.
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;

  const button = document.createElement("button");
  button.className = "kmg-install";
  button.type = "button";
  button.textContent = t("app.install");
  button.addEventListener("click", async () => {
    button.remove();
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  });
  document.body.append(button);

  // It is an offer, not a nag: it goes away on its own.
  setTimeout(() => button.remove(), 15000);
});

document.title = t("app.title");
