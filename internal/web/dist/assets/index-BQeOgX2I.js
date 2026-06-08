(function(){const r=document.createElement("link").relList;if(r&&r.supports&&r.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))$(i);new MutationObserver(i=>{for(const v of i)if(v.type==="childList")for(const E of v.addedNodes)E.tagName==="LINK"&&E.rel==="modulepreload"&&$(E)}).observe(document,{childList:!0,subtree:!0});function g(i){const v={};return i.integrity&&(v.integrity=i.integrity),i.referrerPolicy&&(v.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?v.credentials="include":i.crossOrigin==="anonymous"?v.credentials="omit":v.credentials="same-origin",v}function $(i){if(i.ep)return;i.ep=!0;const v=g(i);fetch(i.href,v)}})();function cn(y,r){const g=r.replace(/^#/,"");let $=null;for(const i of Object.keys(y))(g===i||g.startsWith(i))&&($===null||i.length>$.length)&&($=i);return $===null&&""in y&&($=""),$}function dn(y){return typeof y=="function"?{view:y,chrome:!0}:{view:y.view,chrome:y.chrome!==!1}}function ln(y,r={}){const g=r.root??document.body,$=r.title??document.title??"",i=r.brandHref??"#",v=document.createElement("main"),E=document.createElement("header");E.className="cap-head";const k=document.createElement("a");k.className="brand",k.href=i,k.textContent=$,k.setAttribute("aria-label",`${$} — home`),E.appendChild(k);const C=document.createElement("nav");C.className="cap-nav",C.setAttribute("aria-label","Views");for(const w of r.nav??[]){const B=document.createElement("a");B.href=w.href,B.textContent=w.label,w.ariaLabel&&B.setAttribute("aria-label",w.ariaLabel),C.appendChild(B)}E.appendChild(C);const I=document.createElement("section");I.className="tk-content",v.appendChild(E),v.appendChild(I);const j=document.createElement("div");j.className="tk-bleed";const ye=w=>{var B;for(const M of Array.from(C.querySelectorAll("a"))){const R=((B=M.getAttribute("href"))==null?void 0:B.replace(/^#/,""))??"";M.toggleAttribute("aria-current",w!==null&&w!==""&&R===w),M.hasAttribute("aria-current")&&M.setAttribute("aria-current","page")}};let Z=0;const S=()=>{const w=cn(y,location.hash);if(ye(w),w===null){j.isConnected&&j.remove(),v.isConnected||g.appendChild(v),un(I,"Not found.");return}const{view:B,chrome:M}=dn(y[w]),R=M?I:j;M?(j.isConnected&&j.remove(),v.isConnected||g.appendChild(v)):(v.isConnected&&v.remove(),j.isConnected||g.appendChild(j)),R.replaceChildren();const be=B(),ee=++Z,J=be.mount(R);J instanceof Promise&&J.catch(te=>{ee===Z&&pn(R,String(te))})};window.addEventListener("hashchange",S),S()}function un(y,r){y.replaceChildren();const g=document.createElement("div");g.className="tk-empty",g.textContent=r,y.appendChild(g)}function pn(y,r){y.replaceChildren();const g=document.createElement("div");g.className="tk-error",g.textContent=r,y.appendChild(g)}function hn(){if(!("serviceWorker"in navigator))return;if(["localhost","127.0.0.1","[::1]",""].includes(location.hostname)){navigator.serviceWorker.getRegistrations().then(r=>{for(const g of r)g.unregister()}),window.caches&&caches.keys().then(r=>{for(const g of r)caches.delete(g)});return}window.addEventListener("load",()=>{navigator.serviceWorker.register("/sw.js").catch(()=>{})})}async function mn(){let y;try{y=await fetch("/api/me",{headers:{Accept:"application/json"}})}catch{return null}if(!y.ok)return null;let r;try{r=await y.json()}catch{return null}return typeof r.email=="string"&&r.email?{email:r.email}:null}const fn=`
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

  <div class="block" id="block-criteria">
    <h3>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13L8 3l5 10H3z"/></svg>
      Criteria
    </h3>
    <div id="criteria-stats"><div class="loading-row"><span class="spinner"></span><span>loading…</span></div></div>
  </div>

  <div class="sidebar-foot">
    <button class="doc-btn" id="open-docs" title="How scout works — ingestion, prompts, files, triage">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 11.5v.01M6.4 6.2a1.6 1.6 0 1 1 2.4 1.5c-.5.3-.8.6-.8 1.3"/></svg>
      how it works
    </button>
  </div>
</aside>

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
    <button class="close-btn" id="pursuit-close" aria-label="close">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>
      </svg>
    </button>
  </div>
  <div class="pane-body" id="pursuit-body"><div class="loading-row"><span class="spinner"></span><span>loading…</span></div></div>
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
      <textarea id="editor-text" spellcheck="false"></textarea>
      <div class="modal-note">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.5" stroke-linecap="round"/></svg>
        <span>Edits write the local file only — never the brain. Saving re-scores everything on the next verdict run (the version changes).</span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="editor-cancel">Cancel</button>
      <button class="btn btn-primary" id="editor-save">Save</button>
    </div>
  </div>
</div>

<!-- outreach identity editor -->
<div class="modal-scrim" id="sender-scrim">
  <div class="modal">
    <div class="modal-head">
      <h2>outreach identity</h2>
    </div>
    <div class="modal-body">
      <div class="sender-form">
        <label class="sender-field">
          <span class="sender-label">Subject name <em>— short name in the subject line</em></span>
          <input id="snd-subject_name" class="ie" type="text" spellcheck="false" placeholder="e.g. Alex">
        </label>
        <label class="sender-field">
          <span class="sender-label">Sign-off <em>— the verbatim closer (models never write it)</em></span>
          <textarea id="snd-signature" class="ie" rows="2" spellcheck="false" placeholder="Thanks,&#10;Alex"></textarea>
        </label>
        <label class="sender-field">
          <span class="sender-label">Researcher lens <em>— one line of who you are</em></span>
          <textarea id="snd-lens" class="ie" rows="2" spellcheck="false"></textarea>
        </label>
        <label class="sender-field">
          <span class="sender-label">Hook preferences <em>— "prefer hooks about: …"</em></span>
          <textarea id="snd-hook_prefs" class="ie" rows="2" spellcheck="false"></textarea>
        </label>
        <label class="sender-field">
          <span class="sender-label">Drafter arc <em>— one-line framing of your move</em></span>
          <input id="snd-arc" class="ie" type="text" spellcheck="false">
        </label>
      </div>
      <div class="modal-note">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.5" stroke-linecap="round"/></svg>
        <span>Each field auto-saves on blur. This identity lives only in your local database — never the brain or the repo. The next draft uses it immediately.</span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="sender-close">Close</button>
    </div>
  </div>
</div>

<!-- brain profile viewer (read-only) -->
<div class="modal-scrim" id="profile-scrim">
  <div class="modal">
    <div class="modal-head">
      <h2>Brain profile</h2>
      <span class="ver" id="profile-modal-meta"></span>
    </div>
    <div class="modal-body">
      <div class="summary-box" id="profile-modal-body" style="max-height:54vh"></div>
      <div class="modal-note">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.5" stroke-linecap="round"/></svg>
        <span>Read-only. This is scout's cached copy of your brain profile — the exact criteria text the verdict stage feeds the LLM. Use “refresh” in the Criteria panel to refetch it.</span>
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
<span class="c">   ← your criteria: the brain's profile, or taste.md offline</span></pre>

          <h4>The user prompt (one per company)</h4>
          <p>The company's own data is sent as the user message — only the fields that exist are included:</p>
          <pre class="code">Company: &lt;name&gt;
Domain / Vertical / Location / Headcount / Funding stage: &lt;…&gt;

Website text (truncated):
&lt;the stripped about-page text from enrichment&gt;

Return the JSON verdict now.</pre>

          <h4>Where the brain comes in</h4>
          <ul>
            <li><strong>Your criteria</strong> come from the brain's profile — structured facts carrying a polarity (positive/negative) and strength (hard/soft), rendered into a grouped criteria block: hard facts are gates (requirements/dealbreakers), soft facts are weights, and neutral facts are context. If the brain is down or empty, scout falls back to <code>taste.md</code>.</li>
            <li><strong>No per-company lookup.</strong> Scout reads the brain once for your criteria — it never queries the brain per company. A brain miss is logged and ignored; the verdict still runs on the local fallback.</li>
          </ul>

          <h4>Model, parsing, and re-scoring</h4>
          <ul>
            <li>The first pass runs on <strong>Haiku</strong> (<code>claude-haiku-4-5</code>) — cheap and fast. <strong>Prompt caching</strong> is on: the system block is identical across the run, so it's billed once.</li>
            <li>scout parses <code>{"verdict": …, "reason": …}</code> tolerantly (it copes with stray fences or text) and stores one row per company.</li>
            <li>A verdict is tagged with a <strong>criteria version</strong> — a hash of the playbook + your criteria. When the brain learns something new, or you edit the playbook or <code>taste.md</code>, the version changes and those companies <strong>re-score on the next run</strong>. That's the "N verdicts stale" badge in the sidebar. Up-to-date rows are skipped, so re-running is cheap.</li>
          </ul>
        </section>

        <section id="doc-files">
          <h3 class="dsec"><span class="n">07</span> Files scout reads</h3>
          <p class="lede">scout's behavior comes from a handful of inputs. Two of them are editable right here in the UI; the brain is external and read-only.</p>
          <table class="dt">
            <thead><tr><th>What</th><th>Holds</th><th>Edit it</th></tr></thead>
            <tbody>
              <tr><td class="field">taste.toml</td><td>The mechanical pre-filter gates (location, headcount, vertical, stage). Cheap hard culls — not judgment.</td><td>on disk</td></tr>
              <tr><td class="field">playbook.md</td><td><em>How</em> scout decides — the rubric and tie-breaking procedure. Scout's own logic, not your data.</td><td><strong>in the UI</strong> ("edit playbook.md")</td></tr>
              <tr><td class="field">taste.md</td><td><em>What</em> you want — the offline fallback for your criteria, used only when the brain is unreachable.</td><td><strong>in the UI</strong> ("edit taste.md")</td></tr>
              <tr><td class="field">the brain</td><td>The primary source of your criteria + per-company memory. A separate HTTP service. <strong>Read-only</strong>: scout never writes it.</td><td>elsewhere (not in scout)</td></tr>
              <tr><td class="field">scout.db</td><td>The local SQLite working set: companies, enrichment, verdicts, and run history. Disposable — rebuild from a CSV anytime.</td><td>managed by scout</td></tr>
            </tbody>
          </table>
          <div class="callout">The in-UI editor writes the <strong>local files only</strong> and never touches the brain — that separation is deliberate. Saving an edit changes the criteria version, so the next verdict run re-scores everything.</div>
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
          <p>The <strong>unscored</strong> filter chip carries a live count of companies still awaiting a verdict. When your criteria or playbook change, a <strong>"N verdicts stale"</strong> badge appears — re-run Verdict to refresh just those. Everything is incremental, so re-running only touches what's out of date.</p>
        </section>

      </div>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>
`;function vn(y){const r={rows:[],sort:{k:"verdict",dir:1},openId:null,stats:null,profile:null,view:"companies",jobs:[],jsort:{k:"created_at",dir:1}},g=e=>"pill pill-"+(e||"none"),$='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 14V2.5"/><path d="M3.5 2.5c3-1.2 6 1.2 9 0V9c-3 1.2-6-1.2-9 0z"/></svg>',i=e=>String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),v=e=>/^https?:\/\//i.test(String(e??""))?i(e):"#";async function E(){const t=await(await fetch("/api/companies")).json();r.rows=t.rows||[],H()}async function k(){let e;try{const t=await fetch("/api/postings");if(!t.ok)return;e=await t.json()}catch{return}if(r.jobs=e.rows||[],x(),p.postingId){const t=r.jobs.find(n=>n.posting_id===p.postingId);t&&(p.row=t,document.getElementById("pursuit-pane").classList.contains("open")&&W())}}function C(e){r.view=e,document.getElementById("tab-companies").classList.toggle("active",e==="companies"),document.getElementById("tab-jobs").classList.toggle("active",e==="jobs"),document.getElementById("companies-view").style.display=e==="companies"?"":"none",document.getElementById("jobs-view").style.display=e==="jobs"?"":"none",document.getElementById("block-filter-companies").style.display=e==="companies"?"":"none",document.getElementById("block-filter-jobs").style.display=e==="jobs"?"":"none",we(),e==="jobs"?x():H()}async function I(){let e;try{const t=await fetch("/api/stats");if(!t.ok)throw new Error(`HTTP ${t.status}`);e=await t.json()}catch(t){const n=document.getElementById("unscored-n");n.textContent="–",n.title=`stats failed: ${t.message}`;return}r.stats=e,j()}function j(){const e=r.stats||{};document.getElementById("unscored-n").textContent=e.unscored??0,Se()}function ye(e,t,n){const s=e[n]??"",a=t[n]??"";if(n==="headcount")return(s|0)-(a|0);if(n==="verdict"){const o={yes:0,maybe:1,no:2,"":3};return(o[s]??3)-(o[a]??3)}return String(s).localeCompare(String(a))}function Z(e){return e.slice().sort((t,n)=>r.sort.dir*ye(t,n,r.sort.k))}const S=new Set;let w=!1;function B(){document.querySelectorAll("#verdict-chips .v-chip[data-v]").forEach(e=>{e.classList.toggle("is-on",S.has(e.dataset.v))})}function M(){const e=document.getElementById("q").value.trim().toLowerCase();return r.rows.filter(t=>!(S.size&&!S.has(t.verdict||"__none__")||w&&!t.flagged||e&&!(t.name+" "+(t.vertical||"")+" "+(t.reason||"")).toLowerCase().includes(e)))}const R=[{k:"flag",label:"flag"},{k:"verdict",label:"verdict"},{k:"reason",label:"reason"},{k:"vertical",label:"vertical"},{k:"location",label:"location"},{k:"hc",label:"hc"},{k:"stage",label:"stage"},{k:"reviewed",label:"reviewed"},{k:"site",label:"site"}],be=[{k:"applied",label:"applied"},{k:"response",label:"response"},{k:"outreach",label:"outreach"},{k:"last_outreach",label:"last outreach"},{k:"contacts",label:"contacts"},{k:"link",label:"link"}];function ee(e){try{return new Set(JSON.parse(localStorage.getItem(e)||"[]"))}catch{return new Set}}const J=ee("scout-hidden-cols"),te=ee("scout-hidden-jcols");function He(){return r.view==="jobs"?{cols:be,hidden:te,key:"scout-hidden-jcols"}:{cols:R,hidden:J,key:"scout-hidden-cols"}}function ne(){document.querySelectorAll("#t [data-col]").forEach(e=>{e.style.display=J.has(e.dataset.col)?"none":""}),document.querySelectorAll("#jt [data-col]").forEach(e=>{e.style.display=te.has(e.dataset.col)?"none":""})}function we(){const e=He();document.getElementById("col-toggles").innerHTML=e.cols.map(t=>`<button class="col-chip${e.hidden.has(t.k)?"":" is-on"}" data-col="${t.k}" title="${e.hidden.has(t.k)?"show":"hide"} ${t.label}">${t.label}</button>`).join(""),document.querySelectorAll("#col-toggles .col-chip").forEach(t=>{t.addEventListener("click",()=>{const n=He(),s=t.dataset.col;n.hidden.has(s)?n.hidden.delete(s):n.hidden.add(s),localStorage.setItem(n.key,JSON.stringify([...n.hidden])),we(),ne()})})}function H(){const e=document.querySelector("#t tbody");e.innerHTML="";const t=Z(M());document.getElementById("empty").style.display=t.length?"none":"block";for(const n of t){const s=document.createElement("tr");s.dataset.id=n.company_id,s.innerHTML=`
      <td class="td-flag" data-col="flag"><button class="flag-btn${n.flagged?" is-on":""}" data-id="${n.company_id}" title="${n.flagged?"unflag":"flag"}">${$}</button></td>
      <td data-col="verdict"><span class="${g(n.verdict)}">${i(n.verdict||"—")}</span></td>
      <td><span class="row-name" data-id="${n.company_id}">${i(n.name)}</span></td>
      <td class="reason" data-col="reason">${i(n.reason||"")}</td>
      <td data-col="vertical">${i(n.vertical||"")}</td>
      <td data-col="location">${i(n.location||"")}</td>
      <td data-col="hc">${n.headcount||""}</td>
      <td data-col="stage">${i(n.stage||"")}</td>
      <td data-col="reviewed" class="muted" title="${i(n.reviewed_at||"never reviewed")}">${n.reviewed_at?i(n.reviewed_at.slice(0,10)):"—"}</td>
      <td data-col="site">${n.website_url?`<a href="${v(n.website_url)}" target="_blank" rel="noopener">about ↗</a>`:""}</td>
    `,e.appendChild(s)}ne(),e.querySelectorAll("tr").forEach(n=>{n.addEventListener("click",s=>{s.target.closest("a, .flag-btn")||re(n.dataset.id)})}),e.querySelectorAll(".flag-btn").forEach(n=>{n.addEventListener("click",()=>Ke(n.dataset.id))})}const A=new Set;let se=!1,ae=!1,V=!0;function ht(){const e=document.getElementById("jq").value.trim().toLowerCase(),t=V&&!A.has("rejected");return r.jobs.filter(n=>!(t&&n.response==="rejected"||A.size&&!A.has(n.response||"")||se&&!n.next_up||ae&&(n.outreach_count|0)>0||e&&!(n.title+" "+n.company+" "+(n.location||"")+" "+(n.summary||"")+" "+(n.contacts||"")).toLowerCase().includes(e)))}const mt=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;function qe(e){const t=String(e||"").split(",").map(n=>n.trim()).filter(Boolean);return t.length?t.map(n=>{const s=n.match(mt);return s?`<a href="mailto:${i(s[0])}" title="${i(n)}">${i(n)}</a>`:i(n)}).join('<span class="dim">, </span>'):'<span class="dim">—</span>'}const q={offer:{cls:"pill-yes",label:"offer",order:0},interview:{cls:"pill-info",label:"interview",order:1},screening:{cls:"pill-maybe",label:"screening call",order:2},"":{cls:"pill-none",label:"—",order:3},rejected:{cls:"pill-no",label:"rejected",order:4}};function ft(e,t,n){var s,a;if(n==="verdict"){const o={yes:0,maybe:1,no:2,"":3};return(o[e.verdict]??3)-(o[t.verdict]??3)}if(n==="response")return(((s=q[e.response])==null?void 0:s.order)??3)-(((a=q[t.response])==null?void 0:a.order)??3);if(n==="outreach_count")return(t.outreach_count|0)-(e.outreach_count|0);if(n==="created_at"||n==="applied_at"||n==="last_outreach_at"){const o=e[n]||"",c=t[n]||"";return!o&&!c?0:o?c?String(c).localeCompare(String(o)):-r.jsort.dir:r.jsort.dir}return String(e[n]??"").localeCompare(String(t[n]??""))}function F(e){const t=e.options[e.selectedIndex],n=getComputedStyle(e),s=F._c||(F._c=document.createElement("canvas").getContext("2d"));s.font=`${n.fontWeight} ${n.fontSize} ${n.fontFamily}`;const a=s.measureText(t?t.text:"").width;e.style.width=Math.ceil(a+35)+"px"}function x(){const e=document.querySelector("#jt tbody");e.innerHTML="";const t=ht().sort((d,m)=>r.jsort.dir*ft(d,m,r.jsort.k));document.getElementById("jobs-empty").style.display=t.length?"none":"block";const n=V&&!A.has("rejected")?r.jobs.filter(d=>d.response==="rejected").length:0,s=document.getElementById("hidden-rej-n");s.textContent=n,s.style.display=n?"":"none";const a=r.jobs.filter(d=>d.next_up).length,o=document.getElementById("next-up-n");o.textContent=a,o.style.display=a?"":"none";const c=r.jobs.filter(d=>!(d.outreach_count|0)&&!(V&&!A.has("rejected")&&d.response==="rejected")).length,h=document.getElementById("not-reached-n");h.textContent=c,h.style.display=c?"":"none";const u=document.getElementById("jobs-hidden-note");u.style.display=n?"":"none",n&&(u.innerHTML=`${n} rejected application${n>1?"s":""} hidden — <a id="show-rejected-link">show</a>`,document.getElementById("show-rejected-link").onclick=()=>{V=!1,document.getElementById("hide-rejected").classList.remove("is-on"),x()});for(const d of t){const m=q[d.response]||q[""],f=document.createElement("tr");f.dataset.id=d.posting_id;const _=[["","none"],["screening","screening"],["interview","interview"],["offer","offer"],["rejected","rejected"]].map(([L,ge])=>`<option value="${L}"${(d.response||"")===L?" selected":""}>${ge}</option>`).join("");f.innerHTML=`
      <td><div class="jt-namecell"><button class="jt-nextup${d.next_up?" is-on":""}" title="${d.next_up?"queued next up for outreach — click to remove":"mark next up for outreach"}" aria-label="next up">${d.next_up?"★":"☆"}</button><div class="jt-namecol"><span class="row-name">${i(d.title||d.company)}</span>${vt(d.outreach_draft_status)}${d.title?`<div class="small dim">${i(d.company)}</div>`:""}</div></div></td>
      <td class="small" data-col="applied"><button class="jt-applied${d.applied_at?" is-on":""}" title="${d.applied_at?"mark as not applied":"mark applied today"}">${d.applied_at?i(d.applied_at):"+ applied"}</button></td>
      <td data-col="response"><select class="jt-resp ${m.cls}" title="furthest response reached">${_}</select></td>
      <td class="small" data-col="outreach"><span class="jt-stepper"><button class="jt-dec" title="undo one outreach"${d.outreach_count?"":" disabled"}>−</button><span class="jt-oc${d.outreach_count?"":" dim"}">${d.outreach_count||0}</span><button class="jt-inc" title="log one outreach (today)">+</button></span></td>
      <td class="small" data-col="last_outreach">${d.last_outreach_at?i(d.last_outreach_at):'<span class="dim">—</span>'}</td>
      <td class="small td-contacts" data-col="contacts">${qe(d.contacts)}</td>
      <td data-col="link"><a href="${v(d.url)}" target="_blank" rel="noopener">open ↗</a></td>
    `;const T=()=>new Date().toISOString().slice(0,10);f.querySelector(".jt-nextup").onclick=()=>Ve(d,!1),f.querySelector(".jt-applied").onclick=()=>oe(d,{applied_at:d.applied_at?"":T()}),f.querySelector(".jt-resp").onchange=L=>{F(L.target),oe(d,{response:L.target.value})},f.querySelector(".jt-inc").onclick=()=>oe(d,{outreach_count:(d.outreach_count||0)+1,last_outreach_at:T()}),f.querySelector(".jt-dec").onclick=()=>{const L=Math.max(0,(d.outreach_count||0)-1);oe(d,{outreach_count:L,...L===0?{last_outreach_at:""}:{}})},e.appendChild(f)}e.querySelectorAll(".jt-resp").forEach(F),ne(),e.querySelectorAll("tr").forEach(d=>{d.addEventListener("click",m=>{m.target.closest("a, button, select")||Ne(d.dataset.id)})})}function vt(e){return e==="awaiting_review"?'<span class="draft-badge" title="an outreach draft is ready to review">draft ready</span>':e==="no_hook"?'<span class="draft-badge db-nohook" title="no honest hook — scout recommends not emailing">no hook</span>':""}const p={postingId:null,row:null,drafts:[],poll:null,openHist:!1,answers:[],answersStatus:"",answersPoll:null,detecting:!1};async function Ne(e){let t=r.jobs.find(n=>n.posting_id===e);if(t||(await k(),t=r.jobs.find(n=>n.posting_id===e)),!t){l("posting not found — refresh");return}Ee(),$e(),p.postingId=e,p.row=t,p.drafts=[],p.openHist=!1,p.answers=[],p.detecting=!1,p.answersStatus=t.questions_status||"",document.getElementById("pursuit-pane").classList.add("open"),document.getElementById("pursuit-scrim").classList.add("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","false"),W(),z(),K()}function ke(){Ee(),$e(),p.postingId=null,p.row=null,p.drafts=[],p.answers=[],p.answersStatus="",document.getElementById("pursuit-pane").classList.remove("open"),document.getElementById("pursuit-scrim").classList.remove("open"),document.getElementById("pursuit-pane").setAttribute("aria-hidden","true")}function Ee(){p.poll&&(clearInterval(p.poll),p.poll=null)}async function z(){if(!p.postingId)return;let e;try{const n=await fetch(`/api/postings/${p.postingId}/outreach`);if(!n.ok){Y();return}e=await n.json()}catch{Y();return}p.drafts=e.drafts||[],Y();const t=p.drafts[0];t&&t.status==="researching"?gt():Ee()}function gt(){p.poll||(p.poll=setInterval(z,4e3))}function P(e,t,{multiline:n=!1}={}){if(!e)return;let s=e.value;e.addEventListener("focus",()=>{s=e.value}),e.addEventListener("keydown",a=>{a.key==="Escape"?(a.preventDefault(),e.value=s,e.blur()):a.key==="Enter"&&(!n||a.metaKey||a.ctrlKey)&&(a.preventDefault(),e.blur())}),e.addEventListener("blur",async()=>{const a=e.value.trim();if(a===s.trim()){e.value=s;return}e.classList.remove("is-saved","is-error"),e.classList.add("is-saving");try{await t(a),s=e.value,e.classList.remove("is-saving"),e.classList.add("is-saved"),setTimeout(()=>e.classList.remove("is-saved"),1200)}catch(o){e.value=s,e.classList.remove("is-saving"),e.classList.add("is-error"),setTimeout(()=>e.classList.remove("is-error"),1600),l(`save failed: ${o.message}`)}})}async function Oe(e,t,n){const s={title:e.title||"",location:e.location||"",comp_range:e.comp_range||"",employment_type:e.employment_type||"",workplace_type:e.workplace_type||"",department:e.department||"",summary:e.summary||"",description:e.description||"",[t]:n},a=await fetch(`/api/postings/${e.posting_id}/details`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)});if(!a.ok)throw new Error((await a.text().catch(()=>"")).trim()||"HTTP "+a.status);const o=await a.json();Object.assign(e,{title:o.title,location:o.location,summary:o.summary,employment_type:o.employment_type,workplace_type:o.workplace_type,department:o.department,comp_range:o.comp_range,description:o.description}),x()}async function Re(e,t,n){const s={name:e.name||"",headcount:e.headcount||"",funding_stage:e.funding_stage||"",location:e.location||"",vertical:e.vertical||"",[t]:n};if(!String(s.name).trim())throw new Error("name is required");const a=await fetch(`/api/companies/${e.company_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)});if(!a.ok)throw new Error((await a.text().catch(()=>"")).trim()||"HTTP "+a.status);const o=await a.json();Object.assign(e,{name:o.name,headcount:o.headcount,funding_stage:o.funding_stage,location:o.location,vertical:o.vertical}),E(),k()}async function yt(e,t){const n=await fetch(`/api/companies/${e.company_id}/domain`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({website:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json();r.openId=s.company_id,G(s),Q(s.company_id),E(),k()}async function bt(e,t){const n=await fetch(`/api/companies/${e.company_id}/notes`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({notes:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json();e.notes=s.notes}function W(){const e=p.row;if(!e)return;document.getElementById("pursuit-title").innerHTML=`<input class="ie ie-title" id="pursuit-title-input" placeholder="role name" value="${i(e.title||"")}">`;const t=q[e.response]||q[""];document.getElementById("pursuit-pills").innerHTML=`<span class="pill ${t.cls}">${i(t.label)}</span>`+(e.verdict?` <span class="${g(e.verdict)}">${i(e.verdict)}</span>`:""),document.getElementById("pursuit-body").innerHTML=`
    <section class="pane-section role-head">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1m-9 0h11a1 1 0 011 1v7a1 1 0 01-1 1H2.5a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>
        Role
      </h3>
      <div id="role-body">${wt(e)}</div>
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
          <input type="date" class="input pl-applied-date" value="${i(e.applied_at||"")}"
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
      <textarea class="ie ie-notes" id="pursuit-notes-input" rows="4" placeholder="Your notes on this role — ⌘/Ctrl+Enter or click away to save">${i(e.notes||"")}</textarea>
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12v8H2z"/><path d="M2 4l6 5 6-5"/></svg>
        Outreach
      </h3>
      <div id="outreach-section"></div>
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2.5h7l3 3V13a.5.5 0 01-.5.5h-9A.5.5 0 013 13z"/><path d="M6 7h4M6 9.5h4M6 12h2.5"/></svg>
        Application
      </h3>
      <div id="answers-section"></div>
    </section>
  `,kt();const n=document.getElementById("pursuit-company-link");n&&n.addEventListener("click",()=>re(e.company_id)),P(document.getElementById("pursuit-title-input"),s=>Oe(e,"title",s)),P(document.getElementById("pursuit-notes-input"),s=>Et(s),{multiline:!0}),document.querySelectorAll("#role-body [data-k]").forEach(s=>P(s,a=>Oe(e,s.dataset.k,a),{multiline:s.tagName==="TEXTAREA"})),Y(),D()}function wt(e){return`
    <div class="role-url"><a href="${v(e.url)}" target="_blank" rel="noopener">${i(e.url)} ↗</a></div>
    <div class="ie-grid">
      <div class="prow">
        <div class="ie-field"><label>location</label>
          <input class="ie" data-k="location" placeholder="—" value="${i(e.location||"")}"></div>
        <div class="ie-field"><label>comp range</label>
          <input class="ie" data-k="comp_range" placeholder="—" value="${i(e.comp_range||"")}"></div>
      </div>
      <div class="prow">
        <div class="ie-field"><label>employment</label>
          <input class="ie" data-k="employment_type" placeholder="—" value="${i(e.employment_type||"")}"></div>
        <div class="ie-field"><label>workplace</label>
          <input class="ie" data-k="workplace_type" placeholder="—" value="${i(e.workplace_type||"")}"></div>
      </div>
      <div class="ie-field"><label>department</label>
        <input class="ie" data-k="department" placeholder="—" value="${i(e.department||"")}"></div>
      <div class="ie-field"><label>summary</label>
        <textarea class="ie" data-k="summary" rows="2" placeholder="—">${i(e.summary||"")}</textarea></div>
      <div class="ie-field"><label>description</label>
        <textarea class="ie" data-k="description" rows="6" placeholder="—">${i(e.description||"")}</textarea></div>
    </div>
    <div class="role-meta">
      ${e.posted_at?`<span>posted ${i(e.posted_at)}</span>`:""}
      <button type="button" class="role-company role-company-link" id="pursuit-company-link"
              title="open the company panel">${i(e.company)} ↗</button>
    </div>`}function kt(){const e=p.row,t=()=>new Date().toISOString().slice(0,10),n=document.querySelector("#pursuit-body .pt-applied");n&&n.addEventListener("click",()=>U({applied_at:e.applied_at?"":t()}));const s=document.querySelector("#pursuit-body .pl-applied-date");s&&s.addEventListener("change",c=>U({applied_at:c.target.value}));const a=document.querySelector("#pursuit-body .pl-response");a&&a.addEventListener("change",c=>U({response:c.target.value}));const o=document.querySelector("#pursuit-body .pt-nextup");o&&o.addEventListener("click",()=>Ve(p.row,!0))}async function Ve(e,t){let n;try{n=await fetch(`/api/postings/${e.posting_id}/next-up`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({next_up:!e.next_up})})}catch(a){l(`save failed: ${a.message}`);return}if(!n.ok){const a=(await n.text().catch(()=>"")).trim();l(`save failed: ${a||"HTTP "+n.status}`);return}const s=await n.json();e.next_up=s.next_up,x(),t&&W(),l(e.next_up?"queued next up":"removed from the queue")}async function Ue(e,t){const n={applied_at:e.applied_at||"",response:e.response||"",outreach_count:e.outreach_count||0,last_outreach_at:e.last_outreach_at||"",contacts:e.contacts||"",notes:e.notes||"",...t};let s;try{s=await fetch(`/api/postings/${e.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)})}catch(o){return l(`save failed: ${o.message}`),null}if(!s.ok){const o=(await s.text().catch(()=>"")).trim();return l(`save failed: ${o||"HTTP "+s.status}`),null}const a=await s.json();return Object.assign(e,{applied_at:a.applied_at,response:a.response,outreach_count:a.outreach_count,last_outreach_at:a.last_outreach_at,contacts:a.contacts,notes:a.notes,next_up:a.next_up}),a}async function Et(e){const t=p.row,n={applied_at:t.applied_at||"",response:t.response||"",outreach_count:t.outreach_count||0,last_outreach_at:t.last_outreach_at||"",contacts:t.contacts||"",notes:e},s=await fetch(`/api/postings/${t.posting_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status);const a=await s.json();t.notes=a.notes,x()}async function U(e){await Ue(p.row,e)&&(x(),W(),l("tracking saved"))}async function oe(e,t){await Ue(e,t)&&(x(),p.postingId===e.posting_id&&(p.row=e,W()),l("tracking saved"))}function Y(){const e=document.getElementById("outreach-section");if(!e)return;const t=p.row,n=p.drafts,s=n[0]||null,a=n.slice(1),o=`
    <div class="outreach-meta">
      <span><span class="om-count">${t.outreach_count||0}</span> sent</span>
      ${t.last_outreach_at?`<span>· last ${i(t.last_outreach_at)}</span>`:""}
      <span class="pt-stepper">
        <button class="btn pt-outreach-dec" title="undo one outreach" ${t.outreach_count?"":"disabled"}>−</button>
        <button class="btn pt-outreach" title="log one outreach sent outside scout — today">+1 outreach</button>
      </span>
    </div>
    <div class="outreach-contacts">
      <input class="input oc-input" value="${i(t.contacts||"")}"
             placeholder="add contacts, comma-separated (emails become links)" spellcheck="false"
             title="outreach contacts for this role — saved on Enter or click-away">
      <div class="oc-rendered">${qe(t.contacts)}</div>
    </div>`,h=s&&($t(s.status)||s.status==="failed")?"":`<button class="btn btn-primary" id="draft-start-btn">${s?"Draft again":"Draft outreach"}</button>`,u=a.length?`
    <details class="draft-history" ${p.openHist?"open":""}>
      <summary>${a.length} earlier draft${a.length>1?"s":""}</summary>
      <div id="draft-history-body">${a.map(d=>De(d,!0)).join("")}</div>
    </details>`:"";e.innerHTML=o+`<div id="draft-current">${s?De(s,!1):""}</div><div class="draft-actions">${h}</div>`+u,_t()}function $t(e){return e==="researching"||e==="awaiting_review"||e==="no_hook"}function De(e,t){const n=(e.updated_at||e.created_at||"").replace("T"," ").slice(0,16),s=(m,f)=>`
    <div class="draft-head">
      <span class="${m}">${f}</span>
      <span class="dh-time">${i(n)}</span>
    </div>`;if(e.status==="researching")return`<div class="draft-card dc-busy">
      ${s("loading-row",'<span class="spinner"></span><span>researching…</span>')}
      <div class="draft-note">Gathering hook candidates and drafting — this usually takes a minute or two.</div>
    </div>`;if(e.status==="failed"){const m=xt(e.violations);return`<div class="draft-card dc-failed" data-did="${e.id}">
      ${s("pill pill-no","failed")}
      ${e.fail_reason?`<div class="draft-note">${i(e.fail_reason)}</div>`:""}
      ${m}
      ${ie(e)}
      ${t?"":'<div class="draft-actions"><button class="btn btn-primary draft-retry-btn">Retry</button></div>'}
    </div>`}if(e.status==="sent")return`<div class="draft-card dc-sent" data-did="${e.id}">
      ${s("pill pill-yes","sent")}
      ${e.sent_at?`<div class="draft-note">Sent ${i((e.sent_at||"").replace("T"," ").slice(0,16))}</div>`:""}
      <div class="draft-sentbody">${i(Je(e)||"(empty)")}</div>
      ${ie(e)}
    </div>`;const a=Je(e),o=e.status==="no_hook",c=o?'<span class="pill pill-info">no honest hook</span>':'<span class="pill pill-maybe">awaiting review</span>';let h="";if(o)try{h=JSON.parse(e.hook||"{}").reasoning||""}catch{}const u=o?`<div class="draft-note">No honest hook found — nothing true to say yet; scout recommends not emailing.${h?" "+i(h):""}</div>`:"";if(t)return`<div class="draft-card ${o?"dc-nohook":"dc-review"}" data-did="${e.id}">
      <div class="draft-head">${c}<span class="dh-time">${i(n)}</span></div>
      ${u}
      <div class="draft-sentbody">${i(a||"(empty)")}</div>
      ${ie(e)}
    </div>`;const d=a||o;return`<div class="draft-card ${o?"dc-nohook":"dc-review"}" data-did="${e.id}">
    <div class="draft-head">${c}<span class="dh-time">${i(n)}</span></div>
    ${u}
    ${d?`<textarea class="draft-textarea" id="draft-edit-${e.id}" spellcheck="false">${i(a)}</textarea>
    ${Fe(e.lint)}
    <div class="draft-actions">
      <button class="btn draft-save-btn">Save</button>
      <button class="btn btn-primary draft-sent-btn">Mark sent</button>
    </div>`:""}
    ${ie(e)}
  </div>`}function Je(e){return e.edited&&e.edited.trim()?e.edited:e.draft||""}function ie(e){let t="",n=null,s=null;try{n=JSON.parse(e.research||"null")}catch{}try{s=JSON.parse(e.hook||"null")}catch{}if(n&&typeof n=="object"){const a=(u,d)=>d?`<div class="tr-line"><span class="tr-key">${u}:</span> ${i(String(d))}</div>`:"",o=n.role||{},c=Array.isArray(n.hooks)?n.hooks:[],h=c.map(u=>`
      <div class="tr-line">
        <span class="tr-key">${i(u.type||"hook")}</span>
        ${v(u.source_url)!=="#"?` · <a href="${v(u.source_url)}" target="_blank" rel="noopener">source</a>`:""}
        <span class="tr-quote">${i(u.quote||"")}</span>
        ${u.context?`<span class="tr-key">${i(u.context)}</span>`:""}
      </div>`).join("");t+=`<details class="draft-trace"><summary>research — ${c.length} hook candidate${c.length===1?"":"s"}</summary>
      <div class="trace-body">
        ${a("what they do",n.what_they_do)}
        ${a("customer",n.customer)}
        ${a("stage / headcount",[n.stage,n.headcount_est].filter(Boolean).join(" / "))}
        ${a("role",o.title)}
        ${(o.jd_quotes||[]).map(u=>`<span class="tr-quote">${i(u)}</span>`).join("")}
        ${h}
        ${a("disambiguation",n.disambiguation)}
        ${a("confidence",n.confidence)}
      </div></details>`}if(s&&typeof s=="object"&&s.decision){const a=s.hook||{};t+=`<details class="draft-trace"><summary>hook — ${i(s.decision)}${s.closer_mode?" · "+i(s.closer_mode):""}</summary>
      <div class="trace-body">
        ${a.quote?`<span class="tr-quote">${i(a.quote)}</span>`:""}
        ${a.thread?`<div class="tr-line"><span class="tr-key">thread:</span> ${i(a.thread)}</div>`:""}
        ${v(a.source_url)!=="#"?`<div class="tr-line"><a href="${v(a.source_url)}" target="_blank" rel="noopener">source</a></div>`:""}
        ${s.reasoning?`<div class="tr-line"><span class="tr-key">reasoning:</span> ${i(s.reasoning)}</div>`:""}
      </div></details>`}return t}function Fe(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<div class="lint-chips">'+t.map(n=>`<span class="lint-chip" title="${i(n.message||"")}"><code>${i(n.code||"")}</code>${i(n.message||"")}</span>`).join("")+"</div>":""}function xt(e){let t=[];try{t=JSON.parse(e||"[]")||[]}catch{t=[]}return t.length?'<ul class="violation-list">'+t.map(n=>`<li>${i(n.claim||n.message||String(n))}${n.why?` <span class="vl-why">— ${i(n.why)}</span>`:""}</li>`).join("")+"</ul>":""}function _t(){const e=document.getElementById("outreach-section");if(!e)return;const t=e.querySelector(".oc-input");t&&(t.addEventListener("change",u=>U({contacts:u.target.value.trim()})),t.addEventListener("keydown",u=>{u.key==="Enter"&&(u.preventDefault(),u.target.blur())}));const n=()=>new Date().toISOString().slice(0,10),s=p.row,a=e.querySelector(".pt-outreach");a&&a.addEventListener("click",()=>U({outreach_count:(s.outreach_count||0)+1,last_outreach_at:n()}));const o=e.querySelector(".pt-outreach-dec");o&&o.addEventListener("click",()=>{const u=Math.max(0,(s.outreach_count||0)-1);U({outreach_count:u,...u===0?{last_outreach_at:""}:{}})});const c=e.querySelector("#draft-start-btn");c&&c.addEventListener("click",ze),e.querySelectorAll(".draft-retry-btn").forEach(u=>u.addEventListener("click",ze)),e.querySelectorAll(".draft-card[data-did]").forEach(u=>{const d=u.dataset.did,m=u.querySelector(".draft-save-btn");m&&m.addEventListener("click",()=>Tt(d));const f=u.querySelector(".draft-sent-btn");f&&f.addEventListener("click",()=>Lt(d))});const h=e.querySelector("details.draft-history");h&&h.addEventListener("toggle",()=>{p.openHist=h.open})}async function ze(){const e=document.getElementById("outreach-section"),t=e&&(e.querySelector("#draft-start-btn")||e.querySelector(".draft-retry-btn"));t&&(t.disabled=!0);let n;try{n=await fetch(`/api/postings/${p.postingId}/outreach`,{method:"POST"})}catch(a){l(`draft failed: ${a.message}`),t&&(t.disabled=!1);return}if(n.status===202){await z();return}if(n.status===409){await z(),l("a draft is already active");return}if(n.status===412){let a={};try{a=await n.json()}catch{}It(a.missing_blocks||[]),t&&(t.disabled=!1);return}if(n.status===503){const a=document.getElementById("outreach-section");if(a){const o=document.createElement("div");o.className="draft-note",o.textContent="Outreach engine not running in this build.",a.appendChild(o)}t&&(t.disabled=!1);return}const s=(await n.text().catch(()=>"")).trim();l(`draft failed: ${s||"HTTP "+n.status}`),t&&(t.disabled=!1)}function It(e){const t=document.getElementById("outreach-section");if(!t)return;const n=t.querySelector(".draft-actions"),s=document.createElement("div");s.className="blocks-gate",s.innerHTML=`
    <div class="draft-note">Outreach needs context blocks that aren't synced yet:</div>
    <ul class="bg-list">${(e.length?e:["(unknown)"]).map(o=>`<li>${i(o)}</li>`).join("")}</ul>
    <button class="btn btn-primary" id="blocks-sync-btn">Sync blocks</button>`,n?n.replaceWith(s):t.appendChild(s);const a=s.querySelector("#blocks-sync-btn");a&&a.addEventListener("click",Bt)}async function Bt(){const e=document.getElementById("blocks-sync-btn");e&&(e.disabled=!0,e.textContent="Syncing…");let t;try{t=await fetch("/api/outreach/sync",{method:"POST"})}catch(n){l(`sync failed: ${n.message}`),e&&(e.disabled=!1,e.textContent="Sync blocks");return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();l(`sync failed: ${n||"HTTP "+t.status}`),e&&(e.disabled=!1,e.textContent="Sync blocks");return}l("blocks synced"),Y()}async function Tt(e){const t=document.getElementById(`draft-edit-${e}`);if(!t)return;let n;try{n=await fetch(`/api/outreach/drafts/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t.value})})}catch(c){l(`save failed: ${c.message}`);return}if(!n.ok){const c=(await n.text().catch(()=>"")).trim();l(`save failed: ${c||"HTTP "+n.status}`);return}const s=await n.json(),a=p.drafts.findIndex(c=>String(c.id)===String(e));a>=0&&(p.drafts[a]=s);const o=t.closest(".draft-card");if(o){const c=o.querySelector(".lint-chips"),h=Fe(s.lint);c?c.outerHTML=h||"":h&&t.insertAdjacentHTML("afterend",h)}l("saved")}async function Lt(e){let t;try{t=await fetch(`/api/outreach/drafts/${e}/sent`,{method:"POST"})}catch(n){l(`failed: ${n.message}`);return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();l(`failed: ${n||"HTTP "+t.status}`);return}l("marked sent"),await z(),k()}async function K(){if(!p.postingId)return;let e;try{const t=await fetch(`/api/postings/${p.postingId}/answers`);if(!t.ok){D();return}e=await t.json()}catch{D();return}p.answers=e.answers||[],p.answersStatus=e.questions_status||"",D(),p.answers.some(t=>t.status==="generating")?jt():$e()}function jt(){p.answersPoll||(p.answersPoll=setInterval(K,4e3))}function $e(){p.answersPoll&&(clearInterval(p.answersPoll),p.answersPoll=null)}function D(){const e=document.getElementById("answers-section");if(!e)return;const t=p.answers,n=p.answersStatus,s=t.some(d=>d.status==="generating"),a=t.length?`<div class="answers-list">${t.map(Mt).join("")}</div>`:"",o=!!p.detecting,c=s||o?" disabled":"",h=d=>`<button class="btn" id="answers-redetect-btn"${o?" disabled":""}>${o?"Detecting…":d}</button>`;let u;n==="ok"&&t.length?u=`<button class="btn ${t.some(m=>!We(m)&&m.status!=="generating")?"btn-primary":""}" id="answers-start-btn"${c}>${s?"Drafting…":"Draft answers"}</button>`+h("Re-detect"):n===""||n==="unreachable"?u=`<button class="btn btn-primary" id="answers-start-btn"${c}>${s?"Drafting…":"Draft answers"}</button>`+h("Re-detect questions"):u=h("Re-detect questions"),e.innerHTML=`<div class="answers-meta">${i(Ct(n,t.length))}</div>`+a+`<div class="answers-actions">${u}</div>`,Pt()}function Ct(e,t){switch(e){case"":return"Not detected yet";case"ok":return`${t} question${t===1?"":"s"} found`;case"none":return"No essay questions on this form";case"unsupported":return"Couldn't read this form — apply on the site";case"unreachable":return"Couldn't reach the application form — try re-detecting";default:return"Couldn't read this form"}}function We(e){return e.edited&&e.edited.trim()?e.edited:e.answer||""}function St(e){switch(e.status){case"ready":return'<span class="pill pill-yes">ready</span>';case"needs_review":return'<span class="pill pill-maybe">needs review</span>';case"failed":return'<span class="pill pill-no">failed</span>';case"generating":return'<span class="pill pill-info">drafting…</span>';default:return'<span class="pill pill-info">not drafted</span>'}}function Mt(e){const t=We(e),n=e.edited&&e.edited.trim(),s=e.status==="generating",a=t.length,o=e.max_length&&a>e.max_length,c=e.max_length?`<span class="answer-count${o?" over":""}">${a} / ${e.max_length}</span>`:`<span class="answer-count">${a} chars</span>`;return`<div class="answer-card ac-${e.status}" data-aid="${e.id}">
    <div class="answer-prompt">${i(e.prompt)}</div>
    ${s?'<div class="answer-busy"><span class="spinner"></span><span>drafting…</span></div>':`<textarea class="ie answer-textarea" id="answer-edit-${e.id}" rows="5" spellcheck="false" placeholder="Draft answers to fill this in, or write your own.">${i(t)}</textarea>`}
    <div class="answer-foot">
      ${St(e)}
      ${n?'<span class="answer-edited" title="your edit wins over the drafted answer">edited</span>':""}
      ${s?"":c}
      ${s?"":'<button class="btn answer-regen-btn" title="re-draft this answer (discards the current text)">Regenerate</button>'}
    </div>
    ${e.status==="needs_review"?`<div class="answer-note answer-review">Flagged by the honesty check — confirm it doesn't overstate your experience before sending.</div>`:""}
    ${e.status==="failed"&&e.fail_reason?`<div class="answer-note answer-fail">${i(At(e.fail_reason))}</div>`:""}
  </div>`}function At(e){return e=String(e||""),e.length>160?e.slice(0,160)+"…":e}function Pt(){const e=document.getElementById("answers-section");if(!e)return;const t=e.querySelector("#answers-start-btn");t&&t.addEventListener("click",qt);const n=e.querySelector("#answers-redetect-btn");n&&n.addEventListener("click",Nt),e.querySelectorAll(".answer-card[data-aid]").forEach(s=>{const a=s.dataset.aid,o=s.querySelector(".answer-textarea");o&&(P(o,h=>Ot(a,h),{multiline:!0}),o.addEventListener("input",()=>Ht(s,o)));const c=s.querySelector(".answer-regen-btn");c&&c.addEventListener("click",()=>Rt(a))})}function Ht(e,t){const n=e.querySelector(".answer-count");if(!n)return;const s=t.value.length,a=n.textContent.includes("/")?parseInt(n.textContent.split("/")[1],10):0;n.textContent=a?`${s} / ${a}`:`${s} chars`,n.classList.toggle("over",!!a&&s>a)}async function qt(){const e=document.getElementById("answers-section"),t=e&&e.querySelector("#answers-start-btn");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/postings/${p.postingId}/answers`,{method:"POST"})}catch(a){l(`draft failed: ${a.message}`),t&&(t.disabled=!1);return}if(n.status===202){await K();return}if(n.status===412){let a={};try{a=await n.json()}catch{}Vt(a.missing_blocks||[]),t&&(t.disabled=!1);return}if(n.status===503){Ye("Answer generation isn't running in this build."),t&&(t.disabled=!1);return}const s=(await n.text().catch(()=>"")).trim();l(`draft failed: ${s||"HTTP "+n.status}`),t&&(t.disabled=!1)}async function Nt(){p.detecting=!0,D();try{const e=await fetch(`/api/postings/${p.postingId}/answers/redetect`,{method:"POST"});if(!e.ok){const t=(await e.text().catch(()=>"")).trim();l(`detect failed: ${t||"HTTP "+e.status}`)}}catch(e){l(`detect failed: ${e.message}`)}p.detecting=!1,await K()}async function Ot(e,t){const n=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({edited:t})});if(!n.ok)throw new Error((await n.text().catch(()=>"")).trim()||"HTTP "+n.status);const s=await n.json(),a=p.answers.findIndex(o=>String(o.id)===String(e));a>=0&&(p.answers[a]=s)}async function Rt(e){let t;try{t=await fetch(`/api/answers/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({regenerate:!0})})}catch(n){l(`regenerate failed: ${n.message}`);return}if(t.status===503){Ye("Answer generation isn't running in this build.");return}if(!t.ok){const n=(await t.text().catch(()=>"")).trim();l(`regenerate failed: ${n||"HTTP "+t.status}`);return}await K()}function Vt(e){const t=document.getElementById("answers-section");if(!t)return;const n=t.querySelector(".answers-actions"),s=document.createElement("div");s.className="blocks-gate",s.innerHTML=`
    <div class="draft-note">Drafting answers needs the experience context block synced:</div>
    <ul class="bg-list">${(e.length?e:["(unknown)"]).map(o=>`<li>${i(o)}</li>`).join("")}</ul>
    <button class="btn btn-primary" id="answers-sync-btn">Sync blocks</button>`,n?n.replaceWith(s):t.appendChild(s);const a=s.querySelector("#answers-sync-btn");a&&a.addEventListener("click",async()=>{a.disabled=!0,a.textContent="Syncing…";try{const o=await fetch("/api/outreach/sync",{method:"POST"});if(!o.ok){const c=(await o.text().catch(()=>"")).trim();l(`sync failed: ${c||"HTTP "+o.status}`),a.disabled=!1,a.textContent="Sync blocks";return}}catch(o){l(`sync failed: ${o.message}`),a.disabled=!1,a.textContent="Sync blocks";return}l("blocks synced"),D()})}function Ye(e){const t=document.getElementById("answers-section");if(!t)return;const n=document.createElement("div");n.className="draft-note",n.textContent=e,t.appendChild(n)}async function re(e){r.openId=e;const t=document.getElementById("pane"),n=document.getElementById("scrim");t.classList.add("open"),n.classList.add("open"),t.setAttribute("aria-hidden","false"),document.getElementById("pane-title").textContent="loading…",document.getElementById("pane-pills").innerHTML="",document.getElementById("pane-body").innerHTML='<div class="loading-row"><span class="spinner"></span><span>loading…</span></div>';let s;try{const a=await fetch(`/api/companies/${e}`);if(!a.ok)throw new Error(`HTTP ${a.status}`);s=await a.json()}catch(a){document.getElementById("pane-body").innerHTML=`<div class="muted">Failed to load detail: ${i(a.message)}</div>`;return}G(s),Q(e)}function ce(){r.openId=null,document.getElementById("pane").classList.remove("open"),document.getElementById("scrim").classList.remove("open"),document.getElementById("pane").setAttribute("aria-hidden","true")}function G(e){document.getElementById("pane-title").innerHTML=`<input class="ie ie-title" id="pane-title-input" placeholder="company name" value="${i(e.name||"")}">`,document.getElementById("pane-pills").innerHTML=`
    <span class="${g(e.has_verdict?e.verdict:"")}">${i(e.has_verdict?e.verdict:"unscored")}</span>
  `;const t=e.model==="manual",n=e.has_verdict?`
    <dl class="kv">
      <dt>verdict</dt><dd><span class="${g(e.verdict)}">${i(e.verdict)}</span>${t?' <span class="small muted">· set by hand</span>':""}</dd>
      <dt>reason</dt><dd>${i(e.reason||"")}</dd>
      <dt>model</dt><dd class="small muted">${i(e.model||"")}</dd>
      <dt>taste version</dt><dd class="small muted"><span class="tooltip" title="scored ${i(e.scored_at)} · model ${i(e.model)}">${i(e.taste_version||"")}</span></dd>
      <dt>scored at</dt><dd class="small muted">${i(e.scored_at||"")}</dd>
    </dl>
  `:'<div class="muted">Not yet scored. Run <code>scout verdict</code>, or set one by hand below.</div>',s=`
    <div class="verdict-edit" id="verdict-edit">
      <div class="ve-label muted small">${e.has_verdict?"override verdict":"set verdict"}</div>
      <div class="ve-pick" id="ve-pick">
        ${["yes","maybe","no"].map(b=>`<button type="button" class="ve-opt${e.has_verdict&&e.verdict===b?" is-on":""}" data-v="${b}">${b}</button>`).join("")}
      </div>
      <div class="prow">
        <input class="input" id="ve-reason" placeholder="reason (optional)" value="${t?i(e.reason||""):""}">
        <button class="btn btn-primary" id="ve-save-btn">Save</button>
      </div>
    </div>`,a=e.has_enrichment?`
    <dl class="kv">
      <dt>url</dt><dd>${e.website_url?`<a href="${v(e.website_url)}" target="_blank" rel="noopener">${i(e.website_url)} ↗</a>`:'<span class="muted">—</span>'}</dd>
      <dt>status</dt><dd class="small">${i(e.fetch_status||"")}${e.fetch_error?` <span class="muted">(${i(e.fetch_error)})</span>`:""}</dd>
      <dt>fetched</dt><dd class="small muted">${i(e.fetched_at||"")}</dd>
    </dl>
    ${e.website_summary?`<div class="summary-box">${i(e.website_summary)}</div>`:""}
  `:'<div class="muted">No enrichment yet. Run <code>scout enrich</code>.</div>',o=!r.meta||r.meta.control!==!1,c=o&&r.meta&&r.meta.verdict?'<button class="h3-action" id="rescore-btn" title="re-score just this company — replaces the current verdict, manual or not">↻ re-score</button>':"",h=o&&e.domain?'<button class="h3-action" id="reenrich-btn" title="re-fetch this company’s site now">↻ re-enrich</button>':"",u=Object.keys(e.raw_json||{}).sort(),d=u.length===0?"":`
    <details class="raw-json">
      <summary>Raw row <span class="dim">(${u.length} fields)</span></summary>
      <table><tbody>
        ${u.map(b=>`<tr><td class="k">${i(b)}</td><td>${i(e.raw_json[b])}</td></tr>`).join("")}
      </tbody></table>
    </details>
  `,m=`
    <div class="flag-bar">
      <span class="fb-state${e.flagged?" is-flagged":""}">
        ${e.flagged?"⚑ flagged":"not flagged"}
        <span class="small muted">· ${e.reviewed_at?`last reviewed ${i(e.reviewed_at)}`:"never reviewed"}</span>
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
    ${m}
    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1m-9 0h11a1 1 0 011 1v7a1 1 0 01-1 1H2.5a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>
        Jobs
      </h3>
      <div id="postings-list">${Ge(e)}</div>
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
      <textarea class="ie ie-notes" id="pane-notes-input" rows="4" placeholder="Your notes on this company — ⌘/Ctrl+Enter or click away to save">${i(e.notes||"")}</textarea>
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M5 6h6M5 9h4"/></svg>
        Company facts
      </h3>
      <div id="facts-body">${Ut(e)}</div>
      ${d}
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3 3 7-7"/></svg>
        Verdict
        ${c}
      </h3>
      ${n}
      ${s}
    </section>

    <section class="pane-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 3 4 3 6s-1 4-3 6c-2-2-3-4-3-6s1-4 3-6z"/></svg>
        Enrichment
        ${h}
      </h3>
      ${a}
    </section>

    <section class="pane-section" id="trace-section">
      <h3>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>
        Decision trail
      </h3>
      <div id="trace-body"><div class="loading-row"><span class="spinner"></span><span>loading trail…</span></div></div>
    </section>
  `;const f=document.getElementById("posting-add-btn");f&&f.addEventListener("click",()=>Ft(e)),Qe(),document.querySelectorAll("#ve-pick .ve-opt").forEach(b=>{b.addEventListener("click",()=>{document.querySelectorAll("#ve-pick .ve-opt").forEach(Pe=>Pe.classList.remove("is-on")),b.classList.add("is-on")})});const _=document.getElementById("ve-save-btn");_&&_.addEventListener("click",()=>Jt(e)),P(document.getElementById("pane-title-input"),b=>Re(e,"name",b)),document.querySelectorAll("#facts-body [data-k]").forEach(b=>P(b,Pe=>Re(e,b.dataset.k,Pe))),P(document.getElementById("pane-domain-input"),b=>yt(e,b)),P(document.getElementById("pane-notes-input"),b=>bt(e,b),{multiline:!0});const T=document.getElementById("flag-toggle-btn");T&&T.addEventListener("click",()=>Ke(e.company_id));const L=document.getElementById("review-stamp-btn");L&&L.addEventListener("click",()=>Dt(e.company_id));const ge=document.getElementById("rescore-btn");ge&&ge.addEventListener("click",()=>_e("verdict",{company_ids:[e.company_id]}));const pt=document.getElementById("reenrich-btn");pt&&pt.addEventListener("click",()=>_e("enrich",{company_ids:[e.company_id]}))}function Ut(e){return`
    <div class="ie-grid">
      <div class="ie-field"><label>website${e.domain?` · <a href="https://${i(e.domain)}" target="_blank" rel="noopener">open ↗</a>`:""}</label>
        <input class="ie" id="pane-domain-input" placeholder="acme.com" value="${i(e.domain||"")}"></div>
      <div class="ie-field"><label>vertical</label>
        <input class="ie" data-k="vertical" placeholder="—" value="${i(e.vertical||"")}"></div>
      <div class="prow">
        <div class="ie-field"><label>location</label>
          <input class="ie" data-k="location" placeholder="—" value="${i(e.location||"")}"></div>
        <div class="ie-field"><label>headcount</label>
          <input class="ie" data-k="headcount" placeholder="—" value="${e.headcount||""}"></div>
      </div>
      <div class="ie-field"><label>stage</label>
        <input class="ie" data-k="funding_stage" placeholder="—" value="${i(e.funding_stage||"")}"></div>
    </div>
    <dl class="kv facts-ro">
      <dt>source</dt><dd class="small muted">${i(e.source)} · ${i(e.source_id)}</dd>
      <dt>ingested</dt><dd class="small muted">${i(e.ingested_at)}</dd>
    </dl>`}async function Dt(e){const t=document.getElementById("review-stamp-btn");t&&(t.disabled=!0);let n;try{n=await fetch(`/api/companies/${e}/reviewed`,{method:"POST"})}catch(o){l(`failed: ${o.message}`),t&&(t.disabled=!1);return}if(!n.ok){const o=await n.text().catch(()=>"");l(`failed: HTTP ${n.status}${o?" — "+o:""}`),t&&(t.disabled=!1);return}const s=await n.json(),a=r.rows.find(o=>o.company_id===e);a&&(a.reviewed_at=s.reviewed_at,H()),r.openId===e&&(G(s),Q(e)),l("reviewed")}async function Ke(e){const t=r.rows.find(o=>o.company_id===e),n=!(t&&t.flagged);let s;try{s=await fetch(`/api/companies/${e}/flagged`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({flagged:n})})}catch(o){l(`failed: ${o.message}`);return}if(!s.ok){const o=await s.text().catch(()=>"");l(`failed: HTTP ${s.status}${o?" — "+o:""}`);return}const a=await s.json();t&&(t.flagged=a.flagged,H()),r.openId===e&&(G(a),Q(e)),k(),l(a.flagged?"flagged":"unflagged")}async function Jt(e){const t=document.querySelector("#ve-pick .ve-opt.is-on");if(!t){l("Pick yes, maybe, or no.");return}const n=t.dataset.v,s=document.getElementById("ve-reason").value.trim(),a=document.getElementById("ve-save-btn");a.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/verdict`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({verdict:n,reason:s})})}catch(h){l(`save failed: ${h.message}`),a.disabled=!1;return}if(!o.ok){const h=await o.text().catch(()=>"");l(`save failed: HTTP ${o.status}${h?" — "+h:""}`),a.disabled=!1;return}const c=await o.json();G(c),Q(c.company_id),E(),I(),k(),l("verdict saved")}function Ge(e){const t=e.postings||[];return t.length?t.map(n=>{const s=[n.location,n.source==="capture"?"captured":"added",(n.created_at||"").slice(0,10)].filter(Boolean).map(i).join(" · "),a=q[n.response]||q[""],o=[n.next_up?'<span class="draft-badge db-next" style="margin-left:0" title="queued next up for outreach">next up</span>':"",`<span class="pill ${a.cls}">${i(a.label)}</span>`,`<span class="pt-meta">${n.applied_at?`applied ${i(n.applied_at)}`:"not applied"}</span>`,`<span class="pt-meta">${n.outreach_count?`${n.outreach_count} sent · last ${i(n.last_outreach_at||"?")}`:"no outreach yet"}</span>`].filter(Boolean).join("");return`
    <div class="brain-node posting-card" data-pid="${i(n.id)}" title="open the pursuit — tracking, outreach, drafts">
      <div class="n"><a href="${v(n.url)}" target="_blank" rel="noopener">${i(n.title||n.url)} ↗</a></div>
      ${n.summary?`<div class="small muted" style="margin-top:3px">${i(n.summary)}</div>`:""}
      ${s?`<div class="l" style="margin-top:3px">${s}</div>`:""}
      <div class="pcard-status">${o}<span class="pcard-open">pursuit →</span></div>
    </div>`}).join(""):'<div class="muted">No job links yet.</div>'}function Qe(){document.querySelectorAll("#postings-list .posting-card").forEach(e=>{e.addEventListener("click",t=>{t.target.closest("a")||(ce(),Ne(e.dataset.pid))})})}async function Ft(e){const t=document.getElementById("posting-url"),n=document.getElementById("posting-title"),s=document.getElementById("posting-add-btn"),a=t.value.trim();if(!a){l("Enter a URL first."),t.focus();return}s.disabled=!0;let o;try{o=await fetch(`/api/companies/${e.company_id}/postings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:a,title:n.value.trim()})})}catch(u){l(`add failed: ${u.message}`),s.disabled=!1;return}if(!o.ok){const u=await o.text().catch(()=>"");l(`add failed: HTTP ${o.status}${u?" — "+u:""}`),s.disabled=!1;return}const c=await o.json();e.postings=(e.postings||[]).filter(u=>u.id!==c.id),e.postings.unshift(c);const h=document.getElementById("postings-list");h&&(h.innerHTML=Ge(e),Qe()),t.value="",n.value="",s.disabled=!1,k(),l("link added")}async function Q(e){let t;try{t=await fetch(`/api/companies/${e}/trace`)}catch(s){de(`<div class="muted">Failed to load trail: ${i(s.message)}</div>`);return}if(!t.ok){de(`<div class="muted">Failed to load trail: HTTP ${t.status}.</div>`);return}const n=(await t.json()).events||[];if(n.length===0){de('<div class="muted">No decision trail yet. Run <code>verdict</code> to record one — every scoring pass is captured here.</div>');return}de(n.map(zt).join(""))}function zt(e){const t=[e.criteria_source,e.taste_version].filter(Boolean).map(i);return e.run_id&&t.push("run "+i(e.run_id.slice(0,8))),`
    <div class="trail-event">
      <div class="trail-head">
        <span class="${g(e.verdict)}">${i(e.verdict)}</span>
        <span class="trail-meta mono">${i(e.model||"")}</span>
        <span class="trail-meta trail-time">${i(e.scored_at||"")}</span>
      </div>
      <div class="trail-decision">
        <span class="trail-reason">${i(e.reason||"")}</span>
      </div>
      <div class="trail-foot muted small">criteria: ${t.join(" · ")||"—"}</div>
    </div>`}function de(e){const t=document.getElementById("trace-body");t&&(t.innerHTML=e)}let Xe;function l(e){const t=document.getElementById("toast");t.textContent=e,t.classList.toggle("err",/\b(fail(ed)?|error|disabled|already running)\b/i.test(e)),t.classList.add("show"),clearTimeout(Xe),Xe=setTimeout(()=>t.classList.remove("show"),2200)}r.meta={control:!1,brain:!1,verdict:!1};async function Wt(){try{const n=await fetch("/api/meta");if(!n.ok)return;r.meta=await n.json()}catch{return}const e=r.meta.control;document.getElementById("btn-ingest").disabled=!e,document.getElementById("btn-enrich").disabled=!e;const t=document.getElementById("btn-verdict");t.disabled=!e||!r.meta.verdict,t.title=r.meta.verdict?"":"set ANTHROPIC_API_KEY in the server env to enable"}async function xe(){let e;try{const s=await fetch("/api/runs");if(!s.ok)return;e=await s.json()}catch{return}const t=e.busy_stage||"",n=document.getElementById("run-busy");t?(n.style.display="",document.getElementById("run-busy-label").textContent=t+" running…"):n.style.display="none",document.getElementById("btn-ingest").classList.toggle("busy",t==="ingest"),document.getElementById("btn-enrich").classList.toggle("busy",t==="enrich"),document.getElementById("btn-verdict").classList.toggle("busy",t==="verdict")}let le=null;async function _e(e,t){if(r.meta&&r.meta.control===!1){l("control surface disabled");return}let n;try{n=await fetch(`/api/run/${e}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t||{})})}catch(a){l(`run failed: ${a.message}`);return}if(n.status===409){l("a job is already running");return}if(n.status===412){const a=await n.text();l(a.trim());return}if(!n.ok){l(`run failed: HTTP ${n.status}`);return}const{job_id:s}=await n.json();ot(e,s)}async function Yt(e){const t=new FormData;t.append("csv",e);let n;try{n=await fetch("/api/ingest",{method:"POST",body:t})}catch(a){l(`upload failed: ${a.message}`);return}if(n.status===409){l("a job is already running");return}if(!n.ok){l(`upload failed: HTTP ${n.status}`);return}const{job_id:s}=await n.json();ot("ingest",s)}const Kt=["add-url","add-name","add-location","add-headcount","add-title","add-job-company"];let ue=[],N=new Set,O="company";function Ze(e){O=e,document.querySelectorAll("#add-kind .v-chip").forEach(s=>s.classList.toggle("is-on",s.dataset.kind===e)),document.getElementById("add-company-fields").style.display=e==="company"?"":"none",document.getElementById("add-job-fields").style.display=e==="job"?"":"none";const t=document.getElementById("add-url-label"),n=document.getElementById("add-url");e==="company"?(t.innerHTML='Website<span class="req">*</span>',n.placeholder="acme.com"):(t.innerHTML='Posting URL<span class="req">*</span>',n.placeholder="https://… the job posting"),document.getElementById("add-save").textContent=e==="company"?"Add company":"Add job",et()}function Ie(){return!!r.meta.capture&&document.getElementById("add-enrich").checked}function et(){const e=document.getElementById("add-note");Ie()?e.innerHTML=O==="company"?"scout fetches the page and fills the blank fields — your values win. The page text also seeds enrichment, so the next Verdict can score it. Pages behind a login wall (LinkedIn) usually can't be fetched.":"scout fetches the posting and fills in the title, location and summary — your values win. The job attaches to its company, adding it to the list first if needed. Pages behind a login wall (LinkedIn) usually can't be fetched.":e.innerHTML=O==="company"?"Stored as source <code>manual</code>. Run Enrich then Verdict to score it. A website already in the list is rejected — manual adds never overwrite an existing company.":"Stored as-is, no fetch. The job attaches to the typed company, or to the link's own domain when the posting lives on the company's site — for an ATS link (greenhouse, lever, …), type the company."}async function Gt(){Kt.forEach(s=>{document.getElementById(s).value=""}),document.getElementById("add-vertical-filter").value="",N=new Set;const e=document.getElementById("add-enrich"),t=document.getElementById("add-enrich-row");e.disabled=!r.meta.capture,t.classList.toggle("disabled",!r.meta.capture),t.title=r.meta.capture?"":"set ANTHROPIC_API_KEY in the server env to enable",r.meta.capture||(e.checked=!1),Ze(r.view==="jobs"?"job":"company");const n=document.getElementById("add-stage");n.innerHTML='<option value="">—</option>',document.getElementById("add-vertical-chips").innerHTML='<div class="none">loading…</div>',document.getElementById("add-company-names").innerHTML=(r.rows||[]).map(s=>`<option value="${i(s.name)}">`).join(""),document.getElementById("add-scrim").classList.add("open"),document.getElementById("add-url").focus();try{const s=await(await fetch("/api/facets")).json();(s.funding_stages||[]).forEach(a=>{const o=document.createElement("option");o.value=a,o.textContent=a,n.appendChild(o)}),ue=s.verticals||[]}catch{ue=[]}tt()}function pe(){document.getElementById("add-scrim").classList.remove("open")}function tt(){const e=document.getElementById("add-vertical-chips"),t=document.getElementById("add-vertical-filter").value.trim().toLowerCase(),n=ue.filter(s=>!t||s.toLowerCase().includes(t));n.length?(e.innerHTML=n.map(s=>`<button type="button" class="vchip${N.has(s)?" sel":""}" data-v="${i(s)}">${i(s)}</button>`).join(""),e.querySelectorAll(".vchip").forEach(s=>s.addEventListener("click",()=>{const a=s.dataset.v;N.has(a)?N.delete(a):N.add(a),s.classList.toggle("sel"),nt()}))):e.innerHTML=`<div class="none">${ue.length?"no match":"no verticals in the set yet"}</div>`,nt()}function nt(){const e=N.size;document.getElementById("add-vertical-count").textContent=e?`· ${e} selected`:""}function st(e){return/^https?:\/\//i.test(e)?e:"https://"+e}async function at(){const e=document.getElementById("add-url"),t=e.value.trim();if(!t){l(O==="company"?"Website is required.":"Posting URL is required."),e.focus();return}const n=document.getElementById("add-save"),s=n.textContent;n.disabled=!0,Ie()&&(n.textContent="reading page…");const a=()=>{n.disabled=!1,n.textContent=s},o=f=>document.getElementById(f).value.trim(),c=Ie();let h,u;c?(h="/api/capture",u={url:st(t),kind:O==="company"?"company_page":"job_posting",fields:O==="company"?{name:o("add-name"),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value,vertical:[...N].join(", ")}:{name:o("add-job-company"),title:o("add-title")}}):O==="company"?(h="/api/companies",u={website:t,name:o("add-name"),vertical:[...N].join(", "),location:o("add-location"),headcount:o("add-headcount"),funding_stage:document.getElementById("add-stage").value}):(h="/api/postings",u={url:st(t),title:o("add-title"),company:o("add-job-company")});let d;try{d=await fetch(h,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(u)})}catch(f){l(`add failed: ${f.message}`),a();return}if(!d.ok){let f=`HTTP ${d.status}`;try{const _=await d.text();try{f=JSON.parse(_).error||f}catch{f=_.trim()||f}}catch{}if(a(),d.status===409){l(f||"That company is already in the list."),e.focus(),e.select();return}l(`add failed: ${f}`);return}const m=await d.json();if(a(),c&&!m.company_id){l(m.note||"couldn't classify that page");return}if(pe(),E(),I(),k(),O==="job"){const f=m.posting&&m.posting.title||"job link";l(`tracking: ${f} @ ${m.company_name}${m.posting_updated?" (refreshed)":""}`),C("jobs")}else c?(l(m.company_created?`company added: ${m.company_name}`:`${m.company_name} is already in the list`),re(m.company_id)):l("company added")}function ot(e,t){le=t;const n=document.getElementById("drawer"),s=document.getElementById("drawer-log");document.getElementById("drawer-title").textContent=e,document.getElementById("drawer-spinner").style.display="",document.getElementById("drawer-cancel").style.display="",document.getElementById("drawer-close").style.display="none",s.innerHTML="",n.classList.add("open"),xe();const a=new EventSource(`/api/jobs/${t}/stream`),o=(c,h)=>{const u=document.createElement("div"),d=!h&&/^\s*warn:/i.test(c);u.className="ln"+(h?" ln-err":d?" ln-warn":""),u.textContent=d?c.replace(/^\s*warn:\s*/i,"⚠ "):c,s.appendChild(u),s.scrollTop=s.scrollHeight};a.addEventListener("line",c=>o(c.data,/error|failed/i.test(c.data))),a.addEventListener("end",c=>{a.close(),le=null,o(`— ${c.data} —`,c.data==="failed"),document.getElementById("drawer-spinner").style.display="none",document.getElementById("drawer-cancel").style.display="none",document.getElementById("drawer-close").style.display="",l(`${e} ${c.data}`),E(),I(),xe(),k(),r.openId&&re(r.openId)}),a.onerror=()=>{a.close()}}async function Qt(){if(le)try{await fetch(`/api/jobs/${le}/cancel`,{method:"POST"})}catch{}}let X=null;async function it(e){X=e;const t=document.getElementById("editor-scrim");document.getElementById("editor-title").textContent="edit "+e+".md",document.getElementById("editor-text").value="loading…",document.getElementById("editor-ver").textContent="",t.classList.add("open");try{const s=await(await fetch(`/api/${e}`)).json();document.getElementById("editor-text").value=s.content||"",s.taste_version&&(document.getElementById("editor-ver").textContent="version "+s.taste_version)}catch(n){document.getElementById("editor-text").value="failed to load: "+n.message}}function he(){document.getElementById("editor-scrim").classList.remove("open"),X=null}const Be=["subject_name","signature","lens","hook_prefs","arc"];let rt=!1;async function Xt(){document.getElementById("sender-scrim").classList.add("open");let t={};try{t=await(await fetch("/api/outreach/sender")).json()}catch(n){l(`failed to load identity: ${n.message}`)}for(const n of Be){const s=document.getElementById("snd-"+n);s&&(s.value=t[n]||"")}if(!rt){for(const n of Be){const s=document.getElementById("snd-"+n);P(s,a=>Zt(n,a),{multiline:s&&s.tagName==="TEXTAREA"})}rt=!0}}async function Zt(e,t){const n={};for(const a of Be){const o=document.getElementById("snd-"+a);n[a]=o?o.value:""}n[e]=t;const s=await fetch("/api/outreach/sender",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)});if(!s.ok)throw new Error((await s.text().catch(()=>"")).trim()||"HTTP "+s.status)}function Te(){document.getElementById("sender-scrim").classList.remove("open")}async function en(){if(!X)return;const e=document.getElementById("editor-text").value;let t;try{t=await fetch(`/api/${X}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:e})})}catch(s){l(`save failed: ${s.message}`);return}if(!t.ok){l(`save failed: HTTP ${t.status}`);return}const n=await t.json();n.taste_version&&(document.getElementById("editor-ver").textContent="version "+n.taste_version),l(`${X}.md saved`),he(),I()}document.querySelectorAll("#t thead th[data-k]").forEach(e=>{e.onclick=()=>{const t=e.dataset.k;r.sort.k===t?r.sort.dir*=-1:(r.sort.k=t,r.sort.dir=1),H()}}),document.querySelectorAll("#jt thead th[data-jk]").forEach(e=>{e.onclick=()=>{const t=e.dataset.jk;r.jsort.k===t?r.jsort.dir*=-1:(r.jsort.k=t,r.jsort.dir=1),x()}}),document.getElementById("tab-companies").onclick=()=>C("companies"),document.getElementById("tab-jobs").onclick=()=>C("jobs"),document.getElementById("q").oninput=H,document.querySelectorAll("#verdict-chips .v-chip[data-v]").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.v;S.has(t)?S.delete(t):S.add(t),B(),H()})}),document.getElementById("flag-filter").addEventListener("click",e=>{w=!w,e.currentTarget.classList.toggle("is-on",w),H()}),document.getElementById("jq").oninput=x,document.getElementById("hide-rejected").addEventListener("click",e=>{V=!V,e.currentTarget.classList.toggle("is-on",V),x()}),document.querySelectorAll("#response-chips .v-chip[data-r]").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.r;A.has(t)?A.delete(t):A.add(t),e.classList.toggle("is-on",A.has(t)),x()})}),document.getElementById("next-up-filter").addEventListener("click",e=>{se=!se,e.currentTarget.classList.toggle("is-on",se),x()}),document.getElementById("not-reached-filter").addEventListener("click",e=>{ae=!ae,e.currentTarget.classList.toggle("is-on",ae),x()}),we(),ne(),document.getElementById("pane-close").onclick=ce,document.getElementById("scrim").onclick=ce,document.getElementById("pursuit-close").onclick=ke,document.getElementById("pursuit-scrim").onclick=ke,document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(on()){Ae();return}if(document.getElementById("profile-scrim").classList.contains("open")){Me();return}if(document.getElementById("add-scrim").classList.contains("open")){pe();return}if(document.getElementById("run-scrim").classList.contains("open")){me();return}if(document.getElementById("help-scrim").classList.contains("open")){fe();return}if(document.getElementById("pane").classList.contains("open")){ce();return}if(document.getElementById("pursuit-pane").classList.contains("open")){ke();return}if(document.getElementById("sender-scrim").classList.contains("open")){Te();return}document.getElementById("editor-scrim").classList.contains("open")&&he()}});let Le=null;const tn={enrich:"Fetches and summarizes each company's pages, filling its enrichment row.",verdict:"Scores every company against your criteria — one LLM call each. Only companies with a successful enrichment are scored."};function ct(e){if(r.meta&&r.meta.control===!1){l("control surface disabled");return}Le=e,document.getElementById("run-title").textContent="Run "+e,document.getElementById("run-desc").textContent=tn[e]||"",document.getElementById("run-only-blanks").checked=!1,document.getElementById("run-workers-input").value=e==="verdict"?10:8;const t=document.getElementById("run-warn"),n=r.stats||{},s=Math.max(0,(n.total_companies||0)-(n.enriched_ok||0));e==="verdict"&&s>0?(document.getElementById("run-warn-text").textContent=`${s} ${s===1?"company isn't":"companies aren't"} enriched yet — verdict will skip ${s===1?"it":"them"}. Run Enrich first to include ${s===1?"it":"them"}.`,t.style.display=""):t.style.display="none",document.getElementById("run-scrim").classList.add("open")}function me(){document.getElementById("run-scrim").classList.remove("open"),Le=null}document.getElementById("btn-enrich").onclick=()=>ct("enrich"),document.getElementById("btn-verdict").onclick=()=>ct("verdict"),document.getElementById("run-cancel").onclick=me,document.getElementById("run-scrim").onclick=e=>{e.target.id==="run-scrim"&&me()},document.getElementById("run-go").onclick=()=>{const e=Le,t=document.getElementById("run-only-blanks").checked,n=parseInt(document.getElementById("run-workers-input").value,10);if(me(),!e)return;const s={};t&&(s.only_blanks=!0),n>0&&(s.workers=n),_e(e,s)},document.getElementById("btn-ingest").onclick=()=>document.getElementById("csv-file").click(),document.getElementById("btn-add").onclick=Gt;const nn={add:{title:"Add data",intro:"Two ways to get companies and jobs into scout.",items:[{name:"Ingest CSV",sec:"ingest",desc:"Bulk-import companies from a CSV export (e.g. Crunchbase). Columns are mapped to company fields and new rows are created."},{name:"Add",sec:"ingest",desc:"Add one company or job from its link. Tick “fill in the blanks” to let an ATS API (ashby/greenhouse/lever) or one cheap agent pass complete the details."}]},run:{title:"Run the pipeline",intro:"Enrich must run before Verdict — verdict only scores companies that already have a successful enrichment row.",items:[{name:"Enrich",sec:"enrich",desc:"Fetches and summarizes each company's web presence into an enrichment row. A prerequisite for Verdict."},{name:"Verdict",sec:"verdict",desc:"Scores each enriched company against your criteria with the LLM, producing a yes / maybe / no with reasoning."}]}};function dt(e){const t=nn[e];if(!t)return;document.getElementById("help-title").textContent=t.title;const n=document.getElementById("help-items");if(n.innerHTML="",t.intro){const s=document.createElement("p");s.className="help-intro",s.textContent=t.intro,n.appendChild(s)}t.items.forEach(s=>{const a=document.createElement("div");a.className="help-item";const o=document.createElement("div");o.className="help-item-name",o.textContent=s.name;const c=document.createElement("div");c.className="help-item-desc",c.textContent=s.desc;const h=document.createElement("a");h.className="help-link",h.textContent="Learn more →",h.onclick=()=>{fe(),ut(),rn(s.sec)},a.appendChild(o),a.appendChild(c),a.appendChild(h),n.appendChild(a)}),document.getElementById("help-scrim").classList.add("open")}function fe(){document.getElementById("help-scrim").classList.remove("open")}document.getElementById("help-add").onclick=()=>dt("add"),document.getElementById("help-run").onclick=()=>dt("run"),document.getElementById("help-close").onclick=fe,document.getElementById("help-scrim").onclick=e=>{e.target.id==="help-scrim"&&fe()},document.getElementById("add-cancel").onclick=pe,document.getElementById("add-save").onclick=at,document.getElementById("add-scrim").onclick=e=>{e.target.id==="add-scrim"&&pe()},document.querySelectorAll("#add-kind .v-chip").forEach(e=>{e.onclick=()=>Ze(e.dataset.kind)}),document.getElementById("add-enrich").addEventListener("change",et),document.getElementById("add-scrim").addEventListener("keydown",e=>{e.key==="Enter"&&(e.target.tagName!=="INPUT"||e.target.type==="checkbox"||e.target.id==="add-vertical-filter"||e.target.id==="add-job-company"||(e.preventDefault(),at()))}),document.getElementById("add-vertical-filter").addEventListener("input",tt),document.getElementById("add-headcount").addEventListener("input",e=>{const t=e.target.value.replace(/[^0-9]/g,"");t!==e.target.value&&(e.target.value=t)}),document.getElementById("csv-file").onchange=e=>{const t=e.target.files&&e.target.files[0];t&&Yt(t),e.target.value=""},document.getElementById("drawer-cancel").onclick=Qt,document.getElementById("drawer-close").onclick=()=>document.getElementById("drawer").classList.remove("open"),document.getElementById("editor-cancel").onclick=he,document.getElementById("editor-save").onclick=en,document.getElementById("editor-scrim").onclick=e=>{e.target.id==="editor-scrim"&&he()},document.getElementById("sender-close").onclick=Te,document.getElementById("sender-scrim").onclick=e=>{e.target.id==="sender-scrim"&&Te()};function lt(e){if(e==null)return"—";let t=Math.max(0,e|0);if(t<90)return`${t}s ago`;const n=Math.round(t/60);if(n<90)return`${n}m ago`;const s=Math.round(n/60);return s<48?`${s}h ago`:`${Math.round(s/24)}d ago`}async function je(){try{const e=await fetch("/api/profile");if(!e.ok)throw new Error(`HTTP ${e.status}`);r.profile=await e.json()}catch{r.profile=null}Se()}const Ce='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.6 2.4a1.2 1.2 0 0 1 1.7 1.7L5.6 11.8l-3 1 1-3z"/><path d="M10.4 3.6l2 2"/></svg>';function Se(){const e=document.getElementById("criteria-stats");if(!e)return;const t=r.profile,n=r.stats&&r.stats.stale_verdicts||0,a=(t&&t.active_source||r.stats&&r.stats.taste_source||"").startsWith("brain:"),o=t&&typeof t.body=="string";let c="";if(a){let _="off",T="";t&&!t.reachable&&o?(_="warn",T="brain offline · using cache"):t&&t.stale?(_="warn",T="cached · stale"):o&&(_="ok",T="fetched "+lt(t.age_seconds)),c+=`<div class="crit-row">
      <span class="crit-what"><span class="pf-dot ${_}"></span>brain profile</span>
      <span class="crit-acts">
        ${o?'<span class="edit-link" id="view-profile">view</span><span class="dim">·</span>':""}
        <span class="edit-link" id="refresh-profile">refresh</span>
      </span></div>`,T&&(c+=`<div class="crit-note dim small">${i(T)}</div>`)}else c+=`<div class="crit-row">
      <span class="crit-what">taste</span>
      <button class="crit-edit" id="edit-taste" title="edit taste.md" aria-label="edit taste">${Ce}</button></div>`,t&&t.configured&&(c+='<div class="crit-note dim small">brain offline — local fallback</div>');c+=`<div class="crit-row">
    <span class="crit-what">playbook</span>
    <button class="crit-edit" id="edit-playbook" title="edit playbook.md" aria-label="edit playbook">${Ce}</button></div>`,c+=`<div class="crit-row">
    <span class="crit-what">outreach identity</span>
    <button class="crit-edit" id="edit-sender" title="edit outreach identity" aria-label="edit outreach identity">${Ce}</button></div>`,n>0&&(c+=`<div class="stale">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 5v4M8 11.5v.5" stroke-linecap="round"/><circle cx="8" cy="8" r="6.5"/></svg>
      ${n} verdicts stale</div>`),e.innerHTML=c;const h=document.getElementById("view-profile");h&&(h.onclick=()=>an(r.profile));const u=document.getElementById("refresh-profile");u&&(u.onclick=sn);const d=document.getElementById("edit-taste");d&&(d.onclick=()=>it("taste"));const m=document.getElementById("edit-playbook");m&&(m.onclick=()=>it("playbook"));const f=document.getElementById("edit-sender");f&&(f.onclick=Xt)}async function sn(){const e=document.getElementById("refresh-profile");e&&(e.textContent="refreshing…",e.style.pointerEvents="none");let t;try{t=await fetch("/api/profile/refresh",{method:"POST"})}catch(n){l(`refresh failed: ${n.message}`),je();return}if(!t.ok){const n=await t.text().catch(()=>"");l(`refresh failed: ${(n||"").trim()||"HTTP "+t.status}`),je();return}r.profile=await t.json(),Se(),l("brain profile refreshed"),I()}function an(e){!e||typeof e.body!="string"||(document.getElementById("profile-modal-meta").textContent=`${e.chars||0} chars · fetched ${lt(e.age_seconds)}`,document.getElementById("profile-modal-body").textContent=e.body,document.getElementById("profile-scrim").classList.add("open"))}function Me(){document.getElementById("profile-scrim").classList.remove("open")}document.getElementById("profile-modal-close").onclick=Me,document.getElementById("profile-scrim").onclick=e=>{e.target.id==="profile-scrim"&&Me()};function ut(){document.getElementById("docs-scrim").classList.add("open");const e=document.querySelector("#docs-nav a");ve(e?e.dataset.sec:null);const t=document.getElementById("docs-body");t&&(t.scrollTop=0)}function Ae(){document.getElementById("docs-scrim").classList.remove("open")}function on(){return document.getElementById("docs-scrim").classList.contains("open")}function ve(e){document.querySelectorAll("#docs-nav a").forEach(t=>t.classList.toggle("active",t.dataset.sec===e))}function rn(e){const t=document.getElementById("doc-"+e);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),ve(e)}document.getElementById("open-docs").onclick=ut,document.getElementById("docs-close").onclick=Ae,document.getElementById("docs-scrim").onclick=e=>{e.target.id==="docs-scrim"&&Ae()},document.querySelectorAll("#docs-nav a").forEach(e=>{e.onclick=()=>{const t=document.getElementById("doc-"+e.dataset.sec);t&&t.scrollIntoView({behavior:"smooth",block:"start"}),ve(e.dataset.sec)}}),function(){const e=document.getElementById("docs-body");if(!e||!("IntersectionObserver"in window))return;const t=new IntersectionObserver(n=>{const s=n.filter(a=>a.isIntersecting).sort((a,o)=>a.boundingClientRect.top-o.boundingClientRect.top);s.length&&ve(s[0].target.id.replace(/^doc-/,""))},{root:e,rootMargin:"0px 0px -65% 0px",threshold:0});document.querySelectorAll("#docs-body section").forEach(n=>t.observe(n))}(),E(),k(),I(),Wt(),xe(),je()}ln({"":{view:()=>({mount(y){y.innerHTML=fn,vn()}}),chrome:!1}},{title:"scout"});hn();mn();
