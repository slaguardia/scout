(function(){const v=document.createElement("link").relList;if(v&&v.supports&&v.supports("modulepreload"))return;for(const g of document.querySelectorAll('link[rel="modulepreload"]'))c(g);new MutationObserver(g=>{for(const I of g)if(I.type==="childList")for(const l of I.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&c(l)}).observe(document,{childList:!0,subtree:!0});function x(g){const I={};return g.integrity&&(I.integrity=g.integrity),g.referrerPolicy&&(I.referrerPolicy=g.referrerPolicy),g.crossOrigin==="use-credentials"?I.credentials="include":g.crossOrigin==="anonymous"?I.credentials="omit":I.credentials="same-origin",I}function c(g){if(g.ep)return;g.ep=!0;const I=x(g);fetch(g.href,I)}})();function So(w,v){const x=v.replace(/^#/,"");let c=null;for(const g of Object.keys(w))(x===g||x.startsWith(g))&&(c===null||g.length>c.length)&&(c=g);return c===null&&""in w&&(c=""),c}function _o(w){return typeof w=="function"?{view:w,chrome:!0}:{view:w.view,chrome:w.chrome!==!1}}function To(w,v={}){const x=v.root??document.body,c=v.title??document.title??"",g=v.brandHref??"#",I=document.createElement("main"),l=document.createElement("header");l.className="cap-head";const A=document.createElement("a");A.className="brand",A.href=g,A.textContent=c,A.setAttribute("aria-label",`${c} — home`),l.appendChild(A);const O=document.createElement("nav");O.className="cap-nav",O.setAttribute("aria-label","Views");for(const P of v.nav??[]){const B=document.createElement("a");B.href=P.href,B.textContent=P.label,P.ariaLabel&&B.setAttribute("aria-label",P.ariaLabel),O.appendChild(B)}l.appendChild(O);const E=document.createElement("section");E.className="tk-content",I.appendChild(l),I.appendChild(E);const U=document.createElement("div");U.className="tk-bleed";const te=P=>{var B;for(const C of Array.from(O.querySelectorAll("a"))){const ne=((B=C.getAttribute("href"))==null?void 0:B.replace(/^#/,""))??"";C.toggleAttribute("aria-current",P!==null&&P!==""&&ne===P),C.hasAttribute("aria-current")&&C.setAttribute("aria-current","page")}};let we=0;const Me=()=>{const P=So(w,location.hash);if(te(P),P===null){U.isConnected&&U.remove(),I.isConnected||x.appendChild(I),Bo(E,"Not found.");return}const{view:B,chrome:C}=_o(w[P]),ne=C?E:U;C?(U.isConnected&&U.remove(),I.isConnected||x.appendChild(I)):(I.isConnected&&I.remove(),U.isConnected||x.appendChild(U)),ne.replaceChildren();const st=B(),Ae=++we,ke=st.mount(ne);ke instanceof Promise&&ke.catch(F=>{Ae===we&&Lo(ne,String(F))})};window.addEventListener("hashchange",Me),Me()}function Bo(w,v){w.replaceChildren();const x=document.createElement("div");x.className="tk-empty",x.textContent=v,w.appendChild(x)}function Lo(w,v){w.replaceChildren();const x=document.createElement("div");x.className="tk-error",x.textContent=v,w.appendChild(x)}function Co(){if(!("serviceWorker"in navigator))return;if(["localhost","127.0.0.1","[::1]",""].includes(location.hostname)){navigator.serviceWorker.getRegistrations().then(v=>{for(const x of v)x.unregister()}),window.caches&&caches.keys().then(v=>{for(const x of v)caches.delete(x)});return}window.addEventListener("load",()=>{navigator.serviceWorker.register("/sw.js").catch(()=>{})})}async function jo(){let w;try{w=await fetch("/api/me",{headers:{Accept:"application/json"}})}catch{return null}if(!w.ok)return null;let v;try{v=await w.json()}catch{return null}return typeof v.email=="string"&&v.email?{email:v.email}:null}const Mo=`
<div class="layout">
<aside class="sidebar">
  <div class="sidebar-brand"><div class="brand">scout</div></div>
  <div class="block" id="block-view">
    <div class="view-switch" title="switch the main area">
      <button class="tab active" id="tab-companies" title="companies" aria-label="companies">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2.5" width="10" height="11.5" rx="1"/><path d="M6 5.5h1M9 5.5h1M6 8h1M9 8h1M6 10.5h1M9 10.5h1"/></svg>
        <span class="tab-label">companies</span>
      </button>
      <button class="tab" id="tab-jobs" title="jobs" aria-label="jobs">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="11" height="8" rx="1.2"/><path d="M5.8 5V3.8a1 1 0 011-1h2.4a1 1 0 011 1V5"/><path d="M2.5 8.5h11"/></svg>
        <span class="tab-label">jobs</span>
      </button>
      <button class="tab" id="tab-inbox" title="Inbox — replies, application updates, follow-ups due" aria-label="inbox">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 7a3.8 3.8 0 0 1 7.6 0c0 3 1.2 4 1.2 4H3s1.2-1 1.2-4z"/><path d="M6.7 13a1.5 1.5 0 0 0 2.6 0"/></svg>
        <span class="tab-label">inbox</span>
        <span class="notif-badge" id="notif-badge" style="display:none">0</span>
      </button>
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
    <div class="filter-row" id="jobs-followup-nav" style="display:none"></div>
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
      <button class="doc-btn foot-btn" id="open-settings" title="Settings — criteria, playbook, email template" aria-label="settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span class="ft-label">Settings</span>
      </button>
      <button class="doc-btn foot-btn" id="open-docs" title="How scout works — ingestion, prompts, files, triage" aria-label="how it works">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 11.5v.01M6.4 6.2a1.6 1.6 0 1 1 2.4 1.5c-.5.3-.8.6-.8 1.3"/></svg>
        <span class="ft-label">How it works</span>
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

  <!-- settings: a full-page view (nav of groups + inline editable fields) -->
  <div class="main-view" id="settings-view" style="display:none">
    <div id="criteria-stats"><div class="loading-row"><span class="spinner"></span><span>loading…</span></div></div>
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
  <div class="drawer-summary" id="drawer-summary" hidden></div>
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

<!-- settings: criteria, playbook, email template -->
<!-- Gmail OAuth client config: paste the Google Cloud client id/secret so the
     Connect flow works without a server env var (M55). -->
<div class="modal-scrim" id="gmail-config-scrim">
  <div class="modal" style="width:540px">
    <div class="modal-head">
      <h2>Gmail — Google OAuth client</h2>
    </div>
    <div class="modal-body">
      <div class="modal-note">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.5" stroke-linecap="round"/></svg>
        <span>In Google Cloud, create an <strong>OAuth client (Web)</strong> with redirect <code>&lt;this app&gt;/api/gmail/callback</code> and the <code>gmail.send</code> + <code>gmail.readonly</code> scopes, then paste its id + secret here. See <code>docs/operations.md</code>.</span>
      </div>
      <label class="field-label" for="gmail-client-id">Client ID</label>
      <input id="gmail-client-id" class="key-input" placeholder="…apps.googleusercontent.com" autocomplete="off" spellcheck="false">
      <label class="field-label" for="gmail-client-secret">Client secret</label>
      <input id="gmail-client-secret" class="key-input" type="password" placeholder="(leave blank to keep the current secret)" autocomplete="off" spellcheck="false">
      <label class="field-label" for="gmail-redirect">Redirect URI <span class="dim">(optional — derived from this host if blank)</span></label>
      <input id="gmail-redirect" class="key-input" placeholder="https://…/api/gmail/callback" autocomplete="off" spellcheck="false">
    </div>
    <div class="modal-foot">
      <button class="btn" id="gmail-config-remove" style="display:none">Remove</button>
      <button class="btn" id="gmail-config-cancel">Cancel</button>
      <button class="btn btn-primary" id="gmail-config-save">Save</button>
    </div>
  </div>
</div>

<!-- the notifications / inbox panel: Gmail replies, application-status updates,
     and follow-ups due (M55) -->
<div class="main-view" id="inbox-view" style="display:none">
  <div class="settings-page">
    <div class="settings-page-head settings-page-head--row">
      <div>
        <h2>Inbox</h2>
        <div class="settings-page-sub">Replies, application updates, and follow-ups due — synced from Gmail.</div>
      </div>
      <button class="btn" id="notifications-sync" title="check Gmail now for new mail">Sync now</button>
    </div>
    <div id="notifications-body"><div class="loading-row"><span class="spinner"></span><span>loading…</span></div></div>
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

<div class="modal-scrim" id="delcontact-scrim">
  <div class="modal" style="width:460px">
    <div class="modal-head">
      <h2>Remove contact?</h2>
    </div>
    <div class="modal-body">
      <p id="delcontact-summary" style="margin:0; font-size:14px; line-height:1.5;"></p>
      <div class="modal-note modal-note-danger">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.5 1 14h14L8 1.5z" stroke-linejoin="round"/><path d="M8 6.5v3.5M8 11.8v.4" stroke-linecap="round"/></svg>
        <span id="delcontact-note"></span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="delcontact-cancel">Cancel</button>
      <button class="btn btn-danger" id="delcontact-confirm">Remove</button>
    </div>
  </div>
</div>

<div class="modal-scrim" id="sendfollowup-scrim">
  <div class="modal" style="width:560px">
    <div class="modal-head">
      <h2>Send follow-up</h2>
    </div>
    <div class="modal-body">
      <p id="sendfollowup-to" class="small dim" style="margin:0 0 8px;"></p>
      <textarea class="input" id="sendfollowup-body" rows="12" spellcheck="false"></textarea>
      <p class="small dim" style="margin:8px 0 0;">Sends as a reply on the existing Gmail thread and logs it — the next follow-up re-arms automatically.</p>
    </div>
    <div class="modal-foot">
      <button class="btn" id="sendfollowup-cancel">Cancel</button>
      <button class="btn btn-primary" id="sendfollowup-confirm">Send</button>
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
<div class="main-view" id="docs-view" style="display:none">
  <div class="docs" aria-label="How scout works">
    <div class="docs-head">
      <span class="dot" aria-hidden="true"></span>
      <h2>How scout works</h2>
      <span class="sub">a guided tour of the pipeline</span>
      <span class="spacer"></span>
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
`;function Ao(w){const v={k:"verdict",dir:1},x={k:"created_at",dir:1},c={rows:[],sort:{...v},openId:null,stats:null,profile:null,view:"companies",jobs:[],jsort:{...x},applicationStages:["applied","screening","interview","offer","rejected"],outreachStatuses:["initial contact","no response","replied","followed up"],followupInterval:5,followupTemplate:"",openDetail:null,anthropicKey:null,gmail:null,notifications:{notifications:[],unread:0,followups:[]},settingsGroup:"outreach"},g=e=>"pill pill-"+(e||"none"),I='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 14V2.5"/><path d="M3.5 2.5c3-1.2 6 1.2 9 0V9c-3 1.2-6-1.2-9 0z"/></svg>',l=e=>String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),A=e=>/^https?:\/\//i.test(String(e??""))?l(e):"#";async function O(){const t=await(await fetch("/api/companies")).json();c.rows=t.rows||[],G()}async function E(){let e;try{const t=await fetch("/api/postings");if(!t.ok)return;e=await t.json()}catch{return}c.jobs=e.rows||[],j(),U(),we()}function U(){if(!h.postingId)return;const e=c.jobs.find(t=>t.posting_id===h.postingId);e&&(h.row=e,document.getElementById("pursuit-pane").classList.contains("open")&&ae())}let te=null;function we(){const e=c.jobs.some(t=>t.outreach_draft_status==="researching");e&&!te?te=setInterval(Me,4e3):!e&&te&&(clearInterval(te),te=null)}async function Me(){let e;try{const a=await fetch("/api/postings");if(!a.ok)return;e=await a.json()}catch{return}const t=e.rows||[],n=new Map(c.jobs.map(a=>[a.posting_id,a.outreach_draft_status])),s=t.some(a=>n.get(a.posting_id)!==a.outreach_draft_status)||t.length!==c.jobs.length;c.jobs=t,s&&(j(),U()),we()}async function P(){await Promise.all([fetch("/api/application-stages").then(e=>e.ok?e.json():null).then(e=>{e&&Array.isArray(e.statuses)&&e.statuses.length&&(c.applicationStages=e.statuses)}).catch(()=>{}),fetch("/api/outreach-statuses").then(e=>e.ok?e.json():null).then(e=>{e&&Array.isArray(e.statuses)&&e.statuses.length&&(c.outreachStatuses=e.statuses)}).catch(()=>{}),fetch("/api/followup-interval").then(e=>e.ok?e.json():null).then(e=>{e&&Number.isInteger(e.days)&&(c.followupInterval=e.days)}).catch(()=>{}),fetch("/api/followup-template").then(e=>e.ok?e.json():null).then(e=>{e&&typeof e.content=="string"&&(c.followupTemplate=e.content)}).catch(()=>{})]),ct(),c.view==="jobs"&&j()}function B(e,{render:t=!0}={}){c.view=e;try{localStorage.setItem("scout-view",e)}catch{}document.getElementById("tab-companies").classList.toggle("active",e==="companies"),document.getElementById("tab-jobs").classList.toggle("active",e==="jobs"),document.getElementById("tab-inbox").classList.toggle("active",e==="inbox"),document.getElementById("companies-view").style.display=e==="companies"?"":"none",document.getElementById("jobs-view").style.display=e==="jobs"?"":"none";const n=(u,p)=>{const m=document.getElementById(u);m&&(m.style.display=p?"":"none")};n("settings-view",e==="settings"),n("inbox-view",e==="inbox"),n("docs-view",e==="docs"),document.getElementById("open-settings").classList.toggle("is-active",e==="settings");const s=document.getElementById("open-docs");s&&s.classList.toggle("is-active",e==="docs");const a=document.getElementById("block-run");a&&(a.style.display=e==="companies"?"":"none");const o=document.getElementById("btn-ingest");o&&(o.style.display=e==="companies"?"":"none");const i=e==="companies"||e==="jobs";document.getElementById("block-filter-companies").style.display=e==="companies"?"":"none",document.getElementById("block-filter-jobs").style.display=e==="jobs"?"":"none";const d=document.getElementById("block-columns");d&&(d.style.display=i?"":"none"),Wt(),t&&(e==="jobs"?j():e==="settings"?W():e==="inbox"?(es(),oe()):e==="docs"?oo():G())}async function C(){let e;try{const t=await fetch("/api/stats");if(!t.ok)throw new Error(`HTTP ${t.status}`);e=await t.json()}catch(t){console.warn(`stats failed: ${t.message}`);return}c.stats=e,ne()}function ne(){W()}function st(e,t,n){const s=e[n]??"",a=t[n]??"";if(n==="headcount")return(s|0)-(a|0);if(n==="verdict"){const o={yes:0,maybe:1,no:2,"":3};return(o[s]??3)-(o[a]??3)}return String(s).localeCompare(String(a))}function Ae(e){return e.slice().sort((t,n)=>c.sort.dir*st(t,n,c.sort.k))}function ke(e,t,n){document.querySelectorAll(`#${e} thead th[${t}]`).forEach(s=>{s.getAttribute(t)===n.k?s.dataset.sort=n.dir<0?"desc":"asc":delete s.dataset.sort})}const F=new Set;let ce=!1,le=!1;const os=[["yes","yes","fdrop-dot--yes"],["maybe","maybe","fdrop-dot--maybe"],["no","no","fdrop-dot--no"],["__none__","unscored","fdrop-dot--none"]];function is(){const e=document.getElementById("fdrop-cfilters-menu");e&&(e.innerHTML='<div class="fdrop-head">Verdict</div>'+os.map(([t,n,s])=>se("data-v",t,n,s,F.has(t))).join("")+'<div class="fdrop-sep"></div><div class="fdrop-head">Flags</div>'+se("data-toggle","flagged","⚑ Flagged","",ce)+se("data-toggle","enriched","Enriched","",le),Vt())}function Vt(){const e={yes:0,maybe:0,no:0,__none__:0};let t=0,n=0;for(const i of c.rows){const d=i.verdict||"__none__";e[d]=(e[d]|0)+1,i.flagged&&t++,i.enriched&&n++}lt("#fdrop-cfilters-menu [data-v]","data-v",e);const s=document.querySelector('#fdrop-cfilters-menu [data-toggle="flagged"] [data-count]');s&&(s.textContent=t||"");const a=document.querySelector('#fdrop-cfilters-menu [data-toggle="enriched"] [data-count]');a&&(a.textContent=n||"");const o=F.size+(ce?1:0)+(le?1:0);sn("fdrop-cfilters-btn",o,o>0)}function Ft(){const e=document.getElementById("q").value.trim().toLowerCase();return c.rows.filter(t=>!(F.size&&!F.has(t.verdict||"__none__")||ce&&!t.flagged||le&&!t.enriched||e&&!(t.name+" "+(t.vertical||"")+" "+(t.reason||"")).toLowerCase().includes(e)))}const cs=[{k:"flag",label:"flag"},{k:"verdict",label:"verdict"},{k:"reason",label:"reason"},{k:"vertical",label:"vertical"},{k:"location",label:"location"},{k:"hc",label:"hc"},{k:"stage",label:"stage"},{k:"reviewed",label:"reviewed"},{k:"site",label:"site"}],ls=[{k:"application",label:"application"},{k:"outreach",label:"outreach"},{k:"last_outreach",label:"last outreach"},{k:"contacts",label:"contacts"},{k:"link",label:"link"}];function Jt(e){try{return new Set(JSON.parse(localStorage.getItem(e)||"[]"))}catch{return new Set}}const Gt=Jt("scout-hidden-cols"),zt=Jt("scout-hidden-jcols");function at(){return c.view==="jobs"?{cols:ls,hidden:zt,key:"scout-hidden-jcols"}:{cols:cs,hidden:Gt,key:"scout-hidden-cols"}}function re(){document.querySelectorAll("#t [data-col]").forEach(e=>{e.style.display=Gt.has(e.dataset.col)?"none":""}),document.querySelectorAll("#jt [data-col]").forEach(e=>{e.style.display=zt.has(e.dataset.col)?"none":""})}function Wt(){const e=at(),t=document.getElementById("fdrop-columns-menu");t&&(t.innerHTML='<div class="fdrop-head">Visible columns</div>'+e.cols.map(n=>se("data-col",n.k,n.label,"",!e.hidden.has(n.k))).join(""),Kt())}function Kt(){const e=at(),t=e.cols.filter(s=>e.hidden.has(s.k)).length,n=document.querySelector("#fdrop-columns-btn .fdrop-count");n&&(n.textContent=t||"",n.style.display=t?"":"none")}function Yt(e){return`
      <td class="td-flag" data-col="flag"><button class="flag-btn${e.flagged?" is-on":""}" data-id="${e.company_id}" title="${e.flagged?"unflag":"flag"}">${I}</button></td>
      <td data-col="verdict"><span class="${g(e.verdict)}">${l(e.verdict||"—")}</span></td>
      <td><span class="row-name" data-id="${e.company_id}">${l(e.name)}</span></td>
      <td class="reason" data-col="reason">${l(e.reason||"")}</td>
      <td data-col="vertical">${l(e.vertical||"")}</td>
      <td data-col="location">${l(e.location||"")}</td>
      <td data-col="hc">${e.headcount||""}</td>
      <td data-col="stage">${l(e.stage||"")}</td>
      <td data-col="reviewed" class="muted" title="${l(e.reviewed_at||"never reviewed")}">${e.reviewed_at?l(e.reviewed_at.slice(0,10)):"—"}</td>
      <td data-col="site">${e.website_url?`<a href="${A(e.website_url)}" target="_blank" rel="noopener" title="open website" aria-label="open website">↗</a>`:""}</td>
    `}function Zt(e){const t=e.querySelector(".flag-btn");t&&t.addEventListener("click",()=>jn(t.dataset.id))}const rs=[["flag","14px"],["verdict","46px"],[null,"62%"],["reason","85%"],["vertical","70%"],["location","60%"],["hc","26px"],["stage","55%"],["reviewed","44px"],["site","38px"]],ds=[[null,"72%"],["applied","58px"],["response","54px"],["outreach","22px"],["last_outreach","58px"],["contacts","55%"],["link","32px"]];function Qt(e,t,n=7){const s=document.querySelector(e);if(!s)return;const a=[1,.82,.7,.95,.76,.9,.85];let o="";for(let i=0;i<n;i++){const d=t.map(([u,p])=>{const m=p.endsWith("%")?Math.round(parseFloat(p)*a[i%a.length])+"%":p;return`<td${u?` data-col="${u}"`:""}><span class="skel" style="width:${m}"></span></td>`}).join("");o+=`<tr class="skel-row" aria-hidden="true">${d}</tr>`}s.innerHTML=o,re()}function G(){const e=document.querySelector("#t tbody");e.innerHTML="";const t=Ae(Ft());Vt(),document.getElementById("empty").style.display=t.length?"none":"block";for(const n of t){const s=document.createElement("tr");s.dataset.id=n.company_id,s.innerHTML=Yt(n),s.addEventListener("click",a=>{a.target.closest("a, .flag-btn")||ye(s.dataset.id)}),e.appendChild(s),Zt(s)}ke("t","data-k",c.sort),re()}async function us(e){const n=await(await fetch("/api/companies")).json();c.rows=n.rows||[];const s=document.querySelector("#t tbody"),a=Ae(Ft()).map(i=>i.company_id),o=[...s.querySelectorAll("tr")].map(i=>i.dataset.id);if(a.length!==o.length||a.some((i,d)=>i!==o[d])){G();return}for(const i of e){const d=c.rows.find(p=>p.company_id===i),u=s.querySelector(`tr[data-id="${CSS.escape(i)}"]`);if(!d||!u){G();return}u.innerHTML=Yt(d),Zt(u)}re()}let $=null,ot=null,de=!1,ue=!1,S=null,it=null;function Xt(){const e=c.applicationStages;if($===null)$=new Set(["",...e]);else{for(const t of[...$])t!==""&&!e.includes(t)&&$.delete(t);if(ot)for(const t of e)ot.has(t)||$.add(t)}ot=new Set(e)}function en(){const e=c.outreachStatuses;if(S===null)S=new Set(["",...e]);else{for(const t of[...S])t!==""&&!e.includes(t)&&S.delete(t);if(it)for(const t of e)it.has(t)||S.add(t)}it=new Set(e)}function ps(){Xt(),en();const e=document.getElementById("jq").value.trim().toLowerCase();return c.jobs.filter(t=>{const n=t.application_status||"";return!(!$.has(n)||de&&!t.next_up||ue&&!(t.followups_due|0)||!S.has(t.outreach_status||"")||e&&!(t.title+" "+t.company+" "+(t.location||"")+" "+(t.description||"")+" "+(t.contacts||"")).toLowerCase().includes(e))})}function se(e,t,n,s,a){return`<button class="fdrop-item${a?" is-checked":""}" ${e}="${l(t)}" role="menuitemcheckbox" aria-checked="${a}"><span class="fdrop-check" aria-hidden="true"></span>`+(s?`<span class="fdrop-dot ${s}"></span>`:"")+`<span class="fdrop-label">${l(n)}</span><span class="fdrop-item-count" data-count></span></button>`}function tn(e,t,n){return`<div class="fdrop-head fdrop-head--toggle"><span>${e}</span><button type="button" class="fdrop-all" data-all="${t}">${n?"none":"all"}</button></div>`}function ct(){Xt(),en();const e=document.getElementById("fdrop-jfilters-menu");if(!e)return;const t=["",...c.applicationStages],n=["",...c.outreachStatuses];e.innerHTML=tn("Application stage","stage",t.every(s=>$.has(s)))+se("data-stage","","not applied","",$.has(""))+c.applicationStages.map(s=>se("data-stage",s,s,qe(s),$.has(s))).join("")+'<div class="fdrop-sep"></div>'+tn("Reply status","status",n.every(s=>S.has(s)))+[["","not reached out",""]].concat(c.outreachStatuses.map(s=>[s,s,dn(s)])).map(([s,a,o])=>se("data-status",s,a,o,S.has(s))).join(""),nn()}function nn(){const e={},t={};for(const d of c.jobs){const u=d.application_status||"";e[u]=(e[u]|0)+1;const p=d.outreach_status||"";t[p]=(t[p]|0)+1}lt("#fdrop-jfilters-menu [data-stage]","data-stage",e),lt("#fdrop-jfilters-menu [data-status]","data-status",t);const n=["",...c.applicationStages],s=$&&$.size===n.length&&n.every(d=>$.has(d)),a=["",...c.outreachStatuses],o=S&&S.size===a.length&&a.every(d=>S.has(d)),i=(s?0:$?$.size:0)+(o?0:S?S.size:0);sn("fdrop-jfilters-btn",i,i>0)}function lt(e,t,n){document.querySelectorAll(e).forEach(s=>{const a=s.querySelector("[data-count]");if(a){const o=n[s.getAttribute(t)]|0;a.textContent=o||""}})}function sn(e,t,n){const s=document.getElementById(e);if(!s)return;s.classList.toggle("is-active",n);const a=s.querySelector(".fdrop-count");if(a){const o=n&&t>0;a.textContent=o?t:"",a.style.display=o?"":"none"}}function pe(e,t){e.classList.toggle("is-checked",t),e.setAttribute("aria-checked",String(t))}function ms(){const e=document.getElementById("fdrop-jfilters-menu");if(!e)return;const t=e.querySelector('.fdrop-all[data-all="stage"]'),n=e.querySelector('.fdrop-all[data-all="status"]');t&&(t.textContent=["",...c.applicationStages].every(s=>$.has(s))?"none":"all"),n&&(n.textContent=["",...c.outreachStatuses].every(s=>S.has(s))?"none":"all")}function rt(){document.querySelectorAll(".fdrop.is-open").forEach(e=>{e.classList.remove("is-open");const t=e.querySelector(".fdrop-btn");t&&t.setAttribute("aria-expanded","false")})}function an(e){const t=e.querySelector(".fdrop-btn"),n=e.querySelector(".fdrop-menu");if(!t||!n)return;const s=t.getBoundingClientRect();n.style.left=Math.round(s.left)+"px",n.style.top=Math.round(s.bottom+4)+"px",n.style.minWidth=Math.round(s.width)+"px",n.style.maxHeight=Math.max(160,Math.round(window.innerHeight-s.bottom-12))+"px"}function hs(e){const t=e.querySelector(".fdrop-btn");e.classList.add("is-open"),t&&t.setAttribute("aria-expanded","true"),an(e)}function on(){const e=document.querySelector(".fdrop.is-open");e&&an(e)}window.addEventListener("scroll",on,!0),window.addEventListener("resize",on);const fs=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;function gs(e){if(e=String(e||"").trim(),!e)return[];if(e[0]==="[")try{const t=JSON.parse(e);if(Array.isArray(t))return t.map(n=>({position:String((n==null?void 0:n.position)||"").trim(),email:String((n==null?void 0:n.email)||"").trim()})).filter(n=>n.position||n.email)}catch{}return e.split(",").map(t=>t.trim()).filter(Boolean).map(t=>{const n=t.match(fs),s=n?n[0]:"";let a=s?t.replace(s,""):t;return a=a.replace(/[<>()]/g,"").replace(/[\s:–—-]+$/,"").trim(),{position:a,email:s}})}const Pe=()=>new Date().toISOString().slice(0,10);function cn(e){const t=[["","none"]];for(const n of c.applicationStages)t.push([n,n]);return e&&!c.applicationStages.includes(e)&&t.push([e,e+" (removed)"]),t}function ln(e){const t=[["","none"]];for(const n of c.outreachStatuses)t.push([n,n]);return e&&!c.outreachStatuses.includes(e)&&t.push([e,e+" (removed)"]),t}const ys=8;function rn(e,t){const n=(t||[]).indexOf(e);return n<0?"":"sc-"+n%ys}function qe(e){return rn(e,c.applicationStages)}function dn(e){return rn(e,c.outreachStatuses)}function vs(e){const t=gs(e);return t.length?t.map(n=>{const s=l(n.position||n.email);if(!n.email)return s;const a=l(n.position?`${n.position} — ${n.email}`:n.email);return`<a href="mailto:${l(n.email)}" title="${a}">${s}</a>`}).join('<span class="dim">, </span>'):'<span class="dim">—</span>'}function un(e){const t=e.application_status||"";if(!t)return c.applicationStages.length+1;const n=c.applicationStages.indexOf(t);return n<0?c.applicationStages.length:n}function bs(e,t,n){if(n==="verdict"){const s={yes:0,maybe:1,no:2,"":3};return(s[e.verdict]??3)-(s[t.verdict]??3)}if(n==="application")return un(e)-un(t);if(n==="followups_due")return(t.followups_due|0)-(e.followups_due|0);if(n==="created_at"||n==="last_outreach_at"){const s=e[n]||"",a=t[n]||"";return!s&&!a?0:s?a?String(a).localeCompare(String(s)):-c.jsort.dir:c.jsort.dir}return String(e[n]??"").localeCompare(String(t[n]??""))}function ws(){const e=document.getElementById("jobs-followup-nav");if(!e)return;let t=0,n=0;for(const a of c.jobs)a.next_up&&t++,n+=a.followups_due|0;if(t||(de=!1),n||(ue=!1),!t&&!n){e.style.display="none",e.innerHTML="";return}e.style.display="";const s=[];t&&s.push(`<button class="queue-nav-btn queue-nav-btn--nextup${de?" is-active":""}" data-q="nextup" title="${de?"showing only these — click to show all jobs":"show only jobs queued next up for outreach"}"><span class="fn-icon">${Da}</span><span class="fn-text"><strong>${t}</strong> next up</span></button>`),n&&s.push(`<button class="queue-nav-btn${ue?" is-active":""}" data-q="due" title="${ue?"showing only these — click to show all jobs":"show only jobs owing a follow-up"}"><span class="fn-icon">${Yn}</span><span class="fn-text"><strong>${n}</strong> follow-up${n>1?"s":""} due</span></button>`),e.innerHTML=s.join(""),e.querySelectorAll(".queue-nav-btn").forEach(a=>{a.onclick=()=>{a.dataset.q==="nextup"?de=!de:ue=!ue,j()}})}function j(){const e=document.querySelector("#jt tbody");e.innerHTML="",ws();const t=ps().sort((a,o)=>c.jsort.dir*bs(a,o,c.jsort.k));document.getElementById("jobs-empty").style.display=t.length?"none":"block",nn();const n=$&&!$.has("rejected")?c.jobs.filter(a=>(a.application_status||"")==="rejected").length:0,s=document.getElementById("jobs-hidden-note");s.style.display=n?"":"none",n&&(s.innerHTML=`${n} rejected application${n>1?"s":""} hidden — <a id="show-rejected-link">show</a>`,document.getElementById("show-rejected-link").onclick=()=>{$.add("rejected"),ct(),j()});for(const a of t){const o=a.application_status||"",i=document.createElement("tr");i.dataset.id=a.posting_id;const d=cn(o).map(([m,f])=>`<option value="${l(m)}"${o===m?" selected":""}>${l(f)}</option>`).join(""),u=a.outreach_status||"",p=ln(u).map(([m,f])=>`<option value="${l(m)}"${u===m?" selected":""}>${l(f)}</option>`).join("");i.innerHTML=`
      <td><div class="jt-namecell"><button class="jt-nextup${a.next_up?" is-on":""}" title="${a.next_up?"queued next up for outreach — click to remove":"mark next up for outreach"}" aria-label="next up"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7"/></svg></button><div class="jt-namecol"><span class="row-name">${l(a.title||a.company)}</span>${ks(a.outreach_draft_status)}${a.title?`<div class="small dim">${l(a.company)}</div>`:""}</div></div></td>
      <td data-col="application"><div class="jt-stage"><select class="jt-stage-sel ${qe(o)}" title="application stage">${d}</select></div></td>
      <td class="small" data-col="outreach"><div class="jt-out"><select class="jt-ostatus ${dn(u)}" title="outreach reply status">${p}</select>${a.followups_due?`<span class="followup-badge" title="${a.followups_due} follow-up${a.followups_due>1?"s":""} due — open to act">${Yn}${a.followups_due}</span>`:""}</div></td>
      <td class="small" data-col="last_outreach">${a.last_outreach_at?l(a.last_outreach_at):'<span class="dim">—</span>'}</td>
      <td class="small td-contacts" data-col="contacts">${vs(a.contacts)}</td>
      <td data-col="link"><a href="${A(a.url)}" target="_blank" rel="noopener" title="open posting" aria-label="open posting">↗</a></td>
    `,i.querySelector(".jt-nextup").onclick=()=>vn(a,!1),i.querySelector(".jt-stage-sel").onchange=m=>kn(a,{application_status:m.target.value}),i.querySelector(".jt-ostatus").onchange=m=>kn(a,{outreach_status:m.target.value}),e.appendChild(i)}ke("jt","data-jk",c.jsort),re(),e.querySelectorAll("tr").forEach(a=>{a.addEventListener("click",o=>{o.target.closest("a, button, select")||dt(a.dataset.id)})})}function ks(e){return e==="researching"?'<span class="draft-badge db-researching" title="drafting outreach…"><span class="spinner spinner-xs"></span>drafting</span>':e==="awaiting_review"?'<span class="draft-badge" title="an outreach draft is ready to review">draft ready</span>':e==="no_hook"?'<span class="draft-badge db-nohook" title="no honest hook — scout recommends not emailing">no hook</span>':""}const h={postingId:null,row:null,drafts:[],poll:null,openHist:!1,answers:[],answersStatus:"",answersPoll:null,detecting:!1,contacts:[],outreach:[],contactsLoaded:!1};async function dt(e){let t=c.jobs.find(n=>n.posting_id===e);if(t||(await E(),t=c.jobs.find(n=>n.posting_id===e)),!t){r("posting not found — refresh");return}pt(),bt(),h.postingId=e,h.row=t,h.drafts=[],h.openHist=!1,h.answers=[],h.detecting=!1,h.contacts=[],h.outreach=[],h.contactsLoaded=!1,h.answersStatus=t.questions_status||"",document.getElementById("pursuit-pane").classList.add("open"),document.getElementById("pursuit-scrim").classList.add("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","false"),pn("pursuit"),ae(),me(),ge(),Ee()}async function Ee(){const e=h.postingId,t=h.row&&h.row.company_id;if(!(!e||!t)){try{const[n,s]=await Promise.all([fetch(`/api/companies/${t}/contacts`).then(a=>a.ok?a.json():[]),fetch(`/api/postings/${e}/outreach-log`).then(a=>a.ok?a.json():[])]);if(h.postingId!==e)return;h.contacts=Array.isArray(n)?n:[],h.outreach=Array.isArray(s)?s:[]}catch{}h.contactsLoaded=!0,fe()}}let ut=null;function pn(e){ut=e;const t=e==="company";document.getElementById("scrim").style.zIndex=t?"54":"52",document.getElementById("pane").style.zIndex=t?"55":"53",document.getElementById("pursuit-scrim").style.zIndex=t?"52":"54",document.getElementById("pursuit-pane").style.zIndex=t?"53":"55"}function $e(){pt(),bt(),h.postingId=null,h.row=null,h.drafts=[],h.answers=[],h.answersStatus="",document.getElementById("pursuit-pane").classList.remove("open"),document.getElementById("pursuit-scrim").classList.remove("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","true")}function pt(){h.poll&&(clearInterval(h.poll),h.poll=null)}async function me(){if(!h.postingId)return;let e;try{const n=await fetch(`/api/postings/${h.postingId}/outreach`);if(!n.ok){fe();return}e=await n.json()}catch{fe();return}h.drafts=e.drafts||[],fe();const t=h.drafts[0];t&&t.status==="researching"?Es():pt()}function Es(){h.poll||(h.poll=setInterval(me,4e3))}function J(e,t,{multiline:n=!1}={}){if(!e)return;let s=e.value;e.addEventListener("focus",()=>{s=e.value}),e.addEventListener("keydown",a=>{a.key==="Escape"?(a.preventDefault(),e.value=s,e.blur()):a.key==="Enter"&&(!n||a.metaKey||a.ctrlKey)&&(a.preventDefault(),e.blur())}),e.addEventListener("blur",async()=>{const a=e.value.trim();if(a===s.trim()){e.value=s;return}e.classList.remove("is-saved","is-error"),e.classList.add("is-saving");try{await t(a),s=e.value,e.classList.remove("is-saving"),e.classList.add("is-saved"),setTimeout(()=>e.classList.remove("is-saved"),1200)}catch(o){e.value=s,e.classList.remove("is-saving"),e.classList.add("is-error"),setTimeout(()=>e.classList.remove("is-error"),1600),r(`save failed: ${o.message}`)}})}async function mn(e,t,n){const s={title:e.title||"",location:e.location||"",comp_range:e.comp_range||"",employment_type:e.employment_type||"",workplace_type:e.workplace_type||"",department:e.department||"",description:e.description||"",[t]:n},a=await fetch(`/api/postings/${e.posting_id}/details`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)});if(!a.ok)throw new Error((await a.text().catch(()=>"")).trim()||"HTTP "+a.status);const o=await a.json();Object.assign(e,{title:o.title,location:o.location,employment_type:o.employment_type,workplace_type:o.workplace_type,department:o.department,comp_range:o.comp_range,description:o.description}),j(),ve(e.posting_id,{title:o.title,location:o.location})}async function $s(e,t){const n=await fetch(`/api/postings/${e.posting_id}/url`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json();e.url=s.url;const a=document.querySelector("#role-body .role-url-open");a&&a.setAttribute("href",A(e.url)),ve(e.posting_id,{url:s.url})}async function xs(e,t){if(t.disabled)return;const n=t.textContent;t.disabled=!0,t.textContent="re-enriching…";let s;try{s=await fetch(`/api/postings/${e.posting_id}/recapture`,{method:"POST"})}catch(o){t.disabled=!1,t.textContent=n,r(`re-enrich failed: ${o.message}`);return}if(!s.ok){const o=(await s.text().catch(()=>"")).trim();let i=o||"HTTP "+s.status;try{i=JSON.parse(o).error||i}catch{}t.disabled=!1,t.textContent=n,r(`re-enrich failed: ${i}`);return}const a=await s.json();Object.assign(e,{title:a.title,location:a.location,employment_type:a.employment_type,workplace_type:a.workplace_type,department:a.department,comp_range:a.comp_range,description:a.description,posted_at:a.posted_at,url:a.url,questions_status:a.questions_status}),j(),ae(),ve(e.posting_id,{title:a.title,location:a.location,url:a.url}),r("re-enriched from the posting link")}function Is(e){const t=document.getElementById("pursuit-company-edit");t&&t.addEventListener("click",()=>_s(e))}async function Ss(e,t){const n=await fetch(`/api/postings/${e.posting_id}/company`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({company_id:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json();e.company_id=s.company_id,e.company=s.company_name,ae(),E()}let xe=null;function _s(e){xe=e;const t=document.getElementById("relink-current");t&&(t.textContent=e.company?`currently: ${e.company}`:"");const n=document.getElementById("relink-search");n&&(n.value=""),hn(""),document.getElementById("relink-scrim").classList.add("open"),n&&n.focus()}function he(){document.getElementById("relink-scrim").classList.remove("open"),xe=null}let mt=null;function Ts(e){mt=e;const t=(e.postings||[]).length,n=t?` and its ${t} job ${t===1?"posting":"postings"}`:"",s=document.getElementById("delcompany-summary");s&&(s.innerHTML=`Delete <strong>${l(e.name||"this company")}</strong>${n}?`);const a=document.getElementById("delcompany-confirm");a&&(a.disabled=!1),document.getElementById("delcompany-scrim").classList.add("open")}function He(){document.getElementById("delcompany-scrim").classList.remove("open"),mt=null}async function Bs(){const e=mt;if(!e)return;const t=document.getElementById("delcompany-confirm");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/companies/${e.company_id}`,{method:"DELETE"})}catch(a){r(`delete failed: ${a.message}`),t&&(t.disabled=!1);return}if(!n.ok){const a=await n.text().catch(()=>"");r(`delete failed: HTTP ${n.status}${a?" — "+a:""}`),t&&(t.disabled=!1);return}const s=e.name||"company";He(),c.openId===e.company_id&&_e(),O(),E(),C(),r(`deleted ${s}`)}let ht=null;function Ls(e){ht=e;const t=(e.title||"").trim()||"this posting",n=e.company?` at <strong>${l(e.company)}</strong>`:"",s=document.getElementById("deljob-summary");s&&(s.innerHTML=`Delete <strong>${l(t)}</strong>${n}?`);const a=document.getElementById("deljob-confirm");a&&(a.disabled=!1),document.getElementById("deljob-scrim").classList.add("open")}function Oe(){document.getElementById("deljob-scrim").classList.remove("open"),ht=null}async function Cs(){const e=ht;if(!e)return;const t=document.getElementById("deljob-confirm");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/postings/${e.posting_id}`,{method:"DELETE"})}catch(a){r(`delete failed: ${a.message}`),t&&(t.disabled=!1);return}if(!n.ok){const a=await n.text().catch(()=>"");r(`delete failed: HTTP ${n.status}${a?" — "+a:""}`),t&&(t.disabled=!1);return}const s=(e.title||"").trim()||"posting";Oe(),$e(),E(),c.openId===e.company_id&&ye(e.company_id),r(`deleted ${s}`)}let ft=null;function js(e,t,n){ft=e;const s=document.getElementById("delcontact-summary");s&&(s.innerHTML=`Remove <strong>${l(t)}</strong>?`);const a=document.getElementById("delcontact-note");a&&(a.textContent=`You've logged ${n} email${n===1?"":"s"} to this contact — removing them takes that send history off this posting.`);const o=document.getElementById("delcontact-confirm");o&&(o.disabled=!1),document.getElementById("delcontact-scrim").classList.add("open")}function Ne(){document.getElementById("delcontact-scrim").classList.remove("open"),ft=null}async function Ms(){const e=ft;if(!e)return;const t=document.getElementById("delcontact-confirm");t&&(t.disabled=!0);const n=await z("DELETE",`/api/contacts/${e}`);Ne(),n&&(r("contact removed"),K())}let gt=null;function As(e,t,n){if(!t||!n)return;gt={pid:e,contactId:t.id};const s=document.getElementById("sendfollowup-to");s&&(s.textContent=`To: ${t.email||""} — replies on the existing thread`);const a=document.getElementById("sendfollowup-body");a&&(a.value=En(t,n));const o=document.getElementById("sendfollowup-confirm");o&&(o.disabled=!1),document.getElementById("sendfollowup-scrim").classList.add("open"),a&&a.focus()}function Re(){document.getElementById("sendfollowup-scrim").classList.remove("open"),gt=null}async function Ps(){const e=gt;if(!e)return;const t=document.getElementById("sendfollowup-body"),n=t?t.value:"";if(!n.trim()){r("nothing to send");return}const s=document.getElementById("sendfollowup-confirm");if(s&&(s.disabled=!0),!await z("POST",`/api/postings/${e.pid}/send-followup`,{contact_id:e.contactId,body:n})){s&&(s.disabled=!1);return}Re(),r("follow-up sent"),K()}function hn(e){const t=document.getElementById("relink-results");if(!t)return;const n=e.trim().toLowerCase();let s=(c.rows||[]).slice();if(n?(s=s.filter(o=>(o.name||"").toLowerCase().includes(n)),s.sort((o,i)=>{const d=(o.name||"").toLowerCase().startsWith(n)?0:1,u=(i.name||"").toLowerCase().startsWith(n)?0:1;return d-u||(o.name||"").localeCompare(i.name||"")})):s.sort((o,i)=>(o.name||"").localeCompare(i.name||"")),s=s.slice(0,60),!s.length){t.innerHTML=`<div class="relink-empty">${(c.rows||[]).length?"no company matches":"no companies yet — Add one first"}</div>`;return}const a=xe?xe.company_id:"";t.innerHTML=s.map(o=>{const i=o.company_id===a,d=[o.vertical,o.location].filter(Boolean).map(l).join(" · ");return`<button type="button" class="relink-result${i?" is-current":""}"
        data-id="${o.company_id}"${i?" disabled":""}>
        <span class="rr-main">
          <span class="rr-name">${l(o.name||"—")}</span>
          ${d?`<span class="rr-sub">${d}</span>`:""}
        </span>
        <span class="${g(o.verdict)} rr-verdict">${l(o.verdict||"—")}</span>
        ${i?'<span class="rr-current-tag">current</span>':""}
      </button>`}).join("")}async function fn(e){const t=xe;if(!t){he();return}if(e===t.company_id){he();return}try{await Ss(t,e),he(),r(`moved to ${t.company}`)}catch(n){r(`move failed: ${n.message}`)}}async function gn(e,t,n){const s={name:e.name||"",headcount:e.headcount||"",funding_stage:e.funding_stage||"",location:e.location||"",vertical:e.vertical||"",[t]:n};if(!String(s.name).trim())throw new Error("name is required");const a=await fetch(`/api/companies/${e.company_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)});if(!a.ok)throw new Error((await a.text().catch(()=>"")).trim()||"HTTP "+a.status);const o=await a.json();Object.assign(e,{name:o.name,headcount:o.headcount,funding_stage:o.funding_stage,location:o.location,vertical:o.vertical}),O(),E()}async function qs(e,t){const n=await fetch(`/api/companies/${e.company_id}/domain`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({website:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json();c.openId=s.company_id,Te(s),Be(s.company_id),O(),E()}async function Hs(e,t){const n=await fetch(`/api/companies/${e.company_id}/notes`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({notes:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json();e.notes=s.notes}let yn=null;function ae(){const e=h.row;if(!e)return;const t=document.getElementById("pursuit-body"),s=!!t&&yn===e.posting_id&&document.getElementById("pursuit-pane").classList.contains("open")&&t?t.scrollTop:0;document.getElementById("pursuit-title").innerHTML=`<input class="ie ie-title" id="pursuit-title-input" placeholder="role name" value="${l(e.title||"")}">`;const a=e.application_status||"";document.getElementById("pursuit-pills").innerHTML=`<span class="pill ${a?qe(a)||"pill-stage":"pill-none"}">${l(a||"—")}</span>`;const o=document.getElementById("pursuit-chat");o&&(o.style.display=c.meta&&c.meta.chat?"":"none",o.onclick=()=>Dt("posting",e.posting_id,e.title||e.company)),document.getElementById("pursuit-body").innerHTML=`
    <section class="pane-section role-head">
      <div id="role-body">${Os(e)}</div>
    </section>

    <section class="pane-section">
      <h3>
        Company
        <button type="button" class="h3-action" id="pursuit-company-edit"
                title="move this job to a different company">change</button>
      </h3>
      <div class="company-row">
        <button type="button" class="role-company role-company-link" id="pursuit-company-link"
                title="open the company panel">${l(e.company)} ↗</button>
        ${e.verdict?`<span class="role-verdict"><span class="role-verdict-label">fit</span><span class="${g(e.verdict)}" title="scout's company-fit verdict">${l(e.verdict)}</span></span>`:""}
      </div>
    </section>

    <section class="pane-section">
      <h3>
        Pipeline
      </h3>
      <div class="pipeline-grid">
        <div class="pipeline-row">
          <span class="pl-label">application</span>
          <select class="input pl-appstatus" title="application stage">
            ${cn(e.application_status||"").map(([p,m])=>`<option value="${l(p)}"${(e.application_status||"")===p?" selected":""}>${l(m)}</option>`).join("")}
          </select>
          ${e.application_status&&e.application_status_at?`<span class="pl-at" title="stage last changed">since ${l(e.application_status_at.slice(0,10))}</span>`:""}
        </div>
        <div class="pipeline-row">
          <span class="pl-label">outreach</span>
          <select class="input pl-ostatus" title="outreach reply status — separate from the application stage">
            ${ln(e.outreach_status||"").map(([p,m])=>`<option value="${l(p)}"${(e.outreach_status||"")===p?" selected":""}>${l(m)}</option>`).join("")}
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
      <textarea class="ie ie-notes" id="pursuit-notes-input" rows="4" placeholder="—">${l(e.notes||"")}</textarea>
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
  `,Ns();const i=document.getElementById("pursuit-company-link");i&&i.addEventListener("click",()=>ye(e.company_id)),Is(e),J(document.getElementById("pursuit-title-input"),p=>mn(e,"title",p)),J(document.getElementById("pursuit-url-input"),p=>$s(e,p));const d=document.getElementById("pursuit-reenrich");d&&d.addEventListener("click",()=>xs(e,d)),J(document.getElementById("pursuit-notes-input"),p=>Rs(p),{multiline:!0}),document.querySelectorAll("#role-body [data-k]").forEach(p=>J(p,m=>mn(e,p.dataset.k,m),{multiline:p.tagName==="TEXTAREA"}));const u=document.getElementById("job-delete-btn");u&&u.addEventListener("click",()=>Ls(e)),fe(),Se(),t&&(t.scrollTop=s),yn=e.posting_id}function Os(e){return`
    <div class="role-url ie-field">
      <div class="role-url-head">
        <label>link</label>
        <a class="role-url-open" href="${A(e.url)}" target="_blank" rel="noopener" title="open the posting">↗</a>
        <button type="button" class="role-reenrich h3-action" id="pursuit-reenrich"
                title="re-fetch this posting's details from the link — fills in blanks, no re-typing">↻ re-enrich</button>
      </div>
      <input class="ie" id="pursuit-url-input" placeholder="https://…" value="${l(e.url||"")}">
    </div>
    <div class="ie-grid">
      <div class="prow">
        <div class="ie-field"><label>location</label>
          <input class="ie" data-k="location" placeholder="—" value="${l(e.location||"")}"></div>
        <div class="ie-field"><label>comp range</label>
          <input class="ie" data-k="comp_range" placeholder="—" value="${l(e.comp_range||"")}"></div>
      </div>
      <div class="prow">
        <div class="ie-field"><label>employment</label>
          <input class="ie" data-k="employment_type" placeholder="—" value="${l(e.employment_type||"")}"></div>
        <div class="ie-field"><label>workplace</label>
          <input class="ie" data-k="workplace_type" placeholder="—" value="${l(e.workplace_type||"")}"></div>
      </div>
      <div class="ie-field"><label>department</label>
        <input class="ie" data-k="department" placeholder="—" value="${l(e.department||"")}"></div>
      <div class="ie-field"><label>description</label>
        <textarea class="ie" data-k="description" rows="6" placeholder="—">${l(e.description||"")}</textarea></div>
    </div>
    ${e.posted_at?`<div class="role-posted">posted ${l(e.posted_at)}</div>`:""}`}function Ns(){const e=document.querySelector("#pursuit-body .pl-appstatus");e&&e.addEventListener("change",s=>wn({application_status:s.target.value}));const t=document.querySelector("#pursuit-body .pl-ostatus");t&&t.addEventListener("change",s=>wn({outreach_status:s.target.value}));const n=document.querySelector("#pursuit-body .pt-nextup");n&&n.addEventListener("click",()=>vn(h.row,!0))}async function vn(e,t){let n;try{n=await fetch(`/api/postings/${e.posting_id}/next-up`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({next_up:!e.next_up})})}catch(a){r(`save failed: ${a.message}`);return}if(!n.ok){const a=(await n.text().catch(()=>"")).trim();r(`save failed: ${a||"HTTP "+n.status}`);return}const s=await n.json();e.next_up=s.next_up,j(),ve(e.posting_id,{next_up:s.next_up}),t&&ae(),r(e.next_up?"queued next up":"removed from the queue")}async function bn(e,t){const n={application_status:e.application_status||"",outreach_status:e.outreach_status||"",notes:e.notes||"",...t};let s;try{s=await fetch(`/api/postings/${e.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)})}catch(o){return r(`save failed: ${o.message}`),null}if(!s.ok){const o=(await s.text().catch(()=>"")).trim();return r(`save failed: ${o||"HTTP "+s.status}`),null}const a=await s.json();return Object.assign(e,{application_status:a.application_status,application_status_at:a.application_status_at,outreach_count:a.outreach_count,last_outreach_at:a.last_outreach_at,outreach_status:a.outreach_status,contacts:a.contacts,notes:a.notes,next_up:a.next_up}),ve(e.posting_id,{application_status:a.application_status,outreach_count:a.outreach_count,last_outreach_at:a.last_outreach_at,next_up:a.next_up}),a}async function Rs(e){const t=h.row,n={application_status:t.application_status||"",outreach_status:t.outreach_status||"",notes:e},s=await fetch(`/api/postings/${t.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const a=await s.json();t.notes=a.notes,j()}async function wn(e){await bn(h.row,e)&&(j(),ae(),r("tracking saved"))}async function kn(e,t){await bn(e,t)&&(j(),h.postingId===e.posting_id&&(h.row=e,ae()),r("tracking saved"))}function fe(){const e=document.getElementById("outreach-section");if(!e)return;const t=h.drafts,n=t[0]||null,s=t.slice(1),o=n&&(Ws(n.status)||n.status==="failed")?"":`<button class="btn btn-primary" id="draft-start-btn">${n?"Draft again":"Draft outreach"}</button><label class="draft-skip-research" title="Skip the web-research stage — write straight from the template; the opener becomes a plain intro."><input type="checkbox" id="draft-skip-research"> skip research</label>`,i=s.length?`
    <details class="draft-history" ${h.openHist?"open":""}>
      <summary>${s.length} earlier draft${s.length>1?"s":""}</summary>
      <div id="draft-history-body">${s.map(d=>Sn(d,!0)).join("")}</div>
    </details>`:"";e.innerHTML=Vs()+`<div class="outreach-drafts-head">Drafts</div><div id="draft-current">${n?Sn(n,!1):""}</div><div class="draft-actions">${o}</div>`+i,zs(),Xs()}function En(e,t){const n=h.row||{},s={company:n.company||"",role:n.title||"",contact_name:e&&e.name||"",contact_role:e&&e.role||"",last_sent:t&&t.sent_at||"",last_message:t&&t.body||""};return(c.followupTemplate||"").replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g,(a,o)=>o in s?s[o]:a)}function Ds(e){const t=Date.parse(e.replace(" ","T")+"Z");if(isNaN(t))return e;const n=Math.max(0,Math.round((Date.now()-t)/1e3));return n<60?"just now":n<3600?`${Math.floor(n/60)}m ago`:n<86400?`${Math.floor(n/3600)}h ago`:`${Math.floor(n/86400)}d ago`}function Us(){const e=c.gmail||{};if(!e.connected)return`<div class="cc-gmailbar cc-gmailbar-off dim">Gmail not connected — sends are logged by hand and replies don't auto-sync. Connect it in Settings → Gmail.</div>`;const t=e.last_sync_at?`synced ${l(Ds(e.last_sync_at))}`:"not synced yet";return`<div class="cc-gmailbar">
    <span class="cc-gmail-on" title="${l(e.email||"")}">Gmail tracking on${e.email?` · ${l(e.email)}`:""}</span>
    <span class="cc-gmail-sync dim">${t}</span>
    <button class="btn btn-sm cc-sync-now" type="button" title="re-check Gmail (source of truth) — pulls new replies + restores any missing sends">Sync now</button>
  </div>`}function Vs(){const e=h.row,t=Us(),n=e.last_outreach_at?`<div class="outreach-meta"><span>last outreach ${l(e.last_outreach_at)}</span></div>`:"";if(!h.contactsLoaded)return`<div class="contacts-mgr">${t}${n}<div class="loading-row"><span class="spinner"></span><span>loading contacts…</span></div></div>`;const s=h.contacts.map(Fs).join(""),a=h.contacts.length?"":`<div class="cc-empty dim">No contacts yet — add the people you're reaching out to at ${l(e.company)}.</div>`;return`<div class="contacts-mgr">
    ${t}
    ${n}
    <div class="cc-cards">${s}${a}</div>
    <div class="cc-addwrap">
      <button class="btn cc-addbtn" type="button">+ add contact</button>
      <div class="cc-addform" style="display:none">
        <input class="input cc-f-name" placeholder="name" spellcheck="false">
        <input class="input cc-f-role" placeholder="role (e.g. recruiter)" spellcheck="false">
        <input class="input cc-f-email" type="email" placeholder="email" spellcheck="false">
        <div class="cc-form-actions"><button class="btn btn-primary cc-f-save" type="button">Add</button><button class="btn cc-f-cancel" type="button">Cancel</button></div>
      </div>
    </div>
  </div>`}function Fs(e){const t=h.outreach.filter(o=>o.contact_id===e.id),n=t[0]||null,s=e.role?`<span class="cc-role">${l(e.role)}</span>`:"",a=e.email?`<a class="cc-mail" href="mailto:${l(e.email)}" title="${l(e.email)}">${l(e.email)}</a>`:"";return`<div class="contact-card" data-cid="${e.id}">
    <div class="cc-head">
      <span class="cc-name">${l(e.name||e.email||"contact")}</span>${s}${a}
      <span class="cc-acts"><button class="cc-edit" type="button" title="edit contact" aria-label="edit">✎</button><button class="cc-arch" type="button" title="remove contact" aria-label="remove">×</button></span>
    </div>
    <div class="cc-editform" style="display:none">
      <input class="input cc-e-name" value="${l(e.name||"")}" placeholder="name" spellcheck="false">
      <input class="input cc-e-role" value="${l(e.role||"")}" placeholder="role" spellcheck="false">
      <input class="input cc-e-email" type="email" value="${l(e.email||"")}" placeholder="email" spellcheck="false">
      <div class="cc-form-actions"><button class="btn btn-primary cc-e-save" type="button">Save</button><button class="btn cc-e-cancel" type="button">Cancel</button></div>
    </div>
    ${n?`<div class="cc-fu-group">${Js(n,!!(c.gmail&&c.gmail.connected)&&t.some(o=>o.gmail_thread_id))}</div>`:`<div class="cc-status"><span class="dim">no outreach logged yet</span></div>
    <div class="cc-rowacts"><button class="btn cc-log" type="button">+ log outreach</button></div>`}
    ${n?"":`<div class="cc-logform" style="display:none">
      <input class="input cc-l-date" type="date" value="${Pe()}" title="date sent">
      <textarea class="input cc-l-body" rows="5" placeholder="email body — what you sent (optional)" spellcheck="false"></textarea>
      <div class="cc-form-actions"><button class="btn btn-primary cc-l-save" type="button">Log</button><button class="btn cc-l-cancel" type="button">Cancel</button></div>
    </div>`}
    ${t.length?`<details class="cc-history"><summary>${t.length} email${t.length===1?"":"s"} sent</summary><div class="cc-entries">${t.map(Gs).join("")}</div></details>`:""}
  </div>`}function Js(e,t){const n=e.id,s=e.followup_due_at,a=s&&s<=Pe(),o='<button class="btn btn-sm cc-followup" type="button" title="copy a follow-up email from your template">Copy follow-up ⧉</button>',i=t?'<button class="btn btn-sm btn-primary cc-fu-send" type="button" title="send this follow-up as a reply on the Gmail thread">Send follow-up →</button>':"";let d,u;return e.followup_done_at&&a?(d='<span class="cc-fu-status is-escalate">no reply — try another contact</span>',u=`<button class="cc-fu-link cc-fu-dismiss" data-eid="${n}" type="button" title="dismiss — stop reminding me about this contact">dismiss</button>`):e.followup_done_at?(d='<span class="cc-fu-status is-done">followed up</span>',u=`<button class="cc-fu-link cc-fu-reopen" data-eid="${n}" type="button" title="reopen — re-arm the follow-up reminder">reopen</button>`):s?(d=`<span class="cc-fu-status${a?" is-overdue":""}">${a?"overdue":"follow up on"} ${l(s)}</span>`,u=`<button class="cc-fu-link cc-fu-done" data-eid="${n}" type="button" title="mark this follow-up done — arms the next reminder">done</button><button class="cc-fu-link cc-fu-stop" data-eid="${n}" type="button" title="discontinue follow-ups for this contact">stop</button>`):(d='<span class="cc-fu-status is-stopped">stopped</span>',u=`<button class="cc-fu-link cc-fu-resume" data-eid="${n}" type="button">resume</button>`),`<span class="cc-fu-eyebrow">follow-up</span>${d}<span class="cc-fu-actions">${o}${i}${u}</span>`}function Gs(e){const t=e.followup_done_at?'<span class="fu-done">followed up</span>':e.followup_due_at?`<span class="fu-mini">→ follow up ${l(e.followup_due_at)}</span>`:"",n=e.gmail_message_id?'<span class="cc-e-prov prov-gmail" title="sent via Gmail — replies auto-sync">via Gmail ✓</span>':'<span class="cc-e-prov prov-manual" title="logged by hand — not tracked in Gmail">logged manually</span>',s=e.gmail_message_id?"":`<button class="cc-e-del" type="button" data-eid="${e.id}" title="delete this logged send (and its follow-up)" aria-label="delete this send">×</button>`,a=e.body?'<span class="cc-e-view"></span>':"",o=a||s?`<span class="cc-e-actions">${a}${s}</span>`:"",i=`<span class="cc-e-date">${l(e.sent_at)}</span>
        ${n}
        ${e.note?`<span class="cc-e-note">${l(e.note)}</span>`:""}
        ${t}`;return e.body?`<details class="cc-entry-d">
        <summary class="cc-entry">${i}${o}</summary>
        <pre class="cc-e-body">${l(e.body)}</pre>
      </details>`:`<div class="cc-entry">${i}${o}</div>`}async function z(e,t,n){let s;try{s=await fetch(t,{method:e,headers:n?{"Content-Type":"application/json"}:{},body:n?JSON.stringify(n):void 0})}catch(a){return r(`save failed: ${a.message}`),null}if(!s.ok){const a=(await s.text().catch(()=>"")).trim();return r(`save failed: ${a||"HTTP "+s.status}`),null}try{return await s.json()}catch{return{}}}async function K(){await E(),await Ee()}function zs(){const e=document.getElementById("outreach-section");if(!e)return;const t=h.postingId,n=e.querySelector(".cc-sync-now");n&&n.addEventListener("click",async()=>{n.disabled=!0;const a=n.textContent;n.innerHTML='<span class="spinner spinner-xs"></span> Syncing…';try{const o=await fetch("/api/gmail/sync?reconcile=1",{method:"POST"});if(!o.ok){r(`sync failed: ${(await o.text().catch(()=>"")).trim()||"HTTP "+o.status}`);return}await be(),await Ee(),r("synced with Gmail")}catch(o){r(`sync failed: ${o.message}`)}finally{n.disabled=!1,n.textContent=a}});const s=e.querySelector(".cc-addwrap");if(s){const a=s.querySelector(".cc-addform");s.querySelector(".cc-addbtn").addEventListener("click",()=>{a.style.display="",s.querySelector(".cc-addbtn").style.display="none",a.querySelector(".cc-f-name").focus()}),s.querySelector(".cc-f-cancel").addEventListener("click",()=>fe()),s.querySelector(".cc-f-save").addEventListener("click",async()=>{const o={name:a.querySelector(".cc-f-name").value,role:a.querySelector(".cc-f-role").value,email:a.querySelector(".cc-f-email").value};await z("POST",`/api/companies/${h.row.company_id}/contacts`,o)&&(r("contact added"),K())})}e.querySelectorAll(".contact-card").forEach(a=>{const o=a.dataset.cid,i=a.querySelector(".cc-editform");a.querySelector(".cc-edit").addEventListener("click",()=>{i.style.display=i.style.display==="none"?"":"none",i.style.display!=="none"&&i.querySelector(".cc-e-name").focus()});const d=a.querySelector(".cc-e-cancel");d&&d.addEventListener("click",()=>{i.style.display="none"});const u=a.querySelector(".cc-e-save");u&&u.addEventListener("click",async()=>{const q={name:i.querySelector(".cc-e-name").value,role:i.querySelector(".cc-e-role").value,email:i.querySelector(".cc-e-email").value};await z("PUT",`/api/contacts/${o}`,q)&&(r("contact saved"),K())}),a.querySelector(".cc-arch").addEventListener("click",async()=>{const q=h.outreach.filter(H=>String(H.contact_id)===String(o)).length;if(q>0){const H=h.contacts.find(ee=>String(ee.id)===String(o));js(o,H&&H.name||"this contact",q);return}await z("DELETE",`/api/contacts/${o}`)&&(r("contact removed"),K())});const p=a.querySelector(".cc-logform"),m=a.querySelector(".cc-log");m&&m.addEventListener("click",()=>{p.style.display=p.style.display==="none"?"":"none",p.style.display!=="none"&&p.querySelector(".cc-l-date").focus()});const f=a.querySelector(".cc-l-cancel");f&&f.addEventListener("click",()=>{p.style.display="none"});const y=a.querySelector(".cc-l-save");y&&y.addEventListener("click",async()=>{const q={contact_id:o,sent_at:p.querySelector(".cc-l-date").value||Pe(),body:p.querySelector(".cc-l-body").value};await z("POST",`/api/postings/${t}/outreach-log`,q)&&(r("outreach logged"),K())});const M=a.querySelector(".cc-followup");M&&M.addEventListener("click",()=>{const q=h.contacts.find(H=>String(H.id)===String(o)),V=h.outreach.filter(H=>String(H.contact_id)===String(o))[0]||null;Fe(En(q,V),"follow-up copied — paste into your email")});const T=a.querySelector(".cc-fu-send");T&&T.addEventListener("click",()=>{const q=h.contacts.find(H=>String(H.id)===String(o)),V=h.outreach.filter(H=>String(H.contact_id)===String(o))[0]||null;As(t,q,V)});const k=async(q,V,H)=>{const ee=h.outreach.find(Io=>String(Io.id)===String(q))||{};await z("PUT",`/api/outreach-log/${q}`,{sent_at:ee.sent_at||"",body:ee.body||"",note:ee.note||"",followup_due_at:ee.followup_due_at||"",done:!!ee.followup_done_at,...V})&&(r(H),K())},L=a.querySelector(".cc-fu-done");L&&L.addEventListener("click",()=>k(L.dataset.eid,{done:!0},"marked followed up"));const D=a.querySelector(".cc-fu-reopen");D&&D.addEventListener("click",()=>k(D.dataset.eid,{done:!1},"follow-up reopened"));const R=a.querySelector(".cc-fu-stop");R&&R.addEventListener("click",()=>k(R.dataset.eid,{followup_due_at:"",done:!1},"follow-up stopped"));const b=a.querySelector(".cc-fu-resume");b&&b.addEventListener("click",()=>k(b.dataset.eid,{followup_due_at:Pe(),done:!1},"follow-up resumed"));const ie=a.querySelector(".cc-fu-dismiss");ie&&ie.addEventListener("click",()=>k(ie.dataset.eid,{followup_due_at:"",done:!0},"escalation dismissed")),a.querySelectorAll(".cc-e-del").forEach(q=>q.addEventListener("click",async V=>{if(V.preventDefault(),V.stopPropagation(),!confirm("Delete this logged send? Its follow-up is removed too. This can't be undone."))return;const H=q.dataset.eid;await z("DELETE",`/api/outreach-log/${H}`)&&(r("send deleted"),K())}))})}function Ws(e){return e==="researching"||e==="awaiting_review"||e==="needs_work"||e==="no_hook"}const $n='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M2.5 10.5v-7a1 1 0 011-1h7"/></svg>',xn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2L7.3 8.7"/><path d="M14 2L9.7 14l-2.4-5.3L2 6.3z"/></svg>',In=`<button class="dh-copy draft-copy-btn" title="copy the email to the clipboard" aria-label="copy email">${$n}</button>`,yt=[{key:"research",label:"Research",active:"Researching the company"},{key:"fill",label:"Draft",active:"Writing the draft"},{key:"humanize",label:"Polish",active:"Polishing the voice"},{key:"honesty",label:"Fact-check",active:"Fact-checking against your experience"}],Ks='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';function Ys(e){let t=yt.findIndex(s=>s.key===e);return t<0&&(t=0),`<div class="draft-progress">
    <div class="dp-track">${yt.map((s,a)=>{const o=a<t?"is-done":a===t?"is-active":"is-pending",i=a<t?Ks:"";return`<div class="dp-seg ${o}"><span class="dp-dot">${i}</span><span class="dp-name">${s.label}</span></div>`}).join("")}</div>
    <div class="dp-status"><span class="spinner"></span><span>${yt[t].active}…</span></div>
  </div>`}function Zs(){const e=!!(c.gmail&&c.gmail.connected),t=(h.contacts||[]).filter(d=>d.email),n=t.length?`<select class="input draft-recipient" title="recipient" aria-label="recipient">${t.map(d=>`<option value="${d.id}">${l(d.name||d.email)}${d.email?` &lt;${l(d.email)}&gt;`:""}</option>`).join("")}</select>`:"",s=e&&t.length?`<button class="btn btn-primary draft-gmail-btn" title="send this email from your Gmail now, log it, and arm a follow-up">${xn}Send via Gmail</button>`:"",o=`<button class="btn draft-sent-btn" title="${t.length?"I sent this myself — log it to the chosen contact and arm a follow-up":"mark this draft sent (no contact to log against — add one to track follow-ups)"}">${xn}Mark sent${t.length?" (log it)":""}</button>`,i=t.length?"":'<div class="draft-note dim">Add a contact with an email to log the send + arm a follow-up.</div>';return`<div class="draft-gmail-row">${n}${s}${o}</div>${i}`}function Sn(e,t){const n=(p,m,f="")=>`
    <div class="draft-head">
      <span class="${p}">${m}</span>${f}
    </div>`;if(e.status==="researching")return`<div class="draft-card dc-busy">
      ${Ys(e.stage)}
      <div class="draft-note">This usually takes a minute or two — leave the panel or check back later.</div>
    </div>`;if(e.status==="failed"){const p=Qs(e.violations);return`<div class="draft-card dc-failed" data-did="${e.id}">
      ${n("pill pill-no","failed")}
      ${e.fail_reason?`<div class="draft-note">${l(e.fail_reason)}</div>`:""}
      ${p}
      ${Ie(e)}
      ${t?"":`<div class="draft-actions"><button class="btn btn-primary draft-retry-btn">${At}Retry</button></div>`}
    </div>`}if(e.status==="superseded")return`<div class="draft-card dc-sent" data-did="${e.id}">
      ${n("pill pill-info","replaced")}
      <div class="draft-note">Replaced by a newer draft.</div>
      <div class="draft-sentbody">${l(vt(e)||"(empty)")}</div>
      ${Ie(e)}
    </div>`;if(e.status==="sent")return`<div class="draft-card dc-sent" data-did="${e.id}">
      ${n("pill pill-yes","sent",t?"":In)}
      ${e.sent_at?`<div class="draft-note">Sent ${l((e.sent_at||"").replace("T"," ").slice(0,16))}</div>`:""}
      <div class="draft-sentbody">${l(vt(e)||"(empty)")}</div>
      ${Ie(e)}
    </div>`;const s=vt(e),a=e.status==="no_hook",o=a?'<span class="pill pill-info">no honest hook</span>':'<span class="pill pill-maybe">awaiting review</span>';let i="";if(a)try{i=JSON.parse(e.hook||"{}").reasoning||""}catch{}const d=a?`<div class="draft-note">No honest hook found — nothing true to say yet; scout recommends not emailing.${i?" "+l(i):""}</div>`:"";if(t)return`<div class="draft-card ${a?"dc-nohook":"dc-review"}" data-did="${e.id}">
      <div class="draft-head">${o}</div>
      ${d}
      <div class="draft-sentbody">${l(s||"(empty)")}</div>
      ${Ie(e)}
    </div>`;const u=s||a;return`<div class="draft-card ${a?"dc-nohook":"dc-review"}" data-did="${e.id}">
    <div class="draft-head">${o}${s?In:""}</div>
    ${d}
    ${u?`<textarea class="draft-textarea" id="draft-edit-${e.id}" spellcheck="false">${l(s)}</textarea>
    ${_n(e.lint)}
    ${Zs()}
    <div class="draft-actions">
      <button class="btn draft-regen-btn" title="discard this draft (kept in history) and re-run — picks up backfilled info">${At}Regenerate</button>
      <label class="draft-skip-research" title="Regenerate without web research — drops the carried research and writes a plain intro."><input type="checkbox" class="draft-regen-skip"> skip research</label>
    </div>`:`<div class="draft-actions">
      <button class="btn draft-regen-btn" title="re-run the draft — picks up backfilled info">${At}Regenerate</button>
      <label class="draft-skip-research" title="Regenerate without web research — drops the carried research and writes a plain intro."><input type="checkbox" class="draft-regen-skip"> skip research</label>
    </div>`}
    ${Ie(e)}
  </div>`}function vt(e){return e.edited&&e.edited.trim()?e.edited:e.draft||""}function Ie(e){let t="",n=null,s=null;try{n=JSON.parse(e.research||"null")}catch{}try{s=JSON.parse(e.hook||"null")}catch{}if(n&&typeof n=="object"){const a=(u,p)=>p?`<div class="tr-line"><span class="tr-key">${u}:</span> ${l(String(p))}</div>`:"",o=n.role||{},i=Array.isArray(n.hooks)?n.hooks:[],d=i.map(u=>`
      <div class="tr-line">
        <span class="tr-key">${l(u.type||"hook")}</span>
        ${A(u.source_url)!=="#"?` · <a href="${A(u.source_url)}" target="_blank" rel="noopener">source</a>`:""}
        <span class="tr-quote">${l(u.quote||"")}</span>
        ${u.context?`<span class="tr-key">${l(u.context)}</span>`:""}
      </div>`).join("");t+=`<details class="draft-trace"><summary>research — ${i.length} hook candidate${i.length===1?"":"s"}</summary>
      <div class="trace-body">
        ${a("what they do",n.what_they_do)}
        ${a("customer",n.customer)}
        ${a("stage / headcount",[n.stage,n.headcount_est].filter(Boolean).join(" / "))}
        ${a("role",o.title)}
        ${(o.jd_quotes||[]).map(u=>`<span class="tr-quote">${l(u)}</span>`).join("")}
        ${d}
        ${a("disambiguation",n.disambiguation)}
        ${a("confidence",n.confidence)}
      </div></details>`}if(s&&typeof s=="object"&&s.decision){const a=s.hook||{};t+=`<details class="draft-trace"><summary>hook — ${l(s.decision)}${s.closer_mode?" · "+l(s.closer_mode):""}</summary>
      <div class="trace-body">
        ${a.quote?`<span class="tr-quote">${l(a.quote)}</span>`:""}
        ${a.thread?`<div class="tr-line"><span class="tr-key">thread:</span> ${l(a.thread)}</div>`:""}
        ${A(a.source_url)!=="#"?`<div class="tr-line"><a href="${A(a.source_url)}" target="_blank" rel="noopener">source</a></div>`:""}
        ${s.reasoning?`<div class="tr-line"><span class="tr-key">reasoning:</span> ${l(s.reasoning)}</div>`:""}
      </div></details>`}return t}function _n(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<div class="lint-chips">'+t.map(n=>`<span class="lint-chip" title="${l(n.message||"")}"><code>${l(n.code||"")}</code>${l(n.message||"")}</span>`).join("")+"</div>":""}function Qs(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<ul class="violation-list">'+t.map(n=>`<li>${l(n.claim||n.message||String(n))}${n.why?` <span class="vl-why">— ${l(n.why)}</span>`:""}</li>`).join("")+"</ul>":""}function Xs(){const e=document.getElementById("outreach-section");if(!e)return;const t=e.querySelector("#draft-start-btn");t&&t.addEventListener("click",()=>De(!1,ea())),e.querySelectorAll(".draft-retry-btn").forEach(s=>s.addEventListener("click",()=>De())),e.querySelectorAll(".draft-regen-btn").forEach(s=>s.addEventListener("click",a=>{const o=a.currentTarget.closest(".draft-card"),i=o?o.querySelector(".draft-regen-skip"):null;De(!0,!!(i&&i.checked))})),e.querySelectorAll(".draft-card[data-did]").forEach(s=>{const a=s.dataset.did,o=s.querySelector(".draft-textarea");o&&J(o,m=>na(a,m),{multiline:!0});const i=()=>s.querySelector(".draft-recipient"),d=s.querySelector(".draft-sent-btn");d&&d.addEventListener("click",()=>{const m=i();aa(a,m?m.value:"")});const u=s.querySelector(".draft-gmail-btn");u&&u.addEventListener("click",()=>{const m=i();sa(a,m?m.value:"",u)});const p=s.querySelector(".draft-copy-btn");p&&p.addEventListener("click",()=>{const m=s.querySelector(".draft-textarea"),f=s.querySelector(".draft-sentbody"),y=m?m.value:f?f.textContent:"";Fe(y,"email copied")})});const n=e.querySelector("details.draft-history");n&&n.addEventListener("toggle",()=>{h.openHist=n.open})}function ea(){const e=document.getElementById("draft-skip-research");return!!(e&&e.checked)}async function De(e=!1,t=!1){const n=document.getElementById("outreach-section"),s=n&&(n.querySelector("#draft-start-btn")||n.querySelector(".draft-retry-btn")||n.querySelector(".draft-regen-btn"));s&&(s.disabled=!0);let a;try{const i=new URLSearchParams;e&&i.set("regenerate","1"),t&&i.set("research","0");const d=i.toString()?`?${i.toString()}`:"";a=await fetch(`/api/postings/${h.postingId}/outreach${d}`,{method:"POST"})}catch(i){r(`draft failed: ${i.message}`),s&&(s.disabled=!1);return}if(a.status===202){let i={};try{i=await a.json()}catch{}Array.isArray(i.degraded)&&i.degraded.length&&r(`drafting without ${i.degraded.join(", ")} — quality degrades, integrity unaffected`),await me(),E();return}if(a.status===409){await me(),r("a draft is already active");return}if(a.status===412){let i={};try{i=await a.json()}catch{}ta(i.need,i.error),s&&(s.disabled=!1);return}if(a.status===503){const i=document.getElementById("outreach-section");if(i){const d=document.createElement("div");d.className="draft-note",d.textContent="Outreach engine not running in this build.",i.appendChild(d)}s&&(s.disabled=!1);return}const o=(await a.text().catch(()=>"")).trim();r(`draft failed: ${o||"HTTP "+a.status}`),s&&(s.disabled=!1)}function ta(e,t){const n=document.getElementById("outreach-section");if(!n)return;const s=n.querySelector(".draft-actions"),a=e==="template",o=a?"Write email template":"View brain knowledge",i=document.createElement("div");i.className="blocks-gate",i.innerHTML=`
    <div class="draft-note">${l(t||"Outreach isn't set up yet.")}</div>
    <div class="draft-actions">
      <button class="btn btn-primary" id="gate-fix-btn">${o}</button>
      <button class="btn" id="gate-retry-btn">Retry</button>
    </div>`,s?s.replaceWith(i):n.appendChild(i);const d=i.querySelector("#gate-fix-btn");d&&d.addEventListener("click",()=>a?_a("outreach-template"):Gn());const u=i.querySelector("#gate-retry-btn");u&&u.addEventListener("click",De)}async function na(e,t){const n=await fetch(`/api/outreach/drafts/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json(),a=h.drafts.findIndex(d=>String(d.id)===String(e));a>=0&&(h.drafts[a]=s);const o=document.getElementById(`draft-edit-${e}`),i=o&&o.closest(".draft-card");if(i){const d=i.querySelector(".lint-chips"),u=_n(s.lint);d?d.outerHTML=u||"":u&&o.insertAdjacentHTML("afterend",u)}}async function sa(e,t,n){n&&(n.disabled=!0,n.dataset.t=n.textContent||"",n.textContent="Sending…");const s=()=>{n&&(n.disabled=!1,n.textContent=n.dataset.t||"Send via Gmail")};let a;try{a=await fetch(`/api/outreach/drafts/${e}/send-gmail`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contact_id:t||""})})}catch(i){r(`send failed: ${i.message}`),s();return}if(!a.ok){const i=(await a.text().catch(()=>"")).trim();let d=i||"HTTP "+a.status;try{const u=JSON.parse(i);u&&u.error&&(d=u.error)}catch{}r(`send failed: ${d}`),s();return}let o={};try{o=await a.json()}catch{}r(o.to?`sent via Gmail to ${o.to}`:"sent via Gmail"),await me(),await E(),await Ee()}async function aa(e,t=""){let n;try{n=await fetch(`/api/outreach/drafts/${e}/sent`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contact_id:t||""})})}catch(a){r(`failed: ${a.message}`);return}if(!n.ok){const a=(await n.text().catch(()=>"")).trim();let o=a||"HTTP "+n.status;try{const i=JSON.parse(a);i&&i.error&&(o=i.error)}catch{}r(`failed: ${o}`);return}r(t?"marked sent — follow-up armed":"marked sent"),await me(),await E(),t&&await Ee();const s=c.jobs.find(a=>a.posting_id===h.postingId);s&&ve(s.posting_id,{outreach_count:s.outreach_count,last_outreach_at:s.last_outreach_at,next_up:s.next_up})}async function ge(){if(!h.postingId)return;let e;try{const t=await fetch(`/api/postings/${h.postingId}/answers`);if(!t.ok){Se();return}e=await t.json()}catch{Se();return}h.answers=e.answers||[],h.answersStatus=e.questions_status||"",Se(),h.answers.some(t=>t.status==="generating")?oa():bt()}function oa(){h.answersPoll||(h.answersPoll=setInterval(ge,4e3))}function bt(){h.answersPoll&&(clearInterval(h.answersPoll),h.answersPoll=null)}function Se(){const e=document.getElementById("answers-section");if(!e)return;const t=h.answers,n=h.answersStatus,s=t.some(p=>p.status==="generating"),a=t.length?`<div class="answers-list">${t.map(la).join("")}</div>`:"",o=!!h.detecting,i=s||o?" disabled":"",d=p=>`<button class="btn" id="answers-redetect-btn"${o?" disabled":""}>${o?"Detecting…":p}</button>`;let u;n==="ok"&&t.length?u=(t.some(m=>!Tn(m)&&m.status!=="generating")?`<button class="btn" id="answers-start-btn"${i}>${s?"Drafting…":"Draft all blank"}</button>`:"")+d("Re-detect"):n===""||n==="unreachable"?u=`<button class="btn btn-primary" id="answers-start-btn"${i}>${s?"Drafting…":"Draft answers"}</button>`+d("Re-detect questions"):u=d("Re-detect questions"),e.innerHTML=`<div class="answers-meta">${l(ia(n,t.length))}</div>`+a+`<div class="answers-actions">${u}</div>`,da()}function ia(e,t){switch(e){case"":return"Not detected yet";case"ok":return`${t} question${t===1?"":"s"} found`;case"none":return"No essay questions on this form";case"unsupported":return"Couldn't read this form — apply on the site";case"unreachable":return"Couldn't reach the application form — try re-detecting";default:return"Couldn't read this form"}}function Tn(e){return e.edited&&e.edited.trim()?e.edited:e.answer||""}function ca(e){switch(e.status){case"ready":return'<span class="pill pill-yes">ready</span>';case"needs_review":return'<span class="pill pill-maybe">needs review</span>';case"failed":return'<span class="pill pill-no">failed</span>';case"generating":return'<span class="pill pill-info">drafting…</span>';default:return'<span class="pill pill-info">not drafted</span>'}}function la(e){const t=Tn(e),n=e.edited&&e.edited.trim(),s=e.status==="generating",a=t.length,o=e.max_length&&a>e.max_length,i=e.max_length?`<span class="answer-count${o?" over":""}">${a} / ${e.max_length}</span>`:`<span class="answer-count">${a} chars</span>`,d=!!t,u=d?"Regenerate":"Generate",p=d?"re-draft this answer (discards the current text)":"draft an answer to just this question";return`<div class="answer-card ac-${e.status}" data-aid="${e.id}">
    <div class="answer-prompt">${l(e.prompt)}</div>
    ${s?'<div class="answer-busy"><span class="spinner"></span><span>drafting…</span></div>':`<textarea class="ie answer-textarea" id="answer-edit-${e.id}" rows="5" spellcheck="false" placeholder="Generate an answer to this question, or write your own.">${l(t)}</textarea>`}
    <div class="answer-foot">
      ${ca(e)}
      ${n?'<span class="answer-edited" title="your edit wins over the drafted answer">edited</span>':""}
      ${s?"":i}
      ${s?"":`<button class="btn ${d?"":"btn-primary "}answer-regen-btn" title="${p}">${u}</button>`}
      ${s||!d?"":`<button class="answer-copy-btn dh-copy" title="copy this answer to the clipboard" aria-label="copy answer">${$n}</button>`}
      ${s?"":'<button class="answer-remove-btn" title="remove this question" aria-label="remove question">×</button>'}
    </div>
    ${e.status==="needs_review"?`<div class="answer-note answer-review">Flagged by the honesty check — confirm it doesn't overstate your experience before sending.</div>`:""}
    ${e.status==="failed"&&e.fail_reason?`<div class="answer-note answer-fail">${l(ra(e.fail_reason))}</div>`:""}
  </div>`}function ra(e){return e=String(e||""),e.length>160?e.slice(0,160)+"…":e}function da(){const e=document.getElementById("answers-section");if(!e)return;const t=e.querySelector("#answers-start-btn");t&&t.addEventListener("click",Bn);const n=e.querySelector("#answers-redetect-btn");n&&n.addEventListener("click",pa),e.querySelectorAll(".answer-card[data-aid]").forEach(s=>{const a=s.dataset.aid,o=s.querySelector(".answer-textarea");o&&(J(o,p=>ma(a,p),{multiline:!0}),o.addEventListener("input",()=>ua(s,o)));const i=s.querySelector(".answer-regen-btn");i&&i.addEventListener("click",()=>ha(a));const d=s.querySelector(".answer-copy-btn");d&&d.addEventListener("click",()=>{o&&Fe(o.value,"answer copied")});const u=s.querySelector(".answer-remove-btn");u&&u.addEventListener("click",()=>fa(a))})}function ua(e,t){const n=e.querySelector(".answer-count");if(!n)return;const s=t.value.length,a=n.textContent.includes("/")?parseInt(n.textContent.split("/")[1],10):0;n.textContent=a?`${s} / ${a}`:`${s} chars`,n.classList.toggle("over",!!a&&s>a)}async function Bn(){const e=document.getElementById("answers-section"),t=e&&e.querySelector("#answers-start-btn");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/postings/${h.postingId}/answers`,{method:"POST"})}catch(a){r(`draft failed: ${a.message}`),t&&(t.disabled=!1);return}if(n.status===202){await ge();return}if(n.status===412){let a={};try{a=await n.json()}catch{}Ln(a.error),t&&(t.disabled=!1);return}if(n.status===503){Cn("Answer generation isn't running in this build."),t&&(t.disabled=!1);return}const s=(await n.text().catch(()=>"")).trim();r(`draft failed: ${s||"HTTP "+n.status}`),t&&(t.disabled=!1)}async function pa(){h.detecting=!0,Se();try{const e=await fetch(`/api/postings/${h.postingId}/answers/redetect`,{method:"POST"});if(!e.ok){const t=(await e.text().catch(()=>"")).trim();r(`detect failed: ${t||"HTTP "+e.status}`)}}catch(e){r(`detect failed: ${e.message}`)}h.detecting=!1,await ge()}async function ma(e,t){const n=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json(),a=h.answers.findIndex(o=>String(o.id)===String(e));a>=0&&(h.answers[a]=s)}async function ha(e){let t;try{t=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({regenerate:!0})})}catch(n){r(`regenerate failed: ${n.message}`);return}if(t.status===503){Cn("Answer generation isn't running in this build.");return}if(t.status===412){let n={};try{n=await t.json()}catch{}Ln(n.error);return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();r(`regenerate failed: ${n||"HTTP "+t.status}`);return}await ge()}async function fa(e){let t;try{t=await fetch(`/api/answers/${e}`,{method:"DELETE"})}catch(n){r(`remove failed: ${n.message}`);return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();r(`remove failed: ${n||"HTTP "+t.status}`);return}await ge()}function Ln(e){const t=document.getElementById("answers-section");if(!t)return;const n=t.querySelector(".answers-actions"),s=document.createElement("div");s.className="blocks-gate",s.innerHTML=`
    <div class="draft-note">${l(e||"Drafting answers needs an experience page in your brain.")}</div>
    <div class="answers-actions">
      <button class="btn btn-primary" id="answers-fix-btn">View brain knowledge</button>
      <button class="btn" id="answers-retry-btn">Retry</button>
    </div>`,n?n.replaceWith(s):t.appendChild(s);const a=s.querySelector("#answers-fix-btn");a&&a.addEventListener("click",Gn);const o=s.querySelector("#answers-retry-btn");o&&o.addEventListener("click",Bn)}function Cn(e){const t=document.getElementById("answers-section");if(!t)return;const n=document.createElement("div");n.className="draft-note",n.textContent=e,t.appendChild(n)}async function ye(e){var d,u;const t=document.getElementById("pane"),n=document.getElementById("scrim"),s=c.openId===e&&t.classList.contains("open"),a=s?((d=document.getElementById("pane-body"))==null?void 0:d.scrollTop)??0:0,o=s?(u=document.getElementById("trace-body"))==null?void 0:u.innerHTML:null;c.openId=e,t.classList.add("open"),n.classList.add("open"),t.setAttribute("aria-hidden","false"),pn("company"),s||(document.getElementById("pane-title").textContent="loading…",document.getElementById("pane-pills").innerHTML="",document.getElementById("pane-body").innerHTML='<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>');let i;try{const p=await fetch(`/api/companies/${e}`);if(!p.ok)throw new Error(`HTTP ${p.status}`);i=await p.json()}catch(p){s||(document.getElementById("pane-body").innerHTML=`<div class="muted">Failed to load detail: ${l(p.message)}</div>`);return}if(c.openId===e){if(Te(i),s){if(o!=null){const m=document.getElementById("trace-body");m&&(m.innerHTML=o)}const p=document.getElementById("pane-body");p&&(p.scrollTop=a)}Be(e)}}function _e(){c.openId=null,c.openDetail=null,document.getElementById("pane").classList.remove("open"),document.getElementById("scrim").classList.remove("open"),document.getElementById("pane").setAttribute("aria-hidden","true")}function Te(e){c.openDetail=e,document.getElementById("pane-title").innerHTML=`<input class="ie ie-title" id="pane-title-input" placeholder="company name" value="${l(e.name||"")}">`,document.getElementById("pane-pills").innerHTML=`
    <span class="${g(e.has_verdict?e.verdict:"")}">${l(e.has_verdict?e.verdict:"unscored")}</span>
  `;const t=document.getElementById("pane-chat");t&&(t.style.display=c.meta&&c.meta.chat?"":"none",t.onclick=()=>Dt("company",e.company_id,e.name));const n=e.model==="manual",s=e.has_verdict?`
    <dl class="kv">
      <dt>verdict</dt><dd><span class="${g(e.verdict)}">${l(e.verdict)}</span>${n?' <span class="small muted">· set by hand</span>':""}</dd>
      <dt>reason</dt><dd>${l(e.reason||"")}</dd>
      <dt>model</dt><dd class="small muted">${l(e.model||"")}</dd>
      <dt>taste version</dt><dd class="small muted"><span class="tooltip" title="scored ${l(e.scored_at)} · model ${l(e.model)}">${l(e.taste_version||"")}</span></dd>
      <dt>scored at</dt><dd class="small muted">${l(e.scored_at||"")}</dd>
    </dl>
  `:'<div class="muted">Not yet scored. Run <code>scout verdict</code>, or set one by hand below.</div>',a=`
    <div class="verdict-edit" id="verdict-edit">
      <div class="ve-label muted small">${e.has_verdict?"override verdict":"set verdict"}</div>
      <div class="ve-pick" id="ve-pick">
        ${["yes","maybe","no"].map(b=>`<button type="button" class="ve-opt${e.has_verdict&&e.verdict===b?" is-on":""}" data-v="${b}">${b}</button>`).join("")}
      </div>
      <div class="prow">
        <input class="input" id="ve-reason" placeholder="reason (optional)" value="${n?l(e.reason||""):""}">
        <button class="btn btn-primary" id="ve-save-btn">Save</button>
      </div>
    </div>`,o=e.has_enrichment?`
    <dl class="kv">
      <dt>url</dt><dd>${e.website_url?`<a href="${A(e.website_url)}" target="_blank" rel="noopener">${l(e.website_url)} ↗</a>`:'<span class="muted">—</span>'}</dd>
      <dt>status</dt><dd class="small">${l(e.fetch_status||"")}${e.fetch_error?` <span class="muted">(${l(e.fetch_error)})</span>`:""}</dd>
      <dt>fetched</dt><dd class="small muted">${l(e.fetched_at||"")}</dd>
    </dl>
  `:'<div class="muted">No enrichment yet. Run <code>scout enrich</code>.</div>',i=!c.meta||c.meta.control!==!1,d=i&&c.meta&&c.meta.verdict?'<button class="h3-action" id="rescore-btn" title="re-score just this company — replaces the current verdict, manual or not">↻ re-score</button>':"",u=i&&e.domain?'<button class="h3-action" id="reenrich-btn" title="re-fetch this company’s site now">↻ re-enrich</button>':"",p=Object.keys(e.raw_json||{}).sort(),m=p.length===0?"":`
    <details class="raw-json">
      <summary>Raw row <span class="dim">(${p.length} fields)</span></summary>
      <table><tbody>
        ${p.map(b=>`<tr><td class="k">${l(b)}</td><td>${l(e.raw_json[b])}</td></tr>`).join("")}
      </tbody></table>
    </details>
  `,f=`
    <div class="flag-bar">
      <span class="fb-state${e.flagged?" is-flagged":""}">
        ${e.flagged?"⚑ flagged":"not flagged"}
        <span class="small muted">· ${e.reviewed_at?`last reviewed ${l(e.reviewed_at)}`:"never reviewed"}</span>
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
      <div id="postings-list">${wt(e)}</div>
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
      <textarea class="ie ie-notes" id="pane-notes-input" rows="4" placeholder="—">${l(e.notes||"")}</textarea>
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M5 6h6M5 9h4"/></svg>
        Company facts
      </h3>
      <div id="facts-body">${ga(e)}</div>
      ${m}
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3 3 7-7"/></svg>
        Verdict
        ${d}
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

    <div class="pane-danger">
      <button class="btn-delete" id="company-delete-btn" title="permanently delete this company and everything attached to it">Delete company</button>
    </div>
  `;const y=document.getElementById("posting-add-btn");y&&y.addEventListener("click",()=>ba(e)),kt(),document.querySelectorAll("#ve-pick .ve-opt").forEach(b=>{b.addEventListener("click",()=>{document.querySelectorAll("#ve-pick .ve-opt").forEach(ie=>ie.classList.remove("is-on")),b.classList.add("is-on")})});const M=document.getElementById("ve-save-btn");M&&M.addEventListener("click",()=>va(e)),J(document.getElementById("pane-title-input"),b=>gn(e,"name",b)),document.querySelectorAll("#facts-body [data-k]").forEach(b=>J(b,ie=>gn(e,b.dataset.k,ie))),J(document.getElementById("pane-domain-input"),b=>qs(e,b)),J(document.getElementById("pane-notes-input"),b=>Hs(e,b),{multiline:!0});const T=document.getElementById("flag-toggle-btn");T&&T.addEventListener("click",()=>jn(e.company_id));const k=document.getElementById("review-stamp-btn");k&&k.addEventListener("click",()=>ya(e.company_id));const L=document.getElementById("rescore-btn");L&&L.addEventListener("click",()=>xt("verdict",{company_ids:[e.company_id]}));const D=document.getElementById("reenrich-btn");D&&D.addEventListener("click",()=>xt("enrich",{company_ids:[e.company_id]}));const R=document.getElementById("company-delete-btn");R&&R.addEventListener("click",()=>Ts(e))}function ga(e){return`
    <div class="ie-grid">
      <div class="ie-field"><label>website${e.domain?` · <a href="https://${l(e.domain)}" target="_blank" rel="noopener">open ↗</a>`:""}</label>
        <input class="ie" id="pane-domain-input" placeholder="acme.com" value="${l(e.domain||"")}"></div>
      <div class="ie-field"><label>vertical</label>
        <input class="ie" data-k="vertical" placeholder="—" value="${l(e.vertical||"")}"></div>
      <div class="prow">
        <div class="ie-field"><label>location</label>
          <input class="ie" data-k="location" placeholder="—" value="${l(e.location||"")}"></div>
        <div class="ie-field"><label>headcount</label>
          <input class="ie" data-k="headcount" placeholder="—" value="${e.headcount||""}"></div>
      </div>
      <div class="ie-field"><label>stage</label>
        <input class="ie" data-k="funding_stage" placeholder="—" value="${l(e.funding_stage||"")}"></div>
    </div>
    <dl class="kv facts-ro">
      <dt>source</dt><dd class="small muted">${l(e.source)} · ${l(e.source_id)}</dd>
      <dt>ingested</dt><dd class="small muted">${l(e.ingested_at)}</dd>
    </dl>`}async function ya(e){const t=document.getElementById("review-stamp-btn");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/companies/${e}/reviewed`,{method:"POST"})}catch(o){r(`failed: ${o.message}`),t&&(t.disabled=!1);return}if(!n.ok){const o=await n.text().catch(()=>"");r(`failed: HTTP ${n.status}${o?" — "+o:""}`),t&&(t.disabled=!1);return}const s=await n.json(),a=c.rows.find(o=>o.company_id===e);a&&(a.reviewed_at=s.reviewed_at,G()),c.openId===e&&(Te(s),Be(e)),r("reviewed")}async function jn(e){const t=c.rows.find(o=>o.company_id===e),n=!(t&&t.flagged);let s;try{s=await fetch(`/api/companies/${e}/flagged`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({flagged:n})})}catch(o){r(`failed: ${o.message}`);return}if(!s.ok){const o=await s.text().catch(()=>"");r(`failed: HTTP ${s.status}${o?" — "+o:""}`);return}const a=await s.json();t&&(t.flagged=a.flagged,G()),c.openId===e&&(Te(a),Be(e)),E(),r(a.flagged?"flagged":"unflagged")}async function va(e){const t=document.querySelector("#ve-pick .ve-opt.is-on");if(!t){r("Pick yes, maybe, or no.");return}const n=t.dataset.v,s=document.getElementById("ve-reason").value.trim(),a=document.getElementById("ve-save-btn");a.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/verdict`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({verdict:n,reason:s})})}catch(d){r(`save failed: ${d.message}`),a.disabled=!1;return}if(!o.ok){const d=await o.text().catch(()=>"");r(`save failed: HTTP ${o.status}${d?" — "+d:""}`),a.disabled=!1;return}const i=await o.json();Te(i),Be(i.company_id),O(),C(),E(),r("verdict saved")}function wt(e){const t=e.postings||[];return t.length?t.map(n=>{const s=[n.location,n.source==="capture"?"captured":"added",(n.created_at||"").slice(0,10)].filter(Boolean).map(l).join(" · "),a=n.application_status||"",o=[n.next_up?'<span class="draft-badge db-next" style="margin-left:0" title="queued next up for outreach">next up</span>':"",`<span class="pill ${a?qe(a)||"pill-stage":"pill-none"}">${l(a||"—")}</span>`,`<span class="pt-meta">${a?"tracked":"not applied"}</span>`,`<span class="pt-meta">${n.outreach_count?`${n.outreach_count} sent · last ${l(n.last_outreach_at||"?")}`:"no outreach yet"}</span>`].filter(Boolean).join("");return`
    <div class="brain-node posting-card" data-pid="${l(n.id)}" title="open the pursuit — tracking, outreach, drafts">
      <div class="n"><a href="${A(n.url)}" target="_blank" rel="noopener">${l(n.title||n.url)} ↗</a></div>
      ${n.description?`<div class="small muted" style="margin-top:3px">${l(n.description.length>200?n.description.slice(0,200).trimEnd()+"…":n.description)}</div>`:""}
      ${s?`<div class="l" style="margin-top:3px">${s}</div>`:""}
      <div class="pcard-status">${o}<span class="pcard-open">open →</span></div>
    </div>`}).join(""):'<div class="muted">No job links yet.</div>'}function ve(e,t){const n=c.openDetail;if(!n||!c.openId)return;const s=(n.postings||[]).find(o=>String(o.id)===String(e));if(!s)return;Object.assign(s,t);const a=document.getElementById("postings-list");a&&(a.innerHTML=wt(n),kt())}function kt(){document.querySelectorAll("#postings-list .posting-card").forEach(e=>{e.addEventListener("click",t=>{t.target.closest("a")||dt(e.dataset.pid)})})}async function ba(e){const t=document.getElementById("posting-url"),n=document.getElementById("posting-title"),s=document.getElementById("posting-add-btn"),a=t.value.trim();if(!a){r("Enter a URL first."),t.focus();return}s.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/postings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:a,title:n.value.trim()})})}catch(u){r(`add failed: ${u.message}`),s.disabled=!1;return}if(!o.ok){const u=await o.text().catch(()=>"");r(`add failed: HTTP ${o.status}${u?" — "+u:""}`),s.disabled=!1;return}const i=await o.json();e.postings=(e.postings||[]).filter(u=>u.id!==i.id),e.postings.unshift(i);const d=document.getElementById("postings-list");d&&(d.innerHTML=wt(e),kt()),t.value="",n.value="",s.disabled=!1,E(),r("link added")}async function Be(e){let t;try{t=await fetch(`/api/companies/${e}/trace`)}catch(s){Ue(`<div class="muted">Failed to load trail: ${l(s.message)}</div>`);return}if(!t.ok){Ue(`<div class="muted">Failed to load trail: HTTP ${t.status}.</div>`);return}const n=(await t.json()).events||[];if(n.length===0){Ue('<div class="muted">No decision trail yet. Run <code>verdict</code> to record one — every scoring pass is captured here.</div>');return}Ue(n.map(wa).join(""))}function wa(e){const t=[e.criteria_source,e.taste_version].filter(Boolean).map(l);return e.run_id&&t.push("run "+l(e.run_id.slice(0,8))),`
    <div class="trail-event">
      <div class="trail-head">
        <span class="${g(e.verdict)}">${l(e.verdict)}</span>
        <span class="trail-meta mono">${l(e.model||"")}</span>
        <span class="trail-meta trail-time">${l(e.scored_at||"")}</span>
      </div>
      <div class="trail-decision">
        <span class="trail-reason">${l(e.reason||"")}</span>
      </div>
      <div class="trail-foot muted small">criteria: ${t.join(" · ")||"—"}</div>
    </div>`}function Ue(e){const t=document.getElementById("trace-body");t&&(t.innerHTML=e)}let Mn;function r(e){const t=document.getElementById("toast");t.textContent=e,t.classList.toggle("err",/\b(fail(ed)?|error|disabled|already running)\b/i.test(e)),t.classList.add("show"),clearTimeout(Mn),Mn=setTimeout(()=>t.classList.remove("show"),2200)}let Et;const ka=6e3;function Ve(){clearTimeout(Et),Et=void 0}function An(){Ve(),document.getElementById("drawer").classList.remove("open")}function Pn(){Ve(),Et=setTimeout(An,ka)}async function Fe(e,t="copied"){if(!e){r("nothing to copy");return}try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(e);else{const n=document.createElement("textarea");n.value=e,n.style.position="fixed",n.style.opacity="0",document.body.appendChild(n),n.select(),document.execCommand("copy"),document.body.removeChild(n)}r(t)}catch(n){r(`copy failed: ${n.message}`)}}c.meta={control:!1,brain:!1,verdict:!1};async function Le(){try{const s=await fetch("/api/meta");if(!s.ok)return;c.meta=await s.json()}catch{return}const e=c.meta.control;document.getElementById("btn-ingest").disabled=!e,document.getElementById("btn-enrich").disabled=!e;const t=document.getElementById("btn-verdict");t.disabled=!e||!c.meta.verdict,t.title=c.meta.verdict?"":"set ANTHROPIC_API_KEY in the server env to enable";const n=document.getElementById("open-chat");n&&(n.style.display=c.meta.chat?"":"none")}async function $t(){let e;try{const s=await fetch("/api/runs");if(!s.ok)return;e=await s.json()}catch{return}const t=e.busy_stage||"",n=document.getElementById("run-busy");t?(n.style.display="",document.getElementById("run-busy-label").textContent=t+" running…"):n.style.display="none",document.getElementById("btn-ingest").classList.toggle("busy",t==="ingest"),document.getElementById("btn-enrich").classList.toggle("busy",t==="enrich"),document.getElementById("btn-verdict").classList.toggle("busy",t==="verdict")}let Ce=null;async function xt(e,t){if(c.meta&&c.meta.control===!1){r("control surface disabled");return}let n;try{n=await fetch(`/api/run/${e}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t||{})})}catch(a){r(`run failed: ${a.message}`);return}if(n.status===409){r("a job is already running");return}if(n.status===412){const a=await n.text();r(a.trim());return}if(!n.ok){r(`run failed: HTTP ${n.status}`);return}const{job_id:s}=await n.json();Un(e,s,t)}async function Ea(e){const t=new FormData;t.append("csv",e);let n;try{n=await fetch("/api/ingest",{method:"POST",body:t})}catch(a){r(`upload failed: ${a.message}`);return}if(n.status===409){r("a job is already running");return}if(!n.ok){r(`upload failed: HTTP ${n.status}`);return}const{job_id:s}=await n.json();Un("ingest",s)}const $a=["add-url","add-name","add-location","add-headcount","add-title","add-job-company"];let Je=[],Y=new Set,Z="company";function qn(e){Z=e,document.querySelectorAll("#add-kind .v-chip").forEach(s=>s.classList.toggle("is-on",s.dataset.kind===e)),document.getElementById("add-company-fields").style.display=e==="company"?"":"none",document.getElementById("add-job-fields").style.display=e==="job"?"":"none";const t=document.getElementById("add-url-label"),n=document.getElementById("add-url");e==="company"?(t.innerHTML='Website<span class="req">*</span>',n.placeholder="acme.com"):(t.innerHTML='Posting URL<span class="req">*</span>',n.placeholder="https://… the job posting"),document.getElementById("add-save").textContent=e==="company"?"Add company":"Add job",Hn()}function It(){return!!c.meta.capture&&document.getElementById("add-enrich").checked}function Hn(){const e=document.getElementById("add-note");It()?e.innerHTML=Z==="company"?"scout fetches the page and fills the blank fields — your values win. The page text also seeds enrichment, so the next Verdict can score it. Pages behind a login wall (LinkedIn) usually can't be fetched.":"scout fetches the posting and fills in the title, location and description — your values win. The job attaches to its company, adding it to the list first if needed. Pages behind a login wall (LinkedIn) usually can't be fetched.":e.innerHTML=Z==="company"?"Stored as source <code>manual</code>. Run Enrich then Verdict to score it. A website already in the list is rejected — manual adds never overwrite an existing company.":"Stored as-is, no fetch. The job attaches to the typed company, or to the link's own domain when the posting lives on the company's site — for an ATS link (greenhouse, lever, …), type the company."}async function xa(){$a.forEach(s=>{document.getElementById(s).value=""}),document.getElementById("add-vertical-filter").value="",Y=new Set;const e=document.getElementById("add-enrich"),t=document.getElementById("add-enrich-row");e.disabled=!c.meta.capture,t.classList.toggle("disabled",!c.meta.capture),t.title=c.meta.capture?"":"set ANTHROPIC_API_KEY in the server env to enable",c.meta.capture||(e.checked=!1),qn(c.view==="jobs"?"job":"company");const n=document.getElementById("add-stage");n.innerHTML='<option value="">—</option>',document.getElementById("add-vertical-chips").innerHTML='<div class="none">loading…</div>',document.getElementById("add-company-names").innerHTML=(c.rows||[]).map(s=>`<option value="${l(s.name)}">`).join(""),document.getElementById("add-scrim").classList.add("open"),document.getElementById("add-url").focus();try{const s=await(await fetch("/api/facets")).json();(s.funding_stages||[]).forEach(a=>{const o=document.createElement("option");o.value=a,o.textContent=a,n.appendChild(o)}),Je=s.verticals||[]}catch{Je=[]}On()}function Ge(){document.getElementById("add-scrim").classList.remove("open")}function On(){const e=document.getElementById("add-vertical-chips"),t=document.getElementById("add-vertical-filter").value.trim().toLowerCase(),n=Je.filter(s=>!t||s.toLowerCase().includes(t));n.length?(e.innerHTML=n.map(s=>`<button type="button" class="vchip${Y.has(s)?" sel":""}" data-v="${l(s)}">${l(s)}</button>`).join(""),e.querySelectorAll(".vchip").forEach(s=>s.addEventListener("click",()=>{const a=s.dataset.v;Y.has(a)?Y.delete(a):Y.add(a),s.classList.toggle("sel"),Nn()}))):e.innerHTML=`<div class="none">${Je.length?"no match":"no verticals in the set yet"}</div>`,Nn()}function Nn(){const e=Y.size;document.getElementById("add-vertical-count").textContent=e?`· ${e} selected`:""}function Rn(e){return/^https?:\/\//i.test(e)?e:"https://"+e}async function Dn(){const e=document.getElementById("add-url"),t=e.value.trim();if(!t){r(Z==="company"?"Website is required.":"Posting URL is required."),e.focus();return}const n=document.getElementById("add-save"),s=n.textContent;n.disabled=!0,It()&&(n.textContent="reading page…");const a=()=>{n.disabled=!1,n.textContent=s},o=f=>document.getElementById(f).value.trim(),i=It();let d,u;i?(d="/api/capture",u={url:Rn(t),kind:Z==="company"?"company_page":"job_posting",fields:Z==="company"?{name:o("add-name"),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value,vertical:[...Y].join(", ")}:{name:o("add-job-company"),title:o("add-title")}}):Z==="company"?(d="/api/companies",u={website:t,name:o("add-name"),vertical:[...Y].join(", "),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value}):(d="/api/postings",u={url:Rn(t),title:o("add-title"),company:o("add-job-company")});let p;try{p=await fetch(d,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(u)})}catch(f){r(`add failed: ${f.message}`),a();return}if(!p.ok){let f=`HTTP ${p.status}`;try{const y=await p.text();try{f=JSON.parse(y).error||f}catch{f=y.trim()||f}}catch{}if(a(),p.status===409){r(f||"That company is already in the list."),e.focus(),e.select();return}r(`add failed: ${f}`);return}const m=await p.json();if(a(),i&&!m.company_id){r(m.note||"couldn't classify that page");return}if(Ge(),O(),C(),E(),Z==="job"){const f=m.posting&&m.posting.title||"job link";r(`tracking: ${f} @ ${m.company_name}${m.posting_updated?" (refreshed)":""}`),B("jobs")}else i?(r(m.note||(m.company_created?`company added: ${m.company_name}`:`${m.company_name} is already in the list`)),ye(m.company_id)):r("company added")}function Un(e,t,n){Ce=t,Ve();const s=document.getElementById("drawer"),a=document.getElementById("drawer-log");document.getElementById("drawer-title").textContent=e,document.getElementById("drawer-spinner").style.display="",document.getElementById("drawer-cancel").style.display="",document.getElementById("drawer-close").style.display="none",a.innerHTML="";const o=document.getElementById("drawer-summary");o.hidden=!0,o.innerHTML="",s.classList.add("open"),$t();const i={yes:0,maybe:0,no:0},d=/^(.+?)\s*→\s*(yes|maybe|no)\s*—\s*([\s\S]*)$/i,u=new EventSource(`/api/jobs/${t}/stream`),p=(m,f)=>{const y=document.createElement("div");let M;if(!f&&(M=m.match(d))){const T=M[2].toLowerCase();i[T]++,y.className="ln ln-verdict";const k=document.createElement("span");k.className="pill pill-"+T,k.textContent=T;const L=document.createElement("span");L.className="lv-text";const D=document.createElement("span");D.className="lv-name",D.textContent=M[1].trim(),L.appendChild(D);const R=(M[3]||"").trim();if(R){const b=document.createElement("span");b.className="lv-reason",b.textContent=R,L.append(" ",b)}y.append(k,L)}else if(!f&&/^(scoring|enriching|ingesting)\b/i.test(m))y.className="ln ln-head",y.textContent=m;else if(!f&&/^·\s/.test(m))y.className="ln ln-pick",y.textContent=m;else{const T=!f&&/^\s*warn:/i.test(m);y.className="ln"+(f?" ln-err":T?" ln-warn":""),y.textContent=T?m.replace(/^\s*warn:\s*/i,"⚠ "):m}a.appendChild(y),a.scrollTop=a.scrollHeight};u.addEventListener("line",m=>p(m.data,/error|failed/i.test(m.data))),u.addEventListener("end",m=>{if(u.close(),Ce=null,p(`— ${m.data} —`,m.data==="failed"),document.getElementById("drawer-spinner").style.display="none",document.getElementById("drawer-cancel").style.display="none",document.getElementById("drawer-close").style.display="",i.yes+i.maybe+i.no>0){for(const y of["yes","maybe","no"]){if(!i[y])continue;const M=document.createElement("span");M.className="pill pill-"+y,M.textContent=`${i[y]} ${y}`,o.appendChild(M)}o.hidden=!1}Pn(),r(`${e} ${m.data}`),n&&Array.isArray(n.company_ids)&&n.company_ids.length>0?us(n.company_ids):O(),C(),$t(),E(),c.openId&&ye(c.openId)}),u.onerror=()=>{u.close()}}async function Ia(){if(Ce)try{await fetch(`/api/jobs/${Ce}/cancel`,{method:"POST"})}catch{}}let N=null;const Sa={researcher:"researcher",fill:"writer",humanizer:"humanizer",honesty:"honesty check"};function St(e){return e==="application-stages"||e==="outreach-statuses"}function ze(e){if(e==="outreach-template")return"email body";if(e==="outreach-subject")return"email subject";if(e==="outreach-signature")return"email signature";if(e==="followup-template")return"follow-up template";if(e==="playbook")return"playbook";if(e==="application-stages")return"application stages";if(e==="outreach-statuses")return"outreach statuses";if(e&&e.startsWith("outreach-prompts/")){const t=e.slice(17);return(Sa[t]||t)+" prompt"}return e+".md"}async function _a(e){N=e;const t=document.getElementById("editor-scrim");document.getElementById("editor-title").textContent="edit "+ze(e),document.getElementById("editor-text").value="loading…",document.getElementById("editor-ver").textContent="";const n=e.startsWith("outreach-prompts/"),s=n?e.slice(17):"",a=n&&s!=="fill";document.getElementById("editor-toggle-row").style.display=a?"":"none",document.getElementById("editor-reset").style.display=n?"":"none",a&&(document.getElementById("editor-toggle-label").textContent="Run this stage (off → it is skipped in the pipeline)"),t.classList.add("open");try{const o=await fetch(`/api/${e}`);if(!o.ok){const d=(await o.text().catch(()=>"")).trim();document.getElementById("editor-text").value=o.status===404?"failed to load: HTTP 404 — this route is missing. Restart the scout server (your running binary may predate this feature).":`failed to load: ${d||"HTTP "+o.status}`;return}const i=await o.json();St(e)?(document.getElementById("editor-title").textContent="edit "+ze(e)+" — one per line",document.getElementById("editor-text").value=(i.statuses||[]).join(`
`)):document.getElementById("editor-text").value=i.content||"",a&&(document.getElementById("editor-enabled").checked=i.enabled!==!1),i.taste_version&&(document.getElementById("editor-ver").textContent="version "+i.taste_version)}catch(o){document.getElementById("editor-text").value="failed to load: "+o.message}}function We(){document.getElementById("editor-scrim").classList.remove("open"),N=null}let _=null,_t=[],Tt=[];const Ta=["location.allowed","verticals.excluded","verticals.allowed"],Bt={"verticals.excluded":"pf-vertical-tags","verticals.allowed":"pf-vertical-tags"};function Q(e){const[t,n]=e.split(".");return _[t]&&_[t][n]||[]}function Ke(e,t){const[n,s]=e.split(".");(_[n]=_[n]||{})[s]=t}function Ye(e,t){const n=t.toLowerCase();return e.some(s=>String(s).toLowerCase()===n)}function Lt(){Ta.forEach(e=>{const t=document.querySelector(`.pf-chips[data-field="${e}"]`);if(!t)return;const n=Bt[e]?` list="${Bt[e]}"`:"",s=Bt[e]?"type to search…":"type &amp; Enter…";t.innerHTML=Q(e).map((a,o)=>`<span class="pf-chip">${l(a)}<button class="pf-chip-x" data-field="${e}" data-i="${o}" title="remove" aria-label="remove ${l(a)}">×</button></span>`).join("")+`<input class="pf-chip-input" data-field="${e}"${n} type="text" placeholder="${s}" spellcheck="false" autocomplete="off" />`})}function Ba(e,t){var s;const n=(t||"").trim();if(n){const a=Q(e);Ye(a,n)||Ke(e,[...a,n])}Lt(),(s=document.querySelector(`.pf-chip-input[data-field="${e}"]`))==null||s.focus()}function Vn(e,t){const n=Q(e).slice();n.splice(t,1),Ke(e,n),Lt()}function Fn(){const e=document.getElementById("pf-stages");if(!e)return;const t=Q("funding_stage.allowed");e.innerHTML=Tt.map(n=>{const s=Ye(t,n.value),a=n.count?` <span class="pf-stage-n">${n.count}</span>`:"";return`<button class="pf-stage${s?" is-on":""}" data-stage="${l(n.value)}">${l(n.value)}${a}</button>`}).join("")}function La(e){const t=Q("funding_stage.allowed");Ke("funding_stage.allowed",Ye(t,e)?t.filter(n=>String(n).toLowerCase()!==e.toLowerCase()):[...t,e]),Fn()}function Ca(){const e=document.getElementById("pf-vertical-tags");e&&(e.innerHTML=_t.map(t=>`<option value="${l(t.value)}" label="${t.count}"></option>`).join(""))}function ja(){return{location:{allowed:[],remote_ok:!0},headcount:{min:0,max:0},verticals:{allowed:[],excluded:[]},funding_stage:{allowed:[]}}}function Ma(){return`<div class="set-field pf-inline">
    <div class="set-field-label">Pre-filter</div>
    <div class="set-field-desc">A cheap, no-LLM gate that runs <strong>before</strong> a bulk verdict run, so the paid model only scores companies worth a closer look. It only narrows <strong>bulk</strong> runs — re-scoring one company by hand always runs the LLM — and never deletes, hides, or stops fetching anything.</div>
    <label class="pf-master">
      <input type="checkbox" id="pf-enabled" />
      <span class="pf-master-text">
        <strong>Run the pre-filter on bulk runs</strong>
        <span class="pf-master-sub">Off → a bulk run scores every company (the rules below are kept either way).</span>
      </span>
    </label>
    <section class="pf-sec">
      <h3 class="pf-h">Location</h3>
      <p class="pf-help">A company passes if its location contains any of these. Add cities, regions, or "remote".</p>
      <div class="pf-chips" data-field="location.allowed"></div>
      <label class="pf-check"><input type="checkbox" id="pf-remote-ok" /><span>Also pass companies with no location listed, or marked remote.</span></label>
    </section>
    <section class="pf-sec">
      <h3 class="pf-h">Headcount</h3>
      <p class="pf-help">Pass only companies within this size range. Set a bound to <strong>0</strong> for no limit; companies with no headcount data always pass.</p>
      <div class="pf-range"><label>min <input type="number" id="pf-hc-min" class="input" min="0" step="1" /></label><span class="pf-range-dash">–</span><label>max <input type="number" id="pf-hc-max" class="input" min="0" step="1" /></label></div>
    </section>
    <section class="pf-sec">
      <h3 class="pf-h">Industry / vertical</h3>
      <p class="pf-help">Matches whole category tags from your data. Start typing to pick a tag.</p>
      <div class="pf-sublabel">Exclude these tags</div>
      <div class="pf-chips" data-field="verticals.excluded"></div>
      <div class="pf-sublabel">Allow only these <span class="pf-sublabel-note">(leave empty to allow all)</span></div>
      <div class="pf-chips" data-field="verticals.allowed"></div>
      <datalist id="pf-vertical-tags"></datalist>
    </section>
    <section class="pf-sec">
      <h3 class="pf-h">Funding stage</h3>
      <p class="pf-help">If you pick any, only companies at those stages pass. Leave all unselected to allow every stage.</p>
      <div class="pf-stages" id="pf-stages"></div>
    </section>
    <div class="set-field-foot">
      <button class="btn btn-primary" id="pf-save">Save pre-filter</button>
      <button class="btn" id="pf-reset" title="discard your edits and restore the built-in default rules">Reset to default</button>
    </div>
  </div>`}async function Jn(e=!1){if(document.getElementById("pf-enabled"))try{const[t,n]=await Promise.all([(await fetch("/api/taste-filter"+(e?"?default=1":""))).json(),_t.length||Tt.length?Promise.resolve(null):fetch("/api/filter-options").then(s=>s.json()).catch(()=>null)]);n&&(_t=n.verticals||[],Tt=n.stages||[]),_=Object.assign(ja(),t.rules||{}),_.location=Object.assign({allowed:[],remote_ok:!0},_.location),_.headcount=Object.assign({min:0,max:0},_.headcount),_.verticals=Object.assign({allowed:[],excluded:[]},_.verticals),_.funding_stage=Object.assign({allowed:[]},_.funding_stage),e||(document.getElementById("pf-enabled").checked=t.enabled!==!1),document.getElementById("pf-remote-ok").checked=!!_.location.remote_ok,document.getElementById("pf-hc-min").value=String(_.headcount.min||0),document.getElementById("pf-hc-max").value=String(_.headcount.max||0),Ca(),Lt(),Fn()}catch(t){r(`failed to load pre-filter: ${t.message}`)}}async function Aa(){if(!_)return;_.location.remote_ok=document.getElementById("pf-remote-ok").checked,_.headcount.min=Math.max(0,parseInt(document.getElementById("pf-hc-min").value,10)||0),_.headcount.max=Math.max(0,parseInt(document.getElementById("pf-hc-max").value,10)||0),document.querySelectorAll(".pf-chip-input").forEach(n=>{const s=n.value.trim();s&&!Ye(Q(n.dataset.field),s)&&Ke(n.dataset.field,[...Q(n.dataset.field),s])});const e=document.getElementById("pf-enabled").checked;let t;try{t=await fetch("/api/taste-filter",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({rules:_,enabled:e})})}catch(n){r(`save failed: ${n.message}`);return}if(!t.ok){r(`save failed: ${(await t.text().catch(()=>"")).trim()||"HTTP "+t.status}`);return}r("pre-filter saved"),C()}const Pa=[{key:"experience",hard:!0},{key:"voice",hard:!1},{key:"logistics",hard:!1}];async function Gn(){document.getElementById("sources-scrim").classList.add("open"),document.getElementById("sources-list").innerHTML='<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>';try{qa(await(await fetch("/api/outreach/sources")).json())}catch(e){r(`failed to load sources: ${e.message}`)}}function Ct(){document.getElementById("sources-scrim").classList.remove("open")}function qa(e){const t=document.getElementById("sources-list");if(!t)return;const n=e&&e.needs&&e.needs.length?e.needs.map(a=>({key:a.Key||a.key,hard:a.Hard??a.hard})):Pa,s={};(e&&e.sources||[]).forEach(a=>{(s[a.need]=s[a.need]||[]).push(a)}),t.innerHTML=n.map(a=>{const o=s[a.key]||[],i=o.length?o.map(d=>`<li><span class="src-title">${l(d.title||d.page_id)}</span></li>`).join(""):`<li class="dim small">${a.hard?"none yet — add an experience page to your brain":"none (optional)"}</li>`;return`<div class="src-need">
      <div class="src-need-h">${l(a.key)}${a.hard?' <span class="dim">required</span>':' <span class="dim">optional</span>'}</div>
      <ul class="src-items">${i}</ul></div>`}).join("")}async function Ha(){if(!N)return;const e=document.getElementById("editor-text").value;let t;St(N)?t={statuses:e.split(/\r?\n/).map(o=>o.trim()).filter(Boolean)}:(t={content:e},N.startsWith("outreach-prompts/")&&N!=="outreach-prompts/fill"&&(t.enabled=document.getElementById("editor-enabled").checked));let n;try{n=await fetch(`/api/${N}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})}catch(o){r(`save failed: ${o.message}`);return}if(!n.ok){r(`save failed: ${(await n.text().catch(()=>"")).trim()||"HTTP "+n.status}`);return}const s=await n.json();s.taste_version&&(document.getElementById("editor-ver").textContent="version "+s.taste_version);const a=St(N);N==="followup-template"&&(c.followupTemplate=e),r(`${ze(N)} saved`),We(),a&&P(),C()}async function Oa(){if(!N||!N.startsWith("outreach-prompts/"))return;let e;try{e=await fetch(`/api/${N}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({reset:!0})})}catch(n){r(`reset failed: ${n.message}`);return}if(!e.ok){r(`reset failed: HTTP ${e.status}`);return}const t=await e.json();document.getElementById("editor-text").value=t.content||"",r(`${ze(N)} reset to default`)}function zn(e,t,n){e.k!==t?(e.k=t,e.dir=1):e.dir===1?e.dir=-1:Object.assign(e,n)}document.querySelectorAll("#t thead th[data-k]").forEach(e=>{e.onclick=()=>{zn(c.sort,e.dataset.k,v),G()}}),document.querySelectorAll("#jt thead th[data-jk]").forEach(e=>{e.onclick=()=>{zn(c.jsort,e.dataset.jk,x),j()}}),document.getElementById("tab-companies").onclick=()=>B("companies"),document.getElementById("tab-jobs").onclick=()=>B("jobs"),document.getElementById("tab-inbox").onclick=()=>B("inbox"),document.getElementById("q").oninput=G,document.getElementById("fdrop-cfilters-menu").addEventListener("click",e=>{const t=e.target.closest(".fdrop-item");if(t){if(t.dataset.toggle==="flagged")ce=!ce,pe(t,ce);else if(t.dataset.toggle==="enriched")le=!le,pe(t,le);else if(t.hasAttribute("data-v")){const n=t.getAttribute("data-v");F.has(n)?F.delete(n):F.add(n),pe(t,F.has(n))}else return;G()}}),document.getElementById("fdrop-columns-menu").addEventListener("click",e=>{const t=e.target.closest(".fdrop-item[data-col]");if(!t)return;const n=at(),s=t.getAttribute("data-col");n.hidden.has(s)?n.hidden.delete(s):n.hidden.add(s),localStorage.setItem(n.key,JSON.stringify([...n.hidden])),pe(t,!n.hidden.has(s)),re(),Kt()}),document.getElementById("jq").oninput=j;for(const e of["fdrop-cfilters","fdrop-columns","fdrop-jfilters"]){const t=document.getElementById(e);t.querySelector(".fdrop-btn").addEventListener("click",s=>{s.stopPropagation();const a=t.classList.contains("is-open");rt(),a||hs(t)}),t.querySelector(".fdrop-menu").addEventListener("click",s=>s.stopPropagation())}document.addEventListener("click",rt),document.getElementById("fdrop-jfilters-menu").addEventListener("click",e=>{const t=e.target.closest(".fdrop-all");if(t){if(t.getAttribute("data-all")==="stage"){const s=["",...c.applicationStages];$=s.every(a=>$.has(a))?new Set:new Set(s)}else{const s=["",...c.outreachStatuses];S=S&&s.every(a=>S.has(a))?new Set:new Set(s)}ct(),j();return}const n=e.target.closest(".fdrop-item");if(n){if(n.hasAttribute("data-stage")){const s=n.getAttribute("data-stage");$.has(s)?$.delete(s):$.add(s),pe(n,$.has(s))}else if(n.hasAttribute("data-status")){const s=n.getAttribute("data-status");S.has(s)?S.delete(s):S.add(s),pe(n,S.has(s))}else return;ms(),j()}}),is(),Wt(),re(),document.getElementById("pane-close").onclick=_e,document.getElementById("scrim").onclick=_e,document.getElementById("pursuit-close").onclick=$e,document.getElementById("pursuit-scrim").onclick=$e,document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(document.querySelector(".fdrop.is-open")){rt();return}if(document.getElementById("chat-pane").classList.contains("open")){Ut();return}if(document.getElementById("profile-scrim").classList.contains("open")){Nt();return}if(document.getElementById("add-scrim").classList.contains("open")){Ge();return}if(document.getElementById("run-scrim").classList.contains("open")){Ze();return}if(document.getElementById("help-scrim").classList.contains("open")){Qe();return}if(document.getElementById("relink-scrim").classList.contains("open")){he();return}if(document.getElementById("delcompany-scrim").classList.contains("open")){He();return}if(document.getElementById("deljob-scrim").classList.contains("open")){Oe();return}if(document.getElementById("delcontact-scrim").classList.contains("open")){Ne();return}if(document.getElementById("sendfollowup-scrim").classList.contains("open")){Re();return}const t=document.getElementById("pane").classList.contains("open"),n=document.getElementById("pursuit-pane").classList.contains("open");if(t||n){if(ut==="pursuit"&&n){$e();return}if(ut==="company"&&t){_e();return}if(t){_e();return}$e();return}if(document.getElementById("key-scrim").classList.contains("open")){Ot();return}if(document.getElementById("sources-scrim").classList.contains("open")){Ct();return}if(document.getElementById("editor-scrim").classList.contains("open")){We();return}if(document.getElementById("gmail-config-scrim").classList.contains("open")){je();return}});let jt=null;const Na={enrich:"Fetches and summarizes each company's pages, filling its enrichment row.",verdict:"Scores every company against your criteria — one LLM call each. Only companies with a successful enrichment are scored."};function Wn(e){if(c.meta&&c.meta.control===!1){r("control surface disabled");return}jt=e,document.getElementById("run-title").textContent="Run "+e,document.getElementById("run-desc").textContent=Na[e]||"",document.getElementById("run-only-blanks").checked=!1,document.getElementById("run-workers-input").value=e==="verdict"?10:8;const t=document.getElementById("run-warn"),n=c.stats||{},s=Math.max(0,(n.total_companies||0)-(n.enriched_ok||0));e==="verdict"&&s>0?(document.getElementById("run-warn-text").textContent=`${s} ${s===1?"company isn't":"companies aren't"} enriched yet — verdict will skip ${s===1?"it":"them"}. Run Enrich first to include ${s===1?"it":"them"}.`,t.style.display=""):t.style.display="none",document.getElementById("run-scrim").classList.add("open")}function Ze(){document.getElementById("run-scrim").classList.remove("open"),jt=null}document.getElementById("btn-enrich").onclick=()=>Wn("enrich"),document.getElementById("btn-verdict").onclick=()=>Wn("verdict"),document.getElementById("run-cancel").onclick=Ze,document.getElementById("run-scrim").onclick=e=>{e.target.id==="run-scrim"&&Ze()},document.getElementById("run-go").onclick=()=>{const e=jt,t=document.getElementById("run-only-blanks").checked,n=parseInt(document.getElementById("run-workers-input").value,10);if(Ze(),!e)return;const s={};t&&(s.only_blanks=!0),n>0&&(s.workers=n),xt(e,s)},document.getElementById("btn-ingest").onclick=()=>document.getElementById("csv-file").click(),document.getElementById("btn-add").onclick=xa;const Ra={add:{title:"Add data",intro:"Two ways to get companies and jobs into scout.",items:[{name:"Ingest CSV",sec:"ingest",desc:"Bulk-import companies from a CSV export (e.g. Crunchbase). Columns are mapped to company fields and new rows are created."},{name:"Add",sec:"ingest",desc:"Add one company or job from its link. Tick “fill in the blanks” to let an ATS API (ashby/greenhouse/lever) or one cheap agent pass complete the details."}]},run:{title:"Run the pipeline",intro:"Enrich must run before Verdict — verdict only scores companies that already have a successful enrichment row.",items:[{name:"Enrich",sec:"enrich",desc:"Fetches and summarizes each company's web presence into an enrichment row. A prerequisite for Verdict."},{name:"Verdict",sec:"verdict",desc:"Scores each enriched company against your criteria with the LLM, producing a yes / maybe / no with reasoning."}]}};function Kn(e){const t=Ra[e];if(!t)return;document.getElementById("help-title").textContent=t.title;const n=document.getElementById("help-items");if(n.innerHTML="",t.intro){const s=document.createElement("p");s.className="help-intro",s.textContent=t.intro,n.appendChild(s)}t.items.forEach(s=>{const a=document.createElement("div");a.className="help-item";const o=document.createElement("div");o.className="help-item-name",o.textContent=s.name;const i=document.createElement("div");i.className="help-item-desc",i.textContent=s.desc;const d=document.createElement("a");d.className="help-link",d.textContent="Learn more →",d.onclick=()=>{Qe(),B("docs"),io(s.sec)},a.appendChild(o),a.appendChild(i),a.appendChild(d),n.appendChild(a)}),document.getElementById("help-scrim").classList.add("open")}function Qe(){document.getElementById("help-scrim").classList.remove("open")}document.getElementById("help-add").onclick=()=>Kn("add"),document.getElementById("help-run").onclick=()=>Kn("run"),document.getElementById("help-close").onclick=Qe,document.getElementById("help-scrim").onclick=e=>{e.target.id==="help-scrim"&&Qe()},document.getElementById("add-cancel").onclick=Ge,document.getElementById("add-save").onclick=Dn,document.getElementById("add-scrim").onclick=e=>{e.target.id==="add-scrim"&&Ge()},document.querySelectorAll("#add-kind .v-chip").forEach(e=>{e.onclick=()=>qn(e.dataset.kind)}),document.getElementById("add-enrich").addEventListener("change",Hn),document.getElementById("add-scrim").addEventListener("keydown",e=>{e.key==="Enter"&&(e.target.tagName!=="INPUT"||e.target.type==="checkbox"||e.target.id==="add-vertical-filter"||e.target.id==="add-job-company"||(e.preventDefault(),Dn()))}),document.getElementById("add-vertical-filter").addEventListener("input",On),document.getElementById("add-headcount").addEventListener("input",e=>{const t=e.target.value.replace(/[^0-9]/g,"");t!==e.target.value&&(e.target.value=t)}),document.getElementById("csv-file").onchange=e=>{const t=e.target.files&&e.target.files[0];t&&Ea(t),e.target.value=""},document.getElementById("drawer-cancel").onclick=Ia,document.getElementById("drawer-close").onclick=An,(()=>{const e=document.getElementById("drawer");e.addEventListener("mouseenter",Ve),e.addEventListener("mouseleave",()=>{!Ce&&e.classList.contains("open")&&Pn()})})(),document.getElementById("editor-cancel").onclick=We,document.getElementById("editor-save").onclick=Ha,document.getElementById("editor-reset").onclick=Oa,document.getElementById("editor-scrim").onclick=e=>{e.target.id==="editor-scrim"&&We()},document.getElementById("sources-close").onclick=Ct,document.getElementById("sources-scrim").onclick=e=>{e.target.id==="sources-scrim"&&Ct()},document.addEventListener("click",e=>{var a;const t=e.target.closest(".pf-stage");if(t){La(t.dataset.stage);return}const n=e.target.closest(".pf-chip-x");if(n){Vn(n.dataset.field,parseInt(n.dataset.i,10));return}const s=e.target.closest(".pf-chips");s&&e.target===s&&((a=s.querySelector(".pf-chip-input"))==null||a.focus())}),document.addEventListener("keydown",e=>{const t=e.target.closest(".pf-chip-input");if(t){if(e.key==="Enter"||e.key===",")e.preventDefault(),Ba(t.dataset.field,t.value);else if(e.key==="Backspace"&&!t.value){const n=Q(t.dataset.field);n.length&&Vn(t.dataset.field,n.length-1)}}}),document.getElementById("key-cancel").onclick=Ot,document.getElementById("key-save").onclick=Xn,document.getElementById("key-remove").onclick=so,document.getElementById("key-scrim").onclick=e=>{e.target.id==="key-scrim"&&Ot()},document.getElementById("key-input").addEventListener("keydown",e=>{e.key==="Enter"&&(e.preventDefault(),Xn())}),document.getElementById("delcompany-cancel").onclick=He,document.getElementById("delcompany-confirm").onclick=Bs,document.getElementById("delcompany-scrim").onclick=e=>{e.target.id==="delcompany-scrim"&&He()},document.getElementById("deljob-cancel").onclick=Oe,document.getElementById("deljob-confirm").onclick=Cs,document.getElementById("deljob-scrim").onclick=e=>{e.target.id==="deljob-scrim"&&Oe()},document.getElementById("delcontact-cancel").onclick=Ne,document.getElementById("delcontact-confirm").onclick=Ms,document.getElementById("delcontact-scrim").onclick=e=>{e.target.id==="delcontact-scrim"&&Ne()},document.getElementById("sendfollowup-cancel").onclick=Re,document.getElementById("sendfollowup-confirm").onclick=Ps,document.getElementById("sendfollowup-scrim").onclick=e=>{e.target.id==="sendfollowup-scrim"&&Re()},document.getElementById("relink-cancel").onclick=he,document.getElementById("relink-scrim").onclick=e=>{e.target.id==="relink-scrim"&&he()},document.getElementById("relink-search").addEventListener("input",e=>{hn(e.target.value)}),document.getElementById("relink-search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const t=document.querySelector("#relink-results .relink-result:not([disabled])");t&&fn(t.dataset.id)}}),document.getElementById("relink-results").addEventListener("click",e=>{const t=e.target.closest(".relink-result");t&&!t.disabled&&fn(t.dataset.id)});async function Mt(){try{const e=await fetch("/api/profile");if(!e.ok)throw new Error(`HTTP ${e.status}`);c.profile=await e.json()}catch{c.profile=null}W()}const At='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 8a5.4 5.4 0 1 1-1.5-3.8"/><path d="M13.6 2.6V5.2H11"/></svg>',Yn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 7a3.8 3.8 0 0 1 7.6 0c0 3 1.2 4 1.2 4H3s1.2-1 1.2-4z"/><path d="M6.7 13a1.5 1.5 0 0 0 2.6 0"/></svg>',Da='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7"/></svg>',Ua=[["outreach","Outreach"],["pipeline","Outreach pipeline"],["tracking","Tracking"],["job-hunting","Job hunting"],["integrations","Integrations"]],Va=[["researcher","1 · Researcher","Searches the web for true company facts and the best hooks to open with."],["fill","2 · Writer","Writes the email's blanks from the research, your experience, and your voice."],["humanizer","3 · Humanizer","Strips AI tells and matches your voice — never changes a fact."],["honesty","4 · Honesty check","Vetoes any claim about you beyond your documented experience."]];function W(){const e=document.getElementById("criteria-stats");if(!e)return;const t=document.getElementById("settings-view");if(t&&t.style.display==="none")return;const n=c.settingsGroup||"outreach";e.innerHTML=`<div class="settings-shell">
    <nav class="settings-nav">
      ${Ua.map(([a,o])=>`<a data-grp="${a}" class="${a===n?"active":""}">${l(o)}</a>`).join("")}
    </nav>
    <div class="settings-content" id="settings-content"></div>
  </div>`,e.querySelectorAll("[data-grp]").forEach(a=>{a.onclick=()=>{c.settingsGroup!==a.dataset.grp&&(c.settingsGroup=a.dataset.grp,W())}});const s=document.getElementById("settings-content");s&&(n==="pipeline"?za(s):n==="tracking"?Ka(s):n==="job-hunting"?Ya(s):n==="integrations"?Qa(s):Ga(s))}function X(e,t,n,s,a){return`<div class="set-field" data-kind="${e}" data-list="${a?1:0}">
    <div class="set-field-label">${l(t)}</div>
    <div class="set-field-desc">${l(n)}</div>
    <textarea class="set-textarea" rows="${s}" spellcheck="false" data-loaded="0">loading…</textarea>
    <div class="set-field-foot"><span class="set-saved">saved ✓</span></div>
  </div>`}function Pt(e){const t=e.querySelector(".set-saved");t&&(t.classList.add("show"),setTimeout(()=>t.classList.remove("show"),1500))}async function Fa(e){const t=e.dataset.kind,n=e.dataset.list==="1",s=e.querySelector(".set-textarea");try{const a=await(await fetch(`/api/${t}`)).json();s.value=n?(a.statuses||[]).join(`
`):a.content||""}catch{s.value=""}s.dataset.orig=s.value,s.dataset.loaded="1",s.addEventListener("blur",()=>Ja(e))}async function Ja(e){const t=e.dataset.kind,n=e.dataset.list==="1",s=e.querySelector(".set-textarea");if(s.dataset.loaded!=="1"||s.value===s.dataset.orig)return;const a=n?{statuses:s.value.split(/\r?\n/).map(i=>i.trim()).filter(Boolean)}:{content:s.value};let o;try{o=await fetch(`/api/${t}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(a)})}catch(i){r(`save failed: ${i.message}`);return}if(!o.ok){r(`save failed: ${(await o.text().catch(()=>"")).trim()||"HTTP "+o.status}`);return}s.dataset.orig=s.value,Pt(e),t==="followup-template"&&(c.followupTemplate=s.value),n&&(await P(),j())}function qt(e){e.querySelectorAll(".set-field[data-kind]").forEach(Fa)}function Ga(e){e.innerHTML=X("outreach-subject","Email subject","The send subject — {{role}} / {{company}} substitution, no LLM.",2,!1)+X("outreach-template","Email body","Verbatim prose with the writer's fill-in holes.",16,!1)+X("outreach-signature","Email signature","A fixed sign-off appended to every sent email (blank = none).",3,!1)+X("followup-template","Follow-up template","Copy-paste follow-up — {{contact_name}}, {{role}}, {{company}}, {{last_sent}}, {{last_message}}.",9,!1)+`<div class="set-field">
      <div class="set-field-label">Follow-up reminder</div>
      <div class="set-field-desc">Business days after a send before a follow-up comes due (0 = off).</div>
      <input class="input set-fu-interval" type="number" min="0" max="90" value="${c.followupInterval}" style="margin-top:8px;width:90px">
    </div>`,qt(e);const t=e.querySelector(".set-fu-interval");t&&t.addEventListener("change",async()=>{const n=Math.max(0,Math.min(90,parseInt(t.value,10)||0));t.value=String(n),await z("PUT","/api/followup-interval",{days:n})&&(c.followupInterval=n,r("follow-up interval saved"))})}function za(e){e.innerHTML=Va.map(([t,n,s])=>`
    <div class="set-field" data-prompt="${t}">
      <div class="set-field-label">${l(n)}</div>
      <div class="set-field-desc">${l(s)}</div>
      <textarea class="set-textarea" rows="12" spellcheck="false" data-loaded="0">loading…</textarea>
      <div class="set-field-foot">
        <span class="set-saved">saved ✓</span>
        ${t!=="fill"?'<label class="set-toggle"><input type="checkbox" class="pl-enabled"> run this stage</label>':""}
        <button class="btn pl-reset">Reset to default</button>
      </div>
    </div>`).join(""),e.querySelectorAll(".set-field[data-prompt]").forEach(Wa)}async function Wa(e){const t=e.dataset.prompt,n=e.querySelector(".set-textarea"),s=e.querySelector(".pl-enabled");try{const o=await(await fetch(`/api/outreach-prompts/${t}`)).json();n.value=o.content||"",s&&(s.checked=o.enabled!==!1)}catch{n.value=""}n.dataset.orig=n.value,n.dataset.loaded="1",n.addEventListener("blur",()=>Zn(e)),s&&s.addEventListener("change",()=>Zn(e));const a=e.querySelector(".pl-reset");a&&a.addEventListener("click",async()=>{const o=await fetch(`/api/outreach-prompts/${t}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({reset:!0})});if(!o.ok){r(`reset failed: HTTP ${o.status}`);return}const i=await o.json();n.value=i.content||"",n.dataset.orig=n.value,s&&(s.checked=i.enabled!==!1),Pt(e),r("reset to default")})}async function Zn(e){const t=e.dataset.prompt,n=e.querySelector(".set-textarea"),s=e.querySelector(".pl-enabled");if(n.dataset.loaded!=="1")return;const a={content:n.value};s&&(a.enabled=s.checked);let o;try{o=await fetch(`/api/outreach-prompts/${t}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(a)})}catch(i){r(`save failed: ${i.message}`);return}if(!o.ok){r(`save failed: ${(await o.text().catch(()=>"")).trim()||"HTTP "+o.status}`);return}n.dataset.orig=n.value,Pt(e)}function Ka(e){e.innerHTML=X("application-stages","Application stages","The application pipeline labels (applied, screening, interview…). One per line.",6,!0)+X("outreach-statuses","Outreach statuses","The outreach reply labels (initial contact, no response, replied…). One per line.",6,!0),qt(e)}function Ya(e){const t=c.profile,s=(t&&t.active_source||c.stats&&c.stats.taste_source||"").startsWith("brain:"),a=t&&typeof t.body=="string";let o;s?o=`<div class="set-field">
      <div class="set-field-label">Company-fit brief <button class="btn btn-sm" id="brief-refresh" title="re-distill from the brain">Refresh</button></div>
      <div class="set-field-desc">The criteria scout feeds the verdict stage — distilled from the brain (read-only here).</div>
      <pre class="set-readonly">${l(a?t.body:"(no brief yet — Refresh to distill from the brain)")}</pre>
    </div>`:o=X("taste","Taste (local fallback)","Local fallback criteria used when the brain is unreachable.",12,!1),e.innerHTML=o+X("playbook","Playbook","How scout judges — the reasoning rules behind every verdict.",12,!1)+Ma(),qt(e);const i=e.querySelector("#brief-refresh");i&&i.addEventListener("click",ao),Jn();const d=e.querySelector("#pf-save");d&&d.addEventListener("click",Aa);const u=e.querySelector("#pf-reset");u&&u.addEventListener("click",()=>Jn(!0))}function Za(e){const t=e.callback_uri||"(your scout URL)/api/gmail/callback",n=e.scopes||["openid","email","https://www.googleapis.com/auth/gmail.send","https://www.googleapis.com/auth/gmail.readonly"];return`<details class="set-help"${e.configured?"":" open"}>
    <summary>Set up the Google OAuth client (one-time)</summary>
    <div class="set-help-body">
      <ol class="set-steps">
        <li><strong>Enable the Gmail API.</strong> In <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener">APIs &amp; Services → Library → Gmail API</a>, click <strong>Enable</strong> — or run <code>gcloud services enable gmail.googleapis.com</code>.</li>
        <li><strong>Configure the OAuth consent screen.</strong> Add these scopes:
          <ul class="set-help-scopes">${n.map(s=>`<li><code>${l(s)}</code></li>`).join("")}</ul>
          Then authorize your mailbox — pick one:
          <div class="set-choice">
            <div class="sc-opt sc-go">
              <div class="sc-opt-head"><strong>Publish app</strong><span class="sc-tag">recommended</span></div>
              <div class="sc-opt-desc">Self-hosting your own mailbox needs no Google verification.</div>
            </div>
            <div class="sc-or">or</div>
            <div class="sc-opt sc-alt">
              <div class="sc-opt-head"><strong>Add Test users</strong></div>
              <div class="sc-opt-desc">Add your own Google account as a test user — no publishing.</div>
            </div>
          </div>
        </li>
        <li><strong>Create the OAuth client.</strong> In <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">APIs &amp; Services → Credentials</a>, create an <strong>OAuth client ID → Web application</strong>, and add this exact <strong>Authorized redirect URI</strong>:
          <div class="set-copy-row"><code id="gm-cb">${l(t)}</code><button class="btn btn-sm" id="gm-copy-cb" type="button">Copy</button></div>
        </li>
        <li><strong>Connect.</strong> Paste the client ID &amp; secret below, click <strong>Save</strong>, then <strong>Connect</strong>.</li>
      </ol>
    </div>
  </details>`}function Qa(e){const t=c.anthropicKey||{};let n="Not set — verdict, capture & outreach disabled.";t.key_source==="db"?n="Set here · active.":t.key_source==="env"&&(n="Using the ANTHROPIC_API_KEY environment variable.");const s=c.gmail||{},a=!!s.connected,o=!!s.configured,i=a?"ok":o?"warn":"off",d=a?`Connected as ${l(s.email||"your account")}`:o?"Not connected":"Not set up";e.innerHTML=`
    <div class="set-field">
      <div class="set-field-label">Anthropic API key</div>
      <div class="set-field-desc">Powers scoring, capture & outreach. ${l(n)}</div>
      <div class="set-field-row" style="margin-top:8px">
        <input class="input" id="set-ak-input" type="password" placeholder="${t.key_source==="db"?"•••••• set — paste to replace":"sk-ant-…"}" autocomplete="off" spellcheck="false" style="flex:1">
        <button class="btn btn-primary" id="set-ak-save">Save</button>
        ${t.key_source==="db"?'<button class="btn" id="set-ak-remove">Remove</button>':""}
      </div>
    </div>
    <div class="set-field">
      <div class="set-field-label">Gmail <span class="set-status"><span class="pf-dot ${i}"></span>${d}</span></div>
      <div class="set-field-desc">Send outreach from your Gmail and auto-sync replies + application status.</div>
      ${Za(s)}
      <div class="set-subfields">
        <label class="set-sub-label" for="set-gm-id">Client ID</label>
        <input class="input" id="set-gm-id" placeholder="…apps.googleusercontent.com" autocomplete="off" spellcheck="false" value="${l(s.client_id||"")}">
        <label class="set-sub-label" for="set-gm-secret">Client secret</label>
        <input class="input" id="set-gm-secret" type="password" placeholder="(leave blank to keep the current secret)" autocomplete="off" spellcheck="false">
        <label class="set-sub-label" for="set-gm-redirect">Redirect URI <span class="dim">(optional — derived from this host if blank)</span></label>
        <input class="input" id="set-gm-redirect" placeholder="https://…/api/gmail/callback" autocomplete="off" spellcheck="false" value="${l(s.redirect_uri||"")}">
      </div>
      <div class="set-field-row" style="margin-top:10px">
        <button class="btn" id="set-gm-save">Save credentials</button>
        ${o&&!a?'<button class="btn btn-primary" id="set-gm-connect">Connect</button>':""}
        ${a?'<button class="btn" id="set-gm-disconnect">Disconnect</button>':""}
      </div>
    </div>
    <div class="set-field">
      <div class="set-field-label">Auto-update application status</div>
      <div class="set-field-desc">On: scout sets a job's application status from incoming ATS/company mail. Off (default): it suggests it in the Inbox for one-click apply.</div>
      <div class="set-field-row" style="margin-top:8px"><label class="set-toggle"><input type="checkbox" id="set-autoflip" ${s.autoflip?"checked":""}> auto-update application status</label></div>
    </div>`;const u=e.querySelector("#set-ak-save");u&&u.addEventListener("click",async()=>{const k=e.querySelector("#set-ak-input").value.trim();if(!k){r("paste a key first");return}const L=await fetch("/api/integrations/anthropic",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:k})});if(!L.ok){r((await L.text().catch(()=>"")).trim()||`HTTP ${L.status}`);return}r("Anthropic key saved"),await Le(),await Ht()});const p=e.querySelector("#set-ak-remove");p&&p.addEventListener("click",async()=>{const k=await fetch("/api/integrations/anthropic",{method:"DELETE"});if(!k.ok){r(`HTTP ${k.status}`);return}r("Anthropic key removed"),await Le(),await Ht()});const m=e.querySelector("#set-gm-save");m&&m.addEventListener("click",async()=>{const k=e.querySelector("#set-gm-id").value.trim(),L=e.querySelector("#set-gm-secret").value,D=e.querySelector("#set-gm-redirect").value.trim();if(!k){r("client ID is required");return}const R=await fetch("/api/gmail/config",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:k,client_secret:L,redirect_uri:D})});if(!R.ok){r((await R.text().catch(()=>"")).trim()||`HTTP ${R.status}`);return}r("Gmail OAuth client saved"),await be()});const f=e.querySelector("#set-gm-connect");f&&f.addEventListener("click",Xa);const y=e.querySelector("#set-gm-disconnect");y&&y.addEventListener("click",eo);const M=e.querySelector("#gm-copy-cb");M&&M.addEventListener("click",()=>Fe(c.gmail&&c.gmail.callback_uri||"","redirect URI copied"));const T=e.querySelector("#set-autoflip");T&&T.addEventListener("change",async()=>{let k=!1;try{k=(await fetch("/api/gmail/autoflip",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:T.checked})})).ok}catch{k=!1}k?(c.gmail&&(c.gmail.autoflip=T.checked),r(`auto-update ${T.checked?"on":"off"}`)):(T.checked=!T.checked,r("failed to save"))})}async function Ht(){try{c.anthropicKey=await(await fetch("/api/integrations/anthropic")).json()}catch{c.anthropicKey=null}W()}async function be(){try{c.gmail=await(await fetch("/api/gmail/status")).json()}catch{c.gmail=null}W()}async function Xa(){let e;try{e=await fetch("/api/gmail/connect")}catch(n){r(`connect failed: ${n.message}`);return}if(!e.ok){r((await e.text().catch(()=>"")).trim()||`HTTP ${e.status}`);return}let t={};try{t=await e.json()}catch{}t.auth_url?window.location.href=t.auth_url:r("could not start the Gmail connect flow")}async function eo(){if(!confirm("Disconnect Gmail? Sending and sync stop; already-synced data stays."))return;let e;try{e=await fetch("/api/gmail/disconnect",{method:"DELETE"})}catch(t){r(`disconnect failed: ${t.message}`);return}if(!e.ok){r((await e.text().catch(()=>"")).trim()||`HTTP ${e.status}`);return}r("Gmail disconnected"),await be()}function je(){document.getElementById("gmail-config-scrim").classList.remove("open")}async function to(){const e=document.getElementById("gmail-client-id").value.trim(),t=document.getElementById("gmail-client-secret").value,n=document.getElementById("gmail-redirect").value.trim();if(!e){r("client ID is required");return}let s;try{s=await fetch("/api/gmail/config",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:e,client_secret:t,redirect_uri:n})})}catch(a){r(`save failed: ${a.message}`);return}if(!s.ok){r((await s.text().catch(()=>"")).trim()||`HTTP ${s.status}`);return}r("Gmail OAuth client saved — click Connect"),je(),await be()}async function no(){if(!confirm("Remove the stored Google OAuth client? Connecting needs it re-entered (or set via env)."))return;let e;try{e=await fetch("/api/gmail/config",{method:"DELETE"})}catch(t){r(`remove failed: ${t.message}`);return}if(!e.ok){r((await e.text().catch(()=>"")).trim()||`HTTP ${e.status}`);return}r("OAuth client removed"),je(),await be()}function Qn(){const e=c.anthropicKey||{},t=document.getElementById("key-status");t&&(t.textContent=e.key_source==="db"?"A key is set here (stored in scout).":e.key_source==="env"?"Using the ANTHROPIC_API_KEY environment variable. Saving a key here overrides it.":"No key set. Scoring, capture, and outreach are disabled until you add one.");const n=document.getElementById("key-remove");n&&(n.style.display=e.key_source==="db"?"":"none");const s=document.getElementById("key-restart-hint");if(s){const a=e.has_key&&c.meta&&(c.meta.outreach===!1||c.meta.chat===!1);s.style.display=a?"":"none"}}function Ot(){document.getElementById("key-scrim").classList.remove("open")}async function Xn(){const e=(document.getElementById("key-input").value||"").trim();if(!e){r("paste a key first");return}const t=document.getElementById("key-save");t&&(t.disabled=!0,t.textContent="Verifying…");const n=()=>{t&&(t.disabled=!1,t.textContent="Save key")};let s;try{s=await fetch("/api/integrations/anthropic",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:e})})}catch(a){r(`save failed: ${a.message}`),n();return}if(!s.ok){r((await s.text().catch(()=>"")).trim()||`HTTP ${s.status}`),n();return}c.anthropicKey=await s.json(),document.getElementById("key-input").value="",n(),r("Anthropic key saved"),await Le(),Qn(),W()}async function so(){const e=document.getElementById("key-remove");e&&(e.disabled=!0);let t;try{t=await fetch("/api/integrations/anthropic",{method:"DELETE"})}catch(n){r(`remove failed: ${n.message}`),e&&(e.disabled=!1);return}if(e&&(e.disabled=!1),!t.ok){r((await t.text().catch(()=>"")).trim()||`HTTP ${t.status}`);return}c.anthropicKey=await t.json(),r(c.anthropicKey.has_key?"removed — using the environment key":"Anthropic key removed"),await Le(),Qn(),W()}async function ao(){const e=document.getElementById("refresh-profile");e&&(e.classList.add("spinning"),e.disabled=!0);let t;try{t=await fetch("/api/profile/refresh",{method:"POST"})}catch(n){r(`refresh failed: ${n.message}`),Mt();return}if(!t.ok){const n=await t.text().catch(()=>"");r(`refresh failed: ${(n||"").trim()||"HTTP "+t.status}`),Mt();return}c.profile=await t.json(),W(),r("company-fit brief refreshed"),C()}function Nt(){document.getElementById("profile-scrim").classList.remove("open")}document.getElementById("profile-modal-close").onclick=Nt,document.getElementById("profile-scrim").onclick=e=>{e.target.id==="profile-scrim"&&Nt()};function oo(){const e=document.querySelector("#docs-nav a");Xe(e?e.dataset.sec:null);const t=document.getElementById("docs-body");t&&(t.scrollTop=0)}function Xe(e){document.querySelectorAll("#docs-nav a").forEach(t=>t.classList.toggle("active",t.dataset.sec===e))}function io(e){const t=document.getElementById("doc-"+e);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),Xe(e)}document.getElementById("open-docs").onclick=()=>B("docs");function co(){B("settings")}document.getElementById("open-settings").onclick=co,document.getElementById("gmail-config-cancel").onclick=je,document.getElementById("gmail-config-save").onclick=to,document.getElementById("gmail-config-remove").onclick=no,document.getElementById("gmail-config-scrim").onclick=e=>{e.target.id==="gmail-config-scrim"&&je()};function lo(){const e=document.getElementById("notif-badge");if(!e)return;const t=(c.notifications&&c.notifications.unread)|0;t>0?(e.textContent=t>99?"99+":String(t),e.style.display=""):e.style.display="none"}async function oe(){try{c.notifications=await(await fetch("/api/notifications")).json()}catch{return}lo(),c.view==="inbox"&&es()}function ro(){return'<option value="">link to role…</option>'+(c.jobs||[]).map(t=>`<option value="${l(t.posting_id)}">${l((t.company||"")+" — "+(t.title||"(untitled)"))}</option>`).join("")}function uo(e){const t=e.company||e.role?`<div class="notif-ctx">${l([e.company,e.role].filter(Boolean).join(" · "))}</div>`:'<div class="notif-ctx dim">not linked to a role</div>',n=e.created_at?`<span class="notif-when">${l((e.created_at||"").replace("T"," ").slice(0,16))}</span>`:"",s=e.kind==="app_status"&&e.suggested_status&&!e.actioned&&e.posting_id?`<button class="btn btn-primary notif-apply" data-id="${e.id}">Apply: ${l(e.suggested_status)}</button>`:"",a=e.posting_id?"":`<select class="input notif-link" data-id="${e.id}" title="link this to a role">${ro()}</select>`;return`<div class="notif-item${e.seen?"":" is-unread"}" data-id="${e.id}" data-seen="${e.seen?1:0}">
    <div class="notif-main">
      <div class="notif-title">${e.seen?"":'<span class="notif-dot" aria-label="unread"></span>'}${l(e.title)}</div>
      ${t}
      ${e.detail?`<div class="notif-detail">${l(e.detail)}</div>`:""}
    </div>
    <div class="notif-side">${n}<div class="notif-acts">${s}${a}</div></div>
  </div>`}function po(e){return`<div class="notif-item notif-followup">
    <div class="notif-main">
      <div class="notif-title">Follow up: ${l(e.contact_name||"contact")}</div>
      <div class="notif-ctx">${l([e.company,e.role].filter(Boolean).join(" · "))}</div>
      <div class="notif-detail dim">due ${l(e.due_at||"")}</div>
    </div>
    <div class="notif-side"><button class="btn notif-open" data-pid="${l(e.posting_id)}">Open</button></div>
  </div>`}function es(){const e=document.getElementById("notifications-body");if(!e)return;const t=c.notifications||{notifications:[],followups:[]},n=t.notifications||[],s=t.followups||[];if(!n.length&&!s.length){e.innerHTML='<div class="cc-empty dim">Nothing here yet. Replies, application updates, and follow-ups show up as Gmail syncs.</div>';return}let a="";n.length&&(a+='<div class="settings-group-h">Updates</div>'+n.map(uo).join("")),s.length&&(a+='<div class="settings-group-h">Follow-ups due</div>'+s.map(po).join("")),e.innerHTML=a,mo()}function mo(){const e=document.getElementById("notifications-body");e&&(e.querySelectorAll(".notif-item[data-id]").forEach(t=>{const n=t.dataset.id,s=t.querySelector(".notif-main");s&&t.dataset.seen==="0"&&s.addEventListener("click",()=>ho(n))}),e.querySelectorAll(".notif-apply").forEach(t=>t.addEventListener("click",n=>{n.stopPropagation(),fo(t.dataset.id)})),e.querySelectorAll(".notif-link").forEach(t=>t.addEventListener("change",n=>{n.stopPropagation(),t.value&&go(t.dataset.id,t.value)})),e.querySelectorAll(".notif-open").forEach(t=>t.addEventListener("click",()=>{const n=t.dataset.pid;B("jobs"),dt(n)})))}async function ho(e){try{await fetch(`/api/notifications/${e}/seen`,{method:"POST"})}catch{return}await oe()}async function fo(e){let t;try{t=await fetch(`/api/notifications/${e}/apply`,{method:"POST"})}catch(s){r(`apply failed: ${s.message}`);return}if(!t.ok){r((await t.text().catch(()=>"")).trim()||`HTTP ${t.status}`);return}const n=await t.json().catch(()=>({}));r(`status set to ${n.applied||"updated"}`),await oe(),await E()}async function go(e,t){let n;try{n=await fetch(`/api/notifications/${e}/link`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({posting_id:t})})}catch(s){r(`link failed: ${s.message}`);return}if(!n.ok){r((await n.text().catch(()=>"")).trim()||`HTTP ${n.status}`);return}r("linked to role"),await oe()}async function yo(){const e=document.getElementById("notifications-sync");e&&(e.disabled=!0,e.textContent="Syncing…");try{const t=await fetch("/api/gmail/sync",{method:"POST"});r(t.ok?"synced":(await t.text().catch(()=>"")).trim()||`HTTP ${t.status}`)}catch(t){r(`sync failed: ${t.message}`)}e&&(e.disabled=!1,e.textContent="Sync now"),await oe(),await E()}document.getElementById("notifications-sync").onclick=yo,document.querySelectorAll("#docs-nav a").forEach(e=>{e.onclick=()=>{const t=document.getElementById("doc-"+e.dataset.sec);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),Xe(e.dataset.sec)}}),function(){const e=document.getElementById("docs-body");if(!e||!("IntersectionObserver"in window))return;const t=new IntersectionObserver(n=>{const s=n.filter(a=>a.isIntersecting).sort((a,o)=>a.boundingClientRect.top-o.boundingClientRect.top);s.length&&Xe(s[0].target.id.replace(/^doc-/,""))},{root:e,rootMargin:"0px 0px -65% 0px",threshold:0});document.querySelectorAll("#docs-body section").forEach(n=>t.observe(n))}(),c.chat={scope:null,scopeId:"",threadId:null,streaming:!1,es:null};function vo(e){return(e||[]).filter(t=>t&&t.type==="text").map(t=>t.text||"").join("")}function bo(e){return(e||[]).filter(t=>t&&t.type==="tool_use").map(t=>t.name)}function et(e){return e.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,(t,n,s)=>`<a href="${s}" target="_blank" rel="noopener noreferrer">${n}</a>`).replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g,"$1<em>$2</em>")}function wo(e){const t=String(e||"").split(`
`),n=[];let s=null;const a=()=>{s&&(n.push("</"+s+">"),s=null)};let o=0;for(;o<t.length;){const i=t[o];if(/^```/.test(i)){a(),o++;const f=[];for(;o<t.length&&!/^```/.test(t[o]);)f.push(t[o]),o++;o++,n.push("<pre><code>"+l(f.join(`
`))+"</code></pre>");continue}const d=i.match(/^(#{1,6})\s+(.*)$/);if(d){a();const f=d[1].length;n.push("<h"+f+">"+et(l(d[2]))+"</h"+f+">"),o++;continue}const u=i.match(/^\s*[-*]\s+(.*)$/);if(u){s!=="ul"&&(a(),n.push("<ul>"),s="ul"),n.push("<li>"+et(l(u[1]))+"</li>"),o++;continue}const p=i.match(/^\s*\d+\.\s+(.*)$/);if(p){s!=="ol"&&(a(),n.push("<ol>"),s="ol"),n.push("<li>"+et(l(p[1]))+"</li>"),o++;continue}if(i.trim()===""){a(),o++;continue}a();const m=[];for(;o<t.length&&t[o].trim()!==""&&!/^```|^#{1,6}\s|^\s*[-*]\s+|^\s*\d+\.\s+/.test(t[o]);)m.push(et(l(t[o]))),o++;n.push("<p>"+m.join("<br>")+"</p>")}return a(),n.join("")}function tt(e,t){const n=document.createElement("div");return n.className="chat-msg chat-"+e,e==="assistant"?n.innerHTML=wo(t||""):n.textContent=t||"",n}function Rt(){const e=document.getElementById("chat-messages");e.scrollTop=e.scrollHeight}function ko(){const e=document.createElement("div");return e.className="chat-empty",e.textContent=c.chat.scope==="global"?"Tell me about a job you applied to (paste the link), or ask what's already tracked.":"Ask about this "+(c.chat.scope==="company"?"company":"role")+" — I can research it on the web and update scout.",e}function ts(e){const t=document.getElementById("chat-messages");t.innerHTML="";for(const n of e||[]){const s=vo(n.content);if(n.role==="user")s&&t.appendChild(tt("user",s));else if(n.role==="assistant"){const a=bo(n.content);if(!s&&!a.length)continue;const o=tt("assistant",s);if(a.length){const i=document.createElement("div");i.className="chat-tools",i.textContent="· used "+a.join(", "),o.appendChild(i)}t.appendChild(o)}}t.children.length||t.appendChild(ko()),Rt()}async function Dt(e,t,n){if(!c.meta||!c.meta.chat){r("chat needs ANTHROPIC_API_KEY in the server env");return}c.chat.es&&(c.chat.es.close(),c.chat.es=null),c.chat={scope:e,scopeId:t||"",threadId:null,streaming:!1,es:null},document.getElementById("chat-title").textContent=e==="global"?"Chat":e==="company"?"Chat · company":"Chat · role",document.getElementById("chat-sub").textContent=e==="global"?"":n||"";const s=document.getElementById("chat-messages");s.innerHTML='<div class="chat-empty">loading…</div>';const a=document.getElementById("chat-pane");a.classList.add("open"),document.getElementById("chat-scrim").classList.add("open"),a.setAttribute("aria-hidden","false");try{const o="scope="+encodeURIComponent(e)+(t?"&scope_id="+encodeURIComponent(t):""),i=await fetch("/api/chat/threads?"+o);if(!i.ok)throw new Error((await i.text().catch(()=>"")).trim()||"HTTP "+i.status);const d=await i.json();c.chat.threadId=d.thread.id,ts(d.messages||[])}catch(o){s.innerHTML='<div class="chat-empty">Failed to open chat: '+l(o.message)+"</div>";return}document.getElementById("chat-input").focus()}function Ut(){c.chat.es&&(c.chat.es.close(),c.chat.es=null);const e=document.getElementById("chat-pane");e.classList.remove("open"),document.getElementById("chat-scrim").classList.remove("open"),e.setAttribute("aria-hidden","true")}function nt(e){c.chat.streaming=e,document.getElementById("chat-send").disabled=e;const t=document.getElementById("chat-input");t.disabled=e,e||t.focus()}function ns(){const e=document.getElementById("chat-input");e.style.height="auto",e.style.height=Math.min(e.scrollHeight,160)+"px"}async function ss(){const e=document.getElementById("chat-input"),t=e.value.trim();if(!t||c.chat.streaming||!c.chat.threadId)return;e.value="",ns(),nt(!0);const n=document.getElementById("chat-messages"),s=n.querySelector(".chat-empty");s&&s.remove(),n.appendChild(tt("user",t));const a=tt("assistant","");a.classList.add("chat-streaming"),n.appendChild(a),Rt();let o="";const i=m=>{a.classList.remove("chat-streaming"),a.textContent="⚠ "+m,nt(!1)},d=c.chat.threadId;let u;try{u=await fetch("/api/chat/"+d+"/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t})})}catch(m){i(m.message);return}if(!u.ok){i((await u.text().catch(()=>"")).trim()||"HTTP "+u.status);return}const p=new EventSource("/api/chat/"+d+"/stream");c.chat.es=p,p.addEventListener("delta",m=>{o+=m.data,a.textContent=o,Rt()}),p.addEventListener("end",async m=>{p.close(),c.chat.es===p&&(c.chat.es=null),a.classList.remove("chat-streaming"),nt(!1),c.chat.threadId===d&&await Eo(),$o(),typeof m.data=="string"&&m.data.indexOf("error")===0&&r("chat: "+m.data)}),p.onerror=()=>{p.close(),c.chat.es===p&&(c.chat.es=null),a.classList.remove("chat-streaming"),nt(!1)}}async function Eo(){const e=c.chat.scope,t=c.chat.scopeId,n="scope="+encodeURIComponent(e)+(t?"&scope_id="+encodeURIComponent(t):"");try{const s=await fetch("/api/chat/threads?"+n);if(!s.ok)return;const a=await s.json();ts(a.messages||[])}catch{}}function $o(){O(),E(),C(),c.openId&&ye(c.openId)}document.getElementById("open-chat").onclick=()=>Dt("global","",""),document.getElementById("chat-close").onclick=Ut,document.getElementById("chat-scrim").onclick=Ut,document.getElementById("chat-form").addEventListener("submit",e=>{e.preventDefault(),ss()}),document.getElementById("chat-input").addEventListener("input",ns),document.getElementById("chat-input").addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),ss())}),Qt("#t tbody",rs),Qt("#jt tbody",ds);const xo=(()=>{try{return localStorage.getItem("scout-view")}catch{return null}})();B(xo==="jobs"?"jobs":"companies",{render:!1});function as(){const e=document.querySelector(".layout");e&&(e.style.transform="translateZ(0)",requestAnimationFrame(()=>requestAnimationFrame(()=>{e.style.transform=""})))}document.addEventListener("visibilitychange",()=>{document.hidden||as()}),window.addEventListener("pageshow",e=>{e.persisted&&as()}),O(),E(),C(),Le(),$t(),Mt(),Ht(),be(),oe(),setInterval(oe,9e4),P(),function(){const t=/[?&]gmail=(connected|error)/.exec(location.search);t&&(r(t[1]==="connected"?"Gmail connected":"Gmail connection failed"),history.replaceState(null,"",location.pathname+location.hash))}()}To({"":{view:()=>({mount(w){w.innerHTML=Mo,Ao()}}),chrome:!1}},{title:"scout"});Co();jo();
