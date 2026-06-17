(function(){const i=document.createElement("link").relList;if(i&&i.supports&&i.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))L(r);new MutationObserver(r=>{for(const g of r)if(g.type==="childList")for(const x of g.addedNodes)x.tagName==="LINK"&&x.rel==="modulepreload"&&L(x)}).observe(document,{childList:!0,subtree:!0});function y(r){const g={};return r.integrity&&(g.integrity=r.integrity),r.referrerPolicy&&(g.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?g.credentials="include":r.crossOrigin==="anonymous"?g.credentials="omit":g.credentials="same-origin",g}function L(r){if(r.ep)return;r.ep=!0;const g=y(r);fetch(r.href,g)}})();function ga(v,i){const y=i.replace(/^#/,"");let L=null;for(const r of Object.keys(v))(y===r||y.startsWith(r))&&(L===null||r.length>L.length)&&(L=r);return L===null&&""in v&&(L=""),L}function ya(v){return typeof v=="function"?{view:v,chrome:!0}:{view:v.view,chrome:v.chrome!==!1}}function va(v,i={}){const y=i.root??document.body,L=i.title??document.title??"",r=i.brandHref??"#",g=document.createElement("main"),x=document.createElement("header");x.className="cap-head";const b=document.createElement("a");b.className="brand",b.href=r,b.textContent=L,b.setAttribute("aria-label",`${L} — home`),x.appendChild(b);const R=document.createElement("nav");R.className="cap-nav",R.setAttribute("aria-label","Views");for(const w of i.nav??[]){const j=document.createElement("a");j.href=w.href,j.textContent=w.label,w.ariaLabel&&j.setAttribute("aria-label",w.ariaLabel),R.appendChild(j)}x.appendChild(R);const A=document.createElement("section");A.className="tk-content",g.appendChild(x),g.appendChild(A);const S=document.createElement("div");S.className="tk-bleed";const ze=w=>{var j;for(const q of Array.from(R.querySelectorAll("a"))){const D=((j=q.getAttribute("href"))==null?void 0:j.replace(/^#/,""))??"";q.toggleAttribute("aria-current",w!==null&&w!==""&&D===w),q.hasAttribute("aria-current")&&q.setAttribute("aria-current","page")}};let le=0;const Y=()=>{const w=ga(v,location.hash);if(ze(w),w===null){S.isConnected&&S.remove(),g.isConnected||y.appendChild(g),ba(A,"Not found.");return}const{view:j,chrome:q}=ya(v[w]),D=q?A:S;q?(S.isConnected&&S.remove(),g.isConnected||y.appendChild(g)):(g.isConnected&&g.remove(),S.isConnected||y.appendChild(S)),D.replaceChildren();const V=j(),ee=++le,G=V.mount(D);G instanceof Promise&&G.catch(Fe=>{ee===le&&wa(D,String(Fe))})};window.addEventListener("hashchange",Y),Y()}function ba(v,i){v.replaceChildren();const y=document.createElement("div");y.className="tk-empty",y.textContent=i,v.appendChild(y)}function wa(v,i){v.replaceChildren();const y=document.createElement("div");y.className="tk-error",y.textContent=i,v.appendChild(y)}function ka(){if(!("serviceWorker"in navigator))return;if(["localhost","127.0.0.1","[::1]",""].includes(location.hostname)){navigator.serviceWorker.getRegistrations().then(i=>{for(const y of i)y.unregister()}),window.caches&&caches.keys().then(i=>{for(const y of i)caches.delete(y)});return}window.addEventListener("load",()=>{navigator.serviceWorker.register("/sw.js").catch(()=>{})})}async function Ea(){let v;try{v=await fetch("/api/me",{headers:{Accept:"application/json"}})}catch{return null}if(!v.ok)return null;let i;try{i=await v.json()}catch{return null}return typeof i.email=="string"&&i.email?{email:i.email}:null}const $a=`
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
        <button class="v-chip" id="enriched-filter" title="show only companies with a clean enrichment fetch">enriched</button>
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
      <div class="filter-dropdowns">
        <div class="fdrop" id="fdrop-application">
          <button class="fdrop-btn" id="fdrop-application-btn" aria-haspopup="true" aria-expanded="false" title="filter by application stage">
            <span class="fdrop-label-txt">Application</span>
            <span class="fdrop-count" style="display:none"></span>
            <svg class="fdrop-chev" viewBox="0 0 10 6" aria-hidden="true"><path d="M0 0l5 6 5-6z" fill="currentColor"/></svg>
          </button>
          <div class="fdrop-menu" id="fdrop-application-menu" role="menu"></div>
        </div>
        <div class="fdrop" id="fdrop-outreach">
          <button class="fdrop-btn" id="fdrop-outreach-btn" aria-haspopup="true" aria-expanded="false" title="filter by outreach status">
            <span class="fdrop-label-txt">Outreach</span>
            <span class="fdrop-count" style="display:none"></span>
            <svg class="fdrop-chev" viewBox="0 0 10 6" aria-hidden="true"><path d="M0 0l5 6 5-6z" fill="currentColor"/></svg>
          </button>
          <div class="fdrop-menu" id="fdrop-outreach-menu" role="menu"></div>
        </div>
      </div>
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
        <span>Discovered from your brain by an LLM over the document map: <strong>experience</strong> (required — the honesty checker's ground truth), <strong>voice</strong> (optional), and <strong>logistics</strong> (optional — current location, work authorization, availability, comp: the only source application answers may state these from; without it those facts fall back to fill-in placeholders). “Refresh” re-runs discovery when new pages appear; remove a wrong pick with ✕. The pages are fetched whole and cached locally; drafting reads the cache.</span>
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
`;function Ia(v){const i={rows:[],sort:{k:"verdict",dir:1},openId:null,stats:null,profile:null,view:"companies",jobs:[],jsort:{k:"created_at",dir:1},applicationStages:["applied","screening","interview","offer","rejected"],outreachStatuses:["initial contact","no response","replied","followed up"],openDetail:null,anthropicKey:null},y=e=>"pill pill-"+(e||"none"),L='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 14V2.5"/><path d="M3.5 2.5c3-1.2 6 1.2 9 0V9c-3 1.2-6-1.2-9 0z"/></svg>',r=e=>String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),g=e=>/^https?:\/\//i.test(String(e??""))?r(e):"#";async function x(){const t=await(await fetch("/api/companies")).json();i.rows=t.rows||[],M()}async function b(){let e;try{const t=await fetch("/api/postings");if(!t.ok)return;e=await t.json()}catch{return}i.jobs=e.rows||[],_(),R(),S()}function R(){if(!h.postingId)return;const e=i.jobs.find(t=>t.posting_id===h.postingId);e&&(h.row=e,document.getElementById("pursuit-pane").classList.contains("open")&&Z())}let A=null;function S(){const e=i.jobs.some(t=>t.outreach_draft_status==="researching");e&&!A?A=setInterval(ze,4e3):!e&&A&&(clearInterval(A),A=null)}async function ze(){let e;try{const s=await fetch("/api/postings");if(!s.ok)return;e=await s.json()}catch{return}const t=e.rows||[],n=new Map(i.jobs.map(s=>[s.posting_id,s.outreach_draft_status])),a=t.some(s=>n.get(s.posting_id)!==s.outreach_draft_status)||t.length!==i.jobs.length;i.jobs=t,a&&(_(),R()),S()}async function le(){await Promise.all([fetch("/api/application-stages").then(e=>e.ok?e.json():null).then(e=>{e&&Array.isArray(e.statuses)&&e.statuses.length&&(i.applicationStages=e.statuses)}).catch(()=>{}),fetch("/api/outreach-statuses").then(e=>e.ok?e.json():null).then(e=>{e&&Array.isArray(e.statuses)&&e.statuses.length&&(i.outreachStatuses=e.statuses)}).catch(()=>{})]),Nt(),i.view==="jobs"&&_()}function Y(e,{render:t=!0}={}){i.view=e;try{localStorage.setItem("scout-view",e)}catch{}document.getElementById("tab-companies").classList.toggle("active",e==="companies"),document.getElementById("tab-jobs").classList.toggle("active",e==="jobs"),document.getElementById("companies-view").style.display=e==="companies"?"":"none",document.getElementById("jobs-view").style.display=e==="jobs"?"":"none",document.getElementById("block-filter-companies").style.display=e==="companies"?"":"none",document.getElementById("block-filter-jobs").style.display=e==="jobs"?"":"none",Ke(),t&&(e==="jobs"?_():M())}async function w(){let e;try{const t=await fetch("/api/stats");if(!t.ok)throw new Error(`HTTP ${t.status}`);e=await t.json()}catch(t){const n=document.getElementById("unscored-n");n.textContent="–",n.title=`stats failed: ${t.message}`;return}i.stats=e,j()}function j(){const e=i.stats||{};document.getElementById("unscored-n").textContent=e.unscored??0,N()}function q(e,t,n){const a=e[n]??"",s=t[n]??"";if(n==="headcount")return(a|0)-(s|0);if(n==="verdict"){const o={yes:0,maybe:1,no:2,"":3};return(o[a]??3)-(o[s]??3)}return String(a).localeCompare(String(s))}function D(e){return e.slice().sort((t,n)=>i.sort.dir*q(t,n,i.sort.k))}const V=new Set;let ee=!1,G=!1;function Fe(){document.querySelectorAll("#verdict-chips .v-chip[data-v]").forEach(e=>{e.classList.toggle("is-on",V.has(e.dataset.v))})}function Ct(){const e=document.getElementById("q").value.trim().toLowerCase();return i.rows.filter(t=>!(V.size&&!V.has(t.verdict||"__none__")||ee&&!t.flagged||G&&!t.enriched||e&&!(t.name+" "+(t.vertical||"")+" "+(t.reason||"")).toLowerCase().includes(e)))}const jn=[{k:"flag",label:"flag"},{k:"verdict",label:"verdict"},{k:"reason",label:"reason"},{k:"vertical",label:"vertical"},{k:"location",label:"location"},{k:"hc",label:"hc"},{k:"stage",label:"stage"},{k:"reviewed",label:"reviewed"},{k:"site",label:"site"}],Mn=[{k:"application",label:"application"},{k:"outreach",label:"outreach"},{k:"last_outreach",label:"last outreach"},{k:"contacts",label:"contacts"},{k:"link",label:"link"}];function St(e){try{return new Set(JSON.parse(localStorage.getItem(e)||"[]"))}catch{return new Set}}const jt=St("scout-hidden-cols"),Mt=St("scout-hidden-jcols");function At(){return i.view==="jobs"?{cols:Mn,hidden:Mt,key:"scout-hidden-jcols"}:{cols:jn,hidden:jt,key:"scout-hidden-cols"}}function te(){document.querySelectorAll("#t [data-col]").forEach(e=>{e.style.display=jt.has(e.dataset.col)?"none":""}),document.querySelectorAll("#jt [data-col]").forEach(e=>{e.style.display=Mt.has(e.dataset.col)?"none":""})}function Ke(){const e=At();document.getElementById("col-toggles").innerHTML=e.cols.map(t=>`<button class="col-chip${e.hidden.has(t.k)?"":" is-on"}" data-col="${t.k}" title="${e.hidden.has(t.k)?"show":"hide"} ${t.label}">${t.label}</button>`).join(""),document.querySelectorAll("#col-toggles .col-chip").forEach(t=>{t.addEventListener("click",()=>{const n=At(),a=t.dataset.col;n.hidden.has(a)?n.hidden.delete(a):n.hidden.add(a),localStorage.setItem(n.key,JSON.stringify([...n.hidden])),Ke(),te()})})}function Ht(e){return`
      <td class="td-flag" data-col="flag"><button class="flag-btn${e.flagged?" is-on":""}" data-id="${e.company_id}" title="${e.flagged?"unflag":"flag"}">${L}</button></td>
      <td data-col="verdict"><span class="${y(e.verdict)}">${r(e.verdict||"—")}</span></td>
      <td><span class="row-name" data-id="${e.company_id}">${r(e.name)}</span></td>
      <td class="reason" data-col="reason">${r(e.reason||"")}</td>
      <td data-col="vertical">${r(e.vertical||"")}</td>
      <td data-col="location">${r(e.location||"")}</td>
      <td data-col="hc">${e.headcount||""}</td>
      <td data-col="stage">${r(e.stage||"")}</td>
      <td data-col="reviewed" class="muted" title="${r(e.reviewed_at||"never reviewed")}">${e.reviewed_at?r(e.reviewed_at.slice(0,10)):"—"}</td>
      <td data-col="site">${e.website_url?`<a href="${g(e.website_url)}" target="_blank" rel="noopener">about ↗</a>`:""}</td>
    `}function Pt(e){const t=e.querySelector(".flag-btn");t&&t.addEventListener("click",()=>mn(t.dataset.id))}const An=[["flag","14px"],["verdict","46px"],[null,"62%"],["reason","85%"],["vertical","70%"],["location","60%"],["hc","26px"],["stage","55%"],["reviewed","44px"],["site","38px"]],Hn=[[null,"72%"],["applied","58px"],["response","54px"],["outreach","22px"],["last_outreach","58px"],["contacts","55%"],["link","32px"]];function qt(e,t,n=7){const a=document.querySelector(e);if(!a)return;const s=[1,.82,.7,.95,.76,.9,.85];let o="";for(let c=0;c<n;c++){const d=t.map(([u,p])=>{const m=p.endsWith("%")?Math.round(parseFloat(p)*s[c%s.length])+"%":p;return`<td${u?` data-col="${u}"`:""}><span class="skel" style="width:${m}"></span></td>`}).join("");o+=`<tr class="skel-row" aria-hidden="true">${d}</tr>`}a.innerHTML=o,te()}function M(){const e=document.querySelector("#t tbody");e.innerHTML="";const t=D(Ct());document.getElementById("empty").style.display=t.length?"none":"block";for(const n of t){const a=document.createElement("tr");a.dataset.id=n.company_id,a.innerHTML=Ht(n),a.addEventListener("click",s=>{s.target.closest("a, .flag-btn")||re(a.dataset.id)}),e.appendChild(a),Pt(a)}te()}async function Pn(e){const n=await(await fetch("/api/companies")).json();i.rows=n.rows||[];const a=document.querySelector("#t tbody"),s=D(Ct()).map(c=>c.company_id),o=[...a.querySelectorAll("tr")].map(c=>c.dataset.id);if(s.length!==o.length||s.some((c,d)=>c!==o[d])){M();return}for(const c of e){const d=i.rows.find(p=>p.company_id===c),u=a.querySelector(`tr[data-id="${CSS.escape(c)}"]`);if(!d||!u){M();return}u.innerHTML=Ht(d),Pt(u)}te()}let I=null,We=null,ne=!1,se=!1;const U=new Set;function Ot(){const e=i.applicationStages;if(I===null)I=new Set(e.filter(t=>t!=="rejected"));else{for(const t of[...I])e.includes(t)||I.delete(t);if(We)for(const t of e)t!=="rejected"&&!We.has(t)&&I.add(t)}We=new Set(e)}function qn(){Ot();const e=document.getElementById("jq").value.trim().toLowerCase();return i.jobs.filter(t=>{const n=O(t.stage_history);return!(n&&!I.has(n)||ne&&!t.next_up||se&&(t.outreach_count|0)>0||U.size&&!U.has(t.outreach_status||"")||e&&!(t.title+" "+t.company+" "+(t.location||"")+" "+(t.description||"")+" "+(t.contacts||"")).toLowerCase().includes(e))})}function $e(e,t,n,a,s){return`<button class="fdrop-item${s?" is-checked":""}" ${e}="${r(t)}" role="menuitemcheckbox" aria-checked="${s}"><span class="fdrop-check" aria-hidden="true"></span>`+(a?`<span class="fdrop-dot ${a}"></span>`:"")+`<span class="fdrop-label">${r(n)}</span><span class="fdrop-item-count" data-count></span></button>`}function Nt(){Ot();const e=document.getElementById("fdrop-application-menu");e&&(e.innerHTML='<div class="fdrop-head">Application stage</div>'+i.applicationStages.map(n=>$e("data-stage",n,n,Be(n),I.has(n))).join(""));const t=document.getElementById("fdrop-outreach-menu");t&&(t.innerHTML='<div class="fdrop-head">Quick filters</div>'+$e("data-toggle","nextup","★ Next up","",ne)+$e("data-toggle","notreached","Not reached out","",se)+'<div class="fdrop-sep"></div><div class="fdrop-head">Reply status</div>'+[["","none",""]].concat(i.outreachStatuses.map(n=>[n,n,Wt(n)])).map(([n,a,s])=>$e("data-status",n,a,s,U.has(n))).join("")),Rt()}function Rt(){const e={},t={};let n=0,a=0;for(const d of i.jobs){const u=O(d.stage_history);u&&(e[u]=(e[u]|0)+1);const p=d.outreach_status||"";t[p]=(t[p]|0)+1,d.next_up&&n++,d.outreach_count|0||a++}Dt("#fdrop-application-menu [data-stage]","data-stage",e),Dt("#fdrop-outreach-menu [data-status]","data-status",t),Vt('[data-toggle="nextup"]',n),Vt('[data-toggle="notreached"]',a);const s=i.applicationStages.filter(d=>d!=="rejected"),o=I&&I.size===s.length&&s.every(d=>I.has(d));Ut("fdrop-application-btn",o?0:I?I.size:0,!o);const c=(ne?1:0)+(se?1:0)+U.size;Ut("fdrop-outreach-btn",c,c>0)}function Dt(e,t,n){document.querySelectorAll(e).forEach(a=>{const s=a.querySelector("[data-count]");if(s){const o=n[a.getAttribute(t)]|0;s.textContent=o||""}})}function Vt(e,t){const n=document.querySelector(`#fdrop-outreach-menu ${e} [data-count]`);n&&(n.textContent=t||"")}function Ut(e,t,n){const a=document.getElementById(e);if(!a)return;a.classList.toggle("is-active",n);const s=a.querySelector(".fdrop-count");if(s){const o=n&&t>0;s.textContent=o?t:"",s.style.display=o?"":"none"}}function Ie(e,t){e.classList.toggle("is-checked",t),e.setAttribute("aria-checked",String(t))}function Ye(){document.querySelectorAll(".fdrop.is-open").forEach(e=>{e.classList.remove("is-open");const t=e.querySelector(".fdrop-btn");t&&t.setAttribute("aria-expanded","false")})}const On=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;function Jt(e){if(e=String(e||"").trim(),!e)return[];if(e[0]==="[")try{const t=JSON.parse(e);if(Array.isArray(t))return t.map(n=>({position:String((n==null?void 0:n.position)||"").trim(),email:String((n==null?void 0:n.email)||"").trim()})).filter(n=>n.position||n.email)}catch{}return e.split(",").map(t=>t.trim()).filter(Boolean).map(t=>{const n=t.match(On),a=n?n[0]:"";let s=a?t.replace(a,""):t;return s=s.replace(/[<>()]/g,"").replace(/[\s:–—-]+$/,"").trim(),{position:s,email:a}})}function Nn(e){const t=(e||[]).map(n=>({position:(n.position||"").trim(),email:(n.email||"").trim()})).filter(n=>n.position||n.email);return t.length?JSON.stringify(t):""}const xe=()=>new Date().toISOString().slice(0,10);function Q(e){if(e=String(e||"").trim(),!e)return[];try{const t=JSON.parse(e);if(Array.isArray(t))return t.map(n=>({stage:String((n==null?void 0:n.stage)||"").trim(),date:String((n==null?void 0:n.date)||"").trim()})).filter(n=>n.stage)}catch{}return[]}function _e(e){const t=(e||[]).map(n=>({stage:(n.stage||"").trim(),date:(n.date||"").trim()})).filter(n=>n.stage);return t.sort((n,a)=>(n.date||"9999-99-99").localeCompare(a.date||"9999-99-99")),t.length?JSON.stringify(t):""}function O(e){const t=Q(e);return t.length?t[t.length-1].stage:""}function zt(e){const t=Q(e);return t.length?t[t.length-1].date:""}function Rn(e){const t=[["","none"]];for(const n of i.applicationStages)t.push([n,n]);return e&&!i.applicationStages.includes(e)&&t.push([e,e+" (removed)"]),t}function Ft(e){const t=[["","none"]];for(const n of i.outreachStatuses)t.push([n,n]);return e&&!i.outreachStatuses.includes(e)&&t.push([e,e+" (removed)"]),t}const Dn=8;function Kt(e,t){const n=(t||[]).indexOf(e);return n<0?"":"sc-"+n%Dn}function Be(e){return Kt(e,i.applicationStages)}function Wt(e){return Kt(e,i.outreachStatuses)}function Vn(e){const t=Jt(e);return t.length?t.map(n=>{const a=r(n.position||n.email);if(!n.email)return a;const s=r(n.position?`${n.position} — ${n.email}`:n.email);return`<a href="mailto:${r(n.email)}" title="${s}">${a}</a>`}).join('<span class="dim">, </span>'):'<span class="dim">—</span>'}function Yt(e){return`<div class="cc-row">
      <input class="input cc-pos" value="${r(e.position||"")}" placeholder="position" spellcheck="false">
      <input class="input cc-email" type="email" value="${r(e.email||"")}" placeholder="email" spellcheck="false">
      <button class="cc-del" type="button" title="remove contact" aria-label="remove contact">×</button>
    </div>`}function Un(e){return`<div class="outreach-contacts" id="contacts-editor">
      <label class="cc-label">contacts</label>
      <div class="cc-list">${Jt(e).map(Yt).join("")}</div>
      <button class="btn cc-add" type="button">+ add contact</button>
    </div>`}function Gt(e){const t=O(e.stage_history);if(!t)return i.applicationStages.length+1;const n=i.applicationStages.indexOf(t);return n<0?i.applicationStages.length:n}function Jn(e,t,n){if(n==="verdict"){const a={yes:0,maybe:1,no:2,"":3};return(a[e.verdict]??3)-(a[t.verdict]??3)}if(n==="application")return Gt(e)-Gt(t);if(n==="outreach_count")return(t.outreach_count|0)-(e.outreach_count|0);if(n==="created_at"||n==="last_outreach_at"){const a=e[n]||"",s=t[n]||"";return!a&&!s?0:a?s?String(s).localeCompare(String(a)):-i.jsort.dir:i.jsort.dir}return String(e[n]??"").localeCompare(String(t[n]??""))}function _(){const e=document.querySelector("#jt tbody");e.innerHTML="";const t=qn().sort((s,o)=>i.jsort.dir*Jn(s,o,i.jsort.k));document.getElementById("jobs-empty").style.display=t.length?"none":"block",Rt();const n=I&&!I.has("rejected")?i.jobs.filter(s=>O(s.stage_history)==="rejected").length:0,a=document.getElementById("jobs-hidden-note");a.style.display=n?"":"none",n&&(a.innerHTML=`${n} rejected application${n>1?"s":""} hidden — <a id="show-rejected-link">show</a>`,document.getElementById("show-rejected-link").onclick=()=>{I.add("rejected"),Nt(),_()});for(const s of t){const o=O(s.stage_history),c=zt(s.stage_history),d=document.createElement("tr");d.dataset.id=s.posting_id;const u=Rn(o).map(([f,k])=>`<option value="${r(f)}"${o===f?" selected":""}>${r(k)}</option>`).join(""),p=s.outreach_status||"",m=Ft(p).map(([f,k])=>`<option value="${r(f)}"${p===f?" selected":""}>${r(k)}</option>`).join("");d.innerHTML=`
      <td><div class="jt-namecell"><button class="jt-nextup${s.next_up?" is-on":""}" title="${s.next_up?"queued next up for outreach — click to remove":"mark next up for outreach"}" aria-label="next up">${s.next_up?"★":"☆"}</button><div class="jt-namecol"><span class="row-name">${r(s.title||s.company)}</span>${Fn(s.outreach_draft_status)}${s.title?`<div class="small dim">${r(s.company)}</div>`:""}</div></div></td>
      <td data-col="application"><div class="jt-stage"><select class="jt-stage-sel ${Be(o)}" title="application stage — pick a new stage to record it (dated today)">${u}</select>${c?`<span class="jt-stage-date" title="when this stage was reached">${r(c)}</span>`:""}</div></td>
      <td class="small" data-col="outreach"><div class="jt-out"><span class="jt-stepper"><button class="jt-dec" title="undo one outreach"${s.outreach_count?"":" disabled"}>−</button><span class="jt-oc${s.outreach_count?"":" dim"}">${s.outreach_count||0}</span><button class="jt-inc" title="log one outreach (today)">+</button></span><select class="jt-ostatus ${Wt(p)}" title="outreach reply status">${m}</select></div></td>
      <td class="small" data-col="last_outreach">${s.last_outreach_at?r(s.last_outreach_at):'<span class="dim">—</span>'}</td>
      <td class="small td-contacts" data-col="contacts">${Vn(s.contacts)}</td>
      <td data-col="link"><a href="${g(s.url)}" target="_blank" rel="noopener">open ↗</a></td>
    `,d.querySelector(".jt-nextup").onclick=()=>an(s,!1),d.querySelector(".jt-stage-sel").onchange=f=>zn(s,f.target.value),d.querySelector(".jt-ostatus").onchange=f=>Ce(s,{outreach_status:f.target.value}),d.querySelector(".jt-inc").onclick=()=>Ce(s,{outreach_count:(s.outreach_count||0)+1,last_outreach_at:xe()}),d.querySelector(".jt-dec").onclick=()=>{const f=Math.max(0,(s.outreach_count||0)-1);Ce(s,{outreach_count:f,...f===0?{last_outreach_at:""}:{}})},e.appendChild(d)}te(),e.querySelectorAll("tr").forEach(s=>{s.addEventListener("click",o=>{o.target.closest("a, button, select")||Qt(s.dataset.id)})})}function zn(e,t){if(t=(t||"").trim(),!t||t===O(e.stage_history)){_();return}const n=Q(e.stage_history);n.push({stage:t,date:xe()}),Ce(e,{stage_history:_e(n)})}function Fn(e){return e==="researching"?'<span class="draft-badge db-researching" title="drafting outreach…"><span class="spinner spinner-xs"></span>drafting</span>':e==="awaiting_review"?'<span class="draft-badge" title="an outreach draft is ready to review">draft ready</span>':e==="no_hook"?'<span class="draft-badge db-nohook" title="no honest hook — scout recommends not emailing">no hook</span>':""}const h={postingId:null,row:null,drafts:[],poll:null,openHist:!1,answers:[],answersStatus:"",answersPoll:null,detecting:!1};async function Qt(e){let t=i.jobs.find(n=>n.posting_id===e);if(t||(await b(),t=i.jobs.find(n=>n.posting_id===e)),!t){l("posting not found — refresh");return}Qe(),st(),h.postingId=e,h.row=t,h.drafts=[],h.openHist=!1,h.answers=[],h.detecting=!1,h.answersStatus=t.questions_status||"",document.getElementById("pursuit-pane").classList.add("open"),document.getElementById("pursuit-scrim").classList.add("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","false"),Zt("pursuit"),Z(),pe(),ie()}let Ge=null;function Zt(e){Ge=e;const t=e==="company";document.getElementById("scrim").style.zIndex=t?"54":"52",document.getElementById("pane").style.zIndex=t?"55":"53",document.getElementById("pursuit-scrim").style.zIndex=t?"52":"54",document.getElementById("pursuit-pane").style.zIndex=t?"53":"55"}function ue(){Qe(),st(),h.postingId=null,h.row=null,h.drafts=[],h.answers=[],h.answersStatus="",document.getElementById("pursuit-pane").classList.remove("open"),document.getElementById("pursuit-scrim").classList.remove("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","true")}function Qe(){h.poll&&(clearInterval(h.poll),h.poll=null)}async function pe(){if(!h.postingId)return;let e;try{const n=await fetch(`/api/postings/${h.postingId}/outreach`);if(!n.ok){Se();return}e=await n.json()}catch{Se();return}h.drafts=e.drafts||[],Se();const t=h.drafts[0];t&&t.status==="researching"?Kn():Qe()}function Kn(){h.poll||(h.poll=setInterval(pe,4e3))}function H(e,t,{multiline:n=!1}={}){if(!e)return;let a=e.value;e.addEventListener("focus",()=>{a=e.value}),e.addEventListener("keydown",s=>{s.key==="Escape"?(s.preventDefault(),e.value=a,e.blur()):s.key==="Enter"&&(!n||s.metaKey||s.ctrlKey)&&(s.preventDefault(),e.blur())}),e.addEventListener("blur",async()=>{const s=e.value.trim();if(s===a.trim()){e.value=a;return}e.classList.remove("is-saved","is-error"),e.classList.add("is-saving");try{await t(s),a=e.value,e.classList.remove("is-saving"),e.classList.add("is-saved"),setTimeout(()=>e.classList.remove("is-saved"),1200)}catch(o){e.value=a,e.classList.remove("is-saving"),e.classList.add("is-error"),setTimeout(()=>e.classList.remove("is-error"),1600),l(`save failed: ${o.message}`)}})}async function Xt(e,t,n){const a={title:e.title||"",location:e.location||"",comp_range:e.comp_range||"",employment_type:e.employment_type||"",workplace_type:e.workplace_type||"",department:e.department||"",description:e.description||"",[t]:n},s=await fetch(`/api/postings/${e.posting_id}/details`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(a)});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const o=await s.json();Object.assign(e,{title:o.title,location:o.location,employment_type:o.employment_type,workplace_type:o.workplace_type,department:o.department,comp_range:o.comp_range,description:o.description}),_(),ce(e.posting_id,{title:o.title,location:o.location})}async function Wn(e,t){const n=await fetch(`/api/postings/${e.posting_id}/url`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const a=await n.json();e.url=a.url;const s=document.querySelector("#role-body .role-url-open");s&&s.setAttribute("href",g(e.url)),ce(e.posting_id,{url:a.url})}async function Yn(e,t){if(t.disabled)return;const n=t.textContent;t.disabled=!0,t.textContent="re-enriching…";let a;try{a=await fetch(`/api/postings/${e.posting_id}/recapture`,{method:"POST"})}catch(o){t.disabled=!1,t.textContent=n,l(`re-enrich failed: ${o.message}`);return}if(!a.ok){const o=(await a.text().catch(()=>"")).trim();let c=o||"HTTP "+a.status;try{c=JSON.parse(o).error||c}catch{}t.disabled=!1,t.textContent=n,l(`re-enrich failed: ${c}`);return}const s=await a.json();Object.assign(e,{title:s.title,location:s.location,employment_type:s.employment_type,workplace_type:s.workplace_type,department:s.department,comp_range:s.comp_range,description:s.description,posted_at:s.posted_at,url:s.url,questions_status:s.questions_status}),_(),Z(),ce(e.posting_id,{title:s.title,location:s.location,url:s.url}),l("re-enriched from the posting link")}function Gn(e){const t=document.getElementById("pursuit-company-edit");t&&t.addEventListener("click",()=>Zn(e))}async function Qn(e,t){const n=await fetch(`/api/postings/${e.posting_id}/company`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({company_id:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const a=await n.json();e.company_id=a.company_id,e.company=a.company_name,Z(),b()}let he=null;function Zn(e){he=e;const t=document.getElementById("relink-current");t&&(t.textContent=e.company?`currently: ${e.company}`:"");const n=document.getElementById("relink-search");n&&(n.value=""),en(""),document.getElementById("relink-scrim").classList.add("open"),n&&n.focus()}function ae(){document.getElementById("relink-scrim").classList.remove("open"),he=null}let Ze=null;function Xn(e){Ze=e;const t=(e.postings||[]).length,n=t?` and its ${t} job ${t===1?"posting":"postings"}`:"",a=document.getElementById("delcompany-summary");a&&(a.innerHTML=`Delete <strong>${r(e.name||"this company")}</strong>${n}?`);const s=document.getElementById("delcompany-confirm");s&&(s.disabled=!1),document.getElementById("delcompany-scrim").classList.add("open")}function Le(){document.getElementById("delcompany-scrim").classList.remove("open"),Ze=null}async function es(){const e=Ze;if(!e)return;const t=document.getElementById("delcompany-confirm");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/companies/${e.company_id}`,{method:"DELETE"})}catch(s){l(`delete failed: ${s.message}`),t&&(t.disabled=!1);return}if(!n.ok){const s=await n.text().catch(()=>"");l(`delete failed: HTTP ${n.status}${s?" — "+s:""}`),t&&(t.disabled=!1);return}const a=e.name||"company";Le(),i.openId===e.company_id&&ge(),x(),b(),w(),l(`deleted ${a}`)}let Xe=null;function ts(e){Xe=e;const t=(e.title||"").trim()||"this posting",n=e.company?` at <strong>${r(e.company)}</strong>`:"",a=document.getElementById("deljob-summary");a&&(a.innerHTML=`Delete <strong>${r(t)}</strong>${n}?`);const s=document.getElementById("deljob-confirm");s&&(s.disabled=!1),document.getElementById("deljob-scrim").classList.add("open")}function Te(){document.getElementById("deljob-scrim").classList.remove("open"),Xe=null}async function ns(){const e=Xe;if(!e)return;const t=document.getElementById("deljob-confirm");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/postings/${e.posting_id}`,{method:"DELETE"})}catch(s){l(`delete failed: ${s.message}`),t&&(t.disabled=!1);return}if(!n.ok){const s=await n.text().catch(()=>"");l(`delete failed: HTTP ${n.status}${s?" — "+s:""}`),t&&(t.disabled=!1);return}const a=(e.title||"").trim()||"posting";Te(),ue(),b(),i.openId===e.company_id&&re(e.company_id),l(`deleted ${a}`)}function en(e){const t=document.getElementById("relink-results");if(!t)return;const n=e.trim().toLowerCase();let a=(i.rows||[]).slice();if(n?(a=a.filter(o=>(o.name||"").toLowerCase().includes(n)),a.sort((o,c)=>{const d=(o.name||"").toLowerCase().startsWith(n)?0:1,u=(c.name||"").toLowerCase().startsWith(n)?0:1;return d-u||(o.name||"").localeCompare(c.name||"")})):a.sort((o,c)=>(o.name||"").localeCompare(c.name||"")),a=a.slice(0,60),!a.length){t.innerHTML=`<div class="relink-empty">${(i.rows||[]).length?"no company matches":"no companies yet — Add one first"}</div>`;return}const s=he?he.company_id:"";t.innerHTML=a.map(o=>{const c=o.company_id===s,d=[o.vertical,o.location].filter(Boolean).map(r).join(" · ");return`<button type="button" class="relink-result${c?" is-current":""}"
        data-id="${o.company_id}"${c?" disabled":""}>
        <span class="rr-main">
          <span class="rr-name">${r(o.name||"—")}</span>
          ${d?`<span class="rr-sub">${d}</span>`:""}
        </span>
        <span class="${y(o.verdict)} rr-verdict">${r(o.verdict||"—")}</span>
        ${c?'<span class="rr-current-tag">current</span>':""}
      </button>`}).join("")}async function tn(e){const t=he;if(!t){ae();return}if(e===t.company_id){ae();return}try{await Qn(t,e),ae(),l(`moved to ${t.company}`)}catch(n){l(`move failed: ${n.message}`)}}async function nn(e,t,n){const a={name:e.name||"",headcount:e.headcount||"",funding_stage:e.funding_stage||"",location:e.location||"",vertical:e.vertical||"",[t]:n};if(!String(a.name).trim())throw new Error("name is required");const s=await fetch(`/api/companies/${e.company_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(a)});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const o=await s.json();Object.assign(e,{name:o.name,headcount:o.headcount,funding_stage:o.funding_stage,location:o.location,vertical:o.vertical}),x(),b()}async function ss(e,t){const n=await fetch(`/api/companies/${e.company_id}/domain`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({website:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const a=await n.json();i.openId=a.company_id,ye(a),ve(a.company_id),x(),b()}async function as(e,t){const n=await fetch(`/api/companies/${e.company_id}/notes`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({notes:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const a=await n.json();e.notes=a.notes}let sn=null;function Z(){const e=h.row;if(!e)return;const t=document.getElementById("pursuit-body"),a=!!t&&sn===e.posting_id&&document.getElementById("pursuit-pane").classList.contains("open")&&t?t.scrollTop:0;document.getElementById("pursuit-title").innerHTML=`<input class="ie ie-title" id="pursuit-title-input" placeholder="role name" value="${r(e.title||"")}">`;const s=O(e.stage_history);document.getElementById("pursuit-pills").innerHTML=`<span class="pill ${s?Be(s)||"pill-stage":"pill-none"}">${r(s||"—")}</span>`+(e.verdict?` <span class="${y(e.verdict)}">${r(e.verdict)}</span>`:"");const o=document.getElementById("pursuit-chat");o&&(o.style.display=i.meta&&i.meta.chat?"":"none",o.onclick=()=>xt("posting",e.posting_id,e.title||e.company)),document.getElementById("pursuit-body").innerHTML=`
    <section class="pane-section role-head">
      <div id="role-body">${os(e)}</div>
    </section>

    <section class="pane-section">
      <h3>
        Pipeline
      </h3>
      <div class="pipeline-grid">
        <div class="pipeline-row pipeline-stage-row">
          <span class="pl-label">stage</span>
          <div class="pl-stage-wrap">${is(e)}</div>
        </div>
        <div class="pipeline-row">
          <span class="pl-label">reply</span>
          <select class="input pl-ostatus" title="outreach reply status — separate from the application stage">
            ${Ft(e.outreach_status||"").map(([p,m])=>`<option value="${r(p)}"${(e.outreach_status||"")===p?" selected":""}>${r(m)}</option>`).join("")}
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

    ${O(e.stage_history)?"":`
    <section class="pane-section">
      <h3>
        Application
      </h3>
      <div id="answers-section"></div>
    </section>`}

    <div class="pane-danger">
      <button class="btn-delete" id="job-delete-btn" title="permanently delete this job posting and everything attached to it">Delete job</button>
    </div>
  `,rs();const c=document.getElementById("pursuit-company-link");c&&c.addEventListener("click",()=>re(e.company_id)),Gn(e),H(document.getElementById("pursuit-title-input"),p=>Xt(e,"title",p)),H(document.getElementById("pursuit-url-input"),p=>Wn(e,p));const d=document.getElementById("pursuit-reenrich");d&&d.addEventListener("click",()=>Yn(e,d)),H(document.getElementById("pursuit-notes-input"),p=>cs(p),{multiline:!0}),document.querySelectorAll("#role-body [data-k]").forEach(p=>H(p,m=>Xt(e,p.dataset.k,m),{multiline:p.tagName==="TEXTAREA"}));const u=document.getElementById("job-delete-btn");u&&u.addEventListener("click",()=>ts(e)),Se(),fe(),t&&(t.scrollTop=a),sn=e.posting_id}function os(e){return`
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
    </div>`}function is(e){const t=Q(e.stage_history),n=t.map((s,o)=>`
    <div class="stage-entry" data-i="${o}">
      <span class="stage-name${o===t.length-1?" is-current":""}">${r(s.stage)}</span>
      <input type="date" class="input stage-date" value="${r(s.date)}" title="when this stage was reached">
      <button class="stage-del" type="button" title="remove this stage" aria-label="remove">×</button>
    </div>`).join(""),a=['<option value="">+ add stage…</option>'].concat(i.applicationStages.map(s=>`<option value="${r(s)}">${r(s)}</option>`)).join("");return`
    <div class="stage-timeline">${n||'<div class="stage-empty dim">no stage yet</div>'}</div>
    <div class="stage-add">
      <select class="input stage-add-sel">${a}</select>
      <input type="date" class="input stage-add-date" value="${xe()}" title="date for the new stage">
      <button class="btn stage-add-btn" type="button">add</button>
    </div>`}function rs(){const e=h.row;document.querySelectorAll("#pursuit-body .stage-entry .stage-date").forEach(s=>{s.addEventListener("change",o=>{const c=+o.target.closest(".stage-entry").dataset.i,d=Q(e.stage_history);d[c]&&(d[c].date=o.target.value,oe({stage_history:_e(d)}))})}),document.querySelectorAll("#pursuit-body .stage-entry .stage-del").forEach(s=>{s.addEventListener("click",o=>{const c=+o.target.closest(".stage-entry").dataset.i,d=Q(e.stage_history);d.splice(c,1),oe({stage_history:_e(d)})})});const t=document.querySelector("#pursuit-body .stage-add-btn");t&&t.addEventListener("click",()=>{const s=document.querySelector("#pursuit-body .stage-add-sel"),o=document.querySelector("#pursuit-body .stage-add-date"),c=(s.value||"").trim();if(!c)return;const d=Q(e.stage_history);d.push({stage:c,date:o.value||xe()}),oe({stage_history:_e(d)})});const n=document.querySelector("#pursuit-body .pl-ostatus");n&&n.addEventListener("change",s=>oe({outreach_status:s.target.value}));const a=document.querySelector("#pursuit-body .pt-nextup");a&&a.addEventListener("click",()=>an(h.row,!0))}async function an(e,t){let n;try{n=await fetch(`/api/postings/${e.posting_id}/next-up`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({next_up:!e.next_up})})}catch(s){l(`save failed: ${s.message}`);return}if(!n.ok){const s=(await n.text().catch(()=>"")).trim();l(`save failed: ${s||"HTTP "+n.status}`);return}const a=await n.json();e.next_up=a.next_up,_(),ce(e.posting_id,{next_up:a.next_up}),t&&Z(),l(e.next_up?"queued next up":"removed from the queue")}async function et(e,t){const n={stage_history:e.stage_history||"",outreach_count:e.outreach_count||0,last_outreach_at:e.last_outreach_at||"",outreach_status:e.outreach_status||"",contacts:e.contacts||"",notes:e.notes||"",...t};let a;try{a=await fetch(`/api/postings/${e.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)})}catch(o){return l(`save failed: ${o.message}`),null}if(!a.ok){const o=(await a.text().catch(()=>"")).trim();return l(`save failed: ${o||"HTTP "+a.status}`),null}const s=await a.json();return Object.assign(e,{stage_history:s.stage_history,outreach_count:s.outreach_count,last_outreach_at:s.last_outreach_at,outreach_status:s.outreach_status,contacts:s.contacts,notes:s.notes,next_up:s.next_up}),ce(e.posting_id,{stage_history:s.stage_history,outreach_count:s.outreach_count,last_outreach_at:s.last_outreach_at,next_up:s.next_up}),s}async function cs(e){const t=h.row,n={stage_history:t.stage_history||"",outreach_count:t.outreach_count||0,last_outreach_at:t.last_outreach_at||"",outreach_status:t.outreach_status||"",contacts:t.contacts||"",notes:e},a=await fetch(`/api/postings/${t.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)});if(!a.ok)throw new Error((await a.text().catch(()=>"")).trim()||"HTTP "+a.status);const s=await a.json();t.notes=s.notes,_()}async function oe(e){await et(h.row,e)&&(_(),Z(),l("tracking saved"))}async function on(e){await et(h.row,{contacts:e})&&_()}async function Ce(e,t){await et(e,t)&&(_(),h.postingId===e.posting_id&&(h.row=e,Z()),l("tracking saved"))}function Se(){const e=document.getElementById("outreach-section");if(!e)return;const t=h.row,n=h.drafts,a=n[0]||null,s=n.slice(1),o=`
    <div class="outreach-meta">
      <span><span class="om-count">${t.outreach_count||0}</span> sent</span>
      ${t.last_outreach_at?`<span>· last ${r(t.last_outreach_at)}</span>`:""}
      <span class="pt-stepper">
        <button class="btn pt-outreach-dec" title="undo one outreach" ${t.outreach_count?"":"disabled"}>−</button>
        <button class="btn pt-outreach" title="log one outreach sent outside scout — today">+1 outreach</button>
      </span>
    </div>
    ${Un(t.contacts)}`,d=a&&(ds(a.status)||a.status==="failed")?"":`<button class="btn btn-primary" id="draft-start-btn">${a?"Draft again":"Draft outreach"}</button>`,u=s.length?`
    <details class="draft-history" ${h.openHist?"open":""}>
      <summary>${s.length} earlier draft${s.length>1?"s":""}</summary>
      <div id="draft-history-body">${s.map(p=>cn(p,!0)).join("")}</div>
    </details>`:"";e.innerHTML=o+`<div id="draft-current">${a?cn(a,!1):""}</div><div class="draft-actions">${d}</div>`+u,fs()}function ds(e){return e==="researching"||e==="awaiting_review"||e==="needs_work"||e==="no_hook"}const ls='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M2.5 10.5v-7a1 1 0 011-1h7"/></svg>',us='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2L7.3 8.7"/><path d="M14 2L9.7 14l-2.4-5.3L2 6.3z"/></svg>',rn=`<button class="dh-copy draft-copy-btn" title="copy the email to the clipboard" aria-label="copy email">${ls}</button>`,tt=[{key:"research",label:"Research",active:"Researching the company"},{key:"fill",label:"Draft",active:"Writing the draft"},{key:"humanize",label:"Polish",active:"Polishing the voice"},{key:"honesty",label:"Fact-check",active:"Fact-checking against your experience"}],ps='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';function hs(e){let t=tt.findIndex(a=>a.key===e);return t<0&&(t=0),`<div class="draft-progress">
    <div class="dp-track">${tt.map((a,s)=>{const o=s<t?"is-done":s===t?"is-active":"is-pending",c=s<t?ps:"";return`<div class="dp-seg ${o}"><span class="dp-dot">${c}</span><span class="dp-name">${a.label}</span></div>`}).join("")}</div>
    <div class="dp-status"><span class="spinner"></span><span>${tt[t].active}…</span></div>
  </div>`}function cn(e,t){const n=(p,m,f="")=>`
    <div class="draft-head">
      <span class="${p}">${m}</span>${f}
    </div>`;if(e.status==="researching")return`<div class="draft-card dc-busy">
      ${hs(e.stage)}
      <div class="draft-note">This usually takes a minute or two — leave the panel or check back later.</div>
    </div>`;if(e.status==="failed"){const p=ms(e.violations);return`<div class="draft-card dc-failed" data-did="${e.id}">
      ${n("pill pill-no","failed")}
      ${e.fail_reason?`<div class="draft-note">${r(e.fail_reason)}</div>`:""}
      ${p}
      ${me(e)}
      ${t?"":`<div class="draft-actions"><button class="btn btn-primary draft-retry-btn">${be}Retry</button></div>`}
    </div>`}if(e.status==="superseded")return`<div class="draft-card dc-sent" data-did="${e.id}">
      ${n("pill pill-info","replaced")}
      <div class="draft-note">Replaced by a newer draft.</div>
      <div class="draft-sentbody">${r(nt(e)||"(empty)")}</div>
      ${me(e)}
    </div>`;if(e.status==="sent")return`<div class="draft-card dc-sent" data-did="${e.id}">
      ${n("pill pill-yes","sent",t?"":rn)}
      ${e.sent_at?`<div class="draft-note">Sent ${r((e.sent_at||"").replace("T"," ").slice(0,16))}</div>`:""}
      <div class="draft-sentbody">${r(nt(e)||"(empty)")}</div>
      ${me(e)}
    </div>`;const a=nt(e),s=e.status==="no_hook",o=s?'<span class="pill pill-info">no honest hook</span>':'<span class="pill pill-maybe">awaiting review</span>';let c="";if(s)try{c=JSON.parse(e.hook||"{}").reasoning||""}catch{}const d=s?`<div class="draft-note">No honest hook found — nothing true to say yet; scout recommends not emailing.${c?" "+r(c):""}</div>`:"";if(t)return`<div class="draft-card ${s?"dc-nohook":"dc-review"}" data-did="${e.id}">
      <div class="draft-head">${o}</div>
      ${d}
      <div class="draft-sentbody">${r(a||"(empty)")}</div>
      ${me(e)}
    </div>`;const u=a||s;return`<div class="draft-card ${s?"dc-nohook":"dc-review"}" data-did="${e.id}">
    <div class="draft-head">${o}${a?rn:""}</div>
    ${d}
    ${u?`<textarea class="draft-textarea" id="draft-edit-${e.id}" spellcheck="false">${r(a)}</textarea>
    ${dn(e.lint)}
    <div class="draft-actions">
      <button class="btn btn-primary draft-sent-btn" title="mark this email sent — bumps the outreach count">${us}Mark sent</button>
      <button class="btn draft-regen-btn" title="discard this draft (kept in history) and re-run — picks up backfilled info">${be}Regenerate</button>
    </div>`:`<div class="draft-actions">
      <button class="btn draft-regen-btn" title="re-run the draft — picks up backfilled info">${be}Regenerate</button>
    </div>`}
    ${me(e)}
  </div>`}function nt(e){return e.edited&&e.edited.trim()?e.edited:e.draft||""}function me(e){let t="",n=null,a=null;try{n=JSON.parse(e.research||"null")}catch{}try{a=JSON.parse(e.hook||"null")}catch{}if(n&&typeof n=="object"){const s=(u,p)=>p?`<div class="tr-line"><span class="tr-key">${u}:</span> ${r(String(p))}</div>`:"",o=n.role||{},c=Array.isArray(n.hooks)?n.hooks:[],d=c.map(u=>`
      <div class="tr-line">
        <span class="tr-key">${r(u.type||"hook")}</span>
        ${g(u.source_url)!=="#"?` · <a href="${g(u.source_url)}" target="_blank" rel="noopener">source</a>`:""}
        <span class="tr-quote">${r(u.quote||"")}</span>
        ${u.context?`<span class="tr-key">${r(u.context)}</span>`:""}
      </div>`).join("");t+=`<details class="draft-trace"><summary>research — ${c.length} hook candidate${c.length===1?"":"s"}</summary>
      <div class="trace-body">
        ${s("what they do",n.what_they_do)}
        ${s("customer",n.customer)}
        ${s("stage / headcount",[n.stage,n.headcount_est].filter(Boolean).join(" / "))}
        ${s("role",o.title)}
        ${(o.jd_quotes||[]).map(u=>`<span class="tr-quote">${r(u)}</span>`).join("")}
        ${d}
        ${s("disambiguation",n.disambiguation)}
        ${s("confidence",n.confidence)}
      </div></details>`}if(a&&typeof a=="object"&&a.decision){const s=a.hook||{};t+=`<details class="draft-trace"><summary>hook — ${r(a.decision)}${a.closer_mode?" · "+r(a.closer_mode):""}</summary>
      <div class="trace-body">
        ${s.quote?`<span class="tr-quote">${r(s.quote)}</span>`:""}
        ${s.thread?`<div class="tr-line"><span class="tr-key">thread:</span> ${r(s.thread)}</div>`:""}
        ${g(s.source_url)!=="#"?`<div class="tr-line"><a href="${g(s.source_url)}" target="_blank" rel="noopener">source</a></div>`:""}
        ${a.reasoning?`<div class="tr-line"><span class="tr-key">reasoning:</span> ${r(a.reasoning)}</div>`:""}
      </div></details>`}return t}function dn(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<div class="lint-chips">'+t.map(n=>`<span class="lint-chip" title="${r(n.message||"")}"><code>${r(n.code||"")}</code>${r(n.message||"")}</span>`).join("")+"</div>":""}function ms(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<ul class="violation-list">'+t.map(n=>`<li>${r(n.claim||n.message||String(n))}${n.why?` <span class="vl-why">— ${r(n.why)}</span>`:""}</li>`).join("")+"</ul>":""}function fs(){const e=document.getElementById("outreach-section");if(!e)return;const t=e.querySelector("#contacts-editor");if(t){const u=t.querySelector(".cc-list"),p=()=>Nn(Array.from(u.querySelectorAll(".cc-row")).map(f=>({position:f.querySelector(".cc-pos").value,email:f.querySelector(".cc-email").value}))),m=f=>{f.querySelectorAll(".cc-pos, .cc-email").forEach(k=>{k.addEventListener("change",()=>on(p())),k.addEventListener("keydown",C=>{C.key==="Enter"&&(C.preventDefault(),C.target.blur())})}),f.querySelector(".cc-del").addEventListener("click",()=>{f.remove(),on(p())})};u.querySelectorAll(".cc-row").forEach(m),t.querySelector(".cc-add").addEventListener("click",()=>{const f=document.createElement("div");f.innerHTML=Yt({position:"",email:""});const k=f.firstElementChild;u.appendChild(k),m(k),k.querySelector(".cc-pos").focus()})}const n=()=>new Date().toISOString().slice(0,10),a=h.row,s=e.querySelector(".pt-outreach");s&&s.addEventListener("click",()=>oe({outreach_count:(a.outreach_count||0)+1,last_outreach_at:n()}));const o=e.querySelector(".pt-outreach-dec");o&&o.addEventListener("click",()=>{const u=Math.max(0,(a.outreach_count||0)-1);oe({outreach_count:u,...u===0?{last_outreach_at:""}:{}})});const c=e.querySelector("#draft-start-btn");c&&c.addEventListener("click",()=>je()),e.querySelectorAll(".draft-retry-btn").forEach(u=>u.addEventListener("click",()=>je())),e.querySelectorAll(".draft-regen-btn").forEach(u=>u.addEventListener("click",()=>je(!0))),e.querySelectorAll(".draft-card[data-did]").forEach(u=>{const p=u.dataset.did,m=u.querySelector(".draft-textarea");m&&H(m,C=>ys(p,C),{multiline:!0});const f=u.querySelector(".draft-sent-btn");f&&f.addEventListener("click",()=>vs(p));const k=u.querySelector(".draft-copy-btn");k&&k.addEventListener("click",()=>{const C=u.querySelector(".draft-textarea"),X=u.querySelector(".draft-sentbody"),de=C?C.value:X?X.textContent:"";Hs(de,"email copied")})});const d=e.querySelector("details.draft-history");d&&d.addEventListener("toggle",()=>{h.openHist=d.open})}async function je(e=!1){const t=document.getElementById("outreach-section"),n=t&&(t.querySelector("#draft-start-btn")||t.querySelector(".draft-retry-btn")||t.querySelector(".draft-regen-btn"));n&&(n.disabled=!0);let a;try{const o=e?"?regenerate=1":"";a=await fetch(`/api/postings/${h.postingId}/outreach${o}`,{method:"POST"})}catch(o){l(`draft failed: ${o.message}`),n&&(n.disabled=!1);return}if(a.status===202){let o={};try{o=await a.json()}catch{}Array.isArray(o.degraded)&&o.degraded.length&&l(`drafting without ${o.degraded.join(", ")} — quality degrades, integrity unaffected`),await pe(),b();return}if(a.status===409){await pe(),l("a draft is already active");return}if(a.status===412){let o={};try{o=await a.json()}catch{}gs(o.need,o.error),n&&(n.disabled=!1);return}if(a.status===503){const o=document.getElementById("outreach-section");if(o){const c=document.createElement("div");c.className="draft-note",c.textContent="Outreach engine not running in this build.",o.appendChild(c)}n&&(n.disabled=!1);return}const s=(await a.text().catch(()=>"")).trim();l(`draft failed: ${s||"HTTP "+a.status}`),n&&(n.disabled=!1)}function gs(e,t){const n=document.getElementById("outreach-section");if(!n)return;const a=n.querySelector(".draft-actions"),s=e==="template",o=s?"Write email template":"Discover sources",c=document.createElement("div");c.className="blocks-gate",c.innerHTML=`
    <div class="draft-note">${r(t||"Outreach isn't set up yet.")}</div>
    <div class="draft-actions">
      <button class="btn btn-primary" id="gate-fix-btn">${o}</button>
      <button class="btn" id="gate-retry-btn">Retry</button>
    </div>`,a?a.replaceWith(c):n.appendChild(c);const d=c.querySelector("#gate-fix-btn");d&&d.addEventListener("click",()=>s?F("outreach-template"):ut());const u=c.querySelector("#gate-retry-btn");u&&u.addEventListener("click",je)}async function ys(e,t){const n=await fetch(`/api/outreach/drafts/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const a=await n.json(),s=h.drafts.findIndex(d=>String(d.id)===String(e));s>=0&&(h.drafts[s]=a);const o=document.getElementById(`draft-edit-${e}`),c=o&&o.closest(".draft-card");if(c){const d=c.querySelector(".lint-chips"),u=dn(a.lint);d?d.outerHTML=u||"":u&&o.insertAdjacentHTML("afterend",u)}}async function vs(e){let t;try{t=await fetch(`/api/outreach/drafts/${e}/sent`,{method:"POST"})}catch(a){l(`failed: ${a.message}`);return}if(!t.ok){const a=(await t.text().catch(()=>"")).trim();l(`failed: ${a||"HTTP "+t.status}`);return}l("marked sent"),await pe(),await b();const n=i.jobs.find(a=>a.posting_id===h.postingId);n&&ce(n.posting_id,{outreach_count:n.outreach_count,last_outreach_at:n.last_outreach_at,next_up:n.next_up})}async function ie(){if(!h.postingId)return;let e;try{const t=await fetch(`/api/postings/${h.postingId}/answers`);if(!t.ok){fe();return}e=await t.json()}catch{fe();return}h.answers=e.answers||[],h.answersStatus=e.questions_status||"",fe(),h.answers.some(t=>t.status==="generating")?bs():st()}function bs(){h.answersPoll||(h.answersPoll=setInterval(ie,4e3))}function st(){h.answersPoll&&(clearInterval(h.answersPoll),h.answersPoll=null)}function fe(){const e=document.getElementById("answers-section");if(!e)return;const t=h.answers,n=h.answersStatus,a=t.some(p=>p.status==="generating"),s=t.length?`<div class="answers-list">${t.map(Es).join("")}</div>`:"",o=!!h.detecting,c=a||o?" disabled":"",d=p=>`<button class="btn" id="answers-redetect-btn"${o?" disabled":""}>${o?"Detecting…":p}</button>`;let u;n==="ok"&&t.length?u=(t.some(m=>!ln(m)&&m.status!=="generating")?`<button class="btn" id="answers-start-btn"${c}>${a?"Drafting…":"Draft all blank"}</button>`:"")+d("Re-detect"):n===""||n==="unreachable"?u=`<button class="btn btn-primary" id="answers-start-btn"${c}>${a?"Drafting…":"Draft answers"}</button>`+d("Re-detect questions"):u=d("Re-detect questions"),e.innerHTML=`<div class="answers-meta">${r(ws(n,t.length))}</div>`+s+`<div class="answers-actions">${u}</div>`,Is()}function ws(e,t){switch(e){case"":return"Not detected yet";case"ok":return`${t} question${t===1?"":"s"} found`;case"none":return"No essay questions on this form";case"unsupported":return"Couldn't read this form — apply on the site";case"unreachable":return"Couldn't reach the application form — try re-detecting";default:return"Couldn't read this form"}}function ln(e){return e.edited&&e.edited.trim()?e.edited:e.answer||""}function ks(e){switch(e.status){case"ready":return'<span class="pill pill-yes">ready</span>';case"needs_review":return'<span class="pill pill-maybe">needs review</span>';case"failed":return'<span class="pill pill-no">failed</span>';case"generating":return'<span class="pill pill-info">drafting…</span>';default:return'<span class="pill pill-info">not drafted</span>'}}function Es(e){const t=ln(e),n=e.edited&&e.edited.trim(),a=e.status==="generating",s=t.length,o=e.max_length&&s>e.max_length,c=e.max_length?`<span class="answer-count${o?" over":""}">${s} / ${e.max_length}</span>`:`<span class="answer-count">${s} chars</span>`,d=!!t,u=d?"Regenerate":"Generate",p=d?"re-draft this answer (discards the current text)":"draft an answer to just this question";return`<div class="answer-card ac-${e.status}" data-aid="${e.id}">
    <div class="answer-prompt">${r(e.prompt)}</div>
    ${a?'<div class="answer-busy"><span class="spinner"></span><span>drafting…</span></div>':`<textarea class="ie answer-textarea" id="answer-edit-${e.id}" rows="5" spellcheck="false" placeholder="Generate an answer to this question, or write your own.">${r(t)}</textarea>`}
    <div class="answer-foot">
      ${ks(e)}
      ${n?'<span class="answer-edited" title="your edit wins over the drafted answer">edited</span>':""}
      ${a?"":c}
      ${a?"":`<button class="btn ${d?"":"btn-primary "}answer-regen-btn" title="${p}">${u}</button>`}
      ${a?"":'<button class="answer-remove-btn" title="remove this question" aria-label="remove question">×</button>'}
    </div>
    ${e.status==="needs_review"?`<div class="answer-note answer-review">Flagged by the honesty check — confirm it doesn't overstate your experience before sending.</div>`:""}
    ${e.status==="failed"&&e.fail_reason?`<div class="answer-note answer-fail">${r($s(e.fail_reason))}</div>`:""}
  </div>`}function $s(e){return e=String(e||""),e.length>160?e.slice(0,160)+"…":e}function Is(){const e=document.getElementById("answers-section");if(!e)return;const t=e.querySelector("#answers-start-btn");t&&t.addEventListener("click",un);const n=e.querySelector("#answers-redetect-btn");n&&n.addEventListener("click",_s),e.querySelectorAll(".answer-card[data-aid]").forEach(a=>{const s=a.dataset.aid,o=a.querySelector(".answer-textarea");o&&(H(o,u=>Bs(s,u),{multiline:!0}),o.addEventListener("input",()=>xs(a,o)));const c=a.querySelector(".answer-regen-btn");c&&c.addEventListener("click",()=>Ls(s));const d=a.querySelector(".answer-remove-btn");d&&d.addEventListener("click",()=>Ts(s))})}function xs(e,t){const n=e.querySelector(".answer-count");if(!n)return;const a=t.value.length,s=n.textContent.includes("/")?parseInt(n.textContent.split("/")[1],10):0;n.textContent=s?`${a} / ${s}`:`${a} chars`,n.classList.toggle("over",!!s&&a>s)}async function un(){const e=document.getElementById("answers-section"),t=e&&e.querySelector("#answers-start-btn");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/postings/${h.postingId}/answers`,{method:"POST"})}catch(s){l(`draft failed: ${s.message}`),t&&(t.disabled=!1);return}if(n.status===202){await ie();return}if(n.status===412){let s={};try{s=await n.json()}catch{}pn(s.error),t&&(t.disabled=!1);return}if(n.status===503){hn("Answer generation isn't running in this build."),t&&(t.disabled=!1);return}const a=(await n.text().catch(()=>"")).trim();l(`draft failed: ${a||"HTTP "+n.status}`),t&&(t.disabled=!1)}async function _s(){h.detecting=!0,fe();try{const e=await fetch(`/api/postings/${h.postingId}/answers/redetect`,{method:"POST"});if(!e.ok){const t=(await e.text().catch(()=>"")).trim();l(`detect failed: ${t||"HTTP "+e.status}`)}}catch(e){l(`detect failed: ${e.message}`)}h.detecting=!1,await ie()}async function Bs(e,t){const n=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const a=await n.json(),s=h.answers.findIndex(o=>String(o.id)===String(e));s>=0&&(h.answers[s]=a)}async function Ls(e){let t;try{t=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({regenerate:!0})})}catch(n){l(`regenerate failed: ${n.message}`);return}if(t.status===503){hn("Answer generation isn't running in this build.");return}if(t.status===412){let n={};try{n=await t.json()}catch{}pn(n.error);return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();l(`regenerate failed: ${n||"HTTP "+t.status}`);return}await ie()}async function Ts(e){if(!confirm("Remove this question? Any answer drafted or written for it is discarded, and re-detecting won't bring it back."))return;let t;try{t=await fetch(`/api/answers/${e}`,{method:"DELETE"})}catch(n){l(`remove failed: ${n.message}`);return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();l(`remove failed: ${n||"HTTP "+t.status}`);return}await ie()}function pn(e){const t=document.getElementById("answers-section");if(!t)return;const n=t.querySelector(".answers-actions"),a=document.createElement("div");a.className="blocks-gate",a.innerHTML=`
    <div class="draft-note">${r(e||"Drafting answers needs your experience discovered.")}</div>
    <div class="answers-actions">
      <button class="btn btn-primary" id="answers-fix-btn">Discover sources</button>
      <button class="btn" id="answers-retry-btn">Retry</button>
    </div>`,n?n.replaceWith(a):t.appendChild(a);const s=a.querySelector("#answers-fix-btn");s&&s.addEventListener("click",ut);const o=a.querySelector("#answers-retry-btn");o&&o.addEventListener("click",un)}function hn(e){const t=document.getElementById("answers-section");if(!t)return;const n=document.createElement("div");n.className="draft-note",n.textContent=e,t.appendChild(n)}async function re(e){var d,u;const t=document.getElementById("pane"),n=document.getElementById("scrim"),a=i.openId===e&&t.classList.contains("open"),s=a?((d=document.getElementById("pane-body"))==null?void 0:d.scrollTop)??0:0,o=a?(u=document.getElementById("trace-body"))==null?void 0:u.innerHTML:null;i.openId=e,t.classList.add("open"),n.classList.add("open"),t.setAttribute("aria-hidden","false"),Zt("company"),a||(document.getElementById("pane-title").textContent="loading…",document.getElementById("pane-pills").innerHTML="",document.getElementById("pane-body").innerHTML='<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>');let c;try{const p=await fetch(`/api/companies/${e}`);if(!p.ok)throw new Error(`HTTP ${p.status}`);c=await p.json()}catch(p){a||(document.getElementById("pane-body").innerHTML=`<div class="muted">Failed to load detail: ${r(p.message)}</div>`);return}if(i.openId===e){if(ye(c),a){if(o!=null){const m=document.getElementById("trace-body");m&&(m.innerHTML=o)}const p=document.getElementById("pane-body");p&&(p.scrollTop=s)}ve(e)}}function ge(){i.openId=null,i.openDetail=null,document.getElementById("pane").classList.remove("open"),document.getElementById("scrim").classList.remove("open"),document.getElementById("pane").setAttribute("aria-hidden","true")}function ye(e){i.openDetail=e,document.getElementById("pane-title").innerHTML=`<input class="ie ie-title" id="pane-title-input" placeholder="company name" value="${r(e.name||"")}">`,document.getElementById("pane-pills").innerHTML=`
    <span class="${y(e.has_verdict?e.verdict:"")}">${r(e.has_verdict?e.verdict:"unscored")}</span>
  `;const t=document.getElementById("pane-chat");t&&(t.style.display=i.meta&&i.meta.chat?"":"none",t.onclick=()=>xt("company",e.company_id,e.name));const n=e.model==="manual",a=e.has_verdict?`
    <dl class="kv">
      <dt>verdict</dt><dd><span class="${y(e.verdict)}">${r(e.verdict)}</span>${n?' <span class="small muted">· set by hand</span>':""}</dd>
      <dt>reason</dt><dd>${r(e.reason||"")}</dd>
      <dt>model</dt><dd class="small muted">${r(e.model||"")}</dd>
      <dt>taste version</dt><dd class="small muted"><span class="tooltip" title="scored ${r(e.scored_at)} · model ${r(e.model)}">${r(e.taste_version||"")}</span></dd>
      <dt>scored at</dt><dd class="small muted">${r(e.scored_at||"")}</dd>
    </dl>
  `:'<div class="muted">Not yet scored. Run <code>scout verdict</code>, or set one by hand below.</div>',s=`
    <div class="verdict-edit" id="verdict-edit">
      <div class="ve-label muted small">${e.has_verdict?"override verdict":"set verdict"}</div>
      <div class="ve-pick" id="ve-pick">
        ${["yes","maybe","no"].map($=>`<button type="button" class="ve-opt${e.has_verdict&&e.verdict===$?" is-on":""}" data-v="${$}">${$}</button>`).join("")}
      </div>
      <div class="prow">
        <input class="input" id="ve-reason" placeholder="reason (optional)" value="${n?r(e.reason||""):""}">
        <button class="btn btn-primary" id="ve-save-btn">Save</button>
      </div>
    </div>`,o=e.has_enrichment?`
    <dl class="kv">
      <dt>url</dt><dd>${e.website_url?`<a href="${g(e.website_url)}" target="_blank" rel="noopener">${r(e.website_url)} ↗</a>`:'<span class="muted">—</span>'}</dd>
      <dt>status</dt><dd class="small">${r(e.fetch_status||"")}${e.fetch_error?` <span class="muted">(${r(e.fetch_error)})</span>`:""}</dd>
      <dt>fetched</dt><dd class="small muted">${r(e.fetched_at||"")}</dd>
    </dl>
    ${e.website_summary?`<div class="summary-box">${r(e.website_summary)}</div>`:""}
  `:'<div class="muted">No enrichment yet. Run <code>scout enrich</code>.</div>',c=!i.meta||i.meta.control!==!1,d=c&&i.meta&&i.meta.verdict?'<button class="h3-action" id="rescore-btn" title="re-score just this company — replaces the current verdict, manual or not">↻ re-score</button>':"",u=c&&e.domain?'<button class="h3-action" id="reenrich-btn" title="re-fetch this company’s site now">↻ re-enrich</button>':"",p=Object.keys(e.raw_json||{}).sort(),m=p.length===0?"":`
    <details class="raw-json">
      <summary>Raw row <span class="dim">(${p.length} fields)</span></summary>
      <table><tbody>
        ${p.map($=>`<tr><td class="k">${r($)}</td><td>${r(e.raw_json[$])}</td></tr>`).join("")}
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
      <div id="postings-list">${at(e)}</div>
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
      <div id="facts-body">${Cs(e)}</div>
      ${m}
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3 3 7-7"/></svg>
        Verdict
        ${d}
      </h3>
      ${a}
      ${s}
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

    <div class="pane-danger">
      <button class="btn-delete" id="company-delete-btn" title="permanently delete this company and everything attached to it">Delete company</button>
    </div>
  `;const k=document.getElementById("posting-add-btn");k&&k.addEventListener("click",()=>Ms(e)),ot(),document.querySelectorAll("#ve-pick .ve-opt").forEach($=>{$.addEventListener("click",()=>{document.querySelectorAll("#ve-pick .ve-opt").forEach(W=>W.classList.remove("is-on")),$.classList.add("is-on")})});const C=document.getElementById("ve-save-btn");C&&C.addEventListener("click",()=>js(e)),H(document.getElementById("pane-title-input"),$=>nn(e,"name",$)),document.querySelectorAll("#facts-body [data-k]").forEach($=>H($,W=>nn(e,$.dataset.k,W))),H(document.getElementById("pane-domain-input"),$=>ss(e,$)),H(document.getElementById("pane-notes-input"),$=>as(e,$),{multiline:!0});const X=document.getElementById("flag-toggle-btn");X&&X.addEventListener("click",()=>mn(e.company_id));const de=document.getElementById("review-stamp-btn");de&&de.addEventListener("click",()=>Ss(e.company_id));const we=document.getElementById("rescore-btn");we&&we.addEventListener("click",()=>ct("verdict",{company_ids:[e.company_id]}));const Je=document.getElementById("reenrich-btn");Je&&Je.addEventListener("click",()=>ct("enrich",{company_ids:[e.company_id]}));const ke=document.getElementById("company-delete-btn");ke&&ke.addEventListener("click",()=>Xn(e))}function Cs(e){return`
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
    </dl>`}async function Ss(e){const t=document.getElementById("review-stamp-btn");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/companies/${e}/reviewed`,{method:"POST"})}catch(o){l(`failed: ${o.message}`),t&&(t.disabled=!1);return}if(!n.ok){const o=await n.text().catch(()=>"");l(`failed: HTTP ${n.status}${o?" — "+o:""}`),t&&(t.disabled=!1);return}const a=await n.json(),s=i.rows.find(o=>o.company_id===e);s&&(s.reviewed_at=a.reviewed_at,M()),i.openId===e&&(ye(a),ve(e)),l("reviewed")}async function mn(e){const t=i.rows.find(o=>o.company_id===e),n=!(t&&t.flagged);let a;try{a=await fetch(`/api/companies/${e}/flagged`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({flagged:n})})}catch(o){l(`failed: ${o.message}`);return}if(!a.ok){const o=await a.text().catch(()=>"");l(`failed: HTTP ${a.status}${o?" — "+o:""}`);return}const s=await a.json();t&&(t.flagged=s.flagged,M()),i.openId===e&&(ye(s),ve(e)),b(),l(s.flagged?"flagged":"unflagged")}async function js(e){const t=document.querySelector("#ve-pick .ve-opt.is-on");if(!t){l("Pick yes, maybe, or no.");return}const n=t.dataset.v,a=document.getElementById("ve-reason").value.trim(),s=document.getElementById("ve-save-btn");s.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/verdict`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({verdict:n,reason:a})})}catch(d){l(`save failed: ${d.message}`),s.disabled=!1;return}if(!o.ok){const d=await o.text().catch(()=>"");l(`save failed: HTTP ${o.status}${d?" — "+d:""}`),s.disabled=!1;return}const c=await o.json();ye(c),ve(c.company_id),x(),w(),b(),l("verdict saved")}function at(e){const t=e.postings||[];return t.length?t.map(n=>{const a=[n.location,n.source==="capture"?"captured":"added",(n.created_at||"").slice(0,10)].filter(Boolean).map(r).join(" · "),s=O(n.stage_history),o=zt(n.stage_history),c=[n.next_up?'<span class="draft-badge db-next" style="margin-left:0" title="queued next up for outreach">next up</span>':"",`<span class="pill ${s?Be(s)||"pill-stage":"pill-none"}">${r(s||"—")}</span>`,`<span class="pt-meta">${s?o?r(o):"tracked":"not applied"}</span>`,`<span class="pt-meta">${n.outreach_count?`${n.outreach_count} sent · last ${r(n.last_outreach_at||"?")}`:"no outreach yet"}</span>`].filter(Boolean).join("");return`
    <div class="brain-node posting-card" data-pid="${r(n.id)}" title="open the pursuit — tracking, outreach, drafts">
      <div class="n"><a href="${g(n.url)}" target="_blank" rel="noopener">${r(n.title||n.url)} ↗</a></div>
      ${n.description?`<div class="small muted" style="margin-top:3px">${r(n.description.length>200?n.description.slice(0,200).trimEnd()+"…":n.description)}</div>`:""}
      ${a?`<div class="l" style="margin-top:3px">${a}</div>`:""}
      <div class="pcard-status">${c}<span class="pcard-open">open →</span></div>
    </div>`}).join(""):'<div class="muted">No job links yet.</div>'}function ce(e,t){const n=i.openDetail;if(!n||!i.openId)return;const a=(n.postings||[]).find(o=>String(o.id)===String(e));if(!a)return;Object.assign(a,t);const s=document.getElementById("postings-list");s&&(s.innerHTML=at(n),ot())}function ot(){document.querySelectorAll("#postings-list .posting-card").forEach(e=>{e.addEventListener("click",t=>{t.target.closest("a")||Qt(e.dataset.pid)})})}async function Ms(e){const t=document.getElementById("posting-url"),n=document.getElementById("posting-title"),a=document.getElementById("posting-add-btn"),s=t.value.trim();if(!s){l("Enter a URL first."),t.focus();return}a.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/postings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:s,title:n.value.trim()})})}catch(u){l(`add failed: ${u.message}`),a.disabled=!1;return}if(!o.ok){const u=await o.text().catch(()=>"");l(`add failed: HTTP ${o.status}${u?" — "+u:""}`),a.disabled=!1;return}const c=await o.json();e.postings=(e.postings||[]).filter(u=>u.id!==c.id),e.postings.unshift(c);const d=document.getElementById("postings-list");d&&(d.innerHTML=at(e),ot()),t.value="",n.value="",a.disabled=!1,b(),l("link added")}async function ve(e){let t;try{t=await fetch(`/api/companies/${e}/trace`)}catch(a){Me(`<div class="muted">Failed to load trail: ${r(a.message)}</div>`);return}if(!t.ok){Me(`<div class="muted">Failed to load trail: HTTP ${t.status}.</div>`);return}const n=(await t.json()).events||[];if(n.length===0){Me('<div class="muted">No decision trail yet. Run <code>verdict</code> to record one — every scoring pass is captured here.</div>');return}Me(n.map(As).join(""))}function As(e){const t=[e.criteria_source,e.taste_version].filter(Boolean).map(r);return e.run_id&&t.push("run "+r(e.run_id.slice(0,8))),`
    <div class="trail-event">
      <div class="trail-head">
        <span class="${y(e.verdict)}">${r(e.verdict)}</span>
        <span class="trail-meta mono">${r(e.model||"")}</span>
        <span class="trail-meta trail-time">${r(e.scored_at||"")}</span>
      </div>
      <div class="trail-decision">
        <span class="trail-reason">${r(e.reason||"")}</span>
      </div>
      <div class="trail-foot muted small">criteria: ${t.join(" · ")||"—"}</div>
    </div>`}function Me(e){const t=document.getElementById("trace-body");t&&(t.innerHTML=e)}let fn;function l(e){const t=document.getElementById("toast");t.textContent=e,t.classList.toggle("err",/\b(fail(ed)?|error|disabled|already running)\b/i.test(e)),t.classList.add("show"),clearTimeout(fn),fn=setTimeout(()=>t.classList.remove("show"),2200)}async function Hs(e,t="copied"){if(!e){l("nothing to copy");return}try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(e);else{const n=document.createElement("textarea");n.value=e,n.style.position="fixed",n.style.opacity="0",document.body.appendChild(n),n.select(),document.execCommand("copy"),document.body.removeChild(n)}l(t)}catch(n){l(`copy failed: ${n.message}`)}}i.meta={control:!1,brain:!1,verdict:!1};async function it(){try{const a=await fetch("/api/meta");if(!a.ok)return;i.meta=await a.json()}catch{return}const e=i.meta.control;document.getElementById("btn-ingest").disabled=!e,document.getElementById("btn-enrich").disabled=!e;const t=document.getElementById("btn-verdict");t.disabled=!e||!i.meta.verdict,t.title=i.meta.verdict?"":"set ANTHROPIC_API_KEY in the server env to enable";const n=document.getElementById("open-chat");n&&(n.style.display=i.meta.chat?"":"none")}async function rt(){let e;try{const a=await fetch("/api/runs");if(!a.ok)return;e=await a.json()}catch{return}const t=e.busy_stage||"",n=document.getElementById("run-busy");t?(n.style.display="",document.getElementById("run-busy-label").textContent=t+" running…"):n.style.display="none",document.getElementById("btn-ingest").classList.toggle("busy",t==="ingest"),document.getElementById("btn-enrich").classList.toggle("busy",t==="enrich"),document.getElementById("btn-verdict").classList.toggle("busy",t==="verdict")}let Ae=null;async function ct(e,t){if(i.meta&&i.meta.control===!1){l("control surface disabled");return}let n;try{n=await fetch(`/api/run/${e}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t||{})})}catch(s){l(`run failed: ${s.message}`);return}if(n.status===409){l("a job is already running");return}if(n.status===412){const s=await n.text();l(s.trim());return}if(!n.ok){l(`run failed: HTTP ${n.status}`);return}const{job_id:a}=await n.json();En(e,a,t)}async function Ps(e){const t=new FormData;t.append("csv",e);let n;try{n=await fetch("/api/ingest",{method:"POST",body:t})}catch(s){l(`upload failed: ${s.message}`);return}if(n.status===409){l("a job is already running");return}if(!n.ok){l(`upload failed: HTTP ${n.status}`);return}const{job_id:a}=await n.json();En("ingest",a)}const qs=["add-url","add-name","add-location","add-headcount","add-title","add-job-company"];let He=[],J=new Set,z="company";function gn(e){z=e,document.querySelectorAll("#add-kind .v-chip").forEach(a=>a.classList.toggle("is-on",a.dataset.kind===e)),document.getElementById("add-company-fields").style.display=e==="company"?"":"none",document.getElementById("add-job-fields").style.display=e==="job"?"":"none";const t=document.getElementById("add-url-label"),n=document.getElementById("add-url");e==="company"?(t.innerHTML='Website<span class="req">*</span>',n.placeholder="acme.com"):(t.innerHTML='Posting URL<span class="req">*</span>',n.placeholder="https://… the job posting"),document.getElementById("add-save").textContent=e==="company"?"Add company":"Add job",yn()}function dt(){return!!i.meta.capture&&document.getElementById("add-enrich").checked}function yn(){const e=document.getElementById("add-note");dt()?e.innerHTML=z==="company"?"scout fetches the page and fills the blank fields — your values win. The page text also seeds enrichment, so the next Verdict can score it. Pages behind a login wall (LinkedIn) usually can't be fetched.":"scout fetches the posting and fills in the title, location and description — your values win. The job attaches to its company, adding it to the list first if needed. Pages behind a login wall (LinkedIn) usually can't be fetched.":e.innerHTML=z==="company"?"Stored as source <code>manual</code>. Run Enrich then Verdict to score it. A website already in the list is rejected — manual adds never overwrite an existing company.":"Stored as-is, no fetch. The job attaches to the typed company, or to the link's own domain when the posting lives on the company's site — for an ATS link (greenhouse, lever, …), type the company."}async function Os(){qs.forEach(a=>{document.getElementById(a).value=""}),document.getElementById("add-vertical-filter").value="",J=new Set;const e=document.getElementById("add-enrich"),t=document.getElementById("add-enrich-row");e.disabled=!i.meta.capture,t.classList.toggle("disabled",!i.meta.capture),t.title=i.meta.capture?"":"set ANTHROPIC_API_KEY in the server env to enable",i.meta.capture||(e.checked=!1),gn(i.view==="jobs"?"job":"company");const n=document.getElementById("add-stage");n.innerHTML='<option value="">—</option>',document.getElementById("add-vertical-chips").innerHTML='<div class="none">loading…</div>',document.getElementById("add-company-names").innerHTML=(i.rows||[]).map(a=>`<option value="${r(a.name)}">`).join(""),document.getElementById("add-scrim").classList.add("open"),document.getElementById("add-url").focus();try{const a=await(await fetch("/api/facets")).json();(a.funding_stages||[]).forEach(s=>{const o=document.createElement("option");o.value=s,o.textContent=s,n.appendChild(o)}),He=a.verticals||[]}catch{He=[]}vn()}function Pe(){document.getElementById("add-scrim").classList.remove("open")}function vn(){const e=document.getElementById("add-vertical-chips"),t=document.getElementById("add-vertical-filter").value.trim().toLowerCase(),n=He.filter(a=>!t||a.toLowerCase().includes(t));n.length?(e.innerHTML=n.map(a=>`<button type="button" class="vchip${J.has(a)?" sel":""}" data-v="${r(a)}">${r(a)}</button>`).join(""),e.querySelectorAll(".vchip").forEach(a=>a.addEventListener("click",()=>{const s=a.dataset.v;J.has(s)?J.delete(s):J.add(s),a.classList.toggle("sel"),bn()}))):e.innerHTML=`<div class="none">${He.length?"no match":"no verticals in the set yet"}</div>`,bn()}function bn(){const e=J.size;document.getElementById("add-vertical-count").textContent=e?`· ${e} selected`:""}function wn(e){return/^https?:\/\//i.test(e)?e:"https://"+e}async function kn(){const e=document.getElementById("add-url"),t=e.value.trim();if(!t){l(z==="company"?"Website is required.":"Posting URL is required."),e.focus();return}const n=document.getElementById("add-save"),a=n.textContent;n.disabled=!0,dt()&&(n.textContent="reading page…");const s=()=>{n.disabled=!1,n.textContent=a},o=f=>document.getElementById(f).value.trim(),c=dt();let d,u;c?(d="/api/capture",u={url:wn(t),kind:z==="company"?"company_page":"job_posting",fields:z==="company"?{name:o("add-name"),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value,vertical:[...J].join(", ")}:{name:o("add-job-company"),title:o("add-title")}}):z==="company"?(d="/api/companies",u={website:t,name:o("add-name"),vertical:[...J].join(", "),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value}):(d="/api/postings",u={url:wn(t),title:o("add-title"),company:o("add-job-company")});let p;try{p=await fetch(d,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(u)})}catch(f){l(`add failed: ${f.message}`),s();return}if(!p.ok){let f=`HTTP ${p.status}`;try{const k=await p.text();try{f=JSON.parse(k).error||f}catch{f=k.trim()||f}}catch{}if(s(),p.status===409){l(f||"That company is already in the list."),e.focus(),e.select();return}l(`add failed: ${f}`);return}const m=await p.json();if(s(),c&&!m.company_id){l(m.note||"couldn't classify that page");return}if(Pe(),x(),w(),b(),z==="job"){const f=m.posting&&m.posting.title||"job link";l(`tracking: ${f} @ ${m.company_name}${m.posting_updated?" (refreshed)":""}`),Y("jobs")}else c?(l(m.note||(m.company_created?`company added: ${m.company_name}`:`${m.company_name} is already in the list`)),re(m.company_id)):l("company added")}function En(e,t,n){Ae=t;const a=document.getElementById("drawer"),s=document.getElementById("drawer-log");document.getElementById("drawer-title").textContent=e,document.getElementById("drawer-spinner").style.display="",document.getElementById("drawer-cancel").style.display="",document.getElementById("drawer-close").style.display="none",s.innerHTML="",a.classList.add("open"),rt();const o=new EventSource(`/api/jobs/${t}/stream`),c=(d,u)=>{const p=document.createElement("div"),m=!u&&/^\s*warn:/i.test(d);p.className="ln"+(u?" ln-err":m?" ln-warn":""),p.textContent=m?d.replace(/^\s*warn:\s*/i,"⚠ "):d,s.appendChild(p),s.scrollTop=s.scrollHeight};o.addEventListener("line",d=>c(d.data,/error|failed/i.test(d.data))),o.addEventListener("end",d=>{o.close(),Ae=null,c(`— ${d.data} —`,d.data==="failed"),document.getElementById("drawer-spinner").style.display="none",document.getElementById("drawer-cancel").style.display="none",document.getElementById("drawer-close").style.display="",l(`${e} ${d.data}`),n&&Array.isArray(n.company_ids)&&n.company_ids.length>0?Pn(n.company_ids):x(),w(),rt(),b(),i.openId&&re(i.openId)}),o.onerror=()=>{o.close()}}async function Ns(){if(Ae)try{await fetch(`/api/jobs/${Ae}/cancel`,{method:"POST"})}catch{}}let T=null;const Rs={researcher:"researcher",fill:"writer",humanizer:"humanizer",honesty:"honesty check"};function lt(e){return e==="application-stages"||e==="outreach-statuses"}function qe(e){if(e==="outreach-template")return"outreach template";if(e==="taste-filter")return"pre-filter rules";if(e==="playbook")return"playbook";if(e==="application-stages")return"application stages";if(e==="outreach-statuses")return"outreach statuses";if(e&&e.startsWith("outreach-prompts/")){const t=e.slice(17);return(Rs[t]||t)+" prompt"}return e+".md"}async function F(e){T=e;const t=document.getElementById("editor-scrim");document.getElementById("editor-title").textContent="edit "+qe(e),document.getElementById("editor-text").value="loading…",document.getElementById("editor-ver").textContent="";const n=!!e&&e.startsWith("outreach-prompts/"),a=n?e.slice(17):"",s=e==="taste-filter"||n&&a!=="fill";document.getElementById("editor-toggle-row").style.display=s?"":"none",document.getElementById("editor-reset").style.display=n?"":"none",s&&(document.getElementById("editor-toggle-label").textContent=e==="taste-filter"?"Enable the pre-filter (off → bulk verdict runs score every company; the rules below are kept either way)":"Run this stage (off → it is skipped in the pipeline)"),t.classList.add("open");try{const o=await fetch(`/api/${e}`);if(!o.ok){const d=(await o.text().catch(()=>"")).trim();document.getElementById("editor-text").value=o.status===404?"failed to load: HTTP 404 — this route is missing. Restart the scout server (your running binary may predate this feature).":`failed to load: ${d||"HTTP "+o.status}`;return}const c=await o.json();lt(e)?(document.getElementById("editor-title").textContent="edit "+qe(e)+" — one per line",document.getElementById("editor-text").value=(c.statuses||[]).join(`
`)):document.getElementById("editor-text").value=c.content||"",s&&(document.getElementById("editor-enabled").checked=c.enabled!==!1),c.taste_version&&(document.getElementById("editor-ver").textContent="version "+c.taste_version)}catch(o){document.getElementById("editor-text").value="failed to load: "+o.message}}function Oe(){document.getElementById("editor-scrim").classList.remove("open"),T=null}const Ds=[{key:"experience",hard:!0},{key:"voice",hard:!1},{key:"logistics",hard:!1}];async function ut(){document.getElementById("sources-scrim").classList.add("open"),document.getElementById("sources-list").innerHTML='<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>';try{ht(await(await fetch("/api/outreach/sources")).json())}catch(e){l(`failed to load sources: ${e.message}`)}}function pt(){document.getElementById("sources-scrim").classList.remove("open")}function ht(e){const t=document.getElementById("sources-list");if(!t)return;const n=e&&e.needs&&e.needs.length?e.needs.map(s=>({key:s.Key||s.key,hard:s.Hard??s.hard})):Ds,a={};(e&&e.sources||[]).forEach(s=>{(a[s.need]=a[s.need]||[]).push(s)}),t.innerHTML=n.map(s=>{const o=a[s.key]||[],c=o.length?o.map(d=>`<li><span class="src-title">${r(d.title||d.page_id)}</span><button class="src-rm" data-need="${r(s.key)}" data-id="${r(d.page_id)}" title="remove">✕</button></li>`).join(""):`<li class="dim small">${s.hard?"none yet — required for drafting":"none (optional)"}</li>`;return`<div class="src-need">
      <div class="src-need-h">${r(s.key)}${s.hard?' <span class="dim">required</span>':' <span class="dim">optional</span>'}</div>
      <ul class="src-items">${c}</ul></div>`}).join(""),t.querySelectorAll(".src-rm").forEach(s=>s.addEventListener("click",()=>Us(s.dataset.need,s.dataset.id)))}async function Vs(){const e=document.getElementById("sources-refresh-btn");e&&(e.disabled=!0,e.textContent="Discovering…");let t;try{t=await fetch("/api/outreach/sources/refresh",{method:"POST"})}catch(a){l(`refresh failed: ${a.message}`),e&&(e.disabled=!1,e.textContent="Refresh from brain");return}if(!t.ok){l(`refresh failed: ${(await t.text().catch(()=>"")).trim()||"HTTP "+t.status}`),e&&(e.disabled=!1,e.textContent="Refresh from brain");return}const n=await t.json();n.warning?l(n.warning):l("sources refreshed"),ht(n),e&&(e.disabled=!1,e.textContent="Refresh from brain")}async function Us(e,t){let n;try{n=await fetch("/api/outreach/sources/remove",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({need:e,page_id:t})})}catch(a){l(`remove failed: ${a.message}`);return}if(!n.ok){l(`remove failed: ${(await n.text().catch(()=>"")).trim()||"HTTP "+n.status}`);return}ht(await n.json())}async function Js(){if(!T)return;const e=document.getElementById("editor-text").value;let t;if(lt(T))t={statuses:e.split(/\r?\n/).map(o=>o.trim()).filter(Boolean)};else{t={content:e};const o=T.startsWith("outreach-prompts/")&&T!=="outreach-prompts/fill";(T==="taste-filter"||o)&&(t.enabled=document.getElementById("editor-enabled").checked)}let n;try{n=await fetch(`/api/${T}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})}catch(o){l(`save failed: ${o.message}`);return}if(!n.ok){l(`save failed: ${(await n.text().catch(()=>"")).trim()||"HTTP "+n.status}`);return}const a=await n.json();a.taste_version&&(document.getElementById("editor-ver").textContent="version "+a.taste_version);const s=lt(T);l(`${qe(T)} saved`),Oe(),s&&le(),w()}async function zs(){if(!T||!T.startsWith("outreach-prompts/"))return;let e;try{e=await fetch(`/api/${T}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({reset:!0})})}catch(n){l(`reset failed: ${n.message}`);return}if(!e.ok){l(`reset failed: HTTP ${e.status}`);return}const t=await e.json();document.getElementById("editor-text").value=t.content||"",l(`${qe(T)} reset to default`)}document.querySelectorAll("#t thead th[data-k]").forEach(e=>{e.onclick=()=>{const t=e.dataset.k;i.sort.k===t?i.sort.dir*=-1:(i.sort.k=t,i.sort.dir=1),M()}}),document.querySelectorAll("#jt thead th[data-jk]").forEach(e=>{e.onclick=()=>{const t=e.dataset.jk;i.jsort.k===t?i.jsort.dir*=-1:(i.jsort.k=t,i.jsort.dir=1),_()}}),document.getElementById("tab-companies").onclick=()=>Y("companies"),document.getElementById("tab-jobs").onclick=()=>Y("jobs"),document.getElementById("q").oninput=M,document.querySelectorAll("#verdict-chips .v-chip[data-v]").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.v;V.has(t)?V.delete(t):V.add(t),Fe(),M()})}),document.getElementById("flag-filter").addEventListener("click",e=>{ee=!ee,e.currentTarget.classList.toggle("is-on",ee),M()}),document.getElementById("enriched-filter").addEventListener("click",e=>{G=!G,e.currentTarget.classList.toggle("is-on",G),M()}),document.getElementById("jq").oninput=_;for(const e of["fdrop-application","fdrop-outreach"]){const t=document.getElementById(e),n=t.querySelector(".fdrop-btn");n.addEventListener("click",a=>{a.stopPropagation();const s=t.classList.contains("is-open");Ye(),s||(t.classList.add("is-open"),n.setAttribute("aria-expanded","true"))}),t.querySelector(".fdrop-menu").addEventListener("click",a=>a.stopPropagation())}document.addEventListener("click",Ye),document.getElementById("fdrop-application-menu").addEventListener("click",e=>{const t=e.target.closest(".fdrop-item[data-stage]");if(!t)return;const n=t.getAttribute("data-stage");I.has(n)?I.delete(n):I.add(n),Ie(t,I.has(n)),_()}),document.getElementById("fdrop-outreach-menu").addEventListener("click",e=>{const t=e.target.closest(".fdrop-item");if(t){if(t.dataset.toggle==="nextup")ne=!ne,Ie(t,ne);else if(t.dataset.toggle==="notreached")se=!se,Ie(t,se);else if(t.hasAttribute("data-status")){const n=t.getAttribute("data-status");U.has(n)?U.delete(n):U.add(n),Ie(t,U.has(n))}else return;_()}}),Ke(),te(),document.getElementById("pane-close").onclick=ge,document.getElementById("scrim").onclick=ge,document.getElementById("pursuit-close").onclick=ue,document.getElementById("pursuit-scrim").onclick=ue,document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(document.querySelector(".fdrop.is-open")){Ye();return}if(document.getElementById("chat-pane").classList.contains("open")){_t();return}if(aa()){Et();return}if(document.getElementById("profile-scrim").classList.contains("open")){kt();return}if(document.getElementById("add-scrim").classList.contains("open")){Pe();return}if(document.getElementById("run-scrim").classList.contains("open")){Ne();return}if(document.getElementById("help-scrim").classList.contains("open")){Re();return}if(document.getElementById("relink-scrim").classList.contains("open")){ae();return}if(document.getElementById("delcompany-scrim").classList.contains("open")){Le();return}if(document.getElementById("deljob-scrim").classList.contains("open")){Te();return}const t=document.getElementById("pane").classList.contains("open"),n=document.getElementById("pursuit-pane").classList.contains("open");if(t||n){if(Ge==="pursuit"&&n){ue();return}if(Ge==="company"&&t){ge();return}if(t){ge();return}ue();return}if(document.getElementById("key-scrim").classList.contains("open")){wt();return}if(document.getElementById("sources-scrim").classList.contains("open")){pt();return}if(document.getElementById("editor-scrim").classList.contains("open")){Oe();return}if(document.getElementById("settings-scrim").classList.contains("open")){$t();return}});let mt=null;const Fs={enrich:"Fetches and summarizes each company's pages, filling its enrichment row.",verdict:"Scores every company against your criteria — one LLM call each. Only companies with a successful enrichment are scored."};function $n(e){if(i.meta&&i.meta.control===!1){l("control surface disabled");return}mt=e,document.getElementById("run-title").textContent="Run "+e,document.getElementById("run-desc").textContent=Fs[e]||"",document.getElementById("run-only-blanks").checked=!1,document.getElementById("run-workers-input").value=e==="verdict"?10:8;const t=document.getElementById("run-warn"),n=i.stats||{},a=Math.max(0,(n.total_companies||0)-(n.enriched_ok||0));e==="verdict"&&a>0?(document.getElementById("run-warn-text").textContent=`${a} ${a===1?"company isn't":"companies aren't"} enriched yet — verdict will skip ${a===1?"it":"them"}. Run Enrich first to include ${a===1?"it":"them"}.`,t.style.display=""):t.style.display="none",document.getElementById("run-scrim").classList.add("open")}function Ne(){document.getElementById("run-scrim").classList.remove("open"),mt=null}document.getElementById("btn-enrich").onclick=()=>$n("enrich"),document.getElementById("btn-verdict").onclick=()=>$n("verdict"),document.getElementById("run-cancel").onclick=Ne,document.getElementById("run-scrim").onclick=e=>{e.target.id==="run-scrim"&&Ne()},document.getElementById("run-go").onclick=()=>{const e=mt,t=document.getElementById("run-only-blanks").checked,n=parseInt(document.getElementById("run-workers-input").value,10);if(Ne(),!e)return;const a={};t&&(a.only_blanks=!0),n>0&&(a.workers=n),ct(e,a)},document.getElementById("btn-ingest").onclick=()=>document.getElementById("csv-file").click(),document.getElementById("btn-add").onclick=Os;const Ks={add:{title:"Add data",intro:"Two ways to get companies and jobs into scout.",items:[{name:"Ingest CSV",sec:"ingest",desc:"Bulk-import companies from a CSV export (e.g. Crunchbase). Columns are mapped to company fields and new rows are created."},{name:"Add",sec:"ingest",desc:"Add one company or job from its link. Tick “fill in the blanks” to let an ATS API (ashby/greenhouse/lever) or one cheap agent pass complete the details."}]},run:{title:"Run the pipeline",intro:"Enrich must run before Verdict — verdict only scores companies that already have a successful enrichment row.",items:[{name:"Enrich",sec:"enrich",desc:"Fetches and summarizes each company's web presence into an enrichment row. A prerequisite for Verdict."},{name:"Verdict",sec:"verdict",desc:"Scores each enriched company against your criteria with the LLM, producing a yes / maybe / no with reasoning."}]}};function In(e){const t=Ks[e];if(!t)return;document.getElementById("help-title").textContent=t.title;const n=document.getElementById("help-items");if(n.innerHTML="",t.intro){const a=document.createElement("p");a.className="help-intro",a.textContent=t.intro,n.appendChild(a)}t.items.forEach(a=>{const s=document.createElement("div");s.className="help-item";const o=document.createElement("div");o.className="help-item-name",o.textContent=a.name;const c=document.createElement("div");c.className="help-item-desc",c.textContent=a.desc;const d=document.createElement("a");d.className="help-link",d.textContent="Learn more →",d.onclick=()=>{Re(),Ln(),oa(a.sec)},s.appendChild(o),s.appendChild(c),s.appendChild(d),n.appendChild(s)}),document.getElementById("help-scrim").classList.add("open")}function Re(){document.getElementById("help-scrim").classList.remove("open")}document.getElementById("help-add").onclick=()=>In("add"),document.getElementById("help-run").onclick=()=>In("run"),document.getElementById("help-close").onclick=Re,document.getElementById("help-scrim").onclick=e=>{e.target.id==="help-scrim"&&Re()},document.getElementById("add-cancel").onclick=Pe,document.getElementById("add-save").onclick=kn,document.getElementById("add-scrim").onclick=e=>{e.target.id==="add-scrim"&&Pe()},document.querySelectorAll("#add-kind .v-chip").forEach(e=>{e.onclick=()=>gn(e.dataset.kind)}),document.getElementById("add-enrich").addEventListener("change",yn),document.getElementById("add-scrim").addEventListener("keydown",e=>{e.key==="Enter"&&(e.target.tagName!=="INPUT"||e.target.type==="checkbox"||e.target.id==="add-vertical-filter"||e.target.id==="add-job-company"||(e.preventDefault(),kn()))}),document.getElementById("add-vertical-filter").addEventListener("input",vn),document.getElementById("add-headcount").addEventListener("input",e=>{const t=e.target.value.replace(/[^0-9]/g,"");t!==e.target.value&&(e.target.value=t)}),document.getElementById("csv-file").onchange=e=>{const t=e.target.files&&e.target.files[0];t&&Ps(t),e.target.value=""},document.getElementById("drawer-cancel").onclick=Ns,document.getElementById("drawer-close").onclick=()=>document.getElementById("drawer").classList.remove("open"),document.getElementById("editor-cancel").onclick=Oe,document.getElementById("editor-save").onclick=Js,document.getElementById("editor-reset").onclick=zs,document.getElementById("editor-scrim").onclick=e=>{e.target.id==="editor-scrim"&&Oe()},document.getElementById("sources-close").onclick=pt,document.getElementById("sources-scrim").onclick=e=>{e.target.id==="sources-scrim"&&pt()},document.getElementById("sources-refresh-btn").onclick=Vs,document.getElementById("key-cancel").onclick=wt,document.getElementById("key-save").onclick=Bn,document.getElementById("key-remove").onclick=ta,document.getElementById("key-scrim").onclick=e=>{e.target.id==="key-scrim"&&wt()},document.getElementById("key-input").addEventListener("keydown",e=>{e.key==="Enter"&&(e.preventDefault(),Bn())}),document.getElementById("delcompany-cancel").onclick=Le,document.getElementById("delcompany-confirm").onclick=es,document.getElementById("delcompany-scrim").onclick=e=>{e.target.id==="delcompany-scrim"&&Le()},document.getElementById("deljob-cancel").onclick=Te,document.getElementById("deljob-confirm").onclick=ns,document.getElementById("deljob-scrim").onclick=e=>{e.target.id==="deljob-scrim"&&Te()},document.getElementById("relink-cancel").onclick=ae,document.getElementById("relink-scrim").onclick=e=>{e.target.id==="relink-scrim"&&ae()},document.getElementById("relink-search").addEventListener("input",e=>{en(e.target.value)}),document.getElementById("relink-search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const t=document.querySelector("#relink-results .relink-result:not([disabled])");t&&tn(t.dataset.id)}}),document.getElementById("relink-results").addEventListener("click",e=>{const t=e.target.closest(".relink-result");t&&!t.disabled&&tn(t.dataset.id)});function ft(e){if(e==null)return"—";let t=Math.max(0,e|0);if(t<90)return`${t}s ago`;const n=Math.round(t/60);if(n<90)return`${n}m ago`;const a=Math.round(n/60);return a<48?`${a}h ago`:`${Math.round(a/24)}d ago`}async function gt(){try{const e=await fetch("/api/profile");if(!e.ok)throw new Error(`HTTP ${e.status}`);i.profile=await e.json()}catch{i.profile=null}N()}const K='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.6 2.4a1.2 1.2 0 0 1 1.7 1.7L5.6 11.8l-3 1 1-3z"/><path d="M10.4 3.6l2 2"/></svg>',be='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 8a5.4 5.4 0 1 1-1.5-3.8"/><path d="M13.6 2.6V5.2H11"/></svg>',Ws='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="11" r="2.6"/><path d="M6.9 9.1 13 3M11 5l1.6 1.6M9.3 6.7l1.6 1.6"/></svg>',xn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="2.4"/></svg>',Ys='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.2h7.2a1.6 1.6 0 0 1 1.6 1.6v8H4.6A1.6 1.6 0 0 1 3 11.2z"/><path d="M11.8 12.8h1.4v-9A1.6 1.6 0 0 0 11.6 2.4H5.4"/><path d="M5.4 5.8h3.6M5.4 8.2h3.6"/></svg>',Gs='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3.5" width="12" height="9" rx="1.6"/><path d="M2.6 4.6 8 8.8l5.4-4.2"/></svg>',yt='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.2h5.4l2.6 2.6v9H4z"/><path d="M9.4 2.2v2.6H12"/><path d="M6 7h4M6 9.2h4M6 11.4h2.4"/></svg>',Qs='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.6v2M8 12.4v2M14.4 8h-2M3.6 8h-2M12.5 3.5 11 5M5 11l-1.5 1.5M12.5 12.5 11 11M5 5 3.5 3.5"/><circle cx="8" cy="8" r="2.2"/></svg>',Zs='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.4 3.4h11.2L9.4 8.4v4.2l-2.8 1.4V8.4z"/></svg>';function P(e){const t=e.dot||e.note?`<div class="crit-status">${e.dot?`<span class="pf-dot ${e.dot}"></span>`:""}${e.note?`<span class="crit-note-t">${r(e.note)}</span>`:""}</div>`:"",n=e.actID?` id="${e.actID}"`:"";return`<div class="settings-item">
    <span class="settings-item-icon">${e.icon}</span>
    <div class="settings-item-main">
      <div class="settings-item-name">${e.nameHTML}</div>
      <div class="settings-item-desc">${r(e.desc)}</div>
      ${t}
    </div>
    <button class="crit-edit"${n} data-act="${e.act}" title="${e.actTitle}" aria-label="${e.actLabel}">${e.actIcon}</button>
  </div>`}function N(){const e=document.getElementById("criteria-stats");if(!e)return;const t=i.profile,a=(t&&t.active_source||i.stats&&i.stats.taste_source||"").startsWith("brain:"),s=t&&typeof t.body=="string";let o;if(a){let E="off",B="";const Ee=t&&t.criteria_state;Ee==="current"?(E="ok",B="current · verified "+ft(t.verified_age_seconds)):Ee==="changed"?(E="warn",B="changed — re-distill"):Ee==="unverified"?(E="warn",B=t&&!t.reachable&&s?"brain offline · using cache":"unverified — re-distill"):t&&!t.reachable&&s?(E="warn",B="brain offline · using cache"):s&&(E="ok",B="fetched "+ft(t.age_seconds)),o=P({icon:xn,nameHTML:s?'<span class="edit-link" data-act="view-profile" title="view the company-fit brief">company-fit brief</span>':"company-fit brief",dot:E,note:B,desc:"The criteria scout feeds the verdict stage — distilled from the brain.",act:"refresh-profile",actID:"refresh-profile",actIcon:be,actTitle:"re-distill the company-fit brief from the brain",actLabel:"refresh company-fit brief"})}else o=P({icon:xn,nameHTML:'<span class="edit-link" data-act="edit-taste" title="edit taste.md">taste</span>',note:t&&t.configured?"brain offline — local fallback":"",dot:t&&t.configured?"warn":"",desc:"Local fallback criteria used when the brain is unreachable.",act:"edit-taste",actIcon:K,actTitle:"edit taste.md",actLabel:"edit taste"});const c=i.sources&&i.sources.sources||[],d=c.filter(E=>E.need==="experience").length,u=c.filter(E=>E.need==="voice").length,p=c.filter(E=>E.need==="logistics").length;let m="off",f="not discovered yet — refresh from the brain";d>0?(m="ok",f=`${d} experience · ${u} voice · ${p} logistics`):c.length>0&&(m="warn",f="no experience yet — refresh");const k=c.length?'<span class="edit-link" data-act="view-sources" title="view discovered experience, voice + logistics">outreach knowledge</span>':"outreach knowledge",C=P({icon:Qs,nameHTML:k,dot:m,note:f,desc:"Your experience, voice + logistics, discovered from the brain to ground outreach and application answers.",act:"refresh-sources",actID:"refresh-sources",actIcon:be,actTitle:"re-discover experience, voice + logistics from the brain",actLabel:"refresh outreach knowledge"}),X=P({icon:Ys,nameHTML:'<span class="edit-link" data-act="edit-playbook" title="edit the verdict playbook">playbook</span>',desc:"How scout judges — the reasoning rules behind every verdict.",act:"edit-playbook",actIcon:K,actTitle:"edit the verdict playbook",actLabel:"edit playbook"}),de=P({icon:Gs,nameHTML:'<span class="edit-link" data-act="edit-template" title="edit the outreach email template">email template</span>',desc:"The outreach email format — verbatim prose with fill-in holes.",act:"edit-template",actIcon:K,actTitle:"edit the outreach email template",actLabel:"edit email template"}),we=[["researcher","1 · Researcher","Searches the web for true company facts and the best hooks to open with."],["fill","2 · Writer","Writes the email's blanks from the research, your experience, and your voice."],["humanizer","3 · Humanizer","Strips AI tells and matches your voice — never changes a fact."],["honesty","4 · Honesty check","Vetoes any claim about you beyond your documented experience."]],Je=we.map(([E,B,Ee])=>P({icon:yt,nameHTML:`<span class="edit-link" data-act="edit-prompt-${E}" title="edit the ${B.replace(/^\d+ · /,"")} prompt">${B}</span>`,desc:Ee,act:`edit-prompt-${E}`,actIcon:K,actTitle:`edit the ${B} prompt`,actLabel:`edit ${B} prompt`})).join(""),ke=!i.stats||i.stats.taste_filter_enabled!==!1,$=P({icon:Zs,nameHTML:'<span class="edit-link" data-act="edit-taste-filter" title="edit the pre-filter rules">pre-filter</span>',desc:"Cheap mechanical gate before the LLM verdict — location, headcount, vertical, stage. Toggle it off in the editor to score every company.",dot:ke?"ok":"off",note:ke?"active":"disabled — scoring everything",act:"edit-taste-filter",actIcon:K,actTitle:"edit the pre-filter rules",actLabel:"edit pre-filter rules"}),W=i.anthropicKey;let Bt="off",Lt="not set — verdict, capture & outreach disabled";W&&W.key_source==="db"?(Bt="ok",Lt="set here · active"):W&&W.key_source==="env"&&(Bt="ok",Lt="from the environment");const ha=P({icon:Ws,nameHTML:'<span class="edit-link" data-act="edit-anthropic-key" title="set the Anthropic API key">Anthropic API key</span>',dot:Bt,note:Lt,desc:"Powers scoring, capture & outreach. Set here to run scout without the env var.",act:"edit-anthropic-key",actIcon:K,actTitle:"set the Anthropic API key",actLabel:"set Anthropic API key"}),ma=P({icon:yt,nameHTML:'<span class="edit-link" data-act="edit-application-stages" title="edit the application stages">application stages</span>',desc:"The application pipeline labels you track (applied, screening, interview…). One per line.",act:"edit-application-stages",actIcon:K,actTitle:"edit the application stages",actLabel:"edit application stages"}),fa=P({icon:yt,nameHTML:'<span class="edit-link" data-act="edit-outreach-statuses" title="edit the outreach statuses">outreach statuses</span>',desc:"The outreach reply labels (initial contact, no response, replied…). One per line.",act:"edit-outreach-statuses",actIcon:K,actTitle:"edit the outreach statuses",actLabel:"edit outreach statuses"});e.innerHTML=`<div class="settings-section">
       <div class="settings-group-h">Job hunting</div>
       ${o}${X}${$}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Tracking</div>
       ${ma}${fa}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Outreach</div>
       ${C}${de}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Outreach pipeline</div>
       ${Je}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Integrations</div>
       ${ha}
     </div>`;const Tt={"view-profile":()=>sa(i.profile),"refresh-profile":na,"edit-taste":()=>F("taste"),"edit-taste-filter":()=>F("taste-filter"),"edit-application-stages":()=>F("application-stages"),"edit-outreach-statuses":()=>F("outreach-statuses"),"edit-playbook":()=>F("playbook"),"edit-template":()=>F("outreach-template"),"view-sources":ut,"refresh-sources":Xs,"edit-anthropic-key":ea};for(const[E]of we)Tt[`edit-prompt-${E}`]=()=>F(`outreach-prompts/${E}`);e.querySelectorAll("[data-act]").forEach(E=>{const B=E.dataset.act;B&&Tt[B]&&(E.onclick=Tt[B])})}async function vt(){try{i.sources=await(await fetch("/api/outreach/sources")).json()}catch{i.sources=null}N()}async function Xs(){const e=document.getElementById("refresh-sources");e&&(e.classList.add("spinning"),e.disabled=!0);let t;try{t=await fetch("/api/outreach/sources/refresh",{method:"POST"})}catch(a){l(`refresh failed: ${a.message}`),vt();return}if(!t.ok){const a=(await t.text().catch(()=>"")).trim();l(`refresh failed: ${a||"HTTP "+t.status}`),vt();return}const n=await t.json();n.warning?l(n.warning):l("outreach knowledge refreshed"),i.sources={sources:n.sources||[],needs:i.sources&&i.sources.needs||[]},N()}async function _n(){try{i.anthropicKey=await(await fetch("/api/integrations/anthropic")).json()}catch{i.anthropicKey=null}N()}async function ea(){document.getElementById("key-scrim").classList.add("open"),document.getElementById("key-input").value="",await _n(),bt();const e=document.getElementById("key-input");e&&e.focus()}function bt(){const e=i.anthropicKey||{},t=document.getElementById("key-status");t&&(t.textContent=e.key_source==="db"?"A key is set here (stored in scout).":e.key_source==="env"?"Using the ANTHROPIC_API_KEY environment variable. Saving a key here overrides it.":"No key set. Scoring, capture, and outreach are disabled until you add one.");const n=document.getElementById("key-remove");n&&(n.style.display=e.key_source==="db"?"":"none");const a=document.getElementById("key-restart-hint");if(a){const s=e.has_key&&i.meta&&(i.meta.outreach===!1||i.meta.chat===!1);a.style.display=s?"":"none"}}function wt(){document.getElementById("key-scrim").classList.remove("open")}async function Bn(){const e=(document.getElementById("key-input").value||"").trim();if(!e){l("paste a key first");return}const t=document.getElementById("key-save");t&&(t.disabled=!0,t.textContent="Verifying…");const n=()=>{t&&(t.disabled=!1,t.textContent="Save key")};let a;try{a=await fetch("/api/integrations/anthropic",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:e})})}catch(s){l(`save failed: ${s.message}`),n();return}if(!a.ok){l((await a.text().catch(()=>"")).trim()||`HTTP ${a.status}`),n();return}i.anthropicKey=await a.json(),document.getElementById("key-input").value="",n(),l("Anthropic key saved"),await it(),bt(),N()}async function ta(){const e=document.getElementById("key-remove");e&&(e.disabled=!0);let t;try{t=await fetch("/api/integrations/anthropic",{method:"DELETE"})}catch(n){l(`remove failed: ${n.message}`),e&&(e.disabled=!1);return}if(e&&(e.disabled=!1),!t.ok){l((await t.text().catch(()=>"")).trim()||`HTTP ${t.status}`);return}i.anthropicKey=await t.json(),l(i.anthropicKey.has_key?"removed — using the environment key":"Anthropic key removed"),await it(),bt(),N()}async function na(){const e=document.getElementById("refresh-profile");e&&(e.classList.add("spinning"),e.disabled=!0);let t;try{t=await fetch("/api/profile/refresh",{method:"POST"})}catch(n){l(`refresh failed: ${n.message}`),gt();return}if(!t.ok){const n=await t.text().catch(()=>"");l(`refresh failed: ${(n||"").trim()||"HTTP "+t.status}`),gt();return}i.profile=await t.json(),N(),l("company-fit brief refreshed"),w()}function sa(e){!e||typeof e.body!="string"||(document.getElementById("profile-modal-meta").textContent=`${e.chars||0} chars · fetched ${ft(e.age_seconds)}`,document.getElementById("profile-modal-body").textContent=e.body,document.getElementById("profile-scrim").classList.add("open"))}function kt(){document.getElementById("profile-scrim").classList.remove("open")}document.getElementById("profile-modal-close").onclick=kt,document.getElementById("profile-scrim").onclick=e=>{e.target.id==="profile-scrim"&&kt()};function Ln(){document.getElementById("docs-scrim").classList.add("open");const e=document.querySelector("#docs-nav a");De(e?e.dataset.sec:null);const t=document.getElementById("docs-body");t&&(t.scrollTop=0)}function Et(){document.getElementById("docs-scrim").classList.remove("open")}function aa(){return document.getElementById("docs-scrim").classList.contains("open")}function De(e){document.querySelectorAll("#docs-nav a").forEach(t=>t.classList.toggle("active",t.dataset.sec===e))}function oa(e){const t=document.getElementById("doc-"+e);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),De(e)}document.getElementById("open-docs").onclick=Ln,document.getElementById("docs-close").onclick=Et,document.getElementById("docs-scrim").onclick=e=>{e.target.id==="docs-scrim"&&Et()};function ia(){document.getElementById("settings-scrim").classList.add("open"),N()}function $t(){document.getElementById("settings-scrim").classList.remove("open")}document.getElementById("open-settings").onclick=ia,document.getElementById("settings-close").onclick=$t,document.getElementById("settings-scrim").onclick=e=>{e.target.id==="settings-scrim"&&$t()},document.querySelectorAll("#docs-nav a").forEach(e=>{e.onclick=()=>{const t=document.getElementById("doc-"+e.dataset.sec);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),De(e.dataset.sec)}}),function(){const e=document.getElementById("docs-body");if(!e||!("IntersectionObserver"in window))return;const t=new IntersectionObserver(n=>{const a=n.filter(s=>s.isIntersecting).sort((s,o)=>s.boundingClientRect.top-o.boundingClientRect.top);a.length&&De(a[0].target.id.replace(/^doc-/,""))},{root:e,rootMargin:"0px 0px -65% 0px",threshold:0});document.querySelectorAll("#docs-body section").forEach(n=>t.observe(n))}(),i.chat={scope:null,scopeId:"",threadId:null,streaming:!1,es:null};function ra(e){return(e||[]).filter(t=>t&&t.type==="text").map(t=>t.text||"").join("")}function ca(e){return(e||[]).filter(t=>t&&t.type==="tool_use").map(t=>t.name)}function Ve(e,t){const n=document.createElement("div");return n.className="chat-msg chat-"+e,n.textContent=t||"",n}function It(){const e=document.getElementById("chat-messages");e.scrollTop=e.scrollHeight}function da(){const e=document.createElement("div");return e.className="chat-empty",e.textContent=i.chat.scope==="global"?"Tell me about a job you applied to (paste the link), or ask what's already tracked.":"Ask about this "+(i.chat.scope==="company"?"company":"role")+" — I can research it on the web and update scout.",e}function Tn(e){const t=document.getElementById("chat-messages");t.innerHTML="";for(const n of e||[]){const a=ra(n.content);if(n.role==="user")a&&t.appendChild(Ve("user",a));else if(n.role==="assistant"){const s=ca(n.content);if(!a&&!s.length)continue;const o=Ve("assistant",a);if(s.length){const c=document.createElement("div");c.className="chat-tools",c.textContent="· used "+s.join(", "),o.appendChild(c)}t.appendChild(o)}}t.children.length||t.appendChild(da()),It()}async function xt(e,t,n){if(!i.meta||!i.meta.chat){l("chat needs ANTHROPIC_API_KEY in the server env");return}i.chat.es&&(i.chat.es.close(),i.chat.es=null),i.chat={scope:e,scopeId:t||"",threadId:null,streaming:!1,es:null},document.getElementById("chat-title").textContent=e==="global"?"Chat":e==="company"?"Chat · company":"Chat · role",document.getElementById("chat-sub").textContent=e==="global"?"":n||"";const a=document.getElementById("chat-messages");a.innerHTML='<div class="chat-empty">loading…</div>';const s=document.getElementById("chat-pane");s.classList.add("open"),document.getElementById("chat-scrim").classList.add("open"),s.setAttribute("aria-hidden","false");try{const o="scope="+encodeURIComponent(e)+(t?"&scope_id="+encodeURIComponent(t):""),c=await fetch("/api/chat/threads?"+o);if(!c.ok)throw new Error((await c.text().catch(()=>"")).trim()||"HTTP "+c.status);const d=await c.json();i.chat.threadId=d.thread.id,Tn(d.messages||[])}catch(o){a.innerHTML='<div class="chat-empty">Failed to open chat: '+r(o.message)+"</div>";return}document.getElementById("chat-input").focus()}function _t(){i.chat.es&&(i.chat.es.close(),i.chat.es=null);const e=document.getElementById("chat-pane");e.classList.remove("open"),document.getElementById("chat-scrim").classList.remove("open"),e.setAttribute("aria-hidden","true")}function Ue(e){i.chat.streaming=e,document.getElementById("chat-send").disabled=e;const t=document.getElementById("chat-input");t.disabled=e,e||t.focus()}function Cn(){const e=document.getElementById("chat-input");e.style.height="auto",e.style.height=Math.min(e.scrollHeight,160)+"px"}async function Sn(){const e=document.getElementById("chat-input"),t=e.value.trim();if(!t||i.chat.streaming||!i.chat.threadId)return;e.value="",Cn(),Ue(!0);const n=document.getElementById("chat-messages"),a=n.querySelector(".chat-empty");a&&a.remove(),n.appendChild(Ve("user",t));const s=Ve("assistant","");s.classList.add("chat-streaming"),n.appendChild(s),It();let o="";const c=m=>{s.classList.remove("chat-streaming"),s.textContent="⚠ "+m,Ue(!1)},d=i.chat.threadId;let u;try{u=await fetch("/api/chat/"+d+"/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t})})}catch(m){c(m.message);return}if(!u.ok){c((await u.text().catch(()=>"")).trim()||"HTTP "+u.status);return}const p=new EventSource("/api/chat/"+d+"/stream");i.chat.es=p,p.addEventListener("delta",m=>{o+=m.data,s.textContent=o,It()}),p.addEventListener("end",async m=>{p.close(),i.chat.es===p&&(i.chat.es=null),s.classList.remove("chat-streaming"),Ue(!1),i.chat.threadId===d&&await la(),ua(),typeof m.data=="string"&&m.data.indexOf("error")===0&&l("chat: "+m.data)}),p.onerror=()=>{p.close(),i.chat.es===p&&(i.chat.es=null),s.classList.remove("chat-streaming"),Ue(!1)}}async function la(){const e=i.chat.scope,t=i.chat.scopeId,n="scope="+encodeURIComponent(e)+(t?"&scope_id="+encodeURIComponent(t):"");try{const a=await fetch("/api/chat/threads?"+n);if(!a.ok)return;const s=await a.json();Tn(s.messages||[])}catch{}}function ua(){x(),b(),w(),i.openId&&re(i.openId)}document.getElementById("open-chat").onclick=()=>xt("global","",""),document.getElementById("chat-close").onclick=_t,document.getElementById("chat-scrim").onclick=_t,document.getElementById("chat-form").addEventListener("submit",e=>{e.preventDefault(),Sn()}),document.getElementById("chat-input").addEventListener("input",Cn),document.getElementById("chat-input").addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),Sn())}),qt("#t tbody",An),qt("#jt tbody",Hn);const pa=(()=>{try{return localStorage.getItem("scout-view")}catch{return null}})();Y(pa==="jobs"?"jobs":"companies",{render:!1}),x(),b(),w(),it(),rt(),gt(),vt(),_n(),le()}va({"":{view:()=>({mount(v){v.innerHTML=$a,Ia()}}),chrome:!1}},{title:"scout"});ka();Ea();
