// =====================================================================
// PAINEL DE CLIENTES (KANBAN) — MediarPrev
// =====================================================================
// Mesma lógica do mapa de acompanhamento original, agora sincronizada
// em tempo real com o Firestore (várias pessoas podem usar ao mesmo
// tempo) em vez de localStorage.
// =====================================================================

import { db } from "./firebase-config.js";
import { getCurrentUser } from "./auth.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const W = 220, H = 300;
const NODES = {
  atendimento:        { label: "Atendimento ao Público",           x: 20,   y: 300, color: "#5a6472" },
  contratados:        { label: "Clientes Contratados",             x: 280,  y: 300, color: "#0d2c66" },
  processo_adm:       { label: "Processo Administrativo",          x: 540,  y: 300, color: "#1f5fa8" },
  adm_procedente:     { label: "Processo Adm. Julgado Procedente", x: 800,  y: 20,  color: "#2c8d56", final: "ok",      tag: "✅ Concluído — Deferido" },
  recurso_adm:        { label: "Recurso Administrativo",           x: 800,  y: 560, color: "#b8860b" },
  recurso_procedente: { label: "Recurso Julgado Procedente",       x: 1060, y: 380, color: "#2c8d56", final: "ok",      tag: "✅ Concluído — Deferido em recurso" },
  encaminhados:       { label: "Processos Encaminhados",           x: 1060, y: 740, color: "#c0392b", final: "forward", tag: "➡ Encaminhado ao advogado" },
};
const EDGES = [
  ["atendimento", "contratados"], ["contratados", "processo_adm"],
  ["processo_adm", "adm_procedente"], ["processo_adm", "recurso_adm"],
  ["recurso_adm", "recurso_procedente"], ["recurso_adm", "encaminhados"],
];
const STAGE_IDS = Object.keys(NODES);
const CANVAS_W = 1060 + W + 40;
const CANVAS_H = 740 + H + 40;

let clients = [];   // ativos (archived == false)
let archive = [];   // arquivados (archived == true)
let editingId = null;
let onOpenFicha = null; // callback injetado pelo app.js

function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  (kids || []).forEach(k => k && e.appendChild(k));
  return e;
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

function buildSvgLines() {
  const svgns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgns, "svg");
  svg.setAttribute("class", "kb-lines");
  svg.setAttribute("width", CANVAS_W);
  svg.setAttribute("height", CANVAS_H);
  EDGES.forEach(([pid, cid]) => {
    const p = NODES[pid], c = NODES[cid];
    const x1 = p.x + W, y1 = p.y + H / 2;
    const x2 = c.x, y2 = c.y + H / 2;
    const midX = (x1 + x2) / 2;
    const path = document.createElementNS(svgns, "path");
    path.setAttribute("d", `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
    path.setAttribute("fill", "none"); path.setAttribute("stroke", "#b7c3dc");
    path.setAttribute("stroke-width", "2.5"); path.setAttribute("stroke-linecap", "round");
    svg.appendChild(path);
    const dot = document.createElementNS(svgns, "circle");
    dot.setAttribute("cx", x2); dot.setAttribute("cy", y2); dot.setAttribute("r", 3.5);
    dot.setAttribute("fill", c.color);
    svg.appendChild(dot);
  });
  return svg;
}

function populateFaseSelect() {
  const sel = document.getElementById("mFase");
  sel.innerHTML = "";
  STAGE_IDS.forEach(id => sel.appendChild(el("option", { value: id }, [document.createTextNode(NODES[id].label)])));
}

function renderCanvas() {
  const canvas = document.getElementById("canvas");
  canvas.innerHTML = "";
  canvas.style.width = CANVAS_W + "px";
  canvas.style.height = CANVAS_H + "px";
  canvas.appendChild(buildSvgLines());

  const query = (document.getElementById("searchBox").value || "").toLowerCase().trim();

  STAGE_IDS.forEach(id => {
    const def = NODES[id];
    const node = el("div", { class: "kb-node" });
    node.style.left = def.x + "px"; node.style.top = def.y + "px";
    node.style.width = W + "px"; node.style.height = H + "px";
    node.style.setProperty("--nc", def.color);

    const stageClients = clients.filter(c => c.stage === id && (!query || (c.nome || "").toLowerCase().includes(query)));

    const head = el("div", { class: "kb-node-head" });
    head.appendChild(el("div", { class: "kb-node-title" }, [document.createTextNode(def.label)]));
    head.appendChild(el("div", { class: "kb-node-count" }, [document.createTextNode(stageClients.length + " cliente(s)")]));
    if (def.tag) head.appendChild(el("div", { class: "kb-node-final-tag" }, [document.createTextNode(def.tag)]));
    node.appendChild(head);

    const body = el("div", { class: "kb-node-body" });
    body.addEventListener("dragover", (e) => { e.preventDefault(); body.classList.add("dragover"); });
    body.addEventListener("dragleave", () => body.classList.remove("dragover"));
    body.addEventListener("drop", (e) => {
      e.preventDefault(); body.classList.remove("dragover");
      const cid = e.dataTransfer.getData("text/plain");
      moveClient(cid, id);
    });

    if (stageClients.length === 0) body.appendChild(el("div", { class: "kb-node-empty" }, [document.createTextNode("Nenhum cliente")]));
    stageClients.forEach(c => body.appendChild(renderCard(c, def)));
    node.appendChild(body);
    canvas.appendChild(node);
  });
}

function renderCard(c, stageDef) {
  const card = el("div", { class: "kb-card", draggable: "true" });
  card.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", c.id));

  card.appendChild(el("div", { class: "kb-card-name" }, [document.createTextNode(c.nome || "(sem nome)")]));
  if (c.beneficio) card.appendChild(el("div", { class: "kb-card-badge" }, [document.createTextNode(c.beneficio)]));
  if (c.telefone) card.appendChild(el("div", { class: "kb-card-meta" }, [document.createTextNode("📞 " + c.telefone)]));
  if (c.obs) card.appendChild(el("div", { class: "kb-card-notes" }, [document.createTextNode(c.obs)]));

  if (stageDef.final) {
    const msg = stageDef.final === "ok" ? "✅ Processo concluído — pode ser arquivado" : "➡ Encaminhado — pode ser arquivado";
    card.appendChild(el("div", { class: "kb-card-complete " + (stageDef.final === "ok" ? "ok" : "forward") }, [document.createTextNode(msg)]));
  }

  const row = el("div", { class: "kb-card-row" });
  const moveSel = el("select");
  STAGE_IDS.forEach(sid => {
    const opt = el("option", { value: sid }, [document.createTextNode(NODES[sid].label)]);
    if (sid === c.stage) opt.setAttribute("selected", "selected");
    moveSel.appendChild(opt);
  });
  moveSel.addEventListener("change", () => moveClient(c.id, moveSel.value));
  row.appendChild(moveSel);

  const editBtn = el("button", { class: "kb-icon-btn" }, [document.createTextNode("✎")]);
  editBtn.addEventListener("click", () => openModal(c));
  row.appendChild(editBtn);

  const delBtn = el("button", { class: "kb-icon-btn danger" }, [document.createTextNode("🗑")]);
  delBtn.addEventListener("click", async () => {
    if (confirm('Excluir o cliente "' + c.nome + '"? Esta ação não pode ser desfeita.')) {
      await deleteDoc(doc(db, "clients", c.id));
      toast("Cliente excluído");
    }
  });
  row.appendChild(delBtn);
  card.appendChild(row);

  const fichaBtn = el("button", { class: "kb-ficha-btn" }, [document.createTextNode(c.fichaId ? "📄 Abrir ficha" : "📄 Criar ficha")]);
  fichaBtn.addEventListener("click", () => onOpenFicha && onOpenFicha(c));
  card.appendChild(fichaBtn);

  if (stageDef.final) {
    const archBtn = el("button", { class: "kb-archive-btn" }, [document.createTextNode("Arquivar cliente")]);
    archBtn.addEventListener("click", () => archiveClient(c.id));
    card.appendChild(archBtn);
  }
  return card;
}

async function moveClient(id, newStage) {
  const c = clients.find(x => x.id === id);
  if (!c || c.stage === newStage) return;
  await updateDoc(doc(db, "clients", id), { stage: newStage, updatedAt: serverTimestamp() });
  const def = NODES[newStage];
  if (def.final) toast((def.final === "ok" ? "✅ " : "➡ ") + c.nome + " — processo concluído nesta fase");
}

async function archiveClient(id) {
  await updateDoc(doc(db, "clients", id), { archived: true, archivedAt: serverTimestamp() });
  toast("Cliente arquivado");
}
async function restoreClient(id) {
  await updateDoc(doc(db, "clients", id), { archived: false, archivedAt: null });
  toast("Cliente restaurado");
}

function updateArchiveCount() {
  document.getElementById("arqCount").textContent = archive.length;
}

function openModal(client) {
  editingId = client ? client.id : null;
  document.getElementById("modalTitle").textContent = client ? "Editar cliente" : "Novo cliente";
  document.getElementById("mNome").value = client ? client.nome || "" : "";
  document.getElementById("mTelefone").value = client ? client.telefone || "" : "";
  document.getElementById("mBeneficio").value = client ? client.beneficio || "Aposentadoria" : "Aposentadoria";
  document.getElementById("mFase").value = client ? client.stage : "atendimento";
  document.getElementById("mObs").value = client ? client.obs || "" : "";
  document.getElementById("modalOverlay").classList.add("show");
  document.getElementById("mNome").focus();
}
function closeModal() { document.getElementById("modalOverlay").classList.remove("show"); editingId = null; }

async function saveModal() {
  const nome = document.getElementById("mNome").value.trim();
  if (!nome) { toast("Informe o nome do cliente"); return; }
  const user = getCurrentUser();
  const data = {
    nome,
    telefone: document.getElementById("mTelefone").value.trim(),
    beneficio: document.getElementById("mBeneficio").value,
    stage: document.getElementById("mFase").value,
    obs: document.getElementById("mObs").value.trim(),
    updatedAt: serverTimestamp(),
    updatedBy: user ? user.email : null,
  };
  if (editingId) {
    await updateDoc(doc(db, "clients", editingId), data);
    toast("Cliente atualizado");
  } else {
    data.archived = false;
    data.fichaId = null;
    data.createdAt = serverTimestamp();
    data.createdBy = user ? user.email : null;
    await addDoc(collection(db, "clients"), data);
    toast("Cliente adicionado");
  }
  closeModal();
}

function openArchive() {
  const list = document.getElementById("archiveList");
  list.innerHTML = "";
  if (archive.length === 0) {
    list.appendChild(el("div", { class: "kb-node-empty" }, [document.createTextNode("Nenhum cliente arquivado ainda.")]));
  } else {
    archive.slice().reverse().forEach(c => {
      const item = el("div", { class: "archive-item" });
      const info = el("div", { class: "archive-info" });
      info.appendChild(el("b", {}, [document.createTextNode(c.nome)]));
      const stageLabel = (NODES[c.stage] && NODES[c.stage].label) || c.stage;
      const when = c.archivedAt && c.archivedAt.toDate ? c.archivedAt.toDate().toLocaleDateString("pt-BR") : "";
      info.appendChild(el("span", {}, [document.createTextNode(stageLabel + (when ? " · arquivado em " + when : ""))]));
      item.appendChild(info);
      const btns = el("div", { class: "archive-btns" });
      const restoreBtn = el("button", { class: "kb-icon-btn" }, [document.createTextNode("Restaurar")]);
      restoreBtn.addEventListener("click", async () => { await restoreClient(c.id); openArchive(); });
      const delBtn = el("button", { class: "kb-icon-btn danger" }, [document.createTextNode("Excluir")]);
      delBtn.addEventListener("click", async () => {
        if (confirm('Excluir definitivamente "' + c.nome + '" do arquivo?')) {
          await deleteDoc(doc(db, "clients", c.id));
          openArchive();
          toast("Removido do arquivo");
        }
      });
      btns.appendChild(restoreBtn); btns.appendChild(delBtn);
      item.appendChild(btns);
      list.appendChild(item);
    });
  }
  document.getElementById("archiveOverlay").classList.add("show");
}
function closeArchive() { document.getElementById("archiveOverlay").classList.remove("show"); }

function baixarBackup() {
  const payload = { tipo: "mediarprev_kanban_backup", versao: 3, exportadoEm: new Date().toISOString(), clients, archive };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "mediarprev_clientes_backup_" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Backup baixado (" + clients.length + " ativos, " + archive.length + " arquivados)");
}
function abrirBackup() { document.getElementById("fileInput").click(); }
async function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data || !Array.isArray(data.clients)) { toast("Arquivo inválido."); return; }
      if (!confirm("Importar " + data.clients.length + " cliente(s) para o banco de dados online? Isso adiciona novos registros (não apaga os existentes).")) return;
      const validIds = new Set(STAGE_IDS);
      const user = getCurrentUser();
      const batch = writeBatch(db);
      const all = [...data.clients.map(c => ({ ...c, archived: false })), ...(data.archive || []).map(c => ({ ...c, archived: true }))];
      all.forEach(c => {
        if (!validIds.has(c.stage)) c.stage = "atendimento";
        const ref = doc(collection(db, "clients"));
        const { id, ...rest } = c;
        batch.set(ref, { ...rest, fichaId: rest.fichaId || null, createdAt: serverTimestamp(), createdBy: user ? user.email : null });
      });
      await batch.commit();
      toast("Backup importado: " + all.length + " cliente(s)");
    } catch (err) { console.error(err); toast("Não foi possível ler este arquivo."); }
  };
  reader.readAsText(file, "UTF-8");
  e.target.value = "";
}

// Chamada pelo módulo da ficha quando uma ficha é salva e precisa
// criar/atualizar o card correspondente no painel.
export async function upsertClientFromFicha({ clientId, nome, telefone, beneficio, fichaId }) {
  const user = getCurrentUser();
  if (clientId) {
    await updateDoc(doc(db, "clients", clientId), {
      nome, telefone, beneficio, fichaId,
      updatedAt: serverTimestamp(), updatedBy: user ? user.email : null,
    });
    return clientId;
  }
  const ref = await addDoc(collection(db, "clients"), {
    nome, telefone, beneficio, fichaId,
    stage: "atendimento", obs: "", archived: false,
    createdAt: serverTimestamp(), createdBy: user ? user.email : null,
    updatedAt: serverTimestamp(), updatedBy: user ? user.email : null,
  });
  return ref.id;
}

export function initKanban({ onOpenFicha: cb }) {
  onOpenFicha = cb;
  populateFaseSelect();

  onSnapshot(collection(db, "clients"), (snap) => {
    const all = [];
    snap.forEach(d => all.push({ id: d.id, ...d.data() }));
    clients = all.filter(c => !c.archived);
    archive = all.filter(c => c.archived);
    renderCanvas();
    updateArchiveCount();
  }, (err) => {
    console.error(err);
    toast("Erro ao sincronizar clientes: " + err.message);
  });

  document.getElementById("btnNovoCliente").addEventListener("click", () => openModal(null));
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mSave").addEventListener("click", saveModal);
  document.getElementById("modalOverlay").addEventListener("click", (e) => { if (e.target.id === "modalOverlay") closeModal(); });
  document.getElementById("btnBaixarBackup").addEventListener("click", baixarBackup);
  document.getElementById("btnAbrirBackup").addEventListener("click", abrirBackup);
  document.getElementById("fileInput").addEventListener("change", handleFile);
  document.getElementById("searchBox").addEventListener("input", renderCanvas);
  document.getElementById("btnArquivo").addEventListener("click", openArchive);
  document.getElementById("archiveClose").addEventListener("click", closeArchive);
  document.getElementById("archiveOverlay").addEventListener("click", (e) => { if (e.target.id === "archiveOverlay") closeArchive(); });
}
