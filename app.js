import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, serverTimestamp
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
      ${c.uid === uid ? `<button class="borrar" data-del="${c.id}">Borrar mi canción</button>` : ""}
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
    } else if (b.t === "p") {
      html += `<div class="puente" data-i="${i}"><div class="cab"><span class="asa" title="Arrastrar">⠿</span><strong>Puente</strong>${ctl}</div>
        <textarea data-edt="${i}" rows="2" placeholder="Ej: Cm – G – Ab, sube un tono">${esc(b.texto)}</textarea></div>`;
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
    else if ((b.texto || "").trim() || b.t === "p") out.push({ t: b.t, texto: (b.texto || "").trim() });
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
    : `PUENTE: ${x.texto}`).join("\n\n");
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
$("btnPdf").onclick = () => {
  const l = lineas();
  if (!l.length) return aviso("Tu cadena está vacía");
  $("impresion").innerHTML = `<h1>${esc(titulo())}</h1>` + l.map((x) =>
    x.t === "c" ? `<section><h2>${x.n}. ${esc(x.titulo)}</h2><pre>${esc(x.letra)}</pre></section>`
    : x.t === "e" ? `<div class="enc-p">${esc(x.texto)}</div>`
    : x.t === "r" ? `<div class="rit-p">Cambio de ritmo: ${esc(x.texto)}</div>`
    : `<div class="pue-p">Puente: ${esc(x.texto)}</div>`).join("");
  document.title = titulo(); // el PDF toma este nombre al guardar
  window.print();           // En el diálogo elige “Guardar como PDF”
  document.title = "Cadenas · Generación de Adoradores";
};
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
$("btnNueva").onclick = () => { form.autor.value = nombre; dlg.showModal(); };
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
