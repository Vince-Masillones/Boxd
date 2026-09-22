// js/app.js
// Boxd — browse movies/TV from TMDB and keep personal ratings in localStorage.

const FUNCTION_BASE = "/.netlify/functions/tmdb";
const IMG_POSTER = "https://image.tmdb.org/t/p/w342";
const IMG_PROFILE = "https://image.tmdb.org/t/p/w185";
const RATINGS_KEY = "boxd:ratings";

const state = {
  type: "movie",       // 'movie' | 'tv'
  view: "browse",      // 'browse' | 'ratings'
  query: "",
  ratings: loadRatings(),
};

// ---------- DOM refs ----------
const els = {
  grid: document.getElementById("grid"),
  status: document.getElementById("status"),
  empty: document.getElementById("emptyState"),
  emptyText: document.getElementById("emptyText"),
  sectionTitle: document.getElementById("sectionTitle"),
  sectionSubtitle: document.getElementById("sectionSubtitle"),
  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("searchInput"),
  typeBtns: document.querySelectorAll(".type-btn"),
  navBtns: document.querySelectorAll("[data-nav]"),
  ratingsCount: document.getElementById("ratingsCount"),
  cardTemplate: document.getElementById("cardTemplate"),
  modalOverlay: document.getElementById("modalOverlay"),
  modalBody: document.getElementById("modalBody"),
  modalClose: document.getElementById("modalClose"),
};

// ---------- localStorage ratings ----------
function loadRatings() {
  try {
    return JSON.parse(localStorage.getItem(RATINGS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveRatings() {
  localStorage.setItem(RATINGS_KEY, JSON.stringify(state.ratings));
  updateRatingsCount();
}

function ratingKey(type, id) {
  return `${type}-${id}`;
}

function getRating(type, id) {
  return state.ratings[ratingKey(type, id)]?.rating || 0;
}

function setRating(type, id, rating, meta) {
  const key = ratingKey(type, id);
  if (rating === 0) {
    delete state.ratings[key];
  } else {
    state.ratings[key] = { rating, type, id, ...meta };
  }
  saveRatings();
}

function updateRatingsCount() {
  const count = Object.keys(state.ratings).length;
  els.ratingsCount.textContent = count;
  els.ratingsCount.hidden = count === 0;
}

// ---------- TMDB fetch helper ----------
async function tmdb(path, params = {}) {
  const url = new URL(FUNCTION_BASE, window.location.origin);
  url.searchParams.set("path", path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// ---------- rendering: status / empty ----------
function showStatus(message) {
  els.status.hidden = false;
  els.status.classList.remove("is-error");
  els.status.innerHTML = `<span class="spinner"></span> ${message}`;
  els.grid.hidden = true;
  els.empty.hidden = true;
}

function showError(message) {
  els.status.hidden = false;
  els.status.classList.add("is-error");
  els.status.textContent = message;
  els.grid.hidden = true;
  els.empty.hidden = true;
}

function hideStatus() {
  els.status.hidden = true;
}

function showEmpty(text) {
  els.empty.hidden = false;
  els.emptyText.textContent = text;
  els.grid.hidden = true;
}

function showGrid() {
  els.grid.hidden = false;
  els.empty.hidden = true;
}

// ---------- rendering: cards ----------
function titleOf(item) {
  return item.title || item.name || "Untitled";
}

function dateOf(item) {
  const d = item.release_date || item.first_air_date;
  return d ? d.slice(0, 4) : "—";
}

function renderStars(container, current, { size = "card", onRate } = {}) {
  container.innerHTML = "";
  container.classList.add(size === "modal" ? "modal-stars" : "card-stars");
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "star-btn" + (i <= current ? " is-filled" : "");
    btn.setAttribute("aria-label", `Rate ${i} star${i > 1 ? "s" : ""}`);
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8L5.8 21l1.6-7L2 9.2l7.1-.6L12 2z"/></svg>`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = current === i ? 0 : i; // clicking the same star again clears it
      onRate(next);
    });
    container.appendChild(btn);
  }
}

function buildCard(item) {
  const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
  const img = node.querySelector("img");
  const badge = node.querySelector(".card-rating-badge");
  const title = node.querySelector(".card-title");
  const meta = node.querySelector(".card-meta");
  const stars = node.querySelector(".card-stars");

  img.src = item.poster_path ? IMG_POSTER + item.poster_path : "";
  img.alt = titleOf(item);
  if (!item.poster_path) {
    node.querySelector(".card-poster").style.background = "var(--surface-raised)";
  }

  title.textContent = titleOf(item);
  meta.textContent = `${dateOf(item)}${item.vote_average ? " · ★ " + item.vote_average.toFixed(1) : ""}`;

  const current = getRating(state.type, item.id);
  updateBadge(badge, current);

  function handleCardRate(n) {
    setRating(state.type, item.id, n, {
      title: titleOf(item),
      poster_path: item.poster_path,
      date: dateOf(item),
    });
    updateBadge(badge, n);
    renderStars(stars, n, { onRate: handleCardRate });
    if (state.view === "ratings") renderRatingsView();
  }

  renderStars(stars, current, { onRate: handleCardRate });

  node.addEventListener("click", () => openModal(item.id));
  node.addEventListener("keypress", (e) => {
    if (e.key === "Enter") openModal(item.id);
  });

  return node;
}

function updateBadge(badge, rating) {
  if (rating > 0) {
    badge.hidden = false;
    badge.textContent = `★ ${rating}`;
  } else {
    badge.hidden = true;
  }
}

function renderGrid(items) {
  els.grid.innerHTML = "";
  if (!items.length) {
    showEmpty(
      state.query
        ? `No ${state.type === "movie" ? "movies" : "TV shows"} matched "${state.query}".`
        : "Nothing to show right now."
    );
    return;
  }
  const frag = document.createDocumentFragment();
  items.forEach((item) => frag.appendChild(buildCard(item)));
  els.grid.appendChild(frag);
  showGrid();
}

// ---------- views ----------
async function renderBrowseView() {
  state.view = "browse";
  setActiveNav("browse");
  els.searchInput.value = state.query;

  const label = state.type === "movie" ? "movies" : "TV shows";

  if (state.query) {
    els.sectionTitle.textContent = `Results for "${state.query}"`;
    els.sectionSubtitle.textContent = `Searching ${label} on TMDB.`;
  } else {
    els.sectionTitle.textContent = "Trending this week";
    els.sectionSubtitle.textContent = `The ${label} everyone's talking about right now.`;
  }

  showStatus(state.query ? "Searching…" : "Loading trending titles…");

  try {
    let data;
    if (state.query) {
      const endpoint = state.type === "movie" ? "search/movie" : "search/tv";
      data = await tmdb(endpoint, { query: state.query, include_adult: false });
    } else {
      data = await tmdb(`trending/${state.type}/week`);
    }
    hideStatus();
    renderGrid(data.results || []);
  } catch (err) {
    showError(`Couldn't load data: ${err.message}`);
  }
}

function renderRatingsView() {
  state.view = "ratings";
  setActiveNav("ratings");
  hideStatus();

  const entries = Object.values(state.ratings)
    .filter((r) => r.type === state.type)
    .sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title));

  els.sectionTitle.textContent = "My Ratings";
  els.sectionSubtitle.textContent =
    entries.length
      ? `${entries.length} ${state.type === "movie" ? "movie" : "show"}${entries.length === 1 ? "" : "s"} you've rated.`
      : "";

  els.grid.innerHTML = "";

  if (!entries.length) {
    showEmpty(
      `You haven't rated any ${state.type === "movie" ? "movies" : "TV shows"} yet. Browse and tap the stars on a title to rate it.`
    );
    return;
  }

  const frag = document.createDocumentFragment();
  entries.forEach((entry) => {
    const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
    const img = node.querySelector("img");
    const badge = node.querySelector(".card-rating-badge");
    const title = node.querySelector(".card-title");
    const meta = node.querySelector(".card-meta");
    const stars = node.querySelector(".card-stars");

    img.src = entry.poster_path ? IMG_POSTER + entry.poster_path : "";
    img.alt = entry.title;
    title.textContent = entry.title;
    meta.textContent = entry.date || "";
    updateBadge(badge, entry.rating);

    renderStars(stars, entry.rating, {
      onRate: (n) => {
        setRating(entry.type, entry.id, n, {
          title: entry.title,
          poster_path: entry.poster_path,
          date: entry.date,
        });
        renderRatingsView();
      },
    });

    node.addEventListener("click", () => openModal(entry.id));
    frag.appendChild(node);
  });
  els.grid.appendChild(frag);
  showGrid();
}

function setActiveNav(view) {
  els.navBtns.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.nav === view);
  });
}

function refreshCurrentView() {
  state.view === "ratings" ? renderRatingsView() : renderBrowseView();
}

// ---------- modal (detail view) ----------
async function openModal(id) {
  els.modalOverlay.hidden = false;
  document.body.style.overflow = "hidden";
  els.modalBody.innerHTML = `<div class="status" style="padding:60px 24px;"><span class="spinner"></span> Loading details…</div>`;

  try {
    const endpoint = state.type === "movie" ? `movie/${id}` : `tv/${id}`;
    const [details, credits] = await Promise.all([
      tmdb(endpoint),
      tmdb(`${endpoint}/credits`),
    ]);
    renderModal(details, credits);
  } catch (err) {
    els.modalBody.innerHTML = `<div class="status is-error" style="padding:60px 24px;">Couldn't load details: ${err.message}</div>`;
  }
}

function renderModal(item, credits) {
  const title = titleOf(item);
  const year = dateOf(item);
  const runtime = item.runtime
    ? `${item.runtime} min`
    : item.episode_run_time?.[0]
    ? `${item.episode_run_time[0]} min / ep`
    : null;
  const genres = (item.genres || []).map((g) => g.name).join(", ");
  const cast = (credits?.cast || []).slice(0, 6);

  els.modalBody.innerHTML = `
    <div class="modal-hero">
      <img src="${item.poster_path ? IMG_POSTER + item.poster_path : ""}" alt="${title}" />
      <div>
        <h2>${title} <span class="muted" style="font-family: var(--font-body); font-weight: 400; font-size: 0.9rem;">${year}</span></h2>
        <p class="modal-meta muted">${[runtime, genres, item.vote_average ? "★ " + item.vote_average.toFixed(1) + " TMDB" : null].filter(Boolean).join(" · ")}</p>
        <p class="modal-rate-label">Your rating</p>
        <div class="modal-stars" id="modalStars"></div>
        <button type="button" class="modal-clear" id="modalClear">Clear rating</button>
      </div>
    </div>
    <div class="modal-section">
      <h3>Overview</h3>
      <p class="modal-overview">${item.overview || "No overview available."}</p>
    </div>
    ${cast.length ? `
    <div class="modal-section">
      <h3>Cast</h3>
      <div class="cast-row">
        ${cast.map((p) => `
          <div class="cast-person">
            ${p.profile_path
              ? `<img src="${IMG_PROFILE + p.profile_path}" alt="${p.name}" />`
              : `<div class="cast-fallback">${p.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</div>`
            }
            <p>${p.name}</p>
            <p class="cast-character">${p.character || ""}</p>
          </div>
        `).join("")}
      </div>
    </div>` : ""}
  `;

  const starsEl = document.getElementById("modalStars");

  function handleModalRate(n) {
    setRating(state.type, item.id, n, {
      title,
      poster_path: item.poster_path,
      date: year,
    });
    renderStars(starsEl, n, { size: "modal", onRate: handleModalRate });
    refreshCurrentView();
  }

  renderStars(starsEl, getRating(state.type, item.id), {
    size: "modal",
    onRate: handleModalRate,
  });

  document.getElementById("modalClear").addEventListener("click", () => {
    setRating(state.type, item.id, 0);
    renderStars(starsEl, 0, { size: "modal", onRate: () => {} });
    closeModal();
    refreshCurrentView();
  });
}

function closeModal() {
  els.modalOverlay.hidden = true;
  document.body.style.overflow = "";
}

// ---------- event wiring ----------
els.typeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.type === state.type) return;
    state.type = btn.dataset.type;
    els.typeBtns.forEach((b) => {
      b.classList.toggle("is-active", b === btn);
      b.setAttribute("aria-selected", b === btn ? "true" : "false");
    });
    refreshCurrentView();
  });
});

els.navBtns.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const nav = btn.dataset.nav;
    if (nav === "browse") {
      state.query = "";
      els.searchInput.value = "";
      renderBrowseView();
    } else {
      renderRatingsView();
    }
  });
});

els.searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  state.query = els.searchInput.value.trim();
  renderBrowseView();
});

let debounceTimer;
els.searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    state.query = els.searchInput.value.trim();
    renderBrowseView();
  }, 450);
});

els.modalClose.addEventListener("click", closeModal);
els.modalOverlay.addEventListener("click", (e) => {
  if (e.target === els.modalOverlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.modalOverlay.hidden) closeModal();
});

// ---------- init ----------
updateRatingsCount();
renderBrowseView();
