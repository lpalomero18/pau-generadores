"use strict";

const NOMBRE_COLECCION = {
  algebra: "Álgebra",
  analisis: "Análisis",
  programacion_lineal: "Programación Lineal",
  probabilidad: "Probabilidad y Estadística",
};

// Estructura fija del examen: 3 ejercicios obligatorios + 2 bloques optativos.
const PLANTILLA = [
  { key: "ej1", label: "Ejercicio 1", coleccion: "algebra", tipo: "obligatorio" },
  { key: "ej2", label: "Ejercicio 2", coleccion: "analisis", tipo: "obligatorio" },
  { key: "ej3", label: "Ejercicio 3", coleccion: "programacion_lineal", tipo: "obligatorio" },
  {
    key: "ej4", label: "Ejercicio 4", coleccion: "probabilidad", tipo: "bloque",
    titulo: "Ejercicio 4 — Probabilidad y Estadística (elige una opción, 2 puntos)",
    opciones: ["ej4a", "ej4b"],
  },
  {
    key: "ej5", label: "Ejercicio 5", coleccion: "analisis", tipo: "bloque",
    titulo: "Ejercicio 5 — Análisis (elige una opción, 2 puntos)",
    opciones: ["ej5a", "ej5b"],
  },
];

let BANCO = [];
let examenActual = {}; // slotKey -> problema

function agruparPorColeccion(banco) {
  const mapa = {};
  for (const p of banco) (mapa[p.coleccion] ??= []).push(p);
  return mapa;
}

function elegirProblema(porColeccion, coleccion, idsUsados, comunidadesUsadas) {
  const pool = porColeccion[coleccion].filter((p) => !idsUsados.has(p.id));
  const preferido = pool.filter((p) => !comunidadesUsadas.has(p.comunidad));
  const candidatos = preferido.length ? preferido : pool;
  if (!candidatos.length) return null;
  return candidatos[Math.floor(Math.random() * candidatos.length)];
}

function generarExamen() {
  const porColeccion = agruparPorColeccion(BANCO);
  const idsUsados = new Set();
  const comunidadesUsadas = new Set();
  const nuevoExamen = {};

  const slotsAPoblar = [];
  for (const slot of PLANTILLA) {
    if (slot.tipo === "obligatorio") slotsAPoblar.push({ key: slot.key, coleccion: slot.coleccion });
    else for (const opKey of slot.opciones) slotsAPoblar.push({ key: opKey, coleccion: slot.coleccion });
  }

  for (const { key, coleccion } of slotsAPoblar) {
    const p = elegirProblema(porColeccion, coleccion, idsUsados, comunidadesUsadas);
    if (p) {
      nuevoExamen[key] = p;
      idsUsados.add(p.id);
      comunidadesUsadas.add(p.comunidad);
    }
  }
  examenActual = nuevoExamen;
  renderExamen();
}

function recambiarSlot(slotKey, coleccion) {
  const porColeccion = agruparPorColeccion(BANCO);
  const idsUsados = new Set(Object.values(examenActual).map((p) => p.id));
  const comunidadesUsadas = new Set(Object.values(examenActual).map((p) => p.comunidad));
  idsUsados.delete(examenActual[slotKey]?.id);
  const nuevo = elegirProblema(porColeccion, coleccion, idsUsados, comunidadesUsadas);
  if (!nuevo) return;
  examenActual[slotKey] = nuevo;
  renderExamen();
}

function formatBadge(p) {
  const conv = p.convocatoria === "ordinaria" ? "ord." : "extr.";
  return `${p.comunidad} (${p.universidad}) · ${p.anio} ${conv}`;
}

function crearNodoProblema(tituloTexto, problema, slotKey, coleccionParaRecambio) {
  const tpl = document.getElementById("tpl-problema");
  const nodo = tpl.content.cloneNode(true);
  const seccion = nodo.querySelector(".problema");
  nodo.querySelector(".problema-titulo").textContent = tituloTexto;
  nodo.querySelector(".problema-meta").textContent = formatBadge(problema);

  const cuerpo = nodo.querySelector(".problema-cuerpo");
  if (problema.enunciado) {
    const p = document.createElement("p");
    p.textContent = problema.enunciado;
    cuerpo.appendChild(p);
  }
  if (problema.apartados && problema.apartados.length) {
    const lista = document.createElement("ol");
    lista.className = "problema-apartados";
    for (const texto of problema.apartados) {
      const li = document.createElement("li");
      li.textContent = texto;
      lista.appendChild(li);
    }
    cuerpo.appendChild(lista);
  }

  const img = nodo.querySelector(".problema-figura");
  if (problema.imagenes && problema.imagenes.length) {
    img.src = problema.imagenes[0];
    img.hidden = false;
  }

  const btn = nodo.querySelector(".btn-recambiar");
  btn.addEventListener("click", () => recambiarSlot(slotKey, coleccionParaRecambio));

  seccion.dataset.slot = slotKey;
  return nodo;
}

function renderExamen() {
  const main = document.getElementById("examen");
  main.innerHTML = "";

  const cabecera = document.createElement("div");
  cabecera.className = "examen-cabecera";
  cabecera.innerHTML = `
    <h2>Prueba de Acceso a la Universidad — Matemáticas CCSS II</h2>
    <p class="examen-instrucciones">
      Examen compuesto por problemas de distintas comunidades autónomas (convocatorias 2025–2026).
      Consta de 5 ejercicios de 2 puntos cada uno: los ejercicios 1, 2 y 3 son obligatorios;
      en los ejercicios 4 y 5 responde solo a una de las dos opciones propuestas.
    </p>`;
  main.appendChild(cabecera);

  for (const slot of PLANTILLA) {
    if (slot.tipo === "obligatorio") {
      const p = examenActual[slot.key];
      if (!p) continue;
      main.appendChild(
        crearNodoProblema(`${slot.label} — ${NOMBRE_COLECCION[slot.coleccion]} (2 puntos)`, p, slot.key, slot.coleccion)
      );
    } else {
      const tituloBloque = document.createElement("div");
      tituloBloque.className = "bloque-titulo";
      tituloBloque.textContent = slot.titulo;
      main.appendChild(tituloBloque);

      const letras = ["Opción A", "Opción B"];
      slot.opciones.forEach((opKey, i) => {
        const p = examenActual[opKey];
        if (!p) return;
        main.appendChild(crearNodoProblema(letras[i], p, opKey, slot.coleccion));
      });
    }
  }

  if (window.renderMathInElement) {
    renderMathInElement(main, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
  }
}

async function descargarPDF() {
  const boton = document.getElementById("btn-pdf");
  const textoOriginal = boton.textContent;
  boton.textContent = "Generando PDF…";
  boton.disabled = true;
  try {
    const el = document.getElementById("examen");
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = 210;
    const pageHeight = 297;
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    const imgData = canvas.toDataURL("image/png");

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save("examen-pau-matematicas-ccss-ii.pdf");
  } finally {
    boton.textContent = textoOriginal;
    boton.disabled = false;
  }
}

async function conBotonOcupado(boton, textoOcupado, accion) {
  const textoOriginal = boton.textContent;
  boton.textContent = textoOcupado;
  boton.disabled = true;
  try {
    await accion();
  } catch (e) {
    console.error(e);
    alert(`Ha ocurrido un error: ${e.message}`);
  } finally {
    boton.textContent = textoOriginal;
    boton.disabled = false;
  }
}

function descargarBlob(nombre, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function descargarDOCX() {
  const boton = document.getElementById("btn-docx");
  await conBotonOcupado(boton, "Generando DOCX…", async () => {
    const blob = await window.ExportDocx.generar(examenActual, PLANTILLA, NOMBRE_COLECCION);
    descargarBlob("examen-pau-matematicas-ccss-ii.docx", blob);
  });
}

async function descargarLatex() {
  const boton = document.getElementById("btn-latex");
  await conBotonOcupado(boton, "Generando LaTeX…", async () => {
    await window.ExportLatex.descargar(examenActual, PLANTILLA, NOMBRE_COLECCION);
  });
}

async function guardarEnDrive() {
  const boton = document.getElementById("btn-drive");
  await conBotonOcupado(boton, "Guardando en Drive…", async () => {
    const resultado = await window.ExportDrive.guardar(examenActual, PLANTILLA, NOMBRE_COLECCION);
    if (resultado) alert("Examen guardado en tu Google Drive.");
  });
}

function iniciarMenuExportar() {
  const toggle = document.getElementById("btn-exportar-toggle");
  const menu = document.getElementById("menu-exportar-opciones");
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  menu.addEventListener("click", () => { menu.hidden = true; });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== toggle) menu.hidden = true;
  });
}

async function iniciar() {
  const resp = await fetch("problems.json");
  const datos = await resp.json();
  BANCO = datos.problemas;
  generarExamen();
  document.getElementById("btn-nuevo").addEventListener("click", generarExamen);
  document.getElementById("btn-pdf").addEventListener("click", descargarPDF);
  document.getElementById("btn-docx").addEventListener("click", descargarDOCX);
  document.getElementById("btn-latex").addEventListener("click", descargarLatex);
  document.getElementById("btn-drive").addEventListener("click", guardarEnDrive);
  iniciarMenuExportar();
}

iniciar();
