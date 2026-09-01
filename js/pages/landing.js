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
          <div class="lp-hero-stats">
            <div class="lp-hero-stat"><b>₹0</b><span>to get started</span></div>
            <div class="lp-hero-stat"><b>2 min</b><span>to your first expense</span></div>
            <div class="lp-hero-stat"><b>No password</b><span>magic-link sign in</span></div>
          </div>
        </div>
        <div class="lp-hero-visual">
          <div class="lp-hero-blob"></div>
          <div class="lp-hero-card-main">
            <div class="lp-card-label">This month</div>
            <div class="lp-card-amount">₹24,850</div>
            <div class="lp-hero-bars">
              <i style="height:38%"></i><i style="height:62%"></i><i style="height:45%"></i>
              <i style="height:80%"></i><i style="height:55%"></i><i style="height:70%"></i><i style="height:50%"></i>
            </div>
          </div>
          <div class="lp-hero-float-card lp-hero-float-1">
            <span class="lp-coin" style="background:linear-gradient(135deg,#10b981,#06b6d4)">₹</span> Groceries · ₹1,240
          </div>
          <div class="lp-hero-float-card lp-hero-float-2">
            <span class="lp-avatar-stack"><span style="background:#4f5bd5">M</span><span style="background:#ec4899">P</span><span style="background:#f59e0b">R</span></span>
            Split 3 ways
          </div>
          <div class="lp-hero-float-card lp-hero-float-3">
            <span class="lp-coin" style="background:linear-gradient(135deg,#8b5cf6,#4f5bd5)">✓</span> Settled up
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
    { n:'01', title:'Create Account', body:'Enter your email — no password needed, ever.' },
    { n:'02', title:'Track &amp; Add Expenses', body:'Log personal expenses and see them organized instantly.' },
    { n:'03', title:'Invite &amp; Share', body:'Create a group and invite someone by email to share costs.' },
    { n:'04', title:'Split &amp; Settle', body:'Split expenses and record settlements as balances even out.' }
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
              <div class="lp-step-num">${s.n}</div>
              <h3>${s.title}</h3>
              <p>${s.body}</p>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  const SHOWCASE_TABS = ['Dashboard', 'Expenses', 'Groups', 'Analytics', 'Settle Up'];

  function showcaseContent(tab){
    if(tab === 'Dashboard'){
      return `
        <div class="lp-mock-stats">
          <div class="lp-mock-stat"><b>₹24,850</b><span>This month</span></div>
          <div class="lp-mock-stat"><b>₹828</b><span>Avg daily</span></div>
          <div class="lp-mock-stat"><b>Food</b><span>Top category</span></div>
        </div>
        <div class="lp-mock-row"><span><span class="lp-mock-pill" style="background:linear-gradient(135deg,#10b981,#06b6d4)">G</span> &nbsp;Groceries</span><b>₹1,240</b></div>
        <div class="lp-mock-row"><span><span class="lp-mock-pill" style="background:linear-gradient(135deg,#f59e0b,#ec4899)">R</span> &nbsp;Rent</span><b>₹15,000</b></div>
        <div class="lp-mock-row"><span><span class="lp-mock-pill" style="background:linear-gradient(135deg,#4f5bd5,#8b5cf6)">T</span> &nbsp;Transport</span><b>₹640</b></div>
      `;
    }
    if(tab === 'Expenses'){
      return `
        <div class="lp-mock-row"><span>15 Aug · Coffee</span><b>₹150</b></div>
        <div class="lp-mock-row"><span>14 Aug · Groceries</span><b>₹1,240</b></div>
        <div class="lp-mock-row"><span>12 Aug · Movie tickets</span><b>₹600</b></div>
        <div class="lp-mock-row"><span>10 Aug · Electricity bill</span><b>₹2,100</b></div>
      `;
    }
    if(tab === 'Groups'){
      return `
        <div class="lp-mock-row"><span><span class="lp-avatar-stack"><span style="background:#4f5bd5">M</span><span style="background:#ec4899">P</span></span> &nbsp;Family</span><b>2 members</b></div>
        <div class="lp-mock-row"><span><span class="lp-avatar-stack"><span style="background:#10b981">A</span><span style="background:#f59e0b">R</span><span style="background:#8b5cf6">S</span></span> &nbsp;Roommates</span><b>3 members</b></div>
        <div class="lp-mock-row"><span>Goa Trip</span><b>Pending invite</b></div>
      `;
    }
    if(tab === 'Analytics'){
      return `
        <div class="lp-hero-bars" style="height:90px; margin-bottom:14px;">
          <i style="height:40%"></i><i style="height:70%"></i><i style="height:55%"></i><i style="height:85%"></i><i style="height:60%"></i><i style="height:75%"></i>
        </div>
        <div class="lp-mock-row"><span>Food</span><b>32%</b></div>
        <div class="lp-mock-row"><span>Rent</span><b>41%</b></div>
        <div class="lp-mock-row"><span>Transport</span><b>12%</b></div>
      `;
    }
    return `
      <div class="lp-mock-row"><span>You'll receive</span><b style="color:#10b981">₹1,200</b></div>
      <div class="lp-mock-row"><span>Priya owes</span><b style="color:#f59e0b">₹600</b></div>
      <div class="lp-mock-row"><span>Rahul</span><b>Settled</b></div>
    `;
  }

  function renderShowcase(){
    return `
      <section class="lp-section" id="lp-showcase">
        <div class="lp-section-head">
          <div class="lp-eyebrow">See it in action</div>
          <h2>A clean, fast interface</h2>
          <p>This is what you'll see once you're signed in.</p>
        </div>
        <div class="lp-showcase-tabs" id="lpShowcaseTabs">
          ${SHOWCASE_TABS.map((t,i) => `<button class="lp-showcase-tab ${i===0?'active':''}" data-tab="${t}">${t}</button>`).join('')}
        </div>
        <div class="lp-showcase-frame" id="lpShowcaseFrame">${showcaseContent('Dashboard')}</div>
      </section>
    `;
  }

  function renderCta(){
    return `
      <section class="lp-section" style="padding-bottom:40px;" id="lp-about">
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

    container.querySelectorAll('.lp-showcase-tab').forEach(btn=>{
      btn.onclick = ()=>{
        container.querySelectorAll('.lp-showcase-tab').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        container.querySelector('#lpShowcaseFrame').innerHTML = showcaseContent(btn.getAttribute('data-tab'));
      };
    });
  }

  return { render };
})();
