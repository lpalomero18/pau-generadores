"use strict";
// Genera un documento .tex listo para compilar (pdflatex/xelatex).
// El campo enunciado/apartados ya contiene LaTeX válido dentro de $...$/$$...$$,
// así que solo hay que escapar los caracteres especiales del texto plano.

function escLatex(s) {
  // [ ] se escapan también: si un apartado empieza por "[..]" (p. ej. una nota de
  // puntuación) justo tras \item, LaTeX lo interpretaría como su argumento opcional.
  return String(s).replace(/[\\&%$#_{}~^[\]]/g, (c) => {
    switch (c) {
      case "\\": return "\\textbackslash{}";
      case "~": return "\\textasciitilde{}";
      case "^": return "\\textasciicircum{}";
      case "[": return "{[}";
      case "]": return "{]}";
      default: return "\\" + c;
    }
  });
}

function segmentarYEscapar(texto) {
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let out = "", last = 0, m;
  while ((m = re.exec(texto))) {
    if (m.index > last) out += escLatex(texto.slice(last, m.index));
    if (m[1] !== undefined) out += `$${m[1]}$`;
    else out += `$${m[2]}$`;
    last = re.lastIndex;
  }
  if (last < texto.length) out += escLatex(texto.slice(last));
  return out;
}

function formatBadge(p) {
  const conv = p.convocatoria === "ordinaria" ? "ord." : "extr.";
  return `${p.comunidad} (${p.universidad}) · ${p.anio} ${conv}`;
}

function bloqueProblema(tituloTexto, problema, imagenesUsadas) {
  let tex = `\\subsection*{${escLatex(tituloTexto)}}\n`;
  tex += `{\\small\\itshape ${escLatex(formatBadge(problema))}}\n\n`;
  if (problema.enunciado) tex += segmentarYEscapar(problema.enunciado) + "\n\n";
  if (problema.apartados && problema.apartados.length) {
    tex += "\\begin{enumerate}[label=\\alph*)]\n";
    for (const texto of problema.apartados) {
      tex += `\\item ${segmentarYEscapar(texto)}\n`;
    }
    tex += "\\end{enumerate}\n\n";
  }
  if (problema.imagenes && problema.imagenes.length) {
    const ruta = problema.imagenes[0];
    imagenesUsadas.push(ruta);
    tex += `\\begin{center}\n\\includegraphics[width=0.7\\linewidth]{${ruta}}\n\\end{center}\n\n`;
  }
  return tex;
}

function generarLatex(examenActual, PLANTILLA, NOMBRE_COLECCION) {
  const imagenesUsadas = [];
  let cuerpo = "";
  for (const slot of PLANTILLA) {
    if (slot.tipo === "obligatorio") {
      const p = examenActual[slot.key];
      if (!p) continue;
      cuerpo += bloqueProblema(`${slot.label} --- ${NOMBRE_COLECCION[slot.coleccion]} (2 puntos)`, p, imagenesUsadas);
    } else {
      cuerpo += `\\subsection*{${escLatex(slot.titulo)}}\n\n`;
      const letras = ["Opción A", "Opción B"];
      slot.opciones.forEach((opKey, i) => {
        const p = examenActual[opKey];
        if (!p) return;
        cuerpo += bloqueProblema(letras[i], p, imagenesUsadas);
      });
    }
  }

  const notaImagenes = imagenesUsadas.length
    ? `% Este examen usa ${imagenesUsadas.length} figura(s). Si has descargado el .zip, la carpeta\n% "img/" ya está junto a este archivo y \\includegraphics las encontrará directamente.\n`
    : "";

  const tex = `% Generado automáticamente por el mezclador de exámenes PAU Matemáticas II
${notaImagenes}\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[spanish]{babel}
\\usepackage{amsmath,amssymb}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{enumitem}
\\usepackage{graphicx}
\\usepackage{parskip}

\\title{Prueba de Acceso a la Universidad --- Matemáticas II}
\\date{}
\\author{}

\\begin{document}
\\maketitle

\\noindent Examen compuesto por problemas de distintas comunidades autónomas (convocatorias 2025--2026).
Consta de 5 ejercicios de 2 puntos cada uno: los ejercicios 1, 2 y 3 son obligatorios;
en los ejercicios 4 y 5 responde solo a una de las dos opciones propuestas.

\\bigskip

${cuerpo}
\\end{document}
`;
  return { tex, imagenes: imagenesUsadas };
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

async function descargarLatex(examenActual, PLANTILLA, NOMBRE_COLECCION) {
  const { tex, imagenes } = generarLatex(examenActual, PLANTILLA, NOMBRE_COLECCION);

  if (!imagenes.length) {
    descargarBlob("examen-pau-matematicas-ii.tex", new Blob([tex], { type: "application/x-tex" }));
    return;
  }

  const zip = new JSZip();
  zip.file("examen-pau-matematicas-ii.tex", tex);
  const rutasUnicas = [...new Set(imagenes)];
  await Promise.all(
    rutasUnicas.map(async (ruta) => {
      const resp = await fetch(ruta);
      const blob = await resp.blob();
      zip.file(ruta, blob); // ruta ya es "img/xxx.png", coincide con \includegraphics
    })
  );
  const blobZip = await zip.generateAsync({ type: "blob", mimeType: "application/zip" });
  descargarBlob("examen-pau-matematicas-ii.zip", blobZip);
}

window.ExportLatex = {
  generar: (examenActual, PLANTILLA, NOMBRE_COLECCION) =>
    generarLatex(examenActual, PLANTILLA, NOMBRE_COLECCION).tex,
  descargar: descargarLatex,
};
