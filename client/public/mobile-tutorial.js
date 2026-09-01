(() => {
  const STYLE_ID = "note-note-mobile-tutorial-style";
  const SECTION_ID = "no-celular";
  const NAV_ID = "note-note-mobile-nav";

  const styles = `
    #${SECTION_ID}{scroll-margin-top:96px;background:linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%);border-top:1px solid #dbeafe;border-bottom:1px solid #dbeafe;padding:80px 20px;color:#0f172a;font-family:inherit}
    #${SECTION_ID} *{box-sizing:border-box}
    .nn-mobile-wrap{max-width:1180px;margin:0 auto}
    .nn-mobile-head{text-align:center;max-width:760px;margin:0 auto 38px}
    .nn-mobile-kicker{font-size:13px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#2563eb}
    .nn-mobile-title{margin:10px 0 12px;font-size:clamp(30px,5vw,48px);line-height:1.05;font-weight:900;letter-spacing:-.035em}
    .nn-mobile-sub{margin:0;color:#64748b;font-size:17px;line-height:1.7}
    .nn-mobile-tabs{display:flex;justify-content:center;gap:10px;margin-bottom:26px;flex-wrap:wrap}
    .nn-mobile-tab{border:1px solid #bfdbfe;background:#fff;color:#1e40af;border-radius:999px;padding:11px 18px;font-weight:800;cursor:pointer;transition:.2s}
    .nn-mobile-tab.active{background:#2563eb;color:#fff;border-color:#2563eb;box-shadow:0 10px 25px rgba(37,99,235,.2)}
    .nn-mobile-grid{display:grid;grid-template-columns:minmax(290px,.82fr) minmax(0,1.18fr);gap:32px;align-items:center}
    .nn-phone-stage{position:relative;min-height:640px;display:flex;align-items:center;justify-content:center}
    .nn-phone-glow{position:absolute;width:390px;height:390px;border-radius:50%;background:rgba(96,165,250,.25);filter:blur(65px)}
    .nn-phone{position:relative;width:min(330px,88vw);height:620px;border:10px solid #0f172a;border-radius:48px;background:#fff;box-shadow:0 36px 75px rgba(15,23,42,.25);overflow:hidden}
    .nn-phone::before{content:"";position:absolute;z-index:10;top:8px;left:50%;transform:translateX(-50%);width:112px;height:28px;border-radius:18px;background:#0f172a}
    .nn-status{height:46px;padding:15px 20px 0;display:flex;justify-content:space-between;font-size:12px;font-weight:800;background:#fff}
    .nn-browser{height:55px;padding:7px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;display:flex;align-items:center;gap:8px}
    .nn-url{flex:1;background:#e2e8f0;border-radius:16px;padding:8px 12px;text-align:center;font-size:12px;font-weight:700;color:#334155}
    .nn-screen{height:calc(100% - 101px);padding:18px;background:linear-gradient(145deg,#fff,#eff6ff);position:relative;overflow:hidden}
    .nn-brand{display:flex;align-items:center;gap:8px;font-weight:900;color:#0f172a}.nn-brand img{width:34px;height:34px;border-radius:9px}
    .nn-hero-mini{margin-top:18px;border-radius:20px;background:#fff;border:1px solid #dbeafe;padding:18px;box-shadow:0 12px 28px rgba(37,99,235,.08)}
    .nn-hero-mini strong{display:block;font-size:23px;line-height:1.08}.nn-hero-mini span{display:block;margin-top:10px;font-size:12px;line-height:1.5;color:#64748b}.nn-hero-mini button{margin-top:14px;border:0;border-radius:11px;background:#2563eb;color:white;padding:10px 15px;font-weight:800}
    .nn-step-overlay{position:absolute;inset:0;background:rgba(15,23,42,.08);display:flex;align-items:flex-end;opacity:0;pointer-events:none;transition:.32s}
    .nn-step-overlay.show{opacity:1}
    .nn-sheet{width:100%;background:rgba(255,255,255,.98);border-radius:25px 25px 0 0;padding:20px 15px 26px;box-shadow:0 -12px 35px rgba(15,23,42,.2);transform:translateY(18px);transition:.32s}.nn-step-overlay.show .nn-sheet{transform:none}
    .nn-sheet-title{font-weight:900;font-size:15px;margin-bottom:12px}.nn-menu-row{display:flex;align-items:center;gap:12px;padding:13px 8px;border-top:1px solid #e2e8f0;font-size:14px;font-weight:700}.nn-menu-icon{width:34px;height:34px;border-radius:10px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-weight:900}
    .nn-install-card{background:#fff;border:1px solid #dbeafe;border-radius:22px;padding:15px;box-shadow:0 14px 35px rgba(15,23,42,.12)}
    .nn-install-top{display:flex;align-items:center;gap:12px}.nn-install-top img{width:58px;height:58px;border-radius:15px}.nn-install-name{font-weight:900;font-size:17px}.nn-install-url{font-size:11px;color:#94a3b8}.nn-toggle-row{margin-top:18px;padding-top:15px;border-top:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:800}.nn-toggle{width:52px;height:30px;background:#22c55e;border-radius:999px;padding:3px;display:flex;justify-content:flex-end}.nn-toggle::after{content:"";width:24px;height:24px;background:#fff;border-radius:50%}.nn-add-btn{width:100%;margin-top:16px;border:0;border-radius:12px;background:#2563eb;color:white;padding:11px;font-weight:900}
    .nn-home-screen{position:absolute;inset:0;padding:48px 18px 18px;background:linear-gradient(160deg,#dbeafe,#f8fafc 55%,#e0f2fe);display:none}.nn-home-screen.show{display:block}.nn-app-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px 10px}.nn-app-icon{text-align:center;font-size:9px;color:#475569}.nn-app-icon .icon{width:52px;height:52px;margin:auto;border-radius:14px;background:#fff;box-shadow:0 7px 16px rgba(15,23,42,.12);display:flex;align-items:center;justify-content:center}.nn-app-icon img{width:52px;height:52px;border-radius:14px}.nn-open-card{margin-top:38px;background:#fff;border-radius:22px;padding:18px;text-align:center;box-shadow:0 14px 34px rgba(15,23,42,.12)}.nn-open-card img{width:64px;height:64px;border-radius:18px}.nn-open-card strong{display:block;margin-top:10px;font-size:19px}.nn-open-card span{font-size:12px;color:#64748b}
    .nn-guide{background:#fff;border:1px solid #dbeafe;border-radius:28px;padding:28px;box-shadow:0 20px 45px rgba(37,99,235,.08)}
    .nn-guide-top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:22px}.nn-guide-top h3{margin:0;font-size:24px;font-weight:900}.nn-guide-top p{margin:5px 0 0;color:#64748b;line-height:1.55}.nn-play{border:0;background:#0f172a;color:#fff;border-radius:12px;padding:10px 14px;font-weight:800;cursor:pointer;white-space:nowrap}
    .nn-progress{height:7px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-bottom:24px}.nn-progress > div{height:100%;background:linear-gradient(90deg,#2563eb,#38bdf8);transition:width .35s}
    .nn-steps{display:grid;gap:10px}.nn-step{display:grid;grid-template-columns:42px 1fr;gap:13px;align-items:start;border:1px solid #e2e8f0;border-radius:17px;padding:14px;cursor:pointer;transition:.2s;background:#fff}.nn-step.active{border-color:#93c5fd;background:#eff6ff;box-shadow:0 8px 20px rgba(37,99,235,.08)}.nn-step-num{width:36px;height:36px;border-radius:12px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-weight:900;color:#475569}.nn-step.active .nn-step-num{background:#2563eb;color:#fff}.nn-step strong{display:block;font-size:14px}.nn-step p{margin:4px 0 0;color:#64748b;font-size:13px;line-height:1.45}
    .nn-device-note{margin-top:18px;border-radius:15px;background:#f8fafc;border:1px solid #e2e8f0;padding:13px 15px;color:#475569;font-size:12px;line-height:1.55}.nn-device-note b{color:#0f172a}
    @media(max-width:850px){#${SECTION_ID}{padding:64px 16px}.nn-mobile-grid{grid-template-columns:1fr}.nn-phone-stage{min-height:610px}.nn-phone{height:590px}.nn-guide{padding:20px}.nn-guide-top{flex-direction:column}.nn-play{width:100%}}
  `;

  const data = {
    iphone: [
      { title: "Abra o Note Note", text: "No Safari ou navegador do iPhone, acesse notenote.com.br e espere a página carregar.", visual: "site" },
      { title: "Toque em Compartilhar", text: "Use o botão de compartilhar do navegador para abrir as opções do iPhone.", visual: "share" },
      { title: "Adicionar à Tela de Início", text: "Na lista de ações, escolha “Adicionar à Tela de Início”.", visual: "menu" },
      { title: "Mantenha “Abrir como app web” ativo", text: "Confirme o nome Note Note e toque em “Adicionar”.", visual: "install" },
      { title: "Pronto: abra como aplicativo", text: "O ícone do Note Note ficará na Tela de Início. Toque nele para acessar o sistema em tela própria.", visual: "home" },
    ],
    android: [
      { title: "Abra o Note Note no Chrome", text: "No Android, abra o Chrome e acesse notenote.com.br.", visual: "site" },
      { title: "Abra o menu do Chrome", text: "Toque nos três pontos do navegador para abrir as opções.", visual: "android-menu" },
      { title: "Adicionar à tela inicial", text: "Escolha “Adicionar à tela inicial” ou “Instalar app”, conforme a versão do Android.", visual: "android-add" },
      { title: "Confirme a instalação", text: "Mantenha o nome Note Note e confirme em “Adicionar” ou “Instalar”.", visual: "install" },
      { title: "Use como aplicativo", text: "O Note Note aparecerá entre seus apps e poderá ser aberto rapidamente, sem precisar digitar o endereço.", visual: "home" },
    ],
  };

  let device = "iphone";
  let step = 0;
  let playing = true;
  let timer = null;

  function phoneMarkup() {
    return `<div class="nn-phone-glow"></div><div class="nn-phone">
      <div class="nn-status"><span>9:41</span><span>●●●  Wi‑Fi  100%</span></div>
      <div class="nn-browser"><span style="font-weight:900;color:#2563eb">‹</span><div class="nn-url">notenote.com.br</div><span style="font-weight:900">${device === "iphone" ? "⇧" : "⋮"}</span></div>
      <div class="nn-screen">
        <div class="nn-brand"><img src="/brand/note-note-icon.png" alt=""><span>Note Note</span></div>
        <div class="nn-hero-mini"><strong>Seu negócio na palma da mão.</strong><span>Acesse clientes, recebimentos, aluguéis, financiamentos e caixa direto do celular.</span><button>Entrar no sistema</button></div>
        <div id="nn-overlay" class="nn-step-overlay"><div id="nn-sheet" class="nn-sheet"></div></div>
        <div id="nn-home-screen" class="nn-home-screen"><div class="nn-app-grid"><div class="nn-app-icon"><div class="icon">📷</div><span>Fotos</span></div><div class="nn-app-icon"><div class="icon">💬</div><span>Mensagens</span></div><div class="nn-app-icon"><div class="icon">📧</div><span>E-mail</span></div><div class="nn-app-icon"><div class="icon">🗓️</div><span>Agenda</span></div><div class="nn-app-icon"><img src="/brand/note-note-icon.png" alt="Note Note"><span>Note Note</span></div></div><div class="nn-open-card"><img src="/brand/note-note-icon.png" alt="Note Note"><strong>Note Note</strong><span>Toque no ícone para acessar seu sistema.</span></div></div>
      </div>
    </div>`;
  }

  function createSection() {
    const section = document.createElement("section");
    section.id = SECTION_ID;
    section.innerHTML = `<div class="nn-mobile-wrap">
      <div class="nn-mobile-head"><div class="nn-mobile-kicker">No Celular</div><h2 class="nn-mobile-title">Transforme o Note Note em um app no seu smartphone.</h2><p class="nn-mobile-sub">Não precisa baixar pela loja. Em poucos passos você adiciona o Note Note à tela inicial e abre o sistema como um aplicativo no iPhone ou Android.</p></div>
      <div class="nn-mobile-tabs"><button class="nn-mobile-tab active" data-device="iphone"> iPhone</button><button class="nn-mobile-tab" data-device="android">Android</button></div>
      <div class="nn-mobile-grid"><div class="nn-phone-stage" id="nn-phone-stage">${phoneMarkup()}</div><div class="nn-guide"><div class="nn-guide-top"><div><h3 id="nn-guide-title">Tutorial no iPhone</h3><p id="nn-guide-sub">Veja a instalação acontecendo como se fosse no seu próprio celular.</p></div><button class="nn-play" id="nn-play">❚❚ Pausar tutorial</button></div><div class="nn-progress"><div id="nn-progress-bar" style="width:20%"></div></div><div id="nn-steps" class="nn-steps"></div><div class="nn-device-note"><b>Privacidade:</b> as telas deste tutorial são demonstrações profissionais e não exibem dados pessoais, contas, telefones ou informações de clientes.</div></div></div>
    </div>`;
    return section;
  }

  function renderVisual() {
    const current = data[device][step];
    const overlay = document.getElementById("nn-overlay");
    const sheet = document.getElementById("nn-sheet");
    const home = document.getElementById("nn-home-screen");
    if (!overlay || !sheet || !home) return;
    overlay.classList.remove("show");
    home.classList.remove("show");
    sheet.innerHTML = "";

    if (current.visual === "home") {
      home.classList.add("show");
      return;
    }
    if (current.visual === "site") return;

    let html = "";
    if (current.visual === "share") {
      html = `<div class="nn-sheet-title">Compartilhar</div><div class="nn-menu-row"><div class="nn-menu-icon">▣</div><span>Copiar</span></div><div class="nn-menu-row"><div class="nn-menu-icon">＋</div><span>Adicionar à Tela de Início</span></div>`;
    } else if (current.visual === "menu") {
      html = `<div class="nn-sheet-title">Ações</div><div class="nn-menu-row"><div class="nn-menu-icon">☆</div><span>Adicionar aos favoritos</span></div><div class="nn-menu-row" style="background:#eff6ff;border-radius:12px"><div class="nn-menu-icon">＋</div><span>Adicionar à Tela de Início</span></div><div class="nn-menu-row"><div class="nn-menu-icon">▤</div><span>Buscar na página</span></div>`;
    } else if (current.visual === "android-menu") {
      html = `<div class="nn-sheet-title">Menu do Chrome</div><div class="nn-menu-row"><div class="nn-menu-icon">☆</div><span>Favoritos</span></div><div class="nn-menu-row"><div class="nn-menu-icon">↓</div><span>Downloads</span></div><div class="nn-menu-row" style="background:#eff6ff;border-radius:12px"><div class="nn-menu-icon">＋</div><span>Adicionar à tela inicial</span></div>`;
    } else if (current.visual === "android-add") {
      html = `<div class="nn-sheet-title">Adicionar ao dispositivo</div><div class="nn-menu-row" style="background:#eff6ff;border-radius:12px"><div class="nn-menu-icon">N</div><span>Instalar app Note Note</span></div><div class="nn-menu-row"><div class="nn-menu-icon">＋</div><span>Criar atalho</span></div>`;
    } else if (current.visual === "install") {
      html = `<div class="nn-install-card"><div class="nn-install-top"><img src="/brand/note-note-icon.png" alt="Note Note"><div><div class="nn-install-name">Note Note</div><div class="nn-install-url">https://notenote.com.br/</div></div></div><div class="nn-toggle-row"><span>${device === "iphone" ? "Abrir como app web" : "Adicionar como aplicativo"}</span><div class="nn-toggle"></div></div><button class="nn-add-btn">${device === "iphone" ? "Adicionar" : "Instalar"}</button></div>`;
    }
    sheet.innerHTML = html;
    requestAnimationFrame(() => overlay.classList.add("show"));
  }

  function renderSteps() {
    const container = document.getElementById("nn-steps");
    const title = document.getElementById("nn-guide-title");
    const progress = document.getElementById("nn-progress-bar");
    if (!container || !title || !progress) return;
    title.textContent = device === "iphone" ? "Tutorial no iPhone" : "Tutorial no Android";
    container.innerHTML = data[device].map((item, index) => `<button type="button" class="nn-step ${index === step ? "active" : ""}" data-step="${index}"><span class="nn-step-num">${index + 1}</span><span><strong>${item.title}</strong><p>${item.text}</p></span></button>`).join("");
    progress.style.width = `${((step + 1) / data[device].length) * 100}%`;
    container.querySelectorAll(".nn-step").forEach(el => el.addEventListener("click", () => { step = Number(el.getAttribute("data-step")); render(); restartTimer(); }));
  }

  function render() { renderSteps(); renderVisual(); }
  function advance() { step = (step + 1) % data[device].length; render(); }
  function restartTimer() {
    if (timer) clearInterval(timer);
    if (playing) timer = setInterval(advance, 3600);
  }

  function mount() {
    if (document.getElementById(SECTION_ID)) return;
    const functionalities = document.getElementById("funcionalidades");
    if (!functionalities) return;

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style"); style.id = STYLE_ID; style.textContent = styles; document.head.appendChild(style);
    }
    functionalities.insertAdjacentElement("afterend", createSection());

    const funcNav = document.querySelector('nav a[href="#funcionalidades"]');
    if (funcNav && !document.getElementById(NAV_ID)) {
      const link = document.createElement("a"); link.id = NAV_ID; link.href = `#${SECTION_ID}`; link.textContent = "No Celular"; link.className = funcNav.className; funcNav.insertAdjacentElement("afterend", link);
    }

    document.querySelectorAll(".nn-mobile-tab").forEach(tab => tab.addEventListener("click", () => {
      device = tab.getAttribute("data-device") || "iphone"; step = 0;
      document.querySelectorAll(".nn-mobile-tab").forEach(x => x.classList.toggle("active", x === tab));
      const stage = document.getElementById("nn-phone-stage"); if (stage) stage.innerHTML = phoneMarkup();
      render(); restartTimer();
    }));
    const play = document.getElementById("nn-play");
    if (play) play.addEventListener("click", () => { playing = !playing; play.textContent = playing ? "❚❚ Pausar tutorial" : "▶ Reproduzir tutorial"; restartTimer(); });
    render(); restartTimer();
  }

  const observer = new MutationObserver(() => mount());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
