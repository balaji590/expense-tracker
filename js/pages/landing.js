window.Pages = window.Pages || {};
window.Pages.landing = (function(){
  const U = Utils;

  function renderHeader(){
    return `
      <header class="lp-header">
        <div class="lp-header-inner">
          <a href="#/landing" class="lp-brand"><span class="lp-brand-mark">E</span>ExpenseTracker</a>
          <nav class="lp-nav">
            <a href="#lp-features">Features</a>
            <a href="#lp-how">How It Works</a>
            <a href="#lp-about">About</a>
          </nav>
          <div class="lp-header-actions">
            <button class="lp-btn lp-btn-ghost lp-btn-sm" id="lpHeaderSignIn">Sign In</button>
            <button class="lp-btn lp-btn-primary lp-btn-sm" id="lpHeaderCreate">Create Account</button>
            <button class="lp-menu-btn" id="lpMobileMenuBtn" aria-label="Menu">☰</button>
          </div>
        </div>
        <div class="lp-mobile-nav" id="lpMobileNav">
          <a href="#lp-features">Features</a>
          <a href="#lp-how">How It Works</a>
          <a href="#lp-about">About</a>
          <button id="lpMobileSignIn">Sign In</button>
          <button id="lpMobileCreate">Create Account</button>
        </div>
      </header>
    `;
  }

  function renderHero(){
    return `
      <section class="lp-hero">
        <div>
          <div class="lp-hero-eyebrow">✨ Now with shared expenses &amp; invitations</div>
          <h1>Track. Split. <span class="lp-grad-text">Save More.</span></h1>
          <p>Log personal expenses in seconds, split shared costs with family or roommates, and always know exactly who owes whom — all in one clean, fast app.</p>
          <div class="lp-hero-ctas">
            <button class="lp-btn lp-btn-primary" id="lpHeroGetStarted">Get Started</button>
            <button class="lp-btn lp-btn-ghost" id="lpHeroExplore">Explore Features</button>
          </div>
          <div class="lp-hero-trust">
            <span>⚿ No password, ever</span>
            <span>◫ Built for shared living</span>
            <span>◔ Clear insights</span>
          </div>
          <div class="lp-hero-stats">
            <div class="lp-hero-stat"><b>₹0</b><span>to get started</span></div>
            <div class="lp-hero-stat"><b>2 min</b><span>to your first expense</span></div>
            <div class="lp-hero-stat"><b>No password</b><span>magic-link sign in</span></div>
          </div>
          <div class="lp-hero-social">
            <span class="lp-avatar-stack lp-avatar-stack-lg">
              <span style="background:#4f5bd5">M</span><span style="background:#ec4899">P</span><span style="background:#f59e0b">R</span><span style="background:#10b981">A</span>
            </span>
            <span>Built for families, roommates &amp; friends who split costs together</span>
          </div>
        </div>
        <div class="lp-hero-visual">
          <div class="lp-hero-blob"></div>
          <div class="lp-hero-blob lp-hero-blob-2"></div>

          <div class="lp-hero-card-main">
            <div class="lp-card-label">Total Balance</div>
            <div class="lp-card-amount">₹24,850</div>
            <svg class="lp-card-line" viewBox="0 0 220 60" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lpLineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stop-color="#4f5bd5"/>
                  <stop offset="100%" stop-color="#8b5cf6"/>
                </linearGradient>
              </defs>
              <polyline points="0,45 30,35 60,42 90,20 120,30 150,10 180,18 220,5" fill="none" stroke="url(#lpLineGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div class="lp-card-badge">▲ 12.4% this month</div>
          </div>

          <div class="lp-hero-credit-card">
            <div class="lp-cc-top"><span class="lp-cc-chip"></span><span class="lp-cc-network"><i></i><i></i></span></div>
            <div class="lp-cc-number">•••• •••• •••• 4821</div>
            <div class="lp-cc-bottom"><span>M. Kumar</span><span>05/28</span></div>
          </div>

          <div class="lp-hero-donut-card">
            <svg viewBox="0 0 42 42" class="lp-donut-svg">
              <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#eef0fd" stroke-width="5"></circle>
              <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#4f5bd5" stroke-width="5" stroke-dasharray="40 60" stroke-dashoffset="25" stroke-linecap="round"></circle>
              <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#ec4899" stroke-width="5" stroke-dasharray="25 75" stroke-dashoffset="-15" stroke-linecap="round"></circle>
            </svg>
            <div class="lp-donut-label"><b>Food</b><span>32%</span></div>
          </div>

          <div class="lp-hero-coins">
            <svg viewBox="0 0 90 60" width="82" height="55">
              <ellipse cx="45" cy="46" rx="30" ry="9" fill="#f59e0b"/>
              <ellipse cx="45" cy="41" rx="30" ry="9" fill="#fbbf24"/>
              <ellipse cx="45" cy="36" rx="30" ry="9" fill="#f59e0b"/>
              <ellipse cx="45" cy="31" rx="30" ry="9" fill="#fbbf24"/>
              <ellipse cx="45" cy="26" rx="30" ry="9" fill="#fde68a"/>
              <text x="45" y="30" text-anchor="middle" font-size="11" font-weight="800" fill="#92400e">₹</text>
            </svg>
          </div>

          <div class="lp-hero-piggy">
            <svg viewBox="0 0 130 110" width="108" height="92">
              <ellipse cx="60" cy="95" rx="10" ry="7" fill="#db2777"/>
              <ellipse cx="95" cy="95" rx="10" ry="7" fill="#db2777"/>
              <ellipse cx="65" cy="62" rx="58" ry="40" fill="#f472b6"/>
              <circle cx="112" cy="48" r="16" fill="#f472b6"/>
              <polygon points="102,30 110,40 96,40" fill="#f472b6"/>
              <ellipse cx="120" cy="50" rx="7" ry="5.5" fill="#fbcfe8"/>
              <circle cx="122.5" cy="48" r="1.4" fill="#831843"/>
              <circle cx="122.5" cy="52" r="1.4" fill="#831843"/>
              <circle cx="117" cy="42" r="2.3" fill="#831843"/>
              <rect x="55" y="26" width="16" height="4" rx="2" fill="#831843"/>
              <ellipse cx="30" cy="60" rx="6" ry="9" fill="#fbcfe8"/>
            </svg>
          </div>

          <div class="lp-hero-float-card lp-hero-float-1">
            <span class="lp-coin" style="background:linear-gradient(135deg,#10b981,#06b6d4)">₹</span> Groceries · ₹1,240
          </div>
          <div class="lp-hero-float-card lp-hero-float-2">
            <span class="lp-avatar-stack"><span style="background:#4f5bd5">M</span><span style="background:#ec4899">P</span><span style="background:#f59e0b">R</span></span>
            Split 3 ways
          </div>
          <div class="lp-hero-float-card lp-hero-float-4">
            <span class="lp-coin" style="background:linear-gradient(135deg,#f59e0b,#ec4899)">↻</span> Rent due in 3d
          </div>
        </div>
      </section>
    `;
  }

  const FEATURES = [
    { icon:'≣', color:'linear-gradient(135deg,#4f5bd5,#8b5cf6)', title:'Track Expenses', body:'Add and categorize expenses in seconds, with a monthly sheet that stays organized automatically.' },
    { icon:'◫', color:'linear-gradient(135deg,#06b6d4,#4f5bd5)', title:'Shared Expenses', body:'Create groups for family, roommates, or a trip and manage shared spending together.' },
    { icon:'⇄', color:'linear-gradient(135deg,#10b981,#06b6d4)', title:'Paid By &amp; Split', body:'Track who actually paid, then split equally or with custom amounts per person.' },
    { icon:'◔', color:'linear-gradient(135deg,#8b5cf6,#ec4899)', title:'Analytics', body:'Understand spending patterns with clear category and monthly breakdowns.' },
    { icon:'◎', color:'linear-gradient(135deg,#f59e0b,#ec4899)', title:'Budgets', body:'Set an overall or per-category budget and see exactly where you stand.' },
    { icon:'↻', color:'linear-gradient(135deg,#4f5bd5,#06b6d4)', title:'Recurring', body:'Define recurring expenses like rent or subscriptions and add them in one click.' },
    { icon:'₹', color:'linear-gradient(135deg,#ec4899,#f59e0b)', title:'Balances &amp; Settle Up', body:'See who owes whom at a glance, and record settlements as they happen.' },
    { icon:'⚿', color:'linear-gradient(135deg,#10b981,#4f5bd5)', title:'Secure Authentication', body:'Sign in with a secure magic link sent to your email — no password to remember or leak.' }
  ];

  function renderFeatures(){
    return `
      <section class="lp-section" id="lp-features">
        <div class="lp-section-head">
          <div class="lp-eyebrow">Features</div>
          <h2>Everything you need to manage money together</h2>
          <p>Built for real households, roommates, and trips — not just a personal ledger.</p>
        </div>
        <div class="lp-features-grid">
          ${FEATURES.map(f => `
            <div class="lp-feature-card">
              <div class="lp-feature-icon" style="background:${f.color}">${f.icon}</div>
              <h3>${f.title}</h3>
              <p>${f.body}</p>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  const STEPS = [
    { n:'01', icon:'✉', title:'Create Account', body:'Enter your email — no password needed, ever.' },
    { n:'02', icon:'≣', title:'Track &amp; Add Expenses', body:'Log personal expenses and see them organized instantly.' },
    { n:'03', icon:'◫', title:'Invite &amp; Share', body:'Create a group and invite someone by email to share costs.' },
    { n:'04', icon:'✓', title:'Split &amp; Settle', body:'Split expenses and record settlements as balances even out.' }
  ];

  function renderHowItWorks(){
    return `
      <section class="lp-section" id="lp-how">
        <div class="lp-section-head">
          <div class="lp-eyebrow">How it works</div>
          <h2>Up and running in minutes</h2>
        </div>
        <div class="lp-steps">
          ${STEPS.map(s => `
            <div class="lp-step">
              <div class="lp-step-num">${s.icon}</div>
              <h3>${s.title}</h3>
              <p>${s.body}</p>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderShowcase(){
    return `
      <section class="lp-section" id="lp-showcase">
        <div class="lp-section-head">
          <div class="lp-eyebrow">See it in action</div>
          <h2>A clean, fast interface</h2>
          <p>This is what you'll see once you're signed in — your real dashboard, not a stock photo.</p>
        </div>
        <div class="lp-dash-mock">
          <div class="lp-dash-mock-sidebar">
            <div class="lp-dash-mock-brand"><span class="lp-brand-mark" style="width:24px;height:24px;font-size:12px;">E</span>ExpenseTracker</div>
            <div class="lp-dash-mock-nav">
              <span class="active">◧ Dashboard</span>
              <span>≣ Expenses</span>
              <span>◫ Groups</span>
              <span>◔ Analytics</span>
              <span>◎ Budgets</span>
              <span>⚙ Settings</span>
            </div>
          </div>
          <div class="lp-dash-mock-main">
            <div class="lp-dash-mock-topbar">
              <div>
                <div class="lp-dash-mock-greeting">Good morning, Balaji 👋</div>
                <div class="lp-dash-mock-sub">Here's what's happening with your money.</div>
              </div>
              <span class="lp-btn lp-btn-primary lp-btn-sm" style="pointer-events:none;">+ Add Expense</span>
            </div>
            <div class="lp-dash-mock-stats">
              <div class="lp-dash-stat-card">
                <span class="lp-dash-stat-icon" style="background:linear-gradient(135deg,#4f5bd5,#8b5cf6)">₹</span>
                <div><b>₹24,850</b><span>This month</span></div>
              </div>
              <div class="lp-dash-stat-card">
                <span class="lp-dash-stat-icon" style="background:linear-gradient(135deg,#10b981,#06b6d4)">↗</span>
                <div><b>₹828</b><span>Avg daily</span></div>
              </div>
              <div class="lp-dash-stat-card">
                <span class="lp-dash-stat-icon" style="background:linear-gradient(135deg,#f59e0b,#ec4899)">◔</span>
                <div><b>Food</b><span>Top category</span></div>
              </div>
              <div class="lp-dash-stat-card">
                <span class="lp-dash-stat-icon" style="background:linear-gradient(135deg,#8b5cf6,#ec4899)">◫</span>
                <div><b>2</b><span>Active groups</span></div>
              </div>
            </div>
            <div class="lp-dash-mock-grid">
              <div class="lp-dash-mock-panel">
                <div class="lp-dash-panel-title">Spending trend</div>
                <div class="lp-hero-bars" style="height:100px;">
                  <i style="height:38%"></i><i style="height:62%"></i><i style="height:45%"></i>
                  <i style="height:80%"></i><i style="height:55%"></i><i style="height:70%"></i><i style="height:50%"></i>
                </div>
              </div>
              <div class="lp-dash-mock-panel" style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
                <svg viewBox="0 0 42 42" class="lp-donut-svg" style="width:88px;height:88px;">
                  <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#eef0fd" stroke-width="5"></circle>
                  <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#4f5bd5" stroke-width="5" stroke-dasharray="32 68" stroke-dashoffset="25" stroke-linecap="round"></circle>
                  <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#f59e0b" stroke-width="5" stroke-dasharray="41 59" stroke-dashoffset="-7" stroke-linecap="round"></circle>
                  <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#ec4899" stroke-width="5" stroke-dasharray="12 88" stroke-dashoffset="-48" stroke-linecap="round"></circle>
                </svg>
                <div class="lp-dash-panel-title" style="margin-top:10px;">By category</div>
              </div>
            </div>
            <div class="lp-dash-mock-panel">
              <div class="lp-dash-panel-title">Recent expenses</div>
              <div class="lp-mock-row"><span><span class="lp-mock-pill" style="background:linear-gradient(135deg,#10b981,#06b6d4)">G</span> &nbsp;Groceries</span><b>₹1,240</b></div>
              <div class="lp-mock-row"><span><span class="lp-mock-pill" style="background:linear-gradient(135deg,#f59e0b,#ec4899)">R</span> &nbsp;Rent</span><b>₹15,000</b></div>
              <div class="lp-mock-row"><span><span class="lp-mock-pill" style="background:linear-gradient(135deg,#4f5bd5,#8b5cf6)">T</span> &nbsp;Transport</span><b>₹640</b></div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderCapabilityStrip(){
    const items = [
      { icon:'◧', label:'Modern & Clean UI' },
      { icon:'▦', label:'Fully Responsive' },
      { icon:'☾', label:'Light & Dark Mode' },
      { icon:'⚿', label:'Secure by Design' }
    ];
    return `
      <div class="lp-capability-strip">
        ${items.map(i => `<div class="lp-capability-chip"><span>${i.icon}</span>${i.label}</div>`).join('')}
      </div>
    `;
  }

  function renderCta(){
    return `
      <section class="lp-section" style="padding-bottom:40px;" id="lp-about">
        ${renderCapabilityStrip()}
        <div class="lp-cta-band">
          <h2>Your money, finally in one place.</h2>
          <p>Free to get started. No password. No spreadsheets.</p>
          <div class="lp-cta-actions">
            <button class="lp-btn lp-btn-primary" id="lpCtaGetStarted">Get Started</button>
            <button class="lp-btn lp-btn-ghost" id="lpCtaSignIn">Sign In</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderFooter(){
    return `
      <footer class="lp-footer">
        <div class="lp-footer-inner">
          <a href="#/landing" class="lp-brand"><span class="lp-brand-mark">E</span>ExpenseTracker</a>
          <div class="lp-footer-links">
            <a href="#lp-features">Features</a>
            <a href="#lp-how">How It Works</a>
            <a href="#/signin" id="lpFooterSignIn">Sign In</a>
            <a href="#/create-account" id="lpFooterCreate">Create Account</a>
          </div>
        </div>
        <div class="lp-footer-bottom">© ${new Date().getFullYear()} ExpenseTracker. Built for personal and shared expense tracking.</div>
      </footer>
    `;
  }

  function render(container){
    container.innerHTML = `
      ${renderHeader()}
      ${renderHero()}
      ${renderFeatures()}
      ${renderHowItWorks()}
      ${renderShowcase()}
      ${renderCta()}
      ${renderFooter()}
    `;
    bind(container);
  }

  function goToAuth(mode){
    location.hash = mode === 'create' ? '#/create-account' : '#/signin';
  }

  function bind(container){
    container.querySelector('#lpHeaderSignIn').onclick = ()=> goToAuth('signin');
    container.querySelector('#lpHeaderCreate').onclick = ()=> goToAuth('create');
    container.querySelector('#lpHeroGetStarted').onclick = ()=> goToAuth('create');
    container.querySelector('#lpHeroExplore').onclick = ()=>{
      document.getElementById('lp-features').scrollIntoView({behavior: (window.Animate && Animate.prefersReducedMotion && Animate.prefersReducedMotion()) ? 'auto' : 'smooth'});
    };
    container.querySelector('#lpCtaGetStarted').onclick = ()=> goToAuth('create');
    container.querySelector('#lpCtaSignIn').onclick = ()=> goToAuth('signin');
    container.querySelector('#lpFooterSignIn').onclick = (e)=>{ e.preventDefault(); goToAuth('signin'); };
    container.querySelector('#lpFooterCreate').onclick = (e)=>{ e.preventDefault(); goToAuth('create'); };

    const mobileMenuBtn = container.querySelector('#lpMobileMenuBtn');
    const mobileNav = container.querySelector('#lpMobileNav');
    if(mobileMenuBtn) mobileMenuBtn.onclick = ()=> mobileNav.classList.toggle('open');
    const mobileSignIn = container.querySelector('#lpMobileSignIn');
    if(mobileSignIn) mobileSignIn.onclick = ()=> goToAuth('signin');
    const mobileCreate = container.querySelector('#lpMobileCreate');
    if(mobileCreate) mobileCreate.onclick = ()=> goToAuth('create');
  }

  return { render };
})();
