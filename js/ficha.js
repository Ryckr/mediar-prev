// =====================================================================
// FICHA DIGITAL DE ATENDIMENTO — MediarPrev
// =====================================================================
// Mesmo conteúdo previdenciário da ficha original (todas as abas e
// checklists de documentos), agora salvando no Firestore, com opção
// de salvar a ficha localmente no computador (dados gerais + serviço
// selecionado), impressão e vínculo automático com o card do cliente
// no painel (kanban).
// =====================================================================

import { db } from "./firebase-config.js";
import { getCurrentUser } from "./auth.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const DRAFT_KEY = "mediarprev_ficha_draft";

const tabs = [
  ['s0', 'Geral'], ['s1', 'Aposentadoria'], ['s2', 'Apos. rural'], ['s3', 'Incapacidade temporária'],
  ['s4', 'Auxílio-acidente'], ['s5', 'BPC idoso'], ['s6', 'BPC deficiência'], ['s7', 'Pensão por morte'],
  ['s8', 'Auxílio-reclusão'], ['s9', 'Salário-maternidade'], ['s10', 'Serviços complementares'], ['s11', 'Controle interno']
];
const docs = {
  'docs-apo': ['Documento pessoal + CPF', 'CNIS atualizado', 'CTPS física/digital, se houver', 'Carnês/GPS e comprovantes de contribuições, se houver', 'CTC de outro regime, se houver', 'Documentação rural, se houver', 'PPP/documentos de atividade especial, se houver', 'Documentos para corrigir vínculos/períodos no CNIS, se necessário'],
  'docs-rural': ['Documento pessoal + CPF', 'CNIS', 'CTPS, se houver', 'Documentos de propriedade/posse/arrendamento/parceria', 'Notas fiscais/comprovantes de comercialização, se houver', 'Documentos de sindicato/associação rural, quando pertinentes', 'Documentos escolares, fiscais ou outros que ajudem a comprovar períodos rurais', 'Outros documentos rurais fornecidos pelo cliente'],
  'docs-incap': ['Documento pessoal + CPF', 'Atestado médico, quando aplicável', 'Laudos/relatórios médicos', 'Exames pertinentes', 'Documentos de internação/cirurgia/tratamento, se houver', 'Documentos relacionados ao acidente, se houver', 'CNIS/CTPS/documentos previdenciários, conforme o caso', 'Documento de perícia/exigência, se já emitido'],
  'docs-acid': ['Documento pessoal + CPF', 'Laudos/relatórios médicos', 'Exames', 'CAT, se houver', 'Documentos de benefício por incapacidade anterior, se houver', 'Documentos trabalhistas/previdenciários úteis ao caso'],
  'docs-bpc-idoso': ['Documento pessoal + CPF do requerente', 'CPF/documentos dos integrantes do grupo familiar', 'CadÚnico/NIS, quando disponível', 'Comprovantes de renda, quando necessários', 'Comprovante de residência, quando necessário', 'Documentos de despesas relevantes, quando pertinentes', 'Representação legal/procuração, se houver'],
  'docs-bpc-pcd': ['Documento pessoal + CPF do requerente', 'CPF/documentos do grupo familiar', 'CadÚnico/NIS', 'Laudos e relatórios médicos', 'Exames pertinentes', 'Documentos sobre limitações funcionais/tratamentos, quando existentes', 'Comprovantes de renda/residência, quando necessários', 'Documentos de despesas relevantes', 'Representação legal/procuração, se houver'],
  'docs-pensao': ['Certidão de óbito/documento equivalente', 'Documento pessoal + CPF do dependente', 'Prova de vínculo/dependência (casamento, nascimento, união estável etc.)', 'Documentos do falecido: CPF, documento pessoal, CTPS/CNIS/CTC/carnês/documentos rurais, conforme disponíveis', 'Prova de dependência econômica, quando necessária', 'Representação legal/procuração, se houver', 'Documentação de acidente do trabalho/CAT, se aplicável'],
  'docs-reclusao': ['Certidão/documento que ateste o recolhimento à prisão', 'Documentos do segurado preso, quando necessários', 'Documentos pessoais e CPF dos dependentes', 'Provas de dependência', 'CTPS/CNIS/carnês e demais documentos previdenciários', 'Representação legal/procuração, se houver', 'Atualizações carcerárias, quando aplicáveis'],
  'docs-sm': ['Documento pessoal + CPF', 'Certidão de nascimento/natimorto, quando aplicável', 'Atestado médico específico, quando aplicável', 'Termo de guarda com finalidade de adoção, quando aplicável', 'Nova certidão de nascimento em caso de adoção, quando aplicável', 'Documentos previdenciários/trabalhistas pertinentes', 'Representação/procuração, se houver']
};
// Mapeia o tipo de atendimento da ficha para as opções de "benefício" do painel de clientes.
const TIPO_TO_BENEFICIO = {
  s1: 'Aposentadoria', s2: 'Aposentadoria', s3: 'Auxílio Doença', s4: 'Auxílio Doença',
  s5: 'BPC / LOAS', s6: 'BPC / LOAS', s7: 'Pensão por Morte', s8: 'Auxílio Reclusão',
  s9: 'Salário Maternidade', s10: 'Aposentadoria'
};
// Mapeia cada aba de serviço para a sua tabela de checklist de documentos (quando houver).
const TIPO_TO_DOCS = {
  s1: 'docs-apo', s2: 'docs-rural', s3: 'docs-incap', s4: 'docs-acid',
  s5: 'docs-bpc-idoso', s6: 'docs-bpc-pcd', s7: 'docs-pensao', s8: 'docs-reclusao', s9: 'docs-sm'
};

let current = 0;
let currentFichaId = null;
let currentClientId = null;
let onSaveLinkClient = null; // callback injetado (kanban.upsertClientFromFicha)
let onOpenPainelClient = null; // callback para pular ao painel

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}
function fields() { return [...document.querySelectorAll("#fichaSections [data-key]")]; }
function fieldEl(key) { return document.querySelector(`#fichaSections [data-key="${key}"]`); }
function setFieldValue(key, val) { const e = fieldEl(key); if (e) e.value = val; }
function getFieldValue(key) { const e = fieldEl(key); return e ? e.value : ""; }

function buildTabs() {
  const el = document.getElementById("fichaTabs");
  el.innerHTML = "";
  tabs.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "tab" + (i === 0 ? " active" : "");
    b.textContent = t[1];
    b.onclick = () => showTab(i);
    el.appendChild(b);
  });
}
function showTab(i) {
  current = i;
  document.querySelectorAll("#fichaSections section").forEach(s => s.classList.remove("active"));
  document.getElementById(tabs[i][0]).classList.add("active");
  document.querySelectorAll("#fichaTabs .tab").forEach((b, j) => b.classList.toggle("active", j === i));
  document.getElementById("fichaGlobalStatus").textContent = `Aba ${i + 1} de ${tabs.length}: ${tabs[i][1]}`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function nextTab() { showTab(Math.min(tabs.length - 1, current + 1)); }
function prevTab() { showTab(Math.max(0, current - 1)); }

function makeTables() {
  for (const [id, items] of Object.entries(docs)) {
    const box = document.getElementById(id);
    if (!box) continue;
    let h = '<h3>Checklist de documentos e informações</h3><table class="doc-table"><thead><tr><th>Documento / informação</th><th>Status</th><th>Pendência / observação</th></tr></thead><tbody>';
    items.forEach((x, i) => {
      const key = "doc." + id + "." + i;
      h += `<tr><td>${x}</td><td><select data-key="${key}.status"><option></option><option>Recebido</option><option>Pendente</option><option>Não se aplica</option><option>A conferir</option></select></td><td><input data-key="${key}.obs"></td></tr>`;
    });
    h += "</tbody></table>";
    box.innerHTML = h;
  }
}

function collect() {
  const data = { version: 2, savedAt: new Date().toISOString(), fields: {} };
  fields().forEach(el => { data.fields[el.dataset.key] = el.type === "checkbox" ? el.checked : el.value; });
  return data;
}
function apply(data) {
  fields().forEach(el => {
    const v = data?.fields?.[el.dataset.key];
    if (v === undefined) { if (el.type === "checkbox") el.checked = false; else el.value = ""; return; }
    if (el.type === "checkbox") el.checked = !!v; else el.value = v;
  });
}
function clearFields() { fields().forEach(el => el.type === "checkbox" ? (el.checked = false) : (el.value = "")); }

function setSyncStatus(kind, msg) {
  const box = document.getElementById("fichaSyncStatus");
  box.textContent = msg;
  box.className = "status-pill " + kind;
}

function updateLinkBanner() {
  const banner = document.getElementById("linkBanner");
  if (currentClientId) {
    banner.innerHTML = "";
    banner.appendChild(Object.assign(document.createElement("span"), {
      innerHTML: "🔗 Ficha vinculada ao cliente do painel. "
    }));
    const btn = document.createElement("button");
    btn.className = "btn"; btn.textContent = "Ver no painel";
    btn.onclick = () => onOpenPainelClient && onOpenPainelClient();
    banner.appendChild(btn);
  } else {
    banner.innerHTML = "<span>Esta ficha ainda não está vinculada a um cliente do painel — ao salvar, um card será criado/atualizado automaticamente com o nome informado.</span>";
  }
  document.getElementById("btnExcluirFicha").classList.toggle("hidden", !currentFichaId);
}

function newForm() {
  clearFields();
  currentFichaId = null;
  currentClientId = null;
  updateLinkBanner();
  setSyncStatus("", "");
  showTab(0);
  localStorage.removeItem(DRAFT_KEY);
  document.getElementById("draftBanner").classList.add("hidden");
}

async function salvarNuvem() {
  const nome = getFieldValue("cliente.nome").trim();
  if (!nome) { alert("Informe ao menos o nome do cliente na aba Geral antes de salvar."); showTab(0); return; }
  setSyncStatus("syncing", "Salvando na nuvem...");
  const user = getCurrentUser();
  const data = collect();
  const tipo = data.fields["triagem.tipo"] || "";
  const payload = {
    clientId: currentClientId || null,
    clientNome: nome,
    tipo,
    tipoLabel: tabs.find(t => t[0] === tipo)?.[1] || "",
    fields: data.fields,
    updatedAt: serverTimestamp(),
    updatedBy: user ? user.email : null,
  };
  try {
    let fichaId = currentFichaId;
    if (fichaId) {
      await updateDoc(doc(db, "fichas", fichaId), payload);
    } else {
      payload.createdAt = serverTimestamp();
      payload.createdBy = user ? user.email : null;
      const ref = await addDoc(collection(db, "fichas"), payload);
      fichaId = ref.id;
      currentFichaId = fichaId;
    }
    if (onSaveLinkClient) {
      const clientId = await onSaveLinkClient({
        clientId: currentClientId,
        nome,
        telefone: getFieldValue("cliente.telefone"),
        beneficio: TIPO_TO_BENEFICIO[tipo] || "Aposentadoria",
        fichaId,
      });
      currentClientId = clientId;
      await updateDoc(doc(db, "fichas", fichaId), { clientId });
    }
    updateLinkBanner();
    setSyncStatus("ok", "Ficha salva na nuvem às " + new Date().toLocaleTimeString("pt-BR"));
    localStorage.removeItem(DRAFT_KEY);
    document.getElementById("draftBanner").classList.add("hidden");
  } catch (e) {
    console.error(e);
    setSyncStatus("err", "Erro ao salvar: " + e.message);
  }
}

async function excluirFicha() {
  if (!currentFichaId) return;
  if (!confirm("Excluir esta ficha definitivamente? Esta ação não pode ser desfeita.")) return;
  try {
    await deleteDoc(doc(db, "fichas", currentFichaId));
    if (currentClientId) {
      await updateDoc(doc(db, "clients", currentClientId), { fichaId: null }).catch(() => {});
    }
    toast("Ficha excluída");
    newForm();
  } catch (e) {
    console.error(e);
    toast("Erro ao excluir: " + e.message);
  }
}

export async function loadFicha(fichaId) {
  try {
    const snap = await getDoc(doc(db, "fichas", fichaId));
    if (!snap.exists()) { toast("Ficha não encontrada."); return; }
    const data = snap.data();
    clearFields();
    apply({ fields: data.fields || {} });
    currentFichaId = fichaId;
    currentClientId = data.clientId || null;
    updateLinkBanner();
    setSyncStatus("ok", "Ficha carregada.");
    showTab(0);
  } catch (e) {
    console.error(e);
    toast("Erro ao carregar ficha: " + e.message);
  }
}

// Chamado pelo painel (kanban) ao clicar em "Abrir/Criar ficha" no card do cliente.
export function openForClient(client) {
  if (client.fichaId) { loadFicha(client.fichaId); return; }
  clearFields();
  currentFichaId = null;
  currentClientId = client.id;
  setFieldValue("cliente.nome", client.nome || "");
  setFieldValue("cliente.telefone", client.telefone || "");
  updateLinkBanner();
  setSyncStatus("", "Nova ficha vinculada a " + (client.nome || "cliente") + " — preencha e salve.");
  showTab(0);
}

// ---------- Impressão (aba geral + serviço selecionado) ----------
function markPrintSelected(ids) {
  document.querySelectorAll("#fichaSections section").forEach(s => s.classList.remove("print-selected"));
  ids.forEach(id => document.getElementById(id)?.classList.add("print-selected"));
}
function imprimirFicha() {
  const tipo = getFieldValue("triagem.tipo");
  if (!tipo) { alert("Selecione primeiro o tipo de atendimento/benefício na ficha geral."); showTab(0); return; }
  markPrintSelected(["s0", tipo]);
  window.print();
  setTimeout(() => markPrintSelected([]), 400);
}

// ---------- Salvar ficha localmente no computador (arquivo .json) ----------
// Salva apenas os dados gerais (aba "Geral") e os dados do serviço/benefício
// selecionado na ficha (aba correspondente + checklist de documentos dela).
function coletarDadosGeralEServico(tipo) {
  const keys = new Set();
  document.querySelectorAll('#s0 [data-key]').forEach(el => keys.add(el.dataset.key));
  document.querySelectorAll(`#${tipo} [data-key]`).forEach(el => keys.add(el.dataset.key));
  const docsId = TIPO_TO_DOCS[tipo];
  if (docsId) document.querySelectorAll(`#${docsId} [data-key]`).forEach(el => keys.add(el.dataset.key));
  const fieldsData = {};
  keys.forEach(key => {
    const el = fieldEl(key);
    if (el) fieldsData[key] = el.type === "checkbox" ? el.checked : el.value;
  });
  return fieldsData;
}
function salvarLocal() {
  const nome = getFieldValue("cliente.nome").trim();
  if (!nome) { alert("Informe ao menos o nome do cliente na aba Geral antes de salvar."); showTab(0); return; }
  const tipo = getFieldValue("triagem.tipo");
  if (!tipo) { alert("Selecione primeiro o tipo de atendimento/benefício na ficha geral."); showTab(0); return; }
  const payload = {
    tipo: "mediarprev_ficha",
    versao: 1,
    salvoEm: new Date().toISOString(),
    clientNome: nome,
    tipoServico: tipo,
    tipoServicoLabel: tabs.find(t => t[0] === tipo)?.[1] || "",
    fields: coletarDadosGeralEServico(tipo)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const nomeArquivo = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "ficha";
  const a = document.createElement("a");
  a.href = url; a.download = "ficha_" + nomeArquivo + "_" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Ficha salva no computador.");
}

// ---------- Lista de fichas salvas ----------
function renderFichasList(allFichas) {
  const list = document.getElementById("fichasList");
  const query = (document.getElementById("fichasSearch").value || "").toLowerCase().trim();
  list.innerHTML = "";
  const filtered = allFichas
    .filter(f => !query || (f.clientNome || "").toLowerCase().includes(query))
    .sort((a, b) => (b._updatedMs || 0) - (a._updatedMs || 0));
  if (filtered.length === 0) {
    list.innerHTML = '<div class="kb-node-empty">Nenhuma ficha encontrada.</div>';
    return;
  }
  filtered.forEach(f => {
    const row = document.createElement("div");
    row.className = "ficha-row";
    const when = f._updatedMs ? new Date(f._updatedMs).toLocaleString("pt-BR") : "";
    row.innerHTML = `<div class="ficha-row-info"><b>${f.clientNome || "(sem nome)"}</b><span>${f.tipoLabel || "Sem tipo definido"} · atualizado em ${when}</span></div>`;
    const btns = document.createElement("div");
    btns.className = "ficha-row-btns";
    const openBtn = document.createElement("button"); openBtn.className = "btn"; openBtn.textContent = "Abrir";
    openBtn.onclick = () => { loadFicha(f.id); document.getElementById("navFicha").click(); };
    const printBtn = document.createElement("button"); printBtn.className = "btn dark"; printBtn.textContent = "🖨 Imprimir";
    printBtn.onclick = async () => { await loadFicha(f.id); document.getElementById("navFicha").click(); setTimeout(imprimirFicha, 250); };
    const delBtn = document.createElement("button"); delBtn.className = "btn danger"; delBtn.textContent = "Excluir";
    delBtn.onclick = async () => {
      if (!confirm('Excluir a ficha de "' + (f.clientNome || "cliente") + '"?')) return;
      await deleteDoc(doc(db, "fichas", f.id));
      if (f.clientId) await updateDoc(doc(db, "clients", f.clientId), { fichaId: null }).catch(() => {});
      toast("Ficha excluída");
    };
    btns.append(openBtn, printBtn, delBtn);
    row.appendChild(btns);
    list.appendChild(row);
  });
}

// ---------- Rascunho local (rede de segurança offline) ----------
function autosaveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...collect(), currentFichaId, currentClientId })); } catch (e) {}
}
function checkDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (!data?.fields || Object.values(data.fields).every(v => !v)) { localStorage.removeItem(DRAFT_KEY); return; }
    document.getElementById("draftBanner").classList.remove("hidden");
    document.getElementById("btnRestaurarRascunho").onclick = () => {
      apply(data);
      currentFichaId = data.currentFichaId || null;
      currentClientId = data.currentClientId || null;
      updateLinkBanner();
      document.getElementById("draftBanner").classList.add("hidden");
      toast("Rascunho restaurado.");
    };
    document.getElementById("btnDescartarRascunho").onclick = () => {
      localStorage.removeItem(DRAFT_KEY);
      document.getElementById("draftBanner").classList.add("hidden");
    };
  } catch (e) {}
}

export function initFicha({ onSaveLinkClient: cb, onOpenPainelClient: cb2 }) {
  onSaveLinkClient = cb;
  onOpenPainelClient = cb2;
  buildTabs();
  makeTables();
  showTab(0);
  updateLinkBanner();
  checkDraft();

  document.getElementById("btnNovaFicha").addEventListener("click", () => {
    if (confirm("Criar uma nova ficha? Dados não salvos na nuvem serão perdidos.")) newForm();
  });
  document.getElementById("btnSalvarNuvem").addEventListener("click", salvarNuvem);
  document.getElementById("btnSalvarLocal").addEventListener("click", salvarLocal);
  document.getElementById("btnImprimir").addEventListener("click", imprimirFicha);
  document.getElementById("btnExcluirFicha").addEventListener("click", excluirFicha);
  document.getElementById("btnLimparFicha").addEventListener("click", () => {
    if (confirm("Apagar todos os dados preenchidos nesta ficha (sem excluir da nuvem)?")) { clearFields(); toast("Campos limpos."); }
  });
  document.getElementById("btnProximaAba").addEventListener("click", nextTab);
  document.getElementById("btnAbaAnterior").addEventListener("click", prevTab);

  setInterval(autosaveDraft, 15000);
  fields().forEach(el => el.addEventListener("input", () => {
    const status = document.getElementById("fichaSyncStatus");
    if (!status.textContent.includes("não salvas")) setSyncStatus("", "Alterações não salvas na nuvem.");
  }));

  document.getElementById("fichasSearch").addEventListener("input", () => renderFichasList(window.__mpFichasCache || []));
  onSnapshot(collection(db, "fichas"), (snap) => {
    const all = [];
    snap.forEach(d => {
      const data = d.data();
      const ms = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : 0;
      all.push({ id: d.id, ...data, _updatedMs: ms });
    });
    window.__mpFichasCache = all;
    renderFichasList(all);
  }, (err) => { console.error(err); toast("Erro ao sincronizar fichas: " + err.message); });
}
