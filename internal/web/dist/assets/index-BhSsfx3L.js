(function(){const i=document.createElement("link").relList;if(i&&i.supports&&i.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))I(r);new MutationObserver(r=>{for(const v of r)if(v.type==="childList")for(const k of v.addedNodes)k.tagName==="LINK"&&k.rel==="modulepreload"&&I(k)}).observe(document,{childList:!0,subtree:!0});function g(r){const v={};return r.integrity&&(v.integrity=r.integrity),r.referrerPolicy&&(v.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?v.credentials="include":r.crossOrigin==="anonymous"?v.credentials="omit":v.credentials="same-origin",v}function I(r){if(r.ep)return;r.ep=!0;const v=g(r);fetch(r.href,v)}})();function ls(y,i){const g=i.replace(/^#/,"");let I=null;for(const r of Object.keys(y))(g===r||g.startsWith(r))&&(I===null||r.length>I.length)&&(I=r);return I===null&&""in y&&(I=""),I}function us(y){return typeof y=="function"?{view:y,chrome:!0}:{view:y.view,chrome:y.chrome!==!1}}function ps(y,i={}){const g=i.root??document.body,I=i.title??document.title??"",r=i.brandHref??"#",v=document.createElement("main"),k=document.createElement("header");k.className="cap-head";const w=document.createElement("a");w.className="brand",w.href=r,w.textContent=I,w.setAttribute("aria-label",`${I} — home`),k.appendChild(w);const R=document.createElement("nav");R.className="cap-nav",R.setAttribute("aria-label","Views");for(const x of i.nav??[]){const j=document.createElement("a");j.href=x.href,j.textContent=x.label,x.ariaLabel&&j.setAttribute("aria-label",x.ariaLabel),R.appendChild(j)}k.appendChild(R);const S=document.createElement("section");S.className="tk-content",v.appendChild(k),v.appendChild(S);const T=document.createElement("div");T.className="tk-bleed";const Me=x=>{var j;for(const A of Array.from(R.querySelectorAll("a"))){const C=((j=A.getAttribute("href"))==null?void 0:j.replace(/^#/,""))??"";A.toggleAttribute("aria-current",x!==null&&x!==""&&C===x),A.hasAttribute("aria-current")&&A.setAttribute("aria-current","page")}};let W=0;const M=()=>{const x=ls(y,location.hash);if(Me(x),x===null){T.isConnected&&T.remove(),v.isConnected||g.appendChild(v),hs(S,"Not found.");return}const{view:j,chrome:A}=us(y[x]),C=A?S:T;A?(T.isConnected&&T.remove(),v.isConnected||g.appendChild(v)):(v.isConnected&&v.remove(),T.isConnected||g.appendChild(T)),C.replaceChildren();const Y=j(),Ae=++W,ee=Y.mount(C);ee instanceof Promise&&ee.catch(He=>{Ae===W&&ms(C,String(He))})};window.addEventListener("hashchange",M),M()}function hs(y,i){y.replaceChildren();const g=document.createElement("div");g.className="tk-empty",g.textContent=i,y.appendChild(g)}function ms(y,i){y.replaceChildren();const g=document.createElement("div");g.className="tk-error",g.textContent=i,y.appendChild(g)}function fs(){if(!("serviceWorker"in navigator))return;if(["localhost","127.0.0.1","[::1]",""].includes(location.hostname)){navigator.serviceWorker.getRegistrations().then(i=>{for(const g of i)g.unregister()}),window.caches&&caches.keys().then(i=>{for(const g of i)caches.delete(g)});return}window.addEventListener("load",()=>{navigator.serviceWorker.register("/sw.js").catch(()=>{})})}async function vs(){let y;try{y=await fetch("/api/me",{headers:{Accept:"application/json"}})}catch{return null}if(!y.ok)return null;let i;try{i=await y.json()}catch{return null}return typeof i.email=="string"&&i.email?{email:i.email}:null}const gs=`
<div class="layout">
<aside class="sidebar">
  <div class="sidebar-brand"><div class="brand">scout</div></div>
  <div class="block" id="block-view">
    <div class="view-switch" title="which table the main area shows">
      <button class="tab active" id="tab-companies">companies</button>
      <button class="tab" id="tab-jobs">jobs</button>
    </div>
  </div>

  <!-- Add data: get companies/jobs into scout (manual or CSV). Separate from
       Run below, which is the pipeline acting on data already here. -->
  <div class="block" id="block-add">
    <h3>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5v9M3.5 8h9"/></svg>
      Add data
      <button class="help-btn" id="help-add" title="what do these do?" aria-label="about Add data">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M6.2 6.3a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.9.5-.9 1.1v.2" stroke-linecap="round"/><circle cx="8" cy="11.4" r="0.55" fill="currentColor" stroke="none"/></svg>
      </button>
    </h3>
    <div class="run-btns">
      <button class="run-btn" id="btn-ingest">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V2m0 0L5 5m3-3l3 3M3 13h10"/></svg>
        <span class="grow">Ingest CSV</span>
      </button>
      <button class="run-btn" id="btn-add" title="add a company or a job from its link — optionally let an agent pass fill in the blanks">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5v9M3.5 8h9"/></svg>
        <span class="grow">Add</span>
      </button>
    </div>
    <input type="file" id="csv-file" accept=".csv,text/csv" style="display:none">
  </div>

  <div class="block" id="block-run">
    <h3>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l9 5-9 5z"/></svg>
      Run
      <button class="help-btn" id="help-run" title="what do these do?" aria-label="about Run">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M6.2 6.3a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.9.5-.9 1.1v.2" stroke-linecap="round"/><circle cx="8" cy="11.4" r="0.55" fill="currentColor" stroke="none"/></svg>
      </button>
    </h3>
    <div class="run-btns">
      <button class="run-btn" id="btn-enrich">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12"/></svg>
        <span class="grow">Enrich</span>
      </button>
      <button class="run-btn" id="btn-verdict">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3 3 7-7"/></svg>
        <span class="grow">Verdict</span>
      </button>
    </div>
    <div class="run-busy" id="run-busy" style="display:none">
      <span class="spinner"></span><span id="run-busy-label">running…</span>
    </div>
  </div>

  <!-- Each view owns its filter block — separate search text and separate
       controls, so switching tabs never carries a filter across. -->
  <div class="block" id="block-filter-companies">
    <h3>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4h12M4 8h8M6 12h4"/></svg>
      Filter
    </h3>
    <div class="filter-row">
      <div class="search-wrap">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14" stroke-linecap="round"/></svg>
        <input id="q" placeholder="search name, vertical, reason…">
      </div>
    </div>
    <div class="filter-row">
      <div class="verdict-chips" id="verdict-chips" title="verdict — pick any combination; none selected = all">
        <button class="v-chip" data-v="yes">yes</button>
        <button class="v-chip" data-v="maybe">maybe</button>
        <button class="v-chip" data-v="no">no</button>
        <button class="v-chip" data-v="__none__" title="companies awaiting a verdict">unscored <span class="v-count" id="unscored-n">–</span></button>
        <button class="v-chip flag-chip" id="flag-filter" title="show flagged companies only">⚑ flagged</button>
      </div>
    </div>
  </div>

  <div class="block" id="block-filter-jobs" style="display:none">
    <h3>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4h12M4 8h8M6 12h4"/></svg>
      Filter
    </h3>
    <div class="filter-row">
      <div class="search-wrap">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14" stroke-linecap="round"/></svg>
        <input id="jq" placeholder="search title, company, contacts…">
      </div>
    </div>
    <div class="filter-row">
      <div class="verdict-chips" id="response-chips" title="response — pick any combination; none selected = all">
        <button class="v-chip" data-r="screening">screening</button>
        <button class="v-chip" data-r="interview">interview</button>
        <button class="v-chip" data-r="offer">offer</button>
        <button class="v-chip" data-r="rejected" title="selecting this shows rejected rows even with “hide rejected” on">rejected</button>
        <button class="v-chip" id="next-up-filter" title="show only postings queued next up for outreach">next up <span class="v-count" id="next-up-n" style="display:none"></span></button>
        <button class="v-chip" id="not-reached-filter" title="show only postings you haven’t reached out to yet (zero outreach logged)">not reached out <span class="v-count" id="not-reached-n" style="display:none"></span></button>
      </div>
    </div>
    <div class="filter-row">
      <button class="v-chip is-on" id="hide-rejected" title="mirror of the tracker default — rejected applications stay out of the jobs table">hide rejected <span class="v-count" id="hidden-rej-n" style="display:none"></span></button>
    </div>
  </div>

  <div class="block" id="block-columns">
    <details class="cols-details">
      <summary>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 3v10M6.5 3v10M10.5 3v10M14 3v10" stroke-linejoin="round"/></svg>
        Columns
        <svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>
      </summary>
      <div class="col-toggles" id="col-toggles"></div>
    </details>
  </div>

  <div class="sidebar-bottom">
    <div class="sidebar-foot">
      <button class="doc-btn foot-btn" id="open-settings" title="Settings — criteria, playbook, email template, outreach knowledge" aria-label="settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>Settings</span>
      </button>
      <button class="doc-btn foot-btn" id="open-docs" title="How scout works — ingestion, prompts, files, triage" aria-label="how it works">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 11.5v.01M6.4 6.2a1.6 1.6 0 1 1 2.4 1.5c-.5.3-.8.6-.8 1.3"/></svg>
        <span>How it works</span>
      </button>
    </div>
  </div>
</aside>

<!-- floating chat CTA (shown only when chat is enabled) -->
<button class="chat-fab" id="open-chat" title="Chat: track applications and ask about your companies/jobs" aria-label="chat" style="display:none">
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h11a1 1 0 011 1v6a1 1 0 01-1 1H6l-3 2.5V11.5H2.5a1 1 0 01-1-1v-6a1 1 0 011-1z"/></svg>
</button>

<main>
  <div class="table-wrap" id="companies-view">
    <table id="t">
      <thead>
        <tr>
          <th class="th-flag" data-col="flag" title="flagged"></th>
          <th data-k="verdict" data-col="verdict">verdict</th>
          <th data-k="name">name</th>
          <th data-k="reason" data-col="reason">reason</th>
          <th data-k="vertical" data-col="vertical">vertical</th>
          <th data-k="location" data-col="location">location</th>
          <th data-k="headcount" data-col="hc">hc</th>
          <th data-k="stage" data-col="stage">stage</th>
          <th data-k="reviewed_at" data-col="reviewed">reviewed</th>
          <th data-col="site">site</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
    <div id="empty" class="empty" style="display:none">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/>
      </svg>
      <div class="t">No companies match the current filters.</div>
      <div class="small dim">Clear a filter, or run <code>scout ingest &lt;csv&gt;</code>.</div>
    </div>
  </div>

  <div class="table-wrap" id="jobs-view" style="display:none">
    <table id="jt">
      <thead>
        <tr>
          <th data-jk="company">role · company</th>
          <th data-jk="applied_at" data-col="applied">applied</th>
          <th data-jk="response" data-col="response">response</th>
          <th data-jk="outreach_count" data-col="outreach">outreach</th>
          <th data-jk="last_outreach_at" data-col="last_outreach">last outreach</th>
          <th data-jk="contacts" data-col="contacts">contacts</th>
          <th data-col="link">link</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
    <div id="jobs-empty" class="empty" style="display:none">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2m-13 0h18a1 1 0 011 1v11a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1z"/>
      </svg>
      <div class="t">No jobs match the current filters.</div>
      <div class="small dim">Paste a posting URL via <strong>Add…</strong> — the agent pass fills in the rest.</div>
    </div>
    <div class="hidden-note" id="jobs-hidden-note" style="display:none"></div>
  </div>
</main>
</div>

<div class="scrim" id="scrim"></div>
<aside class="pane" id="pane" aria-hidden="true">
  <div class="pane-head">
    <h2 id="pane-title">—</h2>
    <span id="pane-pills" class="pills-inline"></span>
    <button class="pane-chat-btn" id="pane-chat" title="Chat about this company" aria-label="chat" style="display:none">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h11a1 1 0 011 1v6a1 1 0 01-1 1H6l-3 2.5V11.5H2.5a1 1 0 01-1-1v-6a1 1 0 011-1z"/></svg>
    </button>
    <button class="close-btn" id="pane-close" aria-label="close">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>
      </svg>
    </button>
  </div>
  <div class="pane-body" id="pane-body"><div class="loading-row"><span class="spinner"></span><span>loading…</span></div></div>
</aside>

<!-- the pursuit panel: jobs-view side panel, role-centric (wider than the
     company pane). Built from the clicked jobs row; the outreach queue polls. -->
<div class="scrim" id="pursuit-scrim"></div>
<aside class="pane pane-pursuit" id="pursuit-pane" aria-hidden="true">
  <div class="pane-head">
    <h2 id="pursuit-title">—</h2>
    <span id="pursuit-pills" class="pills-inline"></span>
    <button class="pane-chat-btn" id="pursuit-chat" title="Chat about this role" aria-label="chat" style="display:none">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h11a1 1 0 011 1v6a1 1 0 01-1 1H6l-3 2.5V11.5H2.5a1 1 0 01-1-1v-6a1 1 0 011-1z"/></svg>
    </button>
    <button class="close-btn" id="pursuit-close" aria-label="close">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>
      </svg>
    </button>
  </div>
  <div class="pane-body" id="pursuit-body"><div class="loading-row"><span class="spinner"></span><span>loading…</span></div></div>
</aside>

<!-- chat pane: one slide-in reused for all scopes (global / company / posting).
     The global tracking chat and the per-entity research chat share it; state
     in app.ts tracks which thread is bound. -->
<div class="scrim" id="chat-scrim"></div>
<aside class="pane pane-chat" id="chat-pane" aria-hidden="true">
  <div class="pane-head">
    <h2 id="chat-title">Chat</h2>
    <span id="chat-sub" class="chat-sub"></span>
    <button class="close-btn" id="chat-close" aria-label="close">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>
      </svg>
    </button>
  </div>
  <div class="chat-body" id="chat-messages"></div>
  <form class="chat-compose" id="chat-form">
    <textarea id="chat-input" rows="1" placeholder="Message scout… (Enter to send, Shift+Enter for a newline)"></textarea>
    <button type="submit" class="chat-send" id="chat-send" aria-label="send">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8l12-5-5 12-2.5-4.5L2 8z"/></svg>
    </button>
  </form>
</aside>

<!-- progress drawer -->
<div class="drawer" id="drawer">
  <div class="drawer-head">
    <span class="spinner" id="drawer-spinner"></span>
    <span class="dtitle" id="drawer-title">run</span>
    <button id="drawer-cancel">cancel</button>
    <button id="drawer-close" style="display:none">close</button>
  </div>
  <div class="drawer-log" id="drawer-log"></div>
</div>

<!-- editor modal -->
<div class="modal-scrim" id="editor-scrim">
  <div class="modal">
    <div class="modal-head">
      <h2 id="editor-title">edit</h2>
      <span class="ver" id="editor-ver"></span>
    </div>
    <div class="modal-body">
      <label class="editor-toggle" id="editor-toggle-row" style="display:none">
        <input type="checkbox" id="editor-enabled" />
        <span>Enable the pre-filter (off → bulk verdict runs score every company; the rules below are kept either way)</span>
      </label>
      <textarea id="editor-text" spellcheck="false"></textarea>
      <div class="modal-note">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.5" stroke-linecap="round"/></svg>
        <span>Edits write the local file only — never the brain. Existing verdicts are left as-is; the new criteria apply to companies you score or re-score from here on.</span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="editor-cancel">Cancel</button>
      <button class="btn btn-primary" id="editor-save">Save</button>
    </div>
  </div>
</div>

<!-- Anthropic API key (dashboard-configurable; stored in scout, never echoed back) -->
<div class="modal-scrim" id="key-scrim">
  <div class="modal">
    <div class="modal-head">
      <h2>Anthropic API key</h2>
    </div>
    <div class="modal-body">
      <div class="key-status small muted" id="key-status"></div>
      <input type="password" id="key-input" class="key-input" placeholder="sk-ant-…" autocomplete="off" spellcheck="false" />
      <div class="modal-note" id="key-restart-hint" style="display:none">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.5" stroke-linecap="round"/></svg>
        <span>Verdict and capture are live now. Restart scout to enable outreach, chat &amp; application answers.</span>
      </div>
      <div class="modal-note">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.5" stroke-linecap="round"/></svg>
        <span>The key is verified against the API, then stored in scout's local database — it overrides the <code>ANTHROPIC_API_KEY</code> environment variable. It's write-only: scout never shows it again. Remove it to fall back to the environment.</span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="key-remove" style="display:none">Remove key</button>
      <button class="btn" id="key-cancel">Cancel</button>
      <button class="btn btn-primary" id="key-save">Save key</button>
    </div>
  </div>
</div>

<!-- outreach knowledge sources (brain-discovered) -->
<div class="modal-scrim" id="sources-scrim">
  <div class="modal">
    <div class="modal-head">
      <h2>outreach knowledge</h2>
    </div>
    <div class="modal-body">
      <div id="sources-list"></div>
      <div class="modal-note">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.5" stroke-linecap="round"/></svg>
        <span>Discovered from your brain by an LLM over the document map: <strong>experience</strong> (required — the honesty checker's ground truth) and <strong>voice</strong> (optional). “Refresh” re-runs discovery when new pages appear; remove a wrong pick with ✕. The pages are fetched whole and cached locally; drafting reads the cache.</span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-primary" id="sources-refresh-btn">Refresh from brain</button>
      <button class="btn" id="sources-close">Close</button>
    </div>
  </div>
</div>

<!-- settings: criteria, playbook, email template, outreach knowledge -->
<div class="modal-scrim" id="settings-scrim">
  <div class="modal modal-settings">
    <div class="modal-head">
      <div class="modal-head-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.1"/><path d="M8 1.2v1.6M8 13.2v1.6M14.8 8h-1.6M2.8 8H1.2M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1M12.8 12.8l-1.1-1.1M4.3 4.3 3.2 3.2"/></svg>
      </div>
      <div class="modal-head-text">
        <h2>Settings</h2>
        <div class="modal-head-sub">What scout uses to judge companies and write your outreach.</div>
      </div>
    </div>
    <div class="modal-body">
      <div id="criteria-stats"><div class="loading-row"><span class="spinner"></span><span>loading…</span></div></div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="settings-close">Close</button>
    </div>
  </div>
</div>

<!-- company-fit brief viewer (read-only) -->
<div class="modal-scrim" id="profile-scrim">
  <div class="modal">
    <div class="modal-head">
      <h2>Company-fit brief</h2>
      <span class="ver" id="profile-modal-meta"></span>
    </div>
    <div class="modal-body">
      <div class="summary-box" id="profile-modal-body" style="max-height:54vh"></div>
      <div class="modal-note">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.5" stroke-linecap="round"/></svg>
        <span>Read-only. This is scout's cached copy of your company-fit brief — the exact criteria text the verdict stage feeds the LLM. Use the refresh icon in the Criteria panel to re-distill it.</span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="profile-modal-close">Close</button>
    </div>
  </div>
</div>

<!-- run confirmation (enrich / verdict) — carries the "only blanks" scope toggle -->
<div class="modal-scrim" id="run-scrim">
  <div class="modal" style="width:440px">
    <div class="modal-head">
      <h2 id="run-title">Run</h2>
    </div>
    <div class="modal-body">
      <p id="run-desc" style="margin:0 0 12px;font-size:13px;color:var(--fg-mute);line-height:1.5"></p>
      <div class="run-warn" id="run-warn" style="display:none">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L1.5 13.5h13z"/><path d="M8 6.5v3.5M8 12v.3"/></svg>
        <span id="run-warn-text"></span>
      </div>
      <label class="enrich-row" id="run-blanks-row">
        <input type="checkbox" id="run-only-blanks">
        <span class="cbox" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg></span>
        <span>only blanks — only touch companies never seen before (no enrichment row / no verdict yet)</span>
      </label>
      <div class="run-workers">
        <label for="run-workers-input">Parallel workers</label>
        <input class="input" type="number" id="run-workers-input" min="1" max="24" step="1" inputmode="numeric">
        <span class="run-workers-hint">faster, up to your API rate limit</span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="run-cancel">Cancel</button>
      <button class="btn btn-primary" id="run-go">Run</button>
    </div>
  </div>
</div>

<!-- section help — what each button does, with links into the docs overlay -->
<div class="modal-scrim" id="help-scrim">
  <div class="modal" style="width:440px">
    <div class="modal-head">
      <h2 id="help-title">About</h2>
    </div>
    <div class="modal-body" id="help-items"></div>
    <div class="modal-foot">
      <button class="btn" id="help-close">Close</button>
    </div>
  </div>
</div>

<!-- add-company modal (manual single-company import) -->
<!-- the Add dialog: company or job, link first; everything else is optional —
     the link-capture agent pass fills the blanks when the box is ticked -->
<div class="modal-scrim" id="add-scrim">
  <div class="modal" style="width:560px">
    <div class="modal-head">
      <h2>Add</h2>
      <div class="kind-toggle" id="add-kind">
        <button class="v-chip is-on" data-kind="company">company</button>
        <button class="v-chip" data-kind="job">job</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="form-field">
        <label for="add-url" id="add-url-label">Website<span class="req">*</span></label>
        <input class="input" id="add-url" placeholder="acme.com" autocomplete="off" spellcheck="false">
      </div>
      <div id="add-job-fields" style="display:none">
        <div class="form-grid">
          <div class="form-field">
            <label for="add-title">Title</label>
            <input class="input" id="add-title" placeholder="e.g. Solutions Engineer" autocomplete="off">
          </div>
          <div class="form-field">
            <label for="add-job-company">Company</label>
            <input class="input" id="add-job-company" list="add-company-names" placeholder="from the link if blank" autocomplete="off">
            <datalist id="add-company-names"></datalist>
          </div>
        </div>
      </div>
      <div id="add-company-fields">
        <div class="form-field">
          <label for="add-name">Name</label>
          <input class="input" id="add-name" placeholder="defaults to the domain" autocomplete="off">
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label for="add-location">Location</label>
            <input class="input" id="add-location" autocomplete="off">
          </div>
          <div class="form-field">
            <label for="add-headcount">Headcount</label>
            <input class="input" id="add-headcount" inputmode="numeric" placeholder="e.g. 250" autocomplete="off">
          </div>
          <div class="form-field">
            <label for="add-stage">Funding stage</label>
            <select class="input" id="add-stage"><option value="">—</option></select>
          </div>
        </div>
        <div class="form-field">
          <label>Verticals <span id="add-vertical-count" style="color:var(--fg-dim);font-weight:400"></span></label>
          <input class="input" id="add-vertical-filter" placeholder="filter verticals…" autocomplete="off">
          <div class="vchips" id="add-vertical-chips"></div>
        </div>
      </div>
      <label class="enrich-row" id="add-enrich-row">
        <input type="checkbox" id="add-enrich" checked>
        <span class="cbox" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg></span>
        <span>fill in the blanks — ATS links (ashby/greenhouse/lever) read the platform's API directly, anything else gets one cheap agent pass</span>
      </label>
      <div class="modal-note">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.5" stroke-linecap="round"/></svg>
        <span id="add-note"></span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="add-cancel">Cancel</button>
      <button class="btn btn-primary" id="add-save">Add company</button>
    </div>
  </div>
</div>

<!-- docs overlay ("how it works") -->
<div class="docs-scrim" id="docs-scrim">
  <div class="docs" role="dialog" aria-modal="true" aria-label="How scout works">
    <div class="docs-head">
      <span class="dot" aria-hidden="true"></span>
      <h2>How scout works</h2>
      <span class="sub">a guided tour of the pipeline</span>
      <span class="spacer"></span>
      <button class="close-btn" id="docs-close" aria-label="close">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>
      </button>
    </div>
    <div class="docs-grid">
      <nav class="docs-nav" id="docs-nav">
        <a data-sec="overview"><span class="nav-num">1</span> Overview</a>
        <a data-sec="pipeline"><span class="nav-num">2</span> The pipeline</a>
        <a data-sec="ingest"><span class="nav-num">3</span> Ingest &amp; CSV format</a>
        <a data-sec="filter"><span class="nav-num">4</span> The pre-filter</a>
        <a data-sec="enrich"><span class="nav-num">5</span> Enrichment</a>
        <a data-sec="verdict"><span class="nav-num">6</span> The verdict &amp; prompts</a>
        <a data-sec="files"><span class="nav-num">7</span> Files scout reads</a>
        <a data-sec="triage"><span class="nav-num">8</span> Triage &amp; results</a>
      </nav>
      <div class="docs-body" id="docs-body">

        <section id="doc-overview">
          <h3 class="dsec"><span class="n">01</span> Overview</h3>
          <p class="lede">scout is a <strong>job-fit scorer</strong>. You feed it a dump of companies (a Crunchbase CSV), and for each one it decides whether the company is worth your time to investigate as a job lead — a <span class="pill pill-yes">yes</span>, <span class="pill pill-maybe">maybe</span>, or <span class="pill pill-no">no</span> with a one-line reason.</p>
          <p>Job discovery is a noisy filter problem: a Crunchbase export surfaces thousands of companies, and maybe 1% are worth a serious look. Keyword filters miss nuance; manual triage is slow. scout runs an LLM with real personal context over the whole list in one batch, cheaply, and re-runs whenever your criteria change.</p>

          <h4>The core split: knowledge vs. intelligence</h4>
          <p>Two systems, deliberately separated:</p>
          <ul>
            <li><strong>The brain</strong> owns the <strong>knowledge</strong> — who you are, what you want, your hard rules and exclusions. It's a separate service scout talks to over HTTP. scout reads it <strong>read-only</strong> and never writes back.</li>
            <li><strong>scout</strong> owns the <strong>intelligence</strong> — it brings its own LLM and a small <code>playbook.md</code> (the procedure for <em>how</em> to judge). It reads the brain's knowledge and reasons over it.</li>
          </ul>
          <div class="callout">Verdicts live <strong>only in scout</strong> (its local SQLite). scout makes no external writes — it reads the brain for your criteria and per-company memory, and that's the only contact. If the brain is unreachable, scout falls back to a local <code>taste.md</code> and keeps running.</div>

          <h4>The whole system on one map</h4>
          <p>Both of scout's products — verdicts and outreach drafts — come from the same shape: brain knowledge in at the top, a scout-local config joining on the way down, an LLM engine at the bottom.</p>
          <div class="sysmap-wrap">
            <div class="sm-legend">
              <div class="sm-legend-h">legend</div>
              <span><i class="sm-dot dot-brain"></i>from the brain — read-only</span>
              <span><i class="sm-dot dot-llm"></i>scout's LLM stages</span>
              <span><i class="sm-dot dot-cfg"></i>scout config — edit it in Settings</span>
              <span><i class="sm-dot dot-out"></i>what you get</span>
            </div>
            <div class="sysmap">
              <div class="sm-node sm-brain sm-span">
                <div class="sm-name">the brain</div>
                <div class="sm-desc">Who you are, what you want, what you've done — your knowledge, kept in a separate service. scout reads it over HTTP and never writes back.</div>
              </div>
              <div class="sm-lane-h">judging companies</div>
              <div class="sm-lane-h">writing outreach</div>
              <div class="sm-arrow"><span class="sm-label">recall — fit-relevant excerpts</span></div>
              <div class="sm-arrow"><span class="sm-label">map + doc — whole pages</span></div>
              <div class="sm-node sm-llm">
                <div class="sm-name">distill</div>
                <div class="sm-desc">An LLM condenses the excerpts into one brief — company signal only; role and career noise is quarantined.</div>
              </div>
              <div class="sm-node sm-llm">
                <div class="sm-name">discover</div>
                <div class="sm-desc">An LLM picks your experience and voice pages off the brain's map; they're fetched whole and cached.</div>
              </div>
              <div class="sm-arrow"></div>
              <div class="sm-arrow"></div>
              <div class="sm-node sm-brainy">
                <div class="sm-name">company-fit brief</div>
                <div class="sm-desc">The criteria the verdict stage reads — cached locally. If the brain is unreachable, taste.md stands in.</div>
              </div>
              <div class="sm-node sm-brainy">
                <div class="sm-name">outreach knowledge</div>
                <div class="sm-desc">Your experience + voice — the ground truth every draft is honesty-checked against.</div>
              </div>
              <div class="sm-arrow"><span class="sm-label sm-cfg">+ playbook — how to judge</span></div>
              <div class="sm-arrow"><span class="sm-label sm-cfg">+ email template · outreach doctrine</span></div>
              <div class="sm-node sm-llm">
                <div class="sm-name">verdict engine</div>
                <div class="sm-desc">One LLM call per company: the brief + playbook against the company's data and fetched site text.</div>
              </div>
              <div class="sm-node sm-llm">
                <div class="sm-name">outreach engine</div>
                <div class="sm-desc">Company research, then fill the template's holes, honesty-check, doctrine judge. The same knowledge also drafts application answers.</div>
              </div>
              <div class="sm-arrow"></div>
              <div class="sm-arrow"></div>
              <div class="sm-node sm-out">
                <div class="sm-name">verdicts — yes / maybe / no</div>
                <div class="sm-desc">In the companies table, each with its one-line reason. Re-scoring is always explicit.</div>
              </div>
              <div class="sm-node sm-out">
                <div class="sm-name">drafts — emails + answers</div>
                <div class="sm-desc">Land in the jobs panel for review. Always editable; nothing sends itself.</div>
              </div>
            </div>
          </div>
        </section>

        <section id="doc-pipeline">
          <h3 class="dsec"><span class="n">02</span> The pipeline</h3>
          <p class="lede">Every company moves through five stages. The first three are mechanical and brain-free; the brain is touched only at <strong>verdict</strong>, and only for reads.</p>
          <div class="flow">
            <div class="step"><div class="s-name">ingest</div><div class="s-desc">CSV → companies table</div></div>
            <div class="step"><div class="s-name">filter</div><div class="s-desc">cheap hard gates cull rows</div></div>
            <div class="step"><div class="s-name">enrich</div><div class="s-desc">fetch each company's site</div></div>
            <div class="step"><div class="s-name">verdict</div><div class="s-desc">LLM scores fit · reads brain</div></div>
            <div class="step"><div class="s-name">triage</div><div class="s-desc">you browse &amp; decide</div></div>
          </div>
          <table class="dt">
            <thead><tr><th>Stage</th><th>What it does</th><th>Touches the brain?</th></tr></thead>
            <tbody>
              <tr><td class="field">ingest</td><td>Reads a CSV dump, maps known headers to canonical fields, upserts rows. Pure data.</td><td>No</td></tr>
              <tr><td class="field">filter</td><td>Applies cheap mechanical gates from <code>taste.toml</code> (location, headcount, vertical, stage) to cull rows before the expensive step.</td><td>No</td></tr>
              <tr><td class="field">enrich</td><td>Fetches each surviving company's about-page and stores a stripped text summary.</td><td>No</td></tr>
              <tr><td class="field">verdict</td><td>Sends each enriched survivor to the LLM with your criteria + the playbook, and stores a yes/maybe/no.</td><td><strong>Yes — reads only</strong></td></tr>
              <tr><td class="field">triage</td><td>You browse the scored table, filter, and open companies to inspect. This is the web UI you're in now.</td><td>No</td></tr>
            </tbody>
          </table>
          <p>You drive all of this from the <strong>Run</strong> panel in the sidebar (or the <code>scout</code> CLI). Each run streams live progress in a drawer.</p>
        </section>

        <section id="doc-ingest">
          <h3 class="dsec"><span class="n">03</span> Ingest &amp; CSV format</h3>
          <p class="lede">Ingestion loads a CSV dump into scout's local database. Use <strong>Ingest CSV…</strong> in the sidebar (or <code>scout ingest &lt;file.csv&gt;</code>). The first row must be a header.</p>

          <h4>What happens to each row</h4>
          <ul>
            <li>The header is matched against a table of <strong>known aliases</strong> — Crunchbase exports vary, so several spellings map to the same canonical field (see below).</li>
            <li>A <strong>UTF-8 BOM</strong> on the first header cell is stripped (Crunchbase exports include one) so the name column still matches.</li>
            <li>Rows with <strong>no resolved name are skipped</strong>; everything else is upserted.</li>
            <li>The <strong>entire original row is preserved</strong> in a <code>raw_json</code> field — even columns scout doesn't recognize — so no signal is lost. You can see it under "Raw row" when you open a company.</li>
            <li>Headcount tolerates ranges (<code>"11-50"</code> → upper bound <code>50</code>) and commas (<code>"1,200"</code>). Domains are normalized (scheme, <code>www.</code>, and path stripped).</li>
            <li>Re-ingesting is an <strong>upsert</strong> keyed on a <strong>deterministic ID derived from the company's identity</strong> — its domain, or its name when there's no domain. The same company collapses into one row across re-ingests, and even when it arrives from a different source (last writer wins); the original <code>source</code> / <code>source_id</code> are kept as provenance.</li>
          </ul>

          <h4>Recognized CSV headers</h4>
          <p>Only <strong>name</strong> is strictly required. Everything else is optional, but each field powers the filter and gives the LLM more to judge on. Matching is case-insensitive.</p>
          <table class="dt">
            <thead><tr><th>Field</th><th></th><th>Accepted header names (any one)</th><th>Used for</th></tr></thead>
            <tbody>
              <tr><td class="field">name</td><td><span class="tag tag-req">required</span></td><td><code>Name</code>, <code>Organization Name</code>, <code>Company</code>, <code>Company Name</code></td><td>identity; rows without it are skipped</td></tr>
              <tr><td class="field">source_id</td><td><span class="tag tag-opt">optional</span></td><td><code>UUID</code>, <code>id</code>, <code>cb_id</code>, <code>Crunchbase UUID</code>, <code>Organization Name URL</code></td><td>source provenance (last writer wins)</td></tr>
              <tr><td class="field">domain</td><td><span class="tag tag-opt">optional</span></td><td><code>Domain</code>, <code>Website</code>, <code>Homepage URL</code>, <code>URL</code></td><td>enrichment + dedup identity</td></tr>
              <tr><td class="field">vertical</td><td><span class="tag tag-opt">optional</span></td><td><code>Industry</code>, <code>Industries</code>, <code>Category</code>, <code>Categories</code>, <code>Vertical</code></td><td>filter + verdict</td></tr>
              <tr><td class="field">location</td><td><span class="tag tag-opt">optional</span></td><td><code>Location</code>, <code>Headquarters Location</code>, <code>HQ Location</code>, <code>City</code>, <code>Headquarters</code></td><td>filter (location gate)</td></tr>
              <tr><td class="field">headcount</td><td><span class="tag tag-opt">optional</span></td><td><code>Headcount</code>, <code>Employees</code>, <code>Number of Employees</code>, <code>Employee Count</code></td><td>filter (size gate)</td></tr>
              <tr><td class="field">funding_stage</td><td><span class="tag tag-opt">optional</span></td><td><code>Funding Stage</code>, <code>Last Funding Type</code>, <code>Stage</code>, <code>Last Funding Round</code></td><td>filter + verdict</td></tr>
            </tbody>
          </table>
          <div class="callout">Unrecognized columns aren't an error — they're kept verbatim in <code>raw_json</code>. A standard Crunchbase company export works as-is.</div>
        </section>

        <section id="doc-filter">
          <h3 class="dsec"><span class="n">04</span> The pre-filter</h3>
          <p class="lede">Before spending an LLM call on a company, scout culls obvious misses with cheap mechanical gates. These live in <code>taste.toml</code> and are <strong>not judgment</strong> — just coarse hard gates. Nuanced fit happens later, at verdict time.</p>
          <p>Every company is checked against four gates in order. The <strong>first failing check</strong> is recorded as the drop reason, so you can see exactly why rows were culled.</p>
          <table class="dt">
            <thead><tr><th>Gate</th><th>Rule</th></tr></thead>
            <tbody>
              <tr><td class="field">location</td><td>The location must contain one of the allowed substrings (e.g. <code>san francisco</code>, <code>bay area</code>, <code>remote</code>). A missing location passes only when <code>remote_ok</code> is set.</td></tr>
              <tr><td class="field">headcount</td><td>Must fall within <code>[min, max]</code> (<code>0</code> means no bound). A missing headcount passes — companies aren't punished for not exporting the field.</td></tr>
              <tr><td class="field">vertical — excluded</td><td>If the vertical matches any excluded substring (e.g. <code>crypto</code>, <code>legal tech</code>, <code>insurance</code>), it's dropped — always.</td></tr>
              <tr><td class="field">vertical — allowed</td><td>If an allowlist is set, the vertical must match one of it. (Left empty by default, so everything not excluded passes.)</td></tr>
              <tr><td class="field">funding stage</td><td>If a stage allowlist is set, the stage must match one. (Empty = allow all.)</td></tr>
            </tbody>
          </table>
          <p>Survivors of the filter are the only companies that get enriched and scored. The filter is read-only — it changes no data, and you tune it by editing <code>taste.toml</code> on disk.</p>
        </section>

        <section id="doc-enrich">
          <h3 class="dsec"><span class="n">05</span> Enrichment</h3>
          <p class="lede">Enrichment gives the LLM something real to read: it fetches each company's own about-page and stores a cleaned-up text summary. Run it with <strong>Enrich</strong> in the sidebar (or <code>scout enrich</code>).</p>
          <h4>How a page is fetched</h4>
          <ul>
            <li>For each company with a domain, scout tries a few candidate paths in order — <code>/about</code> → <code>/about-us</code> → <code>/company</code> → <code>/</code> — and takes the <strong>first one that returns 2xx HTML</strong>.</li>
            <li>It strips <code>&lt;script&gt;</code>, <code>&lt;style&gt;</code>, SVG, and all tags; decodes common entities; collapses whitespace; and <strong>truncates to ~3000 characters</strong>. (12s timeout, 512&nbsp;KB read cap, 8 parallel fetchers.)</li>
            <li>Results are cached. A company is re-fetched only if it was re-ingested since the last fetch, or you force it. <strong>Failures are remembered</strong>, not retried in a hot loop.</li>
          </ul>
          <h4>Fetch status — what each outcome means</h4>
          <p>Every company gets exactly one status. Only <span class="pill pill-yes">ok</span> rows go on to the verdict stage; the rest carry a non-<code>ok</code> status you can see in each company's <strong>Enrichment</strong> detail.</p>
          <table class="dt">
            <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td class="field">ok</td><td>Fetched real HTML with enough text (≥ ~200 chars) to judge on.</td></tr>
              <tr><td class="field">low_content</td><td>Fetched, but too little text — usually a JavaScript app shell. Cached, but skipped at verdict.</td></tr>
              <tr><td class="field">challenge</td><td>The page is a bot-challenge interstitial (Cloudflare / PerimeterX / Akamai, etc.).</td></tr>
              <tr><td class="field">soft_404</td><td>Every candidate path returned 200 with a "page not found" body. Skipped so we don't store a dead about link.</td></tr>
              <tr><td class="field">no_domain</td><td>The company has no domain to fetch.</td></tr>
              <tr><td class="field">http_&lt;code&gt;</td><td>A non-2xx response, e.g. <code>http_404</code>, <code>http_503</code>.</td></tr>
              <tr><td class="field">dns / refused / timeout</td><td>DNS lookup failed / connection refused / request timed out.</td></tr>
              <tr><td class="field">error</td><td>Any other fetch error; detail is stored alongside it.</td></tr>
            </tbody>
          </table>
        </section>

        <section id="doc-verdict">
          <h3 class="dsec"><span class="n">06</span> The verdict &amp; prompts</h3>
          <p class="lede">This is the heart of scout: for each enriched survivor, it asks an LLM "is this worth the user's time?" and stores a <span class="pill pill-yes">yes</span> / <span class="pill pill-maybe">maybe</span> / <span class="pill pill-no">no</span> with a one-line reason. Run it with <strong>Verdict</strong> (needs an <code>ANTHROPIC_API_KEY</code>).</p>

          <h4>The four inputs to a single verdict</h4>
          <table class="dt">
            <thead><tr><th>Input</th><th>Source</th><th>Role</th></tr></thead>
            <tbody>
              <tr><td class="field">Output contract</td><td>fixed in scout's code</td><td>the required JSON shape — never editable</td></tr>
              <tr><td class="field">Playbook</td><td><code>playbook.md</code></td><td><em>how</em> to decide: rubric, tie-breaking, "default to maybe when unsure"</td></tr>
              <tr><td class="field">Your criteria</td><td>the <strong>brain</strong> (or <code>taste.md</code>)</td><td><em>what</em> you want + your rules and hard exclusions</td></tr>
              <tr><td class="field">This company</td><td>scout's DB + the <strong>brain</strong></td><td>Crunchbase fields + the fetched site text + any brain memory about this specific company</td></tr>
            </tbody>
          </table>

          <h4>The system prompt (assembled fresh, identical across a run)</h4>
          <p>scout layers three blocks into the system prompt. The first is fixed; the other two are exactly the files / criteria described above:</p>
          <pre class="code"><span class="c">/* 1. OUTPUT CONTRACT — fixed in code, never editable */</span>
You are Scout's verdict engine. Given a company, decide if it's
worth the user's time to investigate further as a job opportunity.
Reply ONLY with valid JSON, no preamble, no markdown fences. The
JSON must have exactly two fields:
  {<span class="k">"verdict"</span>: <span class="s">"yes"|"maybe"|"no"</span>, <span class="k">"reason"</span>: <span class="s">"one-line, specific"</span>}

<span class="c">--- PLAYBOOK (how to decide) ---</span>
<span class="c">   ← the full text of playbook.md (or a built-in rubric)</span>

<span class="c">--- TASTE (what the user wants) ---</span>
<span class="c">   ← your criteria: the company-fit brief, or taste.md offline</span></pre>

          <h4>The user prompt (one per company)</h4>
          <p>The company's own data is sent as the user message — only the fields that exist are included:</p>
          <pre class="code">Company: &lt;name&gt;
Domain / Vertical / Location / Headcount / Funding stage: &lt;…&gt;

Website text (truncated):
&lt;the stripped about-page text from enrichment&gt;

Return the JSON verdict now.</pre>

          <h4>Where the brain comes in</h4>
          <ul>
            <li><strong>Your criteria</strong> are the <strong>company-fit brief</strong> — an LLM distills the brain's fit-relevant pages into one prose brief (hard dealbreakers / strong preferences / context), cached locally and re-distilled on demand from the Settings panel. If the brain is unreachable and the cache is gone, scout falls back to <code>taste.md</code>.</li>
            <li><strong>No per-company lookup.</strong> Scout reads the brain once for your criteria — it never queries the brain per company. A brain miss is logged and ignored; the verdict still runs on the local fallback.</li>
          </ul>

          <h4>Model, parsing, and re-scoring</h4>
          <ul>
            <li>The first pass runs on <strong>Haiku</strong> (<code>claude-haiku-4-5</code>) — cheap and fast. <strong>Prompt caching</strong> is on: the system block is identical across the run, so it's billed once.</li>
            <li>scout parses <code>{"verdict": …, "reason": …}</code> tolerantly (it copes with stray fences or text) and stores one row per company.</li>
            <li>A verdict is tagged with the <strong>criteria version</strong> it was scored under — a hash of the playbook + your criteria — recorded as provenance in the company's decision trail. A scored company is <strong>sticky</strong>: editing the playbook, the brief, or <code>taste.md</code> does <em>not</em> re-score it. Re-scoring is always explicit (see <em>Re-running</em> below), so a criteria tweak never silently churns your existing verdicts.</li>
          </ul>
        </section>

        <section id="doc-files">
          <h3 class="dsec"><span class="n">07</span> Files scout reads</h3>
          <p class="lede">scout's behavior comes from a handful of inputs. Two of them are editable right here in the UI; the brain is external and read-only.</p>
          <table class="dt">
            <thead><tr><th>What</th><th>Holds</th><th>Edit it</th></tr></thead>
            <tbody>
              <tr><td class="field">taste.toml</td><td>The mechanical pre-filter gates (location, headcount, vertical, stage). Cheap hard culls — not judgment.</td><td>on disk</td></tr>
              <tr><td class="field">playbook</td><td><em>How</em> scout decides — the rubric and tie-breaking procedure. Scout's own logic, not your data. Stored in scout.db; a compiled-in default seeds it.</td><td><strong>in the UI</strong> ("edit playbook")</td></tr>
              <tr><td class="field">taste.md</td><td><em>What</em> you want — the offline fallback for your criteria, used only when the brain is unreachable.</td><td><strong>in the UI</strong> ("edit taste.md")</td></tr>
              <tr><td class="field">the brain</td><td>The primary source of your criteria + per-company memory. A separate HTTP service. <strong>Read-only</strong>: scout never writes it.</td><td>elsewhere (not in scout)</td></tr>
              <tr><td class="field">scout.db</td><td>The local SQLite working set: companies, enrichment, verdicts, and run history. Disposable — rebuild from a CSV anytime.</td><td>managed by scout</td></tr>
            </tbody>
          </table>
          <div class="callout">The in-UI editor writes the <strong>local files only</strong> and never touches the brain — that separation is deliberate. An edit changes the criteria version going forward; existing verdicts stay put until you re-score them.</div>
        </section>

        <section id="doc-triage">
          <h3 class="dsec"><span class="n">08</span> Triage &amp; results</h3>
          <p class="lede">The main table is where you actually work. Each row is a company with a <strong>flag</strong> bookmark, its verdict pill, the one-line reason, and the structured fields. Sort by any column — including <strong>reviewed</strong>, so you can cycle oldest-reviewed-first; filter by verdict (multi-select chips) or flag, or search by name, vertical, or reason.</p>
          <h4>The jobs view &amp; the Add dialog</h4>
          <p>The <strong>jobs</strong> tab is the application tracker: one row per saved posting, showing the company plus the lifecycle — <strong>applied</strong> (date), <strong>response</strong> (screening call / interview / offer / rejected), <strong>outreach count</strong>, <strong>last outreach</strong>, and <strong>contacts</strong> (emails render as mailto links). Clicking a row opens the <strong>pursuit panel</strong> — the one place all per-posting editing lives: the pipeline (applied toggle + date, response select, a <strong>next up</strong> queue mark), the outreach section (a "+1 outreach" logger for messages sent outside scout, contacts, and the draft queue), and a View company button. <em>Next up</em> is a to-do, not a status: mark the pursuits you intend to reach out to, filter the table by the chip, and the mark clears itself the moment the outreach goes out (a +1 log or a draft marked sent). The company pane's jobs list shows the same status read-only; click a card to jump to its pursuit. Rejected rows are hidden from the jobs table by default — the footer note says how many, with a one-click show.</p>
          <p>The fastest way in is <strong>Add…</strong>: toggle company or job, paste the link, and submit — every other field is optional. With <em>fill in the blanks</em> ticked, a posting link on a supported ATS (Ashby, Greenhouse, Lever) is read straight from the platform's public API — exact title, location, department, employment and workplace type, published salary range, posted date, and the full description, with no LLM involved; any other link gets a one-shot agent pass (Haiku) that fetches the page and extracts the details. Anything you typed wins over either — a posting attaches to its company, creating the company first if it's not in the list, and a captured <em>company page</em> seeds the enrichment row from the fetched text, so the next Verdict run can score it immediately. Untick it for a plain write with no fetch and no LLM call: a company is stored as typed, and a job attaches to the typed company or to the link's own domain (an ATS link with no company named is rejected rather than guessed at). Pages that can't be fetched (login walls, bot challenges) are reported honestly with their fetch status — nothing is invented.</p>
          <h4>Opening a company</h4>
          <p>Click anywhere on a row to slide open its detail pane, which gathers everything scout knows in one place. The pane's top bar shows the flag state and the last-reviewed stamp, with a <strong>flag / unflag</strong> toggle and a <strong>Mark reviewed</strong> button — every click moves the stamp to now, so the reviewed sort keeps rotating fresh companies to the top.</p>
          <p>The detail pane includes:</p>
          <ul>
            <li><strong>Crunchbase facts</strong> — the structured fields, plus the full original CSV row under "Raw row".</li>
            <li><strong>Verdict</strong> — the call, the reason, the model used, and the criteria version it was scored under.</li>
            <li><strong>Enrichment</strong> — the fetched URL, the fetch status, and the stripped site text the LLM actually read.</li>
            <li><strong>Brain context</strong> — what the brain remembers about this specific company, if anything (shown only when the brain is reachable).</li>
          </ul>
          <h4>Re-running</h4>
          <p>The <strong>unscored</strong> filter chip carries a live count of companies still awaiting a verdict. A <strong>Verdict</strong> run scores those new arrivals and leaves everything already scored untouched — so re-running is always cheap and never disturbs verdicts you've reviewed. Changing your criteria or playbook doesn't invalidate anything. When you do want a company re-judged against the latest criteria, use the <strong>↻ re-score</strong> button in its detail pane (a single, deliberate call); to refresh the whole set, run <code>scout verdict --force</code>.</p>
        </section>

      </div>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>
`;function ys(y){const i={rows:[],sort:{k:"verdict",dir:1},openId:null,stats:null,profile:null,view:"companies",jobs:[],jsort:{k:"created_at",dir:1},openDetail:null,anthropicKey:null},g=e=>"pill pill-"+(e||"none"),I='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 14V2.5"/><path d="M3.5 2.5c3-1.2 6 1.2 9 0V9c-3 1.2-6-1.2-9 0z"/></svg>',r=e=>String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),v=e=>/^https?:\/\//i.test(String(e??""))?r(e):"#";async function k(){const t=await(await fetch("/api/companies")).json();i.rows=t.rows||[],H()}async function w(){let e;try{const t=await fetch("/api/postings");if(!t.ok)return;e=await t.json()}catch{return}i.jobs=e.rows||[],$(),R(),T()}function R(){if(!h.postingId)return;const e=i.jobs.find(t=>t.posting_id===h.postingId);e&&(h.row=e,document.getElementById("pursuit-pane").classList.contains("open")&&ae())}let S=null;function T(){const e=i.jobs.some(t=>t.outreach_draft_status==="researching");e&&!S?S=setInterval(Me,4e3):!e&&S&&(clearInterval(S),S=null)}async function Me(){let e;try{const a=await fetch("/api/postings");if(!a.ok)return;e=await a.json()}catch{return}const t=e.rows||[],n=new Map(i.jobs.map(a=>[a.posting_id,a.outreach_draft_status])),s=t.some(a=>n.get(a.posting_id)!==a.outreach_draft_status)||t.length!==i.jobs.length;i.jobs=t,s&&($(),R()),T()}function W(e){i.view=e,document.getElementById("tab-companies").classList.toggle("active",e==="companies"),document.getElementById("tab-jobs").classList.toggle("active",e==="jobs"),document.getElementById("companies-view").style.display=e==="companies"?"":"none",document.getElementById("jobs-view").style.display=e==="jobs"?"":"none",document.getElementById("block-filter-companies").style.display=e==="companies"?"":"none",document.getElementById("block-filter-jobs").style.display=e==="jobs"?"":"none",Pe(),e==="jobs"?$():H()}async function M(){let e;try{const t=await fetch("/api/stats");if(!t.ok)throw new Error(`HTTP ${t.status}`);e=await t.json()}catch(t){const n=document.getElementById("unscored-n");n.textContent="–",n.title=`stats failed: ${t.message}`;return}i.stats=e,x()}function x(){const e=i.stats||{};document.getElementById("unscored-n").textContent=e.unscored??0,O()}function j(e,t,n){const s=e[n]??"",a=t[n]??"";if(n==="headcount")return(s|0)-(a|0);if(n==="verdict"){const o={yes:0,maybe:1,no:2,"":3};return(o[s]??3)-(o[a]??3)}return String(s).localeCompare(String(a))}function A(e){return e.slice().sort((t,n)=>i.sort.dir*j(t,n,i.sort.k))}const C=new Set;let Y=!1;function Ae(){document.querySelectorAll("#verdict-chips .v-chip[data-v]").forEach(e=>{e.classList.toggle("is-on",C.has(e.dataset.v))})}function ee(){const e=document.getElementById("q").value.trim().toLowerCase();return i.rows.filter(t=>!(C.size&&!C.has(t.verdict||"__none__")||Y&&!t.flagged||e&&!(t.name+" "+(t.vertical||"")+" "+(t.reason||"")).toLowerCase().includes(e)))}const He=[{k:"flag",label:"flag"},{k:"verdict",label:"verdict"},{k:"reason",label:"reason"},{k:"vertical",label:"vertical"},{k:"location",label:"location"},{k:"hc",label:"hc"},{k:"stage",label:"stage"},{k:"reviewed",label:"reviewed"},{k:"site",label:"site"}],Yt=[{k:"applied",label:"applied"},{k:"response",label:"response"},{k:"outreach",label:"outreach"},{k:"last_outreach",label:"last outreach"},{k:"contacts",label:"contacts"},{k:"link",label:"link"}];function dt(e){try{return new Set(JSON.parse(localStorage.getItem(e)||"[]"))}catch{return new Set}}const lt=dt("scout-hidden-cols"),ut=dt("scout-hidden-jcols");function pt(){return i.view==="jobs"?{cols:Yt,hidden:ut,key:"scout-hidden-jcols"}:{cols:He,hidden:lt,key:"scout-hidden-cols"}}function te(){document.querySelectorAll("#t [data-col]").forEach(e=>{e.style.display=lt.has(e.dataset.col)?"none":""}),document.querySelectorAll("#jt [data-col]").forEach(e=>{e.style.display=ut.has(e.dataset.col)?"none":""})}function Pe(){const e=pt();document.getElementById("col-toggles").innerHTML=e.cols.map(t=>`<button class="col-chip${e.hidden.has(t.k)?"":" is-on"}" data-col="${t.k}" title="${e.hidden.has(t.k)?"show":"hide"} ${t.label}">${t.label}</button>`).join(""),document.querySelectorAll("#col-toggles .col-chip").forEach(t=>{t.addEventListener("click",()=>{const n=pt(),s=t.dataset.col;n.hidden.has(s)?n.hidden.delete(s):n.hidden.add(s),localStorage.setItem(n.key,JSON.stringify([...n.hidden])),Pe(),te()})})}function ht(e){return`
      <td class="td-flag" data-col="flag"><button class="flag-btn${e.flagged?" is-on":""}" data-id="${e.company_id}" title="${e.flagged?"unflag":"flag"}">${I}</button></td>
      <td data-col="verdict"><span class="${g(e.verdict)}">${r(e.verdict||"—")}</span></td>
      <td><span class="row-name" data-id="${e.company_id}">${r(e.name)}</span></td>
      <td class="reason" data-col="reason">${r(e.reason||"")}</td>
      <td data-col="vertical">${r(e.vertical||"")}</td>
      <td data-col="location">${r(e.location||"")}</td>
      <td data-col="hc">${e.headcount||""}</td>
      <td data-col="stage">${r(e.stage||"")}</td>
      <td data-col="reviewed" class="muted" title="${r(e.reviewed_at||"never reviewed")}">${e.reviewed_at?r(e.reviewed_at.slice(0,10)):"—"}</td>
      <td data-col="site">${e.website_url?`<a href="${v(e.website_url)}" target="_blank" rel="noopener">about ↗</a>`:""}</td>
    `}function mt(e){const t=e.querySelector(".flag-btn");t&&t.addEventListener("click",()=>Ct(t.dataset.id))}function H(){const e=document.querySelector("#t tbody");e.innerHTML="";const t=A(ee());document.getElementById("empty").style.display=t.length?"none":"block";for(const n of t){const s=document.createElement("tr");s.dataset.id=n.company_id,s.innerHTML=ht(n),s.addEventListener("click",a=>{a.target.closest("a, .flag-btn")||ce(s.dataset.id)}),e.appendChild(s),mt(s)}te()}async function Gt(e){const n=await(await fetch("/api/companies")).json();i.rows=n.rows||[];const s=document.querySelector("#t tbody"),a=A(ee()).map(c=>c.company_id),o=[...s.querySelectorAll("tr")].map(c=>c.dataset.id);if(a.length!==o.length||a.some((c,p)=>c!==o[p])){H();return}for(const c of e){const p=i.rows.find(d=>d.company_id===c),u=s.querySelector(`tr[data-id="${CSS.escape(c)}"]`);if(!p||!u){H();return}u.innerHTML=ht(p),mt(u)}te()}const N=new Set;let me=!1,fe=!1,F=!0;function Qt(){const e=document.getElementById("jq").value.trim().toLowerCase(),t=F&&!N.has("rejected");return i.jobs.filter(n=>!(t&&n.response==="rejected"||N.size&&!N.has(n.response||"")||me&&!n.next_up||fe&&(n.outreach_count|0)>0||e&&!(n.title+" "+n.company+" "+(n.location||"")+" "+(n.summary||"")+" "+(n.contacts||"")).toLowerCase().includes(e)))}const Zt=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;function ft(e){const t=String(e||"").split(",").map(n=>n.trim()).filter(Boolean);return t.length?t.map(n=>{const s=n.match(Zt);return s?`<a href="mailto:${r(s[0])}" title="${r(n)}">${r(n)}</a>`:r(n)}).join('<span class="dim">, </span>'):'<span class="dim">—</span>'}const V={offer:{cls:"pill-yes",label:"offer",order:0},interview:{cls:"pill-info",label:"interview",order:1},screening:{cls:"pill-maybe",label:"screening call",order:2},"":{cls:"pill-none",label:"—",order:3},rejected:{cls:"pill-no",label:"rejected",order:4}};function Xt(e,t,n){var s,a;if(n==="verdict"){const o={yes:0,maybe:1,no:2,"":3};return(o[e.verdict]??3)-(o[t.verdict]??3)}if(n==="response")return(((s=V[e.response])==null?void 0:s.order)??3)-(((a=V[t.response])==null?void 0:a.order)??3);if(n==="outreach_count")return(t.outreach_count|0)-(e.outreach_count|0);if(n==="created_at"||n==="applied_at"||n==="last_outreach_at"){const o=e[n]||"",c=t[n]||"";return!o&&!c?0:o?c?String(c).localeCompare(String(o)):-i.jsort.dir:i.jsort.dir}return String(e[n]??"").localeCompare(String(t[n]??""))}function ne(e){const t=e.options[e.selectedIndex],n=getComputedStyle(e),s=ne._c||(ne._c=document.createElement("canvas").getContext("2d"));s.font=`${n.fontWeight} ${n.fontSize} ${n.fontFamily}`;const a=s.measureText(t?t.text:"").width;e.style.width=Math.ceil(a+35)+"px"}function $(){const e=document.querySelector("#jt tbody");e.innerHTML="";const t=Qt().sort((d,m)=>i.jsort.dir*Xt(d,m,i.jsort.k));document.getElementById("jobs-empty").style.display=t.length?"none":"block";const n=F&&!N.has("rejected")?i.jobs.filter(d=>d.response==="rejected").length:0,s=document.getElementById("hidden-rej-n");s.textContent=n,s.style.display=n?"":"none";const a=i.jobs.filter(d=>d.next_up).length,o=document.getElementById("next-up-n");o.textContent=a,o.style.display=a?"":"none";const c=i.jobs.filter(d=>!(d.outreach_count|0)&&!(F&&!N.has("rejected")&&d.response==="rejected")).length,p=document.getElementById("not-reached-n");p.textContent=c,p.style.display=c?"":"none";const u=document.getElementById("jobs-hidden-note");u.style.display=n?"":"none",n&&(u.innerHTML=`${n} rejected application${n>1?"s":""} hidden — <a id="show-rejected-link">show</a>`,document.getElementById("show-rejected-link").onclick=()=>{F=!1,document.getElementById("hide-rejected").classList.remove("is-on"),$()});for(const d of t){const m=V[d.response]||V[""],f=document.createElement("tr");f.dataset.id=d.posting_id;const _=[["","none"],["screening","screening"],["interview","interview"],["offer","offer"],["rejected","rejected"]].map(([E,z])=>`<option value="${E}"${(d.response||"")===E?" selected":""}>${z}</option>`).join("");f.innerHTML=`
      <td><div class="jt-namecell"><button class="jt-nextup${d.next_up?" is-on":""}" title="${d.next_up?"queued next up for outreach — click to remove":"mark next up for outreach"}" aria-label="next up">${d.next_up?"★":"☆"}</button><div class="jt-namecol"><span class="row-name">${r(d.title||d.company)}</span>${en(d.outreach_draft_status)}${d.title?`<div class="small dim">${r(d.company)}</div>`:""}</div></div></td>
      <td class="small" data-col="applied"><button class="jt-applied${d.applied_at?" is-on":""}" title="${d.applied_at?"mark as not applied":"mark applied today"}">${d.applied_at?r(d.applied_at):"+ applied"}</button></td>
      <td data-col="response"><select class="jt-resp ${m.cls}" title="furthest response reached">${_}</select></td>
      <td class="small" data-col="outreach"><span class="jt-stepper"><button class="jt-dec" title="undo one outreach"${d.outreach_count?"":" disabled"}>−</button><span class="jt-oc${d.outreach_count?"":" dim"}">${d.outreach_count||0}</span><button class="jt-inc" title="log one outreach (today)">+</button></span></td>
      <td class="small" data-col="last_outreach">${d.last_outreach_at?r(d.last_outreach_at):'<span class="dim">—</span>'}</td>
      <td class="small td-contacts" data-col="contacts">${ft(d.contacts)}</td>
      <td data-col="link"><a href="${v(d.url)}" target="_blank" rel="noopener">open ↗</a></td>
    `;const B=()=>new Date().toISOString().slice(0,10);f.querySelector(".jt-nextup").onclick=()=>wt(d,!1),f.querySelector(".jt-applied").onclick=()=>ge(d,{applied_at:d.applied_at?"":B()}),f.querySelector(".jt-resp").onchange=E=>{ne(E.target),ge(d,{response:E.target.value})},f.querySelector(".jt-inc").onclick=()=>ge(d,{outreach_count:(d.outreach_count||0)+1,last_outreach_at:B()}),f.querySelector(".jt-dec").onclick=()=>{const E=Math.max(0,(d.outreach_count||0)-1);ge(d,{outreach_count:E,...E===0?{last_outreach_at:""}:{}})},e.appendChild(f)}e.querySelectorAll(".jt-resp").forEach(ne),te(),e.querySelectorAll("tr").forEach(d=>{d.addEventListener("click",m=>{m.target.closest("a, button, select")||vt(d.dataset.id)})})}function en(e){return e==="awaiting_review"?'<span class="draft-badge" title="an outreach draft is ready to review">draft ready</span>':e==="needs_work"?'<span class="draft-badge db-needswork" title="the draft finished below the depth bar — review, fix or regenerate">draft needs work</span>':e==="no_hook"?'<span class="draft-badge db-nohook" title="no honest hook — scout recommends not emailing">no hook</span>':""}const h={postingId:null,row:null,drafts:[],poll:null,openHist:!1,answers:[],answersStatus:"",answersPoll:null,detecting:!1};async function vt(e){let t=i.jobs.find(n=>n.posting_id===e);if(t||(await w(),t=i.jobs.find(n=>n.posting_id===e)),!t){l("posting not found — refresh");return}Ne(),Re(),h.postingId=e,h.row=t,h.drafts=[],h.openHist=!1,h.answers=[],h.detecting=!1,h.answersStatus=t.questions_status||"",document.getElementById("pursuit-pane").classList.add("open"),document.getElementById("pursuit-scrim").classList.add("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","false"),gt("pursuit"),ae(),se(),ie()}let qe=null;function gt(e){qe=e;const t=e==="company";document.getElementById("scrim").style.zIndex=t?"54":"52",document.getElementById("pane").style.zIndex=t?"55":"53",document.getElementById("pursuit-scrim").style.zIndex=t?"52":"54",document.getElementById("pursuit-pane").style.zIndex=t?"53":"55"}function ve(){Ne(),Re(),h.postingId=null,h.row=null,h.drafts=[],h.answers=[],h.answersStatus="",document.getElementById("pursuit-pane").classList.remove("open"),document.getElementById("pursuit-scrim").classList.remove("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","true")}function Ne(){h.poll&&(clearInterval(h.poll),h.poll=null)}async function se(){if(!h.postingId)return;let e;try{const n=await fetch(`/api/postings/${h.postingId}/outreach`);if(!n.ok){ye();return}e=await n.json()}catch{ye();return}h.drafts=e.drafts||[],ye();const t=h.drafts[0];t&&t.status==="researching"?tn():Ne()}function tn(){h.poll||(h.poll=setInterval(se,4e3))}function P(e,t,{multiline:n=!1}={}){if(!e)return;let s=e.value;e.addEventListener("focus",()=>{s=e.value}),e.addEventListener("keydown",a=>{a.key==="Escape"?(a.preventDefault(),e.value=s,e.blur()):a.key==="Enter"&&(!n||a.metaKey||a.ctrlKey)&&(a.preventDefault(),e.blur())}),e.addEventListener("blur",async()=>{const a=e.value.trim();if(a===s.trim()){e.value=s;return}e.classList.remove("is-saved","is-error"),e.classList.add("is-saving");try{await t(a),s=e.value,e.classList.remove("is-saving"),e.classList.add("is-saved"),setTimeout(()=>e.classList.remove("is-saved"),1200)}catch(o){e.value=s,e.classList.remove("is-saving"),e.classList.add("is-error"),setTimeout(()=>e.classList.remove("is-error"),1600),l(`save failed: ${o.message}`)}})}async function yt(e,t,n){const s={title:e.title||"",location:e.location||"",comp_range:e.comp_range||"",employment_type:e.employment_type||"",workplace_type:e.workplace_type||"",department:e.department||"",summary:e.summary||"",description:e.description||"",[t]:n},a=await fetch(`/api/postings/${e.posting_id}/details`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)});if(!a.ok)throw new Error((await a.text().catch(()=>"")).trim()||"HTTP "+a.status);const o=await a.json();Object.assign(e,{title:o.title,location:o.location,summary:o.summary,employment_type:o.employment_type,workplace_type:o.workplace_type,department:o.department,comp_range:o.comp_range,description:o.description}),$(),le(e.posting_id,{title:o.title,location:o.location,summary:o.summary})}async function nn(e,t){const n=await fetch(`/api/postings/${e.posting_id}/url`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json();e.url=s.url;const a=document.querySelector("#role-body .role-url-open");a&&a.setAttribute("href",v(e.url)),le(e.posting_id,{url:s.url})}async function bt(e,t,n){const s={name:e.name||"",headcount:e.headcount||"",funding_stage:e.funding_stage||"",location:e.location||"",vertical:e.vertical||"",[t]:n};if(!String(s.name).trim())throw new Error("name is required");const a=await fetch(`/api/companies/${e.company_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)});if(!a.ok)throw new Error((await a.text().catch(()=>"")).trim()||"HTTP "+a.status);const o=await a.json();Object.assign(e,{name:o.name,headcount:o.headcount,funding_stage:o.funding_stage,location:o.location,vertical:o.vertical}),k(),w()}async function sn(e,t){const n=await fetch(`/api/companies/${e.company_id}/domain`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({website:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json();i.openId=s.company_id,de(s),ue(s.company_id),k(),w()}async function an(e,t){const n=await fetch(`/api/companies/${e.company_id}/notes`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({notes:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json();e.notes=s.notes}function ae(){const e=h.row;if(!e)return;document.getElementById("pursuit-title").innerHTML=`<input class="ie ie-title" id="pursuit-title-input" placeholder="role name" value="${r(e.title||"")}">`;const t=V[e.response]||V[""];document.getElementById("pursuit-pills").innerHTML=`<span class="pill ${t.cls}">${r(t.label)}</span>`+(e.verdict?` <span class="${g(e.verdict)}">${r(e.verdict)}</span>`:"");const n=document.getElementById("pursuit-chat");n&&(n.style.display=i.meta&&i.meta.chat?"":"none",n.onclick=()=>Te("posting",e.posting_id,e.title||e.company)),document.getElementById("pursuit-body").innerHTML=`
    <section class="pane-section role-head">
      <div id="role-body">${on(e)}</div>
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h12M8 2v12"/></svg>
        Pipeline
      </h3>
      <div class="pipeline-grid">
        <div class="pipeline-row">
          <span class="pl-label">applied</span>
          <button class="pt-chip pt-applied${e.applied_at?" is-on":""}" title="${e.applied_at?"mark as not applied":"mark applied today"}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>
            applied
          </button>
          <input type="date" class="input pl-applied-date" value="${r(e.applied_at||"")}"
                 style="display:${e.applied_at?"":"none"}" title="application date">
        </div>
        <div class="pipeline-row">
          <span class="pl-label">response</span>
          <select class="input pl-response" title="furthest response reached">
            <option value="">— none yet</option>
            <option value="screening" ${e.response==="screening"?"selected":""}>screening call</option>
            <option value="interview" ${e.response==="interview"?"selected":""}>interview</option>
            <option value="offer" ${e.response==="offer"?"selected":""}>offer</option>
            <option value="rejected" ${e.response==="rejected"?"selected":""}>rejected</option>
          </select>
        </div>
        <div class="pipeline-row">
          <span class="pl-label">queue</span>
          <button class="pt-chip pt-nextup${e.next_up?" is-on":""}" title="${e.next_up?"unmark — it also clears itself when the outreach goes out":"mark this pursuit next up for outreach"}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7"/></svg>
            next up
          </button>
        </div>
      </div>
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.5h6l3 3V13a.5.5 0 01-.5.5h-8A.5.5 0 014 13V3a.5.5 0 010-.5z"/><path d="M9.5 2.5V6h3M6 8.5h4M6 10.5h4"/></svg>
        Notes
      </h3>
      <textarea class="ie ie-notes" id="pursuit-notes-input" rows="4" placeholder="—">${r(e.notes||"")}</textarea>
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12v8H2z"/><path d="M2 4l6 5 6-5"/></svg>
        Outreach
      </h3>
      <div id="outreach-section"></div>
    </section>

    ${e.applied_at?"":`
    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2.5h7l3 3V13a.5.5 0 01-.5.5h-9A.5.5 0 013 13z"/><path d="M6 7h4M6 9.5h4M6 12h2.5"/></svg>
        Application
      </h3>
      <div id="answers-section"></div>
    </section>`}
  `,rn();const s=document.getElementById("pursuit-company-link");s&&s.addEventListener("click",()=>ce(e.company_id)),P(document.getElementById("pursuit-title-input"),a=>yt(e,"title",a)),P(document.getElementById("pursuit-url-input"),a=>nn(e,a)),P(document.getElementById("pursuit-notes-input"),a=>cn(a),{multiline:!0}),document.querySelectorAll("#role-body [data-k]").forEach(a=>P(a,o=>yt(e,a.dataset.k,o),{multiline:a.tagName==="TEXTAREA"})),ye(),re()}function on(e){return`
    <div class="role-url ie-field">
      <div class="role-url-head">
        <label>link</label>
        <a class="role-url-open" href="${v(e.url)}" target="_blank" rel="noopener" title="open the posting">↗</a>
      </div>
      <input class="ie" id="pursuit-url-input" placeholder="https://…" value="${r(e.url||"")}">
    </div>
    <div class="ie-grid">
      <div class="prow">
        <div class="ie-field"><label>location</label>
          <input class="ie" data-k="location" placeholder="—" value="${r(e.location||"")}"></div>
        <div class="ie-field"><label>comp range</label>
          <input class="ie" data-k="comp_range" placeholder="—" value="${r(e.comp_range||"")}"></div>
      </div>
      <div class="prow">
        <div class="ie-field"><label>employment</label>
          <input class="ie" data-k="employment_type" placeholder="—" value="${r(e.employment_type||"")}"></div>
        <div class="ie-field"><label>workplace</label>
          <input class="ie" data-k="workplace_type" placeholder="—" value="${r(e.workplace_type||"")}"></div>
      </div>
      <div class="ie-field"><label>department</label>
        <input class="ie" data-k="department" placeholder="—" value="${r(e.department||"")}"></div>
      <div class="ie-field"><label>summary</label>
        <textarea class="ie" data-k="summary" rows="2" placeholder="—">${r(e.summary||"")}</textarea></div>
      <div class="ie-field"><label>description</label>
        <textarea class="ie" data-k="description" rows="6" placeholder="—">${r(e.description||"")}</textarea></div>
    </div>
    <div class="role-meta">
      ${e.posted_at?`<span>posted ${r(e.posted_at)}</span>`:""}
      <button type="button" class="role-company role-company-link" id="pursuit-company-link"
              title="open the company panel">${r(e.company)} ↗</button>
    </div>`}function rn(){const e=h.row,t=()=>new Date().toISOString().slice(0,10),n=document.querySelector("#pursuit-body .pt-applied");n&&n.addEventListener("click",()=>G({applied_at:e.applied_at?"":t()}));const s=document.querySelector("#pursuit-body .pl-applied-date");s&&s.addEventListener("change",c=>G({applied_at:c.target.value}));const a=document.querySelector("#pursuit-body .pl-response");a&&a.addEventListener("change",c=>G({response:c.target.value}));const o=document.querySelector("#pursuit-body .pt-nextup");o&&o.addEventListener("click",()=>wt(h.row,!0))}async function wt(e,t){let n;try{n=await fetch(`/api/postings/${e.posting_id}/next-up`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({next_up:!e.next_up})})}catch(a){l(`save failed: ${a.message}`);return}if(!n.ok){const a=(await n.text().catch(()=>"")).trim();l(`save failed: ${a||"HTTP "+n.status}`);return}const s=await n.json();e.next_up=s.next_up,$(),le(e.posting_id,{next_up:s.next_up}),t&&ae(),l(e.next_up?"queued next up":"removed from the queue")}async function kt(e,t){const n={applied_at:e.applied_at||"",response:e.response||"",outreach_count:e.outreach_count||0,last_outreach_at:e.last_outreach_at||"",contacts:e.contacts||"",notes:e.notes||"",...t};let s;try{s=await fetch(`/api/postings/${e.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)})}catch(o){return l(`save failed: ${o.message}`),null}if(!s.ok){const o=(await s.text().catch(()=>"")).trim();return l(`save failed: ${o||"HTTP "+s.status}`),null}const a=await s.json();return Object.assign(e,{applied_at:a.applied_at,response:a.response,outreach_count:a.outreach_count,last_outreach_at:a.last_outreach_at,contacts:a.contacts,notes:a.notes,next_up:a.next_up}),le(e.posting_id,{applied_at:a.applied_at,response:a.response,outreach_count:a.outreach_count,last_outreach_at:a.last_outreach_at,next_up:a.next_up}),a}async function cn(e){const t=h.row,n={applied_at:t.applied_at||"",response:t.response||"",outreach_count:t.outreach_count||0,last_outreach_at:t.last_outreach_at||"",contacts:t.contacts||"",notes:e},s=await fetch(`/api/postings/${t.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const a=await s.json();t.notes=a.notes,$()}async function G(e){await kt(h.row,e)&&($(),ae(),l("tracking saved"))}async function ge(e,t){await kt(e,t)&&($(),h.postingId===e.posting_id&&(h.row=e,ae()),l("tracking saved"))}function ye(){const e=document.getElementById("outreach-section");if(!e)return;const t=h.row,n=h.drafts,s=n[0]||null,a=n.slice(1),o=`
    <div class="outreach-meta">
      <span><span class="om-count">${t.outreach_count||0}</span> sent</span>
      ${t.last_outreach_at?`<span>· last ${r(t.last_outreach_at)}</span>`:""}
      <span class="pt-stepper">
        <button class="btn pt-outreach-dec" title="undo one outreach" ${t.outreach_count?"":"disabled"}>−</button>
        <button class="btn pt-outreach" title="log one outreach sent outside scout — today">+1 outreach</button>
      </span>
    </div>
    <div class="outreach-contacts">
      <input class="input oc-input" value="${r(t.contacts||"")}"
             placeholder="add contacts, comma-separated (emails become links)" spellcheck="false"
             title="outreach contacts for this role — saved on Enter or click-away">
      <div class="oc-rendered">${ft(t.contacts)}</div>
    </div>`,p=s&&(dn(s.status)||s.status==="failed")?"":`<button class="btn btn-primary" id="draft-start-btn">${s?"Draft again":"Draft outreach"}</button>`,u=a.length?`
    <details class="draft-history" ${h.openHist?"open":""}>
      <summary>${a.length} earlier draft${a.length>1?"s":""}</summary>
      <div id="draft-history-body">${a.map(d=>$t(d,!0)).join("")}</div>
    </details>`:"";e.innerHTML=o+`<div id="draft-current">${s?$t(s,!1):""}</div><div class="draft-actions">${p}</div>`+u,hn()}function dn(e){return e==="researching"||e==="awaiting_review"||e==="needs_work"||e==="no_hook"}const ln='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M2.5 10.5v-7a1 1 0 011-1h7"/></svg>',un='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2L7.3 8.7"/><path d="M14 2L9.7 14l-2.4-5.3L2 6.3z"/></svg>',Et=`<button class="dh-copy draft-copy-btn" title="copy the email to the clipboard" aria-label="copy email">${ln}</button>`;function $t(e,t){const n=(f,_,B="")=>`
    <div class="draft-head">
      <span class="${f}">${_}</span>${B}
    </div>`;if(e.status==="researching")return`<div class="draft-card dc-busy">
      ${n("loading-row",'<span class="spinner"></span><span>researching…</span>')}
      <div class="draft-note">Gathering hook candidates and drafting — this usually takes a minute or two.</div>
    </div>`;if(e.status==="failed"){const f=pn(e.violations);return`<div class="draft-card dc-failed" data-did="${e.id}">
      ${n("pill pill-no","failed")}
      ${e.fail_reason?`<div class="draft-note">${r(e.fail_reason)}</div>`:""}
      ${f}
      ${xt(e.critique)}
      ${oe(e)}
      ${t?"":`<div class="draft-actions"><button class="btn btn-primary draft-retry-btn">${pe}Retry</button></div>`}
    </div>`}if(e.status==="superseded")return`<div class="draft-card dc-sent" data-did="${e.id}">
      ${n("pill pill-info","replaced")}
      <div class="draft-note">Replaced by a newer draft.</div>
      <div class="draft-sentbody">${r(Oe(e)||"(empty)")}</div>
      ${oe(e)}
    </div>`;if(e.status==="sent")return`<div class="draft-card dc-sent" data-did="${e.id}">
      ${n("pill pill-yes","sent",t?"":Et)}
      ${e.sent_at?`<div class="draft-note">Sent ${r((e.sent_at||"").replace("T"," ").slice(0,16))}</div>`:""}
      <div class="draft-sentbody">${r(Oe(e)||"(empty)")}</div>
      ${oe(e)}
    </div>`;const s=Oe(e),a=e.status==="no_hook",o=e.status==="needs_work",c=a?'<span class="pill pill-info">no honest hook</span>':o?'<span class="pill pill-maybe">needs work — below the depth bar</span>':'<span class="pill pill-maybe">awaiting review</span>';let p="";if(a)try{p=JSON.parse(e.hook||"{}").reasoning||""}catch{}const u=a?`<div class="draft-note">No honest hook found — nothing true to say yet; scout recommends not emailing.${p?" "+r(p):""}</div>`:"",d=xt(e.critique);if(t)return`<div class="draft-card ${a?"dc-nohook":"dc-review"}" data-did="${e.id}">
      <div class="draft-head">${c}</div>
      ${u}
      ${d}
      <div class="draft-sentbody">${r(s||"(empty)")}</div>
      ${oe(e)}
    </div>`;const m=s||a;return`<div class="draft-card ${a?"dc-nohook":"dc-review"}" data-did="${e.id}">
    <div class="draft-head">${c}${s?Et:""}</div>
    ${u}
    ${d}
    ${m?`<textarea class="draft-textarea" id="draft-edit-${e.id}" spellcheck="false">${r(s)}</textarea>
    ${It(e.lint)}
    <div class="draft-actions">
      <button class="btn btn-primary draft-sent-btn" title="mark this email sent — bumps the outreach count">${un}Mark sent</button>
      <button class="btn draft-regen-btn" title="discard this draft (kept in history) and re-run — picks up backfilled info">${pe}Regenerate</button>
    </div>`:`<div class="draft-actions">
      <button class="btn draft-regen-btn" title="re-run the draft — picks up backfilled info">${pe}Regenerate</button>
    </div>`}
    ${oe(e)}
  </div>`}function Oe(e){return e.edited&&e.edited.trim()?e.edited:e.draft||""}function oe(e){let t="",n=null,s=null;try{n=JSON.parse(e.research||"null")}catch{}try{s=JSON.parse(e.hook||"null")}catch{}if(n&&typeof n=="object"){const a=(u,d)=>d?`<div class="tr-line"><span class="tr-key">${u}:</span> ${r(String(d))}</div>`:"",o=n.role||{},c=Array.isArray(n.hooks)?n.hooks:[],p=c.map(u=>`
      <div class="tr-line">
        <span class="tr-key">${r(u.type||"hook")}</span>
        ${v(u.source_url)!=="#"?` · <a href="${v(u.source_url)}" target="_blank" rel="noopener">source</a>`:""}
        <span class="tr-quote">${r(u.quote||"")}</span>
        ${u.context?`<span class="tr-key">${r(u.context)}</span>`:""}
      </div>`).join("");t+=`<details class="draft-trace"><summary>research — ${c.length} hook candidate${c.length===1?"":"s"}</summary>
      <div class="trace-body">
        ${a("what they do",n.what_they_do)}
        ${a("customer",n.customer)}
        ${a("stage / headcount",[n.stage,n.headcount_est].filter(Boolean).join(" / "))}
        ${a("role",o.title)}
        ${(o.jd_quotes||[]).map(u=>`<span class="tr-quote">${r(u)}</span>`).join("")}
        ${p}
        ${a("disambiguation",n.disambiguation)}
        ${a("confidence",n.confidence)}
      </div></details>`}if(s&&typeof s=="object"&&s.decision){const a=s.hook||{};t+=`<details class="draft-trace"><summary>hook — ${r(s.decision)}${s.closer_mode?" · "+r(s.closer_mode):""}</summary>
      <div class="trace-body">
        ${a.quote?`<span class="tr-quote">${r(a.quote)}</span>`:""}
        ${a.thread?`<div class="tr-line"><span class="tr-key">thread:</span> ${r(a.thread)}</div>`:""}
        ${v(a.source_url)!=="#"?`<div class="tr-line"><a href="${v(a.source_url)}" target="_blank" rel="noopener">source</a></div>`:""}
        ${s.reasoning?`<div class="tr-line"><span class="tr-key">reasoning:</span> ${r(s.reasoning)}</div>`:""}
      </div></details>`}return t}function It(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<div class="lint-chips">'+t.map(n=>`<span class="lint-chip" title="${r(n.message||"")}"><code>${r(n.code||"")}</code>${r(n.message||"")}</span>`).join("")+"</div>":""}function xt(e){let t=null;try{t=JSON.parse(e||"null")}catch{return""}if(!t||typeof t!="object")return"";const n=t.depth==="deep"?"pill-yes":t.depth==="medium"?"pill-maybe":"pill-no",s={direct:"pill-yes",adjacent:"pill-info",standing:"pill-maybe"}[t.proof_tier]||"pill-no",a=t.proof_tier==="standing"?"standing creds":t.proof_tier,o=[t.depth?`<span class="pill ${n}">depth: ${r(t.depth)}</span>`:"",t.proof_tier?`<span class="pill ${s}">proof: ${r(a)}</span>`:""].filter(Boolean).join(""),c=Array.isArray(t.weaknesses)&&t.weaknesses.length?'<ul class="critique-list">'+t.weaknesses.map(d=>`<li>${r(String(d))}</li>`).join("")+"</ul>":"",p=String(t.experience_gaps||"").trim(),u=p?`<div class="critique-gap"><span class="cg-label">experience gap:</span> ${r(p)}</div>`:"";return!o&&!c&&!u?"":`<div class="draft-critique">
    ${o?`<div class="critique-chips">${o}</div>`:""}
    ${c}${u}
  </div>`}function pn(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<ul class="violation-list">'+t.map(n=>`<li>${r(n.claim||n.message||String(n))}${n.why?` <span class="vl-why">— ${r(n.why)}</span>`:""}</li>`).join("")+"</ul>":""}function hn(){const e=document.getElementById("outreach-section");if(!e)return;const t=e.querySelector(".oc-input");t&&(t.addEventListener("change",u=>G({contacts:u.target.value.trim()})),t.addEventListener("keydown",u=>{u.key==="Enter"&&(u.preventDefault(),u.target.blur())}));const n=()=>new Date().toISOString().slice(0,10),s=h.row,a=e.querySelector(".pt-outreach");a&&a.addEventListener("click",()=>G({outreach_count:(s.outreach_count||0)+1,last_outreach_at:n()}));const o=e.querySelector(".pt-outreach-dec");o&&o.addEventListener("click",()=>{const u=Math.max(0,(s.outreach_count||0)-1);G({outreach_count:u,...u===0?{last_outreach_at:""}:{}})});const c=e.querySelector("#draft-start-btn");c&&c.addEventListener("click",()=>be()),e.querySelectorAll(".draft-retry-btn").forEach(u=>u.addEventListener("click",()=>be())),e.querySelectorAll(".draft-regen-btn").forEach(u=>u.addEventListener("click",()=>be(!0))),e.querySelectorAll(".draft-card[data-did]").forEach(u=>{const d=u.dataset.did,m=u.querySelector(".draft-textarea");m&&P(m,B=>fn(d,B),{multiline:!0});const f=u.querySelector(".draft-sent-btn");f&&f.addEventListener("click",()=>vn(d));const _=u.querySelector(".draft-copy-btn");_&&_.addEventListener("click",()=>{const B=u.querySelector(".draft-textarea"),E=u.querySelector(".draft-sentbody"),z=B?B.value:E?E.textContent:"";Mn(z,"email copied")})});const p=e.querySelector("details.draft-history");p&&p.addEventListener("toggle",()=>{h.openHist=p.open})}async function be(e=!1){const t=document.getElementById("outreach-section"),n=t&&(t.querySelector("#draft-start-btn")||t.querySelector(".draft-retry-btn")||t.querySelector(".draft-regen-btn"));n&&(n.disabled=!0);let s;try{const o=e?"?regenerate=1":"";s=await fetch(`/api/postings/${h.postingId}/outreach${o}`,{method:"POST"})}catch(o){l(`draft failed: ${o.message}`),n&&(n.disabled=!1);return}if(s.status===202){let o={};try{o=await s.json()}catch{}Array.isArray(o.degraded)&&o.degraded.length&&l(`drafting without ${o.degraded.join(", ")} — quality degrades, integrity unaffected`),await se(),w();return}if(s.status===409){await se(),l("a draft is already active");return}if(s.status===412){let o={};try{o=await s.json()}catch{}mn(o.need,o.error),n&&(n.disabled=!1);return}if(s.status===503){const o=document.getElementById("outreach-section");if(o){const c=document.createElement("div");c.className="draft-note",c.textContent="Outreach engine not running in this build.",o.appendChild(c)}n&&(n.disabled=!1);return}const a=(await s.text().catch(()=>"")).trim();l(`draft failed: ${a||"HTTP "+s.status}`),n&&(n.disabled=!1)}function mn(e,t){const n=document.getElementById("outreach-section");if(!n)return;const s=n.querySelector(".draft-actions"),a=e==="template",o=a?"Write email template":"Discover sources",c=document.createElement("div");c.className="blocks-gate",c.innerHTML=`
    <div class="draft-note">${r(t||"Outreach isn't set up yet.")}</div>
    <div class="draft-actions">
      <button class="btn btn-primary" id="gate-fix-btn">${o}</button>
      <button class="btn" id="gate-retry-btn">Retry</button>
    </div>`,s?s.replaceWith(c):n.appendChild(c);const p=c.querySelector("#gate-fix-btn");p&&p.addEventListener("click",()=>a?Z("outreach-template"):Ke());const u=c.querySelector("#gate-retry-btn");u&&u.addEventListener("click",be)}async function fn(e,t){const n=await fetch(`/api/outreach/drafts/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json(),a=h.drafts.findIndex(p=>String(p.id)===String(e));a>=0&&(h.drafts[a]=s);const o=document.getElementById(`draft-edit-${e}`),c=o&&o.closest(".draft-card");if(c){const p=c.querySelector(".lint-chips"),u=It(s.lint);p?p.outerHTML=u||"":u&&o.insertAdjacentHTML("afterend",u)}}async function vn(e){let t;try{t=await fetch(`/api/outreach/drafts/${e}/sent`,{method:"POST"})}catch(s){l(`failed: ${s.message}`);return}if(!t.ok){const s=(await t.text().catch(()=>"")).trim();l(`failed: ${s||"HTTP "+t.status}`);return}l("marked sent"),await se(),await w();const n=i.jobs.find(s=>s.posting_id===h.postingId);n&&le(n.posting_id,{outreach_count:n.outreach_count,last_outreach_at:n.last_outreach_at,next_up:n.next_up})}async function ie(){if(!h.postingId)return;let e;try{const t=await fetch(`/api/postings/${h.postingId}/answers`);if(!t.ok){re();return}e=await t.json()}catch{re();return}h.answers=e.answers||[],h.answersStatus=e.questions_status||"",re(),h.answers.some(t=>t.status==="generating")?gn():Re()}function gn(){h.answersPoll||(h.answersPoll=setInterval(ie,4e3))}function Re(){h.answersPoll&&(clearInterval(h.answersPoll),h.answersPoll=null)}function re(){const e=document.getElementById("answers-section");if(!e)return;const t=h.answers,n=h.answersStatus,s=t.some(d=>d.status==="generating"),a=t.length?`<div class="answers-list">${t.map(wn).join("")}</div>`:"",o=!!h.detecting,c=s||o?" disabled":"",p=d=>`<button class="btn" id="answers-redetect-btn"${o?" disabled":""}>${o?"Detecting…":d}</button>`;let u;n==="ok"&&t.length?u=`<button class="btn ${t.some(m=>!_t(m)&&m.status!=="generating")?"btn-primary":""}" id="answers-start-btn"${c}>${s?"Drafting…":"Draft answers"}</button>`+p("Re-detect"):n===""||n==="unreachable"?u=`<button class="btn btn-primary" id="answers-start-btn"${c}>${s?"Drafting…":"Draft answers"}</button>`+p("Re-detect questions"):u=p("Re-detect questions"),e.innerHTML=`<div class="answers-meta">${r(yn(n,t.length))}</div>`+a+`<div class="answers-actions">${u}</div>`,En()}function yn(e,t){switch(e){case"":return"Not detected yet";case"ok":return`${t} question${t===1?"":"s"} found`;case"none":return"No essay questions on this form";case"unsupported":return"Couldn't read this form — apply on the site";case"unreachable":return"Couldn't reach the application form — try re-detecting";default:return"Couldn't read this form"}}function _t(e){return e.edited&&e.edited.trim()?e.edited:e.answer||""}function bn(e){switch(e.status){case"ready":return'<span class="pill pill-yes">ready</span>';case"needs_review":return'<span class="pill pill-maybe">needs review</span>';case"failed":return'<span class="pill pill-no">failed</span>';case"generating":return'<span class="pill pill-info">drafting…</span>';default:return'<span class="pill pill-info">not drafted</span>'}}function wn(e){const t=_t(e),n=e.edited&&e.edited.trim(),s=e.status==="generating",a=t.length,o=e.max_length&&a>e.max_length,c=e.max_length?`<span class="answer-count${o?" over":""}">${a} / ${e.max_length}</span>`:`<span class="answer-count">${a} chars</span>`;return`<div class="answer-card ac-${e.status}" data-aid="${e.id}">
    <div class="answer-prompt">${r(e.prompt)}</div>
    ${s?'<div class="answer-busy"><span class="spinner"></span><span>drafting…</span></div>':`<textarea class="ie answer-textarea" id="answer-edit-${e.id}" rows="5" spellcheck="false" placeholder="Draft answers to fill this in, or write your own.">${r(t)}</textarea>`}
    <div class="answer-foot">
      ${bn(e)}
      ${n?'<span class="answer-edited" title="your edit wins over the drafted answer">edited</span>':""}
      ${s?"":c}
      ${s?"":'<button class="btn answer-regen-btn" title="re-draft this answer (discards the current text)">Regenerate</button>'}
    </div>
    ${e.status==="needs_review"?`<div class="answer-note answer-review">Flagged by the honesty check — confirm it doesn't overstate your experience before sending.</div>`:""}
    ${e.status==="failed"&&e.fail_reason?`<div class="answer-note answer-fail">${r(kn(e.fail_reason))}</div>`:""}
  </div>`}function kn(e){return e=String(e||""),e.length>160?e.slice(0,160)+"…":e}function En(){const e=document.getElementById("answers-section");if(!e)return;const t=e.querySelector("#answers-start-btn");t&&t.addEventListener("click",Bt);const n=e.querySelector("#answers-redetect-btn");n&&n.addEventListener("click",In),e.querySelectorAll(".answer-card[data-aid]").forEach(s=>{const a=s.dataset.aid,o=s.querySelector(".answer-textarea");o&&(P(o,p=>xn(a,p),{multiline:!0}),o.addEventListener("input",()=>$n(s,o)));const c=s.querySelector(".answer-regen-btn");c&&c.addEventListener("click",()=>_n(a))})}function $n(e,t){const n=e.querySelector(".answer-count");if(!n)return;const s=t.value.length,a=n.textContent.includes("/")?parseInt(n.textContent.split("/")[1],10):0;n.textContent=a?`${s} / ${a}`:`${s} chars`,n.classList.toggle("over",!!a&&s>a)}async function Bt(){const e=document.getElementById("answers-section"),t=e&&e.querySelector("#answers-start-btn");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/postings/${h.postingId}/answers`,{method:"POST"})}catch(a){l(`draft failed: ${a.message}`),t&&(t.disabled=!1);return}if(n.status===202){await ie();return}if(n.status===412){let a={};try{a=await n.json()}catch{}Bn(a.error),t&&(t.disabled=!1);return}if(n.status===503){Lt("Answer generation isn't running in this build."),t&&(t.disabled=!1);return}const s=(await n.text().catch(()=>"")).trim();l(`draft failed: ${s||"HTTP "+n.status}`),t&&(t.disabled=!1)}async function In(){h.detecting=!0,re();try{const e=await fetch(`/api/postings/${h.postingId}/answers/redetect`,{method:"POST"});if(!e.ok){const t=(await e.text().catch(()=>"")).trim();l(`detect failed: ${t||"HTTP "+e.status}`)}}catch(e){l(`detect failed: ${e.message}`)}h.detecting=!1,await ie()}async function xn(e,t){const n=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json(),a=h.answers.findIndex(o=>String(o.id)===String(e));a>=0&&(h.answers[a]=s)}async function _n(e){let t;try{t=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({regenerate:!0})})}catch(n){l(`regenerate failed: ${n.message}`);return}if(t.status===503){Lt("Answer generation isn't running in this build.");return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();l(`regenerate failed: ${n||"HTTP "+t.status}`);return}await ie()}function Bn(e){const t=document.getElementById("answers-section");if(!t)return;const n=t.querySelector(".answers-actions"),s=document.createElement("div");s.className="blocks-gate",s.innerHTML=`
    <div class="draft-note">${r(e||"Drafting answers needs your experience discovered.")}</div>
    <div class="answers-actions">
      <button class="btn btn-primary" id="answers-fix-btn">Discover sources</button>
      <button class="btn" id="answers-retry-btn">Retry</button>
    </div>`,n?n.replaceWith(s):t.appendChild(s);const a=s.querySelector("#answers-fix-btn");a&&a.addEventListener("click",Ke);const o=s.querySelector("#answers-retry-btn");o&&o.addEventListener("click",Bt)}function Lt(e){const t=document.getElementById("answers-section");if(!t)return;const n=document.createElement("div");n.className="draft-note",n.textContent=e,t.appendChild(n)}async function ce(e){i.openId=e;const t=document.getElementById("pane"),n=document.getElementById("scrim");t.classList.add("open"),n.classList.add("open"),t.setAttribute("aria-hidden","false"),gt("company"),document.getElementById("pane-title").textContent="loading…",document.getElementById("pane-pills").innerHTML="",document.getElementById("pane-body").innerHTML='<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>';let s;try{const a=await fetch(`/api/companies/${e}`);if(!a.ok)throw new Error(`HTTP ${a.status}`);s=await a.json()}catch(a){document.getElementById("pane-body").innerHTML=`<div class="muted">Failed to load detail: ${r(a.message)}</div>`;return}de(s),ue(e)}function we(){i.openId=null,i.openDetail=null,document.getElementById("pane").classList.remove("open"),document.getElementById("scrim").classList.remove("open"),document.getElementById("pane").setAttribute("aria-hidden","true")}function de(e){i.openDetail=e,document.getElementById("pane-title").innerHTML=`<input class="ie ie-title" id="pane-title-input" placeholder="company name" value="${r(e.name||"")}">`,document.getElementById("pane-pills").innerHTML=`
    <span class="${g(e.has_verdict?e.verdict:"")}">${r(e.has_verdict?e.verdict:"unscored")}</span>
  `;const t=document.getElementById("pane-chat");t&&(t.style.display=i.meta&&i.meta.chat?"":"none",t.onclick=()=>Te("company",e.company_id,e.name));const n=e.model==="manual",s=e.has_verdict?`
    <dl class="kv">
      <dt>verdict</dt><dd><span class="${g(e.verdict)}">${r(e.verdict)}</span>${n?' <span class="small muted">· set by hand</span>':""}</dd>
      <dt>reason</dt><dd>${r(e.reason||"")}</dd>
      <dt>model</dt><dd class="small muted">${r(e.model||"")}</dd>
      <dt>taste version</dt><dd class="small muted"><span class="tooltip" title="scored ${r(e.scored_at)} · model ${r(e.model)}">${r(e.taste_version||"")}</span></dd>
      <dt>scored at</dt><dd class="small muted">${r(e.scored_at||"")}</dd>
    </dl>
  `:'<div class="muted">Not yet scored. Run <code>scout verdict</code>, or set one by hand below.</div>',a=`
    <div class="verdict-edit" id="verdict-edit">
      <div class="ve-label muted small">${e.has_verdict?"override verdict":"set verdict"}</div>
      <div class="ve-pick" id="ve-pick">
        ${["yes","maybe","no"].map(b=>`<button type="button" class="ve-opt${e.has_verdict&&e.verdict===b?" is-on":""}" data-v="${b}">${b}</button>`).join("")}
      </div>
      <div class="prow">
        <input class="input" id="ve-reason" placeholder="reason (optional)" value="${n?r(e.reason||""):""}">
        <button class="btn btn-primary" id="ve-save-btn">Save</button>
      </div>
    </div>`,o=e.has_enrichment?`
    <dl class="kv">
      <dt>url</dt><dd>${e.website_url?`<a href="${v(e.website_url)}" target="_blank" rel="noopener">${r(e.website_url)} ↗</a>`:'<span class="muted">—</span>'}</dd>
      <dt>status</dt><dd class="small">${r(e.fetch_status||"")}${e.fetch_error?` <span class="muted">(${r(e.fetch_error)})</span>`:""}</dd>
      <dt>fetched</dt><dd class="small muted">${r(e.fetched_at||"")}</dd>
    </dl>
    ${e.website_summary?`<div class="summary-box">${r(e.website_summary)}</div>`:""}
  `:'<div class="muted">No enrichment yet. Run <code>scout enrich</code>.</div>',c=!i.meta||i.meta.control!==!1,p=c&&i.meta&&i.meta.verdict?'<button class="h3-action" id="rescore-btn" title="re-score just this company — replaces the current verdict, manual or not">↻ re-score</button>':"",u=c&&e.domain?'<button class="h3-action" id="reenrich-btn" title="re-fetch this company’s site now">↻ re-enrich</button>':"",d=Object.keys(e.raw_json||{}).sort(),m=d.length===0?"":`
    <details class="raw-json">
      <summary>Raw row <span class="dim">(${d.length} fields)</span></summary>
      <table><tbody>
        ${d.map(b=>`<tr><td class="k">${r(b)}</td><td>${r(e.raw_json[b])}</td></tr>`).join("")}
      </tbody></table>
    </details>
  `,f=`
    <div class="flag-bar">
      <span class="fb-state${e.flagged?" is-flagged":""}">
        ${e.flagged?"⚑ flagged":"not flagged"}
        <span class="small muted">· ${e.reviewed_at?`last reviewed ${r(e.reviewed_at)}`:"never reviewed"}</span>
      </span>
      <span class="fb-actions">
        <button class="btn${e.flagged?" flag-on":""}" id="flag-toggle-btn" title="${e.flagged?"unflag":"flag this company"}">
          ${e.flagged?"⚑ unflag":"⚐ flag"}
        </button>
        <button class="btn btn-primary" id="review-stamp-btn" title="stamp this company as reviewed now — the table sorts on it">
          Mark reviewed
        </button>
      </span>
    </div>`;document.getElementById("pane-body").innerHTML=`
    ${f}
    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1m-9 0h11a1 1 0 011 1v7a1 1 0 01-1 1H2.5a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>
        Jobs
      </h3>
      <div id="postings-list">${Ve(e)}</div>
      <div class="posting-add">
        <input class="input" id="posting-url" placeholder="https://… job posting URL">
        <div class="prow">
          <input class="input" id="posting-title" placeholder="title (optional)">
          <button class="btn btn-primary" id="posting-add-btn">Add</button>
        </div>
      </div>
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.5h6l3 3V13a.5.5 0 01-.5.5h-8A.5.5 0 014 13V3a.5.5 0 010-.5z"/><path d="M9.5 2.5V6h3M6 8.5h4M6 10.5h4"/></svg>
        Notes
      </h3>
      <textarea class="ie ie-notes" id="pane-notes-input" rows="4" placeholder="—">${r(e.notes||"")}</textarea>
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M5 6h6M5 9h4"/></svg>
        Company facts
      </h3>
      <div id="facts-body">${Ln(e)}</div>
      ${m}
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3 3 7-7"/></svg>
        Verdict
        ${p}
      </h3>
      ${s}
      ${a}
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 3 4 3 6s-1 4-3 6c-2-2-3-4-3-6s1-4 3-6z"/></svg>
        Enrichment
        ${u}
      </h3>
      ${o}
    </section>

    <section class="pane-section" id="trace-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>
        Decision trail
      </h3>
      <div id="trace-body"><div class="loading-row"><span class="spinner"></span><span>loading trail…</span></div></div>
    </section>
  `;const _=document.getElementById("posting-add-btn");_&&_.addEventListener("click",()=>jn(e)),De(),document.querySelectorAll("#ve-pick .ve-opt").forEach(b=>{b.addEventListener("click",()=>{document.querySelectorAll("#ve-pick .ve-opt").forEach(K=>K.classList.remove("is-on")),b.classList.add("is-on")})});const B=document.getElementById("ve-save-btn");B&&B.addEventListener("click",()=>Tn(e)),P(document.getElementById("pane-title-input"),b=>bt(e,"name",b)),document.querySelectorAll("#facts-body [data-k]").forEach(b=>P(b,K=>bt(e,b.dataset.k,K))),P(document.getElementById("pane-domain-input"),b=>sn(e,b)),P(document.getElementById("pane-notes-input"),b=>an(e,b),{multiline:!0});const E=document.getElementById("flag-toggle-btn");E&&E.addEventListener("click",()=>Ct(e.company_id));const z=document.getElementById("review-stamp-btn");z&&z.addEventListener("click",()=>Cn(e.company_id));const he=document.getElementById("rescore-btn");he&&he.addEventListener("click",()=>ze("verdict",{company_ids:[e.company_id]}));const Se=document.getElementById("reenrich-btn");Se&&Se.addEventListener("click",()=>ze("enrich",{company_ids:[e.company_id]}))}function Ln(e){return`
    <div class="ie-grid">
      <div class="ie-field"><label>website${e.domain?` · <a href="https://${r(e.domain)}" target="_blank" rel="noopener">open ↗</a>`:""}</label>
        <input class="ie" id="pane-domain-input" placeholder="acme.com" value="${r(e.domain||"")}"></div>
      <div class="ie-field"><label>vertical</label>
        <input class="ie" data-k="vertical" placeholder="—" value="${r(e.vertical||"")}"></div>
      <div class="prow">
        <div class="ie-field"><label>location</label>
          <input class="ie" data-k="location" placeholder="—" value="${r(e.location||"")}"></div>
        <div class="ie-field"><label>headcount</label>
          <input class="ie" data-k="headcount" placeholder="—" value="${e.headcount||""}"></div>
      </div>
      <div class="ie-field"><label>stage</label>
        <input class="ie" data-k="funding_stage" placeholder="—" value="${r(e.funding_stage||"")}"></div>
    </div>
    <dl class="kv facts-ro">
      <dt>source</dt><dd class="small muted">${r(e.source)} · ${r(e.source_id)}</dd>
      <dt>ingested</dt><dd class="small muted">${r(e.ingested_at)}</dd>
    </dl>`}async function Cn(e){const t=document.getElementById("review-stamp-btn");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/companies/${e}/reviewed`,{method:"POST"})}catch(o){l(`failed: ${o.message}`),t&&(t.disabled=!1);return}if(!n.ok){const o=await n.text().catch(()=>"");l(`failed: HTTP ${n.status}${o?" — "+o:""}`),t&&(t.disabled=!1);return}const s=await n.json(),a=i.rows.find(o=>o.company_id===e);a&&(a.reviewed_at=s.reviewed_at,H()),i.openId===e&&(de(s),ue(e)),l("reviewed")}async function Ct(e){const t=i.rows.find(o=>o.company_id===e),n=!(t&&t.flagged);let s;try{s=await fetch(`/api/companies/${e}/flagged`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({flagged:n})})}catch(o){l(`failed: ${o.message}`);return}if(!s.ok){const o=await s.text().catch(()=>"");l(`failed: HTTP ${s.status}${o?" — "+o:""}`);return}const a=await s.json();t&&(t.flagged=a.flagged,H()),i.openId===e&&(de(a),ue(e)),w(),l(a.flagged?"flagged":"unflagged")}async function Tn(e){const t=document.querySelector("#ve-pick .ve-opt.is-on");if(!t){l("Pick yes, maybe, or no.");return}const n=t.dataset.v,s=document.getElementById("ve-reason").value.trim(),a=document.getElementById("ve-save-btn");a.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/verdict`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({verdict:n,reason:s})})}catch(p){l(`save failed: ${p.message}`),a.disabled=!1;return}if(!o.ok){const p=await o.text().catch(()=>"");l(`save failed: HTTP ${o.status}${p?" — "+p:""}`),a.disabled=!1;return}const c=await o.json();de(c),ue(c.company_id),k(),M(),w(),l("verdict saved")}function Ve(e){const t=e.postings||[];return t.length?t.map(n=>{const s=[n.location,n.source==="capture"?"captured":"added",(n.created_at||"").slice(0,10)].filter(Boolean).map(r).join(" · "),a=V[n.response]||V[""],o=[n.next_up?'<span class="draft-badge db-next" style="margin-left:0" title="queued next up for outreach">next up</span>':"",`<span class="pill ${a.cls}">${r(a.label)}</span>`,`<span class="pt-meta">${n.applied_at?`applied ${r(n.applied_at)}`:"not applied"}</span>`,`<span class="pt-meta">${n.outreach_count?`${n.outreach_count} sent · last ${r(n.last_outreach_at||"?")}`:"no outreach yet"}</span>`].filter(Boolean).join(""),c=i.meta&&i.meta.chat?`<button class="pcard-chat" data-pid="${r(n.id)}" data-ptitle="${r(n.title||"")}" title="chat about this role">chat</button>`:"";return`
    <div class="brain-node posting-card" data-pid="${r(n.id)}" title="open the pursuit — tracking, outreach, drafts">
      <div class="n"><a href="${v(n.url)}" target="_blank" rel="noopener">${r(n.title||n.url)} ↗</a></div>
      ${n.summary?`<div class="small muted" style="margin-top:3px">${r(n.summary)}</div>`:""}
      ${s?`<div class="l" style="margin-top:3px">${s}</div>`:""}
      <div class="pcard-status">${o}${c}<span class="pcard-open">open →</span></div>
    </div>`}).join(""):'<div class="muted">No job links yet.</div>'}function le(e,t){const n=i.openDetail;if(!n||!i.openId)return;const s=(n.postings||[]).find(o=>String(o.id)===String(e));if(!s)return;Object.assign(s,t);const a=document.getElementById("postings-list");a&&(a.innerHTML=Ve(n),De())}function De(){document.querySelectorAll("#postings-list .posting-card").forEach(e=>{e.addEventListener("click",t=>{t.target.closest("a")||t.target.closest(".pcard-chat")||vt(e.dataset.pid)})}),document.querySelectorAll("#postings-list .pcard-chat").forEach(e=>{e.addEventListener("click",t=>{t.stopPropagation(),Te("posting",e.dataset.pid,e.dataset.ptitle||"")})})}async function jn(e){const t=document.getElementById("posting-url"),n=document.getElementById("posting-title"),s=document.getElementById("posting-add-btn"),a=t.value.trim();if(!a){l("Enter a URL first."),t.focus();return}s.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/postings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:a,title:n.value.trim()})})}catch(u){l(`add failed: ${u.message}`),s.disabled=!1;return}if(!o.ok){const u=await o.text().catch(()=>"");l(`add failed: HTTP ${o.status}${u?" — "+u:""}`),s.disabled=!1;return}const c=await o.json();e.postings=(e.postings||[]).filter(u=>u.id!==c.id),e.postings.unshift(c);const p=document.getElementById("postings-list");p&&(p.innerHTML=Ve(e),De()),t.value="",n.value="",s.disabled=!1,w(),l("link added")}async function ue(e){let t;try{t=await fetch(`/api/companies/${e}/trace`)}catch(s){ke(`<div class="muted">Failed to load trail: ${r(s.message)}</div>`);return}if(!t.ok){ke(`<div class="muted">Failed to load trail: HTTP ${t.status}.</div>`);return}const n=(await t.json()).events||[];if(n.length===0){ke('<div class="muted">No decision trail yet. Run <code>verdict</code> to record one — every scoring pass is captured here.</div>');return}ke(n.map(Sn).join(""))}function Sn(e){const t=[e.criteria_source,e.taste_version].filter(Boolean).map(r);return e.run_id&&t.push("run "+r(e.run_id.slice(0,8))),`
    <div class="trail-event">
      <div class="trail-head">
        <span class="${g(e.verdict)}">${r(e.verdict)}</span>
        <span class="trail-meta mono">${r(e.model||"")}</span>
        <span class="trail-meta trail-time">${r(e.scored_at||"")}</span>
      </div>
      <div class="trail-decision">
        <span class="trail-reason">${r(e.reason||"")}</span>
      </div>
      <div class="trail-foot muted small">criteria: ${t.join(" · ")||"—"}</div>
    </div>`}function ke(e){const t=document.getElementById("trace-body");t&&(t.innerHTML=e)}let Tt;function l(e){const t=document.getElementById("toast");t.textContent=e,t.classList.toggle("err",/\b(fail(ed)?|error|disabled|already running)\b/i.test(e)),t.classList.add("show"),clearTimeout(Tt),Tt=setTimeout(()=>t.classList.remove("show"),2200)}async function Mn(e,t="copied"){if(!e){l("nothing to copy");return}try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(e);else{const n=document.createElement("textarea");n.value=e,n.style.position="fixed",n.style.opacity="0",document.body.appendChild(n),n.select(),document.execCommand("copy"),document.body.removeChild(n)}l(t)}catch(n){l(`copy failed: ${n.message}`)}}i.meta={control:!1,brain:!1,verdict:!1};async function Ue(){try{const s=await fetch("/api/meta");if(!s.ok)return;i.meta=await s.json()}catch{return}const e=i.meta.control;document.getElementById("btn-ingest").disabled=!e,document.getElementById("btn-enrich").disabled=!e;const t=document.getElementById("btn-verdict");t.disabled=!e||!i.meta.verdict,t.title=i.meta.verdict?"":"set ANTHROPIC_API_KEY in the server env to enable";const n=document.getElementById("open-chat");n&&(n.style.display=i.meta.chat?"":"none")}async function Je(){let e;try{const s=await fetch("/api/runs");if(!s.ok)return;e=await s.json()}catch{return}const t=e.busy_stage||"",n=document.getElementById("run-busy");t?(n.style.display="",document.getElementById("run-busy-label").textContent=t+" running…"):n.style.display="none",document.getElementById("btn-ingest").classList.toggle("busy",t==="ingest"),document.getElementById("btn-enrich").classList.toggle("busy",t==="enrich"),document.getElementById("btn-verdict").classList.toggle("busy",t==="verdict")}let Ee=null;async function ze(e,t){if(i.meta&&i.meta.control===!1){l("control surface disabled");return}let n;try{n=await fetch(`/api/run/${e}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t||{})})}catch(a){l(`run failed: ${a.message}`);return}if(n.status===409){l("a job is already running");return}if(n.status===412){const a=await n.text();l(a.trim());return}if(!n.ok){l(`run failed: HTTP ${n.status}`);return}const{job_id:s}=await n.json();qt(e,s,t)}async function An(e){const t=new FormData;t.append("csv",e);let n;try{n=await fetch("/api/ingest",{method:"POST",body:t})}catch(a){l(`upload failed: ${a.message}`);return}if(n.status===409){l("a job is already running");return}if(!n.ok){l(`upload failed: HTTP ${n.status}`);return}const{job_id:s}=await n.json();qt("ingest",s)}const Hn=["add-url","add-name","add-location","add-headcount","add-title","add-job-company"];let $e=[],D=new Set,U="company";function jt(e){U=e,document.querySelectorAll("#add-kind .v-chip").forEach(s=>s.classList.toggle("is-on",s.dataset.kind===e)),document.getElementById("add-company-fields").style.display=e==="company"?"":"none",document.getElementById("add-job-fields").style.display=e==="job"?"":"none";const t=document.getElementById("add-url-label"),n=document.getElementById("add-url");e==="company"?(t.innerHTML='Website<span class="req">*</span>',n.placeholder="acme.com"):(t.innerHTML='Posting URL<span class="req">*</span>',n.placeholder="https://… the job posting"),document.getElementById("add-save").textContent=e==="company"?"Add company":"Add job",St()}function Fe(){return!!i.meta.capture&&document.getElementById("add-enrich").checked}function St(){const e=document.getElementById("add-note");Fe()?e.innerHTML=U==="company"?"scout fetches the page and fills the blank fields — your values win. The page text also seeds enrichment, so the next Verdict can score it. Pages behind a login wall (LinkedIn) usually can't be fetched.":"scout fetches the posting and fills in the title, location and summary — your values win. The job attaches to its company, adding it to the list first if needed. Pages behind a login wall (LinkedIn) usually can't be fetched.":e.innerHTML=U==="company"?"Stored as source <code>manual</code>. Run Enrich then Verdict to score it. A website already in the list is rejected — manual adds never overwrite an existing company.":"Stored as-is, no fetch. The job attaches to the typed company, or to the link's own domain when the posting lives on the company's site — for an ATS link (greenhouse, lever, …), type the company."}async function Pn(){Hn.forEach(s=>{document.getElementById(s).value=""}),document.getElementById("add-vertical-filter").value="",D=new Set;const e=document.getElementById("add-enrich"),t=document.getElementById("add-enrich-row");e.disabled=!i.meta.capture,t.classList.toggle("disabled",!i.meta.capture),t.title=i.meta.capture?"":"set ANTHROPIC_API_KEY in the server env to enable",i.meta.capture||(e.checked=!1),jt(i.view==="jobs"?"job":"company");const n=document.getElementById("add-stage");n.innerHTML='<option value="">—</option>',document.getElementById("add-vertical-chips").innerHTML='<div class="none">loading…</div>',document.getElementById("add-company-names").innerHTML=(i.rows||[]).map(s=>`<option value="${r(s.name)}">`).join(""),document.getElementById("add-scrim").classList.add("open"),document.getElementById("add-url").focus();try{const s=await(await fetch("/api/facets")).json();(s.funding_stages||[]).forEach(a=>{const o=document.createElement("option");o.value=a,o.textContent=a,n.appendChild(o)}),$e=s.verticals||[]}catch{$e=[]}Mt()}function Ie(){document.getElementById("add-scrim").classList.remove("open")}function Mt(){const e=document.getElementById("add-vertical-chips"),t=document.getElementById("add-vertical-filter").value.trim().toLowerCase(),n=$e.filter(s=>!t||s.toLowerCase().includes(t));n.length?(e.innerHTML=n.map(s=>`<button type="button" class="vchip${D.has(s)?" sel":""}" data-v="${r(s)}">${r(s)}</button>`).join(""),e.querySelectorAll(".vchip").forEach(s=>s.addEventListener("click",()=>{const a=s.dataset.v;D.has(a)?D.delete(a):D.add(a),s.classList.toggle("sel"),At()}))):e.innerHTML=`<div class="none">${$e.length?"no match":"no verticals in the set yet"}</div>`,At()}function At(){const e=D.size;document.getElementById("add-vertical-count").textContent=e?`· ${e} selected`:""}function Ht(e){return/^https?:\/\//i.test(e)?e:"https://"+e}async function Pt(){const e=document.getElementById("add-url"),t=e.value.trim();if(!t){l(U==="company"?"Website is required.":"Posting URL is required."),e.focus();return}const n=document.getElementById("add-save"),s=n.textContent;n.disabled=!0,Fe()&&(n.textContent="reading page…");const a=()=>{n.disabled=!1,n.textContent=s},o=f=>document.getElementById(f).value.trim(),c=Fe();let p,u;c?(p="/api/capture",u={url:Ht(t),kind:U==="company"?"company_page":"job_posting",fields:U==="company"?{name:o("add-name"),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value,vertical:[...D].join(", ")}:{name:o("add-job-company"),title:o("add-title")}}):U==="company"?(p="/api/companies",u={website:t,name:o("add-name"),vertical:[...D].join(", "),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value}):(p="/api/postings",u={url:Ht(t),title:o("add-title"),company:o("add-job-company")});let d;try{d=await fetch(p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(u)})}catch(f){l(`add failed: ${f.message}`),a();return}if(!d.ok){let f=`HTTP ${d.status}`;try{const _=await d.text();try{f=JSON.parse(_).error||f}catch{f=_.trim()||f}}catch{}if(a(),d.status===409){l(f||"That company is already in the list."),e.focus(),e.select();return}l(`add failed: ${f}`);return}const m=await d.json();if(a(),c&&!m.company_id){l(m.note||"couldn't classify that page");return}if(Ie(),k(),M(),w(),U==="job"){const f=m.posting&&m.posting.title||"job link";l(`tracking: ${f} @ ${m.company_name}${m.posting_updated?" (refreshed)":""}`),W("jobs")}else c?(l(m.company_created?`company added: ${m.company_name}`:`${m.company_name} is already in the list`),ce(m.company_id)):l("company added")}function qt(e,t,n){Ee=t;const s=document.getElementById("drawer"),a=document.getElementById("drawer-log");document.getElementById("drawer-title").textContent=e,document.getElementById("drawer-spinner").style.display="",document.getElementById("drawer-cancel").style.display="",document.getElementById("drawer-close").style.display="none",a.innerHTML="",s.classList.add("open"),Je();const o=new EventSource(`/api/jobs/${t}/stream`),c=(p,u)=>{const d=document.createElement("div"),m=!u&&/^\s*warn:/i.test(p);d.className="ln"+(u?" ln-err":m?" ln-warn":""),d.textContent=m?p.replace(/^\s*warn:\s*/i,"⚠ "):p,a.appendChild(d),a.scrollTop=a.scrollHeight};o.addEventListener("line",p=>c(p.data,/error|failed/i.test(p.data))),o.addEventListener("end",p=>{o.close(),Ee=null,c(`— ${p.data} —`,p.data==="failed"),document.getElementById("drawer-spinner").style.display="none",document.getElementById("drawer-cancel").style.display="none",document.getElementById("drawer-close").style.display="",l(`${e} ${p.data}`),n&&Array.isArray(n.company_ids)&&n.company_ids.length>0?Gt(n.company_ids):k(),M(),Je(),w(),i.openId&&ce(i.openId)}),o.onerror=()=>{o.close()}}async function qn(){if(Ee)try{await fetch(`/api/jobs/${Ee}/cancel`,{method:"POST"})}catch{}}let Q=null;function Nt(e){return e==="outreach-template"?"outreach template":e==="outreach-doctrine"?"outreach doctrine":e==="taste-filter"?"pre-filter rules":e==="playbook"?"playbook":e+".md"}async function Z(e){Q=e;const t=document.getElementById("editor-scrim");document.getElementById("editor-title").textContent="edit "+Nt(e),document.getElementById("editor-text").value="loading…",document.getElementById("editor-ver").textContent="",document.getElementById("editor-toggle-row").style.display=e==="taste-filter"?"":"none",t.classList.add("open");try{const n=await fetch(`/api/${e}`);if(!n.ok){const a=(await n.text().catch(()=>"")).trim();document.getElementById("editor-text").value=n.status===404?"failed to load: HTTP 404 — this route is missing. Restart the scout server (your running binary may predate this feature).":`failed to load: ${a||"HTTP "+n.status}`;return}const s=await n.json();document.getElementById("editor-text").value=s.content||"",e==="taste-filter"&&(document.getElementById("editor-enabled").checked=s.enabled!==!1),s.taste_version&&(document.getElementById("editor-ver").textContent="version "+s.taste_version)}catch(n){document.getElementById("editor-text").value="failed to load: "+n.message}}function xe(){document.getElementById("editor-scrim").classList.remove("open"),Q=null}const Nn=[{key:"experience",hard:!0},{key:"voice",hard:!1}];async function Ke(){document.getElementById("sources-scrim").classList.add("open"),document.getElementById("sources-list").innerHTML='<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>';try{Ye(await(await fetch("/api/outreach/sources")).json())}catch(e){l(`failed to load sources: ${e.message}`)}}function We(){document.getElementById("sources-scrim").classList.remove("open")}function Ye(e){const t=document.getElementById("sources-list");if(!t)return;const n=e&&e.needs&&e.needs.length?e.needs.map(a=>({key:a.Key||a.key,hard:a.Hard??a.hard})):Nn,s={};(e&&e.sources||[]).forEach(a=>{(s[a.need]=s[a.need]||[]).push(a)}),t.innerHTML=n.map(a=>{const o=s[a.key]||[],c=o.length?o.map(p=>`<li><span class="src-title">${r(p.title||p.page_id)}</span><button class="src-rm" data-need="${r(a.key)}" data-id="${r(p.page_id)}" title="remove">✕</button></li>`).join(""):`<li class="dim small">${a.hard?"none yet — required for drafting":"none (optional)"}</li>`;return`<div class="src-need">
      <div class="src-need-h">${r(a.key)}${a.hard?' <span class="dim">required</span>':' <span class="dim">optional</span>'}</div>
      <ul class="src-items">${c}</ul></div>`}).join(""),t.querySelectorAll(".src-rm").forEach(a=>a.addEventListener("click",()=>Rn(a.dataset.need,a.dataset.id)))}async function On(){const e=document.getElementById("sources-refresh-btn");e&&(e.disabled=!0,e.textContent="Discovering…");let t;try{t=await fetch("/api/outreach/sources/refresh",{method:"POST"})}catch(s){l(`refresh failed: ${s.message}`),e&&(e.disabled=!1,e.textContent="Refresh from brain");return}if(!t.ok){l(`refresh failed: ${(await t.text().catch(()=>"")).trim()||"HTTP "+t.status}`),e&&(e.disabled=!1,e.textContent="Refresh from brain");return}const n=await t.json();n.warning?l(n.warning):l("sources refreshed"),Ye(n),e&&(e.disabled=!1,e.textContent="Refresh from brain")}async function Rn(e,t){let n;try{n=await fetch("/api/outreach/sources/remove",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({need:e,page_id:t})})}catch(s){l(`remove failed: ${s.message}`);return}if(!n.ok){l(`remove failed: ${(await n.text().catch(()=>"")).trim()||"HTTP "+n.status}`);return}Ye(await n.json())}async function Vn(){if(!Q)return;const t={content:document.getElementById("editor-text").value};Q==="taste-filter"&&(t.enabled=document.getElementById("editor-enabled").checked);let n;try{n=await fetch(`/api/${Q}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})}catch(a){l(`save failed: ${a.message}`);return}if(!n.ok){l(`save failed: HTTP ${n.status}`);return}const s=await n.json();s.taste_version&&(document.getElementById("editor-ver").textContent="version "+s.taste_version),l(`${Nt(Q)} saved`),xe(),M()}document.querySelectorAll("#t thead th[data-k]").forEach(e=>{e.onclick=()=>{const t=e.dataset.k;i.sort.k===t?i.sort.dir*=-1:(i.sort.k=t,i.sort.dir=1),H()}}),document.querySelectorAll("#jt thead th[data-jk]").forEach(e=>{e.onclick=()=>{const t=e.dataset.jk;i.jsort.k===t?i.jsort.dir*=-1:(i.jsort.k=t,i.jsort.dir=1),$()}}),document.getElementById("tab-companies").onclick=()=>W("companies"),document.getElementById("tab-jobs").onclick=()=>W("jobs"),document.getElementById("q").oninput=H,document.querySelectorAll("#verdict-chips .v-chip[data-v]").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.v;C.has(t)?C.delete(t):C.add(t),Ae(),H()})}),document.getElementById("flag-filter").addEventListener("click",e=>{Y=!Y,e.currentTarget.classList.toggle("is-on",Y),H()}),document.getElementById("jq").oninput=$,document.getElementById("hide-rejected").addEventListener("click",e=>{F=!F,e.currentTarget.classList.toggle("is-on",F),$()}),document.querySelectorAll("#response-chips .v-chip[data-r]").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.r;N.has(t)?N.delete(t):N.add(t),e.classList.toggle("is-on",N.has(t)),$()})}),document.getElementById("next-up-filter").addEventListener("click",e=>{me=!me,e.currentTarget.classList.toggle("is-on",me),$()}),document.getElementById("not-reached-filter").addEventListener("click",e=>{fe=!fe,e.currentTarget.classList.toggle("is-on",fe),$()}),Pe(),te(),document.getElementById("pane-close").onclick=we,document.getElementById("scrim").onclick=we,document.getElementById("pursuit-close").onclick=ve,document.getElementById("pursuit-scrim").onclick=ve,document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(document.getElementById("chat-pane").classList.contains("open")){it();return}if(ts()){st();return}if(document.getElementById("profile-scrim").classList.contains("open")){nt();return}if(document.getElementById("add-scrim").classList.contains("open")){Ie();return}if(document.getElementById("run-scrim").classList.contains("open")){_e();return}if(document.getElementById("help-scrim").classList.contains("open")){Be();return}const t=document.getElementById("pane").classList.contains("open"),n=document.getElementById("pursuit-pane").classList.contains("open");if(t||n){if(qe==="pursuit"&&n){ve();return}if(qe==="company"&&t){we();return}if(t){we();return}ve();return}if(document.getElementById("key-scrim").classList.contains("open")){tt();return}if(document.getElementById("sources-scrim").classList.contains("open")){We();return}if(document.getElementById("editor-scrim").classList.contains("open")){xe();return}if(document.getElementById("settings-scrim").classList.contains("open")){at();return}});let Ge=null;const Dn={enrich:"Fetches and summarizes each company's pages, filling its enrichment row.",verdict:"Scores every company against your criteria — one LLM call each. Only companies with a successful enrichment are scored."};function Ot(e){if(i.meta&&i.meta.control===!1){l("control surface disabled");return}Ge=e,document.getElementById("run-title").textContent="Run "+e,document.getElementById("run-desc").textContent=Dn[e]||"",document.getElementById("run-only-blanks").checked=!1,document.getElementById("run-workers-input").value=e==="verdict"?10:8;const t=document.getElementById("run-warn"),n=i.stats||{},s=Math.max(0,(n.total_companies||0)-(n.enriched_ok||0));e==="verdict"&&s>0?(document.getElementById("run-warn-text").textContent=`${s} ${s===1?"company isn't":"companies aren't"} enriched yet — verdict will skip ${s===1?"it":"them"}. Run Enrich first to include ${s===1?"it":"them"}.`,t.style.display=""):t.style.display="none",document.getElementById("run-scrim").classList.add("open")}function _e(){document.getElementById("run-scrim").classList.remove("open"),Ge=null}document.getElementById("btn-enrich").onclick=()=>Ot("enrich"),document.getElementById("btn-verdict").onclick=()=>Ot("verdict"),document.getElementById("run-cancel").onclick=_e,document.getElementById("run-scrim").onclick=e=>{e.target.id==="run-scrim"&&_e()},document.getElementById("run-go").onclick=()=>{const e=Ge,t=document.getElementById("run-only-blanks").checked,n=parseInt(document.getElementById("run-workers-input").value,10);if(_e(),!e)return;const s={};t&&(s.only_blanks=!0),n>0&&(s.workers=n),ze(e,s)},document.getElementById("btn-ingest").onclick=()=>document.getElementById("csv-file").click(),document.getElementById("btn-add").onclick=Pn;const Un={add:{title:"Add data",intro:"Two ways to get companies and jobs into scout.",items:[{name:"Ingest CSV",sec:"ingest",desc:"Bulk-import companies from a CSV export (e.g. Crunchbase). Columns are mapped to company fields and new rows are created."},{name:"Add",sec:"ingest",desc:"Add one company or job from its link. Tick “fill in the blanks” to let an ATS API (ashby/greenhouse/lever) or one cheap agent pass complete the details."}]},run:{title:"Run the pipeline",intro:"Enrich must run before Verdict — verdict only scores companies that already have a successful enrichment row.",items:[{name:"Enrich",sec:"enrich",desc:"Fetches and summarizes each company's web presence into an enrichment row. A prerequisite for Verdict."},{name:"Verdict",sec:"verdict",desc:"Scores each enriched company against your criteria with the LLM, producing a yes / maybe / no with reasoning."}]}};function Rt(e){const t=Un[e];if(!t)return;document.getElementById("help-title").textContent=t.title;const n=document.getElementById("help-items");if(n.innerHTML="",t.intro){const s=document.createElement("p");s.className="help-intro",s.textContent=t.intro,n.appendChild(s)}t.items.forEach(s=>{const a=document.createElement("div");a.className="help-item";const o=document.createElement("div");o.className="help-item-name",o.textContent=s.name;const c=document.createElement("div");c.className="help-item-desc",c.textContent=s.desc;const p=document.createElement("a");p.className="help-link",p.textContent="Learn more →",p.onclick=()=>{Be(),Jt(),ns(s.sec)},a.appendChild(o),a.appendChild(c),a.appendChild(p),n.appendChild(a)}),document.getElementById("help-scrim").classList.add("open")}function Be(){document.getElementById("help-scrim").classList.remove("open")}document.getElementById("help-add").onclick=()=>Rt("add"),document.getElementById("help-run").onclick=()=>Rt("run"),document.getElementById("help-close").onclick=Be,document.getElementById("help-scrim").onclick=e=>{e.target.id==="help-scrim"&&Be()},document.getElementById("add-cancel").onclick=Ie,document.getElementById("add-save").onclick=Pt,document.getElementById("add-scrim").onclick=e=>{e.target.id==="add-scrim"&&Ie()},document.querySelectorAll("#add-kind .v-chip").forEach(e=>{e.onclick=()=>jt(e.dataset.kind)}),document.getElementById("add-enrich").addEventListener("change",St),document.getElementById("add-scrim").addEventListener("keydown",e=>{e.key==="Enter"&&(e.target.tagName!=="INPUT"||e.target.type==="checkbox"||e.target.id==="add-vertical-filter"||e.target.id==="add-job-company"||(e.preventDefault(),Pt()))}),document.getElementById("add-vertical-filter").addEventListener("input",Mt),document.getElementById("add-headcount").addEventListener("input",e=>{const t=e.target.value.replace(/[^0-9]/g,"");t!==e.target.value&&(e.target.value=t)}),document.getElementById("csv-file").onchange=e=>{const t=e.target.files&&e.target.files[0];t&&An(t),e.target.value=""},document.getElementById("drawer-cancel").onclick=qn,document.getElementById("drawer-close").onclick=()=>document.getElementById("drawer").classList.remove("open"),document.getElementById("editor-cancel").onclick=xe,document.getElementById("editor-save").onclick=Vn,document.getElementById("editor-scrim").onclick=e=>{e.target.id==="editor-scrim"&&xe()},document.getElementById("sources-close").onclick=We,document.getElementById("sources-scrim").onclick=e=>{e.target.id==="sources-scrim"&&We()},document.getElementById("sources-refresh-btn").onclick=On,document.getElementById("key-cancel").onclick=tt,document.getElementById("key-save").onclick=Ut,document.getElementById("key-remove").onclick=Zn,document.getElementById("key-scrim").onclick=e=>{e.target.id==="key-scrim"&&tt()},document.getElementById("key-input").addEventListener("keydown",e=>{e.key==="Enter"&&(e.preventDefault(),Ut())});function Qe(e){if(e==null)return"—";let t=Math.max(0,e|0);if(t<90)return`${t}s ago`;const n=Math.round(t/60);if(n<90)return`${n}m ago`;const s=Math.round(n/60);return s<48?`${s}h ago`:`${Math.round(s/24)}d ago`}async function Ze(){try{const e=await fetch("/api/profile");if(!e.ok)throw new Error(`HTTP ${e.status}`);i.profile=await e.json()}catch{i.profile=null}O()}const X='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.6 2.4a1.2 1.2 0 0 1 1.7 1.7L5.6 11.8l-3 1 1-3z"/><path d="M10.4 3.6l2 2"/></svg>',pe='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 8a5.4 5.4 0 1 1-1.5-3.8"/><path d="M13.6 2.6V5.2H11"/></svg>',Jn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="11" r="2.6"/><path d="M6.9 9.1 13 3M11 5l1.6 1.6M9.3 6.7l1.6 1.6"/></svg>',Vt='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="2.4"/></svg>',zn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.2h7.2a1.6 1.6 0 0 1 1.6 1.6v8H4.6A1.6 1.6 0 0 1 3 11.2z"/><path d="M11.8 12.8h1.4v-9A1.6 1.6 0 0 0 11.6 2.4H5.4"/><path d="M5.4 5.8h3.6M5.4 8.2h3.6"/></svg>',Fn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3.5" width="12" height="9" rx="1.6"/><path d="M2.6 4.6 8 8.8l5.4-4.2"/></svg>',Kn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.2h5.4l2.6 2.6v9H4z"/><path d="M9.4 2.2v2.6H12"/><path d="M6 7h4M6 9.2h4M6 11.4h2.4"/></svg>',Wn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.6v2M8 12.4v2M14.4 8h-2M3.6 8h-2M12.5 3.5 11 5M5 11l-1.5 1.5M12.5 12.5 11 11M5 5 3.5 3.5"/><circle cx="8" cy="8" r="2.2"/></svg>',Yn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.4 3.4h11.2L9.4 8.4v4.2l-2.8 1.4V8.4z"/></svg>';function J(e){const t=e.dot||e.note?`<div class="crit-status">${e.dot?`<span class="pf-dot ${e.dot}"></span>`:""}${e.note?`<span class="crit-note-t">${r(e.note)}</span>`:""}</div>`:"",n=e.actID?` id="${e.actID}"`:"";return`<div class="settings-item">
    <span class="settings-item-icon">${e.icon}</span>
    <div class="settings-item-main">
      <div class="settings-item-name">${e.nameHTML}</div>
      <div class="settings-item-desc">${r(e.desc)}</div>
      ${t}
    </div>
    <button class="crit-edit"${n} data-act="${e.act}" title="${e.actTitle}" aria-label="${e.actLabel}">${e.actIcon}</button>
  </div>`}function O(){const e=document.getElementById("criteria-stats");if(!e)return;const t=i.profile,s=(t&&t.active_source||i.stats&&i.stats.taste_source||"").startsWith("brain:"),a=t&&typeof t.body=="string";let o;if(s){let L="off",q="";const ct=t&&t.criteria_state;ct==="current"?(L="ok",q="current · verified "+Qe(t.verified_age_seconds)):ct==="changed"?(L="warn",q="changed — re-distill"):ct==="unverified"?(L="warn",q=t&&!t.reachable&&a?"brain offline · using cache":"unverified — re-distill"):t&&!t.reachable&&a?(L="warn",q="brain offline · using cache"):a&&(L="ok",q="fetched "+Qe(t.age_seconds)),o=J({icon:Vt,nameHTML:a?'<span class="edit-link" data-act="view-profile" title="view the company-fit brief">company-fit brief</span>':"company-fit brief",dot:L,note:q,desc:"The criteria scout feeds the verdict stage — distilled from the brain.",act:"refresh-profile",actID:"refresh-profile",actIcon:pe,actTitle:"re-distill the company-fit brief from the brain",actLabel:"refresh company-fit brief"})}else o=J({icon:Vt,nameHTML:'<span class="edit-link" data-act="edit-taste" title="edit taste.md">taste</span>',note:t&&t.configured?"brain offline — local fallback":"",dot:t&&t.configured?"warn":"",desc:"Local fallback criteria used when the brain is unreachable.",act:"edit-taste",actIcon:X,actTitle:"edit taste.md",actLabel:"edit taste"});const c=i.sources&&i.sources.sources||[],p=c.filter(L=>L.need==="experience").length,u=c.filter(L=>L.need==="voice").length;let d="off",m="not discovered yet — refresh from the brain";p>0?(d="ok",m=`${p} experience · ${u} voice`):c.length>0&&(d="warn",m="no experience yet — refresh");const f=c.length?'<span class="edit-link" data-act="view-sources" title="view discovered experience + voice">outreach knowledge</span>':"outreach knowledge",_=J({icon:Wn,nameHTML:f,dot:d,note:m,desc:"Your experience + voice, discovered from the brain to ground outreach.",act:"refresh-sources",actID:"refresh-sources",actIcon:pe,actTitle:"re-discover experience + voice from the brain",actLabel:"refresh outreach knowledge"}),B=J({icon:zn,nameHTML:'<span class="edit-link" data-act="edit-playbook" title="edit the verdict playbook">playbook</span>',desc:"How scout judges — the reasoning rules behind every verdict.",act:"edit-playbook",actIcon:X,actTitle:"edit the verdict playbook",actLabel:"edit playbook"}),E=J({icon:Fn,nameHTML:'<span class="edit-link" data-act="edit-template" title="edit the outreach email template">email template</span>',desc:"The outreach email format — verbatim prose with fill-in holes.",act:"edit-template",actIcon:X,actTitle:"edit the outreach email template",actLabel:"edit email template"}),z=J({icon:Kn,nameHTML:'<span class="edit-link" data-act="edit-doctrine" title="edit the outreach doctrine">outreach doctrine</span>',desc:"How cold emails get written — the depth bar, show-don't-tell, the kill list.",act:"edit-doctrine",actIcon:X,actTitle:"edit the outreach doctrine",actLabel:"edit outreach doctrine"}),he=!i.stats||i.stats.taste_filter_enabled!==!1,Se=J({icon:Yn,nameHTML:'<span class="edit-link" data-act="edit-taste-filter" title="edit the pre-filter rules">pre-filter</span>',desc:"Cheap mechanical gate before the LLM verdict — location, headcount, vertical, stage. Toggle it off in the editor to score every company.",dot:he?"ok":"off",note:he?"active":"disabled — scoring everything",act:"edit-taste-filter",actIcon:X,actTitle:"edit the pre-filter rules",actLabel:"edit pre-filter rules"}),b=i.anthropicKey;let K="off",rt="not set — verdict, capture & outreach disabled";b&&b.key_source==="db"?(K="ok",rt="set here · active"):b&&b.key_source==="env"&&(K="ok",rt="from the environment");const ds=J({icon:Jn,nameHTML:'<span class="edit-link" data-act="edit-anthropic-key" title="set the Anthropic API key">Anthropic API key</span>',dot:K,note:rt,desc:"Powers scoring, capture & outreach. Set here to run scout without the env var.",act:"edit-anthropic-key",actIcon:X,actTitle:"set the Anthropic API key",actLabel:"set Anthropic API key"});e.innerHTML=`<div class="settings-section">
       <div class="settings-group-h">From the brain</div>
       ${o}${_}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Scout configuration</div>
       ${B}${Se}${E}${z}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Integrations</div>
       ${ds}
     </div>`;const Wt={"view-profile":()=>es(i.profile),"refresh-profile":Xn,"edit-taste":()=>Z("taste"),"edit-taste-filter":()=>Z("taste-filter"),"edit-playbook":()=>Z("playbook"),"edit-template":()=>Z("outreach-template"),"edit-doctrine":()=>Z("outreach-doctrine"),"view-sources":Ke,"refresh-sources":Gn,"edit-anthropic-key":Qn};e.querySelectorAll("[data-act]").forEach(L=>{const q=L.dataset.act;q&&Wt[q]&&(L.onclick=Wt[q])})}async function Xe(){try{i.sources=await(await fetch("/api/outreach/sources")).json()}catch{i.sources=null}O()}async function Gn(){const e=document.getElementById("refresh-sources");e&&(e.classList.add("spinning"),e.disabled=!0);let t;try{t=await fetch("/api/outreach/sources/refresh",{method:"POST"})}catch(s){l(`refresh failed: ${s.message}`),Xe();return}if(!t.ok){const s=(await t.text().catch(()=>"")).trim();l(`refresh failed: ${s||"HTTP "+t.status}`),Xe();return}const n=await t.json();n.warning?l(n.warning):l("outreach knowledge refreshed"),i.sources={sources:n.sources||[],needs:i.sources&&i.sources.needs||[]},O()}async function Dt(){try{i.anthropicKey=await(await fetch("/api/integrations/anthropic")).json()}catch{i.anthropicKey=null}O()}async function Qn(){document.getElementById("key-scrim").classList.add("open"),document.getElementById("key-input").value="",await Dt(),et();const e=document.getElementById("key-input");e&&e.focus()}function et(){const e=i.anthropicKey||{},t=document.getElementById("key-status");t&&(t.textContent=e.key_source==="db"?"A key is set here (stored in scout).":e.key_source==="env"?"Using the ANTHROPIC_API_KEY environment variable. Saving a key here overrides it.":"No key set. Scoring, capture, and outreach are disabled until you add one.");const n=document.getElementById("key-remove");n&&(n.style.display=e.key_source==="db"?"":"none");const s=document.getElementById("key-restart-hint");if(s){const a=e.has_key&&i.meta&&(i.meta.outreach===!1||i.meta.chat===!1);s.style.display=a?"":"none"}}function tt(){document.getElementById("key-scrim").classList.remove("open")}async function Ut(){const e=(document.getElementById("key-input").value||"").trim();if(!e){l("paste a key first");return}const t=document.getElementById("key-save");t&&(t.disabled=!0,t.textContent="Verifying…");const n=()=>{t&&(t.disabled=!1,t.textContent="Save key")};let s;try{s=await fetch("/api/integrations/anthropic",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:e})})}catch(a){l(`save failed: ${a.message}`),n();return}if(!s.ok){l((await s.text().catch(()=>"")).trim()||`HTTP ${s.status}`),n();return}i.anthropicKey=await s.json(),document.getElementById("key-input").value="",n(),l("Anthropic key saved"),await Ue(),et(),O()}async function Zn(){const e=document.getElementById("key-remove");e&&(e.disabled=!0);let t;try{t=await fetch("/api/integrations/anthropic",{method:"DELETE"})}catch(n){l(`remove failed: ${n.message}`),e&&(e.disabled=!1);return}if(e&&(e.disabled=!1),!t.ok){l((await t.text().catch(()=>"")).trim()||`HTTP ${t.status}`);return}i.anthropicKey=await t.json(),l(i.anthropicKey.has_key?"removed — using the environment key":"Anthropic key removed"),await Ue(),et(),O()}async function Xn(){const e=document.getElementById("refresh-profile");e&&(e.classList.add("spinning"),e.disabled=!0);let t;try{t=await fetch("/api/profile/refresh",{method:"POST"})}catch(n){l(`refresh failed: ${n.message}`),Ze();return}if(!t.ok){const n=await t.text().catch(()=>"");l(`refresh failed: ${(n||"").trim()||"HTTP "+t.status}`),Ze();return}i.profile=await t.json(),O(),l("company-fit brief refreshed"),M()}function es(e){!e||typeof e.body!="string"||(document.getElementById("profile-modal-meta").textContent=`${e.chars||0} chars · fetched ${Qe(e.age_seconds)}`,document.getElementById("profile-modal-body").textContent=e.body,document.getElementById("profile-scrim").classList.add("open"))}function nt(){document.getElementById("profile-scrim").classList.remove("open")}document.getElementById("profile-modal-close").onclick=nt,document.getElementById("profile-scrim").onclick=e=>{e.target.id==="profile-scrim"&&nt()};function Jt(){document.getElementById("docs-scrim").classList.add("open");const e=document.querySelector("#docs-nav a");Le(e?e.dataset.sec:null);const t=document.getElementById("docs-body");t&&(t.scrollTop=0)}function st(){document.getElementById("docs-scrim").classList.remove("open")}function ts(){return document.getElementById("docs-scrim").classList.contains("open")}function Le(e){document.querySelectorAll("#docs-nav a").forEach(t=>t.classList.toggle("active",t.dataset.sec===e))}function ns(e){const t=document.getElementById("doc-"+e);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),Le(e)}document.getElementById("open-docs").onclick=Jt,document.getElementById("docs-close").onclick=st,document.getElementById("docs-scrim").onclick=e=>{e.target.id==="docs-scrim"&&st()};function ss(){document.getElementById("settings-scrim").classList.add("open"),O()}function at(){document.getElementById("settings-scrim").classList.remove("open")}document.getElementById("open-settings").onclick=ss,document.getElementById("settings-close").onclick=at,document.getElementById("settings-scrim").onclick=e=>{e.target.id==="settings-scrim"&&at()},document.querySelectorAll("#docs-nav a").forEach(e=>{e.onclick=()=>{const t=document.getElementById("doc-"+e.dataset.sec);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),Le(e.dataset.sec)}}),function(){const e=document.getElementById("docs-body");if(!e||!("IntersectionObserver"in window))return;const t=new IntersectionObserver(n=>{const s=n.filter(a=>a.isIntersecting).sort((a,o)=>a.boundingClientRect.top-o.boundingClientRect.top);s.length&&Le(s[0].target.id.replace(/^doc-/,""))},{root:e,rootMargin:"0px 0px -65% 0px",threshold:0});document.querySelectorAll("#docs-body section").forEach(n=>t.observe(n))}(),i.chat={scope:null,scopeId:"",threadId:null,streaming:!1,es:null};function as(e){return(e||[]).filter(t=>t&&t.type==="text").map(t=>t.text||"").join("")}function os(e){return(e||[]).filter(t=>t&&t.type==="tool_use").map(t=>t.name)}function Ce(e,t){const n=document.createElement("div");return n.className="chat-msg chat-"+e,n.textContent=t||"",n}function ot(){const e=document.getElementById("chat-messages");e.scrollTop=e.scrollHeight}function is(){const e=document.createElement("div");return e.className="chat-empty",e.textContent=i.chat.scope==="global"?"Tell me about a job you applied to (paste the link), or ask what's already tracked.":"Ask about this "+(i.chat.scope==="company"?"company":"role")+" — I can research it on the web and update scout.",e}function zt(e){const t=document.getElementById("chat-messages");t.innerHTML="";for(const n of e||[]){const s=as(n.content);if(n.role==="user")s&&t.appendChild(Ce("user",s));else if(n.role==="assistant"){const a=os(n.content);if(!s&&!a.length)continue;const o=Ce("assistant",s);if(a.length){const c=document.createElement("div");c.className="chat-tools",c.textContent="· used "+a.join(", "),o.appendChild(c)}t.appendChild(o)}}t.children.length||t.appendChild(is()),ot()}async function Te(e,t,n){if(!i.meta||!i.meta.chat){l("chat needs ANTHROPIC_API_KEY in the server env");return}i.chat.es&&(i.chat.es.close(),i.chat.es=null),i.chat={scope:e,scopeId:t||"",threadId:null,streaming:!1,es:null},document.getElementById("chat-title").textContent=e==="global"?"Chat":e==="company"?"Chat · company":"Chat · role",document.getElementById("chat-sub").textContent=e==="global"?"":n||"";const s=document.getElementById("chat-messages");s.innerHTML='<div class="chat-empty">loading…</div>';const a=document.getElementById("chat-pane");a.classList.add("open"),document.getElementById("chat-scrim").classList.add("open"),a.setAttribute("aria-hidden","false");try{const o="scope="+encodeURIComponent(e)+(t?"&scope_id="+encodeURIComponent(t):""),c=await fetch("/api/chat/threads?"+o);if(!c.ok)throw new Error((await c.text().catch(()=>"")).trim()||"HTTP "+c.status);const p=await c.json();i.chat.threadId=p.thread.id,zt(p.messages||[])}catch(o){s.innerHTML='<div class="chat-empty">Failed to open chat: '+r(o.message)+"</div>";return}document.getElementById("chat-input").focus()}function it(){i.chat.es&&(i.chat.es.close(),i.chat.es=null);const e=document.getElementById("chat-pane");e.classList.remove("open"),document.getElementById("chat-scrim").classList.remove("open"),e.setAttribute("aria-hidden","true")}function je(e){i.chat.streaming=e,document.getElementById("chat-send").disabled=e;const t=document.getElementById("chat-input");t.disabled=e,e||t.focus()}function Ft(){const e=document.getElementById("chat-input");e.style.height="auto",e.style.height=Math.min(e.scrollHeight,160)+"px"}async function Kt(){const e=document.getElementById("chat-input"),t=e.value.trim();if(!t||i.chat.streaming||!i.chat.threadId)return;e.value="",Ft(),je(!0);const n=document.getElementById("chat-messages"),s=n.querySelector(".chat-empty");s&&s.remove(),n.appendChild(Ce("user",t));const a=Ce("assistant","");a.classList.add("chat-streaming"),n.appendChild(a),ot();let o="";const c=m=>{a.classList.remove("chat-streaming"),a.textContent="⚠ "+m,je(!1)},p=i.chat.threadId;let u;try{u=await fetch("/api/chat/"+p+"/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t})})}catch(m){c(m.message);return}if(!u.ok){c((await u.text().catch(()=>"")).trim()||"HTTP "+u.status);return}const d=new EventSource("/api/chat/"+p+"/stream");i.chat.es=d,d.addEventListener("delta",m=>{o+=m.data,a.textContent=o,ot()}),d.addEventListener("end",async m=>{d.close(),i.chat.es===d&&(i.chat.es=null),a.classList.remove("chat-streaming"),je(!1),i.chat.threadId===p&&await rs(),cs(),typeof m.data=="string"&&m.data.indexOf("error")===0&&l("chat: "+m.data)}),d.onerror=()=>{d.close(),i.chat.es===d&&(i.chat.es=null),a.classList.remove("chat-streaming"),je(!1)}}async function rs(){const e=i.chat.scope,t=i.chat.scopeId,n="scope="+encodeURIComponent(e)+(t?"&scope_id="+encodeURIComponent(t):"");try{const s=await fetch("/api/chat/threads?"+n);if(!s.ok)return;const a=await s.json();zt(a.messages||[])}catch{}}function cs(){k(),w(),M(),i.openId&&ce(i.openId)}document.getElementById("open-chat").onclick=()=>Te("global","",""),document.getElementById("chat-close").onclick=it,document.getElementById("chat-scrim").onclick=it,document.getElementById("chat-form").addEventListener("submit",e=>{e.preventDefault(),Kt()}),document.getElementById("chat-input").addEventListener("input",Ft),document.getElementById("chat-input").addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),Kt())}),k(),w(),M(),Ue(),Je(),Ze(),Xe(),Dt()}ps({"":{view:()=>({mount(y){y.innerHTML=gs,ys()}}),chrome:!1}},{title:"scout"});fs();vs();
