"use strict";
// Generador de .docx con ecuaciones nativas de Word (OMML), construido a mano
// sobre OOXML. Pipeline por fórmula: LaTeX -> MathML (MathJax) -> OMML (mathml2omml).
import { mml2omml } from "./lib/mathml2omml/mathml2omml.esm.js";

function escXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function esperarMathJax() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.MathJax && window.MathJax.tex2mml) resolve();
      else setTimeout(check, 50);
    };
    check();
  });
}

function segmentarTexto(texto) {
  const partes = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let last = 0, m;
  while ((m = re.exec(texto))) {
    if (m.index > last) partes.push({ tipo: "texto", valor: texto.slice(last, m.index) });
    const latex = m[1] !== undefined ? m[1] : m[2];
    partes.push({ tipo: "math", latex });
    last = re.lastIndex;
  }
  if (last < texto.length) partes.push({ tipo: "texto", valor: texto.slice(last) });
  return partes;
}

// mathml2omml no envuelve las matrices delimitadas (pmatrix, cases, vmatrix...) en
// <m:d> (el elemento OOXML de "delimitador" con paréntesis/llaves que escalan al alto
// del contenido). Sin él, Word dibuja paréntesis de tamaño fijo, y Google Docs no
// reconoce la matriz como un bloque y aplana sus filas en una sola. Aquí se detecta el
// patrón "texto-delimitador + <m:m>matriz</m:m> + texto-delimitador" que produce
// mml2omml y se reconstruye como un <m:d> real.
const PARES_DELIMITADOR = { "(": ")", "[": "]", "{": "", "|": "|" };

function envolverMatricesConDelimitadores(omml) {
  const re = /<m:r><m:t[^>]*>([([{|])<\/m:t><\/m:r>(<m:m>[\s\S]*?<\/m:m>)<m:r><m:t[^>]*>([)\]}|]?)<\/m:t><\/m:r>/g;
  return omml.replace(re, (whole, abre, matriz, cierra) => {
    if (PARES_DELIMITADOR[abre] !== cierra) return whole;
    const crecer = cierra === "" ? "<m:grow/>" : "";
    return `<m:d><m:dPr><m:begChr m:val="${abre}"/><m:endChr m:val="${cierra}"/>${crecer}</m:dPr><m:e>${matriz}</m:e></m:d>`;
  });
}

function latexAOmml(latex) {
  const mml = MathJax.tex2mml(latex);
  let omml = mml2omml(mml, { disableDecode: true });
  omml = omml.replace(/<m:sty m:val="undefined"\s*\/>/g, "");
  omml = envolverMatricesConDelimitadores(omml);
  return omml;
}

function runTexto(texto) {
  if (!texto) return "";
  return `<w:r><w:t xml:space="preserve">${escXml(texto)}</w:t></w:r>`;
}

function contenidoConMath(texto) {
  const partes = segmentarTexto(texto);
  let contenido = "";
  for (const parte of partes) {
    if (parte.tipo === "texto") {
      contenido += runTexto(parte.valor);
    } else {
      try {
        contenido += latexAOmml(parte.latex);
      } catch (e) {
        contenido += runTexto(parte.latex);
      }
    }
  }
  return contenido;
}

function parrafo(texto, pPr = "") {
  return `<w:p>${pPr}${contenidoConMath(texto)}</w:p>`;
}

function parrafoTitulo(texto, tam = 24) {
  const pPr = `<w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>`;
  return `<w:p>${pPr}<w:r><w:rPr><w:b/><w:sz w:val="${tam}"/></w:rPr><w:t xml:space="preserve">${escXml(texto)}</w:t></w:r></w:p>`;
}

function parrafoMeta(texto) {
  const pPr = `<w:pPr><w:spacing w:after="160"/></w:pPr>`;
  return `<w:p>${pPr}<w:r><w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="6B6B6B"/></w:rPr><w:t xml:space="preserve">${escXml(texto)}</w:t></w:r></w:p>`;
}

function parrafoCuerpo(texto) {
  const pPr = `<w:pPr><w:spacing w:after="120"/><w:jc w:val="both"/></w:pPr>`;
  return parrafo(texto, pPr);
}

function parrafoApartado(letra, texto) {
  const pPr = `<w:pPr><w:spacing w:after="100"/><w:ind w:left="420" w:hanging="420"/><w:jc w:val="both"/></w:pPr>`;
  const contenido = runTexto(`${letra}) `) + contenidoConMath(texto);
  return `<w:p>${pPr}${contenido}</w:p>`;
}

async function imagenComoParrafo(url, zip, indice, relsMap) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  const buf = await blob.arrayBuffer();
  const extOrig = (url.split(".").pop() || "png").toLowerCase();
  const ext = extOrig === "jpeg" ? "jpg" : extOrig;
  const nombre = `image${indice}.${ext}`;
  zip.file(`word/media/${nombre}`, buf);

  let wPx = 400, hPx = 300;
  try {
    const bitmap = await createImageBitmap(blob);
    wPx = bitmap.width;
    hPx = bitmap.height;
    bitmap.close && bitmap.close();
  } catch (e) {
    /* si falla, usamos proporción por defecto */
  }
  const maxEmuW = 4300000; // ~11.9cm
  const emuW = maxEmuW;
  const emuH = Math.round((hPx / wPx) * emuW);

  const rId = `rIdImg${indice}`;
  relsMap.push({
    id: rId,
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    target: `media/${nombre}`,
  });

  const pPr = `<w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr>`;
  const drawing = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
    <wp:extent cx="${emuW}" cy="${emuH}"/>
    <wp:docPr id="${indice}" name="Imagen${indice}"/>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:nvPicPr><pic:cNvPr id="${indice}" name="Imagen${indice}"/><pic:cNvPicPr/></pic:nvPicPr>
          <pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
          <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emuW}" cy="${emuH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:inline></w:drawing></w:r>`;
  return `<w:p>${pPr}${drawing}</w:p>`;
}

function formatBadge(p) {
  const conv = p.convocatoria === "ordinaria" ? "ord." : "extr.";
  return `${p.comunidad} (${p.universidad}) · ${p.anio} ${conv}`;
}

async function bloqueProblema(tituloTexto, problema, zip, relsMap, contadorImg) {
  let xml = "";
  xml += parrafoTitulo(tituloTexto, 22);
  xml += parrafoMeta(formatBadge(problema));
  if (problema.enunciado) xml += parrafoCuerpo(problema.enunciado);
  if (problema.apartados && problema.apartados.length) {
    problema.apartados.forEach((texto, i) => {
      xml += parrafoApartado(String.fromCharCode(97 + i), texto);
    });
  }
  if (problema.imagenes && problema.imagenes.length) {
    contadorImg.n += 1;
    xml += await imagenComoParrafo(problema.imagenes[0], zip, contadorImg.n, relsMap);
  }
  return xml;
}

async function generarBodyXml(examenActual, PLANTILLA, NOMBRE_COLECCION, zip, relsMap) {
  let xml = "";
  xml += parrafoTitulo("Prueba de Acceso a la Universidad — Matemáticas II", 28);
  xml += parrafoMeta(
    "Examen compuesto por problemas de distintas comunidades autónomas (convocatorias 2025–2026). " +
    "Consta de 5 ejercicios de 2 puntos cada uno: los ejercicios 1, 2 y 3 son obligatorios; " +
    "en los ejercicios 4 y 5 responde solo a una de las dos opciones propuestas."
  );

  const contadorImg = { n: 0 };
  for (const slot of PLANTILLA) {
    if (slot.tipo === "obligatorio") {
      const p = examenActual[slot.key];
      if (!p) continue;
      xml += await bloqueProblema(`${slot.label} — ${NOMBRE_COLECCION[slot.coleccion]} (2 puntos)`, p, zip, relsMap, contadorImg);
    } else {
      xml += parrafoTitulo(slot.titulo, 20);
      const letras = ["Opción A", "Opción B"];
      for (let i = 0; i < slot.opciones.length; i++) {
        const p = examenActual[slot.opciones[i]];
        if (!p) continue;
        xml += await bloqueProblema(letras[i], p, zip, relsMap, contadorImg);
      }
    }
  }
  return xml;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const RELS_ROOT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const CORE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Examen PAU Matemáticas II</dc:title>
  <dc:creator>Generador PAU Matemáticas II</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`;

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Generador de exámenes PAU</Application>
</Properties>`;

function documentXml(bodyXml) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function documentRelsXml(relsMap) {
  const rels = relsMap
    .map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

async function generarDocx(examenActual, PLANTILLA, NOMBRE_COLECCION) {
  await esperarMathJax();
  const zip = new JSZip();
  const relsMap = [];
  const bodyXml = await generarBodyXml(examenActual, PLANTILLA, NOMBRE_COLECCION, zip, relsMap);

  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS_ROOT);
  zip.file("docProps/core.xml", CORE_XML);
  zip.file("docProps/app.xml", APP_XML);
  zip.file("word/document.xml", documentXml(bodyXml));
  zip.file("word/_rels/document.xml.rels", documentRelsXml(relsMap));

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  return blob;
}

window.ExportDocx = { generar: generarDocx };
