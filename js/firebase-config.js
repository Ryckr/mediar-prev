// =====================================================================
// CONFIGURAÇÃO DO FIREBASE — MediarPrev
// =====================================================================
// Troque os valores abaixo pelos dados do SEU projeto Firebase.
// Você encontra isso em: Firebase Console > Configurações do projeto
// > Seus apps > app Web (ícone </>) > "Configuração do SDK".
//
// Esses valores (apiKey, authDomain etc.) NÃO são segredo — eles apenas
// identificam o projeto. Quem realmente protege os dados são as REGRAS
// do Firestore (arquivo firestore.rules) e a lista de usuários
// autorizados (coleção allowed_users). Veja o README.md.
// =====================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAt9GqaPwl8Okb7ZOrvpky7d42zR6N6-ds",
  authDomain: "mediarprev-60dc8.firebaseapp.com",
  projectId: "mediarprev-60dc8",
  storageBucket: "mediarprev-60dc8.firebasestorage.app",
  messagingSenderId: "587139683168",
  appId: "1:587139683168:web:1d2b0ad5a4ca6f47168405",
  measurementId: "G-QEKSBGDW0E"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
