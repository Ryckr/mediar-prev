// =====================================================================
// AUTENTICAÇÃO E CONTROLE DE ACESSO — MediarPrev
// =====================================================================
// Login por e-mail/senha (Firebase Authentication) + verificação de
// que o usuário está na lista de autorizados (coleção allowed_users).
// Isso garante que só "algumas pessoas" (as que você autorizar
// manualmente) conseguem abrir o sistema, mesmo que descubram o link.
// =====================================================================

import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let currentUser = null;
let readyCallback = null;

export function getCurrentUser() {
  return currentUser;
}

// Chamado uma vez pelo app.js. onReady(user) só dispara quando o login
// foi validado E o usuário está na allowlist.
export function onReady(callback) {
  readyCallback = callback;
}

function showLoginError(msg) {
  const box = document.getElementById("loginError");
  box.textContent = msg;
  box.classList.add("show");
}
function hideLoginError() {
  document.getElementById("loginError").classList.remove("show");
}

async function checkAllowlist(user) {
  try {
    const ref = doc(db, "allowed_users", user.uid);
    const snap = await getDoc(ref);
    return snap.exists() && snap.data().active === true;
  } catch (e) {
    console.error("Falha ao verificar autorização:", e);
    return false;
  }
}

function setLoginLoading(loading) {
  const btn = document.getElementById("btnLogin");
  btn.disabled = loading;
  btn.textContent = loading ? "Entrando..." : "Entrar";
}

async function handleLoginSubmit(evt) {
  evt.preventDefault();
  hideLoginError();
  const email = document.getElementById("loginEmail").value.trim();
  const senha = document.getElementById("loginSenha").value;
  if (!email || !senha) { showLoginError("Informe e-mail e senha."); return; }
  setLoginLoading(true);
  try {
    // Sessão expira ao fechar o navegador — mais seguro para uso
    // compartilhado/posto de atendimento.
    await setPersistence(auth, browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, senha);
    // onAuthStateChanged cuida do resto (verificação de allowlist).
  } catch (e) {
    setLoginLoading(false);
    const map = {
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/invalid-email": "E-mail inválido.",
      "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
      "auth/user-disabled": "Este usuário foi desativado."
    };
    showLoginError(map[e.code] || "Não foi possível entrar. Verifique os dados e tente novamente.");
  }
}

export function initAuth() {
  document.getElementById("loginForm").addEventListener("submit", handleLoginSubmit);
  document.getElementById("btnLogout").addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUser = null;
      document.getElementById("loginScreen").classList.remove("hidden");
      document.getElementById("appShell").classList.remove("show");
      setLoginLoading(false);
      return;
    }
    const allowed = await checkAllowlist(user);
    if (!allowed) {
      showLoginError("Este e-mail não está autorizado a acessar o sistema. Fale com o administrador.");
      await signOut(auth);
      setLoginLoading(false);
      return;
    }
    currentUser = user;
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("appShell").classList.add("show");
    document.getElementById("sessionEmail").textContent = user.email;
    setLoginLoading(false);
    if (readyCallback) readyCallback(user);
  });
}
