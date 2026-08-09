let cafes = [];
let myName = '';
let ratings = { cafe:2.5, ambiente:2.5, precio:2.5 };
let photoData = [];
let geoLat = null;
let geoLng = null;
let editingId = null;
let highlightedStarId = null;

/* ---------- storage ---------- */
const useFirestore = typeof window.firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0;
const db = useFirestore ? firebase.firestore() : null;

function serializeCafe(cafe){
  return {
    id: String(cafe.id),
    name: cafe.name || '',
    address: cafe.address || '',
    who: cafe.who || '',
    photos: Array.isArray(cafe.photos) ? cafe.photos : (cafe.photos ? [cafe.photos] : []),
    lat: typeof cafe.lat === 'number' ? cafe.lat : null,
    lng: typeof cafe.lng === 'number' ? cafe.lng : null,
    cafe: cafe.cafe || 0,
    ambiente: cafe.ambiente || 0,
    precio: cafe.precio || 0,
    notes: cafe.notes || '',
    date: typeof cafe.date === 'number' ? cafe.date : Date.now()
  };
}

async function fetchCafesFromFirestore(){
  const snapshot = await db.collection('cafes').orderBy('date', 'asc').get();
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: Number.isFinite(Number(doc.id)) ? Number(doc.id) : doc.id,
      name: data.name || '',
      address: data.address || '',
      who: data.who || '',
      photos: Array.isArray(data.photos) ? data.photos : (data.photos ? [data.photos] : []),
      lat: typeof data.lat === 'number' ? data.lat : null,
      lng: typeof data.lng === 'number' ? data.lng : null,
      cafe: data.cafe || 0,
      ambiente: data.ambiente || 0,
      precio: data.precio || 0,
      notes: data.notes || '',
      date: typeof data.date === 'number' ? data.date : Date.now()
    };
  });
}

async function syncCafesToFirestore(){
  const snapshot = await db.collection('cafes').get();
  const existingIds = snapshot.docs.map(doc => doc.id);
  const currentIds = cafes.map(c => String(c.id));
  const deleteOps = existingIds
    .filter(id => !currentIds.includes(id))
    .map(id => db.collection('cafes').doc(id).delete());
  const setOps = cafes.map(c => db.collection('cafes').doc(String(c.id)).set(serializeCafe(c)));
  await Promise.all([...deleteOps, ...setOps]);
}

async function loadAll(){
  if(useFirestore){
    try{
      cafes = await fetchCafesFromFirestore();
    }catch(e){
      console.error('Error cargando Firestore', e);
      cafes = [];
    }
  } else {
    try{
      const res = await window.storage.get('cafes', true);
      cafes = res && res.value ? JSON.parse(res.value) : [];
    }catch(e){ cafes = []; }
  }

  try{
    const res2 = await window.storage.get('my_name', false);
    myName = res2 && res2.value ? res2.value : '';
    if(myName) document.getElementById('fWho').value = myName;
  }catch(e){ myName = ''; }

  drawStars();
  updateStats();
}

async function saveCafes(){
  if(useFirestore){
    try{
      await syncCafesToFirestore();
    }catch(e){
      console.error('Error guardando Firestore', e);
    }
  } else {
    try{ await window.storage.set('cafes', JSON.stringify(cafes), true); }
    catch(e){ console.error('Error guardando', e); }
  }
}

/* ---------- moon rating helpers ---------- */
function avg(c){ return (c.cafe + c.ambiente + c.precio) / 3; }
function formatScore(value){
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function moonsHtml(value, size){
  let out = '';
  for(let i=0;i<5;i++){
    const filled = value - i;
    let cls = '';
    if(filled >= 1) cls = 'full';
    else if(filled >= 0.5) cls = 'half';
    out += `<span class="moon ${cls}" style="width:${size}px;height:${size}px"></span>`;
  }
  return out;
}

function buildPicker(container, key){
  container.innerHTML = moonsHtml(ratings[key], 26) + `<span class="picker-val">${ratings[key]}</span>`;
  const moons = container.querySelectorAll('.moon');
  moons.forEach((m, i)=>{
    m.addEventListener('click', (e)=>{
      const rect = m.getBoundingClientRect();
      const clickedLeftHalf = (e.clientX - rect.left) < rect.width/2;
      ratings[key] = clickedLeftHalf ? i + 0.5 : i + 1;
      renderPickers();
    });
  });
}
function renderPickers(){
  buildPicker(document.getElementById('pickCafe'), 'cafe');
  buildPicker(document.getElementById('pickAmb'), 'ambiente');
  buildPicker(document.getElementById('pickPrecio'), 'precio');
}
function renderPhotoPreviews(){
  const container = document.getElementById('photoPreviewContainer');
  if(!container) return;
  container.innerHTML = photoData.map((src, index) => `
    <div class="photo-thumb" data-index="${index}">
      <img src="${src}" alt="Foto ${index + 1} de cafetería">
      <button type="button" class="photo-thumb-remove" aria-label="Eliminar foto ${index + 1}">&times;</button>
    </div>
  `).join('');
  container.querySelectorAll('.photo-thumb-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const thumb = btn.closest('.photo-thumb');
      const index = Number(thumb.dataset.index);
      photoData.splice(index, 1);
      renderPhotoPreviews();
    });
  });
}
function openEdit(id){
  const cafe = cafes.find(x => String(x.id) === String(id));
  if(!cafe) return;
  editingId = cafe.id;
  document.getElementById('fName').value = cafe.name;
  document.getElementById('fAddr').value = cafe.address || '';
  document.getElementById('fWho').value = cafe.who || '';
  document.getElementById('fNotes').value = cafe.notes || '';
  ratings = { cafe: cafe.cafe, ambiente: cafe.ambiente, precio: cafe.precio };
  photoData = cafe.photos && cafe.photos.length ? [...cafe.photos] : [];
  document.getElementById('fPhoto').value = '';
  renderPickers();
  renderPhotoPreviews();
  const status = document.getElementById('geoStatus');
  if(typeof cafe.lat === 'number' && typeof cafe.lng === 'number'){
    geoLat = cafe.lat;
    geoLng = cafe.lng;
    status.textContent = 'Ubicación capturada ✓';
    status.style.color = 'var(--teal)';
  } else {
    geoLat = null;
    geoLng = null;
    status.textContent = 'Sin coordenadas todavía — el mapa la ubicará al azar.';
    status.style.color = 'var(--dim)';
  }
  document.getElementById('overlay').classList.add('open');
}

/* ---------- constellation minimap ---------- */
function hashPos(id){
  let h = 0;
  const s = String(id);
  for(let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) >>> 0; }
  const x = 25 + (h % 250);
  const y = 20 + ((h >> 8) % 220);
  return {x,y};
}

/* Posiciona las cafeterías con lat/lng reales guardando sus distancias
   relativas; si solo hay una, o ninguna, cae de vuelta a hashPos. */
function computeGeoPositions(geoList){
  const positions = {};
  if(geoList.length === 0) return positions;

  const padX0=30, padX1=270, padY0=30, padY1=235;
  const boxW = padX1-padX0, boxH = padY1-padY0;

  if(geoList.length === 1){
    positions[geoList[0].id] = { x: padX0+boxW/2, y: padY0+boxH/2 };
    return positions;
  }

  const lats = geoList.map(c=>c.lat), lngs = geoList.map(c=>c.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const avgLatRad = (minLat+maxLat)/2 * Math.PI/180;
  const lngScale = Math.max(0.15, Math.cos(avgLatRad));

  const latRange = (maxLat - minLat) || 0.0008;
  const lngRange = ((maxLng - minLng) * lngScale) || 0.0008;

  const scale = Math.min(boxW/lngRange, boxH/latRange);
  const usedW = lngRange*scale, usedH = latRange*scale;
  const offX = padX0 + (boxW-usedW)/2;
  const offY = padY0 + (boxH-usedH)/2;

  geoList.forEach(c=>{
    const x = offX + (c.lng - minLng) * lngScale * scale;
    const y = offY + (maxLat - c.lat) * scale; // norte arriba
    positions[c.id] = {x,y};
  });
  return positions;
}
function drawStars(){
  try{
    const svg = document.getElementById('mapSvg');
    const emptyEl = document.getElementById('mapEmpty');
    if(!svg || !emptyEl) return;
    while(svg.firstChild) svg.removeChild(svg.firstChild);

    if(cafes.length === 0){ emptyEl.style.display='flex'; return; }
    emptyEl.style.display='none';

    const ordered = [...cafes].sort((a,b)=>a.date-b.date);
  const geoList = ordered.filter(c => typeof c.lat === 'number' && typeof c.lng === 'number');
  const geoPositions = computeGeoPositions(geoList);
  const pts = ordered.map(c => ({...(geoPositions[c.id] || hashPos(c.id)), c}));

  const ns = 'http://www.w3.org/2000/svg';
  const highlightId = highlightedStarId;
  highlightedStarId = null;

  for(let i=1;i<pts.length;i++){
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', pts[i-1].x);
    line.setAttribute('y1', pts[i-1].y);
    line.setAttribute('x2', pts[i].x);
    line.setAttribute('y2', pts[i].y);
    line.setAttribute('stroke', '#8f7cf0');
    line.setAttribute('stroke-width', '0.6');
    line.setAttribute('opacity', '0.35');
    svg.appendChild(line);
  }

  pts.forEach(p=>{
    const score = avg(p.c);
    const b = Math.max(0, Math.min(1, score / 5));
    const color = score >= 4 ? '#e8c77e' : score >= 2.5 ? '#4fd1c5' : '#e0839a';
    const outerR = 4 + b * 7;
    const outerOp = (0.10 + b * 0.28).toFixed(2);
    const midR = 2.5 + b * 3.5;
    const midOp = (0.18 + b * 0.35).toFixed(2);
    const coreR = (1.6 + b * 1.6).toFixed(2);
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', `mapmarker${p.c.id === highlightId ? ' new-star' : ''}`);
    group.setAttribute('data-id', String(p.c.id));
    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', '0');
    group.setAttribute('aria-label', `Ver reseña de ${p.c.name}`);
    group.style.cursor = 'pointer';

    const title = document.createElementNS(ns, 'title');
    title.textContent = `Ver reseña de ${p.c.name}`;
    group.appendChild(title);

    const outer = document.createElementNS(ns, 'circle');
    outer.setAttribute('cx', p.x);
    outer.setAttribute('cy', p.y);
    outer.setAttribute('r', outerR);
    outer.setAttribute('fill', color);
    outer.setAttribute('opacity', outerOp);
    group.appendChild(outer);

    const mid = document.createElementNS(ns, 'circle');
    mid.setAttribute('cx', p.x);
    mid.setAttribute('cy', p.y);
    mid.setAttribute('r', midR);
    mid.setAttribute('fill', color);
    mid.setAttribute('opacity', midOp);
    group.appendChild(mid);

    const core = document.createElementNS(ns, 'circle');
    core.setAttribute('cx', p.x);
    core.setAttribute('cy', p.y);
    core.setAttribute('r', coreR);
    core.setAttribute('fill', color);
    group.appendChild(core);

    if(p.c.id === highlightId){
      const glow = document.createElementNS(ns, 'circle');
      glow.setAttribute('class', 'new-star-glow');
      glow.setAttribute('cx', p.x);
      glow.setAttribute('cy', p.y);
      glow.setAttribute('r', outerR + 10);
      glow.setAttribute('stroke', color);
      glow.setAttribute('stroke-width', '2');
      glow.setAttribute('fill', 'none');
      glow.setAttribute('opacity', '0');
      group.appendChild(glow);
    }

    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', p.x);
    text.setAttribute('y', p.y - outerR - 3);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'marker-label');
    text.textContent = truncate(p.c.name, 12);
    group.appendChild(text);

    svg.appendChild(group);
  });

  svg.querySelectorAll('.mapmarker').forEach(el=>{
    const id = el.getAttribute('data-id');
    const cafe = cafes.find(x => String(x.id) === String(id));
    el.addEventListener('click', ()=>{
      openDetail(id);
      centerMapOnStar(id);
    });
    el.addEventListener('mouseenter', ()=>{
      showMapTooltip(el, cafe);
    });
    el.addEventListener('focus', ()=>{
      showMapTooltip(el, cafe);
    });
    el.addEventListener('mouseleave', hideMapTooltip);
    el.addEventListener('blur', hideMapTooltip);
    el.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        openDetail(id);
        centerMapOnStar(id);
      }
    });
  });
  }catch(error){
    console.error('Error dibujando estrellas:', error);
  }
}
function showMapTooltip(el, cafe){
  const tooltip = document.getElementById('mapTooltip');
  if(!tooltip || !cafe) return;
  tooltip.textContent = `${cafe.name} — ${formatScore(avg(cafe))} / 5`;
  const bbox = el.getBoundingClientRect();
  const mapRect = document.getElementById('mapSvg').getBoundingClientRect();
  tooltip.style.left = `${bbox.left + bbox.width/2 - mapRect.left}px`;
  tooltip.style.top = `${bbox.top - mapRect.top}px`;
  tooltip.classList.add('visible');
}
function hideMapTooltip(){
  const tooltip = document.getElementById('mapTooltip');
  if(tooltip) tooltip.classList.remove('visible');
}
function centerMapOnStar(id){
  const svg = document.getElementById('mapSvg');
  const marker = svg.querySelector(`.mapmarker[data-id="${id}"]`);
  const container = svg.parentElement;
  if(!marker || !container) return;
  requestAnimationFrame(()=>{
    const markerBox = marker.getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    const centerX = markerBox.left + markerBox.width/2 - containerBox.left;
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    const targetScroll = Math.min(maxScroll, Math.max(0, centerX - container.clientWidth / 2));
    container.scrollTo({ left: targetScroll, behavior: 'smooth' });
  });
}
function truncate(s,n){ return s.length > n ? s.slice(0,n-1)+'…' : s; }

/* ---------- stats ---------- */
function updateStats(){
  const total = cafes.length;
  const promedio = total ? formatScore(cafes.reduce((s,c)=>s+avg(c),0)/total) : '0';
  const mejor = total ? cafes.reduce((a,b)=> avg(b) > avg(a) ? b : a).name : '—';

  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="n">${total}</div><div class="l">Estrellas</div></div>
    <div class="stat"><div class="n">${promedio}</div><div class="l">Promedio</div></div>
    <div class="stat"><div class="n" style="font-size:13px;line-height:1.3;padding-top:3px;">${escapeHtml(mejor)}</div><div class="l">Favorita</div></div>
  `;
  document.getElementById('mapHint').style.display = total ? 'block' : 'none';
}

/* ---------- detail sheet ---------- */
let currentDetailId = null;

function openDetail(id){
  const c = cafes.find(x => String(x.id) === String(id));
  if(!c) return;
  currentDetailId = c.id;
  const photos = c.photos && c.photos.length ? c.photos : (c.photo ? [c.photo] : []);

  document.getElementById('detailContent').innerHTML = `
    ${photos.length ? `
      <div class="detail-gallery">
        <div class="detail-gallery-main">
          <img id="detailMainPhoto" src="${photos[0]}" alt="Foto principal de ${escapeHtml(c.name)}">
          <button type="button" class="gallery-nav gallery-prev" aria-label="Foto anterior">‹</button>
          <button type="button" class="gallery-nav gallery-next" aria-label="Foto siguiente">›</button>
        </div>
        <div class="detail-gallery-thumbs">
          ${photos.map((src, idx) => `
            <button type="button" class="detail-thumb ${idx === 0 ? 'active' : ''}" data-index="${idx}" aria-label="Ver foto ${idx + 1}">
              <img src="${src}" alt="Foto ${idx + 1} de ${escapeHtml(c.name)}">
            </button>
          `).join('')}
        </div>
      </div>
    ` : ''}
    <div class="card-top">
      <div>
        <p class="cname">${escapeHtml(c.name)}</p>
        ${c.address ? `<div class="caddr">${escapeHtml(c.address)}</div>` : ''}
      </div>
      <div class="score-pill">${formatScore(avg(c))} / 5</div>
    </div>
    <hr class="divider">
    <div class="cat-row"><span class="cat-label">Café</span><div class="moons">${moonsHtml(c.cafe,16)}</div></div>
    <div class="cat-row"><span class="cat-label">Ambiente</span><div class="moons">${moonsHtml(c.ambiente,16)}</div></div>
    <div class="cat-row"><span class="cat-label">Precio</span><div class="moons">${moonsHtml(c.precio,16)}</div></div>
    ${c.notes ? `<div class="review">"${escapeHtml(c.notes)}"</div>` : ''}
    <div class="meta">
      <span>${c.who ? 'Reseña de ' + escapeHtml(c.who) : ''}</span>
      <div>
        <button class="edit" id="editDetail">Editar</button>
        <button class="del" id="deleteDetail">Eliminar</button>
      </div>
    </div>
  `;

  let currentPhotoIndex = 0;
  const mainPhoto = document.getElementById('detailMainPhoto');
  const setGalleryIndex = (index) => {
    currentPhotoIndex = index;
    if(mainPhoto) mainPhoto.src = photos[index];
    document.querySelectorAll('.detail-thumb').forEach((btn, btnIndex) => {
      btn.classList.toggle('active', btnIndex === index);
    });
  };
  if(photos.length){
    document.querySelectorAll('.detail-thumb').forEach(btn => {
      btn.addEventListener('click', ()=>{
        setGalleryIndex(Number(btn.dataset.index));
      });
    });
    const prevBtn = document.querySelector('.gallery-prev');
    const nextBtn = document.querySelector('.gallery-next');
    if(prevBtn) prevBtn.addEventListener('click', ()=>{
      setGalleryIndex((currentPhotoIndex + photos.length - 1) % photos.length);
    });
    if(nextBtn) nextBtn.addEventListener('click', ()=>{
      setGalleryIndex((currentPhotoIndex + 1) % photos.length);
    });
  }
  document.getElementById('editDetail').addEventListener('click', ()=>{
    closeDetail();
    openEdit(c.id);
  });
  document.getElementById('deleteDetail').addEventListener('click', async ()=>{
    cafes = cafes.filter(x => String(x.id) !== String(currentDetailId));
    await saveCafes();
    closeDetail();
    drawStars();
    updateStats();
  });

  document.getElementById('detailOverlay').classList.add('open');
}
function closeDetail(){
  document.getElementById('detailOverlay').classList.remove('open');
  currentDetailId = null;
}
document.getElementById('closeDetail').addEventListener('click', closeDetail);
document.getElementById('detailOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'detailOverlay') closeDetail();
});

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

/* ---------- geolocation ---------- */
document.getElementById('geoBtn').addEventListener('click', ()=>{
  const status = document.getElementById('geoStatus');
  if(!navigator.geolocation){
    status.textContent = 'Este dispositivo no permite obtener ubicación.';
    return;
  }
  status.textContent = 'Buscando ubicación…';
  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      geoLat = pos.coords.latitude;
      geoLng = pos.coords.longitude;
      status.textContent = 'Ubicación capturada ✓';
      status.style.color = 'var(--teal)';
    },
    (err)=>{
      geoLat = null; geoLng = null;
      const message = err && err.code === 1
        ? 'Permiso denegado. Abre el proyecto desde un servidor seguro o usa el modo sin ubicación.'
        : 'No se pudo obtener la ubicación. El mapa la ubicará al azar.';
      status.textContent = message;
      status.style.color = 'var(--rose)';
    },
    { enableHighAccuracy:true, timeout:8000 }
  );
});

function readFileAsDataUrl(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function resizeImageToDataUrl(dataUrl){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>{
      const maxW = 480;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.65));
    };
    img.src = dataUrl;
  });
}
async function processPhotos(files){
  const results = [];
  for(const file of files){
    const dataUrl = await readFileAsDataUrl(file);
    results.push(await resizeImageToDataUrl(dataUrl));
  }
  return results;
}

document.getElementById('fPhoto').addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files || []);
  if(files.length === 0) return;
  const newPhotos = await processPhotos(files);
  photoData = photoData.concat(newPhotos);
  renderPhotoPreviews();
});

/* ---------- add sheet ---------- */
document.getElementById('openAdd').addEventListener('click', ()=>{
  editingId = null;
  ratings = { cafe:2.5, ambiente:2.5, precio:2.5 };
  geoLat = null; geoLng = null;
  photoData = [];
  document.getElementById('fName').value = '';
  document.getElementById('fAddr').value = '';
  document.getElementById('fWho').value = myName || '';
  document.getElementById('fNotes').value = '';
  document.getElementById('fPhoto').value = '';
  const status = document.getElementById('geoStatus');
  status.textContent = 'Sin coordenadas todavía — el mapa la ubicará al azar.';
  status.style.color = 'var(--dim)';
  renderPickers();
  renderPhotoPreviews();
  document.getElementById('overlay').classList.add('open');
});
document.getElementById('cancelAdd').addEventListener('click', ()=>{
  editingId = null;
  document.getElementById('overlay').classList.remove('open');
});

document.getElementById('saveAdd').addEventListener('click', async ()=>{
  const name = document.getElementById('fName').value.trim();
  const err = document.getElementById('formErr');
  if(!name){ err.style.display = 'block'; return; }
  err.style.display = 'none';

  const who = document.getElementById('fWho').value.trim();
  const cafeData = {
    id: editingId || Date.now(),
    name,
    address: document.getElementById('fAddr').value.trim(),
    who,
    photos: photoData,
    lat: geoLat,
    lng: geoLng,
    cafe: ratings.cafe,
    ambiente: ratings.ambiente,
    precio: ratings.precio,
    notes: document.getElementById('fNotes').value.trim(),
    date: editingId ? (cafes.find(c => c.id === editingId)?.date || Date.now()) : Date.now()
  };

  if(editingId){
    cafes = cafes.map(c => c.id === editingId ? cafeData : c);
  } else {
    cafes.push(cafeData);
    highlightedStarId = cafeData.id;
  }
  editingId = null;
  await saveCafes();

  if(who && who !== myName){
    myName = who;
    try{ await window.storage.set('my_name', who, false); }catch(e){}
  }

  document.getElementById('fName').value = '';
  document.getElementById('fAddr').value = '';
  document.getElementById('fNotes').value = '';
  document.getElementById('photoPreviewContainer').innerHTML = '';
  document.getElementById('fPhoto').value = '';
  photoData = [];
  geoLat = null; geoLng = null;

  document.getElementById('overlay').classList.remove('open');
  drawStars();
  if(cafeData.id){
    centerMapOnStar(cafeData.id);
  }
  updateStats();
});

loadAll();
