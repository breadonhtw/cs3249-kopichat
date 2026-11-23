// In-page accessibility and design-brief audit for Kopichat.
// Paste into the browser console (or a page-script tool) on any screen, then run `await kopichatAudit()`.
// It loads axe-core from cdnjs when missing, runs WCAG 2.0/2.1/2.2 A and AA rules, and checks the
// CLAUDE.md design brief: chat text at least 16px, touch targets at least 44x44, no pure black or white,
// one accent-coloured button per screen, skip chips set like the send control, no horizontal scroll.
async function kopichatAudit() {
  if (!window.axe) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('axe-core did not load'));
      document.head.appendChild(s);
    });
  }
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const name = (el) => {
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const text = (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30);
    return `${el.tagName.toLowerCase()}${cls}${text ? ` "${text}"` : ''}`;
  };

  const res = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] });
  const axeOut = res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));

  // Chat text: the turns in the thread, and the answer box.
  const chatText = [...document.querySelectorAll('[class*="turn"], textarea')].filter(visible);
  const textBelow16 = chatText.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map(name);

  const controls = [...document.querySelectorAll('button, a[href], input[type="radio"], input[type="checkbox"], label:has(input)')]
    .filter(visible);
  const smallTargets = controls.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width < 44 || r.height < 44;
  }).map(name);

  const BW = ['rgb(0, 0, 0)', 'rgb(255, 255, 255)'];
  const pureBW = [...document.querySelectorAll('body, body *')].filter(visible).filter((el) => {
    const cs = getComputedStyle(el);
    return BW.includes(cs.color) || BW.includes(cs.backgroundColor);
  }).map(name).slice(0, 20);

  const probe = document.createElement('div');
  probe.style.background = 'var(--color-accent)';
  document.body.appendChild(probe);
  const accent = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const accentButtons = [...document.querySelectorAll('button')].filter(visible)
    .filter((b) => getComputedStyle(b).backgroundColor === accent).map(name);

  const chip = [...document.querySelectorAll('button')].filter(visible).find((b) => /chip/.test(b.className));
  const send = [...document.querySelectorAll('button')].filter(visible)
    .find((b) => b.type === 'submit' || /^(Approve and send|Submit|Continue|Yes, I’ll take part)$/.test(b.innerText.trim()));
  const font = (el) => (el ? `${getComputedStyle(el).fontFamily.split(',')[0]} ${getComputedStyle(el).fontWeight} ${getComputedStyle(el).fontSize}` : null);

  return {
    screen: location.pathname + location.search,
    viewport: `${innerWidth}x${innerHeight}`,
    axe: axeOut,
    textBelow16,
    smallTargets,
    pureBW,
    accentButtons: accentButtons.length,
    accentButtonNames: accentButtons,
    chipVsSendFont: { chip: font(chip), send: font(send) },
    overflowX: document.documentElement.scrollWidth > innerWidth,
  };
}
