// =====================================================================
// APP.JS — orquestrador principal do sistema MediarPrev
// =====================================================================
import { initAuth, onReady } from "./auth.js";
import { initKanban, upsertClientFromFicha } from "./kanban.js";
import { initFicha, openForClient } from "./ficha.js";

const PANELS = {
  kanban: { panel: "panelKanban", nav: "navKanban" },
  ficha:  { panel: "panelFicha",  nav: "navFicha" },
  fichas: { panel: "panelFichas", nav: "navFichas" },
};

function switchPanel(name) {
  Object.entries(PANELS).forEach(([key, ids]) => {
    document.getElementById(ids.panel).classList.toggle("active", key === name);
    document.getElementById(ids.nav).classList.toggle("active", key === name);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

let started = false;
function startApp() {
  if (started) return; // evita reinicializar listeners se onAuthStateChanged disparar de novo
  started = true;

  document.getElementById("navKanban").addEventListener("click", () => switchPanel("kanban"));
  document.getElementById("navFicha").addEventListener("click", () => switchPanel("ficha"));
  document.getElementById("navFichas").addEventListener("click", () => switchPanel("fichas"));

  initFicha({
    onSaveLinkClient: upsertClientFromFicha,
    onOpenPainelClient: () => switchPanel("kanban"),
  });

  initKanban({
    onOpenFicha: (client) => { openForClient(client); switchPanel("ficha"); },
  });

  switchPanel("kanban");
}

document.addEventListener("DOMContentLoaded", () => {
  initAuth();
  onReady(startApp);
});
