// scout PWA entry point.
//
// scout's UI is a full-bleed app with its own sidebar + brand (NOT the toolkit's
// centered .cap-head chrome), so we mount a single chrome:false route that owns
// the viewport: inject scout's markup, then run its boot sequence. This still
// genuinely consumes the shell module (mountApp + the bleed mount container) and
// the PWA module (registerSW), plus base.css/components.css/session.
import "@brainbot/web-toolkit/base.css";
import "@brainbot/web-toolkit/components.css";
import "./style.css";
import { mountApp } from "@brainbot/web-toolkit/shell";
import { registerSW } from "@brainbot/web-toolkit/pwa";
import { currentUser } from "@brainbot/web-toolkit/session";
import { SCOUT_MARKUP } from "./markup";
import { initScout } from "./app";

mountApp(
  {
    "": {
      view: () => ({
        mount(el: HTMLElement) {
          el.innerHTML = SCOUT_MARKUP;
          initScout(el);
        },
      }),
      chrome: false,
    },
  },
  { title: "scout" },
);

registerSW();

// Identity hook for when scout sits behind the shared edge (US-004). Resolves to
// null in local dev (no edge → no X-Auth-Request-Email); does not change the UI.
void currentUser();
