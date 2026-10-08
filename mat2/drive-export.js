"use strict";
// Guarda el examen en el Google Drive DEL VISITANTE (no en el del dueño de la web).
// Usa Google Identity Services (OAuth en el navegador, sin servidor) con el scope
// "drive.file", que solo da acceso a los archivos que la propia app crea.
//
// OAuth Client ID de tipo "Aplicación web" (Google Cloud Console). El dominio desde
// el que se sirva esta web debe estar en "Orígenes de JavaScript autorizados" de este
// client ID, y la API de Google Drive debe estar habilitada en el mismo proyecto.
const GOOGLE_CLIENT_ID = "1081871522161-4i5nukaurpavsak1mgr6c1rrrqeg5q41.apps.googleusercontent.com";

let tokenClient = null;
let tokenActual = null;

function clienteConfigurado() {
  return GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith("TU_CLIENT_ID");
}

function obtenerTokenClient() {
  if (tokenClient) return tokenClient;
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    throw new Error("Google Identity Services no se ha cargado todavía.");
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: "https://www.googleapis.com/auth/drive.file",
    callback: () => {}, // se sobreescribe por petición
  });
  return tokenClient;
}

function pedirAccessToken() {
  return new Promise((resolve, reject) => {
    const client = obtenerTokenClient();
    client.callback = (resp) => {
      if (resp.error) reject(new Error(resp.error));
      else {
        tokenActual = resp.access_token;
        resolve(resp.access_token);
      }
    };
    client.requestAccessToken({ prompt: tokenActual ? "" : "consent" });
  });
}

async function subirArchivo(nombre, blob, mimeType, accessToken) {
  const metadata = { name: nombre, mimeType };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob);

  const resp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );
  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`Error de Google Drive (${resp.status}): ${texto}`);
  }
  return resp.json();
}

async function guardarEnDrive(examenActual, PLANTILLA, NOMBRE_COLECCION) {
  if (!clienteConfigurado()) {
    alert(
      "Guardar en Google Drive todavía no está configurado.\n\n" +
      "El dueño de esta web debe crear un OAuth Client ID en Google Cloud Console " +
      "y añadirlo en web/drive-export.js (constante GOOGLE_CLIENT_ID)."
    );
    return;
  }
  const accessToken = await pedirAccessToken();
  const blob = await window.ExportDocx.generar(examenActual, PLANTILLA, NOMBRE_COLECCION);
  const resultado = await subirArchivo(
    "examen-pau-matematicas-ii.docx",
    blob,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    accessToken
  );
  return resultado;
}

window.ExportDrive = { guardar: guardarEnDrive, configurado: clienteConfigurado };
