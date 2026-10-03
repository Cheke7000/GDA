import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const db = getFirestore(initializeApp(firebaseConfig));
const SECCIONES = ["Todas", "Júbilo", "Alabanzas", "Coritos", "Adoración", "Himnos"];
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let uid = leer("gda_uid", null);
if (!uid) { uid = Math.random().toString(36).slice(2) + Date.now().toString(36); guardar("gda_uid", uid); }
let nombre = leer("gda_nombre", "");
let nombreCadena = leer("gda_nombre_cadena", "");
let canciones = [];
let filtro = "Todas";
let editando = null;
const ETQ = {
  i: ["Intro", "Ej: C – G – Am – F (acordes de la intro)"],
  p: ["Puente", "Ej: Cm – G – Ab, sube un tono"],
  s: ["Solo", "Ej: Solo de guitarra, Em – C – D"]
};

// Bloques de la cadena: {t:"c",id,letra?} canción · {t:"e",texto} encabezado · {t:"p",texto} puente · {t:"r",texto} ritmo
let bloques = leer("gda_bloques", null);
if (!bloques) bloques = leer("gda_cadena", []).map((id) => ({ t: "c", id }));
const salvar = () => guardar("gda_bloques", bloques);

function aviso(msg) {
  const a = $("aviso");
  a.textContent = msg;
  a.classList.add("ver");
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => a.classList.remove("ver"), 2400);
}
const porId = (id) => canciones.find((c) => c.id === id);

// ---------- Biblioteca ----------
function pintarChips() {
  $("chips").innerHTML = SECCIONES.map((s) => `<button class="chip ${s === filtro ? "on" : ""}" data-s="${s}">${s}</button>`).join("");
}
function pintarLista() {
  const q = norm($("buscar").value);
  const vis = canciones.filter((c) => (filtro === "Todas" || c.seccion === filtro) && (!q || norm(c.titulo + " " + c.letra).includes(q)));
  if (!vis.length) {
    $("lista").innerHTML = `<div class="vacio">${canciones.length ? "No hay canciones con ese filtro." : "Aún no hay canciones. Toca “Agregar canción” para subir la primera."}</div>`;
    return;
  }
  $("lista").innerHTML = vis.map((c) => `
    <article class="cancion" draggable="true" data-id="${c.id}" data-sec="${esc(c.seccion)}">
      <div class="fila">
        <div class="info">
          <strong>${esc(c.titulo)}</strong>
          <span class="meta"><span class="etq">${esc(c.seccion)}</span>${c.autor ? "Subida por " + esc(c.autor) : ""}</span>
        </div>
        <button class="mas" data-add="${c.id}" aria-label="Agregar ${esc(c.titulo)} a mi cadena">+</button>
      </div>
      <details><summary>Ver letra</summary><pre>${esc(c.letra)}</pre></details>
      <div class="acc">${c.uid === uid ? `<button class="borrar" data-del="${c.id}">Borrar mi canción</button>` : ""}</div>
    </article>`).join("");
}

// ---------- Cadena ----------
function pintarCadena() {
  let n = 0, html = "";
  bloques.forEach((b, i) => {
    const ctl = `<span class="ctl"><button data-act="up" data-i="${i}" aria-label="Subir">↑</button><button data-act="down" data-i="${i}" aria-label="Bajar">↓</button><button data-act="del" data-i="${i}" aria-label="Quitar">✕</button></span>`;
    if (b.t === "c") {
      const c = porId(b.id);
      if (!c) return;
      n++;
      const letra = b.letra ?? c.letra;
      html += `<div class="item" data-i="${i}" data-sec="${esc(c.seccion)}">
        <div class="cab"><span class="asa" title="Arrastrar">⠿</span><h3>${n}. ${esc(c.titulo)}</h3>${ctl}</div>
        ${editando === i
          ? `<textarea class="ed" rows="10" data-edl="${i}">${esc(letra)}</textarea>
             <div class="botones"><button data-act="ok" data-i="${i}" class="principal" style="width:auto">Listo</button>
             ${b.letra !== undefined ? `<button data-act="orig" data-i="${i}" class="suave">Restaurar original</button>` : ""}</div>`
          : `<pre>${esc(letra)}</pre>
             <div class="botones"><button data-act="edit" data-i="${i}">Editar letra${b.letra !== undefined ? " (editada)" : ""}</button></div>`}
      </div>`;
    } else if (b.t === "e") {
      html += `<div class="enc" data-i="${i}"><span class="asa" title="Arrastrar">⠿</span><input data-edt="${i}" value="${esc(b.texto)}" aria-label="Encabezado">${ctl}</div>`;
    } else if (b.t === "r") {
      html += `<div class="ritmo" data-i="${i}"><span class="asa" title="Arrastrar">⠿</span><span class="etq2">Cambio de ritmo:</span><input data-edt="${i}" value="${esc(b.texto)}" aria-label="Ritmo">${ctl}</div>`;
    } else if (ETQ[b.t]) {
      html += `<div class="puente t-${b.t}" data-i="${i}"><div class="cab"><span class="asa" title="Arrastrar">⠿</span><strong>${ETQ[b.t][0]}</strong>${ctl}</div>
        <textarea data-edt="${i}" rows="2" placeholder="${ETQ[b.t][1]}">${esc(b.texto)}</textarea></div>`;
    }
  });
  $("cuenta").textContent = n ? `(${n})` : "";
  $("cuenta2").textContent = n || "";
  $("zona").innerHTML = html || `<div class="vacio">Tu cadena está vacía. Arrastra una canción aquí o toca + en la biblioteca.</div>`;
}

function mover(de, a) {
  if (a < 0 || a >= bloques.length || de === a) return;
  bloques.splice(a, 0, bloques.splice(de, 1)[0]);
  editando = null;
}
function cambio() { salvar(); pintarCadena(); }

function lineas() {
  const out = [];
  let n = 0;
  bloques.forEach((b) => {
    if (b.t === "c") { const c = porId(b.id); if (c) out.push({ t: "c", n: ++n, titulo: c.titulo, letra: (b.letra ?? c.letra).trim() }); }
    else if ((b.texto || "").trim() || ETQ[b.t]) out.push({ t: b.t, texto: (b.texto || "").trim() });
  });
  return out;
}
const titulo = () => nombreCadena.trim() || "Cadena de alabanza";
function textoCadena() {
  const l = lineas();
  if (!l.length) return "";
  const cuerpo = l.map((x) =>
    x.t === "c" ? `${x.n}. ${x.titulo.toUpperCase()}\n\n${x.letra}`
    : x.t === "e" ? `===== ${x.texto.toUpperCase()} =====`
    : x.t === "r" ? `>> Cambio de ritmo: ${x.texto}`
    : `${ETQ[x.t][0].toUpperCase()}${x.texto ? ": " + x.texto : ""}`).join("\n\n");
  return `${titulo().toUpperCase()}\n\n${cuerpo}`;
}

// ---------- Eventos ----------
$("chips").addEventListener("click", (e) => { const s = e.target.dataset.s; if (s) { filtro = s; pintarChips(); pintarLista(); } });
$("buscar").addEventListener("input", pintarLista);
$("lista").addEventListener("click", async (e) => {
  const add = e.target.closest("[data-add]");
  const del = e.target.closest("[data-del]");
  if (add) { bloques.push({ t: "c", id: add.dataset.add }); cambio(); aviso("Agregada a tu cadena"); }
  if (del && confirm("¿Borrar esta canción para todos?")) {
    try { await deleteDoc(doc(db, "canciones", del.dataset.del)); } catch { aviso("No se pudo borrar. Revisa tu conexión."); }
  }
});

$("nombreCadena").value = nombreCadena;
$("nombreCadena").addEventListener("input", (e) => { nombreCadena = e.target.value; guardar("gda_nombre_cadena", nombreCadena); });

document.querySelector(".herram").addEventListener("click", (e) => {
  const v = e.target.closest("[data-nuevo]")?.dataset.nuevo;
  if (v) { const [t, texto] = v.split(":"); bloques.push({ t, texto }); cambio(); }
});
$("btnRitmo").onclick = () => { bloques.push({ t: "r", texto: $("selRitmo").value }); cambio(); };

// Arrastrar: desde la biblioteca y reordenar bloques con el asa ⠿ (computadora)
$("lista").addEventListener("dragstart", (e) => { const a = e.target.closest("[data-id]"); if (a) e.dataTransfer.setData("text/plain", a.dataset.id); });
const zona = $("zona");
zona.addEventListener("pointerdown", (e) => { const a = e.target.closest(".asa"); if (a) a.closest("[data-i]").draggable = true; });
zona.addEventListener("dragstart", (e) => { const b = e.target.closest("[data-i]"); if (b) e.dataTransfer.setData("text/plain", "b:" + b.dataset.i); });
zona.addEventListener("dragend", () => zona.querySelectorAll("[data-i]").forEach((b) => (b.draggable = false)));
zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("sobre"); });
zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
zona.addEventListener("drop", (e) => {
  e.preventDefault();
  zona.classList.remove("sobre");
  const d = e.dataTransfer.getData("text/plain");
  const obj = e.target.closest("[data-i]");
  const pos = obj ? +obj.dataset.i : bloques.length;
  if (d.startsWith("b:")) mover(+d.slice(2), Math.min(pos, bloques.length - 1));
  else if (porId(d)) bloques.splice(pos, 0, { t: "c", id: d });
  cambio();
});

zona.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.edt !== undefined) bloques[+t.dataset.edt].texto = t.value;
  if (t.dataset.edl !== undefined) bloques[+t.dataset.edl].letra = t.value;
  salvar();
});
zona.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const i = +b.dataset.i, a = b.dataset.act;
  if (a === "up") mover(i, i - 1);
  if (a === "down") mover(i, i + 1);
  if (a === "del") { bloques.splice(i, 1); editando = null; }
  if (a === "edit") editando = i;
  if (a === "ok") editando = null;
  if (a === "orig") { delete bloques[i].letra; editando = null; }
  cambio();
});

$("btnCopiar").onclick = async () => {
  const t = textoCadena();
  if (!t) return aviso("Tu cadena está vacía");
  try { await navigator.clipboard.writeText(t); aviso("Copiada. Pégala en WhatsApp"); } catch { aviso("No se pudo copiar. Usa Descargar TXT"); }
};
$("btnTxt").onclick = () => {
  const t = textoCadena();
  if (!t) return aviso("Tu cadena está vacía");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([t], { type: "text/plain;charset=utf-8" }));
  a.download = (norm(titulo()).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cadena") + ".txt";
  a.click();
  URL.revokeObjectURL(a.href);
};
function imprimir() {
  const l = lineas();
  if (!l.length) return aviso("Tu cadena está vacía");
  $("impresion").innerHTML = `<h1>${esc(titulo())}</h1>` + l.map((x) =>
    x.t === "c" ? `<section><h2>${x.n}. ${esc(x.titulo)}</h2><pre>${esc(x.letra)}</pre></section>`
    : x.t === "e" ? `<div class="enc-p">${esc(x.texto)}</div>`
    : x.t === "r" ? `<div class="rit-p">Cambio de ritmo: ${esc(x.texto)}</div>`
    : `<div class="pue-p">${ETQ[x.t][0]}${x.texto ? ": " + esc(x.texto) : ""}</div>`).join("");
  document.title = titulo(); // el PDF toma este nombre al guardar
  window.print();
  document.title = "Cadenas · Generación de Adoradores";
}

// ---------- PDF directo + Compartir ----------
async function cargarJsPdf() {
  if (!window.jspdf) {
    await new Promise((ok, fallo) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = ok; s.onerror = fallo;
      document.head.appendChild(s);
    });
  }
  return window.jspdf.jsPDF;
}
async function crearPdf(l) {
  const JsPDF = await cargarJsPdf();
  const pdf = new JsPDF({ unit: "mm", format: "letter" });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
  const M = 18, cx = W / 2, ancho = W - 2 * M;
  let y = M;
  const hueco = (h) => { if (y + h > H - M) { pdf.addPage(); y = M; } };
  const escribir = (txt, size, estilo, alto) => {
    pdf.setFont("times", estilo);
    pdf.setFontSize(size);
    String(txt).split("\n").forEach((raw) => {
      if (!raw.trim()) { y += alto * 0.6; return; }
      pdf.splitTextToSize(raw, ancho).forEach((ln) => {
        hueco(alto);
        pdf.text(ln, cx, y, { align: "center", baseline: "top" });
        y += alto;
      });
    });
  };
  escribir(titulo(), 22, "bold", 10);
  y += 4;
  l.forEach((x) => {
    if (x.t === "c") {
      y += 4; hueco(32);
      escribir(`${x.n}. ${x.titulo}`, 14, "bold", 7);
      y += 1;
      escribir(x.letra, 12, "normal", 5.8);
      y += 6;
    } else if (x.t === "e") {
      y += 6; hueco(22);
      pdf.setLineWidth(0.5);
      pdf.line(M, y, W - M, y); y += 3;
      escribir(x.texto.toUpperCase(), 14, "bold", 7);
      y += 1;
      pdf.line(M, y, W - M, y); y += 6;
    } else if (x.t === "r") {
      y += 2; escribir(`Cambio de ritmo: ${x.texto}`, 11, "italic", 5.5); y += 4;
    } else {
      y += 2; escribir(`${ETQ[x.t][0]}${x.texto ? ": " + x.texto : ""}`, 11, "italic", 5.5); y += 4;
    }
  });
  return pdf.output("blob");
}
async function compartirPdf() {
  const l = lineas();
  if (!l.length) return aviso("Tu cadena está vacía");
  aviso("Preparando PDF…");
  const nombreArchivo = (norm(titulo()).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cadena") + ".pdf";
  try {
    const blob = await crearPdf(l);
    const file = new File([blob], nombreArchivo, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: titulo() });
      return;
    }
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url; enlace.download = nombreArchivo;
    document.body.appendChild(enlace); enlace.click(); enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    if (e?.name === "AbortError") return; // el usuario cerró el menú de compartir
    console.error(e);
    aviso("No se pudo crear el PDF. Abriendo impresión…");
    setTimeout(imprimir, 900);
  }
}
$("btnPdf").onclick = compartirPdf;
$("btnImprimir").onclick = imprimir;
$("btnLimpiar").onclick = () => { if (bloques.length && confirm("¿Vaciar tu cadena?")) { bloques = []; editando = null; cambio(); } };

document.querySelector(".barra").addEventListener("click", (e) => {
  const v = e.target.closest("[data-ver]")?.dataset.ver;
  if (!v) return;
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("activo", p.id === v));
  document.querySelectorAll(".barra button").forEach((b) => b.classList.toggle("activo", b.dataset.ver === v));
  window.scrollTo(0, 0);
});

// Agregar canción
const dlg = $("dlg"), form = $("form");
function abrirDialogo() {
  form.reset();
  form.autor.value = nombre;
  dlg.showModal();
}
$("btnNuevaTop").onclick = abrirDialogo;
$("btnCancelar").onclick = () => dlg.close();
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(form);
  nombre = (f.get("autor") || "").trim();
  guardar("gda_nombre", nombre);
  try {
    await addDoc(collection(db, "canciones"), {
      titulo: f.get("titulo").trim(), seccion: f.get("seccion"), letra: f.get("letra").trim(),
      autor: nombre, uid, creado: serverTimestamp()
    });
    form.reset();
    dlg.close();
    aviso("Canción guardada para todos");
  } catch (err) {
    console.error(err);
    aviso("No se pudo guardar. Revisa tu conexión.");
  }
});

onSnapshot(collection(db, "canciones"), (snap) => {
  canciones = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
  pintarLista();
  pintarCadena();
}, (err) => {
  console.error(err);
  $("lista").innerHTML = `<div class="vacio">No se pudo conectar con la biblioteca. Revisa tu internet o la configuración de Firebase.</div>`;
});

pintarChips();
pintarLista();
pintarCadena();


// ---------- Modo en vivo (salas con código) ----------
const PARTES = ["Intro", "Estrofa 1", "Estrofa 2", "Estrofa 3", "Estrofa 4", "Estrofa 5", "Pre-coro", "Coro", "Puente", "Solo", "Solo de batería", "Final"];
const AVISOS = ["Repetir coro", "Subir un tono", "Bajar un tono", "Subir intensidad", "Bajar intensidad", "Solo bombo", "Solo voces", "Solo instrumentos"];
const CODIGO_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let sala = leer("gda_sala", null); // {rol:"dir"|"ver", codigo}
let botones = leer("gda_botones", []);
let cancIdx = 0, ahora = { cancion: "", parte: "" }, unsub = null, wake = null, avisoActual = "", ultimoAviso = "", avisosCus = leer("gda_avisos", []);
const vivo = $("vivo"), dir = $("dir");

const clave = (s) => { const k = norm(s).replace(/[\s-]/g, ""); return k === "estribillo" ? "coro" : k; };
// Busca en la letra el bloque que empieza con "CORO:", "ESTROFA 2:", etc.
function extraer(letra, parte) {
  const k = clave(String(parte).split(":")[0]);
  let cur = null, found = null;
  for (const ln of String(letra).split("\n")) {
    const m = ln.match(/^\s*(estrofa\s*\d+|pre[\s-]?coro|coro|estribillo|puente|intro|final)\s*:(.*)$/i);
    if (m) {
      cur = clave(m[1]) === k && !found ? (found = []) : null;
      if (cur && m[2].trim()) cur.push(m[2].trim());
    } else if (cur) cur.push(ln);
  }
  return found ? found.join("\n").trim().slice(0, 2900) : "";
}
const cancionesCadena = () => bloques.filter((b) => b.t === "c").map((b) => {
  const c = porId(b.id);
  return c ? { titulo: c.titulo, letra: b.letra ?? c.letra } : null;
}).filter(Boolean);

async function pantallaActiva() { try { wake = await navigator.wakeLock?.request("screen"); } catch {} }
function soltarPantalla() { try { wake?.release(); } catch {} wake = null; }

function abrirSala() {
  if (!sala) return;
  if ($("dlgVivo").open) $("dlgVivo").close();
  document.body.classList.add("enVivo");
  if (sala.rol === "dir") { dir.hidden = false; pintarDir(); }
  else { vivo.hidden = false; aplicarPrefs(); escuchar(); }
  pantallaActiva();
}
function salirSala() {
  unsub?.(); unsub = null; sala = null; guardar("gda_sala", null);
  vivo.hidden = true; dir.hidden = true;
  document.body.classList.remove("enVivo");
  soltarPantalla();
}

async function crearSala() {
  for (let n = 0; n < 5; n++) {
    const cod = Array.from({ length: 5 }, () => CODIGO_CHARS[Math.floor(Math.random() * CODIGO_CHARS.length)]).join("");
    try {
      if ((await getDoc(doc(db, "salas", cod))).exists()) continue;
      await setDoc(doc(db, "salas", cod), { titulo: titulo(), cancion: "", parte: "", texto: "", creado: serverTimestamp(), actualizado: serverTimestamp() });
      sala = { rol: "dir", codigo: cod };
      guardar("gda_sala", sala);
      cancIdx = 0; ahora = { cancion: "", parte: "" };
      return abrirSala();
    } catch (e) { console.error(e); return aviso("No se pudo crear la sala. Revisa las reglas de Firebase."); }
  }
}
async function unirse() {
  const cod = $("codigoSala").value.trim().toUpperCase();
  if (!cod) return aviso("Escribe el código de la sala");
  try {
    if (!(await getDoc(doc(db, "salas", cod))).exists()) return aviso("No existe esa sala");
    sala = { rol: "ver", codigo: cod };
    guardar("gda_sala", sala);
    abrirSala();
  } catch (e) { console.error(e); aviso("No se pudo conectar con la sala"); }
}

// Pantalla de quien mira
function escuchar() {
  unsub?.();
  unsub = onSnapshot(doc(db, "salas", sala.codigo), (s) => {
    const d = s.data() || {};
    $("vinfo").textContent = `Sala ${sala.codigo}` + (d.cancion ? ` · ${d.cancion}` : "");
    $("vparte").textContent = d.parte || d.cancion || "Esperando al director…";
    $("vparte").classList.toggle("final", /^final/i.test(d.parte || ""));
    $("vtexto").textContent = d.parte ? d.texto || "" : "";
    $("vcuerpo").scrollTop = 0;
    const av = d.aviso || "";
    $("vaviso").textContent = av;
    if (av && av !== ultimoAviso) { try { navigator.vibrate?.(200); } catch {} }
    ultimoAviso = av;
  }, () => aviso("Se perdió la conexión con la sala"));
}
function aplicarPrefs() {
  vivo.style.setProperty("--col", leer("gda_vcolor", "#ffffff"));
  vivo.style.setProperty("--f", leer("gda_vtam", 1));
}
vivo.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.c) { guardar("gda_vcolor", b.dataset.c); aplicarPrefs(); }
  if (b.id === "vmas" || b.id === "vmenos") {
    const t = Math.min(2, Math.max(0.5, +leer("gda_vtam", 1) + (b.id === "vmas" ? 0.15 : -0.15)));
    guardar("gda_vtam", +t.toFixed(2)); aplicarPrefs();
  }
  if (b.id === "vsalir") salirSala();
});

// Panel del director
function pintarDir() {
  const canc = cancionesCadena();
  dir.innerHTML = `
    <div class="dtop"><div><small>Código de la sala</small><strong class="cod">${sala.codigo}</strong></div><button id="dsalir">Salir</button></div>
    <p class="hint">Comparte el código. Los demás tocan “En vivo” → “Unirme”.</p>
    <h3>Canción actual</h3>
    <div class="dcanc">${canc.length ? canc.map((c, i) => `<button data-dc="${i}" class="${i === cancIdx ? "on" : ""}">${i + 1}. ${esc(c.titulo)}</button>`).join("")
      : `<p class="hint">Tu cadena no tiene canciones. Sal, arma la cadena y vuelve a crear la sala.</p>`}</div>
    <h3>Parte</h3>
    <div class="dpartes">${PARTES.map((p) => `<button data-p="${esc(p)}">${esc(p)}</button>`).join("")}
      ${botones.map((p, i) => `<span class="cus"><button data-p="${esc(p)}">${esc(p)}</button><button data-xc="${i}" aria-label="Quitar botón">✕</button></span>`).join("")}</div>
    <div class="dnuevo"><input id="cust" maxlength="60" placeholder="Botón nuevo (ej. Intro: Llegó el tiempo)"><button id="addCust">Agregar</button></div>
    <h3>Avisos para todos</h3>
    <div class="dpartes">${AVISOS.map((x) => `<button data-a="${esc(x)}" class="${x === avisoActual ? "on" : ""}">${esc(x)}</button>`).join("")}
      ${avisosCus.map((x, i) => `<span class="cus"><button data-a="${esc(x)}" class="${x === avisoActual ? "on" : ""}">${esc(x)}</button><button data-xa="${i}" aria-label="Quitar aviso">✕</button></span>`).join("")}</div>
    <div class="dnuevo"><input id="custA" maxlength="60" placeholder="Aviso nuevo (ej. Entra la trompeta)"><button id="addAviso">Agregar</button></div>
    <button id="dquitarAviso" class="suave">Quitar aviso</button>
    <button id="dlimpiar" class="suave">Pantalla en negro</button>
    <p id="dahora" class="hint">Ahora: ${esc(ahora.parte || ahora.cancion || "pantalla en negro")}</p>`;
}
async function enviarEstado(o) {
  ahora = { cancion: o.cancion, parte: o.parte };
  avisoActual = "";
  dir.querySelectorAll("[data-a]").forEach((b) => b.classList.remove("on"));
  const el = $("dahora");
  if (el) el.textContent = `Ahora: ${o.parte || o.cancion || "pantalla en negro"}`;
  dir.querySelectorAll("[data-p]").forEach((b) => b.classList.toggle("on", b.dataset.p === o.parte));
  try { await setDoc(doc(db, "salas", sala.codigo), { ...o, aviso: "", actualizado: serverTimestamp() }, { merge: true }); }
  catch (e) { console.error(e); aviso("No se pudo enviar. Revisa tu internet o las reglas."); }
}
async function enviarAviso(txt) {
  avisoActual = txt;
  dir.querySelectorAll("[data-a]").forEach((b) => b.classList.toggle("on", !!txt && b.dataset.a === txt));
  try { await setDoc(doc(db, "salas", sala.codigo), { aviso: txt, actualizado: serverTimestamp() }, { merge: true }); }
  catch (e) { console.error(e); aviso("No se pudo enviar el aviso."); }
}
dir.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (b.id === "dsalir") { if (confirm("¿Salir de la sala?")) salirSala(); return; }
  if (d.dc !== undefined) {
    cancIdx = +d.dc;
    dir.querySelectorAll("[data-dc]").forEach((x) => x.classList.toggle("on", x === b));
    enviarEstado({ cancion: cancionesCadena()[cancIdx]?.titulo || "", parte: "", texto: "" });
  }
  if (d.p !== undefined) {
    const c = cancionesCadena()[cancIdx];
    enviarEstado({ cancion: c?.titulo || ahora.cancion || "", parte: d.p, texto: c ? extraer(c.letra, d.p) : "" });
  }
  if (d.xc !== undefined) { botones.splice(+d.xc, 1); guardar("gda_botones", botones); pintarDir(); }
  if (b.id === "addCust") {
    const v = $("cust").value.trim();
    if (v) { botones.push(v); guardar("gda_botones", botones); pintarDir(); }
  }
  if (d.a !== undefined) enviarAviso(avisoActual === d.a ? "" : d.a);
  if (d.xa !== undefined) { avisosCus.splice(+d.xa, 1); guardar("gda_avisos", avisosCus); pintarDir(); }
  if (b.id === "addAviso") {
    const v = $("custA").value.trim();
    if (v) { avisosCus.push(v); guardar("gda_avisos", avisosCus); pintarDir(); }
  }
  if (b.id === "dquitarAviso") enviarAviso("");
  if (b.id === "dlimpiar") enviarEstado({ cancion: "", parte: "", texto: "" });
});

$("btnVivo").onclick = () => { if (sala) abrirSala(); else $("dlgVivo").showModal(); };
$("cerrarVivo").onclick = () => $("dlgVivo").close();
$("btnCrearSala").onclick = crearSala;
$("btnUnir").onclick = unirse;
if (sala) abrirSala();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

