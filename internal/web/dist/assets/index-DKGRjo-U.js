(function(){const v=document.createElement("link").relList;if(v&&v.supports&&v.supports("modulepreload"))return;for(const y of document.querySelectorAll('link[rel="modulepreload"]'))i(y);new MutationObserver(y=>{for(const k of y)if(k.type==="childList")for(const c of k.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&i(c)}).observe(document,{childList:!0,subtree:!0});function w(y){const k={};return y.integrity&&(k.integrity=y.integrity),y.referrerPolicy&&(k.referrerPolicy=y.referrerPolicy),y.crossOrigin==="use-credentials"?k.credentials="include":y.crossOrigin==="anonymous"?k.credentials="omit":k.credentials="same-origin",k}function i(y){if(y.ep)return;y.ep=!0;const k=w(y);fetch(y.href,k)}})();function Ba(b,v){const w=v.replace(/^#/,"");let i=null;for(const y of Object.keys(b))(w===y||w.startsWith(y))&&(i===null||y.length>i.length)&&(i=y);return i===null&&""in b&&(i=""),i}function La(b){return typeof b=="function"?{view:b,chrome:!0}:{view:b.view,chrome:b.chrome!==!1}}function Ta(b,v={}){const w=v.root??document.body,i=v.title??document.title??"",y=v.brandHref??"#",k=document.createElement("main"),c=document.createElement("header");c.className="cap-head";const _=document.createElement("a");_.className="brand",_.href=y,_.textContent=i,_.setAttribute("aria-label",`${i} — home`),c.appendChild(_);const j=document.createElement("nav");j.className="cap-nav",j.setAttribute("aria-label","Views");for(const L of v.nav??[]){const M=document.createElement("a");M.href=L.href,M.textContent=L.label,L.ariaLabel&&M.setAttribute("aria-label",L.ariaLabel),j.appendChild(M)}c.appendChild(j);const E=document.createElement("section");E.className="tk-content",k.appendChild(c),k.appendChild(E);const H=document.createElement("div");H.className="tk-bleed";const ne=L=>{var M;for(const B of Array.from(j.querySelectorAll("a"))){const se=((M=B.getAttribute("href"))==null?void 0:M.replace(/^#/,""))??"";B.toggleAttribute("aria-current",L!==null&&L!==""&&se===L),B.hasAttribute("aria-current")&&B.setAttribute("aria-current","page")}};let ye=0;const Le=()=>{const L=Ba(b,location.hash);if(ne(L),L===null){H.isConnected&&H.remove(),k.isConnected||w.appendChild(k),Ca(E,"Not found.");return}const{view:M,chrome:B}=La(b[L]),se=B?E:H;B?(H.isConnected&&H.remove(),k.isConnected||w.appendChild(k)):(k.isConnected&&k.remove(),H.isConnected||w.appendChild(H)),se.replaceChildren();const Ke=M(),Te=++ye,ge=Ke.mount(se);ge instanceof Promise&&ge.catch(O=>{Te===ye&&Sa(se,String(O))})};window.addEventListener("hashchange",Le),Le()}function Ca(b,v){b.replaceChildren();const w=document.createElement("div");w.className="tk-empty",w.textContent=v,b.appendChild(w)}function Sa(b,v){b.replaceChildren();const w=document.createElement("div");w.className="tk-error",w.textContent=v,b.appendChild(w)}function ja(){if(!("serviceWorker"in navigator))return;if(["localhost","127.0.0.1","[::1]",""].includes(location.hostname)){navigator.serviceWorker.getRegistrations().then(v=>{for(const w of v)w.unregister()}),window.caches&&caches.keys().then(v=>{for(const w of v)caches.delete(w)});return}window.addEventListener("load",()=>{navigator.serviceWorker.register("/sw.js").catch(()=>{})})}async function Ma(){let b;try{b=await fetch("/api/me",{headers:{Accept:"application/json"}})}catch{return null}if(!b.ok)return null;let v;try{v=await b.json()}catch{return null}return typeof v.email=="string"&&v.email?{email:v.email}:null}const Aa=`
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
    <div class="filter-row">
      <div class="search-wrap">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14" stroke-linecap="round"/></svg>
        <input id="q" placeholder="search name, vertical, reason…">
      </div>
    </div>
    <div class="filter-row">
      <div class="filter-dropdowns">
        <div class="fdrop" id="fdrop-cfilters">
          <button class="fdrop-btn" id="fdrop-cfilters-btn" aria-haspopup="true" aria-expanded="false" title="filter companies">
            <svg class="fdrop-lead" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4h12M4 8h8M6 12h4"/></svg>
            <span class="fdrop-label-txt">Filters</span>
            <span class="fdrop-count" style="display:none"></span>
            <svg class="fdrop-chev" viewBox="0 0 10 6" aria-hidden="true"><path d="M0 0l5 6 5-6z" fill="currentColor"/></svg>
          </button>
          <div class="fdrop-menu" id="fdrop-cfilters-menu" role="menu"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="block" id="block-filter-jobs" style="display:none">
    <div class="filter-row">
      <div class="search-wrap">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14" stroke-linecap="round"/></svg>
        <input id="jq" placeholder="search title, company, contacts…">
      </div>
    </div>
    <div class="filter-row">
      <div class="filter-dropdowns">
        <div class="fdrop" id="fdrop-jfilters">
          <button class="fdrop-btn" id="fdrop-jfilters-btn" aria-haspopup="true" aria-expanded="false" title="filter jobs">
            <svg class="fdrop-lead" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4h12M4 8h8M6 12h4"/></svg>
            <span class="fdrop-label-txt">Filters</span>
            <span class="fdrop-count" style="display:none"></span>
            <svg class="fdrop-chev" viewBox="0 0 10 6" aria-hidden="true"><path d="M0 0l5 6 5-6z" fill="currentColor"/></svg>
          </button>
          <div class="fdrop-menu" id="fdrop-jfilters-menu" role="menu"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="block" id="block-columns">
    <div class="filter-dropdowns">
      <div class="fdrop" id="fdrop-columns">
        <button class="fdrop-btn" id="fdrop-columns-btn" aria-haspopup="true" aria-expanded="false" title="show or hide table columns">
          <svg class="fdrop-lead" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 3v10M6.5 3v10M10.5 3v10M14 3v10" stroke-linejoin="round"/></svg>
          <span class="fdrop-label-txt">Columns</span>
          <span class="fdrop-count fdrop-count--muted" style="display:none"></span>
          <svg class="fdrop-chev" viewBox="0 0 10 6" aria-hidden="true"><path d="M0 0l5 6 5-6z" fill="currentColor"/></svg>
        </button>
        <div class="fdrop-menu" id="fdrop-columns-menu" role="menu"></div>
      </div>
    </div>
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
    <div id="jobs-followup-banner" class="followup-banner" style="display:none"></div>
    <table id="jt">
      <thead>
        <tr>
          <th data-jk="company">role · company</th>
          <th data-jk="application" data-col="application">application</th>
          <th data-jk="followups_due" data-col="outreach">outreach</th>
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
        <span>Synced automatically from your brain — an LLM over the document map picks the pages for each need: <strong>experience</strong> (required — the honesty checker's ground truth), <strong>voice</strong> (optional), and <strong>logistics</strong> (optional — current location, work authorization, availability, comp: the only source application answers may state these from; without it those facts fall back to fill-in placeholders). Scout re-syncs whenever your brain changes; this is a read-only view of what it resolved. To change it, edit the pages in your brain.</span>
      </div>
    </div>
    <div class="modal-foot">
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

<!-- delete a company — irreversible, spells out what goes with it -->
<div class="modal-scrim" id="delcompany-scrim">
  <div class="modal" style="width:460px">
    <div class="modal-head">
      <h2>Delete company?</h2>
    </div>
    <div class="modal-body">
      <p id="delcompany-summary" style="margin:0; font-size:14px; line-height:1.5;"></p>
      <div class="modal-note modal-note-danger">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.5 1 14h14L8 1.5z" stroke-linejoin="round"/><path d="M8 6.5v3.5M8 11.8v.4" stroke-linecap="round"/></svg>
        <span>This permanently removes the company and everything attached to it — its job postings, outreach drafts, application answers, enrichment, verdict, and decision trail. It can't be undone.</span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="delcompany-cancel">Cancel</button>
      <button class="btn btn-danger" id="delcompany-confirm">Delete</button>
    </div>
  </div>
</div>

<!-- delete a job posting — irreversible, mirrors the company delete modal -->
<div class="modal-scrim" id="deljob-scrim">
  <div class="modal" style="width:460px">
    <div class="modal-head">
      <h2>Delete job?</h2>
    </div>
    <div class="modal-body">
      <p id="deljob-summary" style="margin:0; font-size:14px; line-height:1.5;"></p>
      <div class="modal-note modal-note-danger">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.5 1 14h14L8 1.5z" stroke-linejoin="round"/><path d="M8 6.5v3.5M8 11.8v.4" stroke-linecap="round"/></svg>
        <span>This permanently removes the job posting and everything attached to it — its outreach drafts and application answers. The company stays. It can't be undone.</span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="deljob-cancel">Cancel</button>
      <button class="btn btn-danger" id="deljob-confirm">Delete</button>
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
                <div class="sm-desc">An LLM picks your experience, voice, and logistics pages off the brain's map; they're fetched whole and cached.</div>
              </div>
              <div class="sm-arrow"></div>
              <div class="sm-arrow"></div>
              <div class="sm-node sm-brainy">
                <div class="sm-name">company-fit brief</div>
                <div class="sm-desc">The criteria the verdict stage reads — cached locally. If the brain is unreachable, taste.md stands in.</div>
              </div>
              <div class="sm-node sm-brainy">
                <div class="sm-name">outreach knowledge</div>
                <div class="sm-desc">Your experience, voice + logistics — the ground truth every draft is honesty-checked against.</div>
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
          <p>The <strong>jobs</strong> tab is the application tracker: one row per saved posting, showing the company plus the lifecycle — <strong>applied</strong> (date), <strong>response</strong> (screening call / interview / offer / rejected), <strong>outreach count</strong>, <strong>last outreach</strong>, and <strong>contacts</strong> (emails render as mailto links). Clicking a row opens the <strong>pursuit panel</strong> — the one place all per-posting editing lives: the pipeline (applied toggle + date, response select, a <strong>next up</strong> queue mark), the outreach section (a "+1 outreach" logger for messages sent outside scout, contacts, and the draft queue), and a View company button. <em>Next up</em> is a to-do, not a status: mark the pursuits you intend to reach out to, filter the table by the chip, and the mark clears itself when you log a +1 outreach (or unmark it yourself). The company pane's jobs list shows the same status read-only; click a card to jump to its pursuit. Rejected rows are hidden from the jobs table by default — the footer note says how many, with a one-click show.</p>
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
`;function Ha(b){const v={k:"verdict",dir:1},w={k:"created_at",dir:1},i={rows:[],sort:{...v},openId:null,stats:null,profile:null,view:"companies",jobs:[],jsort:{...w},applicationStages:["applied","screening","interview","offer","rejected"],outreachStatuses:["initial contact","no response","replied","followed up"],followupInterval:5,followupTemplate:"",openDetail:null,anthropicKey:null},y=e=>"pill pill-"+(e||"none"),k='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 14V2.5"/><path d="M3.5 2.5c3-1.2 6 1.2 9 0V9c-3 1.2-6-1.2-9 0z"/></svg>',c=e=>String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),_=e=>/^https?:\/\//i.test(String(e??""))?c(e):"#";async function j(){const t=await(await fetch("/api/companies")).json();i.rows=t.rows||[],V()}async function E(){let e;try{const t=await fetch("/api/postings");if(!t.ok)return;e=await t.json()}catch{return}i.jobs=e.rows||[],T(),H(),ye()}function H(){if(!m.postingId)return;const e=i.jobs.find(t=>t.posting_id===m.postingId);e&&(m.row=e,document.getElementById("pursuit-pane").classList.contains("open")&&ae())}let ne=null;function ye(){const e=i.jobs.some(t=>t.outreach_draft_status==="researching");e&&!ne?ne=setInterval(Le,4e3):!e&&ne&&(clearInterval(ne),ne=null)}async function Le(){let e;try{const a=await fetch("/api/postings");if(!a.ok)return;e=await a.json()}catch{return}const t=e.rows||[],n=new Map(i.jobs.map(a=>[a.posting_id,a.outreach_draft_status])),s=t.some(a=>n.get(a.posting_id)!==a.outreach_draft_status)||t.length!==i.jobs.length;i.jobs=t,s&&(T(),H()),ye()}async function L(){await Promise.all([fetch("/api/application-stages").then(e=>e.ok?e.json():null).then(e=>{e&&Array.isArray(e.statuses)&&e.statuses.length&&(i.applicationStages=e.statuses)}).catch(()=>{}),fetch("/api/outreach-statuses").then(e=>e.ok?e.json():null).then(e=>{e&&Array.isArray(e.statuses)&&e.statuses.length&&(i.outreachStatuses=e.statuses)}).catch(()=>{}),fetch("/api/followup-interval").then(e=>e.ok?e.json():null).then(e=>{e&&Number.isInteger(e.days)&&(i.followupInterval=e.days)}).catch(()=>{}),fetch("/api/followup-template").then(e=>e.ok?e.json():null).then(e=>{e&&typeof e.content=="string"&&(i.followupTemplate=e.content)}).catch(()=>{})]),Rt(),i.view==="jobs"&&T()}function M(e,{render:t=!0}={}){i.view=e;try{localStorage.setItem("scout-view",e)}catch{}document.getElementById("tab-companies").classList.toggle("active",e==="companies"),document.getElementById("tab-jobs").classList.toggle("active",e==="jobs"),document.getElementById("companies-view").style.display=e==="companies"?"":"none",document.getElementById("jobs-view").style.display=e==="jobs"?"":"none",document.getElementById("block-filter-companies").style.display=e==="companies"?"":"none",document.getElementById("block-filter-jobs").style.display=e==="jobs"?"":"none",At(),t&&(e==="jobs"?T():V())}async function B(){let e;try{const t=await fetch("/api/stats");if(!t.ok)throw new Error(`HTTP ${t.status}`);e=await t.json()}catch(t){console.warn(`stats failed: ${t.message}`);return}i.stats=e,se()}function se(){ee()}function Ke(e,t,n){const s=e[n]??"",a=t[n]??"";if(n==="headcount")return(s|0)-(a|0);if(n==="verdict"){const o={yes:0,maybe:1,no:2,"":3};return(o[s]??3)-(o[a]??3)}return String(s).localeCompare(String(a))}function Te(e){return e.slice().sort((t,n)=>i.sort.dir*Ke(t,n,i.sort.k))}function ge(e,t,n){document.querySelectorAll(`#${e} thead th[${t}]`).forEach(s=>{s.getAttribute(t)===n.k?s.dataset.sort=n.dir<0?"desc":"asc":delete s.dataset.sort})}const O=new Set;let oe=!1,ie=!1;const Nn=[["yes","yes","fdrop-dot--yes"],["maybe","maybe","fdrop-dot--maybe"],["no","no","fdrop-dot--no"],["__none__","unscored","fdrop-dot--none"]];function Rn(){const e=document.getElementById("fdrop-cfilters-menu");e&&(e.innerHTML='<div class="fdrop-head">Verdict</div>'+Nn.map(([t,n,s])=>U("data-v",t,n,s,O.has(t))).join("")+'<div class="fdrop-sep"></div><div class="fdrop-head">Flags</div>'+U("data-toggle","flagged","⚑ Flagged","",oe)+U("data-toggle","enriched","Enriched","",ie),Tt())}function Tt(){const e={yes:0,maybe:0,no:0,__none__:0};let t=0,n=0;for(const r of i.rows){const l=r.verdict||"__none__";e[l]=(e[l]|0)+1,r.flagged&&t++,r.enriched&&n++}Ge("#fdrop-cfilters-menu [data-v]","data-v",e);const s=document.querySelector('#fdrop-cfilters-menu [data-toggle="flagged"] [data-count]');s&&(s.textContent=t||"");const a=document.querySelector('#fdrop-cfilters-menu [data-toggle="enriched"] [data-count]');a&&(a.textContent=n||"");const o=O.size+(oe?1:0)+(ie?1:0);Ut("fdrop-cfilters-btn",o,o>0)}function Ct(){const e=document.getElementById("q").value.trim().toLowerCase();return i.rows.filter(t=>!(O.size&&!O.has(t.verdict||"__none__")||oe&&!t.flagged||ie&&!t.enriched||e&&!(t.name+" "+(t.vertical||"")+" "+(t.reason||"")).toLowerCase().includes(e)))}const Dn=[{k:"flag",label:"flag"},{k:"verdict",label:"verdict"},{k:"reason",label:"reason"},{k:"vertical",label:"vertical"},{k:"location",label:"location"},{k:"hc",label:"hc"},{k:"stage",label:"stage"},{k:"reviewed",label:"reviewed"},{k:"site",label:"site"}],Vn=[{k:"application",label:"application"},{k:"outreach",label:"outreach"},{k:"last_outreach",label:"last outreach"},{k:"contacts",label:"contacts"},{k:"link",label:"link"}];function St(e){try{return new Set(JSON.parse(localStorage.getItem(e)||"[]"))}catch{return new Set}}const jt=St("scout-hidden-cols"),Mt=St("scout-hidden-jcols");function We(){return i.view==="jobs"?{cols:Vn,hidden:Mt,key:"scout-hidden-jcols"}:{cols:Dn,hidden:jt,key:"scout-hidden-cols"}}function ce(){document.querySelectorAll("#t [data-col]").forEach(e=>{e.style.display=jt.has(e.dataset.col)?"none":""}),document.querySelectorAll("#jt [data-col]").forEach(e=>{e.style.display=Mt.has(e.dataset.col)?"none":""})}function At(){const e=We(),t=document.getElementById("fdrop-columns-menu");t&&(t.innerHTML='<div class="fdrop-head">Visible columns</div>'+e.cols.map(n=>U("data-col",n.k,n.label,"",!e.hidden.has(n.k))).join(""),Ht())}function Ht(){const e=We(),t=e.cols.filter(s=>e.hidden.has(s.k)).length,n=document.querySelector("#fdrop-columns-btn .fdrop-count");n&&(n.textContent=t||"",n.style.display=t?"":"none")}function Pt(e){return`
      <td class="td-flag" data-col="flag"><button class="flag-btn${e.flagged?" is-on":""}" data-id="${e.company_id}" title="${e.flagged?"unflag":"flag"}">${k}</button></td>
      <td data-col="verdict"><span class="${y(e.verdict)}">${c(e.verdict||"—")}</span></td>
      <td><span class="row-name" data-id="${e.company_id}">${c(e.name)}</span></td>
      <td class="reason" data-col="reason">${c(e.reason||"")}</td>
      <td data-col="vertical">${c(e.vertical||"")}</td>
      <td data-col="location">${c(e.location||"")}</td>
      <td data-col="hc">${e.headcount||""}</td>
      <td data-col="stage">${c(e.stage||"")}</td>
      <td data-col="reviewed" class="muted" title="${c(e.reviewed_at||"never reviewed")}">${e.reviewed_at?c(e.reviewed_at.slice(0,10)):"—"}</td>
      <td data-col="site">${e.website_url?`<a href="${_(e.website_url)}" target="_blank" rel="noopener" title="open website" aria-label="open website">↗</a>`:""}</td>
    `}function qt(e){const t=e.querySelector(".flag-btn");t&&t.addEventListener("click",()=>gn(t.dataset.id))}const Un=[["flag","14px"],["verdict","46px"],[null,"62%"],["reason","85%"],["vertical","70%"],["location","60%"],["hc","26px"],["stage","55%"],["reviewed","44px"],["site","38px"]],zn=[[null,"72%"],["applied","58px"],["response","54px"],["outreach","22px"],["last_outreach","58px"],["contacts","55%"],["link","32px"]];function Ot(e,t,n=7){const s=document.querySelector(e);if(!s)return;const a=[1,.82,.7,.95,.76,.9,.85];let o="";for(let r=0;r<n;r++){const l=t.map(([p,u])=>{const h=u.endsWith("%")?Math.round(parseFloat(u)*a[r%a.length])+"%":u;return`<td${p?` data-col="${p}"`:""}><span class="skel" style="width:${h}"></span></td>`}).join("");o+=`<tr class="skel-row" aria-hidden="true">${l}</tr>`}s.innerHTML=o,ce()}function V(){const e=document.querySelector("#t tbody");e.innerHTML="";const t=Te(Ct());Tt(),document.getElementById("empty").style.display=t.length?"none":"block";for(const n of t){const s=document.createElement("tr");s.dataset.id=n.company_id,s.innerHTML=Pt(n),s.addEventListener("click",a=>{a.target.closest("a, .flag-btn")||he(s.dataset.id)}),e.appendChild(s),qt(s)}ge("t","data-k",i.sort),ce()}async function Fn(e){const n=await(await fetch("/api/companies")).json();i.rows=n.rows||[];const s=document.querySelector("#t tbody"),a=Te(Ct()).map(r=>r.company_id),o=[...s.querySelectorAll("tr")].map(r=>r.dataset.id);if(a.length!==o.length||a.some((r,l)=>r!==o[l])){V();return}for(const r of e){const l=i.rows.find(u=>u.company_id===r),p=s.querySelector(`tr[data-id="${CSS.escape(r)}"]`);if(!l||!p){V();return}p.innerHTML=Pt(l),qt(p)}ce()}let x=null,Ye=null,re=!1,le=!1,de=!1;const Y=new Set;function Nt(){const e=i.applicationStages;if(x===null)x=new Set(["",...e.filter(t=>t!=="rejected")]);else{for(const t of[...x])t!==""&&!e.includes(t)&&x.delete(t);if(Ye)for(const t of e)t!=="rejected"&&!Ye.has(t)&&x.add(t)}Ye=new Set(e)}function Jn(){Nt();const e=document.getElementById("jq").value.trim().toLowerCase();return i.jobs.filter(t=>{const n=t.application_status||"";return!(!x.has(n)||re&&!t.next_up||le&&(t.outreach_count|0)>0||de&&!(t.followups_due|0)||Y.size&&!Y.has(t.outreach_status||"")||e&&!(t.title+" "+t.company+" "+(t.location||"")+" "+(t.description||"")+" "+(t.contacts||"")).toLowerCase().includes(e))})}function U(e,t,n,s,a){return`<button class="fdrop-item${a?" is-checked":""}" ${e}="${c(t)}" role="menuitemcheckbox" aria-checked="${a}"><span class="fdrop-check" aria-hidden="true"></span>`+(s?`<span class="fdrop-dot ${s}"></span>`:"")+`<span class="fdrop-label">${c(n)}</span><span class="fdrop-item-count" data-count></span></button>`}function Rt(){Nt();const e=document.getElementById("fdrop-jfilters-menu");e&&(e.innerHTML='<div class="fdrop-head">Application stage</div>'+U("data-stage","","not applied","",x.has(""))+i.applicationStages.map(t=>U("data-stage",t,t,Ce(t),x.has(t))).join("")+'<div class="fdrop-sep"></div><div class="fdrop-head">Quick filters</div>'+U("data-toggle","nextup","★ Next up","",re)+U("data-toggle","notreached","Not reached out","",le)+'<div class="fdrop-sep"></div><div class="fdrop-head">Reply status</div>'+[["","none",""]].concat(i.outreachStatuses.map(t=>[t,t,Yt(t)])).map(([t,n,s])=>U("data-status",t,n,s,Y.has(t))).join(""),Dt())}function Dt(){const e={},t={};let n=0,s=0;for(const l of i.jobs){const p=l.application_status||"";e[p]=(e[p]|0)+1;const u=l.outreach_status||"";t[u]=(t[u]|0)+1,l.next_up&&n++,l.outreach_count|0||s++}Ge("#fdrop-jfilters-menu [data-stage]","data-stage",e),Ge("#fdrop-jfilters-menu [data-status]","data-status",t),Vt("nextup",n),Vt("notreached",s);const a=["",...i.applicationStages.filter(l=>l!=="rejected")],r=(x&&x.size===a.length&&a.every(l=>x.has(l))?0:x?x.size:0)+(re?1:0)+(le?1:0)+Y.size;Ut("fdrop-jfilters-btn",r,r>0)}function Ge(e,t,n){document.querySelectorAll(e).forEach(s=>{const a=s.querySelector("[data-count]");if(a){const o=n[s.getAttribute(t)]|0;a.textContent=o||""}})}function Vt(e,t){const n=document.querySelector(`#fdrop-jfilters-menu [data-toggle="${e}"] [data-count]`);n&&(n.textContent=t||"")}function Ut(e,t,n){const s=document.getElementById(e);if(!s)return;s.classList.toggle("is-active",n);const a=s.querySelector(".fdrop-count");if(a){const o=n&&t>0;a.textContent=o?t:"",a.style.display=o?"":"none"}}function G(e,t){e.classList.toggle("is-checked",t),e.setAttribute("aria-checked",String(t))}function Ze(){document.querySelectorAll(".fdrop.is-open").forEach(e=>{e.classList.remove("is-open");const t=e.querySelector(".fdrop-btn");t&&t.setAttribute("aria-expanded","false")})}function zt(e){const t=e.querySelector(".fdrop-btn"),n=e.querySelector(".fdrop-menu");if(!t||!n)return;const s=t.getBoundingClientRect();n.style.left=Math.round(s.left)+"px",n.style.top=Math.round(s.bottom+4)+"px",n.style.minWidth=Math.round(s.width)+"px",n.style.maxHeight=Math.max(160,Math.round(window.innerHeight-s.bottom-12))+"px"}function Kn(e){const t=e.querySelector(".fdrop-btn");e.classList.add("is-open"),t&&t.setAttribute("aria-expanded","true"),zt(e)}function Ft(){const e=document.querySelector(".fdrop.is-open");e&&zt(e)}window.addEventListener("scroll",Ft,!0),window.addEventListener("resize",Ft);const Wn=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;function Yn(e){if(e=String(e||"").trim(),!e)return[];if(e[0]==="[")try{const t=JSON.parse(e);if(Array.isArray(t))return t.map(n=>({position:String((n==null?void 0:n.position)||"").trim(),email:String((n==null?void 0:n.email)||"").trim()})).filter(n=>n.position||n.email)}catch{}return e.split(",").map(t=>t.trim()).filter(Boolean).map(t=>{const n=t.match(Wn),s=n?n[0]:"";let a=s?t.replace(s,""):t;return a=a.replace(/[<>()]/g,"").replace(/[\s:–—-]+$/,"").trim(),{position:a,email:s}})}const ve=()=>new Date().toISOString().slice(0,10);function Jt(e){const t=[["","none"]];for(const n of i.applicationStages)t.push([n,n]);return e&&!i.applicationStages.includes(e)&&t.push([e,e+" (removed)"]),t}function Kt(e){const t=[["","none"]];for(const n of i.outreachStatuses)t.push([n,n]);return e&&!i.outreachStatuses.includes(e)&&t.push([e,e+" (removed)"]),t}const Gn=8;function Wt(e,t){const n=(t||[]).indexOf(e);return n<0?"":"sc-"+n%Gn}function Ce(e){return Wt(e,i.applicationStages)}function Yt(e){return Wt(e,i.outreachStatuses)}function Zn(e){const t=Yn(e);return t.length?t.map(n=>{const s=c(n.position||n.email);if(!n.email)return s;const a=c(n.position?`${n.position} — ${n.email}`:n.email);return`<a href="mailto:${c(n.email)}" title="${a}">${s}</a>`}).join('<span class="dim">, </span>'):'<span class="dim">—</span>'}function Gt(e){const t=e.application_status||"";if(!t)return i.applicationStages.length+1;const n=i.applicationStages.indexOf(t);return n<0?i.applicationStages.length:n}function Qn(e,t,n){if(n==="verdict"){const s={yes:0,maybe:1,no:2,"":3};return(s[e.verdict]??3)-(s[t.verdict]??3)}if(n==="application")return Gt(e)-Gt(t);if(n==="followups_due")return(t.followups_due|0)-(e.followups_due|0);if(n==="created_at"||n==="last_outreach_at"){const s=e[n]||"",a=t[n]||"";return!s&&!a?0:s?a?String(a).localeCompare(String(s)):-i.jsort.dir:i.jsort.dir}return String(e[n]??"").localeCompare(String(t[n]??""))}function Xn(){const e=document.getElementById("jobs-followup-banner");if(!e)return;const t=i.jobs.reduce((n,s)=>n+(s.followups_due|0),0);if(!t){e.style.display="none",de=!1;return}e.style.display="",e.classList.toggle("is-filtered",de),e.innerHTML=`<span class="fb-icon">⏰</span><span class="fb-text"><strong>${t}</strong> follow-up${t>1?"s":""} due</span><button class="btn fb-toggle">${de?"show all jobs":"show only these"}</button>`,e.querySelector(".fb-toggle").onclick=()=>{de=!de,T()}}function T(){const e=document.querySelector("#jt tbody");e.innerHTML="",Xn();const t=Jn().sort((a,o)=>i.jsort.dir*Qn(a,o,i.jsort.k));document.getElementById("jobs-empty").style.display=t.length?"none":"block",Dt();const n=x&&!x.has("rejected")?i.jobs.filter(a=>(a.application_status||"")==="rejected").length:0,s=document.getElementById("jobs-hidden-note");s.style.display=n?"":"none",n&&(s.innerHTML=`${n} rejected application${n>1?"s":""} hidden — <a id="show-rejected-link">show</a>`,document.getElementById("show-rejected-link").onclick=()=>{x.add("rejected"),Rt(),T()});for(const a of t){const o=a.application_status||"",r=document.createElement("tr");r.dataset.id=a.posting_id;const l=Jt(o).map(([h,g])=>`<option value="${c(h)}"${o===h?" selected":""}>${c(g)}</option>`).join(""),p=a.outreach_status||"",u=Kt(p).map(([h,g])=>`<option value="${c(h)}"${p===h?" selected":""}>${c(g)}</option>`).join("");r.innerHTML=`
      <td><div class="jt-namecell"><button class="jt-nextup${a.next_up?" is-on":""}" title="${a.next_up?"queued next up for outreach — click to remove":"mark next up for outreach"}" aria-label="next up">${a.next_up?"★":"☆"}</button><div class="jt-namecol"><span class="row-name">${c(a.title||a.company)}</span>${es(a.outreach_draft_status)}${a.title?`<div class="small dim">${c(a.company)}</div>`:""}</div></div></td>
      <td data-col="application"><div class="jt-stage"><select class="jt-stage-sel ${Ce(o)}" title="application stage">${l}</select></div></td>
      <td class="small" data-col="outreach"><div class="jt-out"><select class="jt-ostatus ${Yt(p)}" title="outreach reply status">${u}</select>${a.followups_due?`<span class="followup-badge" title="${a.followups_due} follow-up${a.followups_due>1?"s":""} due — open to act">⏰ ${a.followups_due}</span>`:""}</div></td>
      <td class="small" data-col="last_outreach">${a.last_outreach_at?c(a.last_outreach_at):'<span class="dim">—</span>'}</td>
      <td class="small td-contacts" data-col="contacts">${Zn(a.contacts)}</td>
      <td data-col="link"><a href="${_(a.url)}" target="_blank" rel="noopener">open ↗</a></td>
    `,r.querySelector(".jt-nextup").onclick=()=>on(a,!1),r.querySelector(".jt-stage-sel").onchange=h=>ln(a,{application_status:h.target.value}),r.querySelector(".jt-ostatus").onchange=h=>ln(a,{outreach_status:h.target.value}),e.appendChild(r)}ge("jt","data-jk",i.jsort),ce(),e.querySelectorAll("tr").forEach(a=>{a.addEventListener("click",o=>{o.target.closest("a, button, select")||Zt(a.dataset.id)})})}function es(e){return e==="researching"?'<span class="draft-badge db-researching" title="drafting outreach…"><span class="spinner spinner-xs"></span>drafting</span>':e==="awaiting_review"?'<span class="draft-badge" title="an outreach draft is ready to review">draft ready</span>':e==="no_hook"?'<span class="draft-badge db-nohook" title="no honest hook — scout recommends not emailing">no hook</span>':""}const m={postingId:null,row:null,drafts:[],poll:null,openHist:!1,answers:[],answersStatus:"",answersPoll:null,detecting:!1,contacts:[],outreach:[],contactsLoaded:!1};async function Zt(e){let t=i.jobs.find(n=>n.posting_id===e);if(t||(await E(),t=i.jobs.find(n=>n.posting_id===e)),!t){d("posting not found — refresh");return}Xe(),at(),m.postingId=e,m.row=t,m.drafts=[],m.openHist=!1,m.answers=[],m.detecting=!1,m.contacts=[],m.outreach=[],m.contactsLoaded=!1,m.answersStatus=t.questions_status||"",document.getElementById("pursuit-pane").classList.add("open"),document.getElementById("pursuit-scrim").classList.add("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","false"),Xt("pursuit"),ae(),we(),me(),Qt()}async function Qt(){const e=m.postingId,t=m.row&&m.row.company_id;if(!(!e||!t)){try{const[n,s]=await Promise.all([fetch(`/api/companies/${t}/contacts`).then(a=>a.ok?a.json():[]),fetch(`/api/postings/${e}/outreach-log`).then(a=>a.ok?a.json():[])]);if(m.postingId!==e)return;m.contacts=Array.isArray(n)?n:[],m.outreach=Array.isArray(s)?s:[]}catch{}m.contactsLoaded=!0,pe()}}let Qe=null;function Xt(e){Qe=e;const t=e==="company";document.getElementById("scrim").style.zIndex=t?"54":"52",document.getElementById("pane").style.zIndex=t?"55":"53",document.getElementById("pursuit-scrim").style.zIndex=t?"52":"54",document.getElementById("pursuit-pane").style.zIndex=t?"53":"55"}function be(){Xe(),at(),m.postingId=null,m.row=null,m.drafts=[],m.answers=[],m.answersStatus="",document.getElementById("pursuit-pane").classList.remove("open"),document.getElementById("pursuit-scrim").classList.remove("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","true")}function Xe(){m.poll&&(clearInterval(m.poll),m.poll=null)}async function we(){if(!m.postingId)return;let e;try{const n=await fetch(`/api/postings/${m.postingId}/outreach`);if(!n.ok){pe();return}e=await n.json()}catch{pe();return}m.drafts=e.drafts||[],pe();const t=m.drafts[0];t&&t.status==="researching"?ts():Xe()}function ts(){m.poll||(m.poll=setInterval(we,4e3))}function N(e,t,{multiline:n=!1}={}){if(!e)return;let s=e.value;e.addEventListener("focus",()=>{s=e.value}),e.addEventListener("keydown",a=>{a.key==="Escape"?(a.preventDefault(),e.value=s,e.blur()):a.key==="Enter"&&(!n||a.metaKey||a.ctrlKey)&&(a.preventDefault(),e.blur())}),e.addEventListener("blur",async()=>{const a=e.value.trim();if(a===s.trim()){e.value=s;return}e.classList.remove("is-saved","is-error"),e.classList.add("is-saving");try{await t(a),s=e.value,e.classList.remove("is-saving"),e.classList.add("is-saved"),setTimeout(()=>e.classList.remove("is-saved"),1200)}catch(o){e.value=s,e.classList.remove("is-saving"),e.classList.add("is-error"),setTimeout(()=>e.classList.remove("is-error"),1600),d(`save failed: ${o.message}`)}})}async function en(e,t,n){const s={title:e.title||"",location:e.location||"",comp_range:e.comp_range||"",employment_type:e.employment_type||"",workplace_type:e.workplace_type||"",department:e.department||"",description:e.description||"",[t]:n},a=await fetch(`/api/postings/${e.posting_id}/details`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)});if(!a.ok)throw new Error((await a.text().catch(()=>"")).trim()||"HTTP "+a.status);const o=await a.json();Object.assign(e,{title:o.title,location:o.location,employment_type:o.employment_type,workplace_type:o.workplace_type,department:o.department,comp_range:o.comp_range,description:o.description}),T(),fe(e.posting_id,{title:o.title,location:o.location})}async function ns(e,t){const n=await fetch(`/api/postings/${e.posting_id}/url`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json();e.url=s.url;const a=document.querySelector("#role-body .role-url-open");a&&a.setAttribute("href",_(e.url)),fe(e.posting_id,{url:s.url})}async function ss(e,t){if(t.disabled)return;const n=t.textContent;t.disabled=!0,t.textContent="re-enriching…";let s;try{s=await fetch(`/api/postings/${e.posting_id}/recapture`,{method:"POST"})}catch(o){t.disabled=!1,t.textContent=n,d(`re-enrich failed: ${o.message}`);return}if(!s.ok){const o=(await s.text().catch(()=>"")).trim();let r=o||"HTTP "+s.status;try{r=JSON.parse(o).error||r}catch{}t.disabled=!1,t.textContent=n,d(`re-enrich failed: ${r}`);return}const a=await s.json();Object.assign(e,{title:a.title,location:a.location,employment_type:a.employment_type,workplace_type:a.workplace_type,department:a.department,comp_range:a.comp_range,description:a.description,posted_at:a.posted_at,url:a.url,questions_status:a.questions_status}),T(),ae(),fe(e.posting_id,{title:a.title,location:a.location,url:a.url}),d("re-enriched from the posting link")}function as(e){const t=document.getElementById("pursuit-company-edit");t&&t.addEventListener("click",()=>is(e))}async function os(e,t){const n=await fetch(`/api/postings/${e.posting_id}/company`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({company_id:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json();e.company_id=s.company_id,e.company=s.company_name,ae(),E()}let ke=null;function is(e){ke=e;const t=document.getElementById("relink-current");t&&(t.textContent=e.company?`currently: ${e.company}`:"");const n=document.getElementById("relink-search");n&&(n.value=""),tn(""),document.getElementById("relink-scrim").classList.add("open"),n&&n.focus()}function ue(){document.getElementById("relink-scrim").classList.remove("open"),ke=null}let et=null;function cs(e){et=e;const t=(e.postings||[]).length,n=t?` and its ${t} job ${t===1?"posting":"postings"}`:"",s=document.getElementById("delcompany-summary");s&&(s.innerHTML=`Delete <strong>${c(e.name||"this company")}</strong>${n}?`);const a=document.getElementById("delcompany-confirm");a&&(a.disabled=!1),document.getElementById("delcompany-scrim").classList.add("open")}function Se(){document.getElementById("delcompany-scrim").classList.remove("open"),et=null}async function rs(){const e=et;if(!e)return;const t=document.getElementById("delcompany-confirm");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/companies/${e.company_id}`,{method:"DELETE"})}catch(a){d(`delete failed: ${a.message}`),t&&(t.disabled=!1);return}if(!n.ok){const a=await n.text().catch(()=>"");d(`delete failed: HTTP ${n.status}${a?" — "+a:""}`),t&&(t.disabled=!1);return}const s=e.name||"company";Se(),i.openId===e.company_id&&Ie(),j(),E(),B(),d(`deleted ${s}`)}let tt=null;function ls(e){tt=e;const t=(e.title||"").trim()||"this posting",n=e.company?` at <strong>${c(e.company)}</strong>`:"",s=document.getElementById("deljob-summary");s&&(s.innerHTML=`Delete <strong>${c(t)}</strong>${n}?`);const a=document.getElementById("deljob-confirm");a&&(a.disabled=!1),document.getElementById("deljob-scrim").classList.add("open")}function je(){document.getElementById("deljob-scrim").classList.remove("open"),tt=null}async function ds(){const e=tt;if(!e)return;const t=document.getElementById("deljob-confirm");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/postings/${e.posting_id}`,{method:"DELETE"})}catch(a){d(`delete failed: ${a.message}`),t&&(t.disabled=!1);return}if(!n.ok){const a=await n.text().catch(()=>"");d(`delete failed: HTTP ${n.status}${a?" — "+a:""}`),t&&(t.disabled=!1);return}const s=(e.title||"").trim()||"posting";je(),be(),E(),i.openId===e.company_id&&he(e.company_id),d(`deleted ${s}`)}function tn(e){const t=document.getElementById("relink-results");if(!t)return;const n=e.trim().toLowerCase();let s=(i.rows||[]).slice();if(n?(s=s.filter(o=>(o.name||"").toLowerCase().includes(n)),s.sort((o,r)=>{const l=(o.name||"").toLowerCase().startsWith(n)?0:1,p=(r.name||"").toLowerCase().startsWith(n)?0:1;return l-p||(o.name||"").localeCompare(r.name||"")})):s.sort((o,r)=>(o.name||"").localeCompare(r.name||"")),s=s.slice(0,60),!s.length){t.innerHTML=`<div class="relink-empty">${(i.rows||[]).length?"no company matches":"no companies yet — Add one first"}</div>`;return}const a=ke?ke.company_id:"";t.innerHTML=s.map(o=>{const r=o.company_id===a,l=[o.vertical,o.location].filter(Boolean).map(c).join(" · ");return`<button type="button" class="relink-result${r?" is-current":""}"
        data-id="${o.company_id}"${r?" disabled":""}>
        <span class="rr-main">
          <span class="rr-name">${c(o.name||"—")}</span>
          ${l?`<span class="rr-sub">${l}</span>`:""}
        </span>
        <span class="${y(o.verdict)} rr-verdict">${c(o.verdict||"—")}</span>
        ${r?'<span class="rr-current-tag">current</span>':""}
      </button>`}).join("")}async function nn(e){const t=ke;if(!t){ue();return}if(e===t.company_id){ue();return}try{await os(t,e),ue(),d(`moved to ${t.company}`)}catch(n){d(`move failed: ${n.message}`)}}async function sn(e,t,n){const s={name:e.name||"",headcount:e.headcount||"",funding_stage:e.funding_stage||"",location:e.location||"",vertical:e.vertical||"",[t]:n};if(!String(s.name).trim())throw new Error("name is required");const a=await fetch(`/api/companies/${e.company_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)});if(!a.ok)throw new Error((await a.text().catch(()=>"")).trim()||"HTTP "+a.status);const o=await a.json();Object.assign(e,{name:o.name,headcount:o.headcount,funding_stage:o.funding_stage,location:o.location,vertical:o.vertical}),j(),E()}async function us(e,t){const n=await fetch(`/api/companies/${e.company_id}/domain`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({website:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json();i.openId=s.company_id,xe(s),_e(s.company_id),j(),E()}async function ps(e,t){const n=await fetch(`/api/companies/${e.company_id}/notes`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({notes:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json();e.notes=s.notes}let an=null;function ae(){const e=m.row;if(!e)return;const t=document.getElementById("pursuit-body"),s=!!t&&an===e.posting_id&&document.getElementById("pursuit-pane").classList.contains("open")&&t?t.scrollTop:0;document.getElementById("pursuit-title").innerHTML=`<input class="ie ie-title" id="pursuit-title-input" placeholder="role name" value="${c(e.title||"")}">`;const a=e.application_status||"";document.getElementById("pursuit-pills").innerHTML=`<span class="pill ${a?Ce(a)||"pill-stage":"pill-none"}">${c(a||"—")}</span>`+(e.verdict?` <span class="${y(e.verdict)}">${c(e.verdict)}</span>`:"");const o=document.getElementById("pursuit-chat");o&&(o.style.display=i.meta&&i.meta.chat?"":"none",o.onclick=()=>It("posting",e.posting_id,e.title||e.company)),document.getElementById("pursuit-body").innerHTML=`
    <section class="pane-section role-head">
      <div id="role-body">${ms(e)}</div>
    </section>

    <section class="pane-section">
      <h3>
        Pipeline
      </h3>
      <div class="pipeline-grid">
        <div class="pipeline-row">
          <span class="pl-label">application</span>
          <select class="input pl-appstatus" title="application stage">
            ${Jt(e.application_status||"").map(([u,h])=>`<option value="${c(u)}"${(e.application_status||"")===u?" selected":""}>${c(h)}</option>`).join("")}
          </select>
        </div>
        <div class="pipeline-row">
          <span class="pl-label">outreach</span>
          <select class="input pl-ostatus" title="outreach reply status — separate from the application stage">
            ${Kt(e.outreach_status||"").map(([u,h])=>`<option value="${c(u)}"${(e.outreach_status||"")===u?" selected":""}>${c(h)}</option>`).join("")}
          </select>
        </div>
        <div class="pipeline-row">
          <span class="pl-label">queue</span>
          <button class="pt-chip pt-nextup${e.next_up?" is-on":""}" title="${e.next_up?"unmark — it also clears itself when you log a +1 outreach":"mark this pursuit next up for outreach"}">
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
      <textarea class="ie ie-notes" id="pursuit-notes-input" rows="4" placeholder="—">${c(e.notes||"")}</textarea>
    </section>

    <section class="pane-section">
      <h3>
        Outreach
      </h3>
      <div id="outreach-section"></div>
    </section>

    ${e.application_status?"":`
    <section class="pane-section">
      <h3>
        Application
      </h3>
      <div id="answers-section"></div>
    </section>`}

    <div class="pane-danger">
      <button class="btn-delete" id="job-delete-btn" title="permanently delete this job posting and everything attached to it">Delete job</button>
    </div>
  `,hs();const r=document.getElementById("pursuit-company-link");r&&r.addEventListener("click",()=>he(e.company_id)),as(e),N(document.getElementById("pursuit-title-input"),u=>en(e,"title",u)),N(document.getElementById("pursuit-url-input"),u=>ns(e,u));const l=document.getElementById("pursuit-reenrich");l&&l.addEventListener("click",()=>ss(e,l)),N(document.getElementById("pursuit-notes-input"),u=>fs(u),{multiline:!0}),document.querySelectorAll("#role-body [data-k]").forEach(u=>N(u,h=>en(e,u.dataset.k,h),{multiline:u.tagName==="TEXTAREA"}));const p=document.getElementById("job-delete-btn");p&&p.addEventListener("click",()=>ls(e)),pe(),$e(),t&&(t.scrollTop=s),an=e.posting_id}function ms(e){return`
    <div class="role-url ie-field">
      <div class="role-url-head">
        <label>link</label>
        <a class="role-url-open" href="${_(e.url)}" target="_blank" rel="noopener" title="open the posting">↗</a>
        <button type="button" class="role-reenrich h3-action" id="pursuit-reenrich"
                title="re-fetch this posting's details from the link — fills in blanks, no re-typing">↻ re-enrich</button>
      </div>
      <input class="ie" id="pursuit-url-input" placeholder="https://…" value="${c(e.url||"")}">
    </div>
    <div class="ie-grid">
      <div class="prow">
        <div class="ie-field"><label>location</label>
          <input class="ie" data-k="location" placeholder="—" value="${c(e.location||"")}"></div>
        <div class="ie-field"><label>comp range</label>
          <input class="ie" data-k="comp_range" placeholder="—" value="${c(e.comp_range||"")}"></div>
      </div>
      <div class="prow">
        <div class="ie-field"><label>employment</label>
          <input class="ie" data-k="employment_type" placeholder="—" value="${c(e.employment_type||"")}"></div>
        <div class="ie-field"><label>workplace</label>
          <input class="ie" data-k="workplace_type" placeholder="—" value="${c(e.workplace_type||"")}"></div>
      </div>
      <div class="ie-field"><label>department</label>
        <input class="ie" data-k="department" placeholder="—" value="${c(e.department||"")}"></div>
      <div class="ie-field"><label>description</label>
        <textarea class="ie" data-k="description" rows="6" placeholder="—">${c(e.description||"")}</textarea></div>
    </div>
    <div class="role-meta">
      ${e.posted_at?`<span>posted ${c(e.posted_at)}</span>`:""}
      <span class="role-company-wrap">
        <button type="button" class="role-company role-company-link" id="pursuit-company-link"
                title="open the company panel">${c(e.company)} ↗</button>
        <button type="button" class="role-company-relink-btn" id="pursuit-company-edit"
                title="move this job to a different company">change</button>
      </span>
    </div>`}function hs(){const e=document.querySelector("#pursuit-body .pl-appstatus");e&&e.addEventListener("change",s=>rn({application_status:s.target.value}));const t=document.querySelector("#pursuit-body .pl-ostatus");t&&t.addEventListener("change",s=>rn({outreach_status:s.target.value}));const n=document.querySelector("#pursuit-body .pt-nextup");n&&n.addEventListener("click",()=>on(m.row,!0))}async function on(e,t){let n;try{n=await fetch(`/api/postings/${e.posting_id}/next-up`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({next_up:!e.next_up})})}catch(a){d(`save failed: ${a.message}`);return}if(!n.ok){const a=(await n.text().catch(()=>"")).trim();d(`save failed: ${a||"HTTP "+n.status}`);return}const s=await n.json();e.next_up=s.next_up,T(),fe(e.posting_id,{next_up:s.next_up}),t&&ae(),d(e.next_up?"queued next up":"removed from the queue")}async function cn(e,t){const n={application_status:e.application_status||"",outreach_status:e.outreach_status||"",notes:e.notes||"",...t};let s;try{s=await fetch(`/api/postings/${e.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)})}catch(o){return d(`save failed: ${o.message}`),null}if(!s.ok){const o=(await s.text().catch(()=>"")).trim();return d(`save failed: ${o||"HTTP "+s.status}`),null}const a=await s.json();return Object.assign(e,{application_status:a.application_status,outreach_count:a.outreach_count,last_outreach_at:a.last_outreach_at,outreach_status:a.outreach_status,contacts:a.contacts,notes:a.notes,next_up:a.next_up}),fe(e.posting_id,{application_status:a.application_status,outreach_count:a.outreach_count,last_outreach_at:a.last_outreach_at,next_up:a.next_up}),a}async function fs(e){const t=m.row,n={application_status:t.application_status||"",outreach_status:t.outreach_status||"",notes:e},s=await fetch(`/api/postings/${t.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const a=await s.json();t.notes=a.notes,T()}async function rn(e){await cn(m.row,e)&&(T(),ae(),d("tracking saved"))}async function ln(e,t){await cn(e,t)&&(T(),m.postingId===e.posting_id&&(m.row=e,ae()),d("tracking saved"))}function pe(){const e=document.getElementById("outreach-section");if(!e)return;const t=m.drafts,n=t[0]||null,s=t.slice(1),o=n&&($s(n.status)||n.status==="failed")?"":`<button class="btn btn-primary" id="draft-start-btn">${n?"Draft again":"Draft outreach"}</button>`,r=s.length?`
    <details class="draft-history" ${m.openHist?"open":""}>
      <summary>${s.length} earlier draft${s.length>1?"s":""}</summary>
      <div id="draft-history-body">${s.map(l=>un(l,!0)).join("")}</div>
    </details>`:"";e.innerHTML=vs()+`<div class="outreach-drafts-head">Drafts</div><div id="draft-current">${n?un(n,!1):""}</div><div class="draft-actions">${o}</div>`+r,Es(),Ts()}function ys(e,t){const n=new Date(e+"T00:00:00");let s=0;for(;s<t;){n.setDate(n.getDate()+1);const a=n.getDay();a!==0&&a!==6&&s++}return n.toISOString().slice(0,10)}function gs(e,t){const n=m.row||{},s={company:n.company||"",role:n.title||"",contact_name:e&&e.name||"",contact_role:e&&e.role||"",last_sent:t&&t.sent_at||"",last_message:t&&t.body||""};return(i.followupTemplate||"").replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g,(a,o)=>o in s?s[o]:a)}function vs(){const e=m.row,t=`<div class="outreach-meta">
      ${e.last_outreach_at?`<span>last outreach ${c(e.last_outreach_at)}</span>`:""}
      <span class="om-interval" title="business days after a send to remind you to follow up (0 = off)">follow up after <input class="input fu-interval" type="number" min="0" max="90" value="${i.followupInterval}"> business days</span>
    </div>`;if(!m.contactsLoaded)return`<div class="contacts-mgr">${t}<div class="loading-row"><span class="spinner"></span><span>loading contacts…</span></div></div>`;const n=m.contacts.map(bs).join(""),s=m.contacts.length?"":`<div class="cc-empty dim">No contacts yet — add the people you're reaching out to at ${c(e.company)}.</div>`;return`<div class="contacts-mgr">
    ${t}
    <div class="cc-cards">${n}${s}</div>
    <div class="cc-addwrap">
      <button class="btn cc-addbtn" type="button">+ add contact</button>
      <div class="cc-addform" style="display:none">
        <input class="input cc-f-name" placeholder="name" spellcheck="false">
        <input class="input cc-f-role" placeholder="role (e.g. recruiter)" spellcheck="false">
        <input class="input cc-f-email" type="email" placeholder="email" spellcheck="false">
        <div class="cc-form-actions"><button class="btn btn-primary cc-f-save" type="button">Add</button><button class="btn cc-f-cancel" type="button">Cancel</button></div>
      </div>
    </div>
  </div>`}function bs(e){const t=m.outreach.filter(o=>o.contact_id===e.id),n=t[0]||null,s=e.role?`<span class="cc-role">${c(e.role)}</span>`:"",a=e.email?`<a class="cc-mail" href="mailto:${c(e.email)}" title="${c(e.email)}">${c(e.email)}</a>`:"";return`<div class="contact-card" data-cid="${e.id}">
    <div class="cc-head">
      <span class="cc-name">${c(e.name||e.email||"contact")}</span>${s}${a}
      <span class="cc-acts"><button class="cc-edit" type="button" title="edit contact" aria-label="edit">✎</button><button class="cc-arch" type="button" title="remove contact" aria-label="remove">×</button></span>
    </div>
    <div class="cc-editform" style="display:none">
      <input class="input cc-e-name" value="${c(e.name||"")}" placeholder="name" spellcheck="false">
      <input class="input cc-e-role" value="${c(e.role||"")}" placeholder="role" spellcheck="false">
      <input class="input cc-e-email" type="email" value="${c(e.email||"")}" placeholder="email" spellcheck="false">
      <div class="cc-form-actions"><button class="btn btn-primary cc-e-save" type="button">Save</button><button class="btn cc-e-cancel" type="button">Cancel</button></div>
    </div>
    <div class="cc-status">${ws(n)}</div>
    <div class="cc-rowacts"><button class="btn cc-log" type="button">+ log outreach</button>${n?'<button class="btn cc-followup" type="button" title="copy a follow-up email from your template and pre-fill the log">Follow up ⧉</button>':""}</div>
    <div class="cc-logform" style="display:none">
      <input class="input cc-l-date" type="date" value="${ve()}" title="date sent">
      <textarea class="input cc-l-body" rows="5" placeholder="email body — what you sent (optional)" spellcheck="false"></textarea>
      <input class="input cc-l-note" placeholder="note (optional)" spellcheck="false">
      <div class="cc-form-actions"><button class="btn btn-primary cc-l-save" type="button">Log</button><button class="btn cc-l-cancel" type="button">Cancel</button></div>
    </div>
    ${t.length?`<details class="cc-history"><summary>${t.length} send${t.length>1?"s":""}</summary><div class="cc-entries">${t.map(ks).join("")}</div></details>`:""}
  </div>`}function ws(e){if(!e)return'<span class="dim">no outreach logged yet</span>';const t=`last ${c(e.sent_at)}`;if(e.followup_done_at)return`${t} · <span class="fu-done">followed up ✓</span>`;if(e.followup_due_at){const n=e.followup_due_at<=ve();return`${t} · <span class="fu-wrap ${n?"fu-overdue":""}">${n?"⏰ ":""}follow up by <input class="input fu-date" data-eid="${e.id}" type="date" value="${c(e.followup_due_at)}"></span> <button class="btn cc-fu-done" data-eid="${e.id}" type="button">mark followed up</button>`}return`${t} · <span class="dim">no follow-up</span> <button class="btn cc-fu-set" data-eid="${e.id}" type="button">set reminder</button>`}function ks(e){const t=e.followup_done_at?'<span class="fu-done">followed up</span>':e.followup_due_at?`<span class="fu-mini">↳ follow up ${c(e.followup_due_at)}</span>`:"",n=e.body?`<details class="cc-e-body"><summary>email sent</summary><pre>${c(e.body)}</pre></details>`:"";return`<div class="cc-entry-wrap">
      <div class="cc-entry" data-eid="${e.id}">
        <span class="cc-e-date">${c(e.sent_at)}</span>
        ${e.note?`<span class="cc-e-note">${c(e.note)}</span>`:""}
        ${t}
        <button class="cc-e-del" type="button" title="delete this send" aria-label="delete">×</button>
      </div>
      ${n}
    </div>`}async function z(e,t,n){let s;try{s=await fetch(t,{method:e,headers:n?{"Content-Type":"application/json"}:{},body:n?JSON.stringify(n):void 0})}catch(a){return d(`save failed: ${a.message}`),null}if(!s.ok){const a=(await s.text().catch(()=>"")).trim();return d(`save failed: ${a||"HTTP "+s.status}`),null}try{return await s.json()}catch{return{}}}async function Z(){await E(),await Qt()}function Es(){const e=document.getElementById("outreach-section");if(!e)return;const t=m.postingId,n=e.querySelector(".fu-interval");n&&n.addEventListener("change",async()=>{const a=Math.max(0,Math.min(90,parseInt(n.value,10)||0));await z("PUT","/api/followup-interval",{days:a})&&(i.followupInterval=a,d("follow-up interval saved"))});const s=e.querySelector(".cc-addwrap");if(s){const a=s.querySelector(".cc-addform");s.querySelector(".cc-addbtn").addEventListener("click",()=>{a.style.display="",s.querySelector(".cc-addbtn").style.display="none",a.querySelector(".cc-f-name").focus()}),s.querySelector(".cc-f-cancel").addEventListener("click",()=>pe()),s.querySelector(".cc-f-save").addEventListener("click",async()=>{const o={name:a.querySelector(".cc-f-name").value,role:a.querySelector(".cc-f-role").value,email:a.querySelector(".cc-f-email").value};await z("POST",`/api/companies/${m.row.company_id}/contacts`,o)&&(d("contact added"),Z())})}e.querySelectorAll(".contact-card").forEach(a=>{const o=a.dataset.cid,r=a.querySelector(".cc-editform");a.querySelector(".cc-edit").addEventListener("click",()=>{r.style.display=r.style.display==="none"?"":"none",r.style.display!=="none"&&r.querySelector(".cc-e-name").focus()});const l=a.querySelector(".cc-e-cancel");l&&l.addEventListener("click",()=>{r.style.display="none"});const p=a.querySelector(".cc-e-save");p&&p.addEventListener("click",async()=>{const $={name:r.querySelector(".cc-e-name").value,role:r.querySelector(".cc-e-role").value,email:r.querySelector(".cc-e-email").value};await z("PUT",`/api/contacts/${o}`,$)&&(d("contact saved"),Z())}),a.querySelector(".cc-arch").addEventListener("click",async()=>{await z("DELETE",`/api/contacts/${o}`)&&(d("contact removed"),Z())});const u=a.querySelector(".cc-logform");a.querySelector(".cc-log").addEventListener("click",()=>{u.style.display=u.style.display==="none"?"":"none",u.style.display!=="none"&&u.querySelector(".cc-l-date").focus()});const h=a.querySelector(".cc-l-cancel");h&&h.addEventListener("click",()=>{u.style.display="none"});const g=a.querySelector(".cc-l-save");g&&g.addEventListener("click",async()=>{const $={contact_id:o,sent_at:u.querySelector(".cc-l-date").value||ve(),body:u.querySelector(".cc-l-body").value,note:u.querySelector(".cc-l-note").value};await z("POST",`/api/postings/${t}/outreach-log`,$)&&(d("outreach logged"),Z())});const R=a.querySelector(".cc-followup");R&&R.addEventListener("click",()=>{const $=m.contacts.find(q=>q.id===o),A=m.outreach.filter(q=>q.contact_id===o)[0]||null,f=gs($,A);bn(f,"follow-up copied — paste into your email"),u.style.display="",u.querySelector(".cc-l-body").value=f,u.querySelector(".cc-l-date").value=ve()});const te=($,A)=>{const f=m.outreach.find(q=>String(q.id)===String($))||{};return{sent_at:f.sent_at||"",body:f.body||"",note:f.note||"",followup_due_at:f.followup_due_at||"",done:!!f.followup_done_at,...A}},D=a.querySelector(".fu-date");D&&D.addEventListener("change",async()=>{await z("PUT",`/api/outreach-log/${D.dataset.eid}`,te(D.dataset.eid,{followup_due_at:D.value,done:!1}))&&(d("follow-up updated"),Z())});const K=a.querySelector(".cc-fu-done");K&&K.addEventListener("click",async()=>{await z("PUT",`/api/outreach-log/${K.dataset.eid}`,te(K.dataset.eid,{done:!0}))&&(d("marked followed up"),Z())});const W=a.querySelector(".cc-fu-set");W&&W.addEventListener("click",async()=>{const $=ys(ve(),i.followupInterval||5);await z("PUT",`/api/outreach-log/${W.dataset.eid}`,te(W.dataset.eid,{followup_due_at:$,done:!1}))&&(d("reminder set"),Z())}),a.querySelectorAll(".cc-e-del").forEach($=>$.addEventListener("click",async()=>{const A=$.closest(".cc-entry").dataset.eid;await z("DELETE",`/api/outreach-log/${A}`)&&(d("send deleted"),Z())}))})}function $s(e){return e==="researching"||e==="awaiting_review"||e==="needs_work"||e==="no_hook"}const Is='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M2.5 10.5v-7a1 1 0 011-1h7"/></svg>',xs='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2L7.3 8.7"/><path d="M14 2L9.7 14l-2.4-5.3L2 6.3z"/></svg>',dn=`<button class="dh-copy draft-copy-btn" title="copy the email to the clipboard" aria-label="copy email">${Is}</button>`,nt=[{key:"research",label:"Research",active:"Researching the company"},{key:"fill",label:"Draft",active:"Writing the draft"},{key:"humanize",label:"Polish",active:"Polishing the voice"},{key:"honesty",label:"Fact-check",active:"Fact-checking against your experience"}],_s='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';function Bs(e){let t=nt.findIndex(s=>s.key===e);return t<0&&(t=0),`<div class="draft-progress">
    <div class="dp-track">${nt.map((s,a)=>{const o=a<t?"is-done":a===t?"is-active":"is-pending",r=a<t?_s:"";return`<div class="dp-seg ${o}"><span class="dp-dot">${r}</span><span class="dp-name">${s.label}</span></div>`}).join("")}</div>
    <div class="dp-status"><span class="spinner"></span><span>${nt[t].active}…</span></div>
  </div>`}function un(e,t){const n=(u,h,g="")=>`
    <div class="draft-head">
      <span class="${u}">${h}</span>${g}
    </div>`;if(e.status==="researching")return`<div class="draft-card dc-busy">
      ${Bs(e.stage)}
      <div class="draft-note">This usually takes a minute or two — leave the panel or check back later.</div>
    </div>`;if(e.status==="failed"){const u=Ls(e.violations);return`<div class="draft-card dc-failed" data-did="${e.id}">
      ${n("pill pill-no","failed")}
      ${e.fail_reason?`<div class="draft-note">${c(e.fail_reason)}</div>`:""}
      ${u}
      ${Ee(e)}
      ${t?"":`<div class="draft-actions"><button class="btn btn-primary draft-retry-btn">${Ve}Retry</button></div>`}
    </div>`}if(e.status==="superseded")return`<div class="draft-card dc-sent" data-did="${e.id}">
      ${n("pill pill-info","replaced")}
      <div class="draft-note">Replaced by a newer draft.</div>
      <div class="draft-sentbody">${c(st(e)||"(empty)")}</div>
      ${Ee(e)}
    </div>`;if(e.status==="sent")return`<div class="draft-card dc-sent" data-did="${e.id}">
      ${n("pill pill-yes","sent",t?"":dn)}
      ${e.sent_at?`<div class="draft-note">Sent ${c((e.sent_at||"").replace("T"," ").slice(0,16))}</div>`:""}
      <div class="draft-sentbody">${c(st(e)||"(empty)")}</div>
      ${Ee(e)}
    </div>`;const s=st(e),a=e.status==="no_hook",o=a?'<span class="pill pill-info">no honest hook</span>':'<span class="pill pill-maybe">awaiting review</span>';let r="";if(a)try{r=JSON.parse(e.hook||"{}").reasoning||""}catch{}const l=a?`<div class="draft-note">No honest hook found — nothing true to say yet; scout recommends not emailing.${r?" "+c(r):""}</div>`:"";if(t)return`<div class="draft-card ${a?"dc-nohook":"dc-review"}" data-did="${e.id}">
      <div class="draft-head">${o}</div>
      ${l}
      <div class="draft-sentbody">${c(s||"(empty)")}</div>
      ${Ee(e)}
    </div>`;const p=s||a;return`<div class="draft-card ${a?"dc-nohook":"dc-review"}" data-did="${e.id}">
    <div class="draft-head">${o}${s?dn:""}</div>
    ${l}
    ${p?`<textarea class="draft-textarea" id="draft-edit-${e.id}" spellcheck="false">${c(s)}</textarea>
    ${pn(e.lint)}
    <div class="draft-actions">
      <button class="btn btn-primary draft-sent-btn" title="mark this email sent — bumps the outreach count">${xs}Mark sent</button>
      <button class="btn draft-regen-btn" title="discard this draft (kept in history) and re-run — picks up backfilled info">${Ve}Regenerate</button>
    </div>`:`<div class="draft-actions">
      <button class="btn draft-regen-btn" title="re-run the draft — picks up backfilled info">${Ve}Regenerate</button>
    </div>`}
    ${Ee(e)}
  </div>`}function st(e){return e.edited&&e.edited.trim()?e.edited:e.draft||""}function Ee(e){let t="",n=null,s=null;try{n=JSON.parse(e.research||"null")}catch{}try{s=JSON.parse(e.hook||"null")}catch{}if(n&&typeof n=="object"){const a=(p,u)=>u?`<div class="tr-line"><span class="tr-key">${p}:</span> ${c(String(u))}</div>`:"",o=n.role||{},r=Array.isArray(n.hooks)?n.hooks:[],l=r.map(p=>`
      <div class="tr-line">
        <span class="tr-key">${c(p.type||"hook")}</span>
        ${_(p.source_url)!=="#"?` · <a href="${_(p.source_url)}" target="_blank" rel="noopener">source</a>`:""}
        <span class="tr-quote">${c(p.quote||"")}</span>
        ${p.context?`<span class="tr-key">${c(p.context)}</span>`:""}
      </div>`).join("");t+=`<details class="draft-trace"><summary>research — ${r.length} hook candidate${r.length===1?"":"s"}</summary>
      <div class="trace-body">
        ${a("what they do",n.what_they_do)}
        ${a("customer",n.customer)}
        ${a("stage / headcount",[n.stage,n.headcount_est].filter(Boolean).join(" / "))}
        ${a("role",o.title)}
        ${(o.jd_quotes||[]).map(p=>`<span class="tr-quote">${c(p)}</span>`).join("")}
        ${l}
        ${a("disambiguation",n.disambiguation)}
        ${a("confidence",n.confidence)}
      </div></details>`}if(s&&typeof s=="object"&&s.decision){const a=s.hook||{};t+=`<details class="draft-trace"><summary>hook — ${c(s.decision)}${s.closer_mode?" · "+c(s.closer_mode):""}</summary>
      <div class="trace-body">
        ${a.quote?`<span class="tr-quote">${c(a.quote)}</span>`:""}
        ${a.thread?`<div class="tr-line"><span class="tr-key">thread:</span> ${c(a.thread)}</div>`:""}
        ${_(a.source_url)!=="#"?`<div class="tr-line"><a href="${_(a.source_url)}" target="_blank" rel="noopener">source</a></div>`:""}
        ${s.reasoning?`<div class="tr-line"><span class="tr-key">reasoning:</span> ${c(s.reasoning)}</div>`:""}
      </div></details>`}return t}function pn(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<div class="lint-chips">'+t.map(n=>`<span class="lint-chip" title="${c(n.message||"")}"><code>${c(n.code||"")}</code>${c(n.message||"")}</span>`).join("")+"</div>":""}function Ls(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<ul class="violation-list">'+t.map(n=>`<li>${c(n.claim||n.message||String(n))}${n.why?` <span class="vl-why">— ${c(n.why)}</span>`:""}</li>`).join("")+"</ul>":""}function Ts(){const e=document.getElementById("outreach-section");if(!e)return;const t=e.querySelector("#draft-start-btn");t&&t.addEventListener("click",()=>Me()),e.querySelectorAll(".draft-retry-btn").forEach(s=>s.addEventListener("click",()=>Me())),e.querySelectorAll(".draft-regen-btn").forEach(s=>s.addEventListener("click",()=>Me(!0))),e.querySelectorAll(".draft-card[data-did]").forEach(s=>{const a=s.dataset.did,o=s.querySelector(".draft-textarea");o&&N(o,p=>Ss(a,p),{multiline:!0});const r=s.querySelector(".draft-sent-btn");r&&r.addEventListener("click",()=>js(a));const l=s.querySelector(".draft-copy-btn");l&&l.addEventListener("click",()=>{const p=s.querySelector(".draft-textarea"),u=s.querySelector(".draft-sentbody"),h=p?p.value:u?u.textContent:"";bn(h,"email copied")})});const n=e.querySelector("details.draft-history");n&&n.addEventListener("toggle",()=>{m.openHist=n.open})}async function Me(e=!1){const t=document.getElementById("outreach-section"),n=t&&(t.querySelector("#draft-start-btn")||t.querySelector(".draft-retry-btn")||t.querySelector(".draft-regen-btn"));n&&(n.disabled=!0);let s;try{const o=e?"?regenerate=1":"";s=await fetch(`/api/postings/${m.postingId}/outreach${o}`,{method:"POST"})}catch(o){d(`draft failed: ${o.message}`),n&&(n.disabled=!1);return}if(s.status===202){let o={};try{o=await s.json()}catch{}Array.isArray(o.degraded)&&o.degraded.length&&d(`drafting without ${o.degraded.join(", ")} — quality degrades, integrity unaffected`),await we(),E();return}if(s.status===409){await we(),d("a draft is already active");return}if(s.status===412){let o={};try{o=await s.json()}catch{}Cs(o.need,o.error),n&&(n.disabled=!1);return}if(s.status===503){const o=document.getElementById("outreach-section");if(o){const r=document.createElement("div");r.className="draft-note",r.textContent="Outreach engine not running in this build.",o.appendChild(r)}n&&(n.disabled=!1);return}const a=(await s.text().catch(()=>"")).trim();d(`draft failed: ${a||"HTTP "+s.status}`),n&&(n.disabled=!1)}function Cs(e,t){const n=document.getElementById("outreach-section");if(!n)return;const s=n.querySelector(".draft-actions"),a=e==="template",o=a?"Write email template":"View brain knowledge",r=document.createElement("div");r.className="blocks-gate",r.innerHTML=`
    <div class="draft-note">${c(t||"Outreach isn't set up yet.")}</div>
    <div class="draft-actions">
      <button class="btn btn-primary" id="gate-fix-btn">${o}</button>
      <button class="btn" id="gate-retry-btn">Retry</button>
    </div>`,s?s.replaceWith(r):n.appendChild(r);const l=r.querySelector("#gate-fix-btn");l&&l.addEventListener("click",()=>a?F("outreach-template"):pt());const p=r.querySelector("#gate-retry-btn");p&&p.addEventListener("click",Me)}async function Ss(e,t){const n=await fetch(`/api/outreach/drafts/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json(),a=m.drafts.findIndex(l=>String(l.id)===String(e));a>=0&&(m.drafts[a]=s);const o=document.getElementById(`draft-edit-${e}`),r=o&&o.closest(".draft-card");if(r){const l=r.querySelector(".lint-chips"),p=pn(s.lint);l?l.outerHTML=p||"":p&&o.insertAdjacentHTML("afterend",p)}}async function js(e){let t;try{t=await fetch(`/api/outreach/drafts/${e}/sent`,{method:"POST"})}catch(s){d(`failed: ${s.message}`);return}if(!t.ok){const s=(await t.text().catch(()=>"")).trim();d(`failed: ${s||"HTTP "+t.status}`);return}d("marked sent"),await we(),await E();const n=i.jobs.find(s=>s.posting_id===m.postingId);n&&fe(n.posting_id,{outreach_count:n.outreach_count,last_outreach_at:n.last_outreach_at,next_up:n.next_up})}async function me(){if(!m.postingId)return;let e;try{const t=await fetch(`/api/postings/${m.postingId}/answers`);if(!t.ok){$e();return}e=await t.json()}catch{$e();return}m.answers=e.answers||[],m.answersStatus=e.questions_status||"",$e(),m.answers.some(t=>t.status==="generating")?Ms():at()}function Ms(){m.answersPoll||(m.answersPoll=setInterval(me,4e3))}function at(){m.answersPoll&&(clearInterval(m.answersPoll),m.answersPoll=null)}function $e(){const e=document.getElementById("answers-section");if(!e)return;const t=m.answers,n=m.answersStatus,s=t.some(u=>u.status==="generating"),a=t.length?`<div class="answers-list">${t.map(Ps).join("")}</div>`:"",o=!!m.detecting,r=s||o?" disabled":"",l=u=>`<button class="btn" id="answers-redetect-btn"${o?" disabled":""}>${o?"Detecting…":u}</button>`;let p;n==="ok"&&t.length?p=(t.some(h=>!mn(h)&&h.status!=="generating")?`<button class="btn" id="answers-start-btn"${r}>${s?"Drafting…":"Draft all blank"}</button>`:"")+l("Re-detect"):n===""||n==="unreachable"?p=`<button class="btn btn-primary" id="answers-start-btn"${r}>${s?"Drafting…":"Draft answers"}</button>`+l("Re-detect questions"):p=l("Re-detect questions"),e.innerHTML=`<div class="answers-meta">${c(As(n,t.length))}</div>`+a+`<div class="answers-actions">${p}</div>`,Os()}function As(e,t){switch(e){case"":return"Not detected yet";case"ok":return`${t} question${t===1?"":"s"} found`;case"none":return"No essay questions on this form";case"unsupported":return"Couldn't read this form — apply on the site";case"unreachable":return"Couldn't reach the application form — try re-detecting";default:return"Couldn't read this form"}}function mn(e){return e.edited&&e.edited.trim()?e.edited:e.answer||""}function Hs(e){switch(e.status){case"ready":return'<span class="pill pill-yes">ready</span>';case"needs_review":return'<span class="pill pill-maybe">needs review</span>';case"failed":return'<span class="pill pill-no">failed</span>';case"generating":return'<span class="pill pill-info">drafting…</span>';default:return'<span class="pill pill-info">not drafted</span>'}}function Ps(e){const t=mn(e),n=e.edited&&e.edited.trim(),s=e.status==="generating",a=t.length,o=e.max_length&&a>e.max_length,r=e.max_length?`<span class="answer-count${o?" over":""}">${a} / ${e.max_length}</span>`:`<span class="answer-count">${a} chars</span>`,l=!!t,p=l?"Regenerate":"Generate",u=l?"re-draft this answer (discards the current text)":"draft an answer to just this question";return`<div class="answer-card ac-${e.status}" data-aid="${e.id}">
    <div class="answer-prompt">${c(e.prompt)}</div>
    ${s?'<div class="answer-busy"><span class="spinner"></span><span>drafting…</span></div>':`<textarea class="ie answer-textarea" id="answer-edit-${e.id}" rows="5" spellcheck="false" placeholder="Generate an answer to this question, or write your own.">${c(t)}</textarea>`}
    <div class="answer-foot">
      ${Hs(e)}
      ${n?'<span class="answer-edited" title="your edit wins over the drafted answer">edited</span>':""}
      ${s?"":r}
      ${s?"":`<button class="btn ${l?"":"btn-primary "}answer-regen-btn" title="${u}">${p}</button>`}
      ${s?"":'<button class="answer-remove-btn" title="remove this question" aria-label="remove question">×</button>'}
    </div>
    ${e.status==="needs_review"?`<div class="answer-note answer-review">Flagged by the honesty check — confirm it doesn't overstate your experience before sending.</div>`:""}
    ${e.status==="failed"&&e.fail_reason?`<div class="answer-note answer-fail">${c(qs(e.fail_reason))}</div>`:""}
  </div>`}function qs(e){return e=String(e||""),e.length>160?e.slice(0,160)+"…":e}function Os(){const e=document.getElementById("answers-section");if(!e)return;const t=e.querySelector("#answers-start-btn");t&&t.addEventListener("click",hn);const n=e.querySelector("#answers-redetect-btn");n&&n.addEventListener("click",Rs),e.querySelectorAll(".answer-card[data-aid]").forEach(s=>{const a=s.dataset.aid,o=s.querySelector(".answer-textarea");o&&(N(o,p=>Ds(a,p),{multiline:!0}),o.addEventListener("input",()=>Ns(s,o)));const r=s.querySelector(".answer-regen-btn");r&&r.addEventListener("click",()=>Vs(a));const l=s.querySelector(".answer-remove-btn");l&&l.addEventListener("click",()=>Us(a))})}function Ns(e,t){const n=e.querySelector(".answer-count");if(!n)return;const s=t.value.length,a=n.textContent.includes("/")?parseInt(n.textContent.split("/")[1],10):0;n.textContent=a?`${s} / ${a}`:`${s} chars`,n.classList.toggle("over",!!a&&s>a)}async function hn(){const e=document.getElementById("answers-section"),t=e&&e.querySelector("#answers-start-btn");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/postings/${m.postingId}/answers`,{method:"POST"})}catch(a){d(`draft failed: ${a.message}`),t&&(t.disabled=!1);return}if(n.status===202){await me();return}if(n.status===412){let a={};try{a=await n.json()}catch{}fn(a.error),t&&(t.disabled=!1);return}if(n.status===503){yn("Answer generation isn't running in this build."),t&&(t.disabled=!1);return}const s=(await n.text().catch(()=>"")).trim();d(`draft failed: ${s||"HTTP "+n.status}`),t&&(t.disabled=!1)}async function Rs(){m.detecting=!0,$e();try{const e=await fetch(`/api/postings/${m.postingId}/answers/redetect`,{method:"POST"});if(!e.ok){const t=(await e.text().catch(()=>"")).trim();d(`detect failed: ${t||"HTTP "+e.status}`)}}catch(e){d(`detect failed: ${e.message}`)}m.detecting=!1,await me()}async function Ds(e,t){const n=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json(),a=m.answers.findIndex(o=>String(o.id)===String(e));a>=0&&(m.answers[a]=s)}async function Vs(e){let t;try{t=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({regenerate:!0})})}catch(n){d(`regenerate failed: ${n.message}`);return}if(t.status===503){yn("Answer generation isn't running in this build.");return}if(t.status===412){let n={};try{n=await t.json()}catch{}fn(n.error);return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();d(`regenerate failed: ${n||"HTTP "+t.status}`);return}await me()}async function Us(e){if(!confirm("Remove this question? Any answer drafted or written for it is discarded, and re-detecting won't bring it back."))return;let t;try{t=await fetch(`/api/answers/${e}`,{method:"DELETE"})}catch(n){d(`remove failed: ${n.message}`);return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();d(`remove failed: ${n||"HTTP "+t.status}`);return}await me()}function fn(e){const t=document.getElementById("answers-section");if(!t)return;const n=t.querySelector(".answers-actions"),s=document.createElement("div");s.className="blocks-gate",s.innerHTML=`
    <div class="draft-note">${c(e||"Drafting answers needs an experience page in your brain.")}</div>
    <div class="answers-actions">
      <button class="btn btn-primary" id="answers-fix-btn">View brain knowledge</button>
      <button class="btn" id="answers-retry-btn">Retry</button>
    </div>`,n?n.replaceWith(s):t.appendChild(s);const a=s.querySelector("#answers-fix-btn");a&&a.addEventListener("click",pt);const o=s.querySelector("#answers-retry-btn");o&&o.addEventListener("click",hn)}function yn(e){const t=document.getElementById("answers-section");if(!t)return;const n=document.createElement("div");n.className="draft-note",n.textContent=e,t.appendChild(n)}async function he(e){var l,p;const t=document.getElementById("pane"),n=document.getElementById("scrim"),s=i.openId===e&&t.classList.contains("open"),a=s?((l=document.getElementById("pane-body"))==null?void 0:l.scrollTop)??0:0,o=s?(p=document.getElementById("trace-body"))==null?void 0:p.innerHTML:null;i.openId=e,t.classList.add("open"),n.classList.add("open"),t.setAttribute("aria-hidden","false"),Xt("company"),s||(document.getElementById("pane-title").textContent="loading…",document.getElementById("pane-pills").innerHTML="",document.getElementById("pane-body").innerHTML='<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>');let r;try{const u=await fetch(`/api/companies/${e}`);if(!u.ok)throw new Error(`HTTP ${u.status}`);r=await u.json()}catch(u){s||(document.getElementById("pane-body").innerHTML=`<div class="muted">Failed to load detail: ${c(u.message)}</div>`);return}if(i.openId===e){if(xe(r),s){if(o!=null){const h=document.getElementById("trace-body");h&&(h.innerHTML=o)}const u=document.getElementById("pane-body");u&&(u.scrollTop=a)}_e(e)}}function Ie(){i.openId=null,i.openDetail=null,document.getElementById("pane").classList.remove("open"),document.getElementById("scrim").classList.remove("open"),document.getElementById("pane").setAttribute("aria-hidden","true")}function xe(e){i.openDetail=e,document.getElementById("pane-title").innerHTML=`<input class="ie ie-title" id="pane-title-input" placeholder="company name" value="${c(e.name||"")}">`,document.getElementById("pane-pills").innerHTML=`
    <span class="${y(e.has_verdict?e.verdict:"")}">${c(e.has_verdict?e.verdict:"unscored")}</span>
  `;const t=document.getElementById("pane-chat");t&&(t.style.display=i.meta&&i.meta.chat?"":"none",t.onclick=()=>It("company",e.company_id,e.name));const n=e.model==="manual",s=e.has_verdict?`
    <dl class="kv">
      <dt>verdict</dt><dd><span class="${y(e.verdict)}">${c(e.verdict)}</span>${n?' <span class="small muted">· set by hand</span>':""}</dd>
      <dt>reason</dt><dd>${c(e.reason||"")}</dd>
      <dt>model</dt><dd class="small muted">${c(e.model||"")}</dd>
      <dt>taste version</dt><dd class="small muted"><span class="tooltip" title="scored ${c(e.scored_at)} · model ${c(e.model)}">${c(e.taste_version||"")}</span></dd>
      <dt>scored at</dt><dd class="small muted">${c(e.scored_at||"")}</dd>
    </dl>
  `:'<div class="muted">Not yet scored. Run <code>scout verdict</code>, or set one by hand below.</div>',a=`
    <div class="verdict-edit" id="verdict-edit">
      <div class="ve-label muted small">${e.has_verdict?"override verdict":"set verdict"}</div>
      <div class="ve-pick" id="ve-pick">
        ${["yes","maybe","no"].map(f=>`<button type="button" class="ve-opt${e.has_verdict&&e.verdict===f?" is-on":""}" data-v="${f}">${f}</button>`).join("")}
      </div>
      <div class="prow">
        <input class="input" id="ve-reason" placeholder="reason (optional)" value="${n?c(e.reason||""):""}">
        <button class="btn btn-primary" id="ve-save-btn">Save</button>
      </div>
    </div>`,o=e.has_enrichment?`
    <dl class="kv">
      <dt>url</dt><dd>${e.website_url?`<a href="${_(e.website_url)}" target="_blank" rel="noopener">${c(e.website_url)} ↗</a>`:'<span class="muted">—</span>'}</dd>
      <dt>status</dt><dd class="small">${c(e.fetch_status||"")}${e.fetch_error?` <span class="muted">(${c(e.fetch_error)})</span>`:""}</dd>
      <dt>fetched</dt><dd class="small muted">${c(e.fetched_at||"")}</dd>
    </dl>
    ${e.website_summary?`<div class="summary-box">${c(e.website_summary)}</div>`:""}
  `:'<div class="muted">No enrichment yet. Run <code>scout enrich</code>.</div>',r=!i.meta||i.meta.control!==!1,l=r&&i.meta&&i.meta.verdict?'<button class="h3-action" id="rescore-btn" title="re-score just this company — replaces the current verdict, manual or not">↻ re-score</button>':"",p=r&&e.domain?'<button class="h3-action" id="reenrich-btn" title="re-fetch this company’s site now">↻ re-enrich</button>':"",u=Object.keys(e.raw_json||{}).sort(),h=u.length===0?"":`
    <details class="raw-json">
      <summary>Raw row <span class="dim">(${u.length} fields)</span></summary>
      <table><tbody>
        ${u.map(f=>`<tr><td class="k">${c(f)}</td><td>${c(e.raw_json[f])}</td></tr>`).join("")}
      </tbody></table>
    </details>
  `,g=`
    <div class="flag-bar">
      <span class="fb-state${e.flagged?" is-flagged":""}">
        ${e.flagged?"⚑ flagged":"not flagged"}
        <span class="small muted">· ${e.reviewed_at?`last reviewed ${c(e.reviewed_at)}`:"never reviewed"}</span>
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
    ${g}
    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1m-9 0h11a1 1 0 011 1v7a1 1 0 01-1 1H2.5a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>
        Jobs
      </h3>
      <div id="postings-list">${ot(e)}</div>
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
      <textarea class="ie ie-notes" id="pane-notes-input" rows="4" placeholder="—">${c(e.notes||"")}</textarea>
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M5 6h6M5 9h4"/></svg>
        Company facts
      </h3>
      <div id="facts-body">${zs(e)}</div>
      ${h}
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3 3 7-7"/></svg>
        Verdict
        ${l}
      </h3>
      ${s}
      ${a}
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 3 4 3 6s-1 4-3 6c-2-2-3-4-3-6s1-4 3-6z"/></svg>
        Enrichment
        ${p}
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

    <div class="pane-danger">
      <button class="btn-delete" id="company-delete-btn" title="permanently delete this company and everything attached to it">Delete company</button>
    </div>
  `;const R=document.getElementById("posting-add-btn");R&&R.addEventListener("click",()=>Ks(e)),it(),document.querySelectorAll("#ve-pick .ve-opt").forEach(f=>{f.addEventListener("click",()=>{document.querySelectorAll("#ve-pick .ve-opt").forEach(q=>q.classList.remove("is-on")),f.classList.add("is-on")})});const te=document.getElementById("ve-save-btn");te&&te.addEventListener("click",()=>Js(e)),N(document.getElementById("pane-title-input"),f=>sn(e,"name",f)),document.querySelectorAll("#facts-body [data-k]").forEach(f=>N(f,q=>sn(e,f.dataset.k,q))),N(document.getElementById("pane-domain-input"),f=>us(e,f)),N(document.getElementById("pane-notes-input"),f=>ps(e,f),{multiline:!0});const D=document.getElementById("flag-toggle-btn");D&&D.addEventListener("click",()=>gn(e.company_id));const K=document.getElementById("review-stamp-btn");K&&K.addEventListener("click",()=>Fs(e.company_id));const W=document.getElementById("rescore-btn");W&&W.addEventListener("click",()=>lt("verdict",{company_ids:[e.company_id]}));const $=document.getElementById("reenrich-btn");$&&$.addEventListener("click",()=>lt("enrich",{company_ids:[e.company_id]}));const A=document.getElementById("company-delete-btn");A&&A.addEventListener("click",()=>cs(e))}function zs(e){return`
    <div class="ie-grid">
      <div class="ie-field"><label>website${e.domain?` · <a href="https://${c(e.domain)}" target="_blank" rel="noopener">open ↗</a>`:""}</label>
        <input class="ie" id="pane-domain-input" placeholder="acme.com" value="${c(e.domain||"")}"></div>
      <div class="ie-field"><label>vertical</label>
        <input class="ie" data-k="vertical" placeholder="—" value="${c(e.vertical||"")}"></div>
      <div class="prow">
        <div class="ie-field"><label>location</label>
          <input class="ie" data-k="location" placeholder="—" value="${c(e.location||"")}"></div>
        <div class="ie-field"><label>headcount</label>
          <input class="ie" data-k="headcount" placeholder="—" value="${e.headcount||""}"></div>
      </div>
      <div class="ie-field"><label>stage</label>
        <input class="ie" data-k="funding_stage" placeholder="—" value="${c(e.funding_stage||"")}"></div>
    </div>
    <dl class="kv facts-ro">
      <dt>source</dt><dd class="small muted">${c(e.source)} · ${c(e.source_id)}</dd>
      <dt>ingested</dt><dd class="small muted">${c(e.ingested_at)}</dd>
    </dl>`}async function Fs(e){const t=document.getElementById("review-stamp-btn");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/companies/${e}/reviewed`,{method:"POST"})}catch(o){d(`failed: ${o.message}`),t&&(t.disabled=!1);return}if(!n.ok){const o=await n.text().catch(()=>"");d(`failed: HTTP ${n.status}${o?" — "+o:""}`),t&&(t.disabled=!1);return}const s=await n.json(),a=i.rows.find(o=>o.company_id===e);a&&(a.reviewed_at=s.reviewed_at,V()),i.openId===e&&(xe(s),_e(e)),d("reviewed")}async function gn(e){const t=i.rows.find(o=>o.company_id===e),n=!(t&&t.flagged);let s;try{s=await fetch(`/api/companies/${e}/flagged`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({flagged:n})})}catch(o){d(`failed: ${o.message}`);return}if(!s.ok){const o=await s.text().catch(()=>"");d(`failed: HTTP ${s.status}${o?" — "+o:""}`);return}const a=await s.json();t&&(t.flagged=a.flagged,V()),i.openId===e&&(xe(a),_e(e)),E(),d(a.flagged?"flagged":"unflagged")}async function Js(e){const t=document.querySelector("#ve-pick .ve-opt.is-on");if(!t){d("Pick yes, maybe, or no.");return}const n=t.dataset.v,s=document.getElementById("ve-reason").value.trim(),a=document.getElementById("ve-save-btn");a.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/verdict`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({verdict:n,reason:s})})}catch(l){d(`save failed: ${l.message}`),a.disabled=!1;return}if(!o.ok){const l=await o.text().catch(()=>"");d(`save failed: HTTP ${o.status}${l?" — "+l:""}`),a.disabled=!1;return}const r=await o.json();xe(r),_e(r.company_id),j(),B(),E(),d("verdict saved")}function ot(e){const t=e.postings||[];return t.length?t.map(n=>{const s=[n.location,n.source==="capture"?"captured":"added",(n.created_at||"").slice(0,10)].filter(Boolean).map(c).join(" · "),a=n.application_status||"",o=[n.next_up?'<span class="draft-badge db-next" style="margin-left:0" title="queued next up for outreach">next up</span>':"",`<span class="pill ${a?Ce(a)||"pill-stage":"pill-none"}">${c(a||"—")}</span>`,`<span class="pt-meta">${a?"tracked":"not applied"}</span>`,`<span class="pt-meta">${n.outreach_count?`${n.outreach_count} sent · last ${c(n.last_outreach_at||"?")}`:"no outreach yet"}</span>`].filter(Boolean).join("");return`
    <div class="brain-node posting-card" data-pid="${c(n.id)}" title="open the pursuit — tracking, outreach, drafts">
      <div class="n"><a href="${_(n.url)}" target="_blank" rel="noopener">${c(n.title||n.url)} ↗</a></div>
      ${n.description?`<div class="small muted" style="margin-top:3px">${c(n.description.length>200?n.description.slice(0,200).trimEnd()+"…":n.description)}</div>`:""}
      ${s?`<div class="l" style="margin-top:3px">${s}</div>`:""}
      <div class="pcard-status">${o}<span class="pcard-open">open →</span></div>
    </div>`}).join(""):'<div class="muted">No job links yet.</div>'}function fe(e,t){const n=i.openDetail;if(!n||!i.openId)return;const s=(n.postings||[]).find(o=>String(o.id)===String(e));if(!s)return;Object.assign(s,t);const a=document.getElementById("postings-list");a&&(a.innerHTML=ot(n),it())}function it(){document.querySelectorAll("#postings-list .posting-card").forEach(e=>{e.addEventListener("click",t=>{t.target.closest("a")||Zt(e.dataset.pid)})})}async function Ks(e){const t=document.getElementById("posting-url"),n=document.getElementById("posting-title"),s=document.getElementById("posting-add-btn"),a=t.value.trim();if(!a){d("Enter a URL first."),t.focus();return}s.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/postings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:a,title:n.value.trim()})})}catch(p){d(`add failed: ${p.message}`),s.disabled=!1;return}if(!o.ok){const p=await o.text().catch(()=>"");d(`add failed: HTTP ${o.status}${p?" — "+p:""}`),s.disabled=!1;return}const r=await o.json();e.postings=(e.postings||[]).filter(p=>p.id!==r.id),e.postings.unshift(r);const l=document.getElementById("postings-list");l&&(l.innerHTML=ot(e),it()),t.value="",n.value="",s.disabled=!1,E(),d("link added")}async function _e(e){let t;try{t=await fetch(`/api/companies/${e}/trace`)}catch(s){Ae(`<div class="muted">Failed to load trail: ${c(s.message)}</div>`);return}if(!t.ok){Ae(`<div class="muted">Failed to load trail: HTTP ${t.status}.</div>`);return}const n=(await t.json()).events||[];if(n.length===0){Ae('<div class="muted">No decision trail yet. Run <code>verdict</code> to record one — every scoring pass is captured here.</div>');return}Ae(n.map(Ws).join(""))}function Ws(e){const t=[e.criteria_source,e.taste_version].filter(Boolean).map(c);return e.run_id&&t.push("run "+c(e.run_id.slice(0,8))),`
    <div class="trail-event">
      <div class="trail-head">
        <span class="${y(e.verdict)}">${c(e.verdict)}</span>
        <span class="trail-meta mono">${c(e.model||"")}</span>
        <span class="trail-meta trail-time">${c(e.scored_at||"")}</span>
      </div>
      <div class="trail-decision">
        <span class="trail-reason">${c(e.reason||"")}</span>
      </div>
      <div class="trail-foot muted small">criteria: ${t.join(" · ")||"—"}</div>
    </div>`}function Ae(e){const t=document.getElementById("trace-body");t&&(t.innerHTML=e)}let vn;function d(e){const t=document.getElementById("toast");t.textContent=e,t.classList.toggle("err",/\b(fail(ed)?|error|disabled|already running)\b/i.test(e)),t.classList.add("show"),clearTimeout(vn),vn=setTimeout(()=>t.classList.remove("show"),2200)}async function bn(e,t="copied"){if(!e){d("nothing to copy");return}try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(e);else{const n=document.createElement("textarea");n.value=e,n.style.position="fixed",n.style.opacity="0",document.body.appendChild(n),n.select(),document.execCommand("copy"),document.body.removeChild(n)}d(t)}catch(n){d(`copy failed: ${n.message}`)}}i.meta={control:!1,brain:!1,verdict:!1};async function ct(){try{const s=await fetch("/api/meta");if(!s.ok)return;i.meta=await s.json()}catch{return}const e=i.meta.control;document.getElementById("btn-ingest").disabled=!e,document.getElementById("btn-enrich").disabled=!e;const t=document.getElementById("btn-verdict");t.disabled=!e||!i.meta.verdict,t.title=i.meta.verdict?"":"set ANTHROPIC_API_KEY in the server env to enable";const n=document.getElementById("open-chat");n&&(n.style.display=i.meta.chat?"":"none")}async function rt(){let e;try{const s=await fetch("/api/runs");if(!s.ok)return;e=await s.json()}catch{return}const t=e.busy_stage||"",n=document.getElementById("run-busy");t?(n.style.display="",document.getElementById("run-busy-label").textContent=t+" running…"):n.style.display="none",document.getElementById("btn-ingest").classList.toggle("busy",t==="ingest"),document.getElementById("btn-enrich").classList.toggle("busy",t==="enrich"),document.getElementById("btn-verdict").classList.toggle("busy",t==="verdict")}let He=null;async function lt(e,t){if(i.meta&&i.meta.control===!1){d("control surface disabled");return}let n;try{n=await fetch(`/api/run/${e}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t||{})})}catch(a){d(`run failed: ${a.message}`);return}if(n.status===409){d("a job is already running");return}if(n.status===412){const a=await n.text();d(a.trim());return}if(!n.ok){d(`run failed: HTTP ${n.status}`);return}const{job_id:s}=await n.json();_n(e,s,t)}async function Ys(e){const t=new FormData;t.append("csv",e);let n;try{n=await fetch("/api/ingest",{method:"POST",body:t})}catch(a){d(`upload failed: ${a.message}`);return}if(n.status===409){d("a job is already running");return}if(!n.ok){d(`upload failed: HTTP ${n.status}`);return}const{job_id:s}=await n.json();_n("ingest",s)}const Gs=["add-url","add-name","add-location","add-headcount","add-title","add-job-company"];let Pe=[],Q=new Set,X="company";function wn(e){X=e,document.querySelectorAll("#add-kind .v-chip").forEach(s=>s.classList.toggle("is-on",s.dataset.kind===e)),document.getElementById("add-company-fields").style.display=e==="company"?"":"none",document.getElementById("add-job-fields").style.display=e==="job"?"":"none";const t=document.getElementById("add-url-label"),n=document.getElementById("add-url");e==="company"?(t.innerHTML='Website<span class="req">*</span>',n.placeholder="acme.com"):(t.innerHTML='Posting URL<span class="req">*</span>',n.placeholder="https://… the job posting"),document.getElementById("add-save").textContent=e==="company"?"Add company":"Add job",kn()}function dt(){return!!i.meta.capture&&document.getElementById("add-enrich").checked}function kn(){const e=document.getElementById("add-note");dt()?e.innerHTML=X==="company"?"scout fetches the page and fills the blank fields — your values win. The page text also seeds enrichment, so the next Verdict can score it. Pages behind a login wall (LinkedIn) usually can't be fetched.":"scout fetches the posting and fills in the title, location and description — your values win. The job attaches to its company, adding it to the list first if needed. Pages behind a login wall (LinkedIn) usually can't be fetched.":e.innerHTML=X==="company"?"Stored as source <code>manual</code>. Run Enrich then Verdict to score it. A website already in the list is rejected — manual adds never overwrite an existing company.":"Stored as-is, no fetch. The job attaches to the typed company, or to the link's own domain when the posting lives on the company's site — for an ATS link (greenhouse, lever, …), type the company."}async function Zs(){Gs.forEach(s=>{document.getElementById(s).value=""}),document.getElementById("add-vertical-filter").value="",Q=new Set;const e=document.getElementById("add-enrich"),t=document.getElementById("add-enrich-row");e.disabled=!i.meta.capture,t.classList.toggle("disabled",!i.meta.capture),t.title=i.meta.capture?"":"set ANTHROPIC_API_KEY in the server env to enable",i.meta.capture||(e.checked=!1),wn(i.view==="jobs"?"job":"company");const n=document.getElementById("add-stage");n.innerHTML='<option value="">—</option>',document.getElementById("add-vertical-chips").innerHTML='<div class="none">loading…</div>',document.getElementById("add-company-names").innerHTML=(i.rows||[]).map(s=>`<option value="${c(s.name)}">`).join(""),document.getElementById("add-scrim").classList.add("open"),document.getElementById("add-url").focus();try{const s=await(await fetch("/api/facets")).json();(s.funding_stages||[]).forEach(a=>{const o=document.createElement("option");o.value=a,o.textContent=a,n.appendChild(o)}),Pe=s.verticals||[]}catch{Pe=[]}En()}function qe(){document.getElementById("add-scrim").classList.remove("open")}function En(){const e=document.getElementById("add-vertical-chips"),t=document.getElementById("add-vertical-filter").value.trim().toLowerCase(),n=Pe.filter(s=>!t||s.toLowerCase().includes(t));n.length?(e.innerHTML=n.map(s=>`<button type="button" class="vchip${Q.has(s)?" sel":""}" data-v="${c(s)}">${c(s)}</button>`).join(""),e.querySelectorAll(".vchip").forEach(s=>s.addEventListener("click",()=>{const a=s.dataset.v;Q.has(a)?Q.delete(a):Q.add(a),s.classList.toggle("sel"),$n()}))):e.innerHTML=`<div class="none">${Pe.length?"no match":"no verticals in the set yet"}</div>`,$n()}function $n(){const e=Q.size;document.getElementById("add-vertical-count").textContent=e?`· ${e} selected`:""}function In(e){return/^https?:\/\//i.test(e)?e:"https://"+e}async function xn(){const e=document.getElementById("add-url"),t=e.value.trim();if(!t){d(X==="company"?"Website is required.":"Posting URL is required."),e.focus();return}const n=document.getElementById("add-save"),s=n.textContent;n.disabled=!0,dt()&&(n.textContent="reading page…");const a=()=>{n.disabled=!1,n.textContent=s},o=g=>document.getElementById(g).value.trim(),r=dt();let l,p;r?(l="/api/capture",p={url:In(t),kind:X==="company"?"company_page":"job_posting",fields:X==="company"?{name:o("add-name"),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value,vertical:[...Q].join(", ")}:{name:o("add-job-company"),title:o("add-title")}}):X==="company"?(l="/api/companies",p={website:t,name:o("add-name"),vertical:[...Q].join(", "),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value}):(l="/api/postings",p={url:In(t),title:o("add-title"),company:o("add-job-company")});let u;try{u=await fetch(l,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(p)})}catch(g){d(`add failed: ${g.message}`),a();return}if(!u.ok){let g=`HTTP ${u.status}`;try{const R=await u.text();try{g=JSON.parse(R).error||g}catch{g=R.trim()||g}}catch{}if(a(),u.status===409){d(g||"That company is already in the list."),e.focus(),e.select();return}d(`add failed: ${g}`);return}const h=await u.json();if(a(),r&&!h.company_id){d(h.note||"couldn't classify that page");return}if(qe(),j(),B(),E(),X==="job"){const g=h.posting&&h.posting.title||"job link";d(`tracking: ${g} @ ${h.company_name}${h.posting_updated?" (refreshed)":""}`),M("jobs")}else r?(d(h.note||(h.company_created?`company added: ${h.company_name}`:`${h.company_name} is already in the list`)),he(h.company_id)):d("company added")}function _n(e,t,n){He=t;const s=document.getElementById("drawer"),a=document.getElementById("drawer-log");document.getElementById("drawer-title").textContent=e,document.getElementById("drawer-spinner").style.display="",document.getElementById("drawer-cancel").style.display="",document.getElementById("drawer-close").style.display="none",a.innerHTML="",s.classList.add("open"),rt();const o=new EventSource(`/api/jobs/${t}/stream`),r=(l,p)=>{const u=document.createElement("div"),h=!p&&/^\s*warn:/i.test(l);u.className="ln"+(p?" ln-err":h?" ln-warn":""),u.textContent=h?l.replace(/^\s*warn:\s*/i,"⚠ "):l,a.appendChild(u),a.scrollTop=a.scrollHeight};o.addEventListener("line",l=>r(l.data,/error|failed/i.test(l.data))),o.addEventListener("end",l=>{o.close(),He=null,r(`— ${l.data} —`,l.data==="failed"),document.getElementById("drawer-spinner").style.display="none",document.getElementById("drawer-cancel").style.display="none",document.getElementById("drawer-close").style.display="",d(`${e} ${l.data}`),n&&Array.isArray(n.company_ids)&&n.company_ids.length>0?Fn(n.company_ids):j(),B(),rt(),E(),i.openId&&he(i.openId)}),o.onerror=()=>{o.close()}}async function Qs(){if(He)try{await fetch(`/api/jobs/${He}/cancel`,{method:"POST"})}catch{}}let C=null;const Xs={researcher:"researcher",fill:"writer",humanizer:"humanizer",honesty:"honesty check"};function ut(e){return e==="application-stages"||e==="outreach-statuses"}function Oe(e){if(e==="outreach-template")return"outreach template";if(e==="followup-template")return"follow-up template";if(e==="taste-filter")return"pre-filter rules";if(e==="playbook")return"playbook";if(e==="application-stages")return"application stages";if(e==="outreach-statuses")return"outreach statuses";if(e&&e.startsWith("outreach-prompts/")){const t=e.slice(17);return(Xs[t]||t)+" prompt"}return e+".md"}async function F(e){C=e;const t=document.getElementById("editor-scrim");document.getElementById("editor-title").textContent="edit "+Oe(e),document.getElementById("editor-text").value="loading…",document.getElementById("editor-ver").textContent="";const n=!!e&&e.startsWith("outreach-prompts/"),s=n?e.slice(17):"",a=e==="taste-filter"||n&&s!=="fill";document.getElementById("editor-toggle-row").style.display=a?"":"none",document.getElementById("editor-reset").style.display=n?"":"none",a&&(document.getElementById("editor-toggle-label").textContent=e==="taste-filter"?"Enable the pre-filter (off → bulk verdict runs score every company; the rules below are kept either way)":"Run this stage (off → it is skipped in the pipeline)"),t.classList.add("open");try{const o=await fetch(`/api/${e}`);if(!o.ok){const l=(await o.text().catch(()=>"")).trim();document.getElementById("editor-text").value=o.status===404?"failed to load: HTTP 404 — this route is missing. Restart the scout server (your running binary may predate this feature).":`failed to load: ${l||"HTTP "+o.status}`;return}const r=await o.json();ut(e)?(document.getElementById("editor-title").textContent="edit "+Oe(e)+" — one per line",document.getElementById("editor-text").value=(r.statuses||[]).join(`
`)):document.getElementById("editor-text").value=r.content||"",a&&(document.getElementById("editor-enabled").checked=r.enabled!==!1),r.taste_version&&(document.getElementById("editor-ver").textContent="version "+r.taste_version)}catch(o){document.getElementById("editor-text").value="failed to load: "+o.message}}function Ne(){document.getElementById("editor-scrim").classList.remove("open"),C=null}const ea=[{key:"experience",hard:!0},{key:"voice",hard:!1},{key:"logistics",hard:!1}];async function pt(){document.getElementById("sources-scrim").classList.add("open"),document.getElementById("sources-list").innerHTML='<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>';try{ta(await(await fetch("/api/outreach/sources")).json())}catch(e){d(`failed to load sources: ${e.message}`)}}function mt(){document.getElementById("sources-scrim").classList.remove("open")}function ta(e){const t=document.getElementById("sources-list");if(!t)return;const n=e&&e.needs&&e.needs.length?e.needs.map(a=>({key:a.Key||a.key,hard:a.Hard??a.hard})):ea,s={};(e&&e.sources||[]).forEach(a=>{(s[a.need]=s[a.need]||[]).push(a)}),t.innerHTML=n.map(a=>{const o=s[a.key]||[],r=o.length?o.map(l=>`<li><span class="src-title">${c(l.title||l.page_id)}</span></li>`).join(""):`<li class="dim small">${a.hard?"none yet — add an experience page to your brain":"none (optional)"}</li>`;return`<div class="src-need">
      <div class="src-need-h">${c(a.key)}${a.hard?' <span class="dim">required</span>':' <span class="dim">optional</span>'}</div>
      <ul class="src-items">${r}</ul></div>`}).join("")}async function na(){if(!C)return;const e=document.getElementById("editor-text").value;let t;if(ut(C))t={statuses:e.split(/\r?\n/).map(o=>o.trim()).filter(Boolean)};else{t={content:e};const o=C.startsWith("outreach-prompts/")&&C!=="outreach-prompts/fill";(C==="taste-filter"||o)&&(t.enabled=document.getElementById("editor-enabled").checked)}let n;try{n=await fetch(`/api/${C}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})}catch(o){d(`save failed: ${o.message}`);return}if(!n.ok){d(`save failed: ${(await n.text().catch(()=>"")).trim()||"HTTP "+n.status}`);return}const s=await n.json();s.taste_version&&(document.getElementById("editor-ver").textContent="version "+s.taste_version);const a=ut(C);C==="followup-template"&&(i.followupTemplate=e),d(`${Oe(C)} saved`),Ne(),a&&L(),B()}async function sa(){if(!C||!C.startsWith("outreach-prompts/"))return;let e;try{e=await fetch(`/api/${C}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({reset:!0})})}catch(n){d(`reset failed: ${n.message}`);return}if(!e.ok){d(`reset failed: HTTP ${e.status}`);return}const t=await e.json();document.getElementById("editor-text").value=t.content||"",d(`${Oe(C)} reset to default`)}function Bn(e,t,n){e.k!==t?(e.k=t,e.dir=1):e.dir===1?e.dir=-1:Object.assign(e,n)}document.querySelectorAll("#t thead th[data-k]").forEach(e=>{e.onclick=()=>{Bn(i.sort,e.dataset.k,v),V()}}),document.querySelectorAll("#jt thead th[data-jk]").forEach(e=>{e.onclick=()=>{Bn(i.jsort,e.dataset.jk,w),T()}}),document.getElementById("tab-companies").onclick=()=>M("companies"),document.getElementById("tab-jobs").onclick=()=>M("jobs"),document.getElementById("q").oninput=V,document.getElementById("fdrop-cfilters-menu").addEventListener("click",e=>{const t=e.target.closest(".fdrop-item");if(t){if(t.dataset.toggle==="flagged")oe=!oe,G(t,oe);else if(t.dataset.toggle==="enriched")ie=!ie,G(t,ie);else if(t.hasAttribute("data-v")){const n=t.getAttribute("data-v");O.has(n)?O.delete(n):O.add(n),G(t,O.has(n))}else return;V()}}),document.getElementById("fdrop-columns-menu").addEventListener("click",e=>{const t=e.target.closest(".fdrop-item[data-col]");if(!t)return;const n=We(),s=t.getAttribute("data-col");n.hidden.has(s)?n.hidden.delete(s):n.hidden.add(s),localStorage.setItem(n.key,JSON.stringify([...n.hidden])),G(t,!n.hidden.has(s)),ce(),Ht()}),document.getElementById("jq").oninput=T;for(const e of["fdrop-cfilters","fdrop-columns","fdrop-jfilters"]){const t=document.getElementById(e);t.querySelector(".fdrop-btn").addEventListener("click",s=>{s.stopPropagation();const a=t.classList.contains("is-open");Ze(),a||Kn(t)}),t.querySelector(".fdrop-menu").addEventListener("click",s=>s.stopPropagation())}document.addEventListener("click",Ze),document.getElementById("fdrop-jfilters-menu").addEventListener("click",e=>{const t=e.target.closest(".fdrop-item");if(t){if(t.hasAttribute("data-stage")){const n=t.getAttribute("data-stage");x.has(n)?x.delete(n):x.add(n),G(t,x.has(n))}else if(t.dataset.toggle==="nextup")re=!re,G(t,re);else if(t.dataset.toggle==="notreached")le=!le,G(t,le);else if(t.hasAttribute("data-status")){const n=t.getAttribute("data-status");Y.has(n)?Y.delete(n):Y.add(n),G(t,Y.has(n))}else return;T()}}),Rn(),At(),ce(),document.getElementById("pane-close").onclick=Ie,document.getElementById("scrim").onclick=Ie,document.getElementById("pursuit-close").onclick=be,document.getElementById("pursuit-scrim").onclick=be,document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(document.querySelector(".fdrop.is-open")){Ze();return}if(document.getElementById("chat-pane").classList.contains("open")){xt();return}if(fa()){kt();return}if(document.getElementById("profile-scrim").classList.contains("open")){wt();return}if(document.getElementById("add-scrim").classList.contains("open")){qe();return}if(document.getElementById("run-scrim").classList.contains("open")){Re();return}if(document.getElementById("help-scrim").classList.contains("open")){De();return}if(document.getElementById("relink-scrim").classList.contains("open")){ue();return}if(document.getElementById("delcompany-scrim").classList.contains("open")){Se();return}if(document.getElementById("deljob-scrim").classList.contains("open")){je();return}const t=document.getElementById("pane").classList.contains("open"),n=document.getElementById("pursuit-pane").classList.contains("open");if(t||n){if(Qe==="pursuit"&&n){be();return}if(Qe==="company"&&t){Ie();return}if(t){Ie();return}be();return}if(document.getElementById("key-scrim").classList.contains("open")){bt();return}if(document.getElementById("sources-scrim").classList.contains("open")){mt();return}if(document.getElementById("editor-scrim").classList.contains("open")){Ne();return}if(document.getElementById("settings-scrim").classList.contains("open")){Et();return}});let ht=null;const aa={enrich:"Fetches and summarizes each company's pages, filling its enrichment row.",verdict:"Scores every company against your criteria — one LLM call each. Only companies with a successful enrichment are scored."};function Ln(e){if(i.meta&&i.meta.control===!1){d("control surface disabled");return}ht=e,document.getElementById("run-title").textContent="Run "+e,document.getElementById("run-desc").textContent=aa[e]||"",document.getElementById("run-only-blanks").checked=!1,document.getElementById("run-workers-input").value=e==="verdict"?10:8;const t=document.getElementById("run-warn"),n=i.stats||{},s=Math.max(0,(n.total_companies||0)-(n.enriched_ok||0));e==="verdict"&&s>0?(document.getElementById("run-warn-text").textContent=`${s} ${s===1?"company isn't":"companies aren't"} enriched yet — verdict will skip ${s===1?"it":"them"}. Run Enrich first to include ${s===1?"it":"them"}.`,t.style.display=""):t.style.display="none",document.getElementById("run-scrim").classList.add("open")}function Re(){document.getElementById("run-scrim").classList.remove("open"),ht=null}document.getElementById("btn-enrich").onclick=()=>Ln("enrich"),document.getElementById("btn-verdict").onclick=()=>Ln("verdict"),document.getElementById("run-cancel").onclick=Re,document.getElementById("run-scrim").onclick=e=>{e.target.id==="run-scrim"&&Re()},document.getElementById("run-go").onclick=()=>{const e=ht,t=document.getElementById("run-only-blanks").checked,n=parseInt(document.getElementById("run-workers-input").value,10);if(Re(),!e)return;const s={};t&&(s.only_blanks=!0),n>0&&(s.workers=n),lt(e,s)},document.getElementById("btn-ingest").onclick=()=>document.getElementById("csv-file").click(),document.getElementById("btn-add").onclick=Zs;const oa={add:{title:"Add data",intro:"Two ways to get companies and jobs into scout.",items:[{name:"Ingest CSV",sec:"ingest",desc:"Bulk-import companies from a CSV export (e.g. Crunchbase). Columns are mapped to company fields and new rows are created."},{name:"Add",sec:"ingest",desc:"Add one company or job from its link. Tick “fill in the blanks” to let an ATS API (ashby/greenhouse/lever) or one cheap agent pass complete the details."}]},run:{title:"Run the pipeline",intro:"Enrich must run before Verdict — verdict only scores companies that already have a successful enrichment row.",items:[{name:"Enrich",sec:"enrich",desc:"Fetches and summarizes each company's web presence into an enrichment row. A prerequisite for Verdict."},{name:"Verdict",sec:"verdict",desc:"Scores each enriched company against your criteria with the LLM, producing a yes / maybe / no with reasoning."}]}};function Tn(e){const t=oa[e];if(!t)return;document.getElementById("help-title").textContent=t.title;const n=document.getElementById("help-items");if(n.innerHTML="",t.intro){const s=document.createElement("p");s.className="help-intro",s.textContent=t.intro,n.appendChild(s)}t.items.forEach(s=>{const a=document.createElement("div");a.className="help-item";const o=document.createElement("div");o.className="help-item-name",o.textContent=s.name;const r=document.createElement("div");r.className="help-item-desc",r.textContent=s.desc;const l=document.createElement("a");l.className="help-link",l.textContent="Learn more →",l.onclick=()=>{De(),An(),ya(s.sec)},a.appendChild(o),a.appendChild(r),a.appendChild(l),n.appendChild(a)}),document.getElementById("help-scrim").classList.add("open")}function De(){document.getElementById("help-scrim").classList.remove("open")}document.getElementById("help-add").onclick=()=>Tn("add"),document.getElementById("help-run").onclick=()=>Tn("run"),document.getElementById("help-close").onclick=De,document.getElementById("help-scrim").onclick=e=>{e.target.id==="help-scrim"&&De()},document.getElementById("add-cancel").onclick=qe,document.getElementById("add-save").onclick=xn,document.getElementById("add-scrim").onclick=e=>{e.target.id==="add-scrim"&&qe()},document.querySelectorAll("#add-kind .v-chip").forEach(e=>{e.onclick=()=>wn(e.dataset.kind)}),document.getElementById("add-enrich").addEventListener("change",kn),document.getElementById("add-scrim").addEventListener("keydown",e=>{e.key==="Enter"&&(e.target.tagName!=="INPUT"||e.target.type==="checkbox"||e.target.id==="add-vertical-filter"||e.target.id==="add-job-company"||(e.preventDefault(),xn()))}),document.getElementById("add-vertical-filter").addEventListener("input",En),document.getElementById("add-headcount").addEventListener("input",e=>{const t=e.target.value.replace(/[^0-9]/g,"");t!==e.target.value&&(e.target.value=t)}),document.getElementById("csv-file").onchange=e=>{const t=e.target.files&&e.target.files[0];t&&Ys(t),e.target.value=""},document.getElementById("drawer-cancel").onclick=Qs,document.getElementById("drawer-close").onclick=()=>document.getElementById("drawer").classList.remove("open"),document.getElementById("editor-cancel").onclick=Ne,document.getElementById("editor-save").onclick=na,document.getElementById("editor-reset").onclick=sa,document.getElementById("editor-scrim").onclick=e=>{e.target.id==="editor-scrim"&&Ne()},document.getElementById("sources-close").onclick=mt,document.getElementById("sources-scrim").onclick=e=>{e.target.id==="sources-scrim"&&mt()},document.getElementById("key-cancel").onclick=bt,document.getElementById("key-save").onclick=Mn,document.getElementById("key-remove").onclick=pa,document.getElementById("key-scrim").onclick=e=>{e.target.id==="key-scrim"&&bt()},document.getElementById("key-input").addEventListener("keydown",e=>{e.key==="Enter"&&(e.preventDefault(),Mn())}),document.getElementById("delcompany-cancel").onclick=Se,document.getElementById("delcompany-confirm").onclick=rs,document.getElementById("delcompany-scrim").onclick=e=>{e.target.id==="delcompany-scrim"&&Se()},document.getElementById("deljob-cancel").onclick=je,document.getElementById("deljob-confirm").onclick=ds,document.getElementById("deljob-scrim").onclick=e=>{e.target.id==="deljob-scrim"&&je()},document.getElementById("relink-cancel").onclick=ue,document.getElementById("relink-scrim").onclick=e=>{e.target.id==="relink-scrim"&&ue()},document.getElementById("relink-search").addEventListener("input",e=>{tn(e.target.value)}),document.getElementById("relink-search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const t=document.querySelector("#relink-results .relink-result:not([disabled])");t&&nn(t.dataset.id)}}),document.getElementById("relink-results").addEventListener("click",e=>{const t=e.target.closest(".relink-result");t&&!t.disabled&&nn(t.dataset.id)});function ft(e){if(e==null)return"—";let t=Math.max(0,e|0);if(t<90)return`${t}s ago`;const n=Math.round(t/60);if(n<90)return`${n}m ago`;const s=Math.round(n/60);return s<48?`${s}h ago`:`${Math.round(s/24)}d ago`}async function yt(){try{const e=await fetch("/api/profile");if(!e.ok)throw new Error(`HTTP ${e.status}`);i.profile=await e.json()}catch{i.profile=null}ee()}const J='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.6 2.4a1.2 1.2 0 0 1 1.7 1.7L5.6 11.8l-3 1 1-3z"/><path d="M10.4 3.6l2 2"/></svg>',Ve='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 8a5.4 5.4 0 1 1-1.5-3.8"/><path d="M13.6 2.6V5.2H11"/></svg>',ia='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="11" r="2.6"/><path d="M6.9 9.1 13 3M11 5l1.6 1.6M9.3 6.7l1.6 1.6"/></svg>',Cn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="2.4"/></svg>',ca='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.2h7.2a1.6 1.6 0 0 1 1.6 1.6v8H4.6A1.6 1.6 0 0 1 3 11.2z"/><path d="M11.8 12.8h1.4v-9A1.6 1.6 0 0 0 11.6 2.4H5.4"/><path d="M5.4 5.8h3.6M5.4 8.2h3.6"/></svg>',Sn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3.5" width="12" height="9" rx="1.6"/><path d="M2.6 4.6 8 8.8l5.4-4.2"/></svg>',gt='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.2h5.4l2.6 2.6v9H4z"/><path d="M9.4 2.2v2.6H12"/><path d="M6 7h4M6 9.2h4M6 11.4h2.4"/></svg>',ra='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.6v2M8 12.4v2M14.4 8h-2M3.6 8h-2M12.5 3.5 11 5M5 11l-1.5 1.5M12.5 12.5 11 11M5 5 3.5 3.5"/><circle cx="8" cy="8" r="2.2"/></svg>',la='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.4 3.4h11.2L9.4 8.4v4.2l-2.8 1.4V8.4z"/></svg>';function P(e){const t=e.dot||e.note?`<div class="crit-status">${e.dot?`<span class="pf-dot ${e.dot}"></span>`:""}${e.note?`<span class="crit-note-t">${c(e.note)}</span>`:""}</div>`:"",n=e.actID?` id="${e.actID}"`:"",s=e.act?`<button class="crit-edit"${n} data-act="${e.act}" title="${e.actTitle}" aria-label="${e.actLabel}">${e.actIcon}</button>`:"";return`<div class="settings-item">
    <span class="settings-item-icon">${e.icon}</span>
    <div class="settings-item-main">
      <div class="settings-item-name">${e.nameHTML}</div>
      <div class="settings-item-desc">${c(e.desc)}</div>
      ${t}
    </div>
    ${s}
  </div>`}function ee(){const e=document.getElementById("criteria-stats");if(!e)return;const t=i.profile,s=(t&&t.active_source||i.stats&&i.stats.taste_source||"").startsWith("brain:"),a=t&&typeof t.body=="string";let o;if(s){let I="off",S="";const Be=t&&t.criteria_state;Be==="current"?(I="ok",S="current · verified "+ft(t.verified_age_seconds)):Be==="changed"?(I="warn",S="changed — re-distill"):Be==="unverified"?(I="warn",S=t&&!t.reachable&&a?"brain offline · using cache":"unverified — re-distill"):t&&!t.reachable&&a?(I="warn",S="brain offline · using cache"):a&&(I="ok",S="fetched "+ft(t.age_seconds)),o=P({icon:Cn,nameHTML:a?'<span class="edit-link" data-act="view-profile" title="view the company-fit brief">company-fit brief</span>':"company-fit brief",dot:I,note:S,desc:"The criteria scout feeds the verdict stage — distilled from the brain.",act:"refresh-profile",actID:"refresh-profile",actIcon:Ve,actTitle:"re-distill the company-fit brief from the brain",actLabel:"refresh company-fit brief"})}else o=P({icon:Cn,nameHTML:'<span class="edit-link" data-act="edit-taste" title="edit taste.md">taste</span>',note:t&&t.configured?"brain offline — local fallback":"",dot:t&&t.configured?"warn":"",desc:"Local fallback criteria used when the brain is unreachable.",act:"edit-taste",actIcon:J,actTitle:"edit taste.md",actLabel:"edit taste"});const r=i.sources&&i.sources.sources||[],l=r.filter(I=>I.need==="experience").length,p=r.filter(I=>I.need==="voice").length,u=r.filter(I=>I.need==="logistics").length;let h="off",g="syncs from your brain on the next draft";l>0?(h="ok",g=`synced · ${l} experience · ${p} voice · ${u} logistics`):r.length>0&&(h="warn",g="no experience page in your brain yet");const R=r.length?'<span class="edit-link" data-act="view-sources" title="view discovered experience, voice + logistics">outreach knowledge</span>':"outreach knowledge",te=P({icon:ra,nameHTML:R,dot:h,note:g,desc:"Your experience, voice + logistics, synced from the brain to ground outreach and application answers."}),D=P({icon:ca,nameHTML:'<span class="edit-link" data-act="edit-playbook" title="edit the verdict playbook">playbook</span>',desc:"How scout judges — the reasoning rules behind every verdict.",act:"edit-playbook",actIcon:J,actTitle:"edit the verdict playbook",actLabel:"edit playbook"}),K=P({icon:Sn,nameHTML:'<span class="edit-link" data-act="edit-template" title="edit the outreach email template">email template</span>',desc:"The outreach email format — verbatim prose with fill-in holes.",act:"edit-template",actIcon:J,actTitle:"edit the outreach email template",actLabel:"edit email template"}),W=P({icon:Sn,nameHTML:'<span class="edit-link" data-act="edit-followup-template" title="edit the follow-up template">follow-up template</span>',desc:"Copy-paste follow-up — variables {{contact_name}}, {{role}}, {{company}}, {{last_sent}}, {{last_message}}.",act:"edit-followup-template",actIcon:J,actTitle:"edit the follow-up template",actLabel:"edit follow-up template"}),$=[["researcher","1 · Researcher","Searches the web for true company facts and the best hooks to open with."],["fill","2 · Writer","Writes the email's blanks from the research, your experience, and your voice."],["humanizer","3 · Humanizer","Strips AI tells and matches your voice — never changes a fact."],["honesty","4 · Honesty check","Vetoes any claim about you beyond your documented experience."]],A=$.map(([I,S,Be])=>P({icon:gt,nameHTML:`<span class="edit-link" data-act="edit-prompt-${I}" title="edit the ${S.replace(/^\d+ · /,"")} prompt">${S}</span>`,desc:Be,act:`edit-prompt-${I}`,actIcon:J,actTitle:`edit the ${S} prompt`,actLabel:`edit ${S} prompt`})).join(""),f=!i.stats||i.stats.taste_filter_enabled!==!1,q=P({icon:la,nameHTML:'<span class="edit-link" data-act="edit-taste-filter" title="edit the pre-filter rules">pre-filter</span>',desc:"Cheap mechanical gate before the LLM verdict — location, headcount, vertical, stage. Toggle it off in the editor to score every company.",dot:f?"ok":"off",note:f?"active":"disabled — scoring everything",act:"edit-taste-filter",actIcon:J,actTitle:"edit the pre-filter rules",actLabel:"edit pre-filter rules"}),Je=i.anthropicKey;let _t="off",Bt="not set — verdict, capture & outreach disabled";Je&&Je.key_source==="db"?(_t="ok",Bt="set here · active"):Je&&Je.key_source==="env"&&(_t="ok",Bt="from the environment");const Ia=P({icon:ia,nameHTML:'<span class="edit-link" data-act="edit-anthropic-key" title="set the Anthropic API key">Anthropic API key</span>',dot:_t,note:Bt,desc:"Powers scoring, capture & outreach. Set here to run scout without the env var.",act:"edit-anthropic-key",actIcon:J,actTitle:"set the Anthropic API key",actLabel:"set Anthropic API key"}),xa=P({icon:gt,nameHTML:'<span class="edit-link" data-act="edit-application-stages" title="edit the application stages">application stages</span>',desc:"The application pipeline labels you track (applied, screening, interview…). One per line.",act:"edit-application-stages",actIcon:J,actTitle:"edit the application stages",actLabel:"edit application stages"}),_a=P({icon:gt,nameHTML:'<span class="edit-link" data-act="edit-outreach-statuses" title="edit the outreach statuses">outreach statuses</span>',desc:"The outreach reply labels (initial contact, no response, replied…). One per line.",act:"edit-outreach-statuses",actIcon:J,actTitle:"edit the outreach statuses",actLabel:"edit outreach statuses"});e.innerHTML=`<div class="settings-section">
       <div class="settings-group-h">Job hunting</div>
       ${o}${D}${q}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Tracking</div>
       ${xa}${_a}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Outreach</div>
       ${te}${K}${W}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Outreach pipeline</div>
       ${A}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Integrations</div>
       ${Ia}
     </div>`;const Lt={"view-profile":()=>ha(i.profile),"refresh-profile":ma,"edit-taste":()=>F("taste"),"edit-taste-filter":()=>F("taste-filter"),"edit-application-stages":()=>F("application-stages"),"edit-outreach-statuses":()=>F("outreach-statuses"),"edit-playbook":()=>F("playbook"),"edit-template":()=>F("outreach-template"),"edit-followup-template":()=>F("followup-template"),"view-sources":pt,"edit-anthropic-key":ua};for(const[I]of $)Lt[`edit-prompt-${I}`]=()=>F(`outreach-prompts/${I}`);e.querySelectorAll("[data-act]").forEach(I=>{const S=I.dataset.act;S&&Lt[S]&&(I.onclick=Lt[S])})}async function da(){try{i.sources=await(await fetch("/api/outreach/sources")).json()}catch{i.sources=null}ee()}async function jn(){try{i.anthropicKey=await(await fetch("/api/integrations/anthropic")).json()}catch{i.anthropicKey=null}ee()}async function ua(){document.getElementById("key-scrim").classList.add("open"),document.getElementById("key-input").value="",await jn(),vt();const e=document.getElementById("key-input");e&&e.focus()}function vt(){const e=i.anthropicKey||{},t=document.getElementById("key-status");t&&(t.textContent=e.key_source==="db"?"A key is set here (stored in scout).":e.key_source==="env"?"Using the ANTHROPIC_API_KEY environment variable. Saving a key here overrides it.":"No key set. Scoring, capture, and outreach are disabled until you add one.");const n=document.getElementById("key-remove");n&&(n.style.display=e.key_source==="db"?"":"none");const s=document.getElementById("key-restart-hint");if(s){const a=e.has_key&&i.meta&&(i.meta.outreach===!1||i.meta.chat===!1);s.style.display=a?"":"none"}}function bt(){document.getElementById("key-scrim").classList.remove("open")}async function Mn(){const e=(document.getElementById("key-input").value||"").trim();if(!e){d("paste a key first");return}const t=document.getElementById("key-save");t&&(t.disabled=!0,t.textContent="Verifying…");const n=()=>{t&&(t.disabled=!1,t.textContent="Save key")};let s;try{s=await fetch("/api/integrations/anthropic",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:e})})}catch(a){d(`save failed: ${a.message}`),n();return}if(!s.ok){d((await s.text().catch(()=>"")).trim()||`HTTP ${s.status}`),n();return}i.anthropicKey=await s.json(),document.getElementById("key-input").value="",n(),d("Anthropic key saved"),await ct(),vt(),ee()}async function pa(){const e=document.getElementById("key-remove");e&&(e.disabled=!0);let t;try{t=await fetch("/api/integrations/anthropic",{method:"DELETE"})}catch(n){d(`remove failed: ${n.message}`),e&&(e.disabled=!1);return}if(e&&(e.disabled=!1),!t.ok){d((await t.text().catch(()=>"")).trim()||`HTTP ${t.status}`);return}i.anthropicKey=await t.json(),d(i.anthropicKey.has_key?"removed — using the environment key":"Anthropic key removed"),await ct(),vt(),ee()}async function ma(){const e=document.getElementById("refresh-profile");e&&(e.classList.add("spinning"),e.disabled=!0);let t;try{t=await fetch("/api/profile/refresh",{method:"POST"})}catch(n){d(`refresh failed: ${n.message}`),yt();return}if(!t.ok){const n=await t.text().catch(()=>"");d(`refresh failed: ${(n||"").trim()||"HTTP "+t.status}`),yt();return}i.profile=await t.json(),ee(),d("company-fit brief refreshed"),B()}function ha(e){!e||typeof e.body!="string"||(document.getElementById("profile-modal-meta").textContent=`${e.chars||0} chars · fetched ${ft(e.age_seconds)}`,document.getElementById("profile-modal-body").textContent=e.body,document.getElementById("profile-scrim").classList.add("open"))}function wt(){document.getElementById("profile-scrim").classList.remove("open")}document.getElementById("profile-modal-close").onclick=wt,document.getElementById("profile-scrim").onclick=e=>{e.target.id==="profile-scrim"&&wt()};function An(){document.getElementById("docs-scrim").classList.add("open");const e=document.querySelector("#docs-nav a");Ue(e?e.dataset.sec:null);const t=document.getElementById("docs-body");t&&(t.scrollTop=0)}function kt(){document.getElementById("docs-scrim").classList.remove("open")}function fa(){return document.getElementById("docs-scrim").classList.contains("open")}function Ue(e){document.querySelectorAll("#docs-nav a").forEach(t=>t.classList.toggle("active",t.dataset.sec===e))}function ya(e){const t=document.getElementById("doc-"+e);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),Ue(e)}document.getElementById("open-docs").onclick=An,document.getElementById("docs-close").onclick=kt,document.getElementById("docs-scrim").onclick=e=>{e.target.id==="docs-scrim"&&kt()};function ga(){document.getElementById("settings-scrim").classList.add("open"),ee()}function Et(){document.getElementById("settings-scrim").classList.remove("open")}document.getElementById("open-settings").onclick=ga,document.getElementById("settings-close").onclick=Et,document.getElementById("settings-scrim").onclick=e=>{e.target.id==="settings-scrim"&&Et()},document.querySelectorAll("#docs-nav a").forEach(e=>{e.onclick=()=>{const t=document.getElementById("doc-"+e.dataset.sec);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),Ue(e.dataset.sec)}}),function(){const e=document.getElementById("docs-body");if(!e||!("IntersectionObserver"in window))return;const t=new IntersectionObserver(n=>{const s=n.filter(a=>a.isIntersecting).sort((a,o)=>a.boundingClientRect.top-o.boundingClientRect.top);s.length&&Ue(s[0].target.id.replace(/^doc-/,""))},{root:e,rootMargin:"0px 0px -65% 0px",threshold:0});document.querySelectorAll("#docs-body section").forEach(n=>t.observe(n))}(),i.chat={scope:null,scopeId:"",threadId:null,streaming:!1,es:null};function va(e){return(e||[]).filter(t=>t&&t.type==="text").map(t=>t.text||"").join("")}function ba(e){return(e||[]).filter(t=>t&&t.type==="tool_use").map(t=>t.name)}function ze(e,t){const n=document.createElement("div");return n.className="chat-msg chat-"+e,n.textContent=t||"",n}function $t(){const e=document.getElementById("chat-messages");e.scrollTop=e.scrollHeight}function wa(){const e=document.createElement("div");return e.className="chat-empty",e.textContent=i.chat.scope==="global"?"Tell me about a job you applied to (paste the link), or ask what's already tracked.":"Ask about this "+(i.chat.scope==="company"?"company":"role")+" — I can research it on the web and update scout.",e}function Hn(e){const t=document.getElementById("chat-messages");t.innerHTML="";for(const n of e||[]){const s=va(n.content);if(n.role==="user")s&&t.appendChild(ze("user",s));else if(n.role==="assistant"){const a=ba(n.content);if(!s&&!a.length)continue;const o=ze("assistant",s);if(a.length){const r=document.createElement("div");r.className="chat-tools",r.textContent="· used "+a.join(", "),o.appendChild(r)}t.appendChild(o)}}t.children.length||t.appendChild(wa()),$t()}async function It(e,t,n){if(!i.meta||!i.meta.chat){d("chat needs ANTHROPIC_API_KEY in the server env");return}i.chat.es&&(i.chat.es.close(),i.chat.es=null),i.chat={scope:e,scopeId:t||"",threadId:null,streaming:!1,es:null},document.getElementById("chat-title").textContent=e==="global"?"Chat":e==="company"?"Chat · company":"Chat · role",document.getElementById("chat-sub").textContent=e==="global"?"":n||"";const s=document.getElementById("chat-messages");s.innerHTML='<div class="chat-empty">loading…</div>';const a=document.getElementById("chat-pane");a.classList.add("open"),document.getElementById("chat-scrim").classList.add("open"),a.setAttribute("aria-hidden","false");try{const o="scope="+encodeURIComponent(e)+(t?"&scope_id="+encodeURIComponent(t):""),r=await fetch("/api/chat/threads?"+o);if(!r.ok)throw new Error((await r.text().catch(()=>"")).trim()||"HTTP "+r.status);const l=await r.json();i.chat.threadId=l.thread.id,Hn(l.messages||[])}catch(o){s.innerHTML='<div class="chat-empty">Failed to open chat: '+c(o.message)+"</div>";return}document.getElementById("chat-input").focus()}function xt(){i.chat.es&&(i.chat.es.close(),i.chat.es=null);const e=document.getElementById("chat-pane");e.classList.remove("open"),document.getElementById("chat-scrim").classList.remove("open"),e.setAttribute("aria-hidden","true")}function Fe(e){i.chat.streaming=e,document.getElementById("chat-send").disabled=e;const t=document.getElementById("chat-input");t.disabled=e,e||t.focus()}function Pn(){const e=document.getElementById("chat-input");e.style.height="auto",e.style.height=Math.min(e.scrollHeight,160)+"px"}async function qn(){const e=document.getElementById("chat-input"),t=e.value.trim();if(!t||i.chat.streaming||!i.chat.threadId)return;e.value="",Pn(),Fe(!0);const n=document.getElementById("chat-messages"),s=n.querySelector(".chat-empty");s&&s.remove(),n.appendChild(ze("user",t));const a=ze("assistant","");a.classList.add("chat-streaming"),n.appendChild(a),$t();let o="";const r=h=>{a.classList.remove("chat-streaming"),a.textContent="⚠ "+h,Fe(!1)},l=i.chat.threadId;let p;try{p=await fetch("/api/chat/"+l+"/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t})})}catch(h){r(h.message);return}if(!p.ok){r((await p.text().catch(()=>"")).trim()||"HTTP "+p.status);return}const u=new EventSource("/api/chat/"+l+"/stream");i.chat.es=u,u.addEventListener("delta",h=>{o+=h.data,a.textContent=o,$t()}),u.addEventListener("end",async h=>{u.close(),i.chat.es===u&&(i.chat.es=null),a.classList.remove("chat-streaming"),Fe(!1),i.chat.threadId===l&&await ka(),Ea(),typeof h.data=="string"&&h.data.indexOf("error")===0&&d("chat: "+h.data)}),u.onerror=()=>{u.close(),i.chat.es===u&&(i.chat.es=null),a.classList.remove("chat-streaming"),Fe(!1)}}async function ka(){const e=i.chat.scope,t=i.chat.scopeId,n="scope="+encodeURIComponent(e)+(t?"&scope_id="+encodeURIComponent(t):"");try{const s=await fetch("/api/chat/threads?"+n);if(!s.ok)return;const a=await s.json();Hn(a.messages||[])}catch{}}function Ea(){j(),E(),B(),i.openId&&he(i.openId)}document.getElementById("open-chat").onclick=()=>It("global","",""),document.getElementById("chat-close").onclick=xt,document.getElementById("chat-scrim").onclick=xt,document.getElementById("chat-form").addEventListener("submit",e=>{e.preventDefault(),qn()}),document.getElementById("chat-input").addEventListener("input",Pn),document.getElementById("chat-input").addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),qn())}),Ot("#t tbody",Un),Ot("#jt tbody",zn);const $a=(()=>{try{return localStorage.getItem("scout-view")}catch{return null}})();M($a==="jobs"?"jobs":"companies",{render:!1});function On(){const e=document.querySelector(".layout");e&&(e.style.transform="translateZ(0)",requestAnimationFrame(()=>requestAnimationFrame(()=>{e.style.transform=""})))}document.addEventListener("visibilitychange",()=>{document.hidden||On()}),window.addEventListener("pageshow",e=>{e.persisted&&On()}),j(),E(),B(),ct(),rt(),yt(),da(),jn(),L()}Ta({"":{view:()=>({mount(b){b.innerHTML=Aa,Ha()}}),chrome:!1}},{title:"scout"});ja();Ma();
