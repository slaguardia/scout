(function(){const v=document.createElement("link").relList;if(v&&v.supports&&v.supports("modulepreload"))return;for(const y of document.querySelectorAll('link[rel="modulepreload"]'))i(y);new MutationObserver(y=>{for(const I of y)if(I.type==="childList")for(const c of I.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&i(c)}).observe(document,{childList:!0,subtree:!0});function E(y){const I={};return y.integrity&&(I.integrity=y.integrity),y.referrerPolicy&&(I.referrerPolicy=y.referrerPolicy),y.crossOrigin==="use-credentials"?I.credentials="include":y.crossOrigin==="anonymous"?I.credentials="omit":I.credentials="same-origin",I}function i(y){if(y.ep)return;y.ep=!0;const I=E(y);fetch(y.href,I)}})();function wo(b,v){const E=v.replace(/^#/,"");let i=null;for(const y of Object.keys(b))(E===y||E.startsWith(y))&&(i===null||y.length>i.length)&&(i=y);return i===null&&""in b&&(i=""),i}function ko(b){return typeof b=="function"?{view:b,chrome:!0}:{view:b.view,chrome:b.chrome!==!1}}function Eo(b,v={}){const E=v.root??document.body,i=v.title??document.title??"",y=v.brandHref??"#",I=document.createElement("main"),c=document.createElement("header");c.className="cap-head";const j=document.createElement("a");j.className="brand",j.href=y,j.textContent=i,j.setAttribute("aria-label",`${i} — home`),c.appendChild(j);const P=document.createElement("nav");P.className="cap-nav",P.setAttribute("aria-label","Views");for(const M of v.nav??[]){const q=document.createElement("a");q.href=M.href,q.textContent=M.label,M.ariaLabel&&q.setAttribute("aria-label",M.ariaLabel),P.appendChild(q)}c.appendChild(P);const k=document.createElement("section");k.className="tk-content",I.appendChild(c),I.appendChild(k);const F=document.createElement("div");F.className="tk-bleed";const ne=M=>{var q;for(const T of Array.from(P.querySelectorAll("a"))){const ae=((q=T.getAttribute("href"))==null?void 0:q.replace(/^#/,""))??"";T.toggleAttribute("aria-current",M!==null&&M!==""&&ae===M),T.hasAttribute("aria-current")&&T.setAttribute("aria-current","page")}};let $e=0;const Ae=()=>{const M=wo(b,location.hash);if(ne(M),M===null){F.isConnected&&F.remove(),I.isConnected||E.appendChild(I),$o(k,"Not found.");return}const{view:q,chrome:T}=ko(b[M]),ae=T?k:F;T?(F.isConnected&&F.remove(),I.isConnected||E.appendChild(I)):(I.isConnected&&I.remove(),F.isConnected||E.appendChild(F)),ae.replaceChildren();const st=q(),He=++$e,Ie=st.mount(ae);Ie instanceof Promise&&Ie.catch(J=>{He===$e&&Io(ae,String(J))})};window.addEventListener("hashchange",Ae),Ae()}function $o(b,v){b.replaceChildren();const E=document.createElement("div");E.className="tk-empty",E.textContent=v,b.appendChild(E)}function Io(b,v){b.replaceChildren();const E=document.createElement("div");E.className="tk-error",E.textContent=v,b.appendChild(E)}function xo(){if(!("serviceWorker"in navigator))return;if(["localhost","127.0.0.1","[::1]",""].includes(location.hostname)){navigator.serviceWorker.getRegistrations().then(v=>{for(const E of v)E.unregister()}),window.caches&&caches.keys().then(v=>{for(const E of v)caches.delete(E)});return}window.addEventListener("load",()=>{navigator.serviceWorker.register("/sw.js").catch(()=>{})})}async function Lo(){let b;try{b=await fetch("/api/me",{headers:{Accept:"application/json"}})}catch{return null}if(!b.ok)return null;let v;try{v=await b.json()}catch{return null}return typeof v.email=="string"&&v.email?{email:v.email}:null}const _o=`
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
        <span>Settings</span>
      </button>
      <button class="doc-btn foot-btn" id="open-docs" title="How scout works — ingestion, prompts, files, triage" aria-label="how it works">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 11.5v.01M6.4 6.2a1.6 1.6 0 1 1 2.4 1.5c-.5.3-.8.6-.8 1.3"/></svg>
        <span>How it works</span>
      </button>
      <button class="doc-btn foot-btn" id="open-notifications" title="Inbox — replies, application updates, follow-ups due" aria-label="notifications">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 7a3.8 3.8 0 0 1 7.6 0c0 3 1.2 4 1.2 4H3s1.2-1 1.2-4z"/><path d="M6.7 13a1.5 1.5 0 0 0 2.6 0"/></svg>
        <span>Inbox</span>
        <span class="notif-badge" id="notif-badge" style="display:none">0</span>
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

<!-- pre-filter rules — the structured form editor for the mechanical gate -->
<div class="modal-scrim" id="prefilter-scrim">
  <div class="modal modal-prefilter">
    <div class="modal-head">
      <div class="modal-head-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h12M4 8h8M6.5 12.5h3"/></svg>
      </div>
      <div class="modal-head-text">
        <h2>Pre-filter</h2>
        <div class="modal-head-sub">A cheap, no-LLM gate that runs <strong>before</strong> a bulk verdict run, so the paid model only scores companies worth a closer look.</div>
      </div>
    </div>
    <div class="modal-body">
      <label class="pf-master">
        <input type="checkbox" id="pf-enabled" />
        <span class="pf-master-text">
          <strong>Run the pre-filter on bulk runs</strong>
          <span class="pf-master-sub">Off → a bulk run scores every company (the rules below are kept either way).</span>
        </span>
      </label>

      <div class="modal-note pf-intro">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.5" stroke-linecap="round"/></svg>
        <span>These rules only narrow <strong>bulk</strong> verdict runs. Re-scoring one company by hand always runs the LLM and ignores them. The pre-filter never deletes, hides, or stops fetching anything — it only decides who a bulk run pays the model to judge.</span>
      </div>

      <section class="pf-sec">
        <h3 class="pf-h">Location</h3>
        <p class="pf-help">A company passes if its location contains any of these. Add cities, regions, or “remote”.</p>
        <div class="pf-chips" data-field="location.allowed"></div>
        <label class="pf-check">
          <input type="checkbox" id="pf-remote-ok" />
          <span>Also pass companies with no location listed, or marked remote.</span>
        </label>
      </section>

      <section class="pf-sec">
        <h3 class="pf-h">Headcount</h3>
        <p class="pf-help">Pass only companies within this size range. Set a bound to <strong>0</strong> for no limit; companies with no headcount data always pass.</p>
        <div class="pf-range">
          <label>min <input type="number" id="pf-hc-min" class="input" min="0" step="1" /></label>
          <span class="pf-range-dash">–</span>
          <label>max <input type="number" id="pf-hc-max" class="input" min="0" step="1" /></label>
        </div>
      </section>

      <section class="pf-sec">
        <h3 class="pf-h">Industry / vertical</h3>
        <p class="pf-help">Matches whole category tags from your data (a company’s vertical is a list like “Health&nbsp;Care, Software”). Start typing to pick a tag — selecting “Health&nbsp;Care” never touches “Health&nbsp;Insurance”.</p>
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
    </div>
    <div class="modal-foot">
      <button class="btn" id="pf-reset" title="discard your edits and restore the built-in default rules">Reset to default</button>
      <button class="btn" id="pf-cancel">Cancel</button>
      <button class="btn btn-primary" id="pf-save">Save</button>
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

<!-- the notifications / inbox panel: Gmail replies, application-status updates,
     and follow-ups due (M55) -->
<div class="modal-scrim" id="notifications-scrim">
  <div class="modal modal-settings">
    <div class="modal-head">
      <div class="modal-head-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 7a3.8 3.8 0 0 1 7.6 0c0 3 1.2 4 1.2 4H3s1.2-1 1.2-4z"/><path d="M6.7 13a1.5 1.5 0 0 0 2.6 0"/></svg>
      </div>
      <div class="modal-head-text">
        <h2>Inbox</h2>
        <div class="modal-head-sub">Replies, application updates, and follow-ups due — synced from Gmail.</div>
      </div>
    </div>
    <div class="modal-body">
      <div id="notifications-body"><div class="loading-row"><span class="spinner"></span><span>loading…</span></div></div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="notifications-sync" title="check Gmail now for new mail">Sync now</button>
      <button class="btn" id="notifications-close">Close</button>
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
`;function Bo(b){const v={k:"verdict",dir:1},E={k:"created_at",dir:1},i={rows:[],sort:{...v},openId:null,stats:null,profile:null,view:"companies",jobs:[],jsort:{...E},applicationStages:["applied","screening","interview","offer","rejected"],outreachStatuses:["initial contact","no response","replied","followed up"],followupInterval:5,followupTemplate:"",openDetail:null,anthropicKey:null,gmail:null,notifications:{notifications:[],unread:0,followups:[]}},y=e=>"pill pill-"+(e||"none"),I='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 14V2.5"/><path d="M3.5 2.5c3-1.2 6 1.2 9 0V9c-3 1.2-6-1.2-9 0z"/></svg>',c=e=>String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),j=e=>/^https?:\/\//i.test(String(e??""))?c(e):"#";async function P(){const t=await(await fetch("/api/companies")).json();i.rows=t.rows||[],K()}async function k(){let e;try{const t=await fetch("/api/postings");if(!t.ok)return;e=await t.json()}catch{return}i.jobs=e.rows||[],A(),F(),$e()}function F(){if(!m.postingId)return;const e=i.jobs.find(t=>t.posting_id===m.postingId);e&&(m.row=e,document.getElementById("pursuit-pane").classList.contains("open")&&oe())}let ne=null;function $e(){const e=i.jobs.some(t=>t.outreach_draft_status==="researching");e&&!ne?ne=setInterval(Ae,4e3):!e&&ne&&(clearInterval(ne),ne=null)}async function Ae(){let e;try{const s=await fetch("/api/postings");if(!s.ok)return;e=await s.json()}catch{return}const t=e.rows||[],n=new Map(i.jobs.map(s=>[s.posting_id,s.outreach_draft_status])),a=t.some(s=>n.get(s.posting_id)!==s.outreach_draft_status)||t.length!==i.jobs.length;i.jobs=t,a&&(A(),F()),$e()}async function M(){await Promise.all([fetch("/api/application-stages").then(e=>e.ok?e.json():null).then(e=>{e&&Array.isArray(e.statuses)&&e.statuses.length&&(i.applicationStages=e.statuses)}).catch(()=>{}),fetch("/api/outreach-statuses").then(e=>e.ok?e.json():null).then(e=>{e&&Array.isArray(e.statuses)&&e.statuses.length&&(i.outreachStatuses=e.statuses)}).catch(()=>{}),fetch("/api/followup-interval").then(e=>e.ok?e.json():null).then(e=>{e&&Number.isInteger(e.days)&&(i.followupInterval=e.days)}).catch(()=>{}),fetch("/api/followup-template").then(e=>e.ok?e.json():null).then(e=>{e&&typeof e.content=="string"&&(i.followupTemplate=e.content)}).catch(()=>{})]),on(),i.view==="jobs"&&A()}function q(e,{render:t=!0}={}){i.view=e;try{localStorage.setItem("scout-view",e)}catch{}document.getElementById("tab-companies").classList.toggle("active",e==="companies"),document.getElementById("tab-jobs").classList.toggle("active",e==="jobs"),document.getElementById("companies-view").style.display=e==="companies"?"":"none",document.getElementById("jobs-view").style.display=e==="jobs"?"":"none",document.getElementById("block-filter-companies").style.display=e==="companies"?"":"none",document.getElementById("block-filter-jobs").style.display=e==="jobs"?"":"none",Xt(),t&&(e==="jobs"?A():K())}async function T(){let e;try{const t=await fetch("/api/stats");if(!t.ok)throw new Error(`HTTP ${t.status}`);e=await t.json()}catch(t){console.warn(`stats failed: ${t.message}`);return}i.stats=e,ae()}function ae(){te()}function st(e,t,n){const a=e[n]??"",s=t[n]??"";if(n==="headcount")return(a|0)-(s|0);if(n==="verdict"){const o={yes:0,maybe:1,no:2,"":3};return(o[a]??3)-(o[s]??3)}return String(a).localeCompare(String(s))}function He(e){return e.slice().sort((t,n)=>i.sort.dir*st(t,n,i.sort.k))}function Ie(e,t,n){document.querySelectorAll(`#${e} thead th[${t}]`).forEach(a=>{a.getAttribute(t)===n.k?a.dataset.sort=n.dir<0?"desc":"asc":delete a.dataset.sort})}const J=new Set;let le=!1,de=!1;const ua=[["yes","yes","fdrop-dot--yes"],["maybe","maybe","fdrop-dot--maybe"],["no","no","fdrop-dot--no"],["__none__","unscored","fdrop-dot--none"]];function pa(){const e=document.getElementById("fdrop-cfilters-menu");e&&(e.innerHTML='<div class="fdrop-head">Verdict</div>'+ua.map(([t,n,a])=>Z("data-v",t,n,a,J.has(t))).join("")+'<div class="fdrop-sep"></div><div class="fdrop-head">Flags</div>'+Z("data-toggle","flagged","⚑ Flagged","",le)+Z("data-toggle","enriched","Enriched","",de),Kt())}function Kt(){const e={yes:0,maybe:0,no:0,__none__:0};let t=0,n=0;for(const r of i.rows){const d=r.verdict||"__none__";e[d]=(e[d]|0)+1,r.flagged&&t++,r.enriched&&n++}ct("#fdrop-cfilters-menu [data-v]","data-v",e);const a=document.querySelector('#fdrop-cfilters-menu [data-toggle="flagged"] [data-count]');a&&(a.textContent=t||"");const s=document.querySelector('#fdrop-cfilters-menu [data-toggle="enriched"] [data-count]');s&&(s.textContent=n||"");const o=J.size+(le?1:0)+(de?1:0);rn("fdrop-cfilters-btn",o,o>0)}function Wt(){const e=document.getElementById("q").value.trim().toLowerCase();return i.rows.filter(t=>!(J.size&&!J.has(t.verdict||"__none__")||le&&!t.flagged||de&&!t.enriched||e&&!(t.name+" "+(t.vertical||"")+" "+(t.reason||"")).toLowerCase().includes(e)))}const ma=[{k:"flag",label:"flag"},{k:"verdict",label:"verdict"},{k:"reason",label:"reason"},{k:"vertical",label:"vertical"},{k:"location",label:"location"},{k:"hc",label:"hc"},{k:"stage",label:"stage"},{k:"reviewed",label:"reviewed"},{k:"site",label:"site"}],ha=[{k:"application",label:"application"},{k:"outreach",label:"outreach"},{k:"last_outreach",label:"last outreach"},{k:"contacts",label:"contacts"},{k:"link",label:"link"}];function Yt(e){try{return new Set(JSON.parse(localStorage.getItem(e)||"[]"))}catch{return new Set}}const Zt=Yt("scout-hidden-cols"),Qt=Yt("scout-hidden-jcols");function ot(){return i.view==="jobs"?{cols:ha,hidden:Qt,key:"scout-hidden-jcols"}:{cols:ma,hidden:Zt,key:"scout-hidden-cols"}}function ue(){document.querySelectorAll("#t [data-col]").forEach(e=>{e.style.display=Zt.has(e.dataset.col)?"none":""}),document.querySelectorAll("#jt [data-col]").forEach(e=>{e.style.display=Qt.has(e.dataset.col)?"none":""})}function Xt(){const e=ot(),t=document.getElementById("fdrop-columns-menu");t&&(t.innerHTML='<div class="fdrop-head">Visible columns</div>'+e.cols.map(n=>Z("data-col",n.k,n.label,"",!e.hidden.has(n.k))).join(""),en())}function en(){const e=ot(),t=e.cols.filter(a=>e.hidden.has(a.k)).length,n=document.querySelector("#fdrop-columns-btn .fdrop-count");n&&(n.textContent=t||"",n.style.display=t?"":"none")}function tn(e){return`
      <td class="td-flag" data-col="flag"><button class="flag-btn${e.flagged?" is-on":""}" data-id="${e.company_id}" title="${e.flagged?"unflag":"flag"}">${I}</button></td>
      <td data-col="verdict"><span class="${y(e.verdict)}">${c(e.verdict||"—")}</span></td>
      <td><span class="row-name" data-id="${e.company_id}">${c(e.name)}</span></td>
      <td class="reason" data-col="reason">${c(e.reason||"")}</td>
      <td data-col="vertical">${c(e.vertical||"")}</td>
      <td data-col="location">${c(e.location||"")}</td>
      <td data-col="hc">${e.headcount||""}</td>
      <td data-col="stage">${c(e.stage||"")}</td>
      <td data-col="reviewed" class="muted" title="${c(e.reviewed_at||"never reviewed")}">${e.reviewed_at?c(e.reviewed_at.slice(0,10)):"—"}</td>
      <td data-col="site">${e.website_url?`<a href="${j(e.website_url)}" target="_blank" rel="noopener" title="open website" aria-label="open website">↗</a>`:""}</td>
    `}function nn(e){const t=e.querySelector(".flag-btn");t&&t.addEventListener("click",()=>Pn(t.dataset.id))}const fa=[["flag","14px"],["verdict","46px"],[null,"62%"],["reason","85%"],["vertical","70%"],["location","60%"],["hc","26px"],["stage","55%"],["reviewed","44px"],["site","38px"]],ga=[[null,"72%"],["applied","58px"],["response","54px"],["outreach","22px"],["last_outreach","58px"],["contacts","55%"],["link","32px"]];function an(e,t,n=7){const a=document.querySelector(e);if(!a)return;const s=[1,.82,.7,.95,.76,.9,.85];let o="";for(let r=0;r<n;r++){const d=t.map(([u,p])=>{const h=p.endsWith("%")?Math.round(parseFloat(p)*s[r%s.length])+"%":p;return`<td${u?` data-col="${u}"`:""}><span class="skel" style="width:${h}"></span></td>`}).join("");o+=`<tr class="skel-row" aria-hidden="true">${d}</tr>`}a.innerHTML=o,ue()}function K(){const e=document.querySelector("#t tbody");e.innerHTML="";const t=He(Wt());Kt(),document.getElementById("empty").style.display=t.length?"none":"block";for(const n of t){const a=document.createElement("tr");a.dataset.id=n.company_id,a.innerHTML=tn(n),a.addEventListener("click",s=>{s.target.closest("a, .flag-btn")||be(a.dataset.id)}),e.appendChild(a),nn(a)}Ie("t","data-k",i.sort),ue()}async function ya(e){const n=await(await fetch("/api/companies")).json();i.rows=n.rows||[];const a=document.querySelector("#t tbody"),s=He(Wt()).map(r=>r.company_id),o=[...a.querySelectorAll("tr")].map(r=>r.dataset.id);if(s.length!==o.length||s.some((r,d)=>r!==o[d])){K();return}for(const r of e){const d=i.rows.find(p=>p.company_id===r),u=a.querySelector(`tr[data-id="${CSS.escape(r)}"]`);if(!d||!u){K();return}u.innerHTML=tn(d),nn(u)}ue()}let _=null,it=null,pe=!1,me=!1;const Y=new Set;function sn(){const e=i.applicationStages;if(_===null)_=new Set(["",...e.filter(t=>t!=="rejected")]);else{for(const t of[..._])t!==""&&!e.includes(t)&&_.delete(t);if(it)for(const t of e)t!=="rejected"&&!it.has(t)&&_.add(t)}it=new Set(e)}function va(){sn();const e=document.getElementById("jq").value.trim().toLowerCase();return i.jobs.filter(t=>{const n=t.application_status||"";return!(!_.has(n)||pe&&!t.next_up||me&&!(t.followups_due|0)||Y.size&&!Y.has(t.outreach_status||"")||e&&!(t.title+" "+t.company+" "+(t.location||"")+" "+(t.description||"")+" "+(t.contacts||"")).toLowerCase().includes(e))})}function Z(e,t,n,a,s){return`<button class="fdrop-item${s?" is-checked":""}" ${e}="${c(t)}" role="menuitemcheckbox" aria-checked="${s}"><span class="fdrop-check" aria-hidden="true"></span>`+(a?`<span class="fdrop-dot ${a}"></span>`:"")+`<span class="fdrop-label">${c(n)}</span><span class="fdrop-item-count" data-count></span></button>`}function on(){sn();const e=document.getElementById("fdrop-jfilters-menu");e&&(e.innerHTML='<div class="fdrop-head">Application stage</div>'+Z("data-stage","","not applied","",_.has(""))+i.applicationStages.map(t=>Z("data-stage",t,t,qe(t),_.has(t))).join("")+'<div class="fdrop-sep"></div><div class="fdrop-head">Outreach queue</div>'+Z("data-toggle","nextup","★ Next up","",pe)+'<div class="fdrop-sep"></div><div class="fdrop-head">Reply status</div>'+[["","none",""]].concat(i.outreachStatuses.map(t=>[t,t,hn(t)])).map(([t,n,a])=>Z("data-status",t,n,a,Y.has(t))).join(""),cn())}function cn(){const e={},t={};let n=0;for(const r of i.jobs){const d=r.application_status||"";e[d]=(e[d]|0)+1;const u=r.outreach_status||"";t[u]=(t[u]|0)+1,r.next_up&&n++}ct("#fdrop-jfilters-menu [data-stage]","data-stage",e),ct("#fdrop-jfilters-menu [data-status]","data-status",t),ba("nextup",n);const a=["",...i.applicationStages.filter(r=>r!=="rejected")],o=(_&&_.size===a.length&&a.every(r=>_.has(r))?0:_?_.size:0)+(pe?1:0)+Y.size;rn("fdrop-jfilters-btn",o,o>0)}function ct(e,t,n){document.querySelectorAll(e).forEach(a=>{const s=a.querySelector("[data-count]");if(s){const o=n[a.getAttribute(t)]|0;s.textContent=o||""}})}function ba(e,t){const n=document.querySelector(`#fdrop-jfilters-menu [data-toggle="${e}"] [data-count]`);n&&(n.textContent=t||"")}function rn(e,t,n){const a=document.getElementById(e);if(!a)return;a.classList.toggle("is-active",n);const s=a.querySelector(".fdrop-count");if(s){const o=n&&t>0;s.textContent=o?t:"",s.style.display=o?"":"none"}}function se(e,t){e.classList.toggle("is-checked",t),e.setAttribute("aria-checked",String(t))}function rt(){document.querySelectorAll(".fdrop.is-open").forEach(e=>{e.classList.remove("is-open");const t=e.querySelector(".fdrop-btn");t&&t.setAttribute("aria-expanded","false")})}function ln(e){const t=e.querySelector(".fdrop-btn"),n=e.querySelector(".fdrop-menu");if(!t||!n)return;const a=t.getBoundingClientRect();n.style.left=Math.round(a.left)+"px",n.style.top=Math.round(a.bottom+4)+"px",n.style.minWidth=Math.round(a.width)+"px",n.style.maxHeight=Math.max(160,Math.round(window.innerHeight-a.bottom-12))+"px"}function wa(e){const t=e.querySelector(".fdrop-btn");e.classList.add("is-open"),t&&t.setAttribute("aria-expanded","true"),ln(e)}function dn(){const e=document.querySelector(".fdrop.is-open");e&&ln(e)}window.addEventListener("scroll",dn,!0),window.addEventListener("resize",dn);const ka=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;function Ea(e){if(e=String(e||"").trim(),!e)return[];if(e[0]==="[")try{const t=JSON.parse(e);if(Array.isArray(t))return t.map(n=>({position:String((n==null?void 0:n.position)||"").trim(),email:String((n==null?void 0:n.email)||"").trim()})).filter(n=>n.position||n.email)}catch{}return e.split(",").map(t=>t.trim()).filter(Boolean).map(t=>{const n=t.match(ka),a=n?n[0]:"";let s=a?t.replace(a,""):t;return s=s.replace(/[<>()]/g,"").replace(/[\s:–—-]+$/,"").trim(),{position:s,email:a}})}const Pe=()=>new Date().toISOString().slice(0,10);function un(e){const t=[["","none"]];for(const n of i.applicationStages)t.push([n,n]);return e&&!i.applicationStages.includes(e)&&t.push([e,e+" (removed)"]),t}function pn(e){const t=[["","none"]];for(const n of i.outreachStatuses)t.push([n,n]);return e&&!i.outreachStatuses.includes(e)&&t.push([e,e+" (removed)"]),t}const $a=8;function mn(e,t){const n=(t||[]).indexOf(e);return n<0?"":"sc-"+n%$a}function qe(e){return mn(e,i.applicationStages)}function hn(e){return mn(e,i.outreachStatuses)}function Ia(e){const t=Ea(e);return t.length?t.map(n=>{const a=c(n.position||n.email);if(!n.email)return a;const s=c(n.position?`${n.position} — ${n.email}`:n.email);return`<a href="mailto:${c(n.email)}" title="${s}">${a}</a>`}).join('<span class="dim">, </span>'):'<span class="dim">—</span>'}function fn(e){const t=e.application_status||"";if(!t)return i.applicationStages.length+1;const n=i.applicationStages.indexOf(t);return n<0?i.applicationStages.length:n}function xa(e,t,n){if(n==="verdict"){const a={yes:0,maybe:1,no:2,"":3};return(a[e.verdict]??3)-(a[t.verdict]??3)}if(n==="application")return fn(e)-fn(t);if(n==="followups_due")return(t.followups_due|0)-(e.followups_due|0);if(n==="created_at"||n==="last_outreach_at"){const a=e[n]||"",s=t[n]||"";return!a&&!s?0:a?s?String(s).localeCompare(String(a)):-i.jsort.dir:i.jsort.dir}return String(e[n]??"").localeCompare(String(t[n]??""))}function La(){const e=document.getElementById("jobs-followup-nav");if(!e)return;const t=i.jobs.reduce((n,a)=>n+(a.followups_due|0),0);if(!t){e.style.display="none",me=!1;return}e.style.display="",e.innerHTML=`<button class="followup-nav-btn${me?" is-active":""}" title="${me?"showing only these — click to show all jobs":"show only jobs owing a follow-up"}"><span class="fn-icon">${Xe}</span><span class="fn-text"><strong>${t}</strong> follow-up${t>1?"s":""} due</span></button>`,e.querySelector(".followup-nav-btn").onclick=()=>{me=!me,A()}}function A(){const e=document.querySelector("#jt tbody");e.innerHTML="",La();const t=va().sort((s,o)=>i.jsort.dir*xa(s,o,i.jsort.k));document.getElementById("jobs-empty").style.display=t.length?"none":"block",cn();const n=_&&!_.has("rejected")?i.jobs.filter(s=>(s.application_status||"")==="rejected").length:0,a=document.getElementById("jobs-hidden-note");a.style.display=n?"":"none",n&&(a.innerHTML=`${n} rejected application${n>1?"s":""} hidden — <a id="show-rejected-link">show</a>`,document.getElementById("show-rejected-link").onclick=()=>{_.add("rejected"),on(),A()});for(const s of t){const o=s.application_status||"",r=document.createElement("tr");r.dataset.id=s.posting_id;const d=un(o).map(([h,f])=>`<option value="${c(h)}"${o===h?" selected":""}>${c(f)}</option>`).join(""),u=s.outreach_status||"",p=pn(u).map(([h,f])=>`<option value="${c(h)}"${u===h?" selected":""}>${c(f)}</option>`).join("");r.innerHTML=`
      <td><div class="jt-namecell"><button class="jt-nextup${s.next_up?" is-on":""}" title="${s.next_up?"queued next up for outreach — click to remove":"mark next up for outreach"}" aria-label="next up"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7"/></svg></button><div class="jt-namecol"><span class="row-name">${c(s.title||s.company)}</span>${_a(s.outreach_draft_status)}${s.title?`<div class="small dim">${c(s.company)}</div>`:""}</div></div></td>
      <td data-col="application"><div class="jt-stage"><select class="jt-stage-sel ${qe(o)}" title="application stage">${d}</select></div></td>
      <td class="small" data-col="outreach"><div class="jt-out"><select class="jt-ostatus ${hn(u)}" title="outreach reply status">${p}</select>${s.followups_due?`<span class="followup-badge" title="${s.followups_due} follow-up${s.followups_due>1?"s":""} due — open to act">${Xe}${s.followups_due}</span>`:""}</div></td>
      <td class="small" data-col="last_outreach">${s.last_outreach_at?c(s.last_outreach_at):'<span class="dim">—</span>'}</td>
      <td class="small td-contacts" data-col="contacts">${Ia(s.contacts)}</td>
      <td data-col="link"><a href="${j(s.url)}" target="_blank" rel="noopener" title="open posting" aria-label="open posting">↗</a></td>
    `,r.querySelector(".jt-nextup").onclick=()=>$n(s,!1),r.querySelector(".jt-stage-sel").onchange=h=>Ln(s,{application_status:h.target.value}),r.querySelector(".jt-ostatus").onchange=h=>Ln(s,{outreach_status:h.target.value}),e.appendChild(r)}Ie("jt","data-jk",i.jsort),ue(),e.querySelectorAll("tr").forEach(s=>{s.addEventListener("click",o=>{o.target.closest("a, button, select")||lt(s.dataset.id)})})}function _a(e){return e==="researching"?'<span class="draft-badge db-researching" title="drafting outreach…"><span class="spinner spinner-xs"></span>drafting</span>':e==="awaiting_review"?'<span class="draft-badge" title="an outreach draft is ready to review">draft ready</span>':e==="no_hook"?'<span class="draft-badge db-nohook" title="no honest hook — scout recommends not emailing">no hook</span>':""}const m={postingId:null,row:null,drafts:[],poll:null,openHist:!1,answers:[],answersStatus:"",answersPoll:null,detecting:!1,contacts:[],outreach:[],contactsLoaded:!1};async function lt(e){let t=i.jobs.find(n=>n.posting_id===e);if(t||(await k(),t=i.jobs.find(n=>n.posting_id===e)),!t){l("posting not found — refresh");return}ut(),gt(),m.postingId=e,m.row=t,m.drafts=[],m.openHist=!1,m.answers=[],m.detecting=!1,m.contacts=[],m.outreach=[],m.contactsLoaded=!1,m.answersStatus=t.questions_status||"",document.getElementById("pursuit-pane").classList.add("open"),document.getElementById("pursuit-scrim").classList.add("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","false"),yn("pursuit"),oe(),he(),ve(),gn()}async function gn(){const e=m.postingId,t=m.row&&m.row.company_id;if(!(!e||!t)){try{const[n,a]=await Promise.all([fetch(`/api/companies/${t}/contacts`).then(s=>s.ok?s.json():[]),fetch(`/api/postings/${e}/outreach-log`).then(s=>s.ok?s.json():[])]);if(m.postingId!==e)return;m.contacts=Array.isArray(n)?n:[],m.outreach=Array.isArray(a)?a:[]}catch{}m.contactsLoaded=!0,ge()}}let dt=null;function yn(e){dt=e;const t=e==="company";document.getElementById("scrim").style.zIndex=t?"54":"52",document.getElementById("pane").style.zIndex=t?"55":"53",document.getElementById("pursuit-scrim").style.zIndex=t?"52":"54",document.getElementById("pursuit-pane").style.zIndex=t?"53":"55"}function xe(){ut(),gt(),m.postingId=null,m.row=null,m.drafts=[],m.answers=[],m.answersStatus="",document.getElementById("pursuit-pane").classList.remove("open"),document.getElementById("pursuit-scrim").classList.remove("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","true")}function ut(){m.poll&&(clearInterval(m.poll),m.poll=null)}async function he(){if(!m.postingId)return;let e;try{const n=await fetch(`/api/postings/${m.postingId}/outreach`);if(!n.ok){ge();return}e=await n.json()}catch{ge();return}m.drafts=e.drafts||[],ge();const t=m.drafts[0];t&&t.status==="researching"?Ba():ut()}function Ba(){m.poll||(m.poll=setInterval(he,4e3))}function G(e,t,{multiline:n=!1}={}){if(!e)return;let a=e.value;e.addEventListener("focus",()=>{a=e.value}),e.addEventListener("keydown",s=>{s.key==="Escape"?(s.preventDefault(),e.value=a,e.blur()):s.key==="Enter"&&(!n||s.metaKey||s.ctrlKey)&&(s.preventDefault(),e.blur())}),e.addEventListener("blur",async()=>{const s=e.value.trim();if(s===a.trim()){e.value=a;return}e.classList.remove("is-saved","is-error"),e.classList.add("is-saving");try{await t(s),a=e.value,e.classList.remove("is-saving"),e.classList.add("is-saved"),setTimeout(()=>e.classList.remove("is-saved"),1200)}catch(o){e.value=a,e.classList.remove("is-saving"),e.classList.add("is-error"),setTimeout(()=>e.classList.remove("is-error"),1600),l(`save failed: ${o.message}`)}})}async function vn(e,t,n){const a={title:e.title||"",location:e.location||"",comp_range:e.comp_range||"",employment_type:e.employment_type||"",workplace_type:e.workplace_type||"",department:e.department||"",description:e.description||"",[t]:n},s=await fetch(`/api/postings/${e.posting_id}/details`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(a)});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const o=await s.json();Object.assign(e,{title:o.title,location:o.location,employment_type:o.employment_type,workplace_type:o.workplace_type,department:o.department,comp_range:o.comp_range,description:o.description}),A(),we(e.posting_id,{title:o.title,location:o.location})}async function Ta(e,t){const n=await fetch(`/api/postings/${e.posting_id}/url`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const a=await n.json();e.url=a.url;const s=document.querySelector("#role-body .role-url-open");s&&s.setAttribute("href",j(e.url)),we(e.posting_id,{url:a.url})}async function Ca(e,t){if(t.disabled)return;const n=t.textContent;t.disabled=!0,t.textContent="re-enriching…";let a;try{a=await fetch(`/api/postings/${e.posting_id}/recapture`,{method:"POST"})}catch(o){t.disabled=!1,t.textContent=n,l(`re-enrich failed: ${o.message}`);return}if(!a.ok){const o=(await a.text().catch(()=>"")).trim();let r=o||"HTTP "+a.status;try{r=JSON.parse(o).error||r}catch{}t.disabled=!1,t.textContent=n,l(`re-enrich failed: ${r}`);return}const s=await a.json();Object.assign(e,{title:s.title,location:s.location,employment_type:s.employment_type,workplace_type:s.workplace_type,department:s.department,comp_range:s.comp_range,description:s.description,posted_at:s.posted_at,url:s.url,questions_status:s.questions_status}),A(),oe(),we(e.posting_id,{title:s.title,location:s.location,url:s.url}),l("re-enriched from the posting link")}function Sa(e){const t=document.getElementById("pursuit-company-edit");t&&t.addEventListener("click",()=>Ma(e))}async function ja(e,t){const n=await fetch(`/api/postings/${e.posting_id}/company`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({company_id:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const a=await n.json();e.company_id=a.company_id,e.company=a.company_name,oe(),k()}let Le=null;function Ma(e){Le=e;const t=document.getElementById("relink-current");t&&(t.textContent=e.company?`currently: ${e.company}`:"");const n=document.getElementById("relink-search");n&&(n.value=""),bn(""),document.getElementById("relink-scrim").classList.add("open"),n&&n.focus()}function fe(){document.getElementById("relink-scrim").classList.remove("open"),Le=null}let pt=null;function Aa(e){pt=e;const t=(e.postings||[]).length,n=t?` and its ${t} job ${t===1?"posting":"postings"}`:"",a=document.getElementById("delcompany-summary");a&&(a.innerHTML=`Delete <strong>${c(e.name||"this company")}</strong>${n}?`);const s=document.getElementById("delcompany-confirm");s&&(s.disabled=!1),document.getElementById("delcompany-scrim").classList.add("open")}function Oe(){document.getElementById("delcompany-scrim").classList.remove("open"),pt=null}async function Ha(){const e=pt;if(!e)return;const t=document.getElementById("delcompany-confirm");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/companies/${e.company_id}`,{method:"DELETE"})}catch(s){l(`delete failed: ${s.message}`),t&&(t.disabled=!1);return}if(!n.ok){const s=await n.text().catch(()=>"");l(`delete failed: HTTP ${n.status}${s?" — "+s:""}`),t&&(t.disabled=!1);return}const a=e.name||"company";Oe(),i.openId===e.company_id&&Te(),P(),k(),T(),l(`deleted ${a}`)}let mt=null;function Pa(e){mt=e;const t=(e.title||"").trim()||"this posting",n=e.company?` at <strong>${c(e.company)}</strong>`:"",a=document.getElementById("deljob-summary");a&&(a.innerHTML=`Delete <strong>${c(t)}</strong>${n}?`);const s=document.getElementById("deljob-confirm");s&&(s.disabled=!1),document.getElementById("deljob-scrim").classList.add("open")}function Ne(){document.getElementById("deljob-scrim").classList.remove("open"),mt=null}async function qa(){const e=mt;if(!e)return;const t=document.getElementById("deljob-confirm");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/postings/${e.posting_id}`,{method:"DELETE"})}catch(s){l(`delete failed: ${s.message}`),t&&(t.disabled=!1);return}if(!n.ok){const s=await n.text().catch(()=>"");l(`delete failed: HTTP ${n.status}${s?" — "+s:""}`),t&&(t.disabled=!1);return}const a=(e.title||"").trim()||"posting";Ne(),xe(),k(),i.openId===e.company_id&&be(e.company_id),l(`deleted ${a}`)}function bn(e){const t=document.getElementById("relink-results");if(!t)return;const n=e.trim().toLowerCase();let a=(i.rows||[]).slice();if(n?(a=a.filter(o=>(o.name||"").toLowerCase().includes(n)),a.sort((o,r)=>{const d=(o.name||"").toLowerCase().startsWith(n)?0:1,u=(r.name||"").toLowerCase().startsWith(n)?0:1;return d-u||(o.name||"").localeCompare(r.name||"")})):a.sort((o,r)=>(o.name||"").localeCompare(r.name||"")),a=a.slice(0,60),!a.length){t.innerHTML=`<div class="relink-empty">${(i.rows||[]).length?"no company matches":"no companies yet — Add one first"}</div>`;return}const s=Le?Le.company_id:"";t.innerHTML=a.map(o=>{const r=o.company_id===s,d=[o.vertical,o.location].filter(Boolean).map(c).join(" · ");return`<button type="button" class="relink-result${r?" is-current":""}"
        data-id="${o.company_id}"${r?" disabled":""}>
        <span class="rr-main">
          <span class="rr-name">${c(o.name||"—")}</span>
          ${d?`<span class="rr-sub">${d}</span>`:""}
        </span>
        <span class="${y(o.verdict)} rr-verdict">${c(o.verdict||"—")}</span>
        ${r?'<span class="rr-current-tag">current</span>':""}
      </button>`}).join("")}async function wn(e){const t=Le;if(!t){fe();return}if(e===t.company_id){fe();return}try{await ja(t,e),fe(),l(`moved to ${t.company}`)}catch(n){l(`move failed: ${n.message}`)}}async function kn(e,t,n){const a={name:e.name||"",headcount:e.headcount||"",funding_stage:e.funding_stage||"",location:e.location||"",vertical:e.vertical||"",[t]:n};if(!String(a.name).trim())throw new Error("name is required");const s=await fetch(`/api/companies/${e.company_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(a)});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const o=await s.json();Object.assign(e,{name:o.name,headcount:o.headcount,funding_stage:o.funding_stage,location:o.location,vertical:o.vertical}),P(),k()}async function Oa(e,t){const n=await fetch(`/api/companies/${e.company_id}/domain`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({website:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const a=await n.json();i.openId=a.company_id,Ce(a),Se(a.company_id),P(),k()}async function Na(e,t){const n=await fetch(`/api/companies/${e.company_id}/notes`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({notes:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const a=await n.json();e.notes=a.notes}let En=null;function oe(){const e=m.row;if(!e)return;const t=document.getElementById("pursuit-body"),a=!!t&&En===e.posting_id&&document.getElementById("pursuit-pane").classList.contains("open")&&t?t.scrollTop:0;document.getElementById("pursuit-title").innerHTML=`<input class="ie ie-title" id="pursuit-title-input" placeholder="role name" value="${c(e.title||"")}">`;const s=e.application_status||"";document.getElementById("pursuit-pills").innerHTML=`<span class="pill ${s?qe(s)||"pill-stage":"pill-none"}">${c(s||"—")}</span>`+(e.verdict?` <span class="${y(e.verdict)}">${c(e.verdict)}</span>`:"");const o=document.getElementById("pursuit-chat");o&&(o.style.display=i.meta&&i.meta.chat?"":"none",o.onclick=()=>Vt("posting",e.posting_id,e.title||e.company)),document.getElementById("pursuit-body").innerHTML=`
    <section class="pane-section role-head">
      <div id="role-body">${Ra(e)}</div>
    </section>

    <section class="pane-section">
      <h3>
        Pipeline
      </h3>
      <div class="pipeline-grid">
        <div class="pipeline-row">
          <span class="pl-label">application</span>
          <select class="input pl-appstatus" title="application stage">
            ${un(e.application_status||"").map(([p,h])=>`<option value="${c(p)}"${(e.application_status||"")===p?" selected":""}>${c(h)}</option>`).join("")}
          </select>
        </div>
        <div class="pipeline-row">
          <span class="pl-label">outreach</span>
          <select class="input pl-ostatus" title="outreach reply status — separate from the application stage">
            ${pn(e.outreach_status||"").map(([p,h])=>`<option value="${c(p)}"${(e.outreach_status||"")===p?" selected":""}>${c(h)}</option>`).join("")}
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
  `,Da();const r=document.getElementById("pursuit-company-link");r&&r.addEventListener("click",()=>be(e.company_id)),Sa(e),G(document.getElementById("pursuit-title-input"),p=>vn(e,"title",p)),G(document.getElementById("pursuit-url-input"),p=>Ta(e,p));const d=document.getElementById("pursuit-reenrich");d&&d.addEventListener("click",()=>Ca(e,d)),G(document.getElementById("pursuit-notes-input"),p=>Va(p),{multiline:!0}),document.querySelectorAll("#role-body [data-k]").forEach(p=>G(p,h=>vn(e,p.dataset.k,h),{multiline:p.tagName==="TEXTAREA"}));const u=document.getElementById("job-delete-btn");u&&u.addEventListener("click",()=>Pa(e)),ge(),Be(),t&&(t.scrollTop=a),En=e.posting_id}function Ra(e){return`
    <div class="role-url ie-field">
      <div class="role-url-head">
        <label>link</label>
        <a class="role-url-open" href="${j(e.url)}" target="_blank" rel="noopener" title="open the posting">↗</a>
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
    </div>`}function Da(){const e=document.querySelector("#pursuit-body .pl-appstatus");e&&e.addEventListener("change",a=>xn({application_status:a.target.value}));const t=document.querySelector("#pursuit-body .pl-ostatus");t&&t.addEventListener("change",a=>xn({outreach_status:a.target.value}));const n=document.querySelector("#pursuit-body .pt-nextup");n&&n.addEventListener("click",()=>$n(m.row,!0))}async function $n(e,t){let n;try{n=await fetch(`/api/postings/${e.posting_id}/next-up`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({next_up:!e.next_up})})}catch(s){l(`save failed: ${s.message}`);return}if(!n.ok){const s=(await n.text().catch(()=>"")).trim();l(`save failed: ${s||"HTTP "+n.status}`);return}const a=await n.json();e.next_up=a.next_up,A(),we(e.posting_id,{next_up:a.next_up}),t&&oe(),l(e.next_up?"queued next up":"removed from the queue")}async function In(e,t){const n={application_status:e.application_status||"",outreach_status:e.outreach_status||"",notes:e.notes||"",...t};let a;try{a=await fetch(`/api/postings/${e.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)})}catch(o){return l(`save failed: ${o.message}`),null}if(!a.ok){const o=(await a.text().catch(()=>"")).trim();return l(`save failed: ${o||"HTTP "+a.status}`),null}const s=await a.json();return Object.assign(e,{application_status:s.application_status,outreach_count:s.outreach_count,last_outreach_at:s.last_outreach_at,outreach_status:s.outreach_status,contacts:s.contacts,notes:s.notes,next_up:s.next_up}),we(e.posting_id,{application_status:s.application_status,outreach_count:s.outreach_count,last_outreach_at:s.last_outreach_at,next_up:s.next_up}),s}async function Va(e){const t=m.row,n={application_status:t.application_status||"",outreach_status:t.outreach_status||"",notes:e},a=await fetch(`/api/postings/${t.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)});if(!a.ok)throw new Error((await a.text().catch(()=>"")).trim()||"HTTP "+a.status);const s=await a.json();t.notes=s.notes,A()}async function xn(e){await In(m.row,e)&&(A(),oe(),l("tracking saved"))}async function Ln(e,t){await In(e,t)&&(A(),m.postingId===e.posting_id&&(m.row=e,oe()),l("tracking saved"))}function ge(){const e=document.getElementById("outreach-section");if(!e)return;const t=m.drafts,n=t[0]||null,a=t.slice(1),o=n&&(Wa(n.status)||n.status==="failed")?"":`<button class="btn btn-primary" id="draft-start-btn">${n?"Draft again":"Draft outreach"}</button><label class="draft-skip-research" title="Skip the web-research stage — write straight from the template; the opener becomes a plain intro."><input type="checkbox" id="draft-skip-research"> skip research</label>`,r=a.length?`
    <details class="draft-history" ${m.openHist?"open":""}>
      <summary>${a.length} earlier draft${a.length>1?"s":""}</summary>
      <div id="draft-history-body">${a.map(d=>Cn(d,!0)).join("")}</div>
    </details>`:"";e.innerHTML=Fa()+`<div class="outreach-drafts-head">Drafts</div><div id="draft-current">${n?Cn(n,!1):""}</div><div class="draft-actions">${o}</div>`+r,Ka(),es()}function Ua(e,t){const n=m.row||{},a={company:n.company||"",role:n.title||"",contact_name:e&&e.name||"",contact_role:e&&e.role||"",last_sent:t&&t.sent_at||"",last_message:t&&t.body||""};return(i.followupTemplate||"").replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g,(s,o)=>o in a?a[o]:s)}function Fa(){const e=m.row,t=e.last_outreach_at?`<div class="outreach-meta"><span>last outreach ${c(e.last_outreach_at)}</span></div>`:"";if(!m.contactsLoaded)return`<div class="contacts-mgr">${t}<div class="loading-row"><span class="spinner"></span><span>loading contacts…</span></div></div>`;const n=m.contacts.map(za).join(""),a=m.contacts.length?"":`<div class="cc-empty dim">No contacts yet — add the people you're reaching out to at ${c(e.company)}.</div>`;return`<div class="contacts-mgr">
    ${t}
    <div class="cc-cards">${n}${a}</div>
    <div class="cc-addwrap">
      <button class="btn cc-addbtn" type="button">+ add contact</button>
      <div class="cc-addform" style="display:none">
        <input class="input cc-f-name" placeholder="name" spellcheck="false">
        <input class="input cc-f-role" placeholder="role (e.g. recruiter)" spellcheck="false">
        <input class="input cc-f-email" type="email" placeholder="email" spellcheck="false">
        <div class="cc-form-actions"><button class="btn btn-primary cc-f-save" type="button">Add</button><button class="btn cc-f-cancel" type="button">Cancel</button></div>
      </div>
    </div>
  </div>`}function za(e){const t=m.outreach.filter(o=>o.contact_id===e.id),n=t[0]||null,a=e.role?`<span class="cc-role">${c(e.role)}</span>`:"",s=e.email?`<a class="cc-mail" href="mailto:${c(e.email)}" title="${c(e.email)}">${c(e.email)}</a>`:"";return`<div class="contact-card" data-cid="${e.id}">
    <div class="cc-head">
      <span class="cc-name">${c(e.name||e.email||"contact")}</span>${a}${s}
      <span class="cc-acts"><button class="cc-edit" type="button" title="edit contact" aria-label="edit">✎</button><button class="cc-arch" type="button" title="remove contact" aria-label="remove">×</button></span>
    </div>
    <div class="cc-editform" style="display:none">
      <input class="input cc-e-name" value="${c(e.name||"")}" placeholder="name" spellcheck="false">
      <input class="input cc-e-role" value="${c(e.role||"")}" placeholder="role" spellcheck="false">
      <input class="input cc-e-email" type="email" value="${c(e.email||"")}" placeholder="email" spellcheck="false">
      <div class="cc-form-actions"><button class="btn btn-primary cc-e-save" type="button">Save</button><button class="btn cc-e-cancel" type="button">Cancel</button></div>
    </div>
    <div class="cc-status">${Ja(n)}</div>
    <div class="cc-rowacts">${n?'<button class="btn cc-followup" type="button" title="copy a follow-up email from your template">Follow up ⧉</button>':'<button class="btn cc-log" type="button">+ log outreach</button>'}</div>
    ${n?"":`<div class="cc-logform" style="display:none">
      <input class="input cc-l-date" type="date" value="${Pe()}" title="date sent">
      <textarea class="input cc-l-body" rows="5" placeholder="email body — what you sent (optional)" spellcheck="false"></textarea>
      <div class="cc-form-actions"><button class="btn btn-primary cc-l-save" type="button">Log</button><button class="btn cc-l-cancel" type="button">Cancel</button></div>
    </div>`}
    ${t.length?`<details class="cc-history"><summary>${t.length} send${t.length>1?"s":""}</summary><div class="cc-entries">${t.map(Ga).join("")}</div></details>`:""}
  </div>`}function Ja(e){if(!e)return'<span class="dim">no outreach logged yet</span>';const t=`last ${c(e.sent_at)}`,n=e.id,a=e.followup_due_at,s=a&&a<=Pe();return e.followup_done_at?s?`${t} · <span class="fu-escalate">no reply — try another contact</span> <button class="cc-fu-dismiss" data-eid="${n}" type="button" title="dismiss — stop reminding me about this contact">dismiss</button>`:`${t} · <label class="cc-fu-check fu-done"><input class="cc-fu-toggle" type="checkbox" data-eid="${n}" checked> followed up</label>`:a?`${t} · <label class="cc-fu-check${s?" fu-overdue":""}"><input class="cc-fu-toggle" type="checkbox" data-eid="${n}"> follow up</label> <button class="cc-fu-stop" data-eid="${n}" type="button" title="discontinue follow-ups for this contact">stop</button>`:`${t} · <span class="fu-stopped">follow-up stopped</span> <button class="cc-fu-resume" data-eid="${n}" type="button">resume</button>`}function Ga(e){const t=e.followup_done_at?'<span class="fu-done">followed up</span>':e.followup_due_at?`<span class="fu-mini">↳ follow up ${c(e.followup_due_at)}</span>`:"",n=e.body?`<details class="cc-e-body"><summary>email sent</summary><pre>${c(e.body)}</pre></details>`:"";return`<div class="cc-entry-wrap">
      <div class="cc-entry" data-eid="${e.id}">
        <span class="cc-e-date">${c(e.sent_at)}</span>
        ${e.note?`<span class="cc-e-note">${c(e.note)}</span>`:""}
        ${t}
        <button class="cc-e-del" type="button" title="delete this send" aria-label="delete">×</button>
      </div>
      ${n}
    </div>`}async function ie(e,t,n){let a;try{a=await fetch(t,{method:e,headers:n?{"Content-Type":"application/json"}:{},body:n?JSON.stringify(n):void 0})}catch(s){return l(`save failed: ${s.message}`),null}if(!a.ok){const s=(await a.text().catch(()=>"")).trim();return l(`save failed: ${s||"HTTP "+a.status}`),null}try{return await a.json()}catch{return{}}}async function ye(){await k(),await gn()}function Ka(){const e=document.getElementById("outreach-section");if(!e)return;const t=m.postingId,n=e.querySelector(".cc-addwrap");if(n){const a=n.querySelector(".cc-addform");n.querySelector(".cc-addbtn").addEventListener("click",()=>{a.style.display="",n.querySelector(".cc-addbtn").style.display="none",a.querySelector(".cc-f-name").focus()}),n.querySelector(".cc-f-cancel").addEventListener("click",()=>ge()),n.querySelector(".cc-f-save").addEventListener("click",async()=>{const s={name:a.querySelector(".cc-f-name").value,role:a.querySelector(".cc-f-role").value,email:a.querySelector(".cc-f-email").value};await ie("POST",`/api/companies/${m.row.company_id}/contacts`,s)&&(l("contact added"),ye())})}e.querySelectorAll(".contact-card").forEach(a=>{const s=a.dataset.cid,o=a.querySelector(".cc-editform");a.querySelector(".cc-edit").addEventListener("click",()=>{o.style.display=o.style.display==="none"?"":"none",o.style.display!=="none"&&o.querySelector(".cc-e-name").focus()});const r=a.querySelector(".cc-e-cancel");r&&r.addEventListener("click",()=>{o.style.display="none"});const d=a.querySelector(".cc-e-save");d&&d.addEventListener("click",async()=>{const L={name:o.querySelector(".cc-e-name").value,role:o.querySelector(".cc-e-role").value,email:o.querySelector(".cc-e-email").value};await ie("PUT",`/api/contacts/${s}`,L)&&(l("contact saved"),ye())}),a.querySelector(".cc-arch").addEventListener("click",async()=>{await ie("DELETE",`/api/contacts/${s}`)&&(l("contact removed"),ye())});const u=a.querySelector(".cc-logform"),p=a.querySelector(".cc-log");p&&p.addEventListener("click",()=>{u.style.display=u.style.display==="none"?"":"none",u.style.display!=="none"&&u.querySelector(".cc-l-date").focus()});const h=a.querySelector(".cc-l-cancel");h&&h.addEventListener("click",()=>{u.style.display="none"});const f=a.querySelector(".cc-l-save");f&&f.addEventListener("click",async()=>{const L={contact_id:s,sent_at:u.querySelector(".cc-l-date").value||Pe(),body:u.querySelector(".cc-l-body").value};await ie("POST",`/api/postings/${t}/outreach-log`,L)&&(l("outreach logged"),ye())});const w=a.querySelector(".cc-followup");w&&w.addEventListener("click",()=>{const L=m.contacts.find(U=>String(U.id)===String(s)),g=m.outreach.filter(U=>String(U.contact_id)===String(s))[0]||null;wt(Ua(L,g),"follow-up copied — paste into your email")});const B=async(L,g,U)=>{const W=m.outreach.find(Ee=>String(Ee.id)===String(L))||{};await ie("PUT",`/api/outreach-log/${L}`,{sent_at:W.sent_at||"",body:W.body||"",note:W.note||"",followup_due_at:W.followup_due_at||"",done:!!W.followup_done_at,...g})&&(l(U),ye())},C=a.querySelector(".cc-fu-toggle");C&&C.addEventListener("change",()=>B(C.dataset.eid,{done:C.checked},C.checked?"marked followed up":"follow-up reopened"));const D=a.querySelector(".cc-fu-stop");D&&D.addEventListener("click",()=>B(D.dataset.eid,{followup_due_at:"",done:!1},"follow-up stopped"));const V=a.querySelector(".cc-fu-resume");V&&V.addEventListener("click",()=>B(V.dataset.eid,{followup_due_at:Pe(),done:!1},"follow-up resumed"));const H=a.querySelector(".cc-fu-dismiss");H&&H.addEventListener("click",()=>B(H.dataset.eid,{followup_due_at:"",done:!0},"escalation dismissed")),a.querySelectorAll(".cc-e-del").forEach(L=>L.addEventListener("click",async()=>{const g=L.closest(".cc-entry").dataset.eid;await ie("DELETE",`/api/outreach-log/${g}`)&&(l("send deleted"),ye())}))})}function Wa(e){return e==="researching"||e==="awaiting_review"||e==="needs_work"||e==="no_hook"}const _n='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M2.5 10.5v-7a1 1 0 011-1h7"/></svg>',Bn='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2L7.3 8.7"/><path d="M14 2L9.7 14l-2.4-5.3L2 6.3z"/></svg>',Tn=`<button class="dh-copy draft-copy-btn" title="copy the email to the clipboard" aria-label="copy email">${_n}</button>`,ht=[{key:"research",label:"Research",active:"Researching the company"},{key:"fill",label:"Draft",active:"Writing the draft"},{key:"humanize",label:"Polish",active:"Polishing the voice"},{key:"honesty",label:"Fact-check",active:"Fact-checking against your experience"}],Ya='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';function Za(e){let t=ht.findIndex(a=>a.key===e);return t<0&&(t=0),`<div class="draft-progress">
    <div class="dp-track">${ht.map((a,s)=>{const o=s<t?"is-done":s===t?"is-active":"is-pending",r=s<t?Ya:"";return`<div class="dp-seg ${o}"><span class="dp-dot">${r}</span><span class="dp-name">${a.label}</span></div>`}).join("")}</div>
    <div class="dp-status"><span class="spinner"></span><span>${ht[t].active}…</span></div>
  </div>`}function Qa(){if(!(i.gmail&&i.gmail.connected))return"";const e=(m.contacts||[]).filter(n=>n.email);return e.length?`<div class="draft-gmail-row">
    <select class="input draft-gmail-to" title="recipient" aria-label="recipient">${e.map(n=>`<option value="${n.id}">${c(n.name||n.email)}${n.email?` &lt;${c(n.email)}&gt;`:""}</option>`).join("")}</select>
    <button class="btn btn-primary draft-gmail-btn" title="send this email from your Gmail and log it">${Bn}Send via Gmail</button>
  </div>`:'<div class="draft-note dim">Add a contact with an email to send via Gmail.</div>'}function Cn(e,t){const n=(p,h,f="")=>`
    <div class="draft-head">
      <span class="${p}">${h}</span>${f}
    </div>`;if(e.status==="researching")return`<div class="draft-card dc-busy">
      ${Za(e.stage)}
      <div class="draft-note">This usually takes a minute or two — leave the panel or check back later.</div>
    </div>`;if(e.status==="failed"){const p=Xa(e.violations);return`<div class="draft-card dc-failed" data-did="${e.id}">
      ${n("pill pill-no","failed")}
      ${e.fail_reason?`<div class="draft-note">${c(e.fail_reason)}</div>`:""}
      ${p}
      ${_e(e)}
      ${t?"":`<div class="draft-actions"><button class="btn btn-primary draft-retry-btn">${Qe}Retry</button></div>`}
    </div>`}if(e.status==="superseded")return`<div class="draft-card dc-sent" data-did="${e.id}">
      ${n("pill pill-info","replaced")}
      <div class="draft-note">Replaced by a newer draft.</div>
      <div class="draft-sentbody">${c(ft(e)||"(empty)")}</div>
      ${_e(e)}
    </div>`;if(e.status==="sent")return`<div class="draft-card dc-sent" data-did="${e.id}">
      ${n("pill pill-yes","sent",t?"":Tn)}
      ${e.sent_at?`<div class="draft-note">Sent ${c((e.sent_at||"").replace("T"," ").slice(0,16))}</div>`:""}
      <div class="draft-sentbody">${c(ft(e)||"(empty)")}</div>
      ${_e(e)}
    </div>`;const a=ft(e),s=e.status==="no_hook",o=s?'<span class="pill pill-info">no honest hook</span>':'<span class="pill pill-maybe">awaiting review</span>';let r="";if(s)try{r=JSON.parse(e.hook||"{}").reasoning||""}catch{}const d=s?`<div class="draft-note">No honest hook found — nothing true to say yet; scout recommends not emailing.${r?" "+c(r):""}</div>`:"";if(t)return`<div class="draft-card ${s?"dc-nohook":"dc-review"}" data-did="${e.id}">
      <div class="draft-head">${o}</div>
      ${d}
      <div class="draft-sentbody">${c(a||"(empty)")}</div>
      ${_e(e)}
    </div>`;const u=a||s;return`<div class="draft-card ${s?"dc-nohook":"dc-review"}" data-did="${e.id}">
    <div class="draft-head">${o}${a?Tn:""}</div>
    ${d}
    ${u?`<textarea class="draft-textarea" id="draft-edit-${e.id}" spellcheck="false">${c(a)}</textarea>
    ${Sn(e.lint)}
    <div class="draft-actions">
      <button class="btn btn-primary draft-sent-btn" title="mark this email sent — bumps the outreach count">${Bn}Mark sent</button>
      <button class="btn draft-regen-btn" title="discard this draft (kept in history) and re-run — picks up backfilled info">${Qe}Regenerate</button>
    </div>
    ${Qa()}`:`<div class="draft-actions">
      <button class="btn draft-regen-btn" title="re-run the draft — picks up backfilled info">${Qe}Regenerate</button>
    </div>`}
    ${_e(e)}
  </div>`}function ft(e){return e.edited&&e.edited.trim()?e.edited:e.draft||""}function _e(e){let t="",n=null,a=null;try{n=JSON.parse(e.research||"null")}catch{}try{a=JSON.parse(e.hook||"null")}catch{}if(n&&typeof n=="object"){const s=(u,p)=>p?`<div class="tr-line"><span class="tr-key">${u}:</span> ${c(String(p))}</div>`:"",o=n.role||{},r=Array.isArray(n.hooks)?n.hooks:[],d=r.map(u=>`
      <div class="tr-line">
        <span class="tr-key">${c(u.type||"hook")}</span>
        ${j(u.source_url)!=="#"?` · <a href="${j(u.source_url)}" target="_blank" rel="noopener">source</a>`:""}
        <span class="tr-quote">${c(u.quote||"")}</span>
        ${u.context?`<span class="tr-key">${c(u.context)}</span>`:""}
      </div>`).join("");t+=`<details class="draft-trace"><summary>research — ${r.length} hook candidate${r.length===1?"":"s"}</summary>
      <div class="trace-body">
        ${s("what they do",n.what_they_do)}
        ${s("customer",n.customer)}
        ${s("stage / headcount",[n.stage,n.headcount_est].filter(Boolean).join(" / "))}
        ${s("role",o.title)}
        ${(o.jd_quotes||[]).map(u=>`<span class="tr-quote">${c(u)}</span>`).join("")}
        ${d}
        ${s("disambiguation",n.disambiguation)}
        ${s("confidence",n.confidence)}
      </div></details>`}if(a&&typeof a=="object"&&a.decision){const s=a.hook||{};t+=`<details class="draft-trace"><summary>hook — ${c(a.decision)}${a.closer_mode?" · "+c(a.closer_mode):""}</summary>
      <div class="trace-body">
        ${s.quote?`<span class="tr-quote">${c(s.quote)}</span>`:""}
        ${s.thread?`<div class="tr-line"><span class="tr-key">thread:</span> ${c(s.thread)}</div>`:""}
        ${j(s.source_url)!=="#"?`<div class="tr-line"><a href="${j(s.source_url)}" target="_blank" rel="noopener">source</a></div>`:""}
        ${a.reasoning?`<div class="tr-line"><span class="tr-key">reasoning:</span> ${c(a.reasoning)}</div>`:""}
      </div></details>`}return t}function Sn(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<div class="lint-chips">'+t.map(n=>`<span class="lint-chip" title="${c(n.message||"")}"><code>${c(n.code||"")}</code>${c(n.message||"")}</span>`).join("")+"</div>":""}function Xa(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<ul class="violation-list">'+t.map(n=>`<li>${c(n.claim||n.message||String(n))}${n.why?` <span class="vl-why">— ${c(n.why)}</span>`:""}</li>`).join("")+"</ul>":""}function es(){const e=document.getElementById("outreach-section");if(!e)return;const t=e.querySelector("#draft-start-btn");t&&t.addEventListener("click",()=>Re(!1,ts())),e.querySelectorAll(".draft-retry-btn").forEach(a=>a.addEventListener("click",()=>Re())),e.querySelectorAll(".draft-regen-btn").forEach(a=>a.addEventListener("click",()=>Re(!0))),e.querySelectorAll(".draft-card[data-did]").forEach(a=>{const s=a.dataset.did,o=a.querySelector(".draft-textarea");o&&G(o,p=>as(s,p),{multiline:!0});const r=a.querySelector(".draft-sent-btn");r&&r.addEventListener("click",()=>os(s));const d=a.querySelector(".draft-gmail-btn");d&&d.addEventListener("click",()=>{const p=a.querySelector(".draft-gmail-to");ss(s,p?p.value:"",d)});const u=a.querySelector(".draft-copy-btn");u&&u.addEventListener("click",()=>{const p=a.querySelector(".draft-textarea"),h=a.querySelector(".draft-sentbody"),f=p?p.value:h?h.textContent:"";wt(f,"email copied")})});const n=e.querySelector("details.draft-history");n&&n.addEventListener("toggle",()=>{m.openHist=n.open})}function ts(){const e=document.getElementById("draft-skip-research");return!!(e&&e.checked)}async function Re(e=!1,t=!1){const n=document.getElementById("outreach-section"),a=n&&(n.querySelector("#draft-start-btn")||n.querySelector(".draft-retry-btn")||n.querySelector(".draft-regen-btn"));a&&(a.disabled=!0);let s;try{const r=new URLSearchParams;e&&r.set("regenerate","1"),t&&r.set("research","0");const d=r.toString()?`?${r.toString()}`:"";s=await fetch(`/api/postings/${m.postingId}/outreach${d}`,{method:"POST"})}catch(r){l(`draft failed: ${r.message}`),a&&(a.disabled=!1);return}if(s.status===202){let r={};try{r=await s.json()}catch{}Array.isArray(r.degraded)&&r.degraded.length&&l(`drafting without ${r.degraded.join(", ")} — quality degrades, integrity unaffected`),await he(),k();return}if(s.status===409){await he(),l("a draft is already active");return}if(s.status===412){let r={};try{r=await s.json()}catch{}ns(r.need,r.error),a&&(a.disabled=!1);return}if(s.status===503){const r=document.getElementById("outreach-section");if(r){const d=document.createElement("div");d.className="draft-note",d.textContent="Outreach engine not running in this build.",r.appendChild(d)}a&&(a.disabled=!1);return}const o=(await s.text().catch(()=>"")).trim();l(`draft failed: ${o||"HTTP "+s.status}`),a&&(a.disabled=!1)}function ns(e,t){const n=document.getElementById("outreach-section");if(!n)return;const a=n.querySelector(".draft-actions"),s=e==="template",o=s?"Write email template":"View brain knowledge",r=document.createElement("div");r.className="blocks-gate",r.innerHTML=`
    <div class="draft-note">${c(t||"Outreach isn't set up yet.")}</div>
    <div class="draft-actions">
      <button class="btn btn-primary" id="gate-fix-btn">${o}</button>
      <button class="btn" id="gate-retry-btn">Retry</button>
    </div>`,a?a.replaceWith(r):n.appendChild(r);const d=r.querySelector("#gate-fix-btn");d&&d.addEventListener("click",()=>s?z("outreach-template"):Yn());const u=r.querySelector("#gate-retry-btn");u&&u.addEventListener("click",Re)}async function as(e,t){const n=await fetch(`/api/outreach/drafts/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const a=await n.json(),s=m.drafts.findIndex(d=>String(d.id)===String(e));s>=0&&(m.drafts[s]=a);const o=document.getElementById(`draft-edit-${e}`),r=o&&o.closest(".draft-card");if(r){const d=r.querySelector(".lint-chips"),u=Sn(a.lint);d?d.outerHTML=u||"":u&&o.insertAdjacentHTML("afterend",u)}}async function ss(e,t,n){n&&(n.disabled=!0,n.dataset.t=n.textContent||"",n.textContent="Sending…");const a=()=>{n&&(n.disabled=!1,n.textContent=n.dataset.t||"Send via Gmail")};let s;try{s=await fetch(`/api/outreach/drafts/${e}/send-gmail`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contact_id:t||""})})}catch(r){l(`send failed: ${r.message}`),a();return}if(!s.ok){const r=(await s.text().catch(()=>"")).trim();l(`send failed: ${r||"HTTP "+s.status}`),a();return}let o={};try{o=await s.json()}catch{}l(o.to?`sent via Gmail to ${o.to}`:"sent via Gmail"),await he(),await k()}async function os(e){let t;try{t=await fetch(`/api/outreach/drafts/${e}/sent`,{method:"POST"})}catch(a){l(`failed: ${a.message}`);return}if(!t.ok){const a=(await t.text().catch(()=>"")).trim();l(`failed: ${a||"HTTP "+t.status}`);return}l("marked sent"),await he(),await k();const n=i.jobs.find(a=>a.posting_id===m.postingId);n&&we(n.posting_id,{outreach_count:n.outreach_count,last_outreach_at:n.last_outreach_at,next_up:n.next_up})}async function ve(){if(!m.postingId)return;let e;try{const t=await fetch(`/api/postings/${m.postingId}/answers`);if(!t.ok){Be();return}e=await t.json()}catch{Be();return}m.answers=e.answers||[],m.answersStatus=e.questions_status||"",Be(),m.answers.some(t=>t.status==="generating")?is():gt()}function is(){m.answersPoll||(m.answersPoll=setInterval(ve,4e3))}function gt(){m.answersPoll&&(clearInterval(m.answersPoll),m.answersPoll=null)}function Be(){const e=document.getElementById("answers-section");if(!e)return;const t=m.answers,n=m.answersStatus,a=t.some(p=>p.status==="generating"),s=t.length?`<div class="answers-list">${t.map(ls).join("")}</div>`:"",o=!!m.detecting,r=a||o?" disabled":"",d=p=>`<button class="btn" id="answers-redetect-btn"${o?" disabled":""}>${o?"Detecting…":p}</button>`;let u;n==="ok"&&t.length?u=(t.some(h=>!jn(h)&&h.status!=="generating")?`<button class="btn" id="answers-start-btn"${r}>${a?"Drafting…":"Draft all blank"}</button>`:"")+d("Re-detect"):n===""||n==="unreachable"?u=`<button class="btn btn-primary" id="answers-start-btn"${r}>${a?"Drafting…":"Draft answers"}</button>`+d("Re-detect questions"):u=d("Re-detect questions"),e.innerHTML=`<div class="answers-meta">${c(cs(n,t.length))}</div>`+s+`<div class="answers-actions">${u}</div>`,us()}function cs(e,t){switch(e){case"":return"Not detected yet";case"ok":return`${t} question${t===1?"":"s"} found`;case"none":return"No essay questions on this form";case"unsupported":return"Couldn't read this form — apply on the site";case"unreachable":return"Couldn't reach the application form — try re-detecting";default:return"Couldn't read this form"}}function jn(e){return e.edited&&e.edited.trim()?e.edited:e.answer||""}function rs(e){switch(e.status){case"ready":return'<span class="pill pill-yes">ready</span>';case"needs_review":return'<span class="pill pill-maybe">needs review</span>';case"failed":return'<span class="pill pill-no">failed</span>';case"generating":return'<span class="pill pill-info">drafting…</span>';default:return'<span class="pill pill-info">not drafted</span>'}}function ls(e){const t=jn(e),n=e.edited&&e.edited.trim(),a=e.status==="generating",s=t.length,o=e.max_length&&s>e.max_length,r=e.max_length?`<span class="answer-count${o?" over":""}">${s} / ${e.max_length}</span>`:`<span class="answer-count">${s} chars</span>`,d=!!t,u=d?"Regenerate":"Generate",p=d?"re-draft this answer (discards the current text)":"draft an answer to just this question";return`<div class="answer-card ac-${e.status}" data-aid="${e.id}">
    <div class="answer-prompt">${c(e.prompt)}</div>
    ${a?'<div class="answer-busy"><span class="spinner"></span><span>drafting…</span></div>':`<textarea class="ie answer-textarea" id="answer-edit-${e.id}" rows="5" spellcheck="false" placeholder="Generate an answer to this question, or write your own.">${c(t)}</textarea>`}
    <div class="answer-foot">
      ${rs(e)}
      ${n?'<span class="answer-edited" title="your edit wins over the drafted answer">edited</span>':""}
      ${a?"":r}
      ${a?"":`<button class="btn ${d?"":"btn-primary "}answer-regen-btn" title="${p}">${u}</button>`}
      ${a||!d?"":`<button class="answer-copy-btn dh-copy" title="copy this answer to the clipboard" aria-label="copy answer">${_n}</button>`}
      ${a?"":'<button class="answer-remove-btn" title="remove this question" aria-label="remove question">×</button>'}
    </div>
    ${e.status==="needs_review"?`<div class="answer-note answer-review">Flagged by the honesty check — confirm it doesn't overstate your experience before sending.</div>`:""}
    ${e.status==="failed"&&e.fail_reason?`<div class="answer-note answer-fail">${c(ds(e.fail_reason))}</div>`:""}
  </div>`}function ds(e){return e=String(e||""),e.length>160?e.slice(0,160)+"…":e}function us(){const e=document.getElementById("answers-section");if(!e)return;const t=e.querySelector("#answers-start-btn");t&&t.addEventListener("click",Mn);const n=e.querySelector("#answers-redetect-btn");n&&n.addEventListener("click",ms),e.querySelectorAll(".answer-card[data-aid]").forEach(a=>{const s=a.dataset.aid,o=a.querySelector(".answer-textarea");o&&(G(o,p=>hs(s,p),{multiline:!0}),o.addEventListener("input",()=>ps(a,o)));const r=a.querySelector(".answer-regen-btn");r&&r.addEventListener("click",()=>fs(s));const d=a.querySelector(".answer-copy-btn");d&&d.addEventListener("click",()=>{o&&wt(o.value,"answer copied")});const u=a.querySelector(".answer-remove-btn");u&&u.addEventListener("click",()=>gs(s))})}function ps(e,t){const n=e.querySelector(".answer-count");if(!n)return;const a=t.value.length,s=n.textContent.includes("/")?parseInt(n.textContent.split("/")[1],10):0;n.textContent=s?`${a} / ${s}`:`${a} chars`,n.classList.toggle("over",!!s&&a>s)}async function Mn(){const e=document.getElementById("answers-section"),t=e&&e.querySelector("#answers-start-btn");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/postings/${m.postingId}/answers`,{method:"POST"})}catch(s){l(`draft failed: ${s.message}`),t&&(t.disabled=!1);return}if(n.status===202){await ve();return}if(n.status===412){let s={};try{s=await n.json()}catch{}An(s.error),t&&(t.disabled=!1);return}if(n.status===503){Hn("Answer generation isn't running in this build."),t&&(t.disabled=!1);return}const a=(await n.text().catch(()=>"")).trim();l(`draft failed: ${a||"HTTP "+n.status}`),t&&(t.disabled=!1)}async function ms(){m.detecting=!0,Be();try{const e=await fetch(`/api/postings/${m.postingId}/answers/redetect`,{method:"POST"});if(!e.ok){const t=(await e.text().catch(()=>"")).trim();l(`detect failed: ${t||"HTTP "+e.status}`)}}catch(e){l(`detect failed: ${e.message}`)}m.detecting=!1,await ve()}async function hs(e,t){const n=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const a=await n.json(),s=m.answers.findIndex(o=>String(o.id)===String(e));s>=0&&(m.answers[s]=a)}async function fs(e){let t;try{t=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({regenerate:!0})})}catch(n){l(`regenerate failed: ${n.message}`);return}if(t.status===503){Hn("Answer generation isn't running in this build.");return}if(t.status===412){let n={};try{n=await t.json()}catch{}An(n.error);return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();l(`regenerate failed: ${n||"HTTP "+t.status}`);return}await ve()}async function gs(e){let t;try{t=await fetch(`/api/answers/${e}`,{method:"DELETE"})}catch(n){l(`remove failed: ${n.message}`);return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();l(`remove failed: ${n||"HTTP "+t.status}`);return}await ve()}function An(e){const t=document.getElementById("answers-section");if(!t)return;const n=t.querySelector(".answers-actions"),a=document.createElement("div");a.className="blocks-gate",a.innerHTML=`
    <div class="draft-note">${c(e||"Drafting answers needs an experience page in your brain.")}</div>
    <div class="answers-actions">
      <button class="btn btn-primary" id="answers-fix-btn">View brain knowledge</button>
      <button class="btn" id="answers-retry-btn">Retry</button>
    </div>`,n?n.replaceWith(a):t.appendChild(a);const s=a.querySelector("#answers-fix-btn");s&&s.addEventListener("click",Yn);const o=a.querySelector("#answers-retry-btn");o&&o.addEventListener("click",Mn)}function Hn(e){const t=document.getElementById("answers-section");if(!t)return;const n=document.createElement("div");n.className="draft-note",n.textContent=e,t.appendChild(n)}async function be(e){var d,u;const t=document.getElementById("pane"),n=document.getElementById("scrim"),a=i.openId===e&&t.classList.contains("open"),s=a?((d=document.getElementById("pane-body"))==null?void 0:d.scrollTop)??0:0,o=a?(u=document.getElementById("trace-body"))==null?void 0:u.innerHTML:null;i.openId=e,t.classList.add("open"),n.classList.add("open"),t.setAttribute("aria-hidden","false"),yn("company"),a||(document.getElementById("pane-title").textContent="loading…",document.getElementById("pane-pills").innerHTML="",document.getElementById("pane-body").innerHTML='<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>');let r;try{const p=await fetch(`/api/companies/${e}`);if(!p.ok)throw new Error(`HTTP ${p.status}`);r=await p.json()}catch(p){a||(document.getElementById("pane-body").innerHTML=`<div class="muted">Failed to load detail: ${c(p.message)}</div>`);return}if(i.openId===e){if(Ce(r),a){if(o!=null){const h=document.getElementById("trace-body");h&&(h.innerHTML=o)}const p=document.getElementById("pane-body");p&&(p.scrollTop=s)}Se(e)}}function Te(){i.openId=null,i.openDetail=null,document.getElementById("pane").classList.remove("open"),document.getElementById("scrim").classList.remove("open"),document.getElementById("pane").setAttribute("aria-hidden","true")}function Ce(e){i.openDetail=e,document.getElementById("pane-title").innerHTML=`<input class="ie ie-title" id="pane-title-input" placeholder="company name" value="${c(e.name||"")}">`,document.getElementById("pane-pills").innerHTML=`
    <span class="${y(e.has_verdict?e.verdict:"")}">${c(e.has_verdict?e.verdict:"unscored")}</span>
  `;const t=document.getElementById("pane-chat");t&&(t.style.display=i.meta&&i.meta.chat?"":"none",t.onclick=()=>Vt("company",e.company_id,e.name));const n=e.model==="manual",a=e.has_verdict?`
    <dl class="kv">
      <dt>verdict</dt><dd><span class="${y(e.verdict)}">${c(e.verdict)}</span>${n?' <span class="small muted">· set by hand</span>':""}</dd>
      <dt>reason</dt><dd>${c(e.reason||"")}</dd>
      <dt>model</dt><dd class="small muted">${c(e.model||"")}</dd>
      <dt>taste version</dt><dd class="small muted"><span class="tooltip" title="scored ${c(e.scored_at)} · model ${c(e.model)}">${c(e.taste_version||"")}</span></dd>
      <dt>scored at</dt><dd class="small muted">${c(e.scored_at||"")}</dd>
    </dl>
  `:'<div class="muted">Not yet scored. Run <code>scout verdict</code>, or set one by hand below.</div>',s=`
    <div class="verdict-edit" id="verdict-edit">
      <div class="ve-label muted small">${e.has_verdict?"override verdict":"set verdict"}</div>
      <div class="ve-pick" id="ve-pick">
        ${["yes","maybe","no"].map(g=>`<button type="button" class="ve-opt${e.has_verdict&&e.verdict===g?" is-on":""}" data-v="${g}">${g}</button>`).join("")}
      </div>
      <div class="prow">
        <input class="input" id="ve-reason" placeholder="reason (optional)" value="${n?c(e.reason||""):""}">
        <button class="btn btn-primary" id="ve-save-btn">Save</button>
      </div>
    </div>`,o=e.has_enrichment?`
    <dl class="kv">
      <dt>url</dt><dd>${e.website_url?`<a href="${j(e.website_url)}" target="_blank" rel="noopener">${c(e.website_url)} ↗</a>`:'<span class="muted">—</span>'}</dd>
      <dt>status</dt><dd class="small">${c(e.fetch_status||"")}${e.fetch_error?` <span class="muted">(${c(e.fetch_error)})</span>`:""}</dd>
      <dt>fetched</dt><dd class="small muted">${c(e.fetched_at||"")}</dd>
    </dl>
    ${e.website_summary?`<div class="summary-box">${c(e.website_summary)}</div>`:""}
  `:'<div class="muted">No enrichment yet. Run <code>scout enrich</code>.</div>',r=!i.meta||i.meta.control!==!1,d=r&&i.meta&&i.meta.verdict?'<button class="h3-action" id="rescore-btn" title="re-score just this company — replaces the current verdict, manual or not">↻ re-score</button>':"",u=r&&e.domain?'<button class="h3-action" id="reenrich-btn" title="re-fetch this company’s site now">↻ re-enrich</button>':"",p=Object.keys(e.raw_json||{}).sort(),h=p.length===0?"":`
    <details class="raw-json">
      <summary>Raw row <span class="dim">(${p.length} fields)</span></summary>
      <table><tbody>
        ${p.map(g=>`<tr><td class="k">${c(g)}</td><td>${c(e.raw_json[g])}</td></tr>`).join("")}
      </tbody></table>
    </details>
  `,f=`
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
    ${f}
    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1m-9 0h11a1 1 0 011 1v7a1 1 0 01-1 1H2.5a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>
        Jobs
      </h3>
      <div id="postings-list">${yt(e)}</div>
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
      <div id="facts-body">${ys(e)}</div>
      ${h}
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
  `;const w=document.getElementById("posting-add-btn");w&&w.addEventListener("click",()=>ws(e)),vt(),document.querySelectorAll("#ve-pick .ve-opt").forEach(g=>{g.addEventListener("click",()=>{document.querySelectorAll("#ve-pick .ve-opt").forEach(U=>U.classList.remove("is-on")),g.classList.add("is-on")})});const B=document.getElementById("ve-save-btn");B&&B.addEventListener("click",()=>bs(e)),G(document.getElementById("pane-title-input"),g=>kn(e,"name",g)),document.querySelectorAll("#facts-body [data-k]").forEach(g=>G(g,U=>kn(e,g.dataset.k,U))),G(document.getElementById("pane-domain-input"),g=>Oa(e,g)),G(document.getElementById("pane-notes-input"),g=>Na(e,g),{multiline:!0});const C=document.getElementById("flag-toggle-btn");C&&C.addEventListener("click",()=>Pn(e.company_id));const D=document.getElementById("review-stamp-btn");D&&D.addEventListener("click",()=>vs(e.company_id));const V=document.getElementById("rescore-btn");V&&V.addEventListener("click",()=>$t("verdict",{company_ids:[e.company_id]}));const H=document.getElementById("reenrich-btn");H&&H.addEventListener("click",()=>$t("enrich",{company_ids:[e.company_id]}));const L=document.getElementById("company-delete-btn");L&&L.addEventListener("click",()=>Aa(e))}function ys(e){return`
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
    </dl>`}async function vs(e){const t=document.getElementById("review-stamp-btn");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/companies/${e}/reviewed`,{method:"POST"})}catch(o){l(`failed: ${o.message}`),t&&(t.disabled=!1);return}if(!n.ok){const o=await n.text().catch(()=>"");l(`failed: HTTP ${n.status}${o?" — "+o:""}`),t&&(t.disabled=!1);return}const a=await n.json(),s=i.rows.find(o=>o.company_id===e);s&&(s.reviewed_at=a.reviewed_at,K()),i.openId===e&&(Ce(a),Se(e)),l("reviewed")}async function Pn(e){const t=i.rows.find(o=>o.company_id===e),n=!(t&&t.flagged);let a;try{a=await fetch(`/api/companies/${e}/flagged`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({flagged:n})})}catch(o){l(`failed: ${o.message}`);return}if(!a.ok){const o=await a.text().catch(()=>"");l(`failed: HTTP ${a.status}${o?" — "+o:""}`);return}const s=await a.json();t&&(t.flagged=s.flagged,K()),i.openId===e&&(Ce(s),Se(e)),k(),l(s.flagged?"flagged":"unflagged")}async function bs(e){const t=document.querySelector("#ve-pick .ve-opt.is-on");if(!t){l("Pick yes, maybe, or no.");return}const n=t.dataset.v,a=document.getElementById("ve-reason").value.trim(),s=document.getElementById("ve-save-btn");s.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/verdict`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({verdict:n,reason:a})})}catch(d){l(`save failed: ${d.message}`),s.disabled=!1;return}if(!o.ok){const d=await o.text().catch(()=>"");l(`save failed: HTTP ${o.status}${d?" — "+d:""}`),s.disabled=!1;return}const r=await o.json();Ce(r),Se(r.company_id),P(),T(),k(),l("verdict saved")}function yt(e){const t=e.postings||[];return t.length?t.map(n=>{const a=[n.location,n.source==="capture"?"captured":"added",(n.created_at||"").slice(0,10)].filter(Boolean).map(c).join(" · "),s=n.application_status||"",o=[n.next_up?'<span class="draft-badge db-next" style="margin-left:0" title="queued next up for outreach">next up</span>':"",`<span class="pill ${s?qe(s)||"pill-stage":"pill-none"}">${c(s||"—")}</span>`,`<span class="pt-meta">${s?"tracked":"not applied"}</span>`,`<span class="pt-meta">${n.outreach_count?`${n.outreach_count} sent · last ${c(n.last_outreach_at||"?")}`:"no outreach yet"}</span>`].filter(Boolean).join("");return`
    <div class="brain-node posting-card" data-pid="${c(n.id)}" title="open the pursuit — tracking, outreach, drafts">
      <div class="n"><a href="${j(n.url)}" target="_blank" rel="noopener">${c(n.title||n.url)} ↗</a></div>
      ${n.description?`<div class="small muted" style="margin-top:3px">${c(n.description.length>200?n.description.slice(0,200).trimEnd()+"…":n.description)}</div>`:""}
      ${a?`<div class="l" style="margin-top:3px">${a}</div>`:""}
      <div class="pcard-status">${o}<span class="pcard-open">open →</span></div>
    </div>`}).join(""):'<div class="muted">No job links yet.</div>'}function we(e,t){const n=i.openDetail;if(!n||!i.openId)return;const a=(n.postings||[]).find(o=>String(o.id)===String(e));if(!a)return;Object.assign(a,t);const s=document.getElementById("postings-list");s&&(s.innerHTML=yt(n),vt())}function vt(){document.querySelectorAll("#postings-list .posting-card").forEach(e=>{e.addEventListener("click",t=>{t.target.closest("a")||lt(e.dataset.pid)})})}async function ws(e){const t=document.getElementById("posting-url"),n=document.getElementById("posting-title"),a=document.getElementById("posting-add-btn"),s=t.value.trim();if(!s){l("Enter a URL first."),t.focus();return}a.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/postings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:s,title:n.value.trim()})})}catch(u){l(`add failed: ${u.message}`),a.disabled=!1;return}if(!o.ok){const u=await o.text().catch(()=>"");l(`add failed: HTTP ${o.status}${u?" — "+u:""}`),a.disabled=!1;return}const r=await o.json();e.postings=(e.postings||[]).filter(u=>u.id!==r.id),e.postings.unshift(r);const d=document.getElementById("postings-list");d&&(d.innerHTML=yt(e),vt()),t.value="",n.value="",a.disabled=!1,k(),l("link added")}async function Se(e){let t;try{t=await fetch(`/api/companies/${e}/trace`)}catch(a){De(`<div class="muted">Failed to load trail: ${c(a.message)}</div>`);return}if(!t.ok){De(`<div class="muted">Failed to load trail: HTTP ${t.status}.</div>`);return}const n=(await t.json()).events||[];if(n.length===0){De('<div class="muted">No decision trail yet. Run <code>verdict</code> to record one — every scoring pass is captured here.</div>');return}De(n.map(ks).join(""))}function ks(e){const t=[e.criteria_source,e.taste_version].filter(Boolean).map(c);return e.run_id&&t.push("run "+c(e.run_id.slice(0,8))),`
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
    </div>`}function De(e){const t=document.getElementById("trace-body");t&&(t.innerHTML=e)}let qn;function l(e){const t=document.getElementById("toast");t.textContent=e,t.classList.toggle("err",/\b(fail(ed)?|error|disabled|already running)\b/i.test(e)),t.classList.add("show"),clearTimeout(qn),qn=setTimeout(()=>t.classList.remove("show"),2200)}let bt;const Es=6e3;function Ve(){clearTimeout(bt),bt=void 0}function On(){Ve(),document.getElementById("drawer").classList.remove("open")}function Nn(){Ve(),bt=setTimeout(On,Es)}async function wt(e,t="copied"){if(!e){l("nothing to copy");return}try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(e);else{const n=document.createElement("textarea");n.value=e,n.style.position="fixed",n.style.opacity="0",document.body.appendChild(n),n.select(),document.execCommand("copy"),document.body.removeChild(n)}l(t)}catch(n){l(`copy failed: ${n.message}`)}}i.meta={control:!1,brain:!1,verdict:!1};async function kt(){try{const a=await fetch("/api/meta");if(!a.ok)return;i.meta=await a.json()}catch{return}const e=i.meta.control;document.getElementById("btn-ingest").disabled=!e,document.getElementById("btn-enrich").disabled=!e;const t=document.getElementById("btn-verdict");t.disabled=!e||!i.meta.verdict,t.title=i.meta.verdict?"":"set ANTHROPIC_API_KEY in the server env to enable";const n=document.getElementById("open-chat");n&&(n.style.display=i.meta.chat?"":"none")}async function Et(){let e;try{const a=await fetch("/api/runs");if(!a.ok)return;e=await a.json()}catch{return}const t=e.busy_stage||"",n=document.getElementById("run-busy");t?(n.style.display="",document.getElementById("run-busy-label").textContent=t+" running…"):n.style.display="none",document.getElementById("btn-ingest").classList.toggle("busy",t==="ingest"),document.getElementById("btn-enrich").classList.toggle("busy",t==="enrich"),document.getElementById("btn-verdict").classList.toggle("busy",t==="verdict")}let je=null;async function $t(e,t){if(i.meta&&i.meta.control===!1){l("control surface disabled");return}let n;try{n=await fetch(`/api/run/${e}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t||{})})}catch(s){l(`run failed: ${s.message}`);return}if(n.status===409){l("a job is already running");return}if(n.status===412){const s=await n.text();l(s.trim());return}if(!n.ok){l(`run failed: HTTP ${n.status}`);return}const{job_id:a}=await n.json();Jn(e,a,t)}async function $s(e){const t=new FormData;t.append("csv",e);let n;try{n=await fetch("/api/ingest",{method:"POST",body:t})}catch(s){l(`upload failed: ${s.message}`);return}if(n.status===409){l("a job is already running");return}if(!n.ok){l(`upload failed: HTTP ${n.status}`);return}const{job_id:a}=await n.json();Jn("ingest",a)}const Is=["add-url","add-name","add-location","add-headcount","add-title","add-job-company"];let Ue=[],Q=new Set,X="company";function Rn(e){X=e,document.querySelectorAll("#add-kind .v-chip").forEach(a=>a.classList.toggle("is-on",a.dataset.kind===e)),document.getElementById("add-company-fields").style.display=e==="company"?"":"none",document.getElementById("add-job-fields").style.display=e==="job"?"":"none";const t=document.getElementById("add-url-label"),n=document.getElementById("add-url");e==="company"?(t.innerHTML='Website<span class="req">*</span>',n.placeholder="acme.com"):(t.innerHTML='Posting URL<span class="req">*</span>',n.placeholder="https://… the job posting"),document.getElementById("add-save").textContent=e==="company"?"Add company":"Add job",Dn()}function It(){return!!i.meta.capture&&document.getElementById("add-enrich").checked}function Dn(){const e=document.getElementById("add-note");It()?e.innerHTML=X==="company"?"scout fetches the page and fills the blank fields — your values win. The page text also seeds enrichment, so the next Verdict can score it. Pages behind a login wall (LinkedIn) usually can't be fetched.":"scout fetches the posting and fills in the title, location and description — your values win. The job attaches to its company, adding it to the list first if needed. Pages behind a login wall (LinkedIn) usually can't be fetched.":e.innerHTML=X==="company"?"Stored as source <code>manual</code>. Run Enrich then Verdict to score it. A website already in the list is rejected — manual adds never overwrite an existing company.":"Stored as-is, no fetch. The job attaches to the typed company, or to the link's own domain when the posting lives on the company's site — for an ATS link (greenhouse, lever, …), type the company."}async function xs(){Is.forEach(a=>{document.getElementById(a).value=""}),document.getElementById("add-vertical-filter").value="",Q=new Set;const e=document.getElementById("add-enrich"),t=document.getElementById("add-enrich-row");e.disabled=!i.meta.capture,t.classList.toggle("disabled",!i.meta.capture),t.title=i.meta.capture?"":"set ANTHROPIC_API_KEY in the server env to enable",i.meta.capture||(e.checked=!1),Rn(i.view==="jobs"?"job":"company");const n=document.getElementById("add-stage");n.innerHTML='<option value="">—</option>',document.getElementById("add-vertical-chips").innerHTML='<div class="none">loading…</div>',document.getElementById("add-company-names").innerHTML=(i.rows||[]).map(a=>`<option value="${c(a.name)}">`).join(""),document.getElementById("add-scrim").classList.add("open"),document.getElementById("add-url").focus();try{const a=await(await fetch("/api/facets")).json();(a.funding_stages||[]).forEach(s=>{const o=document.createElement("option");o.value=s,o.textContent=s,n.appendChild(o)}),Ue=a.verticals||[]}catch{Ue=[]}Vn()}function Fe(){document.getElementById("add-scrim").classList.remove("open")}function Vn(){const e=document.getElementById("add-vertical-chips"),t=document.getElementById("add-vertical-filter").value.trim().toLowerCase(),n=Ue.filter(a=>!t||a.toLowerCase().includes(t));n.length?(e.innerHTML=n.map(a=>`<button type="button" class="vchip${Q.has(a)?" sel":""}" data-v="${c(a)}">${c(a)}</button>`).join(""),e.querySelectorAll(".vchip").forEach(a=>a.addEventListener("click",()=>{const s=a.dataset.v;Q.has(s)?Q.delete(s):Q.add(s),a.classList.toggle("sel"),Un()}))):e.innerHTML=`<div class="none">${Ue.length?"no match":"no verticals in the set yet"}</div>`,Un()}function Un(){const e=Q.size;document.getElementById("add-vertical-count").textContent=e?`· ${e} selected`:""}function Fn(e){return/^https?:\/\//i.test(e)?e:"https://"+e}async function zn(){const e=document.getElementById("add-url"),t=e.value.trim();if(!t){l(X==="company"?"Website is required.":"Posting URL is required."),e.focus();return}const n=document.getElementById("add-save"),a=n.textContent;n.disabled=!0,It()&&(n.textContent="reading page…");const s=()=>{n.disabled=!1,n.textContent=a},o=f=>document.getElementById(f).value.trim(),r=It();let d,u;r?(d="/api/capture",u={url:Fn(t),kind:X==="company"?"company_page":"job_posting",fields:X==="company"?{name:o("add-name"),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value,vertical:[...Q].join(", ")}:{name:o("add-job-company"),title:o("add-title")}}):X==="company"?(d="/api/companies",u={website:t,name:o("add-name"),vertical:[...Q].join(", "),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value}):(d="/api/postings",u={url:Fn(t),title:o("add-title"),company:o("add-job-company")});let p;try{p=await fetch(d,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(u)})}catch(f){l(`add failed: ${f.message}`),s();return}if(!p.ok){let f=`HTTP ${p.status}`;try{const w=await p.text();try{f=JSON.parse(w).error||f}catch{f=w.trim()||f}}catch{}if(s(),p.status===409){l(f||"That company is already in the list."),e.focus(),e.select();return}l(`add failed: ${f}`);return}const h=await p.json();if(s(),r&&!h.company_id){l(h.note||"couldn't classify that page");return}if(Fe(),P(),T(),k(),X==="job"){const f=h.posting&&h.posting.title||"job link";l(`tracking: ${f} @ ${h.company_name}${h.posting_updated?" (refreshed)":""}`),q("jobs")}else r?(l(h.note||(h.company_created?`company added: ${h.company_name}`:`${h.company_name} is already in the list`)),be(h.company_id)):l("company added")}function Jn(e,t,n){je=t,Ve();const a=document.getElementById("drawer"),s=document.getElementById("drawer-log");document.getElementById("drawer-title").textContent=e,document.getElementById("drawer-spinner").style.display="",document.getElementById("drawer-cancel").style.display="",document.getElementById("drawer-close").style.display="none",s.innerHTML="";const o=document.getElementById("drawer-summary");o.hidden=!0,o.innerHTML="",a.classList.add("open"),Et();const r={yes:0,maybe:0,no:0},d=/^(.+?)\s*→\s*(yes|maybe|no)\s*—\s*([\s\S]*)$/i,u=new EventSource(`/api/jobs/${t}/stream`),p=(h,f)=>{const w=document.createElement("div");let B;if(!f&&(B=h.match(d))){const C=B[2].toLowerCase();r[C]++,w.className="ln ln-verdict";const D=document.createElement("span");D.className="pill pill-"+C,D.textContent=C;const V=document.createElement("span");V.className="lv-text";const H=document.createElement("span");H.className="lv-name",H.textContent=B[1].trim(),V.appendChild(H);const L=(B[3]||"").trim();if(L){const g=document.createElement("span");g.className="lv-reason",g.textContent=L,V.append(" ",g)}w.append(D,V)}else if(!f&&/^(scoring|enriching|ingesting)\b/i.test(h))w.className="ln ln-head",w.textContent=h;else if(!f&&/^·\s/.test(h))w.className="ln ln-pick",w.textContent=h;else{const C=!f&&/^\s*warn:/i.test(h);w.className="ln"+(f?" ln-err":C?" ln-warn":""),w.textContent=C?h.replace(/^\s*warn:\s*/i,"⚠ "):h}s.appendChild(w),s.scrollTop=s.scrollHeight};u.addEventListener("line",h=>p(h.data,/error|failed/i.test(h.data))),u.addEventListener("end",h=>{if(u.close(),je=null,p(`— ${h.data} —`,h.data==="failed"),document.getElementById("drawer-spinner").style.display="none",document.getElementById("drawer-cancel").style.display="none",document.getElementById("drawer-close").style.display="",r.yes+r.maybe+r.no>0){for(const w of["yes","maybe","no"]){if(!r[w])continue;const B=document.createElement("span");B.className="pill pill-"+w,B.textContent=`${r[w]} ${w}`,o.appendChild(B)}o.hidden=!1}Nn(),l(`${e} ${h.data}`),n&&Array.isArray(n.company_ids)&&n.company_ids.length>0?ya(n.company_ids):P(),T(),Et(),k(),i.openId&&be(i.openId)}),u.onerror=()=>{u.close()}}async function Ls(){if(je)try{await fetch(`/api/jobs/${je}/cancel`,{method:"POST"})}catch{}}let O=null;const _s={researcher:"researcher",fill:"writer",humanizer:"humanizer",honesty:"honesty check"};function xt(e){return e==="application-stages"||e==="outreach-statuses"}function ze(e){if(e==="outreach-template")return"email body";if(e==="outreach-subject")return"email subject";if(e==="outreach-signature")return"email signature";if(e==="followup-template")return"follow-up template";if(e==="followup-subject")return"follow-up subject";if(e==="playbook")return"playbook";if(e==="application-stages")return"application stages";if(e==="outreach-statuses")return"outreach statuses";if(e&&e.startsWith("outreach-prompts/")){const t=e.slice(17);return(_s[t]||t)+" prompt"}return e+".md"}async function z(e){O=e;const t=document.getElementById("editor-scrim");document.getElementById("editor-title").textContent="edit "+ze(e),document.getElementById("editor-text").value="loading…",document.getElementById("editor-ver").textContent="";const n=!!e&&e.startsWith("outreach-prompts/"),a=n?e.slice(17):"",s=n&&a!=="fill";document.getElementById("editor-toggle-row").style.display=s?"":"none",document.getElementById("editor-reset").style.display=n?"":"none",s&&(document.getElementById("editor-toggle-label").textContent="Run this stage (off → it is skipped in the pipeline)"),t.classList.add("open");try{const o=await fetch(`/api/${e}`);if(!o.ok){const d=(await o.text().catch(()=>"")).trim();document.getElementById("editor-text").value=o.status===404?"failed to load: HTTP 404 — this route is missing. Restart the scout server (your running binary may predate this feature).":`failed to load: ${d||"HTTP "+o.status}`;return}const r=await o.json();xt(e)?(document.getElementById("editor-title").textContent="edit "+ze(e)+" — one per line",document.getElementById("editor-text").value=(r.statuses||[]).join(`
`)):document.getElementById("editor-text").value=r.content||"",s&&(document.getElementById("editor-enabled").checked=r.enabled!==!1),r.taste_version&&(document.getElementById("editor-ver").textContent="version "+r.taste_version)}catch(o){document.getElementById("editor-text").value="failed to load: "+o.message}}function Je(){document.getElementById("editor-scrim").classList.remove("open"),O=null}let x=null,Lt=[],_t=[];const Bs=["location.allowed","verticals.excluded","verticals.allowed"],Bt={"verticals.excluded":"pf-vertical-tags","verticals.allowed":"pf-vertical-tags"};function ee(e){const[t,n]=e.split(".");return x[t]&&x[t][n]||[]}function Ge(e,t){const[n,a]=e.split(".");(x[n]=x[n]||{})[a]=t}function Ke(e,t){const n=t.toLowerCase();return e.some(a=>String(a).toLowerCase()===n)}function Tt(){Bs.forEach(e=>{const t=document.querySelector(`.pf-chips[data-field="${e}"]`);if(!t)return;const n=Bt[e]?` list="${Bt[e]}"`:"",a=Bt[e]?"type to search…":"type &amp; Enter…";t.innerHTML=ee(e).map((s,o)=>`<span class="pf-chip">${c(s)}<button class="pf-chip-x" data-field="${e}" data-i="${o}" title="remove" aria-label="remove ${c(s)}">×</button></span>`).join("")+`<input class="pf-chip-input" data-field="${e}"${n} type="text" placeholder="${a}" spellcheck="false" autocomplete="off" />`})}function Ts(e,t){var a;const n=(t||"").trim();if(n){const s=ee(e);Ke(s,n)||Ge(e,[...s,n])}Tt(),(a=document.querySelector(`.pf-chip-input[data-field="${e}"]`))==null||a.focus()}function Gn(e,t){const n=ee(e).slice();n.splice(t,1),Ge(e,n),Tt()}function Kn(){const e=document.getElementById("pf-stages");if(!e)return;const t=ee("funding_stage.allowed");e.innerHTML=_t.map(n=>{const a=Ke(t,n.value),s=n.count?` <span class="pf-stage-n">${n.count}</span>`:"";return`<button class="pf-stage${a?" is-on":""}" data-stage="${c(n.value)}">${c(n.value)}${s}</button>`}).join("")}function Cs(e){const t=ee("funding_stage.allowed");Ge("funding_stage.allowed",Ke(t,e)?t.filter(n=>String(n).toLowerCase()!==e.toLowerCase()):[...t,e]),Kn()}function Ss(){const e=document.getElementById("pf-vertical-tags");e&&(e.innerHTML=Lt.map(t=>`<option value="${c(t.value)}" label="${t.count}"></option>`).join(""))}function js(){return{location:{allowed:[],remote_ok:!0},headcount:{min:0,max:0},verticals:{allowed:[],excluded:[]},funding_stage:{allowed:[]}}}async function Wn(e=!1){document.getElementById("prefilter-scrim").classList.add("open");try{const[t,n]=await Promise.all([(await fetch("/api/taste-filter"+(e?"?default=1":""))).json(),Lt.length||_t.length?Promise.resolve(null):fetch("/api/filter-options").then(a=>a.json()).catch(()=>null)]);n&&(Lt=n.verticals||[],_t=n.stages||[]),x=Object.assign(js(),t.rules||{}),x.location=Object.assign({allowed:[],remote_ok:!0},x.location),x.headcount=Object.assign({min:0,max:0},x.headcount),x.verticals=Object.assign({allowed:[],excluded:[]},x.verticals),x.funding_stage=Object.assign({allowed:[]},x.funding_stage),e||(document.getElementById("pf-enabled").checked=t.enabled!==!1),document.getElementById("pf-remote-ok").checked=!!x.location.remote_ok,document.getElementById("pf-hc-min").value=String(x.headcount.min||0),document.getElementById("pf-hc-max").value=String(x.headcount.max||0),Ss(),Tt(),Kn()}catch(t){l(`failed to load pre-filter: ${t.message}`)}}function We(){document.getElementById("prefilter-scrim").classList.remove("open"),x=null}async function Ms(){if(!x)return;x.location.remote_ok=document.getElementById("pf-remote-ok").checked,x.headcount.min=Math.max(0,parseInt(document.getElementById("pf-hc-min").value,10)||0),x.headcount.max=Math.max(0,parseInt(document.getElementById("pf-hc-max").value,10)||0),document.querySelectorAll(".pf-chip-input").forEach(n=>{const a=n.value.trim();a&&!Ke(ee(n.dataset.field),a)&&Ge(n.dataset.field,[...ee(n.dataset.field),a])});const e=document.getElementById("pf-enabled").checked;let t;try{t=await fetch("/api/taste-filter",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({rules:x,enabled:e})})}catch(n){l(`save failed: ${n.message}`);return}if(!t.ok){l(`save failed: ${(await t.text().catch(()=>"")).trim()||"HTTP "+t.status}`);return}l("pre-filter saved"),We(),T()}const As=[{key:"experience",hard:!0},{key:"voice",hard:!1},{key:"logistics",hard:!1}];async function Yn(){document.getElementById("sources-scrim").classList.add("open"),document.getElementById("sources-list").innerHTML='<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>';try{Hs(await(await fetch("/api/outreach/sources")).json())}catch(e){l(`failed to load sources: ${e.message}`)}}function Ct(){document.getElementById("sources-scrim").classList.remove("open")}function Hs(e){const t=document.getElementById("sources-list");if(!t)return;const n=e&&e.needs&&e.needs.length?e.needs.map(s=>({key:s.Key||s.key,hard:s.Hard??s.hard})):As,a={};(e&&e.sources||[]).forEach(s=>{(a[s.need]=a[s.need]||[]).push(s)}),t.innerHTML=n.map(s=>{const o=a[s.key]||[],r=o.length?o.map(d=>`<li><span class="src-title">${c(d.title||d.page_id)}</span></li>`).join(""):`<li class="dim small">${s.hard?"none yet — add an experience page to your brain":"none (optional)"}</li>`;return`<div class="src-need">
      <div class="src-need-h">${c(s.key)}${s.hard?' <span class="dim">required</span>':' <span class="dim">optional</span>'}</div>
      <ul class="src-items">${r}</ul></div>`}).join("")}async function Ps(){if(!O)return;const e=document.getElementById("editor-text").value;let t;xt(O)?t={statuses:e.split(/\r?\n/).map(o=>o.trim()).filter(Boolean)}:(t={content:e},O.startsWith("outreach-prompts/")&&O!=="outreach-prompts/fill"&&(t.enabled=document.getElementById("editor-enabled").checked));let n;try{n=await fetch(`/api/${O}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})}catch(o){l(`save failed: ${o.message}`);return}if(!n.ok){l(`save failed: ${(await n.text().catch(()=>"")).trim()||"HTTP "+n.status}`);return}const a=await n.json();a.taste_version&&(document.getElementById("editor-ver").textContent="version "+a.taste_version);const s=xt(O);O==="followup-template"&&(i.followupTemplate=e),l(`${ze(O)} saved`),Je(),s&&M(),T()}async function qs(){if(!O||!O.startsWith("outreach-prompts/"))return;let e;try{e=await fetch(`/api/${O}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({reset:!0})})}catch(n){l(`reset failed: ${n.message}`);return}if(!e.ok){l(`reset failed: HTTP ${e.status}`);return}const t=await e.json();document.getElementById("editor-text").value=t.content||"",l(`${ze(O)} reset to default`)}function Zn(e,t,n){e.k!==t?(e.k=t,e.dir=1):e.dir===1?e.dir=-1:Object.assign(e,n)}document.querySelectorAll("#t thead th[data-k]").forEach(e=>{e.onclick=()=>{Zn(i.sort,e.dataset.k,v),K()}}),document.querySelectorAll("#jt thead th[data-jk]").forEach(e=>{e.onclick=()=>{Zn(i.jsort,e.dataset.jk,E),A()}}),document.getElementById("tab-companies").onclick=()=>q("companies"),document.getElementById("tab-jobs").onclick=()=>q("jobs"),document.getElementById("q").oninput=K,document.getElementById("fdrop-cfilters-menu").addEventListener("click",e=>{const t=e.target.closest(".fdrop-item");if(t){if(t.dataset.toggle==="flagged")le=!le,se(t,le);else if(t.dataset.toggle==="enriched")de=!de,se(t,de);else if(t.hasAttribute("data-v")){const n=t.getAttribute("data-v");J.has(n)?J.delete(n):J.add(n),se(t,J.has(n))}else return;K()}}),document.getElementById("fdrop-columns-menu").addEventListener("click",e=>{const t=e.target.closest(".fdrop-item[data-col]");if(!t)return;const n=ot(),a=t.getAttribute("data-col");n.hidden.has(a)?n.hidden.delete(a):n.hidden.add(a),localStorage.setItem(n.key,JSON.stringify([...n.hidden])),se(t,!n.hidden.has(a)),ue(),en()}),document.getElementById("jq").oninput=A;for(const e of["fdrop-cfilters","fdrop-columns","fdrop-jfilters"]){const t=document.getElementById(e);t.querySelector(".fdrop-btn").addEventListener("click",a=>{a.stopPropagation();const s=t.classList.contains("is-open");rt(),s||wa(t)}),t.querySelector(".fdrop-menu").addEventListener("click",a=>a.stopPropagation())}document.addEventListener("click",rt),document.getElementById("fdrop-jfilters-menu").addEventListener("click",e=>{const t=e.target.closest(".fdrop-item");if(t){if(t.hasAttribute("data-stage")){const n=t.getAttribute("data-stage");_.has(n)?_.delete(n):_.add(n),se(t,_.has(n))}else if(t.dataset.toggle==="nextup")pe=!pe,se(t,pe);else if(t.hasAttribute("data-status")){const n=t.getAttribute("data-status");Y.has(n)?Y.delete(n):Y.add(n),se(t,Y.has(n))}else return;A()}}),pa(),Xt(),ue(),document.getElementById("pane-close").onclick=Te,document.getElementById("scrim").onclick=Te,document.getElementById("pursuit-close").onclick=xe,document.getElementById("pursuit-scrim").onclick=xe,document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(document.querySelector(".fdrop.is-open")){rt();return}if(document.getElementById("chat-pane").classList.contains("open")){Ut();return}if(Ws()){Ot();return}if(document.getElementById("profile-scrim").classList.contains("open")){qt();return}if(document.getElementById("add-scrim").classList.contains("open")){Fe();return}if(document.getElementById("run-scrim").classList.contains("open")){Ye();return}if(document.getElementById("help-scrim").classList.contains("open")){Ze();return}if(document.getElementById("relink-scrim").classList.contains("open")){fe();return}if(document.getElementById("delcompany-scrim").classList.contains("open")){Oe();return}if(document.getElementById("deljob-scrim").classList.contains("open")){Ne();return}const t=document.getElementById("pane").classList.contains("open"),n=document.getElementById("pursuit-pane").classList.contains("open");if(t||n){if(dt==="pursuit"&&n){xe();return}if(dt==="company"&&t){Te();return}if(t){Te();return}xe();return}if(document.getElementById("key-scrim").classList.contains("open")){Pt();return}if(document.getElementById("sources-scrim").classList.contains("open")){Ct();return}if(document.getElementById("prefilter-scrim").classList.contains("open")){We();return}if(document.getElementById("editor-scrim").classList.contains("open")){Je();return}if(document.getElementById("settings-scrim").classList.contains("open")){Nt();return}});let St=null;const Os={enrich:"Fetches and summarizes each company's pages, filling its enrichment row.",verdict:"Scores every company against your criteria — one LLM call each. Only companies with a successful enrichment are scored."};function Qn(e){if(i.meta&&i.meta.control===!1){l("control surface disabled");return}St=e,document.getElementById("run-title").textContent="Run "+e,document.getElementById("run-desc").textContent=Os[e]||"",document.getElementById("run-only-blanks").checked=!1,document.getElementById("run-workers-input").value=e==="verdict"?10:8;const t=document.getElementById("run-warn"),n=i.stats||{},a=Math.max(0,(n.total_companies||0)-(n.enriched_ok||0));e==="verdict"&&a>0?(document.getElementById("run-warn-text").textContent=`${a} ${a===1?"company isn't":"companies aren't"} enriched yet — verdict will skip ${a===1?"it":"them"}. Run Enrich first to include ${a===1?"it":"them"}.`,t.style.display=""):t.style.display="none",document.getElementById("run-scrim").classList.add("open")}function Ye(){document.getElementById("run-scrim").classList.remove("open"),St=null}document.getElementById("btn-enrich").onclick=()=>Qn("enrich"),document.getElementById("btn-verdict").onclick=()=>Qn("verdict"),document.getElementById("run-cancel").onclick=Ye,document.getElementById("run-scrim").onclick=e=>{e.target.id==="run-scrim"&&Ye()},document.getElementById("run-go").onclick=()=>{const e=St,t=document.getElementById("run-only-blanks").checked,n=parseInt(document.getElementById("run-workers-input").value,10);if(Ye(),!e)return;const a={};t&&(a.only_blanks=!0),n>0&&(a.workers=n),$t(e,a)},document.getElementById("btn-ingest").onclick=()=>document.getElementById("csv-file").click(),document.getElementById("btn-add").onclick=xs;const Ns={add:{title:"Add data",intro:"Two ways to get companies and jobs into scout.",items:[{name:"Ingest CSV",sec:"ingest",desc:"Bulk-import companies from a CSV export (e.g. Crunchbase). Columns are mapped to company fields and new rows are created."},{name:"Add",sec:"ingest",desc:"Add one company or job from its link. Tick “fill in the blanks” to let an ATS API (ashby/greenhouse/lever) or one cheap agent pass complete the details."}]},run:{title:"Run the pipeline",intro:"Enrich must run before Verdict — verdict only scores companies that already have a successful enrichment row.",items:[{name:"Enrich",sec:"enrich",desc:"Fetches and summarizes each company's web presence into an enrichment row. A prerequisite for Verdict."},{name:"Verdict",sec:"verdict",desc:"Scores each enriched company against your criteria with the LLM, producing a yes / maybe / no with reasoning."}]}};function Xn(e){const t=Ns[e];if(!t)return;document.getElementById("help-title").textContent=t.title;const n=document.getElementById("help-items");if(n.innerHTML="",t.intro){const a=document.createElement("p");a.className="help-intro",a.textContent=t.intro,n.appendChild(a)}t.items.forEach(a=>{const s=document.createElement("div");s.className="help-item";const o=document.createElement("div");o.className="help-item-name",o.textContent=a.name;const r=document.createElement("div");r.className="help-item-desc",r.textContent=a.desc;const d=document.createElement("a");d.className="help-link",d.textContent="Learn more →",d.onclick=()=>{Ze(),sa(),Ys(a.sec)},s.appendChild(o),s.appendChild(r),s.appendChild(d),n.appendChild(s)}),document.getElementById("help-scrim").classList.add("open")}function Ze(){document.getElementById("help-scrim").classList.remove("open")}document.getElementById("help-add").onclick=()=>Xn("add"),document.getElementById("help-run").onclick=()=>Xn("run"),document.getElementById("help-close").onclick=Ze,document.getElementById("help-scrim").onclick=e=>{e.target.id==="help-scrim"&&Ze()},document.getElementById("add-cancel").onclick=Fe,document.getElementById("add-save").onclick=zn,document.getElementById("add-scrim").onclick=e=>{e.target.id==="add-scrim"&&Fe()},document.querySelectorAll("#add-kind .v-chip").forEach(e=>{e.onclick=()=>Rn(e.dataset.kind)}),document.getElementById("add-enrich").addEventListener("change",Dn),document.getElementById("add-scrim").addEventListener("keydown",e=>{e.key==="Enter"&&(e.target.tagName!=="INPUT"||e.target.type==="checkbox"||e.target.id==="add-vertical-filter"||e.target.id==="add-job-company"||(e.preventDefault(),zn()))}),document.getElementById("add-vertical-filter").addEventListener("input",Vn),document.getElementById("add-headcount").addEventListener("input",e=>{const t=e.target.value.replace(/[^0-9]/g,"");t!==e.target.value&&(e.target.value=t)}),document.getElementById("csv-file").onchange=e=>{const t=e.target.files&&e.target.files[0];t&&$s(t),e.target.value=""},document.getElementById("drawer-cancel").onclick=Ls,document.getElementById("drawer-close").onclick=On,(()=>{const e=document.getElementById("drawer");e.addEventListener("mouseenter",Ve),e.addEventListener("mouseleave",()=>{!je&&e.classList.contains("open")&&Nn()})})(),document.getElementById("editor-cancel").onclick=Je,document.getElementById("editor-save").onclick=Ps,document.getElementById("editor-reset").onclick=qs,document.getElementById("editor-scrim").onclick=e=>{e.target.id==="editor-scrim"&&Je()},document.getElementById("sources-close").onclick=Ct,document.getElementById("sources-scrim").onclick=e=>{e.target.id==="sources-scrim"&&Ct()},document.getElementById("pf-cancel").onclick=We,document.getElementById("pf-save").onclick=Ms,document.getElementById("pf-reset").onclick=()=>Wn(!0),document.getElementById("prefilter-scrim").addEventListener("click",e=>{var s;if(e.target.id==="prefilter-scrim"){We();return}const t=e.target.closest(".pf-stage");if(t){Cs(t.dataset.stage);return}const n=e.target.closest(".pf-chip-x");if(n){Gn(n.dataset.field,parseInt(n.dataset.i,10));return}const a=e.target.closest(".pf-chips");a&&e.target===a&&((s=a.querySelector(".pf-chip-input"))==null||s.focus())}),document.getElementById("prefilter-scrim").addEventListener("keydown",e=>{const t=e.target.closest(".pf-chip-input");if(t){if(e.key==="Enter"||e.key===",")e.preventDefault(),Ts(t.dataset.field,t.value);else if(e.key==="Backspace"&&!t.value){const n=ee(t.dataset.field);n.length&&Gn(t.dataset.field,n.length-1)}}}),document.getElementById("key-cancel").onclick=Pt,document.getElementById("key-save").onclick=aa,document.getElementById("key-remove").onclick=Js,document.getElementById("key-scrim").onclick=e=>{e.target.id==="key-scrim"&&Pt()},document.getElementById("key-input").addEventListener("keydown",e=>{e.key==="Enter"&&(e.preventDefault(),aa())}),document.getElementById("delcompany-cancel").onclick=Oe,document.getElementById("delcompany-confirm").onclick=Ha,document.getElementById("delcompany-scrim").onclick=e=>{e.target.id==="delcompany-scrim"&&Oe()},document.getElementById("deljob-cancel").onclick=Ne,document.getElementById("deljob-confirm").onclick=qa,document.getElementById("deljob-scrim").onclick=e=>{e.target.id==="deljob-scrim"&&Ne()},document.getElementById("relink-cancel").onclick=fe,document.getElementById("relink-scrim").onclick=e=>{e.target.id==="relink-scrim"&&fe()},document.getElementById("relink-search").addEventListener("input",e=>{bn(e.target.value)}),document.getElementById("relink-search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const t=document.querySelector("#relink-results .relink-result:not([disabled])");t&&wn(t.dataset.id)}}),document.getElementById("relink-results").addEventListener("click",e=>{const t=e.target.closest(".relink-result");t&&!t.disabled&&wn(t.dataset.id)});function jt(e){if(e==null)return"—";let t=Math.max(0,e|0);if(t<90)return`${t}s ago`;const n=Math.round(t/60);if(n<90)return`${n}m ago`;const a=Math.round(n/60);return a<48?`${a}h ago`:`${Math.round(a/24)}d ago`}async function Mt(){try{const e=await fetch("/api/profile");if(!e.ok)throw new Error(`HTTP ${e.status}`);i.profile=await e.json()}catch{i.profile=null}te()}const R='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.6 2.4a1.2 1.2 0 0 1 1.7 1.7L5.6 11.8l-3 1 1-3z"/><path d="M10.4 3.6l2 2"/></svg>',Qe='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 8a5.4 5.4 0 1 1-1.5-3.8"/><path d="M13.6 2.6V5.2H11"/></svg>',Rs='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="11" r="2.6"/><path d="M6.9 9.1 13 3M11 5l1.6 1.6M9.3 6.7l1.6 1.6"/></svg>',ea='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="2.4"/></svg>',Ds='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.2h7.2a1.6 1.6 0 0 1 1.6 1.6v8H4.6A1.6 1.6 0 0 1 3 11.2z"/><path d="M11.8 12.8h1.4v-9A1.6 1.6 0 0 0 11.6 2.4H5.4"/><path d="M5.4 5.8h3.6M5.4 8.2h3.6"/></svg>',ke='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3.5" width="12" height="9" rx="1.6"/><path d="M2.6 4.6 8 8.8l5.4-4.2"/></svg>',At='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.2h5.4l2.6 2.6v9H4z"/><path d="M9.4 2.2v2.6H12"/><path d="M6 7h4M6 9.2h4M6 11.4h2.4"/></svg>',Vs='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.4 3.4h11.2L9.4 8.4v4.2l-2.8 1.4V8.4z"/></svg>',Xe='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 7a3.8 3.8 0 0 1 7.6 0c0 3 1.2 4 1.2 4H3s1.2-1 1.2-4z"/><path d="M6.7 13a1.5 1.5 0 0 0 2.6 0"/></svg>';function N(e){const t=e.dot||e.note?`<div class="crit-status">${e.dot?`<span class="pf-dot ${e.dot}"></span>`:""}${e.note?`<span class="crit-note-t">${c(e.note)}</span>`:""}</div>`:"",n=e.actID?` id="${e.actID}"`:"",a=e.act?`<button class="crit-edit"${n} data-act="${e.act}" title="${e.actTitle}" aria-label="${e.actLabel}">${e.actIcon}</button>`:"";return`<div class="settings-item">
    <span class="settings-item-icon">${e.icon}</span>
    <div class="settings-item-main">
      <div class="settings-item-name">${e.nameHTML}</div>
      <div class="settings-item-desc">${c(e.desc)}</div>
      ${t}
    </div>
    ${a}
  </div>`}function te(){const e=document.getElementById("criteria-stats");if(!e)return;const t=i.profile,a=(t&&t.active_source||i.stats&&i.stats.taste_source||"").startsWith("brain:"),s=t&&typeof t.body=="string";let o;if(a){let $="off",S="";const Me=t&&t.criteria_state;Me==="current"?($="ok",S="current · verified "+jt(t.verified_age_seconds)):Me==="changed"?($="warn",S="changed — re-distill"):Me==="unverified"?($="warn",S=t&&!t.reachable&&s?"brain offline · using cache":"unverified — re-distill"):t&&!t.reachable&&s?($="warn",S="brain offline · using cache"):s&&($="ok",S="fetched "+jt(t.age_seconds)),o=N({icon:ea,nameHTML:s?'<span class="edit-link" data-act="view-profile" title="view the company-fit brief">company-fit brief</span>':"company-fit brief",dot:$,note:S,desc:"The criteria scout feeds the verdict stage — distilled from the brain.",act:"refresh-profile",actID:"refresh-profile",actIcon:Qe,actTitle:"re-distill the company-fit brief from the brain",actLabel:"refresh company-fit brief"})}else o=N({icon:ea,nameHTML:'<span class="edit-link" data-act="edit-taste" title="edit taste.md">taste</span>',note:t&&t.configured?"brain offline — local fallback":"",dot:t&&t.configured?"warn":"",desc:"Local fallback criteria used when the brain is unreachable.",act:"edit-taste",actIcon:R,actTitle:"edit taste.md",actLabel:"edit taste"});const r=N({icon:Ds,nameHTML:'<span class="edit-link" data-act="edit-playbook" title="edit the verdict playbook">playbook</span>',desc:"How scout judges — the reasoning rules behind every verdict.",act:"edit-playbook",actIcon:R,actTitle:"edit the verdict playbook",actLabel:"edit playbook"}),d=N({icon:ke,nameHTML:'<span class="edit-link" data-act="edit-subject" title="edit the email subject">email subject</span>',desc:"The send subject — plain {{role}} / {{company}} substitution, no LLM.",act:"edit-subject",actIcon:R,actTitle:"edit the email subject",actLabel:"edit email subject"}),u=N({icon:ke,nameHTML:'<span class="edit-link" data-act="edit-template" title="edit the email body">email body</span>',desc:"The email body — verbatim prose with the writer's fill-in holes.",act:"edit-template",actIcon:R,actTitle:"edit the email body",actLabel:"edit email body"}),p=N({icon:ke,nameHTML:'<span class="edit-link" data-act="edit-signature" title="edit the email signature">email signature</span>',desc:"A fixed sign-off block appended to every sent email (blank = none).",act:"edit-signature",actIcon:R,actTitle:"edit the email signature",actLabel:"edit email signature"}),h=N({icon:ke,nameHTML:'<span class="edit-link" data-act="edit-followup-template" title="edit the follow-up template">follow-up template</span>',desc:"Copy-paste follow-up — variables {{contact_name}}, {{role}}, {{company}}, {{last_sent}}, {{last_message}}.",act:"edit-followup-template",actIcon:R,actTitle:"edit the follow-up template",actLabel:"edit follow-up template"}),f=N({icon:ke,nameHTML:'<span class="edit-link" data-act="edit-followup-subject" title="edit the follow-up subject">follow-up subject</span>',desc:"The follow-up subject — {{role}} / {{company}} substitution.",act:"edit-followup-subject",actIcon:R,actTitle:"edit the follow-up subject",actLabel:"edit follow-up subject"}),w=`<div class="settings-item">
    <span class="settings-item-icon">${Xe}</span>
    <div class="settings-item-main">
      <div class="settings-item-name">follow-up reminder</div>
      <div class="settings-item-desc">Business days after a send before a follow-up comes due (0 = off).</div>
    </div>
    <input class="input set-fu-interval" type="number" min="0" max="90" value="${i.followupInterval}" title="business days (0 = off)" aria-label="follow-up reminder interval in business days">
  </div>`,B=[["researcher","1 · Researcher","Searches the web for true company facts and the best hooks to open with."],["fill","2 · Writer","Writes the email's blanks from the research, your experience, and your voice."],["humanizer","3 · Humanizer","Strips AI tells and matches your voice — never changes a fact."],["honesty","4 · Honesty check","Vetoes any claim about you beyond your documented experience."]],C=B.map(([$,S,Me])=>N({icon:At,nameHTML:`<span class="edit-link" data-act="edit-prompt-${$}" title="edit the ${S.replace(/^\d+ · /,"")} prompt">${S}</span>`,desc:Me,act:`edit-prompt-${$}`,actIcon:R,actTitle:`edit the ${S} prompt`,actLabel:`edit ${S} prompt`})).join(""),D=!i.stats||i.stats.taste_filter_enabled!==!1,V=N({icon:Vs,nameHTML:'<span class="edit-link" data-act="edit-taste-filter" title="edit the pre-filter rules">pre-filter</span>',desc:"Cheap mechanical gate that narrows bulk verdict runs before the paid LLM — location, headcount, vertical, stage. Re-scoring one company by hand ignores it.",dot:D?"ok":"off",note:D?"active":"disabled — scoring everything",act:"edit-taste-filter",actIcon:R,actTitle:"edit the pre-filter rules",actLabel:"edit pre-filter rules"}),H=i.anthropicKey;let L="off",g="not set — verdict, capture & outreach disabled";H&&H.key_source==="db"?(L="ok",g="set here · active"):H&&H.key_source==="env"&&(L="ok",g="from the environment");const U=N({icon:Rs,nameHTML:'<span class="edit-link" data-act="edit-anthropic-key" title="set the Anthropic API key">Anthropic API key</span>',dot:L,note:g,desc:"Powers scoring, capture & outreach. Set here to run scout without the env var.",act:"edit-anthropic-key",actIcon:R,actTitle:"set the Anthropic API key",actLabel:"set Anthropic API key"}),W=i.gmail||{};let Ft="off",Ee="not connected",zt="gmail-connect",da="connect Gmail",Jt="connect a Gmail account to send + sync";W.configured?W.connected?(Ft="ok",Ee=`connected as ${W.email||"(unknown)"}`,zt="gmail-disconnect",da="disconnect Gmail",Jt="disconnect this Gmail account"):Ee="configured — not connected":Ee="OAuth client not set (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET)";const fo=N({icon:ke,nameHTML:`<span class="edit-link" data-act="${zt}" title="${Jt}">Gmail</span>`,dot:Ft,note:Ee,desc:"Send outreach from your Gmail and auto-sync replies + application status.",act:zt,actIcon:R,actTitle:Jt,actLabel:da}),go=!!(i.gmail&&i.gmail.autoflip),yo=`<div class="settings-item">
    <span class="settings-item-icon">${Xe}</span>
    <div class="settings-item-main">
      <div class="settings-item-name">auto-update application status</div>
      <div class="settings-item-desc">On: scout sets a job's application status from incoming ATS/company mail. Off (default): it suggests it in the Inbox for one-click apply.</div>
    </div>
    <input type="checkbox" class="set-autoflip" ${go?"checked":""} title="auto-update application status" aria-label="auto-update application status">
  </div>`,vo=N({icon:At,nameHTML:'<span class="edit-link" data-act="edit-application-stages" title="edit the application stages">application stages</span>',desc:"The application pipeline labels you track (applied, screening, interview…). One per line.",act:"edit-application-stages",actIcon:R,actTitle:"edit the application stages",actLabel:"edit application stages"}),bo=N({icon:At,nameHTML:'<span class="edit-link" data-act="edit-outreach-statuses" title="edit the outreach statuses">outreach statuses</span>',desc:"The outreach reply labels (initial contact, no response, replied…). One per line.",act:"edit-outreach-statuses",actIcon:R,actTitle:"edit the outreach statuses",actLabel:"edit outreach statuses"});e.innerHTML=`<div class="settings-section">
       <div class="settings-group-h">Job hunting</div>
       ${o}${r}${V}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Tracking</div>
       ${vo}${bo}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Outreach</div>
       ${d}${u}${p}${h}${f}${w}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Outreach pipeline</div>
       ${C}
     </div>
     <div class="settings-section">
       <div class="settings-group-h">Integrations</div>
       ${U}${fo}${yo}
     </div>`;const Gt={"view-profile":()=>Ks(i.profile),"refresh-profile":Gs,"edit-taste":()=>z("taste"),"edit-taste-filter":()=>Wn(),"edit-application-stages":()=>z("application-stages"),"edit-outreach-statuses":()=>z("outreach-statuses"),"edit-playbook":()=>z("playbook"),"edit-template":()=>z("outreach-template"),"edit-subject":()=>z("outreach-subject"),"edit-signature":()=>z("outreach-signature"),"edit-followup-template":()=>z("followup-template"),"edit-followup-subject":()=>z("followup-subject"),"edit-anthropic-key":zs,"gmail-connect":Us,"gmail-disconnect":Fs};for(const[$]of B)Gt[`edit-prompt-${$}`]=()=>z(`outreach-prompts/${$}`);e.querySelectorAll("[data-act]").forEach($=>{const S=$.dataset.act;S&&Gt[S]&&($.onclick=Gt[S])});const at=e.querySelector(".set-fu-interval");at&&at.addEventListener("change",async()=>{const $=Math.max(0,Math.min(90,parseInt(at.value,10)||0));at.value=String($),await ie("PUT","/api/followup-interval",{days:$})&&(i.followupInterval=$,l("follow-up interval saved"))});const re=e.querySelector(".set-autoflip");re&&re.addEventListener("change",async()=>{let $=!1;try{$=(await fetch("/api/gmail/autoflip",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:re.checked})})).ok}catch{$=!1}$?(i.gmail&&(i.gmail.autoflip=re.checked),l(`auto-update application status ${re.checked?"on":"off"}`)):(re.checked=!re.checked,l("failed to save"))})}async function ta(){try{i.anthropicKey=await(await fetch("/api/integrations/anthropic")).json()}catch{i.anthropicKey=null}te()}async function na(){try{i.gmail=await(await fetch("/api/gmail/status")).json()}catch{i.gmail=null}te()}async function Us(){let e;try{e=await fetch("/api/gmail/connect")}catch(n){l(`connect failed: ${n.message}`);return}if(!e.ok){l((await e.text().catch(()=>"")).trim()||`HTTP ${e.status}`);return}let t={};try{t=await e.json()}catch{}t.auth_url?window.location.href=t.auth_url:l("could not start the Gmail connect flow")}async function Fs(){if(!confirm("Disconnect Gmail? Sending and sync stop; already-synced data stays."))return;let e;try{e=await fetch("/api/gmail/disconnect",{method:"DELETE"})}catch(t){l(`disconnect failed: ${t.message}`);return}if(!e.ok){l((await e.text().catch(()=>"")).trim()||`HTTP ${e.status}`);return}l("Gmail disconnected"),await na()}async function zs(){document.getElementById("key-scrim").classList.add("open"),document.getElementById("key-input").value="",await ta(),Ht();const e=document.getElementById("key-input");e&&e.focus()}function Ht(){const e=i.anthropicKey||{},t=document.getElementById("key-status");t&&(t.textContent=e.key_source==="db"?"A key is set here (stored in scout).":e.key_source==="env"?"Using the ANTHROPIC_API_KEY environment variable. Saving a key here overrides it.":"No key set. Scoring, capture, and outreach are disabled until you add one.");const n=document.getElementById("key-remove");n&&(n.style.display=e.key_source==="db"?"":"none");const a=document.getElementById("key-restart-hint");if(a){const s=e.has_key&&i.meta&&(i.meta.outreach===!1||i.meta.chat===!1);a.style.display=s?"":"none"}}function Pt(){document.getElementById("key-scrim").classList.remove("open")}async function aa(){const e=(document.getElementById("key-input").value||"").trim();if(!e){l("paste a key first");return}const t=document.getElementById("key-save");t&&(t.disabled=!0,t.textContent="Verifying…");const n=()=>{t&&(t.disabled=!1,t.textContent="Save key")};let a;try{a=await fetch("/api/integrations/anthropic",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:e})})}catch(s){l(`save failed: ${s.message}`),n();return}if(!a.ok){l((await a.text().catch(()=>"")).trim()||`HTTP ${a.status}`),n();return}i.anthropicKey=await a.json(),document.getElementById("key-input").value="",n(),l("Anthropic key saved"),await kt(),Ht(),te()}async function Js(){const e=document.getElementById("key-remove");e&&(e.disabled=!0);let t;try{t=await fetch("/api/integrations/anthropic",{method:"DELETE"})}catch(n){l(`remove failed: ${n.message}`),e&&(e.disabled=!1);return}if(e&&(e.disabled=!1),!t.ok){l((await t.text().catch(()=>"")).trim()||`HTTP ${t.status}`);return}i.anthropicKey=await t.json(),l(i.anthropicKey.has_key?"removed — using the environment key":"Anthropic key removed"),await kt(),Ht(),te()}async function Gs(){const e=document.getElementById("refresh-profile");e&&(e.classList.add("spinning"),e.disabled=!0);let t;try{t=await fetch("/api/profile/refresh",{method:"POST"})}catch(n){l(`refresh failed: ${n.message}`),Mt();return}if(!t.ok){const n=await t.text().catch(()=>"");l(`refresh failed: ${(n||"").trim()||"HTTP "+t.status}`),Mt();return}i.profile=await t.json(),te(),l("company-fit brief refreshed"),T()}function Ks(e){!e||typeof e.body!="string"||(document.getElementById("profile-modal-meta").textContent=`${e.chars||0} chars · fetched ${jt(e.age_seconds)}`,document.getElementById("profile-modal-body").textContent=e.body,document.getElementById("profile-scrim").classList.add("open"))}function qt(){document.getElementById("profile-scrim").classList.remove("open")}document.getElementById("profile-modal-close").onclick=qt,document.getElementById("profile-scrim").onclick=e=>{e.target.id==="profile-scrim"&&qt()};function sa(){document.getElementById("docs-scrim").classList.add("open");const e=document.querySelector("#docs-nav a");et(e?e.dataset.sec:null);const t=document.getElementById("docs-body");t&&(t.scrollTop=0)}function Ot(){document.getElementById("docs-scrim").classList.remove("open")}function Ws(){return document.getElementById("docs-scrim").classList.contains("open")}function et(e){document.querySelectorAll("#docs-nav a").forEach(t=>t.classList.toggle("active",t.dataset.sec===e))}function Ys(e){const t=document.getElementById("doc-"+e);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),et(e)}document.getElementById("open-docs").onclick=sa,document.getElementById("docs-close").onclick=Ot,document.getElementById("docs-scrim").onclick=e=>{e.target.id==="docs-scrim"&&Ot()};function Zs(){document.getElementById("settings-scrim").classList.add("open"),te()}function Nt(){document.getElementById("settings-scrim").classList.remove("open")}document.getElementById("open-settings").onclick=Zs,document.getElementById("settings-close").onclick=Nt,document.getElementById("settings-scrim").onclick=e=>{e.target.id==="settings-scrim"&&Nt()};function Qs(){const e=document.getElementById("notif-badge");if(!e)return;const t=(i.notifications&&i.notifications.unread)|0;t>0?(e.textContent=t>99?"99+":String(t),e.style.display=""):e.style.display="none"}async function ce(){try{i.notifications=await(await fetch("/api/notifications")).json()}catch{return}Qs(),document.getElementById("notifications-scrim").classList.contains("open")&&oa()}function Xs(){document.getElementById("notifications-scrim").classList.add("open"),oa(),ce()}function Rt(){document.getElementById("notifications-scrim").classList.remove("open")}function eo(){return'<option value="">link to role…</option>'+(i.jobs||[]).map(t=>`<option value="${c(t.posting_id)}">${c((t.company||"")+" — "+(t.title||"(untitled)"))}</option>`).join("")}function to(e){const t=e.company||e.role?`<div class="notif-ctx">${c([e.company,e.role].filter(Boolean).join(" · "))}</div>`:'<div class="notif-ctx dim">not linked to a role</div>',n=e.created_at?`<span class="notif-when">${c((e.created_at||"").replace("T"," ").slice(0,16))}</span>`:"",a=e.kind==="app_status"&&e.suggested_status&&!e.actioned&&e.posting_id?`<button class="btn btn-primary notif-apply" data-id="${e.id}">Apply: ${c(e.suggested_status)}</button>`:"",s=e.posting_id?"":`<select class="input notif-link" data-id="${e.id}" title="link this to a role">${eo()}</select>`;return`<div class="notif-item${e.seen?"":" is-unread"}" data-id="${e.id}" data-seen="${e.seen?1:0}">
    <div class="notif-main">
      <div class="notif-title">${e.seen?"":'<span class="notif-dot" aria-label="unread"></span>'}${c(e.title)}</div>
      ${t}
      ${e.detail?`<div class="notif-detail">${c(e.detail)}</div>`:""}
    </div>
    <div class="notif-side">${n}<div class="notif-acts">${a}${s}</div></div>
  </div>`}function no(e){return`<div class="notif-item notif-followup">
    <div class="notif-main">
      <div class="notif-title">Follow up: ${c(e.contact_name||"contact")}</div>
      <div class="notif-ctx">${c([e.company,e.role].filter(Boolean).join(" · "))}</div>
      <div class="notif-detail dim">due ${c(e.due_at||"")}</div>
    </div>
    <div class="notif-side"><button class="btn notif-open" data-pid="${c(e.posting_id)}">Open</button></div>
  </div>`}function oa(){const e=document.getElementById("notifications-body");if(!e)return;const t=i.notifications||{notifications:[],followups:[]},n=t.notifications||[],a=t.followups||[];if(!n.length&&!a.length){e.innerHTML='<div class="cc-empty dim">Nothing here yet. Replies, application updates, and follow-ups show up as Gmail syncs.</div>';return}let s="";n.length&&(s+='<div class="settings-group-h">Updates</div>'+n.map(to).join("")),a.length&&(s+='<div class="settings-group-h">Follow-ups due</div>'+a.map(no).join("")),e.innerHTML=s,ao()}function ao(){const e=document.getElementById("notifications-body");e&&(e.querySelectorAll(".notif-item[data-id]").forEach(t=>{const n=t.dataset.id,a=t.querySelector(".notif-main");a&&t.dataset.seen==="0"&&a.addEventListener("click",()=>so(n))}),e.querySelectorAll(".notif-apply").forEach(t=>t.addEventListener("click",n=>{n.stopPropagation(),oo(t.dataset.id)})),e.querySelectorAll(".notif-link").forEach(t=>t.addEventListener("change",n=>{n.stopPropagation(),t.value&&io(t.dataset.id,t.value)})),e.querySelectorAll(".notif-open").forEach(t=>t.addEventListener("click",()=>{const n=t.dataset.pid;Rt(),lt(n)})))}async function so(e){try{await fetch(`/api/notifications/${e}/seen`,{method:"POST"})}catch{return}await ce()}async function oo(e){let t;try{t=await fetch(`/api/notifications/${e}/apply`,{method:"POST"})}catch(a){l(`apply failed: ${a.message}`);return}if(!t.ok){l((await t.text().catch(()=>"")).trim()||`HTTP ${t.status}`);return}const n=await t.json().catch(()=>({}));l(`status set to ${n.applied||"updated"}`),await ce(),await k()}async function io(e,t){let n;try{n=await fetch(`/api/notifications/${e}/link`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({posting_id:t})})}catch(a){l(`link failed: ${a.message}`);return}if(!n.ok){l((await n.text().catch(()=>"")).trim()||`HTTP ${n.status}`);return}l("linked to role"),await ce()}async function co(){const e=document.getElementById("notifications-sync");e&&(e.disabled=!0,e.textContent="Syncing…");try{const t=await fetch("/api/gmail/sync",{method:"POST"});l(t.ok?"synced":(await t.text().catch(()=>"")).trim()||`HTTP ${t.status}`)}catch(t){l(`sync failed: ${t.message}`)}e&&(e.disabled=!1,e.textContent="Sync now"),await ce(),await k()}document.getElementById("open-notifications").onclick=Xs,document.getElementById("notifications-close").onclick=Rt,document.getElementById("notifications-sync").onclick=co,document.getElementById("notifications-scrim").onclick=e=>{e.target.id==="notifications-scrim"&&Rt()},document.querySelectorAll("#docs-nav a").forEach(e=>{e.onclick=()=>{const t=document.getElementById("doc-"+e.dataset.sec);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),et(e.dataset.sec)}}),function(){const e=document.getElementById("docs-body");if(!e||!("IntersectionObserver"in window))return;const t=new IntersectionObserver(n=>{const a=n.filter(s=>s.isIntersecting).sort((s,o)=>s.boundingClientRect.top-o.boundingClientRect.top);a.length&&et(a[0].target.id.replace(/^doc-/,""))},{root:e,rootMargin:"0px 0px -65% 0px",threshold:0});document.querySelectorAll("#docs-body section").forEach(n=>t.observe(n))}(),i.chat={scope:null,scopeId:"",threadId:null,streaming:!1,es:null};function ro(e){return(e||[]).filter(t=>t&&t.type==="text").map(t=>t.text||"").join("")}function lo(e){return(e||[]).filter(t=>t&&t.type==="tool_use").map(t=>t.name)}function tt(e,t){const n=document.createElement("div");return n.className="chat-msg chat-"+e,n.textContent=t||"",n}function Dt(){const e=document.getElementById("chat-messages");e.scrollTop=e.scrollHeight}function uo(){const e=document.createElement("div");return e.className="chat-empty",e.textContent=i.chat.scope==="global"?"Tell me about a job you applied to (paste the link), or ask what's already tracked.":"Ask about this "+(i.chat.scope==="company"?"company":"role")+" — I can research it on the web and update scout.",e}function ia(e){const t=document.getElementById("chat-messages");t.innerHTML="";for(const n of e||[]){const a=ro(n.content);if(n.role==="user")a&&t.appendChild(tt("user",a));else if(n.role==="assistant"){const s=lo(n.content);if(!a&&!s.length)continue;const o=tt("assistant",a);if(s.length){const r=document.createElement("div");r.className="chat-tools",r.textContent="· used "+s.join(", "),o.appendChild(r)}t.appendChild(o)}}t.children.length||t.appendChild(uo()),Dt()}async function Vt(e,t,n){if(!i.meta||!i.meta.chat){l("chat needs ANTHROPIC_API_KEY in the server env");return}i.chat.es&&(i.chat.es.close(),i.chat.es=null),i.chat={scope:e,scopeId:t||"",threadId:null,streaming:!1,es:null},document.getElementById("chat-title").textContent=e==="global"?"Chat":e==="company"?"Chat · company":"Chat · role",document.getElementById("chat-sub").textContent=e==="global"?"":n||"";const a=document.getElementById("chat-messages");a.innerHTML='<div class="chat-empty">loading…</div>';const s=document.getElementById("chat-pane");s.classList.add("open"),document.getElementById("chat-scrim").classList.add("open"),s.setAttribute("aria-hidden","false");try{const o="scope="+encodeURIComponent(e)+(t?"&scope_id="+encodeURIComponent(t):""),r=await fetch("/api/chat/threads?"+o);if(!r.ok)throw new Error((await r.text().catch(()=>"")).trim()||"HTTP "+r.status);const d=await r.json();i.chat.threadId=d.thread.id,ia(d.messages||[])}catch(o){a.innerHTML='<div class="chat-empty">Failed to open chat: '+c(o.message)+"</div>";return}document.getElementById("chat-input").focus()}function Ut(){i.chat.es&&(i.chat.es.close(),i.chat.es=null);const e=document.getElementById("chat-pane");e.classList.remove("open"),document.getElementById("chat-scrim").classList.remove("open"),e.setAttribute("aria-hidden","true")}function nt(e){i.chat.streaming=e,document.getElementById("chat-send").disabled=e;const t=document.getElementById("chat-input");t.disabled=e,e||t.focus()}function ca(){const e=document.getElementById("chat-input");e.style.height="auto",e.style.height=Math.min(e.scrollHeight,160)+"px"}async function ra(){const e=document.getElementById("chat-input"),t=e.value.trim();if(!t||i.chat.streaming||!i.chat.threadId)return;e.value="",ca(),nt(!0);const n=document.getElementById("chat-messages"),a=n.querySelector(".chat-empty");a&&a.remove(),n.appendChild(tt("user",t));const s=tt("assistant","");s.classList.add("chat-streaming"),n.appendChild(s),Dt();let o="";const r=h=>{s.classList.remove("chat-streaming"),s.textContent="⚠ "+h,nt(!1)},d=i.chat.threadId;let u;try{u=await fetch("/api/chat/"+d+"/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t})})}catch(h){r(h.message);return}if(!u.ok){r((await u.text().catch(()=>"")).trim()||"HTTP "+u.status);return}const p=new EventSource("/api/chat/"+d+"/stream");i.chat.es=p,p.addEventListener("delta",h=>{o+=h.data,s.textContent=o,Dt()}),p.addEventListener("end",async h=>{p.close(),i.chat.es===p&&(i.chat.es=null),s.classList.remove("chat-streaming"),nt(!1),i.chat.threadId===d&&await po(),mo(),typeof h.data=="string"&&h.data.indexOf("error")===0&&l("chat: "+h.data)}),p.onerror=()=>{p.close(),i.chat.es===p&&(i.chat.es=null),s.classList.remove("chat-streaming"),nt(!1)}}async function po(){const e=i.chat.scope,t=i.chat.scopeId,n="scope="+encodeURIComponent(e)+(t?"&scope_id="+encodeURIComponent(t):"");try{const a=await fetch("/api/chat/threads?"+n);if(!a.ok)return;const s=await a.json();ia(s.messages||[])}catch{}}function mo(){P(),k(),T(),i.openId&&be(i.openId)}document.getElementById("open-chat").onclick=()=>Vt("global","",""),document.getElementById("chat-close").onclick=Ut,document.getElementById("chat-scrim").onclick=Ut,document.getElementById("chat-form").addEventListener("submit",e=>{e.preventDefault(),ra()}),document.getElementById("chat-input").addEventListener("input",ca),document.getElementById("chat-input").addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),ra())}),an("#t tbody",fa),an("#jt tbody",ga);const ho=(()=>{try{return localStorage.getItem("scout-view")}catch{return null}})();q(ho==="jobs"?"jobs":"companies",{render:!1});function la(){const e=document.querySelector(".layout");e&&(e.style.transform="translateZ(0)",requestAnimationFrame(()=>requestAnimationFrame(()=>{e.style.transform=""})))}document.addEventListener("visibilitychange",()=>{document.hidden||la()}),window.addEventListener("pageshow",e=>{e.persisted&&la()}),P(),k(),T(),kt(),Et(),Mt(),ta(),na(),ce(),setInterval(ce,9e4),M(),function(){const t=/[?&]gmail=(connected|error)/.exec(location.search);t&&(l(t[1]==="connected"?"Gmail connected":"Gmail connection failed"),history.replaceState(null,"",location.pathname+location.hash))}()}Eo({"":{view:()=>({mount(b){b.innerHTML=_o,Bo()}}),chrome:!1}},{title:"scout"});xo();Lo();
