import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const db = getFirestore(initializeApp(firebaseConfig));
const SECCIONES = ["Todas", "Coritos", "Júbilo", "Adoración", "Antiguas"];
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Almacenamiento local (solo conveniencias de este dispositivo)
const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let uid = leer("gda_uid", null);
if (!uid) { uid = Math.random().toString(36).slice(2) + Date.now().toString(36); guardar("gda_uid", uid); }
let nombre = leer("gda_nombre", "");
let canciones = [];
let cadena = leer("gda_cadena", []);
let filtro = "Todas";

function aviso(msg) {
  const a = $("aviso");
  a.textContent = msg;
  a.classList.add("ver");
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => a.classList.remove("ver"), 2400);
}

// ---------- Biblioteca ----------
function pintarChips() {
  $("chips").innerHTML = SECCIONES.map((s) => `<button class="chip ${s === filtro ? "on" : ""}" data-s="${s}">${s}</button>`).join("");
}

function pintarLista() {
  const q = norm($("buscar").value);
  const vis = canciones.filter((c) =>
    (filtro === "Todas" || c.seccion === filtro) && (!q || norm(c.titulo + " " + c.letra).includes(q)));
  if (!vis.length) {
    $("lista").innerHTML = `<div class="vacio">${canciones.length ? "No hay canciones con ese filtro." : "Aún no hay canciones. Toca “Agregar canción” para subir la primera."}</div>`;
    return;
  }
  $("lista").innerHTML = vis.map((c) => `
    <article class="cancion" draggable="true" data-id="${c.id}">
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
const porId = (id) => canciones.find((c) => c.id === id);

function pintarCadena() {
  const items = cadena.map((id, i) => ({ c: porId(id), i })).filter((x) => x.c);
  $("cuenta").textContent = items.length ? `(${items.length})` : "";
  $("cuenta2").textContent = items.length || "";
  $("zona").innerHTML = items.length
    ? items.map(({ c, i }) => `
      <div class="item">
        <h3>${i + 1}. ${esc(c.titulo)}</h3>
        <pre>${esc(c.letra)}</pre>
        <div class="botones">
          <button data-up="${i}" aria-label="Subir">Subir</button>
          <button data-down="${i}" aria-label="Bajar">Bajar</button>
          <button data-quitar="${i}" class="suave">Quitar</button>
        </div>
      </div>`).join("")
    : `<div class="vacio">Tu cadena está vacía. Arrastra una canción aquí o toca + en la biblioteca.</div>`;
}

function agregar(id) {
  cadena.push(id);
  guardar("gda_cadena", cadena);
  pintarCadena();
  aviso("Agregada a tu cadena");
}

function textoCadena() {
  return cadena.map(porId).filter(Boolean)
    .map((c, i) => `${i + 1}. ${c.titulo.toUpperCase()}\n\n${c.letra.trim()}`)
    .join("\n\n----------\n\n");
}

// ---------- Eventos ----------
$("chips").addEventListener("click", (e) => {
  const s = e.target.dataset.s;
  if (s) { filtro = s; pintarChips(); pintarLista(); }
});
$("buscar").addEventListener("input", pintarLista);

$("lista").addEventListener("click", async (e) => {
  const add = e.target.closest("[data-add]");
  const del = e.target.closest("[data-del]");
  if (add) agregar(add.dataset.add);
  if (del && confirm("¿Borrar esta canción para todos?")) {
    try { await deleteDoc(doc(db, "canciones", del.dataset.del)); } catch { aviso("No se pudo borrar. Revisa tu conexión."); }
  }
});

// Arrastrar y soltar (computadora)
$("lista").addEventListener("dragstart", (e) => {
  const a = e.target.closest("[data-id]");
  if (a) e.dataTransfer.setData("text/plain", a.dataset.id);
});
const zona = $("zona");
zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("sobre"); });
zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
zona.addEventListener("drop", (e) => {
  e.preventDefault();
  zona.classList.remove("sobre");
  const id = e.dataTransfer.getData("text/plain");
  if (porId(id)) agregar(id);
});

zona.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.quitar !== undefined) cadena.splice(+d.quitar, 1);
  if (d.up !== undefined && +d.up > 0) [cadena[+d.up - 1], cadena[+d.up]] = [cadena[+d.up], cadena[+d.up - 1]];
  if (d.down !== undefined && +d.down < cadena.length - 1) [cadena[+d.down + 1], cadena[+d.down]] = [cadena[+d.down], cadena[+d.down + 1]];
  guardar("gda_cadena", cadena);
  pintarCadena();
});

$("btnCopiar").onclick = async () => {
  const t = textoCadena();
  if (!t) return aviso("Tu cadena está vacía");
  try { await navigator.clipboard.writeText(t); aviso("Copiada. Pégala en WhatsApp"); }
  catch { aviso("No se pudo copiar. Usa Descargar TXT"); }
};
$("btnTxt").onclick = () => {
  const t = textoCadena();
  if (!t) return aviso("Tu cadena está vacía");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([t], { type: "text/plain;charset=utf-8" }));
  a.download = "cadena-alabanza.txt";
  a.click();
  URL.revokeObjectURL(a.href);
};
$("btnPdf").onclick = () => {
  const items = cadena.map(porId).filter(Boolean);
  if (!items.length) return aviso("Tu cadena está vacía");
  $("impresion").innerHTML = `<h1>Cadena de alabanza</h1>` +
    items.map((c, i) => `<section><h2>${i + 1}. ${esc(c.titulo)}</h2><pre>${esc(c.letra)}</pre></section>`).join("");
  window.print(); // En el diálogo elige “Guardar como PDF”
};
$("btnLimpiar").onclick = () => {
  if (cadena.length && confirm("¿Vaciar tu cadena?")) { cadena = []; guardar("gda_cadena", cadena); pintarCadena(); }
};

// Navegación inferior (móvil)
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
      titulo: f.get("titulo").trim(),
      seccion: f.get("seccion"),
      letra: f.get("letra").trim(),
      autor: nombre,
      uid,
      creado: serverTimestamp()
    });
    form.reset();
    dlg.close();
    aviso("Canción guardada para todos");
  } catch (err) {
    console.error(err);
    aviso("No se pudo guardar. Revisa tu conexión.");
  }
});

// Canciones compartidas en tiempo real
onSnapshot(collection(db, "canciones"), (snap) => {
  canciones = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
  pintarLista();
  pintarCadena();
}, (err) => {
  console.error(err);
  $("lista").innerHTML = `<div class="vacio">No se pudo conectar con la biblioteca. Revisa tu internet o la configuración de Firebase.</div>`;
});

pintarChips();
pintarLista();
pintarCadena();
