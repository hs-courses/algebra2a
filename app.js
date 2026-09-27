const state = { chapters: [], problemBanks: {}, selectedSection: null, selectedDocument: null, interactiveIndex: 0 };

const catalogEl = document.querySelector('#catalog');
const searchEl = document.querySelector('#search');
const emptyStateEl = document.querySelector('#emptyState');
const documentViewEl = document.querySelector('#documentView');
const sectionTitleEl = document.querySelector('#sectionTitle');
const sectionMetaEl = document.querySelector('#sectionMeta');
const crumbsEl = document.querySelector('#crumbs');
const tabsEl = document.querySelector('#documentTabs');
const viewerEl = document.querySelector('#pdfViewer');
const printEl = document.querySelector('#printButton');
const interactiveEl = document.querySelector('#interactiveView');
const viewerFrameEl = document.querySelector('.viewer-frame');
const appShellEl = document.querySelector('.app-shell');
const sidebarEl = document.querySelector('#sidebar');
const sidebarBackdropEl = document.querySelector('#sidebarBackdrop');
const resizeHandleEl = document.querySelector('#resizeHandle');
const SIDEBAR_WIDTH_KEY = 'algebra2a-sidebar-width';

function interactiveProblemsFor(section) {
  const bank = state.problemBanks[section.id];
  return bank?.problemTypes.flatMap(type => type.examples.map(example => ({ ...example, typeTitle: type.title, recognize: type.recognize, rules: type.rules, inputHint: type.inputHint }))) || [];
}

function hasInteractive(section) { return interactiveProblemsFor(section).length > 0; }
function normaliseAnswer(value) {
  return value.toLowerCase().replaceAll(' ', '').replaceAll('\\', '').replaceAll('{', '').replaceAll('}', '').replaceAll('(', '').replaceAll(')', '*').replaceAll('√', 'sqrt');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

// Interactive content uses a deliberately small, text-friendly notation in the
// problem bank. Render that notation at the display boundary so authors can use
// 16^(3/4), sqrt(x), and x^2 without putting HTML in the data files.
function mathMarkup(value, inExponent = false) {
  let markup = escapeHtml(value);
  const renderInner = text => mathMarkup(text, inExponent);
  const exponentMarkup = [];
  const holdExponent = exponent => `\uE000${exponentMarkup.push(mathMarkup(exponent, true)) - 1}\uE001`;
  markup = markup.replace(/\s*=\s*/g, '&thinsp;=&thinsp;');
  markup = markup.replace(/(?:√|sqrt)\(([^()]*)\)/gi, (_, radicand) => `<span class="math-radical">√<span class="math-radicand">${renderInner(radicand)}</span></span>`);
  markup = markup.replace(/\^\(([^()]*)\)/g, (_, exponent) => holdExponent(exponent));
  markup = markup.replace(/\^([A-Za-z0-9]+)/g, (_, exponent) => holdExponent(exponent));
  if (!inExponent) markup = markup.replace(/([A-Za-z0-9)]+)\/([A-Za-z0-9(]+)/g, (_, numerator, denominator) => `<span class="math-fraction"><span>${numerator}</span><span>${denominator}</span></span>`);
  markup = markup.replace(/\uE000(\d+)\uE001/g, (_, index) => `<sup>${exponentMarkup[index]}</sup>`);
  return markup;
}

function toMathExpression(value) {
  return value
    .replaceAll('√', 'sqrt')
    .replace(/sqrt\s*(\d+(?:\.\d+)?)/gi, 'sqrt($1)')
    .replace(/(\d|\))(?=sqrt)/gi, '$1*sqrt')
    .replace(/(\d|\))(?=\()/g, '$1*');
}

function mathematicallyEquivalent(left, right) {
  try {
    return math.symbolicEqual(toMathExpression(left), toMathExpression(right));
  } catch {
    return false;
  }
}

function insertMathToken(input, token, cursorOffset = token.length) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.value = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;
  const cursor = start + cursorOffset;
  input.focus();
  input.setSelectionRange(cursor, cursor);
}

function deleteMathToken(input) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  if (start !== end) {
    input.value = `${input.value.slice(0, start)}${input.value.slice(end)}`;
    input.setSelectionRange(start, start);
  } else if (start > 0) {
    input.value = `${input.value.slice(0, start - 1)}${input.value.slice(start)}`;
    input.setSelectionRange(start - 1, start - 1);
  }
  input.focus();
}

function setSidebarWidth(width, persist = true) {
  const bounded = Math.max(230, Math.min(520, width));
  appShellEl.style.setProperty('--sidebar-width', `${bounded}px`);
  resizeHandleEl.setAttribute('aria-valuenow', String(Math.round(bounded)));
  if (persist) localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(bounded)));
}

function initSplitter() {
  const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (Number.isFinite(saved) && saved > 0) setSidebarWidth(saved, false);
  else setSidebarWidth(315, false);

  let dragging = false;
  resizeHandleEl.addEventListener('pointerdown', event => {
    if (window.matchMedia('(max-width: 760px)').matches) return;
    dragging = true;
    resizeHandleEl.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing');
  });
  resizeHandleEl.addEventListener('pointermove', event => {
    if (!dragging) return;
    setSidebarWidth(event.clientX);
  });
  const stopDragging = () => {
    dragging = false;
    document.body.classList.remove('resizing');
  };
  resizeHandleEl.addEventListener('pointerup', stopDragging);
  resizeHandleEl.addEventListener('pointercancel', stopDragging);
  resizeHandleEl.addEventListener('keydown', event => {
    const current = parseInt(getComputedStyle(appShellEl).getPropertyValue('--sidebar-width'), 10) || 315;
    if (event.key === 'ArrowLeft') { event.preventDefault(); setSidebarWidth(current - 20); }
    if (event.key === 'ArrowRight') { event.preventDefault(); setSidebarWidth(current + 20); }
  });
}

function sectionKey(section) { return section.id; }

function renderCatalog(filter = '') {
  const query = filter.trim().toLowerCase();
  catalogEl.innerHTML = '';
  for (const chapter of state.chapters) {
    const matching = chapter.sections.filter(section => !query || `${chapter.title} ${section.title}`.toLowerCase().includes(query));
    if (!matching.length) continue;
    const chapterEl = document.createElement('div');
    chapterEl.className = 'chapter';
    const button = document.createElement('button');
    button.className = 'chapter-button';
    button.innerHTML = `<span class="chevron">▾</span><span>${chapter.title}</span>`;
    const list = document.createElement('div');
    list.className = 'section-list';
    for (const section of matching) {
      const sectionButton = document.createElement('a');
      sectionButton.className = 'section-button';
      sectionButton.dataset.section = sectionKey(section);
      sectionButton.href = `#${section.id}/chapter`;
      sectionButton.textContent = section.title;
      list.appendChild(sectionButton);
    }
    button.addEventListener('click', () => {
      list.hidden = !list.hidden;
      button.querySelector('.chevron').textContent = list.hidden ? '▸' : '▾';
    });
    chapterEl.append(button, list);
    catalogEl.appendChild(chapterEl);
  }
  markActive();
}

function markActive() {
  document.querySelectorAll('.section-button').forEach(button => {
    button.classList.toggle('active', button.dataset.section === state.selectedSection?.id);
  });
}

function selectSection(chapter, section, documentKind = 'chapter', addHistory = true) {
  state.selectedSection = section;
  const interactive = documentKind === 'interactive' && hasInteractive(section);
  state.selectedDocument = interactive ? null : (section.documents.find(doc => doc.kind === documentKind) || section.documents[0]);
  emptyStateEl.hidden = true;
  documentViewEl.hidden = false;
  sectionTitleEl.textContent = section.title;
  sectionMetaEl.textContent = interactive ? `${chapter.title} · Interactive Practice` : `${chapter.title} · ${state.selectedDocument.label}`;
  crumbsEl.textContent = `${chapter.title}  /  ${section.title}`;
  tabsEl.innerHTML = '';
  for (const doc of section.documents) {
    const tab = document.createElement('button');
    tab.className = 'doc-tab';
    tab.setAttribute('role', 'tab');
    tab.textContent = doc.label;
    tab.classList.toggle('active', !interactive && doc.kind === state.selectedDocument.kind);
    tab.addEventListener('click', () => selectDocument(chapter, section, doc));
    tabsEl.appendChild(tab);
  }
  if (hasInteractive(section)) {
    const tab = document.createElement('button');
    tab.className = 'doc-tab interactive-tab';
    tab.setAttribute('role', 'tab');
    tab.textContent = 'Interactive';
    tab.classList.toggle('active', interactive);
    tab.addEventListener('click', () => selectInteractive(chapter, section));
    tabsEl.appendChild(tab);
  }
  if (interactive) selectInteractive(chapter, section, false);
  else selectDocument(chapter, section, state.selectedDocument, false);
  markActive();
  if (addHistory) history.pushState(null, '', `#${section.id}/${interactive ? 'interactive' : state.selectedDocument.kind}`);
  document.querySelector('.sidebar')?.classList.remove('open');
}

function selectInteractive(chapter, section, updateHash = true) {
  state.selectedDocument = null;
  state.interactiveIndex = 0;
  sectionMetaEl.textContent = `${chapter.title} · Interactive Practice`;
  viewerFrameEl.hidden = true;
  printEl.hidden = true;
  interactiveEl.hidden = false;
  document.querySelectorAll('.doc-tab').forEach(tab => tab.classList.toggle('active', tab.textContent === 'Interactive'));
  renderInteractive(section);
  if (updateHash) history.replaceState(null, '', `#${section.id}/interactive`);
}

function renderInteractive(section) {
  const problems = interactiveProblemsFor(section);
  const problem = problems[state.interactiveIndex % problems.length];
  interactiveEl.innerHTML = `
    <div class="practice-card">
      <div class="practice-kicker">Interactive practice · ${state.interactiveIndex + 1} of ${problems.length} · ${escapeHtml(problem.typeTitle || 'Practice')}</div>
      <h2 class="math-content">${mathMarkup(problem.prompt)}</h2>
      <details class="practice-guide"><summary>How to recognize and solve this type</summary><p class="math-content">${mathMarkup(problem.recognize || '')}</p><ul>${(problem.rules || []).map(rule => `<li class="math-content">${mathMarkup(rule)}</li>`).join('')}</ul></details>
      <p class="practice-instruction math-content">${mathMarkup(problem.inputHint || 'Use the math keypad or keyboard to enter your answer.')}</p>
      <form class="answer-form" id="answerForm">
        <label for="answerInput">Your answer</label>
        <div class="answer-row"><input id="answerInput" autocomplete="off" spellcheck="false" aria-describedby="answerFeedback"><button type="submit">Check</button></div>
        <div class="editing-actions"><button type="button" data-action="backspace" aria-label="Delete previous character">⌫ Backspace</button><button type="button" data-action="clear">Clear</button></div>
        <div class="number-palette" aria-label="Numbers">
          ${['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '-'].map(token => `<button type="button" data-token="${token}">${token === '-' ? '−' : token}</button>`).join('')}
        </div>
        <div class="math-palette" aria-label="Math symbols and operations">
          <button type="button" data-token="+">+</button>
          <button type="button" data-token="-">−</button>
          <button type="button" data-token="/">÷</button>
          <button type="button" data-token="*">×</button>
          <button type="button" data-token="√">√</button>
          <button type="button" data-token="sqrt()" data-cursor="5" aria-label="Square root">√( )</button>
          <button type="button" data-token="^()" data-cursor="2">xⁿ</button>
          <button type="button" data-token="(">(</button>
          <button type="button" data-token=")">)</button>
          <button type="button" data-token="[">[</button>
          <button type="button" data-token="]">]</button>
          <button type="button" data-token="|">|</button>
          <button type="button" data-token="()/()" data-cursor="1" aria-label="Fraction">a⁄b</button>
          <button type="button" data-token="π">π</button>
        </div>
      </form>
      <div class="practice-actions"><button class="text-button" id="hintButton" type="button">Show hint</button><button class="text-button" id="solutionButton" type="button">Show solution</button><button class="text-button" id="restartButton" type="button">Restart practice</button><button class="next-button" id="nextButton" type="button" hidden>Next problem →</button></div>
      <div class="answer-feedback math-content" id="answerFeedback" role="status"></div>
      <div class="calculator-wrap"><button class="calculator-toggle" id="calculatorToggle" type="button" aria-expanded="false">Calculator</button>
        <div class="calculator" id="calculator" hidden>
          <input class="calculator-display" id="calculatorDisplay" value="0" readonly aria-label="Calculator display">
          <div class="calculator-grid">
            <button type="button" data-calc="clear">C</button><button type="button" data-calc="backspace">⌫</button><button type="button" data-calc="operator">÷</button><button type="button" data-calc="operator">×</button>
            <button type="button" data-calc="digit">7</button><button type="button" data-calc="digit">8</button><button type="button" data-calc="digit">9</button><button type="button" data-calc="operator">−</button>
            <button type="button" data-calc="digit">4</button><button type="button" data-calc="digit">5</button><button type="button" data-calc="digit">6</button><button type="button" data-calc="operator">+</button>
            <button type="button" data-calc="digit">1</button><button type="button" data-calc="digit">2</button><button type="button" data-calc="digit">3</button><button class="calculator-equals" type="button" data-calc="equals">=</button>
            <button class="calculator-zero" type="button" data-calc="digit">0</button><button type="button" data-calc="decimal">.</button>
          </div>
        </div>
      </div>
    </div>`;
  const form = interactiveEl.querySelector('#answerForm');
  const answerInput = interactiveEl.querySelector('#answerInput');
  const feedback = interactiveEl.querySelector('#answerFeedback');
  interactiveEl.querySelectorAll('[data-token]').forEach(button => button.addEventListener('click', () => {
    insertMathToken(answerInput, button.dataset.token, Number(button.dataset.cursor) || button.dataset.token.length);
  }));
  interactiveEl.querySelector('[data-action="backspace"]').addEventListener('click', () => deleteMathToken(answerInput));
  interactiveEl.querySelector('[data-action="clear"]').addEventListener('click', () => { answerInput.value = ''; answerInput.focus(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const answer = normaliseAnswer(answerInput.value);
    const correct = problem.answers.map(normaliseAnswer).includes(answer);
    const equivalent = problem.equivalentAnswers?.map(normaliseAnswer).includes(answer)
      || problem.answers.some(expected => mathematicallyEquivalent(answerInput.value, expected));
    feedback.className = `answer-feedback ${correct ? 'correct' : equivalent ? 'almost' : 'incorrect'}`;
    feedback.innerHTML = mathMarkup(correct ? 'Correct! Nice work.' : equivalent ? (problem.equivalentMessage || 'Equivalent, but not in the expected simplified form.') : 'Not quite. Check your work and try again.');
    if (correct) interactiveEl.querySelector('#nextButton').hidden = false;
  });
  interactiveEl.querySelector('#hintButton').addEventListener('click', () => { feedback.className = 'answer-feedback hint math-content'; feedback.innerHTML = mathMarkup(`Hint: ${problem.hint}`); });
  interactiveEl.querySelector('#solutionButton').addEventListener('click', () => { feedback.className = 'answer-feedback solution math-content'; feedback.innerHTML = mathMarkup(`Solution: ${problem.solution}`); });
  interactiveEl.querySelector('#restartButton').addEventListener('click', () => { state.interactiveIndex = 0; renderInteractive(section); });
  interactiveEl.querySelector('#nextButton').addEventListener('click', () => { state.interactiveIndex = (state.interactiveIndex + 1) % problems.length; renderInteractive(section); });
  initCalculator(interactiveEl);
  answerInput.focus();
}

function initCalculator(container) {
  const toggle = container.querySelector('#calculatorToggle');
  const calculator = container.querySelector('#calculator');
  const display = container.querySelector('#calculatorDisplay');
  let expression = '';
  toggle.addEventListener('click', () => {
    calculator.hidden = !calculator.hidden;
    toggle.setAttribute('aria-expanded', String(!calculator.hidden));
  });
  const update = value => { expression = value; display.value = value || '0'; };
  container.querySelectorAll('[data-calc]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.calc;
    const value = button.textContent;
    if (action === 'clear') return update('');
    if (action === 'backspace') return update(expression.slice(0, -1));
    if (action === 'digit' || action === 'decimal') return update(`${expression}${value}`);
    if (action === 'operator') {
      const operator = value === '×' ? '*' : value === '÷' ? '/' : value === '−' ? '-' : value;
      if (!expression && operator !== '-') return;
      if (/[+*/-]$/.test(expression)) return update(`${expression.slice(0, -1)}${operator}`);
      return update(`${expression}${operator}`);
    }
    if (action === 'equals') {
      if (!/^[0-9+*/.()\- ]+$/.test(expression)) return;
      try {
        const result = Function(`"use strict"; return (${expression})`)();
        if (Number.isFinite(result)) update(String(Math.round(result * 1e10) / 1e10));
      } catch { update(expression); }
    }
  }));
}

function selectDocument(chapter, section, document, updateHash = true) {
  state.selectedDocument = document;
  interactiveEl.hidden = true;
  viewerFrameEl.hidden = false;
  printEl.hidden = false;
  viewerEl.src = document.url;
  printEl.href = document.url;
  sectionMetaEl.textContent = `${chapter.title} · ${document.label}`;
  document.querySelectorAll('.doc-tab').forEach(tab => tab.classList.toggle('active', tab.textContent === document.label));
  if (updateHash) history.replaceState(null, '', `#${section.id}/${document.kind}`);
}

function restoreHash() {
  const [sectionId, kind] = location.hash.slice(1).split('/');
  for (const chapter of state.chapters) {
    const section = chapter.sections.find(item => item.id === sectionId);
    if (section) { selectSection(chapter, section, kind || 'chapter', false); return true; }
  }
  return false;
}

async function init() {
  initSplitter();
  const [catalogResponse, bankResponse] = await Promise.all([fetch('catalog.json'), fetch('problem-bank.json')]);
  state.chapters = (await catalogResponse.json()).chapters;
  state.problemBanks = await bankResponse.json();
  renderCatalog();
  restoreHash();
}

searchEl.addEventListener('input', event => renderCatalog(event.target.value));
const menuButtonEl = document.querySelector('#menuButton');
const setSidebarOpen = open => {
  sidebarEl.classList.toggle('open', open);
  menuButtonEl.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('sidebar-open', open);
};
menuButtonEl.setAttribute('aria-expanded', 'false');
menuButtonEl.addEventListener('click', () => setSidebarOpen(!sidebarEl.classList.contains('open')));
sidebarBackdropEl.addEventListener('click', () => setSidebarOpen(false));
catalogEl.addEventListener('click', event => {
  if (event.target.closest('a, button')) setSidebarOpen(false);
});
window.addEventListener('resize', () => { if (window.innerWidth > 760) setSidebarOpen(false); });
window.addEventListener('hashchange', restoreHash);
window.addEventListener('popstate', restoreHash);
init().catch(error => {
  emptyStateEl.hidden = false;
  emptyStateEl.querySelector('p').textContent = `Could not load the catalog: ${error.message}`;
});
