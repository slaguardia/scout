(function(){const i=document.createElement("link").relList;if(i&&i.supports&&i.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))T(r);new MutationObserver(r=>{for(const g of r)if(g.type==="childList")for(const _ of g.addedNodes)_.tagName==="LINK"&&_.rel==="modulepreload"&&T(_)}).observe(document,{childList:!0,subtree:!0});function v(r){const g={};return r.integrity&&(g.integrity=r.integrity),r.referrerPolicy&&(g.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?g.credentials="include":r.crossOrigin==="anonymous"?g.credentials="omit":g.credentials="same-origin",g}function T(r){if(r.ep)return;r.ep=!0;const g=v(r);fetch(r.href,g)}})();function Yn(b,i){const v=i.replace(/^#/,"");let T=null;for(const r of Object.keys(b))(v===r||v.startsWith(r))&&(T===null||r.length>T.length)&&(T=r);return T===null&&""in b&&(T=""),T}function Gn(b){return typeof b=="function"?{view:b,chrome:!0}:{view:b.view,chrome:b.chrome!==!1}}function Qn(b,i={}){const v=i.root??document.body,T=i.title??document.title??"",r=i.brandHref??"#",g=document.createElement("main"),_=document.createElement("header");_.className="cap-head";const E=document.createElement("a");E.className="brand",E.href=r,E.textContent=T,E.setAttribute("aria-label",`${T} — home`),_.appendChild(E);const J=document.createElement("nav");J.className="cap-nav",J.setAttribute("aria-label","Views");for(const w of i.nav??[]){const M=document.createElement("a");M.href=w.href,M.textContent=w.label,w.ariaLabel&&M.setAttribute("aria-label",w.ariaLabel),J.appendChild(M)}_.appendChild(J);const H=document.createElement("section");H.className="tk-content",g.appendChild(_),g.appendChild(H);const j=document.createElement("div");j.className="tk-bleed";const Re=w=>{var M;for(const N of Array.from(J.querySelectorAll("a"))){const z=((M=N.getAttribute("href"))==null?void 0:M.replace(/^#/,""))??"";N.toggleAttribute("aria-current",w!==null&&w!==""&&z===w),N.hasAttribute("aria-current")&&N.setAttribute("aria-current","page")}};let re=0;const te=()=>{const w=Yn(b,location.hash);if(Re(w),w===null){j.isConnected&&j.remove(),g.isConnected||v.appendChild(g),Zn(H,"Not found.");return}const{view:M,chrome:N}=Gn(b[w]),z=N?H:j;N?(j.isConnected&&j.remove(),g.isConnected||v.appendChild(g)):(g.isConnected&&g.remove(),j.isConnected||v.appendChild(j)),z.replaceChildren();const F=M(),se=++re,ye=F.mount(z);ye instanceof Promise&&ye.catch(be=>{se===re&&Xn(z,String(be))})};window.addEventListener("hashchange",te),te()}function Zn(b,i){b.replaceChildren();const v=document.createElement("div");v.className="tk-empty",v.textContent=i,b.appendChild(v)}function Xn(b,i){b.replaceChildren();const v=document.createElement("div");v.className="tk-error",v.textContent=i,b.appendChild(v)}function ea(){if(!("serviceWorker"in navigator))return;if(["localhost","127.0.0.1","[::1]",""].includes(location.hostname)){navigator.serviceWorker.getRegistrations().then(i=>{for(const v of i)v.unregister()}),window.caches&&caches.keys().then(i=>{for(const v of i)caches.delete(v)});return}window.addEventListener("load",()=>{navigator.serviceWorker.register("/sw.js").catch(()=>{})})}async function ta(){let b;try{b=await fetch("/api/me",{headers:{Accept:"application/json"}})}catch{return null}if(!b.ok)return null;let i;try{i=await b.json()}catch{return null}return typeof i.email=="string"&&i.email?{email:i.email}:null}const sa=`
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
      <div class="verdict-chips" title="application stage — pick any combination; none selected = all">
        <span id="stage-chips" class="stage-chips"></span>
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
          <th data-jk="application" data-col="application">application</th>
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
        <span id="editor-toggle-label">Enable the pre-filter (off → bulk verdict runs score every company; the rules below are kept either way)</span>
      </label>
      <textarea id="editor-text" spellcheck="false"></textarea>
      <div class="modal-note">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.5" stroke-linecap="round"/></svg>
        <span>Edits write the local file only — never the brain. Existing verdicts are left as-is; the new criteria apply to companies you score or re-score from here on.</span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="editor-reset" style="display:none" title="discard your edits and restore the built-in default">Reset to default</button>
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

<!-- relink a job to a different company — search the existing companies -->
<div class="modal-scrim" id="relink-scrim">
  <div class="modal" style="width:520px">
    <div class="modal-head">
      <h2>Move job to another company</h2>
      <span class="ver" id="relink-current"></span>
    </div>
    <div class="modal-body">
      <input type="text" id="relink-search" class="key-input" placeholder="search companies…" autocomplete="off" spellcheck="false">
      <div class="relink-results" id="relink-results"></div>
      <div class="modal-note">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.5" stroke-linecap="round"/></svg>
        <span>Moves this job to a different <strong>existing</strong> company — the fix for a posting captured under the wrong company twin. Its outreach drafts, application answers, and tracking travel with it; it then shows the new company's verdict. To add a brand-new company, use <strong>Add</strong> first.</span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="relink-cancel">Cancel</button>
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
              <div class="sm-arrow"><span class="sm-label sm-cfg">+ email template · pipeline prompts</span></div>
              <div class="sm-node sm-llm">
                <div class="sm-name">verdict engine</div>
                <div class="sm-desc">One LLM call per company: the brief + playbook against the company's data and fetched site text.</div>
              </div>
              <div class="sm-node sm-llm">
                <div class="sm-name">outreach engine</div>
                <div class="sm-desc">Company research, then fill the template's holes, humanize, honesty-check. The same knowledge also drafts application answers.</div>
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
`;function na(b){const i={rows:[],sort:{k:"verdict",dir:1},openId:null,stats:null,profile:null,view:"companies",jobs:[],jsort:{k:"created_at",dir:1},applicationStages:["applied","screening","interview","offer","rejected"],outreachStatuses:["initial contact","no response","replied","followed up"],openDetail:null,anthropicKey:null},v=e=>"pill pill-"+(e||"none"),T='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 14V2.5"/><path d="M3.5 2.5c3-1.2 6 1.2 9 0V9c-3 1.2-6-1.2-9 0z"/></svg>',r=e=>String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),g=e=>/^https?:\/\//i.test(String(e??""))?r(e):"#";async function _(){const t=await(await fetch("/api/companies")).json();i.rows=t.rows||[],P()}async function E(){let e;try{const t=await fetch("/api/postings");if(!t.ok)return;e=await t.json()}catch{return}i.jobs=e.rows||[],$(),J(),j()}function J(){if(!h.postingId)return;const e=i.jobs.find(t=>t.posting_id===h.postingId);e&&(h.row=e,document.getElementById("pursuit-pane").classList.contains("open")&&ee())}let H=null;function j(){const e=i.jobs.some(t=>t.outreach_draft_status==="researching");e&&!H?H=setInterval(Re,4e3):!e&&H&&(clearInterval(H),H=null)}async function Re(){let e;try{const a=await fetch("/api/postings");if(!a.ok)return;e=await a.json()}catch{return}const t=e.rows||[],s=new Map(i.jobs.map(a=>[a.posting_id,a.outreach_draft_status])),n=t.some(a=>s.get(a.posting_id)!==a.outreach_draft_status)||t.length!==i.jobs.length;i.jobs=t,n&&($(),J()),j()}async function re(){await Promise.all([fetch("/api/application-stages").then(e=>e.ok?e.json():null).then(e=>{e&&Array.isArray(e.statuses)&&e.statuses.length&&(i.applicationStages=e.statuses)}).catch(()=>{}),fetch("/api/outreach-statuses").then(e=>e.ok?e.json():null).then(e=>{e&&Array.isArray(e.statuses)&&e.statuses.length&&(i.outreachStatuses=e.statuses)}).catch(()=>{})]),bs(),i.view==="jobs"&&$()}function te(e){i.view=e,document.getElementById("tab-companies").classList.toggle("active",e==="companies"),document.getElementById("tab-jobs").classList.toggle("active",e==="jobs"),document.getElementById("companies-view").style.display=e==="companies"?"":"none",document.getElementById("jobs-view").style.display=e==="jobs"?"":"none",document.getElementById("block-filter-companies").style.display=e==="companies"?"":"none",document.getElementById("block-filter-jobs").style.display=e==="jobs"?"":"none",De(),e==="jobs"?$():P()}async function w(){let e;try{const t=await fetch("/api/stats");if(!t.ok)throw new Error(`HTTP ${t.status}`);e=await t.json()}catch(t){const s=document.getElementById("unscored-n");s.textContent="–",s.title=`stats failed: ${t.message}`;return}i.stats=e,M()}function M(){const e=i.stats||{};document.getElementById("unscored-n").textContent=e.unscored??0,D()}function N(e,t,s){const n=e[s]??"",a=t[s]??"";if(s==="headcount")return(n|0)-(a|0);if(s==="verdict"){const o={yes:0,maybe:1,no:2,"":3};return(o[n]??3)-(o[a]??3)}return String(n).localeCompare(String(a))}function z(e){return e.slice().sort((t,s)=>i.sort.dir*N(t,s,i.sort.k))}const F=new Set;let se=!1;function ye(){document.querySelectorAll("#verdict-chips .v-chip[data-v]").forEach(e=>{e.classList.toggle("is-on",F.has(e.dataset.v))})}function be(){const e=document.getElementById("q").value.trim().toLowerCase();return i.rows.filter(t=>!(F.size&&!F.has(t.verdict||"__none__")||se&&!t.flagged||e&&!(t.name+" "+(t.vertical||"")+" "+(t.reason||"")).toLowerCase().includes(e)))}const hs=[{k:"flag",label:"flag"},{k:"verdict",label:"verdict"},{k:"reason",label:"reason"},{k:"vertical",label:"vertical"},{k:"location",label:"location"},{k:"hc",label:"hc"},{k:"stage",label:"stage"},{k:"reviewed",label:"reviewed"},{k:"site",label:"site"}],ms=[{k:"application",label:"application"},{k:"outreach",label:"outreach"},{k:"last_outreach",label:"last outreach"},{k:"contacts",label:"contacts"},{k:"link",label:"link"}];function kt(e){try{return new Set(JSON.parse(localStorage.getItem(e)||"[]"))}catch{return new Set}}const Et=kt("scout-hidden-cols"),$t=kt("scout-hidden-jcols");function It(){return i.view==="jobs"?{cols:ms,hidden:$t,key:"scout-hidden-jcols"}:{cols:hs,hidden:Et,key:"scout-hidden-cols"}}function ne(){document.querySelectorAll("#t [data-col]").forEach(e=>{e.style.display=Et.has(e.dataset.col)?"none":""}),document.querySelectorAll("#jt [data-col]").forEach(e=>{e.style.display=$t.has(e.dataset.col)?"none":""})}function De(){const e=It();document.getElementById("col-toggles").innerHTML=e.cols.map(t=>`<button class="col-chip${e.hidden.has(t.k)?"":" is-on"}" data-col="${t.k}" title="${e.hidden.has(t.k)?"show":"hide"} ${t.label}">${t.label}</button>`).join(""),document.querySelectorAll("#col-toggles .col-chip").forEach(t=>{t.addEventListener("click",()=>{const s=It(),n=t.dataset.col;s.hidden.has(n)?s.hidden.delete(n):s.hidden.add(n),localStorage.setItem(s.key,JSON.stringify([...s.hidden])),De(),ne()})})}function xt(e){return`
      <td class="td-flag" data-col="flag"><button class="flag-btn${e.flagged?" is-on":""}" data-id="${e.company_id}" title="${e.flagged?"unflag":"flag"}">${T}</button></td>
      <td data-col="verdict"><span class="${v(e.verdict)}">${r(e.verdict||"—")}</span></td>
      <td><span class="row-name" data-id="${e.company_id}">${r(e.name)}</span></td>
      <td class="reason" data-col="reason">${r(e.reason||"")}</td>
      <td data-col="vertical">${r(e.vertical||"")}</td>
      <td data-col="location">${r(e.location||"")}</td>
      <td data-col="hc">${e.headcount||""}</td>
      <td data-col="stage">${r(e.stage||"")}</td>
      <td data-col="reviewed" class="muted" title="${r(e.reviewed_at||"never reviewed")}">${e.reviewed_at?r(e.reviewed_at.slice(0,10)):"—"}</td>
      <td data-col="site">${e.website_url?`<a href="${g(e.website_url)}" target="_blank" rel="noopener">about ↗</a>`:""}</td>
    `}function _t(e){const t=e.querySelector(".flag-btn");t&&t.addEventListener("click",()=>Yt(t.dataset.id))}const fs=[["flag","14px"],["verdict","46px"],[null,"62%"],["reason","85%"],["vertical","70%"],["location","60%"],["hc","26px"],["stage","55%"],["reviewed","44px"],["site","38px"]],gs=[[null,"72%"],["applied","58px"],["response","54px"],["outreach","22px"],["last_outreach","58px"],["contacts","55%"],["link","32px"]];function Bt(e,t,s=7){const n=document.querySelector(e);if(!n)return;const a=[1,.82,.7,.95,.76,.9,.85];let o="";for(let c=0;c<s;c++){const l=t.map(([u,d])=>{const m=d.endsWith("%")?Math.round(parseFloat(d)*a[c%a.length])+"%":d;return`<td${u?` data-col="${u}"`:""}><span class="skel" style="width:${m}"></span></td>`}).join("");o+=`<tr class="skel-row" aria-hidden="true">${l}</tr>`}n.innerHTML=o,ne()}function P(){const e=document.querySelector("#t tbody");e.innerHTML="";const t=z(be());document.getElementById("empty").style.display=t.length?"none":"block";for(const s of t){const n=document.createElement("tr");n.dataset.id=s.company_id,n.innerHTML=xt(s),n.addEventListener("click",a=>{a.target.closest("a, .flag-btn")||he(n.dataset.id)}),e.appendChild(n),_t(n)}ne()}async function vs(e){const s=await(await fetch("/api/companies")).json();i.rows=s.rows||[];const n=document.querySelector("#t tbody"),a=z(be()).map(c=>c.company_id),o=[...n.querySelectorAll("tr")].map(c=>c.dataset.id);if(a.length!==o.length||a.some((c,l)=>c!==o[l])){P();return}for(const c of e){const l=i.rows.find(d=>d.company_id===c),u=n.querySelector(`tr[data-id="${CSS.escape(c)}"]`);if(!l||!u){P();return}u.innerHTML=xt(l),_t(u)}ne()}const S=new Set;let we=!1,ke=!1,Z=!0;function ys(){const e=document.getElementById("jq").value.trim().toLowerCase(),t=Z&&!S.has("rejected");return i.jobs.filter(s=>{const n=R(s.stage_history);return!(t&&n==="rejected"||S.size&&!S.has(n)||we&&!s.next_up||ke&&(s.outreach_count|0)>0||e&&!(s.title+" "+s.company+" "+(s.location||"")+" "+(s.description||"")+" "+(s.contacts||"")).toLowerCase().includes(e))})}function bs(){const e=document.getElementById("stage-chips");if(e){for(const t of[...S])i.applicationStages.includes(t)||S.delete(t);e.innerHTML=i.applicationStages.map(t=>`<button class="v-chip${S.has(t)?" is-on":""}" data-stage="${r(t)}">${r(t)}</button>`).join("")}}const ws=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;function Lt(e){if(e=String(e||"").trim(),!e)return[];if(e[0]==="[")try{const t=JSON.parse(e);if(Array.isArray(t))return t.map(s=>({position:String((s==null?void 0:s.position)||"").trim(),email:String((s==null?void 0:s.email)||"").trim()})).filter(s=>s.position||s.email)}catch{}return e.split(",").map(t=>t.trim()).filter(Boolean).map(t=>{const s=t.match(ws),n=s?s[0]:"";let a=n?t.replace(n,""):t;return a=a.replace(/[<>()]/g,"").replace(/[\s:–—-]+$/,"").trim(),{position:a,email:n}})}function ks(e){const t=(e||[]).map(s=>({position:(s.position||"").trim(),email:(s.email||"").trim()})).filter(s=>s.position||s.email);return t.length?JSON.stringify(t):""}const Ee=()=>new Date().toISOString().slice(0,10);function X(e){if(e=String(e||"").trim(),!e)return[];try{const t=JSON.parse(e);if(Array.isArray(t))return t.map(s=>({stage:String((s==null?void 0:s.stage)||"").trim(),date:String((s==null?void 0:s.date)||"").trim()})).filter(s=>s.stage)}catch{}return[]}function $e(e){const t=(e||[]).map(s=>({stage:(s.stage||"").trim(),date:(s.date||"").trim()})).filter(s=>s.stage);return t.sort((s,n)=>(s.date||"9999-99-99").localeCompare(n.date||"9999-99-99")),t.length?JSON.stringify(t):""}function R(e){const t=X(e);return t.length?t[t.length-1].stage:""}function Tt(e){const t=X(e);return t.length?t[t.length-1].date:""}function Es(e){const t=[["","none"]];for(const s of i.applicationStages)t.push([s,s]);return e&&!i.applicationStages.includes(e)&&t.push([e,e+" (removed)"]),t}function Ct(e){const t=[["","none"]];for(const s of i.outreachStatuses)t.push([s,s]);return e&&!i.outreachStatuses.includes(e)&&t.push([e,e+" (removed)"]),t}const $s=8;function St(e,t){const s=(t||[]).indexOf(e);return s<0?"":"sc-"+s%$s}function Ve(e){return St(e,i.applicationStages)}function Is(e){return St(e,i.outreachStatuses)}function xs(e){const t=Lt(e);return t.length?t.map(s=>{const n=r(s.position||s.email);if(!s.email)return n;const a=r(s.position?`${s.position} — ${s.email}`:s.email);return`<a href="mailto:${r(s.email)}" title="${a}">${n}</a>`}).join('<span class="dim">, </span>'):'<span class="dim">—</span>'}function jt(e){return`<div class="cc-row">
      <input class="input cc-pos" value="${r(e.position||"")}" placeholder="position" spellcheck="false">
      <input class="input cc-email" type="email" value="${r(e.email||"")}" placeholder="email" spellcheck="false">
      <button class="cc-del" type="button" title="remove contact" aria-label="remove contact">×</button>
    </div>`}function _s(e){return`<div class="outreach-contacts" id="contacts-editor">
      <label class="cc-label">contacts</label>
      <div class="cc-list">${Lt(e).map(jt).join("")}</div>
      <button class="btn cc-add" type="button">+ add contact</button>
    </div>`}function Mt(e){const t=R(e.stage_history);if(!t)return i.applicationStages.length+1;const s=i.applicationStages.indexOf(t);return s<0?i.applicationStages.length:s}function Bs(e,t,s){if(s==="verdict"){const n={yes:0,maybe:1,no:2,"":3};return(n[e.verdict]??3)-(n[t.verdict]??3)}if(s==="application")return Mt(e)-Mt(t);if(s==="outreach_count")return(t.outreach_count|0)-(e.outreach_count|0);if(s==="created_at"||s==="last_outreach_at"){const n=e[s]||"",a=t[s]||"";return!n&&!a?0:n?a?String(a).localeCompare(String(n)):-i.jsort.dir:i.jsort.dir}return String(e[s]??"").localeCompare(String(t[s]??""))}function $(){const e=document.querySelector("#jt tbody");e.innerHTML="";const t=ys().sort((d,m)=>i.jsort.dir*Bs(d,m,i.jsort.k));document.getElementById("jobs-empty").style.display=t.length?"none":"block";const s=Z&&!S.has("rejected")?i.jobs.filter(d=>R(d.stage_history)==="rejected").length:0,n=document.getElementById("hidden-rej-n");n.textContent=s,n.style.display=s?"":"none";const a=i.jobs.filter(d=>d.next_up).length,o=document.getElementById("next-up-n");o.textContent=a,o.style.display=a?"":"none";const c=i.jobs.filter(d=>!(d.outreach_count|0)&&!(Z&&!S.has("rejected")&&R(d.stage_history)==="rejected")).length,l=document.getElementById("not-reached-n");l.textContent=c,l.style.display=c?"":"none";const u=document.getElementById("jobs-hidden-note");u.style.display=s?"":"none",s&&(u.innerHTML=`${s} rejected application${s>1?"s":""} hidden — <a id="show-rejected-link">show</a>`,document.getElementById("show-rejected-link").onclick=()=>{Z=!1,document.getElementById("hide-rejected").classList.remove("is-on"),$()});for(const d of t){const m=R(d.stage_history),f=Tt(d.stage_history),y=document.createElement("tr");y.dataset.id=d.posting_id;const B=Es(m).map(([x,U])=>`<option value="${r(x)}"${m===x?" selected":""}>${r(U)}</option>`).join(""),A=d.outreach_status||"",V=Ct(A).map(([x,U])=>`<option value="${r(x)}"${A===x?" selected":""}>${r(U)}</option>`).join("");y.innerHTML=`
      <td><div class="jt-namecell"><button class="jt-nextup${d.next_up?" is-on":""}" title="${d.next_up?"queued next up for outreach — click to remove":"mark next up for outreach"}" aria-label="next up">${d.next_up?"★":"☆"}</button><div class="jt-namecol"><span class="row-name">${r(d.title||d.company)}</span>${Ts(d.outreach_draft_status)}${d.title?`<div class="small dim">${r(d.company)}</div>`:""}</div></div></td>
      <td data-col="application"><div class="jt-stage"><select class="jt-stage-sel ${Ve(m)}" title="application stage — pick a new stage to record it (dated today)">${B}</select>${f?`<span class="jt-stage-date" title="when this stage was reached">${r(f)}</span>`:""}</div></td>
      <td class="small" data-col="outreach"><div class="jt-out"><span class="jt-stepper"><button class="jt-dec" title="undo one outreach"${d.outreach_count?"":" disabled"}>−</button><span class="jt-oc${d.outreach_count?"":" dim"}">${d.outreach_count||0}</span><button class="jt-inc" title="log one outreach (today)">+</button></span><select class="jt-ostatus ${Is(A)}" title="outreach reply status">${V}</select></div></td>
      <td class="small" data-col="last_outreach">${d.last_outreach_at?r(d.last_outreach_at):'<span class="dim">—</span>'}</td>
      <td class="small td-contacts" data-col="contacts">${xs(d.contacts)}</td>
      <td data-col="link"><a href="${g(d.url)}" target="_blank" rel="noopener">open ↗</a></td>
    `,y.querySelector(".jt-nextup").onclick=()=>Dt(d,!1),y.querySelector(".jt-stage-sel").onchange=x=>Ls(d,x.target.value),y.querySelector(".jt-ostatus").onchange=x=>xe(d,{outreach_status:x.target.value}),y.querySelector(".jt-inc").onclick=()=>xe(d,{outreach_count:(d.outreach_count||0)+1,last_outreach_at:Ee()}),y.querySelector(".jt-dec").onclick=()=>{const x=Math.max(0,(d.outreach_count||0)-1);xe(d,{outreach_count:x,...x===0?{last_outreach_at:""}:{}})},e.appendChild(y)}ne(),e.querySelectorAll("tr").forEach(d=>{d.addEventListener("click",m=>{m.target.closest("a, button, select")||At(d.dataset.id)})})}function Ls(e,t){if(t=(t||"").trim(),!t||t===R(e.stage_history)){$();return}const s=X(e.stage_history);s.push({stage:t,date:Ee()}),xe(e,{stage_history:$e(s)})}function Ts(e){return e==="researching"?'<span class="draft-badge db-researching" title="drafting outreach…"><span class="spinner spinner-xs"></span>drafting</span>':e==="awaiting_review"?'<span class="draft-badge" title="an outreach draft is ready to review">draft ready</span>':e==="no_hook"?'<span class="draft-badge db-nohook" title="no honest hook — scout recommends not emailing">no hook</span>':""}const h={postingId:null,row:null,drafts:[],poll:null,openHist:!1,answers:[],answersStatus:"",answersPoll:null,detecting:!1};async function At(e){let t=i.jobs.find(s=>s.posting_id===e);if(t||(await E(),t=i.jobs.find(s=>s.posting_id===e)),!t){p("posting not found — refresh");return}Je(),We(),h.postingId=e,h.row=t,h.drafts=[],h.openHist=!1,h.answers=[],h.detecting=!1,h.answersStatus=t.questions_status||"",document.getElementById("pursuit-pane").classList.add("open"),document.getElementById("pursuit-scrim").classList.add("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","false"),Ht("pursuit"),ee(),ce(),ue()}let Ue=null;function Ht(e){Ue=e;const t=e==="company";document.getElementById("scrim").style.zIndex=t?"54":"52",document.getElementById("pane").style.zIndex=t?"55":"53",document.getElementById("pursuit-scrim").style.zIndex=t?"52":"54",document.getElementById("pursuit-pane").style.zIndex=t?"53":"55"}function Ie(){Je(),We(),h.postingId=null,h.row=null,h.drafts=[],h.answers=[],h.answersStatus="",document.getElementById("pursuit-pane").classList.remove("open"),document.getElementById("pursuit-scrim").classList.remove("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","true")}function Je(){h.poll&&(clearInterval(h.poll),h.poll=null)}async function ce(){if(!h.postingId)return;let e;try{const s=await fetch(`/api/postings/${h.postingId}/outreach`);if(!s.ok){_e();return}e=await s.json()}catch{_e();return}h.drafts=e.drafts||[],_e();const t=h.drafts[0];t&&t.status==="researching"?Cs():Je()}function Cs(){h.poll||(h.poll=setInterval(ce,4e3))}function O(e,t,{multiline:s=!1}={}){if(!e)return;let n=e.value;e.addEventListener("focus",()=>{n=e.value}),e.addEventListener("keydown",a=>{a.key==="Escape"?(a.preventDefault(),e.value=n,e.blur()):a.key==="Enter"&&(!s||a.metaKey||a.ctrlKey)&&(a.preventDefault(),e.blur())}),e.addEventListener("blur",async()=>{const a=e.value.trim();if(a===n.trim()){e.value=n;return}e.classList.remove("is-saved","is-error"),e.classList.add("is-saving");try{await t(a),n=e.value,e.classList.remove("is-saving"),e.classList.add("is-saved"),setTimeout(()=>e.classList.remove("is-saved"),1200)}catch(o){e.value=n,e.classList.remove("is-saving"),e.classList.add("is-error"),setTimeout(()=>e.classList.remove("is-error"),1600),p(`save failed: ${o.message}`)}})}async function Pt(e,t,s){const n={title:e.title||"",location:e.location||"",comp_range:e.comp_range||"",employment_type:e.employment_type||"",workplace_type:e.workplace_type||"",department:e.department||"",description:e.description||"",[t]:s},a=await fetch(`/api/postings/${e.posting_id}/details`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)});if(!a.ok)throw new Error((await a.text().catch(()=>"")).trim()||"HTTP "+a.status);const o=await a.json();Object.assign(e,{title:o.title,location:o.location,employment_type:o.employment_type,workplace_type:o.workplace_type,department:o.department,comp_range:o.comp_range,description:o.description}),$(),ie(e.posting_id,{title:o.title,location:o.location})}async function Ss(e,t){const s=await fetch(`/api/postings/${e.posting_id}/url`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:t})});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const n=await s.json();e.url=n.url;const a=document.querySelector("#role-body .role-url-open");a&&a.setAttribute("href",g(e.url)),ie(e.posting_id,{url:n.url})}async function js(e,t){if(t.disabled)return;const s=t.textContent;t.disabled=!0,t.textContent="re-enriching…";let n;try{n=await fetch(`/api/postings/${e.posting_id}/recapture`,{method:"POST"})}catch(o){t.disabled=!1,t.textContent=s,p(`re-enrich failed: ${o.message}`);return}if(!n.ok){const o=(await n.text().catch(()=>"")).trim();let c=o||"HTTP "+n.status;try{c=JSON.parse(o).error||c}catch{}t.disabled=!1,t.textContent=s,p(`re-enrich failed: ${c}`);return}const a=await n.json();Object.assign(e,{title:a.title,location:a.location,employment_type:a.employment_type,workplace_type:a.workplace_type,department:a.department,comp_range:a.comp_range,description:a.description,posted_at:a.posted_at,url:a.url,questions_status:a.questions_status}),$(),ee(),ie(e.posting_id,{title:a.title,location:a.location,url:a.url}),p("re-enriched from the posting link")}function Ms(e){const t=document.getElementById("pursuit-company-edit");t&&t.addEventListener("click",()=>Hs(e))}async function As(e,t){const s=await fetch(`/api/postings/${e.posting_id}/company`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({company_id:t})});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const n=await s.json();e.company_id=n.company_id,e.company=n.company_name,ee(),E()}let de=null;function Hs(e){de=e;const t=document.getElementById("relink-current");t&&(t.textContent=e.company?`currently: ${e.company}`:"");const s=document.getElementById("relink-search");s&&(s.value=""),Ot(""),document.getElementById("relink-scrim").classList.add("open"),s&&s.focus()}function ae(){document.getElementById("relink-scrim").classList.remove("open"),de=null}function Ot(e){const t=document.getElementById("relink-results");if(!t)return;const s=e.trim().toLowerCase();let n=(i.rows||[]).slice();if(s?(n=n.filter(o=>(o.name||"").toLowerCase().includes(s)),n.sort((o,c)=>{const l=(o.name||"").toLowerCase().startsWith(s)?0:1,u=(c.name||"").toLowerCase().startsWith(s)?0:1;return l-u||(o.name||"").localeCompare(c.name||"")})):n.sort((o,c)=>(o.name||"").localeCompare(c.name||"")),n=n.slice(0,60),!n.length){t.innerHTML=`<div class="relink-empty">${(i.rows||[]).length?"no company matches":"no companies yet — Add one first"}</div>`;return}const a=de?de.company_id:"";t.innerHTML=n.map(o=>{const c=o.company_id===a,l=[o.vertical,o.location].filter(Boolean).map(r).join(" · ");return`<button type="button" class="relink-result${c?" is-current":""}"
        data-id="${o.company_id}"${c?" disabled":""}>
        <span class="rr-main">
          <span class="rr-name">${r(o.name||"—")}</span>
          ${l?`<span class="rr-sub">${l}</span>`:""}
        </span>
        <span class="${v(o.verdict)} rr-verdict">${r(o.verdict||"—")}</span>
        ${c?'<span class="rr-current-tag">current</span>':""}
      </button>`}).join("")}async function qt(e){const t=de;if(!t){ae();return}if(e===t.company_id){ae();return}try{await As(t,e),ae(),p(`moved to ${t.company}`)}catch(s){p(`move failed: ${s.message}`)}}async function Nt(e,t,s){const n={name:e.name||"",headcount:e.headcount||"",funding_stage:e.funding_stage||"",location:e.location||"",vertical:e.vertical||"",[t]:s};if(!String(n.name).trim())throw new Error("name is required");const a=await fetch(`/api/companies/${e.company_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)});if(!a.ok)throw new Error((await a.text().catch(()=>"")).trim()||"HTTP "+a.status);const o=await a.json();Object.assign(e,{name:o.name,headcount:o.headcount,funding_stage:o.funding_stage,location:o.location,vertical:o.vertical}),_(),E()}async function Ps(e,t){const s=await fetch(`/api/companies/${e.company_id}/domain`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({website:t})});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const n=await s.json();i.openId=n.company_id,me(n),fe(n.company_id),_(),E()}async function Os(e,t){const s=await fetch(`/api/companies/${e.company_id}/notes`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({notes:t})});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const n=await s.json();e.notes=n.notes}let Rt=null;function ee(){const e=h.row;if(!e)return;const t=document.getElementById("pursuit-body"),n=!!t&&Rt===e.posting_id&&document.getElementById("pursuit-pane").classList.contains("open")&&t?t.scrollTop:0;document.getElementById("pursuit-title").innerHTML=`<input class="ie ie-title" id="pursuit-title-input" placeholder="role name" value="${r(e.title||"")}">`;const a=R(e.stage_history);document.getElementById("pursuit-pills").innerHTML=`<span class="pill ${a?Ve(a)||"pill-stage":"pill-none"}">${r(a||"—")}</span>`+(e.verdict?` <span class="${v(e.verdict)}">${r(e.verdict)}</span>`:"");const o=document.getElementById("pursuit-chat");o&&(o.style.display=i.meta&&i.meta.chat?"":"none",o.onclick=()=>gt("posting",e.posting_id,e.title||e.company)),document.getElementById("pursuit-body").innerHTML=`
    <section class="pane-section role-head">
      <div id="role-body">${qs(e)}</div>
    </section>

    <section class="pane-section">
      <h3>
        Pipeline
      </h3>
      <div class="pipeline-grid">
        <div class="pipeline-row pipeline-stage-row">
          <span class="pl-label">stage</span>
          <div class="pl-stage-wrap">${Ns(e)}</div>
        </div>
        <div class="pipeline-row">
          <span class="pl-label">reply</span>
          <select class="input pl-ostatus" title="outreach reply status — separate from the application stage">
            ${Ct(e.outreach_status||"").map(([u,d])=>`<option value="${r(u)}"${(e.outreach_status||"")===u?" selected":""}>${r(d)}</option>`).join("")}
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
        Notes
      </h3>
      <textarea class="ie ie-notes" id="pursuit-notes-input" rows="4" placeholder="—">${r(e.notes||"")}</textarea>
    </section>

    <section class="pane-section">
      <h3>
        Outreach
      </h3>
      <div id="outreach-section"></div>
    </section>

    ${R(e.stage_history)?"":`
    <section class="pane-section">
      <h3>
        Application
      </h3>
      <div id="answers-section"></div>
    </section>`}
  `,Rs();const c=document.getElementById("pursuit-company-link");c&&c.addEventListener("click",()=>he(e.company_id)),Ms(e),O(document.getElementById("pursuit-title-input"),u=>Pt(e,"title",u)),O(document.getElementById("pursuit-url-input"),u=>Ss(e,u));const l=document.getElementById("pursuit-reenrich");l&&l.addEventListener("click",()=>js(e,l)),O(document.getElementById("pursuit-notes-input"),u=>Ds(u),{multiline:!0}),document.querySelectorAll("#role-body [data-k]").forEach(u=>O(u,d=>Pt(e,u.dataset.k,d),{multiline:u.tagName==="TEXTAREA"})),_e(),pe(),t&&(t.scrollTop=n),Rt=e.posting_id}function qs(e){return`
    <div class="role-url ie-field">
      <div class="role-url-head">
        <label>link</label>
        <a class="role-url-open" href="${g(e.url)}" target="_blank" rel="noopener" title="open the posting">↗</a>
        <button type="button" class="role-reenrich h3-action" id="pursuit-reenrich"
                title="re-fetch this posting's details from the link — fills in blanks, no re-typing">↻ re-enrich</button>
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
      <div class="ie-field"><label>description</label>
        <textarea class="ie" data-k="description" rows="6" placeholder="—">${r(e.description||"")}</textarea></div>
    </div>
    <div class="role-meta">
      ${e.posted_at?`<span>posted ${r(e.posted_at)}</span>`:""}
      <span class="role-company-wrap">
        <button type="button" class="role-company role-company-link" id="pursuit-company-link"
                title="open the company panel">${r(e.company)} ↗</button>
        <button type="button" class="role-company-relink-btn" id="pursuit-company-edit"
                title="move this job to a different company">change</button>
      </span>
    </div>`}function Ns(e){const t=X(e.stage_history),s=t.map((a,o)=>`
    <div class="stage-entry" data-i="${o}">
      <span class="stage-name${o===t.length-1?" is-current":""}">${r(a.stage)}</span>
      <input type="date" class="input stage-date" value="${r(a.date)}" title="when this stage was reached">
      <button class="stage-del" type="button" title="remove this stage" aria-label="remove">×</button>
    </div>`).join(""),n=['<option value="">+ add stage…</option>'].concat(i.applicationStages.map(a=>`<option value="${r(a)}">${r(a)}</option>`)).join("");return`
    <div class="stage-timeline">${s||'<div class="stage-empty dim">no stage yet</div>'}</div>
    <div class="stage-add">
      <select class="input stage-add-sel">${n}</select>
      <input type="date" class="input stage-add-date" value="${Ee()}" title="date for the new stage">
      <button class="btn stage-add-btn" type="button">add</button>
    </div>`}function Rs(){const e=h.row;document.querySelectorAll("#pursuit-body .stage-entry .stage-date").forEach(a=>{a.addEventListener("change",o=>{const c=+o.target.closest(".stage-entry").dataset.i,l=X(e.stage_history);l[c]&&(l[c].date=o.target.value,oe({stage_history:$e(l)}))})}),document.querySelectorAll("#pursuit-body .stage-entry .stage-del").forEach(a=>{a.addEventListener("click",o=>{const c=+o.target.closest(".stage-entry").dataset.i,l=X(e.stage_history);l.splice(c,1),oe({stage_history:$e(l)})})});const t=document.querySelector("#pursuit-body .stage-add-btn");t&&t.addEventListener("click",()=>{const a=document.querySelector("#pursuit-body .stage-add-sel"),o=document.querySelector("#pursuit-body .stage-add-date"),c=(a.value||"").trim();if(!c)return;const l=X(e.stage_history);l.push({stage:c,date:o.value||Ee()}),oe({stage_history:$e(l)})});const s=document.querySelector("#pursuit-body .pl-ostatus");s&&s.addEventListener("change",a=>oe({outreach_status:a.target.value}));const n=document.querySelector("#pursuit-body .pt-nextup");n&&n.addEventListener("click",()=>Dt(h.row,!0))}async function Dt(e,t){let s;try{s=await fetch(`/api/postings/${e.posting_id}/next-up`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({next_up:!e.next_up})})}catch(a){p(`save failed: ${a.message}`);return}if(!s.ok){const a=(await s.text().catch(()=>"")).trim();p(`save failed: ${a||"HTTP "+s.status}`);return}const n=await s.json();e.next_up=n.next_up,$(),ie(e.posting_id,{next_up:n.next_up}),t&&ee(),p(e.next_up?"queued next up":"removed from the queue")}async function ze(e,t){const s={stage_history:e.stage_history||"",outreach_count:e.outreach_count||0,last_outreach_at:e.last_outreach_at||"",outreach_status:e.outreach_status||"",contacts:e.contacts||"",notes:e.notes||"",...t};let n;try{n=await fetch(`/api/postings/${e.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)})}catch(o){return p(`save failed: ${o.message}`),null}if(!n.ok){const o=(await n.text().catch(()=>"")).trim();return p(`save failed: ${o||"HTTP "+n.status}`),null}const a=await n.json();return Object.assign(e,{stage_history:a.stage_history,outreach_count:a.outreach_count,last_outreach_at:a.last_outreach_at,outreach_status:a.outreach_status,contacts:a.contacts,notes:a.notes,next_up:a.next_up}),ie(e.posting_id,{stage_history:a.stage_history,outreach_count:a.outreach_count,last_outreach_at:a.last_outreach_at,next_up:a.next_up}),a}async function Ds(e){const t=h.row,s={stage_history:t.stage_history||"",outreach_count:t.outreach_count||0,last_outreach_at:t.last_outreach_at||"",outreach_status:t.outreach_status||"",contacts:t.contacts||"",notes:e},n=await fetch(`/api/postings/${t.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const a=await n.json();t.notes=a.notes,$()}async function oe(e){await ze(h.row,e)&&($(),ee(),p("tracking saved"))}async function Vt(e){await ze(h.row,{contacts:e})&&$()}async function xe(e,t){await ze(e,t)&&($(),h.postingId===e.posting_id&&(h.row=e,ee()),p("tracking saved"))}function _e(){const e=document.getElementById("outreach-section");if(!e)return;const t=h.row,s=h.drafts,n=s[0]||null,a=s.slice(1),o=`
    <div class="outreach-meta">
      <span><span class="om-count">${t.outreach_count||0}</span> sent</span>
      ${t.last_outreach_at?`<span>· last ${r(t.last_outreach_at)}</span>`:""}
      <span class="pt-stepper">
        <button class="btn pt-outreach-dec" title="undo one outreach" ${t.outreach_count?"":"disabled"}>−</button>
        <button class="btn pt-outreach" title="log one outreach sent outside scout — today">+1 outreach</button>
      </span>
    </div>
    ${_s(t.contacts)}`,l=n&&(Vs(n.status)||n.status==="failed")?"":`<button class="btn btn-primary" id="draft-start-btn">${n?"Draft again":"Draft outreach"}</button>`,u=a.length?`
    <details class="draft-history" ${h.openHist?"open":""}>
      <summary>${a.length} earlier draft${a.length>1?"s":""}</summary>
      <div id="draft-history-body">${a.map(d=>Jt(d,!0)).join("")}</div>
    </details>`:"";e.innerHTML=o+`<div id="draft-current">${n?Jt(n,!1):""}</div><div class="draft-actions">${l}</div>`+u,Ws()}function Vs(e){return e==="researching"||e==="awaiting_review"||e==="needs_work"||e==="no_hook"}const Us='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M2.5 10.5v-7a1 1 0 011-1h7"/></svg>',Js='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2L7.3 8.7"/><path d="M14 2L9.7 14l-2.4-5.3L2 6.3z"/></svg>',Ut=`<button class="dh-copy draft-copy-btn" title="copy the email to the clipboard" aria-label="copy email">${Us}</button>`,Fe=[{key:"research",label:"Research",active:"Researching the company"},{key:"fill",label:"Draft",active:"Writing the draft"},{key:"humanize",label:"Polish",active:"Polishing the voice"},{key:"honesty",label:"Fact-check",active:"Fact-checking against your experience"}],zs='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';function Fs(e){let t=Fe.findIndex(n=>n.key===e);return t<0&&(t=0),`<div class="draft-progress">
    <div class="dp-track">${Fe.map((n,a)=>{const o=a<t?"is-done":a===t?"is-active":"is-pending",c=a<t?zs:"";return`<div class="dp-seg ${o}"><span class="dp-dot">${c}</span><span class="dp-name">${n.label}</span></div>`}).join("")}</div>
    <div class="dp-status"><span class="spinner"></span><span>${Fe[t].active}…</span></div>
  </div>`}function Jt(e,t){const s=(d,m,f="")=>`
    <div class="draft-head">
      <span class="${d}">${m}</span>${f}
    </div>`;if(e.status==="researching")return`<div class="draft-card dc-busy">
      ${Fs(e.stage)}
      <div class="draft-note">This usually takes a minute or two — leave the panel or check back later.</div>
    </div>`;if(e.status==="failed"){const d=Ks(e.violations);return`<div class="draft-card dc-failed" data-did="${e.id}">
      ${s("pill pill-no","failed")}
      ${e.fail_reason?`<div class="draft-note">${r(e.fail_reason)}</div>`:""}
      ${d}
      ${le(e)}
      ${t?"":`<div class="draft-actions"><button class="btn btn-primary draft-retry-btn">${ge}Retry</button></div>`}
    </div>`}if(e.status==="superseded")return`<div class="draft-card dc-sent" data-did="${e.id}">
      ${s("pill pill-info","replaced")}
      <div class="draft-note">Replaced by a newer draft.</div>
      <div class="draft-sentbody">${r(Ke(e)||"(empty)")}</div>
      ${le(e)}
    </div>`;if(e.status==="sent")return`<div class="draft-card dc-sent" data-did="${e.id}">
      ${s("pill pill-yes","sent",t?"":Ut)}
      ${e.sent_at?`<div class="draft-note">Sent ${r((e.sent_at||"").replace("T"," ").slice(0,16))}</div>`:""}
      <div class="draft-sentbody">${r(Ke(e)||"(empty)")}</div>
      ${le(e)}
    </div>`;const n=Ke(e),a=e.status==="no_hook",o=a?'<span class="pill pill-info">no honest hook</span>':'<span class="pill pill-maybe">awaiting review</span>';let c="";if(a)try{c=JSON.parse(e.hook||"{}").reasoning||""}catch{}const l=a?`<div class="draft-note">No honest hook found — nothing true to say yet; scout recommends not emailing.${c?" "+r(c):""}</div>`:"";if(t)return`<div class="draft-card ${a?"dc-nohook":"dc-review"}" data-did="${e.id}">
      <div class="draft-head">${o}</div>
      ${l}
      <div class="draft-sentbody">${r(n||"(empty)")}</div>
      ${le(e)}
    </div>`;const u=n||a;return`<div class="draft-card ${a?"dc-nohook":"dc-review"}" data-did="${e.id}">
    <div class="draft-head">${o}${n?Ut:""}</div>
    ${l}
    ${u?`<textarea class="draft-textarea" id="draft-edit-${e.id}" spellcheck="false">${r(n)}</textarea>
    ${zt(e.lint)}
    <div class="draft-actions">
      <button class="btn btn-primary draft-sent-btn" title="mark this email sent — bumps the outreach count">${Js}Mark sent</button>
      <button class="btn draft-regen-btn" title="discard this draft (kept in history) and re-run — picks up backfilled info">${ge}Regenerate</button>
    </div>`:`<div class="draft-actions">
      <button class="btn draft-regen-btn" title="re-run the draft — picks up backfilled info">${ge}Regenerate</button>
    </div>`}
    ${le(e)}
  </div>`}function Ke(e){return e.edited&&e.edited.trim()?e.edited:e.draft||""}function le(e){let t="",s=null,n=null;try{s=JSON.parse(e.research||"null")}catch{}try{n=JSON.parse(e.hook||"null")}catch{}if(s&&typeof s=="object"){const a=(u,d)=>d?`<div class="tr-line"><span class="tr-key">${u}:</span> ${r(String(d))}</div>`:"",o=s.role||{},c=Array.isArray(s.hooks)?s.hooks:[],l=c.map(u=>`
      <div class="tr-line">
        <span class="tr-key">${r(u.type||"hook")}</span>
        ${g(u.source_url)!=="#"?` · <a href="${g(u.source_url)}" target="_blank" rel="noopener">source</a>`:""}
        <span class="tr-quote">${r(u.quote||"")}</span>
        ${u.context?`<span class="tr-key">${r(u.context)}</span>`:""}
      </div>`).join("");t+=`<details class="draft-trace"><summary>research — ${c.length} hook candidate${c.length===1?"":"s"}</summary>
      <div class="trace-body">
        ${a("what they do",s.what_they_do)}
        ${a("customer",s.customer)}
        ${a("stage / headcount",[s.stage,s.headcount_est].filter(Boolean).join(" / "))}
        ${a("role",o.title)}
        ${(o.jd_quotes||[]).map(u=>`<span class="tr-quote">${r(u)}</span>`).join("")}
        ${l}
        ${a("disambiguation",s.disambiguation)}
        ${a("confidence",s.confidence)}
      </div></details>`}if(n&&typeof n=="object"&&n.decision){const a=n.hook||{};t+=`<details class="draft-trace"><summary>hook — ${r(n.decision)}${n.closer_mode?" · "+r(n.closer_mode):""}</summary>
      <div class="trace-body">
        ${a.quote?`<span class="tr-quote">${r(a.quote)}</span>`:""}
        ${a.thread?`<div class="tr-line"><span class="tr-key">thread:</span> ${r(a.thread)}</div>`:""}
        ${g(a.source_url)!=="#"?`<div class="tr-line"><a href="${g(a.source_url)}" target="_blank" rel="noopener">source</a></div>`:""}
        ${n.reasoning?`<div class="tr-line"><span class="tr-key">reasoning:</span> ${r(n.reasoning)}</div>`:""}
      </div></details>`}return t}function zt(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<div class="lint-chips">'+t.map(s=>`<span class="lint-chip" title="${r(s.message||"")}"><code>${r(s.code||"")}</code>${r(s.message||"")}</span>`).join("")+"</div>":""}function Ks(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<ul class="violation-list">'+t.map(s=>`<li>${r(s.claim||s.message||String(s))}${s.why?` <span class="vl-why">— ${r(s.why)}</span>`:""}</li>`).join("")+"</ul>":""}function Ws(){const e=document.getElementById("outreach-section");if(!e)return;const t=e.querySelector("#contacts-editor");if(t){const u=t.querySelector(".cc-list"),d=()=>ks(Array.from(u.querySelectorAll(".cc-row")).map(f=>({position:f.querySelector(".cc-pos").value,email:f.querySelector(".cc-email").value}))),m=f=>{f.querySelectorAll(".cc-pos, .cc-email").forEach(y=>{y.addEventListener("change",()=>Vt(d())),y.addEventListener("keydown",B=>{B.key==="Enter"&&(B.preventDefault(),B.target.blur())})}),f.querySelector(".cc-del").addEventListener("click",()=>{f.remove(),Vt(d())})};u.querySelectorAll(".cc-row").forEach(m),t.querySelector(".cc-add").addEventListener("click",()=>{const f=document.createElement("div");f.innerHTML=jt({position:"",email:""});const y=f.firstElementChild;u.appendChild(y),m(y),y.querySelector(".cc-pos").focus()})}const s=()=>new Date().toISOString().slice(0,10),n=h.row,a=e.querySelector(".pt-outreach");a&&a.addEventListener("click",()=>oe({outreach_count:(n.outreach_count||0)+1,last_outreach_at:s()}));const o=e.querySelector(".pt-outreach-dec");o&&o.addEventListener("click",()=>{const u=Math.max(0,(n.outreach_count||0)-1);oe({outreach_count:u,...u===0?{last_outreach_at:""}:{}})});const c=e.querySelector("#draft-start-btn");c&&c.addEventListener("click",()=>Be()),e.querySelectorAll(".draft-retry-btn").forEach(u=>u.addEventListener("click",()=>Be())),e.querySelectorAll(".draft-regen-btn").forEach(u=>u.addEventListener("click",()=>Be(!0))),e.querySelectorAll(".draft-card[data-did]").forEach(u=>{const d=u.dataset.did,m=u.querySelector(".draft-textarea");m&&O(m,B=>Gs(d,B),{multiline:!0});const f=u.querySelector(".draft-sent-btn");f&&f.addEventListener("click",()=>Qs(d));const y=u.querySelector(".draft-copy-btn");y&&y.addEventListener("click",()=>{const B=u.querySelector(".draft-textarea"),A=u.querySelector(".draft-sentbody"),V=B?B.value:A?A.textContent:"";fn(V,"email copied")})});const l=e.querySelector("details.draft-history");l&&l.addEventListener("toggle",()=>{h.openHist=l.open})}async function Be(e=!1){const t=document.getElementById("outreach-section"),s=t&&(t.querySelector("#draft-start-btn")||t.querySelector(".draft-retry-btn")||t.querySelector(".draft-regen-btn"));s&&(s.disabled=!0);let n;try{const o=e?"?regenerate=1":"";n=await fetch(`/api/postings/${h.postingId}/outreach${o}`,{method:"POST"})}catch(o){p(`draft failed: ${o.message}`),s&&(s.disabled=!1);return}if(n.status===202){let o={};try{o=await n.json()}catch{}Array.isArray(o.degraded)&&o.degraded.length&&p(`drafting without ${o.degraded.join(", ")} — quality degrades, integrity unaffected`),await ce(),E();return}if(n.status===409){await ce(),p("a draft is already active");return}if(n.status===412){let o={};try{o=await n.json()}catch{}Ys(o.need,o.error),s&&(s.disabled=!1);return}if(n.status===503){const o=document.getElementById("outreach-section");if(o){const c=document.createElement("div");c.className="draft-note",c.textContent="Outreach engine not running in this build.",o.appendChild(c)}s&&(s.disabled=!1);return}const a=(await n.text().catch(()=>"")).trim();p(`draft failed: ${a||"HTTP "+n.status}`),s&&(s.disabled=!1)}function Ys(e,t){const s=document.getElementById("outreach-section");if(!s)return;const n=s.querySelector(".draft-actions"),a=e==="template",o=a?"Write email template":"Discover sources",c=document.createElement("div");c.className="blocks-gate",c.innerHTML=`
    <div class="draft-note">${r(t||"Outreach isn't set up yet.")}</div>
    <div class="draft-actions">
      <button class="btn btn-primary" id="gate-fix-btn">${o}</button>
      <button class="btn" id="gate-retry-btn">Retry</button>
    </div>`,n?n.replaceWith(c):s.appendChild(c);const l=c.querySelector("#gate-fix-btn");l&&l.addEventListener("click",()=>a?Y("outreach-template"):st());const u=c.querySelector("#gate-retry-btn");u&&u.addEventListener("click",Be)}async function Gs(e,t){const s=await fetch(`/api/outreach/drafts/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t})});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const n=await s.json(),a=h.drafts.findIndex(l=>String(l.id)===String(e));a>=0&&(h.drafts[a]=n);const o=document.getElementById(`draft-edit-${e}`),c=o&&o.closest(".draft-card");if(c){const l=c.querySelector(".lint-chips"),u=zt(n.lint);l?l.outerHTML=u||"":u&&o.insertAdjacentHTML("afterend",u)}}async function Qs(e){let t;try{t=await fetch(`/api/outreach/drafts/${e}/sent`,{method:"POST"})}catch(n){p(`failed: ${n.message}`);return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();p(`failed: ${n||"HTTP "+t.status}`);return}p("marked sent"),await ce(),await E();const s=i.jobs.find(n=>n.posting_id===h.postingId);s&&ie(s.posting_id,{outreach_count:s.outreach_count,last_outreach_at:s.last_outreach_at,next_up:s.next_up})}async function ue(){if(!h.postingId)return;let e;try{const t=await fetch(`/api/postings/${h.postingId}/answers`);if(!t.ok){pe();return}e=await t.json()}catch{pe();return}h.answers=e.answers||[],h.answersStatus=e.questions_status||"",pe(),h.answers.some(t=>t.status==="generating")?Zs():We()}function Zs(){h.answersPoll||(h.answersPoll=setInterval(ue,4e3))}function We(){h.answersPoll&&(clearInterval(h.answersPoll),h.answersPoll=null)}function pe(){const e=document.getElementById("answers-section");if(!e)return;const t=h.answers,s=h.answersStatus,n=t.some(d=>d.status==="generating"),a=t.length?`<div class="answers-list">${t.map(tn).join("")}</div>`:"",o=!!h.detecting,c=n||o?" disabled":"",l=d=>`<button class="btn" id="answers-redetect-btn"${o?" disabled":""}>${o?"Detecting…":d}</button>`;let u;s==="ok"&&t.length?u=`<button class="btn ${t.some(m=>!Ft(m)&&m.status!=="generating")?"btn-primary":""}" id="answers-start-btn"${c}>${n?"Drafting…":"Draft answers"}</button>`+l("Re-detect"):s===""||s==="unreachable"?u=`<button class="btn btn-primary" id="answers-start-btn"${c}>${n?"Drafting…":"Draft answers"}</button>`+l("Re-detect questions"):u=l("Re-detect questions"),e.innerHTML=`<div class="answers-meta">${r(Xs(s,t.length))}</div>`+a+`<div class="answers-actions">${u}</div>`,nn()}function Xs(e,t){switch(e){case"":return"Not detected yet";case"ok":return`${t} question${t===1?"":"s"} found`;case"none":return"No essay questions on this form";case"unsupported":return"Couldn't read this form — apply on the site";case"unreachable":return"Couldn't reach the application form — try re-detecting";default:return"Couldn't read this form"}}function Ft(e){return e.edited&&e.edited.trim()?e.edited:e.answer||""}function en(e){switch(e.status){case"ready":return'<span class="pill pill-yes">ready</span>';case"needs_review":return'<span class="pill pill-maybe">needs review</span>';case"failed":return'<span class="pill pill-no">failed</span>';case"generating":return'<span class="pill pill-info">drafting…</span>';default:return'<span class="pill pill-info">not drafted</span>'}}function tn(e){const t=Ft(e),s=e.edited&&e.edited.trim(),n=e.status==="generating",a=t.length,o=e.max_length&&a>e.max_length,c=e.max_length?`<span class="answer-count${o?" over":""}">${a} / ${e.max_length}</span>`:`<span class="answer-count">${a} chars</span>`;return`<div class="answer-card ac-${e.status}" data-aid="${e.id}">
    <div class="answer-prompt">${r(e.prompt)}</div>
    ${n?'<div class="answer-busy"><span class="spinner"></span><span>drafting…</span></div>':`<textarea class="ie answer-textarea" id="answer-edit-${e.id}" rows="5" spellcheck="false" placeholder="Draft answers to fill this in, or write your own.">${r(t)}</textarea>`}
    <div class="answer-foot">
      ${en(e)}
      ${s?'<span class="answer-edited" title="your edit wins over the drafted answer">edited</span>':""}
      ${n?"":c}
      ${n?"":'<button class="btn answer-regen-btn" title="re-draft this answer (discards the current text)">Regenerate</button>'}
    </div>
    ${e.status==="needs_review"?`<div class="answer-note answer-review">Flagged by the honesty check — confirm it doesn't overstate your experience before sending.</div>`:""}
    ${e.status==="failed"&&e.fail_reason?`<div class="answer-note answer-fail">${r(sn(e.fail_reason))}</div>`:""}
  </div>`}function sn(e){return e=String(e||""),e.length>160?e.slice(0,160)+"…":e}function nn(){const e=document.getElementById("answers-section");if(!e)return;const t=e.querySelector("#answers-start-btn");t&&t.addEventListener("click",Kt);const s=e.querySelector("#answers-redetect-btn");s&&s.addEventListener("click",on),e.querySelectorAll(".answer-card[data-aid]").forEach(n=>{const a=n.dataset.aid,o=n.querySelector(".answer-textarea");o&&(O(o,l=>rn(a,l),{multiline:!0}),o.addEventListener("input",()=>an(n,o)));const c=n.querySelector(".answer-regen-btn");c&&c.addEventListener("click",()=>cn(a))})}function an(e,t){const s=e.querySelector(".answer-count");if(!s)return;const n=t.value.length,a=s.textContent.includes("/")?parseInt(s.textContent.split("/")[1],10):0;s.textContent=a?`${n} / ${a}`:`${n} chars`,s.classList.toggle("over",!!a&&n>a)}async function Kt(){const e=document.getElementById("answers-section"),t=e&&e.querySelector("#answers-start-btn");t&&(t.disabled=!0);let s;try{s=await fetch(`/api/postings/${h.postingId}/answers`,{method:"POST"})}catch(a){p(`draft failed: ${a.message}`),t&&(t.disabled=!1);return}if(s.status===202){await ue();return}if(s.status===412){let a={};try{a=await s.json()}catch{}dn(a.error),t&&(t.disabled=!1);return}if(s.status===503){Wt("Answer generation isn't running in this build."),t&&(t.disabled=!1);return}const n=(await s.text().catch(()=>"")).trim();p(`draft failed: ${n||"HTTP "+s.status}`),t&&(t.disabled=!1)}async function on(){h.detecting=!0,pe();try{const e=await fetch(`/api/postings/${h.postingId}/answers/redetect`,{method:"POST"});if(!e.ok){const t=(await e.text().catch(()=>"")).trim();p(`detect failed: ${t||"HTTP "+e.status}`)}}catch(e){p(`detect failed: ${e.message}`)}h.detecting=!1,await ue()}async function rn(e,t){const s=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t})});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const n=await s.json(),a=h.answers.findIndex(o=>String(o.id)===String(e));a>=0&&(h.answers[a]=n)}async function cn(e){let t;try{t=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({regenerate:!0})})}catch(s){p(`regenerate failed: ${s.message}`);return}if(t.status===503){Wt("Answer generation isn't running in this build.");return}if(!t.ok){const s=(await t.text().catch(()=>"")).trim();p(`regenerate failed: ${s||"HTTP "+t.status}`);return}await ue()}function dn(e){const t=document.getElementById("answers-section");if(!t)return;const s=t.querySelector(".answers-actions"),n=document.createElement("div");n.className="blocks-gate",n.innerHTML=`
    <div class="draft-note">${r(e||"Drafting answers needs your experience discovered.")}</div>
    <div class="answers-actions">
      <button class="btn btn-primary" id="answers-fix-btn">Discover sources</button>
      <button class="btn" id="answers-retry-btn">Retry</button>
    </div>`,s?s.replaceWith(n):t.appendChild(n);const a=n.querySelector("#answers-fix-btn");a&&a.addEventListener("click",st);const o=n.querySelector("#answers-retry-btn");o&&o.addEventListener("click",Kt)}function Wt(e){const t=document.getElementById("answers-section");if(!t)return;const s=document.createElement("div");s.className="draft-note",s.textContent=e,t.appendChild(s)}async function he(e){var l,u;const t=document.getElementById("pane"),s=document.getElementById("scrim"),n=i.openId===e&&t.classList.contains("open"),a=n?((l=document.getElementById("pane-body"))==null?void 0:l.scrollTop)??0:0,o=n?(u=document.getElementById("trace-body"))==null?void 0:u.innerHTML:null;i.openId=e,t.classList.add("open"),s.classList.add("open"),t.setAttribute("aria-hidden","false"),Ht("company"),n||(document.getElementById("pane-title").textContent="loading…",document.getElementById("pane-pills").innerHTML="",document.getElementById("pane-body").innerHTML='<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>');let c;try{const d=await fetch(`/api/companies/${e}`);if(!d.ok)throw new Error(`HTTP ${d.status}`);c=await d.json()}catch(d){n||(document.getElementById("pane-body").innerHTML=`<div class="muted">Failed to load detail: ${r(d.message)}</div>`);return}if(i.openId===e){if(me(c),n){if(o!=null){const m=document.getElementById("trace-body");m&&(m.innerHTML=o)}const d=document.getElementById("pane-body");d&&(d.scrollTop=a)}fe(e)}}function Le(){i.openId=null,i.openDetail=null,document.getElementById("pane").classList.remove("open"),document.getElementById("scrim").classList.remove("open"),document.getElementById("pane").setAttribute("aria-hidden","true")}function me(e){i.openDetail=e,document.getElementById("pane-title").innerHTML=`<input class="ie ie-title" id="pane-title-input" placeholder="company name" value="${r(e.name||"")}">`,document.getElementById("pane-pills").innerHTML=`
    <span class="${v(e.has_verdict?e.verdict:"")}">${r(e.has_verdict?e.verdict:"unscored")}</span>
  `;const t=document.getElementById("pane-chat");t&&(t.style.display=i.meta&&i.meta.chat?"":"none",t.onclick=()=>gt("company",e.company_id,e.name));const s=e.model==="manual",n=e.has_verdict?`
    <dl class="kv">
      <dt>verdict</dt><dd><span class="${v(e.verdict)}">${r(e.verdict)}</span>${s?' <span class="small muted">· set by hand</span>':""}</dd>
      <dt>reason</dt><dd>${r(e.reason||"")}</dd>
      <dt>model</dt><dd class="small muted">${r(e.model||"")}</dd>
      <dt>taste version</dt><dd class="small muted"><span class="tooltip" title="scored ${r(e.scored_at)} · model ${r(e.model)}">${r(e.taste_version||"")}</span></dd>
      <dt>scored at</dt><dd class="small muted">${r(e.scored_at||"")}</dd>
    </dl>
  `:'<div class="muted">Not yet scored. Run <code>scout verdict</code>, or set one by hand below.</div>',a=`
    <div class="verdict-edit" id="verdict-edit">
      <div class="ve-label muted small">${e.has_verdict?"override verdict":"set verdict"}</div>
      <div class="ve-pick" id="ve-pick">
        ${["yes","maybe","no"].map(k=>`<button type="button" class="ve-opt${e.has_verdict&&e.verdict===k?" is-on":""}" data-v="${k}">${k}</button>`).join("")}
      </div>
      <div class="prow">
        <input class="input" id="ve-reason" placeholder="reason (optional)" value="${s?r(e.reason||""):""}">
        <button class="btn btn-primary" id="ve-save-btn">Save</button>
      </div>
    </div>`,o=e.has_enrichment?`
    <dl class="kv">
      <dt>url</dt><dd>${e.website_url?`<a href="${g(e.website_url)}" target="_blank" rel="noopener">${r(e.website_url)} ↗</a>`:'<span class="muted">—</span>'}</dd>
      <dt>status</dt><dd class="small">${r(e.fetch_status||"")}${e.fetch_error?` <span class="muted">(${r(e.fetch_error)})</span>`:""}</dd>
      <dt>fetched</dt><dd class="small muted">${r(e.fetched_at||"")}</dd>
    </dl>
    ${e.website_summary?`<div class="summary-box">${r(e.website_summary)}</div>`:""}
  `:'<div class="muted">No enrichment yet. Run <code>scout enrich</code>.</div>',c=!i.meta||i.meta.control!==!1,l=c&&i.meta&&i.meta.verdict?'<button class="h3-action" id="rescore-btn" title="re-score just this company — replaces the current verdict, manual or not">↻ re-score</button>':"",u=c&&e.domain?'<button class="h3-action" id="reenrich-btn" title="re-fetch this company’s site now">↻ re-enrich</button>':"",d=Object.keys(e.raw_json||{}).sort(),m=d.length===0?"":`
    <details class="raw-json">
      <summary>Raw row <span class="dim">(${d.length} fields)</span></summary>
      <table><tbody>
        ${d.map(k=>`<tr><td class="k">${r(k)}</td><td>${r(e.raw_json[k])}</td></tr>`).join("")}
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
      <div id="postings-list">${Ye(e)}</div>
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
      <div id="facts-body">${ln(e)}</div>
      ${m}
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3 3 7-7"/></svg>
        Verdict
        ${l}
      </h3>
      ${n}
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
  `;const y=document.getElementById("posting-add-btn");y&&y.addEventListener("click",()=>hn(e)),Ge(),document.querySelectorAll("#ve-pick .ve-opt").forEach(k=>{k.addEventListener("click",()=>{document.querySelectorAll("#ve-pick .ve-opt").forEach(Q=>Q.classList.remove("is-on")),k.classList.add("is-on")})});const B=document.getElementById("ve-save-btn");B&&B.addEventListener("click",()=>pn(e)),O(document.getElementById("pane-title-input"),k=>Nt(e,"name",k)),document.querySelectorAll("#facts-body [data-k]").forEach(k=>O(k,Q=>Nt(e,k.dataset.k,Q))),O(document.getElementById("pane-domain-input"),k=>Ps(e,k)),O(document.getElementById("pane-notes-input"),k=>Os(e,k),{multiline:!0});const A=document.getElementById("flag-toggle-btn");A&&A.addEventListener("click",()=>Yt(e.company_id));const V=document.getElementById("review-stamp-btn");V&&V.addEventListener("click",()=>un(e.company_id));const x=document.getElementById("rescore-btn");x&&x.addEventListener("click",()=>Xe("verdict",{company_ids:[e.company_id]}));const U=document.getElementById("reenrich-btn");U&&U.addEventListener("click",()=>Xe("enrich",{company_ids:[e.company_id]}))}function ln(e){return`
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
    </dl>`}async function un(e){const t=document.getElementById("review-stamp-btn");t&&(t.disabled=!0);let s;try{s=await fetch(`/api/companies/${e}/reviewed`,{method:"POST"})}catch(o){p(`failed: ${o.message}`),t&&(t.disabled=!1);return}if(!s.ok){const o=await s.text().catch(()=>"");p(`failed: HTTP ${s.status}${o?" — "+o:""}`),t&&(t.disabled=!1);return}const n=await s.json(),a=i.rows.find(o=>o.company_id===e);a&&(a.reviewed_at=n.reviewed_at,P()),i.openId===e&&(me(n),fe(e)),p("reviewed")}async function Yt(e){const t=i.rows.find(o=>o.company_id===e),s=!(t&&t.flagged);let n;try{n=await fetch(`/api/companies/${e}/flagged`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({flagged:s})})}catch(o){p(`failed: ${o.message}`);return}if(!n.ok){const o=await n.text().catch(()=>"");p(`failed: HTTP ${n.status}${o?" — "+o:""}`);return}const a=await n.json();t&&(t.flagged=a.flagged,P()),i.openId===e&&(me(a),fe(e)),E(),p(a.flagged?"flagged":"unflagged")}async function pn(e){const t=document.querySelector("#ve-pick .ve-opt.is-on");if(!t){p("Pick yes, maybe, or no.");return}const s=t.dataset.v,n=document.getElementById("ve-reason").value.trim(),a=document.getElementById("ve-save-btn");a.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/verdict`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({verdict:s,reason:n})})}catch(l){p(`save failed: ${l.message}`),a.disabled=!1;return}if(!o.ok){const l=await o.text().catch(()=>"");p(`save failed: HTTP ${o.status}${l?" — "+l:""}`),a.disabled=!1;return}const c=await o.json();me(c),fe(c.company_id),_(),w(),E(),p("verdict saved")}function Ye(e){const t=e.postings||[];return t.length?t.map(s=>{const n=[s.location,s.source==="capture"?"captured":"added",(s.created_at||"").slice(0,10)].filter(Boolean).map(r).join(" · "),a=R(s.stage_history),o=Tt(s.stage_history),c=[s.next_up?'<span class="draft-badge db-next" style="margin-left:0" title="queued next up for outreach">next up</span>':"",`<span class="pill ${a?Ve(a)||"pill-stage":"pill-none"}">${r(a||"—")}</span>`,`<span class="pt-meta">${a?o?r(o):"tracked":"not applied"}</span>`,`<span class="pt-meta">${s.outreach_count?`${s.outreach_count} sent · last ${r(s.last_outreach_at||"?")}`:"no outreach yet"}</span>`].filter(Boolean).join("");return`
    <div class="brain-node posting-card" data-pid="${r(s.id)}" title="open the pursuit — tracking, outreach, drafts">
      <div class="n"><a href="${g(s.url)}" target="_blank" rel="noopener">${r(s.title||s.url)} ↗</a></div>
      ${s.description?`<div class="small muted" style="margin-top:3px">${r(s.description.length>200?s.description.slice(0,200).trimEnd()+"…":s.description)}</div>`:""}
      ${n?`<div class="l" style="margin-top:3px">${n}</div>`:""}
      <div class="pcard-status">${c}<span class="pcard-open">open →</span></div>
    </div>`}).join(""):'<div class="muted">No job links yet.</div>'}function ie(e,t){const s=i.openDetail;if(!s||!i.openId)return;const n=(s.postings||[]).find(o=>String(o.id)===String(e));if(!n)return;Object.assign(n,t);const a=document.getElementById("postings-list");a&&(a.innerHTML=Ye(s),Ge())}function Ge(){document.querySelectorAll("#postings-list .posting-card").forEach(e=>{e.addEventListener("click",t=>{t.target.closest("a")||At(e.dataset.pid)})})}async function hn(e){const t=document.getElementById("posting-url"),s=document.getElementById("posting-title"),n=document.getElementById("posting-add-btn"),a=t.value.trim();if(!a){p("Enter a URL first."),t.focus();return}n.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/postings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:a,title:s.value.trim()})})}catch(u){p(`add failed: ${u.message}`),n.disabled=!1;return}if(!o.ok){const u=await o.text().catch(()=>"");p(`add failed: HTTP ${o.status}${u?" — "+u:""}`),n.disabled=!1;return}const c=await o.json();e.postings=(e.postings||[]).filter(u=>u.id!==c.id),e.postings.unshift(c);const l=document.getElementById("postings-list");l&&(l.innerHTML=Ye(e),Ge()),t.value="",s.value="",n.disabled=!1,E(),p("link added")}async function fe(e){let t;try{t=await fetch(`/api/companies/${e}/trace`)}catch(n){Te(`<div class="muted">Failed to load trail: ${r(n.message)}</div>`);return}if(!t.ok){Te(`<div class="muted">Failed to load trail: HTTP ${t.status}.</div>`);return}const s=(await t.json()).events||[];if(s.length===0){Te('<div class="muted">No decision trail yet. Run <code>verdict</code> to record one — every scoring pass is captured here.</div>');return}Te(s.map(mn).join(""))}function mn(e){const t=[e.criteria_source,e.taste_version].filter(Boolean).map(r);return e.run_id&&t.push("run "+r(e.run_id.slice(0,8))),`
    <div class="trail-event">
      <div class="trail-head">
        <span class="${v(e.verdict)}">${r(e.verdict)}</span>
        <span class="trail-meta mono">${r(e.model||"")}</span>
        <span class="trail-meta trail-time">${r(e.scored_at||"")}</span>
      </div>
      <div class="trail-decision">
        <span class="trail-reason">${r(e.reason||"")}</span>
      </div>
      <div class="trail-foot muted small">criteria: ${t.join(" · ")||"—"}</div>
    </div>`}function Te(e){const t=document.getElementById("trace-body");t&&(t.innerHTML=e)}let Gt;function p(e){const t=document.getElementById("toast");t.textContent=e,t.classList.toggle("err",/\b(fail(ed)?|error|disabled|already running)\b/i.test(e)),t.classList.add("show"),clearTimeout(Gt),Gt=setTimeout(()=>t.classList.remove("show"),2200)}async function fn(e,t="copied"){if(!e){p("nothing to copy");return}try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(e);else{const s=document.createElement("textarea");s.value=e,s.style.position="fixed",s.style.opacity="0",document.body.appendChild(s),s.select(),document.execCommand("copy"),document.body.removeChild(s)}p(t)}catch(s){p(`copy failed: ${s.message}`)}}i.meta={control:!1,brain:!1,verdict:!1};async function Qe(){try{const n=await fetch("/api/meta");if(!n.ok)return;i.meta=await n.json()}catch{return}const e=i.meta.control;document.getElementById("btn-ingest").disabled=!e,document.getElementById("btn-enrich").disabled=!e;const t=document.getElementById("btn-verdict");t.disabled=!e||!i.meta.verdict,t.title=i.meta.verdict?"":"set ANTHROPIC_API_KEY in the server env to enable";const s=document.getElementById("open-chat");s&&(s.style.display=i.meta.chat?"":"none")}async function Ze(){let e;try{const n=await fetch("/api/runs");if(!n.ok)return;e=await n.json()}catch{return}const t=e.busy_stage||"",s=document.getElementById("run-busy");t?(s.style.display="",document.getElementById("run-busy-label").textContent=t+" running…"):s.style.display="none",document.getElementById("btn-ingest").classList.toggle("busy",t==="ingest"),document.getElementById("btn-enrich").classList.toggle("busy",t==="enrich"),document.getElementById("btn-verdict").classList.toggle("busy",t==="verdict")}let Ce=null;async function Xe(e,t){if(i.meta&&i.meta.control===!1){p("control surface disabled");return}let s;try{s=await fetch(`/api/run/${e}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t||{})})}catch(a){p(`run failed: ${a.message}`);return}if(s.status===409){p("a job is already running");return}if(s.status===412){const a=await s.text();p(a.trim());return}if(!s.ok){p(`run failed: HTTP ${s.status}`);return}const{job_id:n}=await s.json();ns(e,n,t)}async function gn(e){const t=new FormData;t.append("csv",e);let s;try{s=await fetch("/api/ingest",{method:"POST",body:t})}catch(a){p(`upload failed: ${a.message}`);return}if(s.status===409){p("a job is already running");return}if(!s.ok){p(`upload failed: HTTP ${s.status}`);return}const{job_id:n}=await s.json();ns("ingest",n)}const vn=["add-url","add-name","add-location","add-headcount","add-title","add-job-company"];let Se=[],K=new Set,W="company";function Qt(e){W=e,document.querySelectorAll("#add-kind .v-chip").forEach(n=>n.classList.toggle("is-on",n.dataset.kind===e)),document.getElementById("add-company-fields").style.display=e==="company"?"":"none",document.getElementById("add-job-fields").style.display=e==="job"?"":"none";const t=document.getElementById("add-url-label"),s=document.getElementById("add-url");e==="company"?(t.innerHTML='Website<span class="req">*</span>',s.placeholder="acme.com"):(t.innerHTML='Posting URL<span class="req">*</span>',s.placeholder="https://… the job posting"),document.getElementById("add-save").textContent=e==="company"?"Add company":"Add job",Zt()}function et(){return!!i.meta.capture&&document.getElementById("add-enrich").checked}function Zt(){const e=document.getElementById("add-note");et()?e.innerHTML=W==="company"?"scout fetches the page and fills the blank fields — your values win. The page text also seeds enrichment, so the next Verdict can score it. Pages behind a login wall (LinkedIn) usually can't be fetched.":"scout fetches the posting and fills in the title, location and description — your values win. The job attaches to its company, adding it to the list first if needed. Pages behind a login wall (LinkedIn) usually can't be fetched.":e.innerHTML=W==="company"?"Stored as source <code>manual</code>. Run Enrich then Verdict to score it. A website already in the list is rejected — manual adds never overwrite an existing company.":"Stored as-is, no fetch. The job attaches to the typed company, or to the link's own domain when the posting lives on the company's site — for an ATS link (greenhouse, lever, …), type the company."}async function yn(){vn.forEach(n=>{document.getElementById(n).value=""}),document.getElementById("add-vertical-filter").value="",K=new Set;const e=document.getElementById("add-enrich"),t=document.getElementById("add-enrich-row");e.disabled=!i.meta.capture,t.classList.toggle("disabled",!i.meta.capture),t.title=i.meta.capture?"":"set ANTHROPIC_API_KEY in the server env to enable",i.meta.capture||(e.checked=!1),Qt(i.view==="jobs"?"job":"company");const s=document.getElementById("add-stage");s.innerHTML='<option value="">—</option>',document.getElementById("add-vertical-chips").innerHTML='<div class="none">loading…</div>',document.getElementById("add-company-names").innerHTML=(i.rows||[]).map(n=>`<option value="${r(n.name)}">`).join(""),document.getElementById("add-scrim").classList.add("open"),document.getElementById("add-url").focus();try{const n=await(await fetch("/api/facets")).json();(n.funding_stages||[]).forEach(a=>{const o=document.createElement("option");o.value=a,o.textContent=a,s.appendChild(o)}),Se=n.verticals||[]}catch{Se=[]}Xt()}function je(){document.getElementById("add-scrim").classList.remove("open")}function Xt(){const e=document.getElementById("add-vertical-chips"),t=document.getElementById("add-vertical-filter").value.trim().toLowerCase(),s=Se.filter(n=>!t||n.toLowerCase().includes(t));s.length?(e.innerHTML=s.map(n=>`<button type="button" class="vchip${K.has(n)?" sel":""}" data-v="${r(n)}">${r(n)}</button>`).join(""),e.querySelectorAll(".vchip").forEach(n=>n.addEventListener("click",()=>{const a=n.dataset.v;K.has(a)?K.delete(a):K.add(a),n.classList.toggle("sel"),es()}))):e.innerHTML=`<div class="none">${Se.length?"no match":"no verticals in the set yet"}</div>`,es()}function es(){const e=K.size;document.getElementById("add-vertical-count").textContent=e?`· ${e} selected`:""}function ts(e){return/^https?:\/\//i.test(e)?e:"https://"+e}async function ss(){const e=document.getElementById("add-url"),t=e.value.trim();if(!t){p(W==="company"?"Website is required.":"Posting URL is required."),e.focus();return}const s=document.getElementById("add-save"),n=s.textContent;s.disabled=!0,et()&&(s.textContent="reading page…");const a=()=>{s.disabled=!1,s.textContent=n},o=f=>document.getElementById(f).value.trim(),c=et();let l,u;c?(l="/api/capture",u={url:ts(t),kind:W==="company"?"company_page":"job_posting",fields:W==="company"?{name:o("add-name"),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value,vertical:[...K].join(", ")}:{name:o("add-job-company"),title:o("add-title")}}):W==="company"?(l="/api/companies",u={website:t,name:o("add-name"),vertical:[...K].join(", "),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value}):(l="/api/postings",u={url:ts(t),title:o("add-title"),company:o("add-job-company")});let d;try{d=await fetch(l,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(u)})}catch(f){p(`add failed: ${f.message}`),a();return}if(!d.ok){let f=`HTTP ${d.status}`;try{const y=await d.text();try{f=JSON.parse(y).error||f}catch{f=y.trim()||f}}catch{}if(a(),d.status===409){p(f||"That company is already in the list."),e.focus(),e.select();return}p(`add failed: ${f}`);return}const m=await d.json();if(a(),c&&!m.company_id){p(m.note||"couldn't classify that page");return}if(je(),_(),w(),E(),W==="job"){const f=m.posting&&m.posting.title||"job link";p(`tracking: ${f} @ ${m.company_name}${m.posting_updated?" (refreshed)":""}`),te("jobs")}else c?(p(m.company_created?`company added: ${m.company_name}`:`${m.company_name} is already in the list`),he(m.company_id)):p("company added")}function ns(e,t,s){Ce=t;const n=document.getElementById("drawer"),a=document.getElementById("drawer-log");document.getElementById("drawer-title").textContent=e,document.getElementById("drawer-spinner").style.display="",document.getElementById("drawer-cancel").style.display="",document.getElementById("drawer-close").style.display="none",a.innerHTML="",n.classList.add("open"),Ze();const o=new EventSource(`/api/jobs/${t}/stream`),c=(l,u)=>{const d=document.createElement("div"),m=!u&&/^\s*warn:/i.test(l);d.className="ln"+(u?" ln-err":m?" ln-warn":""),d.textContent=m?l.replace(/^\s*warn:\s*/i,"⚠ "):l,a.appendChild(d),a.scrollTop=a.scrollHeight};o.addEventListener("line",l=>c(l.data,/error|failed/i.test(l.data))),o.addEventListener("end",l=>{o.close(),Ce=null,c(`— ${l.data} —`,l.data==="failed"),document.getElementById("drawer-spinner").style.display="none",document.getElementById("drawer-cancel").style.display="none",document.getElementById("drawer-close").style.display="",p(`${e} ${l.data}`),s&&Array.isArray(s.company_ids)&&s.company_ids.length>0?vs(s.company_ids):_(),w(),Ze(),E(),i.openId&&he(i.openId)}),o.onerror=()=>{o.close()}}async function bn(){if(Ce)try{await fetch(`/api/jobs/${Ce}/cancel`,{method:"POST"})}catch{}}let C=null;const wn={researcher:"researcher",fill:"writer",humanizer:"humanizer",honesty:"honesty check"};function tt(e){return e==="application-stages"||e==="outreach-statuses"}function Me(e){if(e==="outreach-template")return"outreach template";if(e==="taste-filter")return"pre-filter rules";if(e==="playbook")return"playbook";if(e==="application-stages")return"application stages";if(e==="outreach-statuses")return"outreach statuses";if(e&&e.startsWith("outreach-prompts/")){const t=e.slice(17);return(wn[t]||t)+" prompt"}return e+".md"}async function Y(e){C=e;const t=document.getElementById("editor-scrim");document.getElementById("editor-title").textContent="edit "+Me(e),document.getElementById("editor-text").value="loading…",document.getElementById("editor-ver").textContent="";const s=!!e&&e.startsWith("outreach-prompts/"),n=s?e.slice(17):"",a=e==="taste-filter"||s&&n!=="fill";document.getElementById("editor-toggle-row").style.display=a?"":"none",document.getElementById("editor-reset").style.display=s?"":"none",a&&(document.getElementById("editor-toggle-label").textContent=e==="taste-filter"?"Enable the pre-filter (off → bulk verdict runs score every company; the rules below are kept either way)":"Run this stage (off → it is skipped in the pipeline)"),t.classList.add("open");try{const o=await fetch(`/api/${e}`);if(!o.ok){const l=(await o.text().catch(()=>"")).trim();document.getElementById("editor-text").value=o.status===404?"failed to load: HTTP 404 — this route is missing. Restart the scout server (your running binary may predate this feature).":`failed to load: ${l||"HTTP "+o.status}`;return}const c=await o.json();tt(e)?(document.getElementById("editor-title").textContent="edit "+Me(e)+" — one per line",document.getElementById("editor-text").value=(c.statuses||[]).join(`
`)):document.getElementById("editor-text").value=c.content||"",a&&(document.getElementById("editor-enabled").checked=c.enabled!==!1),c.taste_version&&(document.getElementById("editor-ver").textContent="version "+c.taste_version)}catch(o){document.getElementById("editor-text").value="failed to load: "+o.message}}function Ae(){document.getElementById("editor-scrim").classList.remove("open"),C=null}const kn=[{key:"experience",hard:!0},{key:"voice",hard:!1}];async function st(){document.getElementById("sources-scrim").classList.add("open"),document.getElementById("sources-list").innerHTML='<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>';try{at(await(await fetch("/api/outreach/sources")).json())}catch(e){p(`failed to load sources: ${e.message}`)}}function nt(){document.getElementById("sources-scrim").classList.remove("open")}function at(e){const t=document.getElementById("sources-list");if(!t)return;const s=e&&e.needs&&e.needs.length?e.needs.map(a=>({key:a.Key||a.key,hard:a.Hard??a.hard})):kn,n={};(e&&e.sources||[]).forEach(a=>{(n[a.need]=n[a.need]||[]).push(a)}),t.innerHTML=s.map(a=>{const o=n[a.key]||[],c=o.length?o.map(l=>`<li><span class="src-title">${r(l.title||l.page_id)}</span><button class="src-rm" data-need="${r(a.key)}" data-id="${r(l.page_id)}" title="remove">✕</button></li>`).join(""):`<li class="dim small">${a.hard?"none yet — required for drafting":"none (optional)"}</li>`;return`<div class="src-need">
      <div class="src-need-h">${r(a.key)}${a.hard?' <span class="dim">required</span>':' <span class="dim">optional</span>'}</div>
      <ul class="src-items">${c}</ul></div>`}).join(""),t.querySelectorAll(".src-rm").forEach(a=>a.addEventListener("click",()=>$n(a.dataset.need,a.dataset.id)))}async function En(){const e=document.getElementById("sources-refresh-btn");e&&(e.disabled=!0,e.textContent="Discovering…");let t;try{t=await fetch("/api/outreach/sources/refresh",{method:"POST"})}catch(n){p(`refresh failed: ${n.message}`),e&&(e.disabled=!1,e.textContent="Refresh from brain");return}if(!t.ok){p(`refresh failed: ${(await t.text().catch(()=>"")).trim()||"HTTP "+t.status}`),e&&(e.disabled=!1,e.textContent="Refresh from brain");return}const s=await t.json();s.warning?p(s.warning):p("sources refreshed"),at(s),e&&(e.disabled=!1,e.textContent="Refresh from brain")}async function $n(e,t){let s;try{s=await fetch("/api/outreach/sources/remove",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({need:e,page_id:t})})}catch(n){p(`remove failed: ${n.message}`);return}if(!s.ok){p(`remove failed: ${(await s.text().catch(()=>"")).trim()||"HTTP "+s.status}`);return}at(await s.json())}async function In(){if(!C)return;const e=document.getElementById("editor-text").value;let t;if(tt(C))t={statuses:e.split(/\r?\n/).map(o=>o.trim()).filter(Boolean)};else{t={content:e};const o=C.startsWith("outreach-prompts/")&&C!=="outreach-prompts/fill";(C==="taste-filter"||o)&&(t.enabled=document.getElementById("editor-enabled").checked)}let s;try{s=await fetch(`/api/${C}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})}catch(o){p(`save failed: ${o.message}`);return}if(!s.ok){p(`save failed: ${(await s.text().catch(()=>"")).trim()||"HTTP "+s.status}`);return}const n=await s.json();n.taste_version&&(document.getElementById("editor-ver").textContent="version "+n.taste_version);const a=tt(C);p(`${Me(C)} saved`),Ae(),a&&re(),w()}async function xn(){if(!C||!C.startsWith("outreach-prompts/"))return;let e;try{e=await fetch(`/api/${C}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({reset:!0})})}catch(s){p(`reset failed: ${s.message}`);return}if(!e.ok){p(`reset failed: HTTP ${e.status}`);return}const t=await e.json();document.getElementById("editor-text").value=t.content||"",p(`${Me(C)} reset to default`)}document.querySelectorAll("#t thead th[data-k]").forEach(e=>{e.onclick=()=>{const t=e.dataset.k;i.sort.k===t?i.sort.dir*=-1:(i.sort.k=t,i.sort.dir=1),P()}}),document.querySelectorAll("#jt thead th[data-jk]").forEach(e=>{e.onclick=()=>{const t=e.dataset.jk;i.jsort.k===t?i.jsort.dir*=-1:(i.jsort.k=t,i.jsort.dir=1),$()}}),document.getElementById("tab-companies").onclick=()=>te("companies"),document.getElementById("tab-jobs").onclick=()=>te("jobs"),document.getElementById("q").oninput=P,document.querySelectorAll("#verdict-chips .v-chip[data-v]").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.v;F.has(t)?F.delete(t):F.add(t),ye(),P()})}),document.getElementById("flag-filter").addEventListener("click",e=>{se=!se,e.currentTarget.classList.toggle("is-on",se),P()}),document.getElementById("jq").oninput=$,document.getElementById("hide-rejected").addEventListener("click",e=>{Z=!Z,e.currentTarget.classList.toggle("is-on",Z),$()}),document.getElementById("stage-chips").addEventListener("click",e=>{const t=e.target.closest(".v-chip[data-stage]");if(!t)return;const s=t.dataset.stage;S.has(s)?S.delete(s):S.add(s),t.classList.toggle("is-on",S.has(s)),$()}),document.getElementById("next-up-filter").addEventListener("click",e=>{we=!we,e.currentTarget.classList.toggle("is-on",we),$()}),document.getElementById("not-reached-filter").addEventListener("click",e=>{ke=!ke,e.currentTarget.classList.toggle("is-on",ke),$()}),De(),ne(),document.getElementById("pane-close").onclick=Le,document.getElementById("scrim").onclick=Le,document.getElementById("pursuit-close").onclick=Ie,document.getElementById("pursuit-scrim").onclick=Ie,document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(document.getElementById("chat-pane").classList.contains("open")){vt();return}if(qn()){ht();return}if(document.getElementById("profile-scrim").classList.contains("open")){pt();return}if(document.getElementById("add-scrim").classList.contains("open")){je();return}if(document.getElementById("run-scrim").classList.contains("open")){He();return}if(document.getElementById("help-scrim").classList.contains("open")){Pe();return}if(document.getElementById("relink-scrim").classList.contains("open")){ae();return}const t=document.getElementById("pane").classList.contains("open"),s=document.getElementById("pursuit-pane").classList.contains("open");if(t||s){if(Ue==="pursuit"&&s){Ie();return}if(Ue==="company"&&t){Le();return}if(t){Le();return}Ie();return}if(document.getElementById("key-scrim").classList.contains("open")){ut();return}if(document.getElementById("sources-scrim").classList.contains("open")){nt();return}if(document.getElementById("editor-scrim").classList.contains("open")){Ae();return}if(document.getElementById("settings-scrim").classList.contains("open")){mt();return}});let ot=null;const _n={enrich:"Fetches and summarizes each company's pages, filling its enrichment row.",verdict:"Scores every company against your criteria — one LLM call each. Only companies with a successful enrichment are scored."};function as(e){if(i.meta&&i.meta.control===!1){p("control surface disabled");return}ot=e,document.getElementById("run-title").textContent="Run "+e,document.getElementById("run-desc").textContent=_n[e]||"",document.getElementById("run-only-blanks").checked=!1,document.getElementById("run-workers-input").value=e==="verdict"?10:8;const t=document.getElementById("run-warn"),s=i.stats||{},n=Math.max(0,(s.total_companies||0)-(s.enriched_ok||0));e==="verdict"&&n>0?(document.getElementById("run-warn-text").textContent=`${n} ${n===1?"company isn't":"companies aren't"} enriched yet — verdict will skip ${n===1?"it":"them"}. Run Enrich first to include ${n===1?"it":"them"}.`,t.style.display=""):t.style.display="none",document.getElementById("run-scrim").classList.add("open")}function He(){document.getElementById("run-scrim").classList.remove("open"),ot=null}document.getElementById("btn-enrich").onclick=()=>as("enrich"),document.getElementById("btn-verdict").onclick=()=>as("verdict"),document.getElementById("run-cancel").onclick=He,document.getElementById("run-scrim").onclick=e=>{e.target.id==="run-scrim"&&He()},document.getElementById("run-go").onclick=()=>{const e=ot,t=document.getElementById("run-only-blanks").checked,s=parseInt(document.getElementById("run-workers-input").value,10);if(He(),!e)return;const n={};t&&(n.only_blanks=!0),s>0&&(n.workers=s),Xe(e,n)},document.getElementById("btn-ingest").onclick=()=>document.getElementById("csv-file").click(),document.getElementById("btn-add").onclick=yn;const Bn={add:{title:"Add data",intro:"Two ways to get companies and jobs into scout.",items:[{name:"Ingest CSV",sec:"ingest",desc:"Bulk-import companies from a CSV export (e.g. Crunchbase). Columns are mapped to company fields and new rows are created."},{name:"Add",sec:"ingest",desc:"Add one company or job from its link. Tick “fill in the blanks” to let an ATS API (ashby/greenhouse/lever) or one cheap agent pass complete the details."}]},run:{title:"Run the pipeline",intro:"Enrich must run before Verdict — verdict only scores companies that already have a successful enrichment row.",items:[{name:"Enrich",sec:"enrich",desc:"Fetches and summarizes each company's web presence into an enrichment row. A prerequisite for Verdict."},{name:"Verdict",sec:"verdict",desc:"Scores each enriched company against your criteria with the LLM, producing a yes / maybe / no with reasoning."}]}};function os(e){const t=Bn[e];if(!t)return;document.getElementById("help-title").textContent=t.title;const s=document.getElementById("help-items");if(s.innerHTML="",t.intro){const n=document.createElement("p");n.className="help-intro",n.textContent=t.intro,s.appendChild(n)}t.items.forEach(n=>{const a=document.createElement("div");a.className="help-item";const o=document.createElement("div");o.className="help-item-name",o.textContent=n.name;const c=document.createElement("div");c.className="help-item-desc",c.textContent=n.desc;const l=document.createElement("a");l.className="help-link",l.textContent="Learn more →",l.onclick=()=>{Pe(),ds(),Nn(n.sec)},a.appendChild(o),a.appendChild(c),a.appendChild(l),s.appendChild(a)}),document.getElementById("help-scrim").classList.add("open")}function Pe(){document.getElementById("help-scrim").classList.remove("open")}document.getElementById("help-add").onclick=()=>os("add"),document.getElementById("help-run").onclick=()=>os("run"),document.getElementById("help-close").onclick=Pe,document.getElementById("help-scrim").onclick=e=>{e.target.id==="help-scrim"&&Pe()},document.getElementById("add-cancel").onclick=je,document.getElementById("add-save").onclick=ss,document.getElementById("add-scrim").onclick=e=>{e.target.id==="add-scrim"&&je()},document.querySelectorAll("#add-kind .v-chip").forEach(e=>{e.onclick=()=>Qt(e.dataset.kind)}),document.getElementById("add-enrich").addEventListener("change",Zt),document.getElementById("add-scrim").addEventListener("keydown",e=>{e.key==="Enter"&&(e.target.tagName!=="INPUT"||e.target.type==="checkbox"||e.target.id==="add-vertical-filter"||e.target.id==="add-job-company"||(e.preventDefault(),ss()))}),document.getElementById("add-vertical-filter").addEventListener("input",Xt),document.getElementById("add-headcount").addEventListener("input",e=>{const t=e.target.value.replace(/[^0-9]/g,"");t!==e.target.value&&(e.target.value=t)}),document.getElementById("csv-file").onchange=e=>{const t=e.target.files&&e.target.files[0];t&&gn(t),e.target.value=""},document.getElementById("drawer-cancel").onclick=bn,document.getElementById("drawer-close").onclick=()=>document.getElementById("drawer").classList.remove("open"),document.getElementById("editor-cancel").onclick=Ae,document.getElementById("editor-save").onclick=In,document.getElementById("editor-reset").onclick=xn,document.getElementById("editor-scrim").onclick=e=>{e.target.id==="editor-scrim"&&Ae()},document.getElementById("sources-close").onclick=nt,document.getElementById("sources-scrim").onclick=e=>{e.target.id==="sources-scrim"&&nt()},document.getElementById("sources-refresh-btn").onclick=En,document.getElementById("key-cancel").onclick=ut,document.getElementById("key-save").onclick=cs,document.getElementById("key-remove").onclick=Hn,document.getElementById("key-scrim").onclick=e=>{e.target.id==="key-scrim"&&ut()},document.getElementById("key-input").addEventListener("keydown",e=>{e.key==="Enter"&&(e.preventDefault(),cs())}),document.getElementById("relink-cancel").onclick=ae,document.getElementById("relink-scrim").onclick=e=>{e.target.id==="relink-scrim"&&ae()},document.getElementById("relink-search").addEventListener("input",e=>{Ot(e.target.value)}),document.getElementById("relink-search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const t=document.querySelector("#relink-results .relink-result:not([disabled])");t&&qt(t.dataset.id)}}),document.getElementById("relink-results").addEventListener("click",e=>{const t=e.target.closest(".relink-result");t&&!t.disabled&&qt(t.dataset.id)});function it(e){if(e==null)return"—";let t=Math.max(0,e|0);if(t<90)return`${t}s ago`;const s=Math.round(t/60);if(s<90)return`${s}m ago`;const n=Math.round(s/60);return n<48?`${n}h ago`:`${Math.round(n/24)}d ago`}async function rt(){try{const e=await fetch("/api/profile");if(!e.ok)throw new Error(`HTTP ${e.status}`);i.profile=await e.json()}catch{i.profile=null}D()}const G='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.6 2.4a1.2 1.2 0 0 1 1.7 1.7L5.6 11.8l-3 1 1-3z"/><path d="M10.4 3.6l2 2"/></svg>',ge='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 8a5.4 5.4 0 1 1-1.5-3.8"/><path d="M13.6 2.6V5.2H11"/></svg>',Ln='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="11" r="2.6"/><path d="M6.9 9.1 13 3M11 5l1.6 1.6M9.3 6.7l1.6 1.6"/></svg>',is='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="2.4"/></svg>',Tn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.2h7.2a1.6 1.6 0 0 1 1.6 1.6v8H4.6A1.6 1.6 0 0 1 3 11.2z"/><path d="M11.8 12.8h1.4v-9A1.6 1.6 0 0 0 11.6 2.4H5.4"/><path d="M5.4 5.8h3.6M5.4 8.2h3.6"/></svg>',Cn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3.5" width="12" height="9" rx="1.6"/><path d="M2.6 4.6 8 8.8l5.4-4.2"/></svg>',ct='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.2h5.4l2.6 2.6v9H4z"/><path d="M9.4 2.2v2.6H12"/><path d="M6 7h4M6 9.2h4M6 11.4h2.4"/></svg>',Sn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.6v2M8 12.4v2M14.4 8h-2M3.6 8h-2M12.5 3.5 11 5M5 11l-1.5 1.5M12.5 12.5 11 11M5 5 3.5 3.5"/><circle cx="8" cy="8" r="2.2"/></svg>',jn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.4 3.4h11.2L9.4 8.4v4.2l-2.8 1.4V8.4z"/></svg>';function q(e){const t=e.dot||e.note?`<div class="crit-status">${e.dot?`<span class="pf-dot ${e.dot}"></span>`:""}${e.note?`<span class="crit-note-t">${r(e.note)}</span>`:""}</div>`:"",s=e.actID?` id="${e.actID}"`:"";return`<div class="settings-item">
    <span class="settings-item-icon">${e.icon}</span>
    <div class="settings-item-main">
      <div class="settings-item-name">${e.nameHTML}</div>
      <div class="settings-item-desc">${r(e.desc)}</div>
      ${t}
    </div>
    <button class="crit-edit"${s} data-act="${e.act}" title="${e.actTitle}" aria-label="${e.actLabel}">${e.actIcon}</button>
  </div>`}function D(){const e=document.getElementById("criteria-stats");if(!e)return;const t=i.profile,n=(t&&t.active_source||i.stats&&i.stats.taste_source||"").startsWith("brain:"),a=t&&typeof t.body=="string";let o;if(n){let I="off",L="";const ve=t&&t.criteria_state;ve==="current"?(I="ok",L="current · verified "+it(t.verified_age_seconds)):ve==="changed"?(I="warn",L="changed — re-distill"):ve==="unverified"?(I="warn",L=t&&!t.reachable&&a?"brain offline · using cache":"unverified — re-distill"):t&&!t.reachable&&a?(I="warn",L="brain offline · using cache"):a&&(I="ok",L="fetched "+it(t.age_seconds)),o=q({icon:is,nameHTML:a?'<span class="edit-link" data-act="view-profile" title="view the company-fit brief">company-fit brief</span>':"company-fit brief",dot:I,note:L,desc:"The criteria scout feeds the verdict stage — distilled from the brain.",act:"refresh-profile",actID:"refresh-profile",actIcon:ge,actTitle:"re-distill the company-fit brief from the brain",actLabel:"refresh company-fit brief"})}else o=q({icon:is,nameHTML:'<span class="edit-link" data-act="edit-taste" title="edit taste.md">taste</span>',note:t&&t.configured?"brain offline — local fallback":"",dot:t&&t.configured?"warn":"",desc:"Local fallback criteria used when the brain is unreachable.",act:"edit-taste",actIcon:G,actTitle:"edit taste.md",actLabel:"edit taste"});const c=i.sources&&i.sources.sources||[],l=c.filter(I=>I.need==="experience").length,u=c.filter(I=>I.need==="voice").length;let d="off",m="not discovered yet — refresh from the brain";l>0?(d="ok",m=`${l} experience · ${u} voice`):c.length>0&&(d="warn",m="no experience yet — refresh");const f=c.length?'<span class="edit-link" data-act="view-sources" title="view discovered experience + voice">outreach knowledge</span>':"outreach knowledge",y=q({icon:Sn,nameHTML:f,dot:d,note:m,desc:"Your experience + voice, discovered from the brain to ground outreach.",act:"refresh-sources",actID:"refresh-sources",actIcon:ge,actTitle:"re-discover experience + voice from the brain",actLabel:"refresh outreach knowledge"}),B=q({icon:Tn,nameHTML:'<span class="edit-link" data-act="edit-playbook" title="edit the verdict playbook">playbook</span>',desc:"How scout judges — the reasoning rules behind every verdict.",act:"edit-playbook",actIcon:G,actTitle:"edit the verdict playbook",actLabel:"edit playbook"}),A=q({icon:Cn,nameHTML:'<span class="edit-link" data-act="edit-template" title="edit the outreach email template">email template</span>',desc:"The outreach email format — verbatim prose with fill-in holes.",act:"edit-template",actIcon:G,actTitle:"edit the outreach email template",actLabel:"edit email template"}),V=[["researcher","1 · Researcher","Searches the web for true company facts and the best hooks to open with."],["fill","2 · Writer","Writes the email's blanks from the research, your experience, and your voice."],["humanizer","3 · Humanizer","Strips AI tells and matches your voice — never changes a fact."],["honesty","4 · Honesty check","Vetoes any claim about you beyond your documented experience."]],x=V.map(([I,L,ve])=>q({icon:ct,nameHTML:`<span class="edit-link" data-act="edit-prompt-${I}" title="edit the ${L.replace(/^\d+ · /,"")} prompt">${L}</span>`,desc:ve,act:`edit-prompt-${I}`,actIcon:G,actTitle:`edit the ${L} prompt`,actLabel:`edit ${L} prompt`})).join(""),U=!i.stats||i.stats.taste_filter_enabled!==!1,k=q({icon:jn,nameHTML:'<span class="edit-link" data-act="edit-taste-filter" title="edit the pre-filter rules">pre-filter</span>',desc:"Cheap mechanical gate before the LLM verdict — location, headcount, vertical, stage. Toggle it off in the editor to score every company.",dot:U?"ok":"off",note:U?"active":"disabled — scoring everything",act:"edit-taste-filter",actIcon:G,actTitle:"edit the pre-filter rules",actLabel:"edit pre-filter rules"}),Q=i.anthropicKey;let yt="off",bt="not set — verdict, capture & outreach disabled";Q&&Q.key_source==="db"?(yt="ok",bt="set here · active"):Q&&Q.key_source==="env"&&(yt="ok",bt="from the environment");const Fn=q({icon:Ln,nameHTML:'<span class="edit-link" data-act="edit-anthropic-key" title="set the Anthropic API key">Anthropic API key</span>',dot:yt,note:bt,desc:"Powers scoring, capture & outreach. Set here to run scout without the env var.",act:"edit-anthropic-key",actIcon:G,actTitle:"set the Anthropic API key",actLabel:"set Anthropic API key"}),Kn=q({icon:ct,nameHTML:'<span class="edit-link" data-act="edit-application-stages" title="edit the application stages">application stages</span>',desc:"The application pipeline labels you track (applied, screening, interview…). One per line.",act:"edit-application-stages",actIcon:G,actTitle:"edit the application stages",actLabel:"edit application stages"}),Wn=q({icon:ct,nameHTML:'<span class="edit-link" data-act="edit-outreach-statuses" title="edit the outreach statuses">outreach statuses</span>',desc:"The outreach reply labels (initial contact, no response, replied…). One per line.",act:"edit-outreach-statuses",actIcon:G,actTitle:"edit the outreach statuses",actLabel:"edit outreach statuses"});e.innerHTML=`<div class="settings-section">
       <div class="settings-group-h">Job hunting</div>
       ${o}${B}${k}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Tracking</div>
       ${Kn}${Wn}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Outreach</div>
       ${y}${A}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Outreach pipeline</div>
       ${x}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Integrations</div>
       ${Fn}
     </div>`;const wt={"view-profile":()=>On(i.profile),"refresh-profile":Pn,"edit-taste":()=>Y("taste"),"edit-taste-filter":()=>Y("taste-filter"),"edit-application-stages":()=>Y("application-stages"),"edit-outreach-statuses":()=>Y("outreach-statuses"),"edit-playbook":()=>Y("playbook"),"edit-template":()=>Y("outreach-template"),"view-sources":st,"refresh-sources":Mn,"edit-anthropic-key":An};for(const[I]of V)wt[`edit-prompt-${I}`]=()=>Y(`outreach-prompts/${I}`);e.querySelectorAll("[data-act]").forEach(I=>{const L=I.dataset.act;L&&wt[L]&&(I.onclick=wt[L])})}async function dt(){try{i.sources=await(await fetch("/api/outreach/sources")).json()}catch{i.sources=null}D()}async function Mn(){const e=document.getElementById("refresh-sources");e&&(e.classList.add("spinning"),e.disabled=!0);let t;try{t=await fetch("/api/outreach/sources/refresh",{method:"POST"})}catch(n){p(`refresh failed: ${n.message}`),dt();return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();p(`refresh failed: ${n||"HTTP "+t.status}`),dt();return}const s=await t.json();s.warning?p(s.warning):p("outreach knowledge refreshed"),i.sources={sources:s.sources||[],needs:i.sources&&i.sources.needs||[]},D()}async function rs(){try{i.anthropicKey=await(await fetch("/api/integrations/anthropic")).json()}catch{i.anthropicKey=null}D()}async function An(){document.getElementById("key-scrim").classList.add("open"),document.getElementById("key-input").value="",await rs(),lt();const e=document.getElementById("key-input");e&&e.focus()}function lt(){const e=i.anthropicKey||{},t=document.getElementById("key-status");t&&(t.textContent=e.key_source==="db"?"A key is set here (stored in scout).":e.key_source==="env"?"Using the ANTHROPIC_API_KEY environment variable. Saving a key here overrides it.":"No key set. Scoring, capture, and outreach are disabled until you add one.");const s=document.getElementById("key-remove");s&&(s.style.display=e.key_source==="db"?"":"none");const n=document.getElementById("key-restart-hint");if(n){const a=e.has_key&&i.meta&&(i.meta.outreach===!1||i.meta.chat===!1);n.style.display=a?"":"none"}}function ut(){document.getElementById("key-scrim").classList.remove("open")}async function cs(){const e=(document.getElementById("key-input").value||"").trim();if(!e){p("paste a key first");return}const t=document.getElementById("key-save");t&&(t.disabled=!0,t.textContent="Verifying…");const s=()=>{t&&(t.disabled=!1,t.textContent="Save key")};let n;try{n=await fetch("/api/integrations/anthropic",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:e})})}catch(a){p(`save failed: ${a.message}`),s();return}if(!n.ok){p((await n.text().catch(()=>"")).trim()||`HTTP ${n.status}`),s();return}i.anthropicKey=await n.json(),document.getElementById("key-input").value="",s(),p("Anthropic key saved"),await Qe(),lt(),D()}async function Hn(){const e=document.getElementById("key-remove");e&&(e.disabled=!0);let t;try{t=await fetch("/api/integrations/anthropic",{method:"DELETE"})}catch(s){p(`remove failed: ${s.message}`),e&&(e.disabled=!1);return}if(e&&(e.disabled=!1),!t.ok){p((await t.text().catch(()=>"")).trim()||`HTTP ${t.status}`);return}i.anthropicKey=await t.json(),p(i.anthropicKey.has_key?"removed — using the environment key":"Anthropic key removed"),await Qe(),lt(),D()}async function Pn(){const e=document.getElementById("refresh-profile");e&&(e.classList.add("spinning"),e.disabled=!0);let t;try{t=await fetch("/api/profile/refresh",{method:"POST"})}catch(s){p(`refresh failed: ${s.message}`),rt();return}if(!t.ok){const s=await t.text().catch(()=>"");p(`refresh failed: ${(s||"").trim()||"HTTP "+t.status}`),rt();return}i.profile=await t.json(),D(),p("company-fit brief refreshed"),w()}function On(e){!e||typeof e.body!="string"||(document.getElementById("profile-modal-meta").textContent=`${e.chars||0} chars · fetched ${it(e.age_seconds)}`,document.getElementById("profile-modal-body").textContent=e.body,document.getElementById("profile-scrim").classList.add("open"))}function pt(){document.getElementById("profile-scrim").classList.remove("open")}document.getElementById("profile-modal-close").onclick=pt,document.getElementById("profile-scrim").onclick=e=>{e.target.id==="profile-scrim"&&pt()};function ds(){document.getElementById("docs-scrim").classList.add("open");const e=document.querySelector("#docs-nav a");Oe(e?e.dataset.sec:null);const t=document.getElementById("docs-body");t&&(t.scrollTop=0)}function ht(){document.getElementById("docs-scrim").classList.remove("open")}function qn(){return document.getElementById("docs-scrim").classList.contains("open")}function Oe(e){document.querySelectorAll("#docs-nav a").forEach(t=>t.classList.toggle("active",t.dataset.sec===e))}function Nn(e){const t=document.getElementById("doc-"+e);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),Oe(e)}document.getElementById("open-docs").onclick=ds,document.getElementById("docs-close").onclick=ht,document.getElementById("docs-scrim").onclick=e=>{e.target.id==="docs-scrim"&&ht()};function Rn(){document.getElementById("settings-scrim").classList.add("open"),D()}function mt(){document.getElementById("settings-scrim").classList.remove("open")}document.getElementById("open-settings").onclick=Rn,document.getElementById("settings-close").onclick=mt,document.getElementById("settings-scrim").onclick=e=>{e.target.id==="settings-scrim"&&mt()},document.querySelectorAll("#docs-nav a").forEach(e=>{e.onclick=()=>{const t=document.getElementById("doc-"+e.dataset.sec);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),Oe(e.dataset.sec)}}),function(){const e=document.getElementById("docs-body");if(!e||!("IntersectionObserver"in window))return;const t=new IntersectionObserver(s=>{const n=s.filter(a=>a.isIntersecting).sort((a,o)=>a.boundingClientRect.top-o.boundingClientRect.top);n.length&&Oe(n[0].target.id.replace(/^doc-/,""))},{root:e,rootMargin:"0px 0px -65% 0px",threshold:0});document.querySelectorAll("#docs-body section").forEach(s=>t.observe(s))}(),i.chat={scope:null,scopeId:"",threadId:null,streaming:!1,es:null};function Dn(e){return(e||[]).filter(t=>t&&t.type==="text").map(t=>t.text||"").join("")}function Vn(e){return(e||[]).filter(t=>t&&t.type==="tool_use").map(t=>t.name)}function qe(e,t){const s=document.createElement("div");return s.className="chat-msg chat-"+e,s.textContent=t||"",s}function ft(){const e=document.getElementById("chat-messages");e.scrollTop=e.scrollHeight}function Un(){const e=document.createElement("div");return e.className="chat-empty",e.textContent=i.chat.scope==="global"?"Tell me about a job you applied to (paste the link), or ask what's already tracked.":"Ask about this "+(i.chat.scope==="company"?"company":"role")+" — I can research it on the web and update scout.",e}function ls(e){const t=document.getElementById("chat-messages");t.innerHTML="";for(const s of e||[]){const n=Dn(s.content);if(s.role==="user")n&&t.appendChild(qe("user",n));else if(s.role==="assistant"){const a=Vn(s.content);if(!n&&!a.length)continue;const o=qe("assistant",n);if(a.length){const c=document.createElement("div");c.className="chat-tools",c.textContent="· used "+a.join(", "),o.appendChild(c)}t.appendChild(o)}}t.children.length||t.appendChild(Un()),ft()}async function gt(e,t,s){if(!i.meta||!i.meta.chat){p("chat needs ANTHROPIC_API_KEY in the server env");return}i.chat.es&&(i.chat.es.close(),i.chat.es=null),i.chat={scope:e,scopeId:t||"",threadId:null,streaming:!1,es:null},document.getElementById("chat-title").textContent=e==="global"?"Chat":e==="company"?"Chat · company":"Chat · role",document.getElementById("chat-sub").textContent=e==="global"?"":s||"";const n=document.getElementById("chat-messages");n.innerHTML='<div class="chat-empty">loading…</div>';const a=document.getElementById("chat-pane");a.classList.add("open"),document.getElementById("chat-scrim").classList.add("open"),a.setAttribute("aria-hidden","false");try{const o="scope="+encodeURIComponent(e)+(t?"&scope_id="+encodeURIComponent(t):""),c=await fetch("/api/chat/threads?"+o);if(!c.ok)throw new Error((await c.text().catch(()=>"")).trim()||"HTTP "+c.status);const l=await c.json();i.chat.threadId=l.thread.id,ls(l.messages||[])}catch(o){n.innerHTML='<div class="chat-empty">Failed to open chat: '+r(o.message)+"</div>";return}document.getElementById("chat-input").focus()}function vt(){i.chat.es&&(i.chat.es.close(),i.chat.es=null);const e=document.getElementById("chat-pane");e.classList.remove("open"),document.getElementById("chat-scrim").classList.remove("open"),e.setAttribute("aria-hidden","true")}function Ne(e){i.chat.streaming=e,document.getElementById("chat-send").disabled=e;const t=document.getElementById("chat-input");t.disabled=e,e||t.focus()}function us(){const e=document.getElementById("chat-input");e.style.height="auto",e.style.height=Math.min(e.scrollHeight,160)+"px"}async function ps(){const e=document.getElementById("chat-input"),t=e.value.trim();if(!t||i.chat.streaming||!i.chat.threadId)return;e.value="",us(),Ne(!0);const s=document.getElementById("chat-messages"),n=s.querySelector(".chat-empty");n&&n.remove(),s.appendChild(qe("user",t));const a=qe("assistant","");a.classList.add("chat-streaming"),s.appendChild(a),ft();let o="";const c=m=>{a.classList.remove("chat-streaming"),a.textContent="⚠ "+m,Ne(!1)},l=i.chat.threadId;let u;try{u=await fetch("/api/chat/"+l+"/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t})})}catch(m){c(m.message);return}if(!u.ok){c((await u.text().catch(()=>"")).trim()||"HTTP "+u.status);return}const d=new EventSource("/api/chat/"+l+"/stream");i.chat.es=d,d.addEventListener("delta",m=>{o+=m.data,a.textContent=o,ft()}),d.addEventListener("end",async m=>{d.close(),i.chat.es===d&&(i.chat.es=null),a.classList.remove("chat-streaming"),Ne(!1),i.chat.threadId===l&&await Jn(),zn(),typeof m.data=="string"&&m.data.indexOf("error")===0&&p("chat: "+m.data)}),d.onerror=()=>{d.close(),i.chat.es===d&&(i.chat.es=null),a.classList.remove("chat-streaming"),Ne(!1)}}async function Jn(){const e=i.chat.scope,t=i.chat.scopeId,s="scope="+encodeURIComponent(e)+(t?"&scope_id="+encodeURIComponent(t):"");try{const n=await fetch("/api/chat/threads?"+s);if(!n.ok)return;const a=await n.json();ls(a.messages||[])}catch{}}function zn(){_(),E(),w(),i.openId&&he(i.openId)}document.getElementById("open-chat").onclick=()=>gt("global","",""),document.getElementById("chat-close").onclick=vt,document.getElementById("chat-scrim").onclick=vt,document.getElementById("chat-form").addEventListener("submit",e=>{e.preventDefault(),ps()}),document.getElementById("chat-input").addEventListener("input",us),document.getElementById("chat-input").addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),ps())}),Bt("#t tbody",fs),Bt("#jt tbody",gs),_(),E(),w(),Qe(),Ze(),rt(),dt(),rs(),re()}Qn({"":{view:()=>({mount(b){b.innerHTML=sa,na()}}),chrome:!1}},{title:"scout"});ea();ta();
