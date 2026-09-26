const state = { chapters: [], selectedSection: null, selectedDocument: null };

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
const appShellEl = document.querySelector('.app-shell');
const sidebarEl = document.querySelector('#sidebar');
const resizeHandleEl = document.querySelector('#resizeHandle');
const SIDEBAR_WIDTH_KEY = 'algebra2a-sidebar-width';

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
      const sectionButton = document.createElement('button');
      sectionButton.className = 'section-button';
      sectionButton.dataset.section = sectionKey(section);
      sectionButton.textContent = section.title;
      sectionButton.addEventListener('click', () => selectSection(chapter, section));
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

function selectSection(chapter, section, documentKind = 'chapter') {
  state.selectedSection = section;
  state.selectedDocument = section.documents.find(doc => doc.kind === documentKind) || section.documents[0];
  emptyStateEl.hidden = true;
  documentViewEl.hidden = false;
  sectionTitleEl.textContent = section.title;
  sectionMetaEl.textContent = `${chapter.title} · ${state.selectedDocument.label}`;
  crumbsEl.textContent = `${chapter.title}  /  ${section.title}`;
  tabsEl.innerHTML = '';
  for (const doc of section.documents) {
    const tab = document.createElement('button');
    tab.className = 'doc-tab';
    tab.setAttribute('role', 'tab');
    tab.textContent = doc.label;
    tab.classList.toggle('active', doc.kind === state.selectedDocument.kind);
    tab.addEventListener('click', () => selectDocument(chapter, section, doc));
    tabsEl.appendChild(tab);
  }
  selectDocument(chapter, section, state.selectedDocument, false);
  markActive();
  history.replaceState(null, '', `#${section.id}/${state.selectedDocument.kind}`);
  document.querySelector('.sidebar')?.classList.remove('open');
}

function selectDocument(chapter, section, document, updateHash = true) {
  state.selectedDocument = document;
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
    if (section) { selectSection(chapter, section, kind || 'chapter'); return true; }
  }
  return false;
}

async function init() {
  initSplitter();
  const response = await fetch('catalog.json');
  state.chapters = (await response.json()).chapters;
  renderCatalog();
  restoreHash();
}

searchEl.addEventListener('input', event => renderCatalog(event.target.value));
document.querySelector('#menuButton').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
window.addEventListener('hashchange', restoreHash);
init().catch(error => {
  emptyStateEl.hidden = false;
  emptyStateEl.querySelector('p').textContent = `Could not load the catalog: ${error.message}`;
});
