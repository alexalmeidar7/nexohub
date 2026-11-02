const profiles = {
  tv: [
    { id:"android-tv", name:"Android TV / Google TV", w:1920,h:1080,ratio:"16:9",brand:"ANDROID TV" },
    { id:"fire-tv", name:"Amazon Fire TV", w:1920,h:1080,ratio:"16:9",brand:"FIRE TV" },
    { id:"webos", name:"LG webOS TV", w:1920,h:1080,ratio:"16:9",brand:"LG webOS · VIEWPORT" },
    { id:"tizen", name:"Samsung Tizen TV", w:1920,h:1080,ratio:"16:9",brand:"SAMSUNG TIZEN · VIEWPORT" },
    { id:"tv-hd", name:"TV HD", w:1280,h:720,ratio:"16:9",brand:"HD TV" },
    { id:"tv-4k", name:"TV 4K UHD", w:3840,h:2160,ratio:"16:9",brand:"4K UHD" }
  ],
  mobile: [
    { id:"iphone-16",name:"iPhone · 393 × 852",w:393,h:852,ratio:"~19.5:9",brand:"IPHONE" },
    { id:"iphone-se",name:"iPhone compacto · 375 × 667",w:375,h:667,ratio:"16:9",brand:"IPHONE" },
    { id:"android-large",name:"Android · 412 × 915",w:412,h:915,ratio:"20:9",brand:"ANDROID" },
    { id:"android-standard",name:"Android · 360 × 800",w:360,h:800,ratio:"20:9",brand:"ANDROID" },
    { id:"mobile-landscape",name:"Celular horizontal · 852 × 393",w:852,h:393,ratio:"~19.5:9",brand:"MOBILE LANDSCAPE",landscape:true}
  ],
  tablet: [
    { id:"ipad",name:"Tablet · 1024 × 1366",w:1024,h:1366,ratio:"3:4",brand:"TABLET" },
    { id:"android-tablet",name:"Android tablet · 800 × 1280",w:800,h:1280,ratio:"5:8",brand:"ANDROID TABLET" }
  ]
};
let kind = "tv";
let activeProfile = profiles.tv[0];
const $ = (id) => document.getElementById(id);
const frame = $("app-frame"), device = $("device"), stage = $("stage"), profileSelect = $("profile");
function renderProfiles() {
  profileSelect.innerHTML = profiles[kind].map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  setProfile(profiles[kind][0].id);
}
function setProfile(id) {
  activeProfile = profiles[kind].find(p => p.id === id) || profiles[kind][0];
  $("profile-resolution").textContent = `${activeProfile.w} × ${activeProfile.h}`;
  $("profile-ratio").textContent = activeProfile.ratio;
  $("preview-title").textContent = activeProfile.name;
  $("stage-size").textContent = `ÁREA DE EXIBIÇÃO · ${activeProfile.w} × ${activeProfile.h}`;
  $("device-brand").textContent = activeProfile.brand;
  device.className = "device " + (kind === "tv" ? "tv-device" : kind === "mobile" ? "phone-device" : "tablet-device");
  device.style.width = activeProfile.w + "px";
  device.style.height = activeProfile.h + "px";
  requestAnimationFrame(fitDevice);
}
function fitDevice() {
  const availableW = stage.clientWidth - 100;
  const availableH = stage.clientHeight - (kind === "tv" ? 54 : 28);
  const scale = Math.min(availableW / activeProfile.w, availableH / activeProfile.h, 1);
  device.style.transform = `scale(${Math.max(.08, scale)})`;
  $("scale-value").textContent = Math.round(scale * 100) + "%";
}
function loadUrl() {
  const raw = $("app-url").value.trim();
  if (!raw) return;
  try {
    const url = new URL(raw);
    if (!["http:","https:"].includes(url.protocol)) throw new Error("URL inválida");
    frame.src = url.href;
    $("empty-state").style.display = "none";
    $("clock").textContent = "CONECTANDO AO APLICATIVO";
  } catch {
    $("clock").textContent = "INFORME UMA URL HTTP(S) VÁLIDA";
  }
}
document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
  kind = btn.dataset.kind;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === btn));
  renderProfiles();
}));
profileSelect.addEventListener("change", () => setProfile(profileSelect.value));
$("load-url").addEventListener("click", loadUrl);
$("app-url").addEventListener("keydown", e => { if (e.key === "Enter") loadUrl(); });
$("refresh").addEventListener("click", () => { try { frame.contentWindow.location.reload(); } catch { frame.src = frame.src; } });
$("fit").addEventListener("click", fitDevice);
window.addEventListener("resize", fitDevice);
frame.addEventListener("load", () => { $("clock").textContent = "PRÉVIA CONECTADA"; });
document.querySelectorAll("[data-key]").forEach(btn => btn.addEventListener("click", () => {
  frame.focus();
  window.nexoPreview?.sendKey(btn.dataset.key);
}));
window.addEventListener("keydown", e => {
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter","Escape","Backspace"].includes(e.key) && document.activeElement !== $("app-url")) {
    e.preventDefault();
    window.nexoPreview?.sendKey(e.key);
  }
});
renderProfiles();
$("empty-state").style.display = "none";
