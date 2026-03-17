// 1. KONFIGURASI DATABASE SUPABASE
const SUPABASE_URL = 'https://synhvvaolrjxdcbyozld.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bmh2dmFvbHJqeGRjYnlvemxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5Njg4NzEsImV4cCI6MjA4NTU0NDg3MX0.GSEfz8HVd49uEWXd70taR6FUv243VrFJKn6KlsZW-aQ';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Data default (bisa diubah lewat menu Pengaturan)
const DEFAULT_AREAS = [
    { id: 1, name: "Area H", staff: "BUDI IRAWAN", shift: "BIRU" },
    { id: 2, name: "Area K", staff: "AZKIA RASYA", shift: "BIRU" },
    { id: 3, name: "Area J", staff: "IRWAN BAGUSTIAN", shift: "BIRU" },
    { id: 4, name: "Area A", staff: "WISNU ERNANDI", shift: "HIJAU" },
    { id: 5, name: "Area L", staff: "IWAN PRASETYO", shift: "HIJAU" },
    { id: 6, name: "Area M", staff: "RANDIKA SEPTIAN", shift: "HIJAU" },
    { id: 7, name: "Area C", staff: "HANDAKA P", shift: "MERAH" },
    { id: 8, name: "Area I", staff: "M. YUSUF", shift: "MERAH" },
    { id: 9, name: "Area D", staff: "DIKDIK A", shift: "MERAH" },
    { id: 10, name: "Area E", staff: "AHMAD SOBIRIN", shift: "MERAH" },
    { id: 11, name: "Area -", staff: "ALYA A", shift: "MERAH" },
    { id: 12, name: "Area -", staff: "ASEP INDRA", shift: "MERAH" },
    { id: 13, name: "Area -", staff: "PAJAR ARDIANTO", shift: "MERAH" }
];

const STORAGE_KEY = 'piket_areas';
const STORAGE_KEY_LEADERS = 'piket_leader_names';
const AUTH_STORAGE_KEY = 'piket_auth';
const USERS_STORAGE_KEY = 'piket_users';
const ADMIN_USERNAME = 'admin@5r.com'; // email admin Supabase
const ADMIN_PASSWORD = '5r@2024'; // tidak digunakan lagi untuk login, hanya legacy
let areas = loadAreasFromStorage();

function loadAreasFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0)
                return parsed.map((a, i) => ({ ...a, id: i + 1 }));
        }
    } catch (_) {}
    return JSON.parse(JSON.stringify(DEFAULT_AREAS));
}

function saveAreasToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(areas));
}

var leaderNames = {}; // { BIRU: '', HIJAU: '', MERAH: '' }

function loadLeaderNames() {
    try {
        var raw = localStorage.getItem(STORAGE_KEY_LEADERS);
        if (raw) {
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                leaderNames = { BIRU: parsed.BIRU || '', HIJAU: parsed.HIJAU || '', MERAH: parsed.MERAH || '' };
                return leaderNames;
            }
        }
    } catch (_) {}
    leaderNames = { BIRU: '', HIJAU: '', MERAH: '' };
    return leaderNames;
}

function saveLeaderNames() {
    try {
        localStorage.setItem(STORAGE_KEY_LEADERS, JSON.stringify(leaderNames));
    } catch (_) {}
}

function getLeaderName(shiftKey) {
    if (!leaderNames) loadLeaderNames();
    var name = (leaderNames[shiftKey] || '').trim();
    return name || 'Leader 5R';
}

// Muat nama leader dari storage saat awal
loadLeaderNames();

let dailyStatus = {};
let dailyLeaderStatus = {}; // key: 'BIRU'|'HIJAU'|'MERAH' -> time string (Leader sudah scan hari ini)
let monthlyHistory = [];
/** Log bulanan untuk dashboard jadwal (area_id -> set of day 1-31) */
let scheduleMonthLogs = []; // { area_id, created_at }[]
let scheduleScanMap = {};   // key: "areaId_day" -> true (scan PIC)
let scheduleLeaderScanMap = {}; // key: "SHIFT_day" -> true (Leader scan per shift, e.g. "BIRU_15")

/** Mengambil data dari Supabase */
async function fetchData() {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

        // Ambil data hari ini (Actual)
        const { data: logsToday } = await _supabase.from('piket_logs').select('*').gte('created_at', startOfDay).lte('created_at', endOfDay);
        // Ambil riwayat terbaru
        const { data: allLogs } = await _supabase.from('piket_logs').select('*').order('created_at', { ascending: false }).limit(50);

        dailyStatus = {};
        dailyLeaderStatus = {};
        if (logsToday) {
            logsToday.forEach(log => {
                if (log.scan_type === 'leader' && log.leader_shift) {
                    dailyLeaderStatus[log.leader_shift] = new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                } else {
                    dailyStatus[log.area_id] = new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                }
            });
        }
        monthlyHistory = allLogs || [];
        renderUI();
    } catch (e) { console.error("Koneksi Error:", e); }
}

const PIKET_STORAGE_BUCKET = 'bukti_5r';

/** Modal Konfirmasi 5R + Foto (wajib foto) */
let _pendingScan = null; // { id, areaName, staffName, scanType: 'pic'|'leader', leaderShift: 'BIRU'|'HIJAU'|'MERAH' }

/** Mapping PIC -> Shift dan daftar opsi dropdown berbasis data saat ini */
function getPicShiftMap() {
    const map = {};
    DEFAULT_AREAS.forEach(a => {
        const key = (a.staff || '').trim();
        if (key && !map[key]) map[key] = a.shift || 'MERAH';
    });
    areas.forEach(a => {
        const key = (a.staff || '').trim();
        if (key && !map[key]) map[key] = a.shift || 'MERAH';
    });
    return map;
}

function getPicOptions() {
    const map = getPicShiftMap();
    return Object.keys(map)
        .sort()
        .map(name => ({ name, shift: map[name] }));
}

function getAreaOptions() {
    const names = new Set();
    DEFAULT_AREAS.forEach(a => {
        const n = (a.name || '').trim();
        if (n) names.add(n);
    });
    areas.forEach(a => {
        const n = (a.name || '').trim();
        if (n) names.add(n);
    });
    return Array.from(names).sort();
}

function ensureSettingsDatalists() {
    const existingPic = document.getElementById('picOptionsList');
    const existingArea = document.getElementById('areaOptionsList');
    const picOptions = getPicOptions();
    const areaOptions = getAreaOptions();

    if (!existingPic) {
        const dlPic = document.createElement('datalist');
        dlPic.id = 'picOptionsList';
        dlPic.innerHTML = picOptions.map(o => `<option value="${o.name.replace(/"/g, '&quot;')}">${o.name} (SHIFT ${o.shift})</option>`).join('');
        document.body.appendChild(dlPic);
    } else {
        existingPic.innerHTML = picOptions.map(o => `<option value="${o.name.replace(/"/g, '&quot;')}">${o.name} (SHIFT ${o.shift})</option>`).join('');
    }

    if (!existingArea) {
        const dlArea = document.createElement('datalist');
        dlArea.id = 'areaOptionsList';
        dlArea.innerHTML = areaOptions.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`).join('');
        document.body.appendChild(dlArea);
    } else {
        existingArea.innerHTML = areaOptions.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`).join('');
    }
}

function onSettingsPicInputChange(inputEl) {
    if (!inputEl) return;
    const row = inputEl.closest('tr');
    if (!row) return;
    const val = (inputEl.value || '').trim();
    const map = getPicShiftMap();
    let matchedShift = null;
    Object.keys(map).forEach(name => {
        if (name.toLowerCase() === val.toLowerCase()) {
            matchedShift = map[name];
        }
    });
    const shiftSelect = row.querySelector('.settings-shift');
    if (!shiftSelect) return;
    if (matchedShift) {
        shiftSelect.value = matchedShift;
        shiftSelect.disabled = true;
    } else {
        shiftSelect.disabled = false;
    }
}

/** Kompres gambar ke bawah maxSizeKB (default 100 KB) menggunakan canvas */
function compressImageToJpeg(file, maxSizeKB) {
    maxSizeKB = maxSizeKB || 100;
    const maxSizeBytes = maxSizeKB * 1024;
    const maxDimension = 1024; // batas lebar/tinggi agar file tidak terlalu besar

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('Gagal membaca file'));
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas tidak didukung browser'));
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);

                let quality = 0.8;

                function tryCompress() {
                    canvas.toBlob(
                        function (blob) {
                            if (!blob) {
                                reject(new Error('Gagal mengompres gambar'));
                                return;
                            }
                            if (blob.size <= maxSizeBytes || quality <= 0.3) {
                                resolve(blob);
                                return;
                            }
                            quality -= 0.1;
                            tryCompress();
                        },
                        'image/jpeg',
                        quality
                    );
                }

                tryCompress();
            };
            img.onerror = () => reject(new Error('Gagal memuat gambar untuk kompresi'));
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function openScanPhotoModal(id, areaName, staffName, scanType, leaderShift) {
    scanType = scanType === 'leader' ? 'leader' : 'pic';
    _pendingScan = { id: id || 0, areaName: areaName || '', staffName: staffName || '', scanType, leaderShift: leaderShift || null };
    document.getElementById('scanPhotoAreaName').textContent = areaName || '-';
    document.getElementById('scanPhotoStaffName').textContent = staffName || '-';
    var roleLabel = document.getElementById('scanPhotoRoleLabel');
    if (roleLabel) {
        roleLabel.textContent = scanType === 'leader' ? 'Leader 5R · ' + (leaderShift || '') : '';
        roleLabel.style.display = scanType === 'leader' ? 'block' : 'none';
    }
    document.getElementById('scanPhotoInput').value = '';
    document.getElementById('scanPhotoPreview').innerHTML = '<span class="text-slate-400 text-sm font-bold">Belum ada foto</span>';
    document.getElementById('scanPhotoSubmitBtn').disabled = true;
    document.getElementById('scanPhotoModal').classList.remove('hidden');
}

function _onScanPhotoChange(e) {
    const file = e.target && e.target.files[0];
    const preview = document.getElementById('scanPhotoPreview');
    const btn = document.getElementById('scanPhotoSubmitBtn');
    if (!file || !file.type.startsWith('image/')) {
        preview.innerHTML = '<span class="text-red-500 text-sm font-bold">Pilih file gambar</span>';
        btn.disabled = true;
        return;
    }
    const url = URL.createObjectURL(file);
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Preview';
    img.className = 'max-h-40 w-full object-contain rounded-lg';
    preview.appendChild(img);
    btn.disabled = false;
}

function closeScanPhotoModal() {
    _pendingScan = null;
    document.getElementById('scanPhotoModal').classList.add('hidden');
}

/** Submit scan dengan foto: hanya konfirmasi sudah foto, tanpa upload ke Storage */
async function submitScanWithPhoto() {
    if (!_pendingScan) return;
    const input = document.getElementById('scanPhotoInput');
    const file = input && input.files[0];
    if (!file || !file.type.startsWith('image/')) {
        alert('Foto wajib diisi.');
        return;
    }
    const btn = document.getElementById('scanPhotoSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    try {
        const { id, areaName, staffName } = _pendingScan;
        const isLeader = _pendingScan.scanType === 'leader';

        const payload = isLeader
            ? {
                area_id: 0,
                area_name: 'Leader ' + (_pendingScan.leaderShift || ''),
                staff_name: 'Leader 5R',
                photo_url: null,
                scan_type: 'leader',
                leader_shift: _pendingScan.leaderShift || null
            }
            : {
                area_id: id,
                area_name: areaName,
                staff_name: staffName,
                photo_url: null,
                scan_type: 'pic'
            };

        const { error: insertError } = await _supabase.from('piket_logs').insert([payload]);
        if (insertError) {
            alert('Gagal menyimpan log. Pastikan tabel piket_logs punya kolom: photo_url (text, nullable), scan_type (text), leader_shift (text, nullable).');
            btn.disabled = false;
            btn.textContent = 'Submit 5R';
            return;
        }
        closeScanPhotoModal();
        fetchData();
    } catch (err) {
        alert('Error: ' + (err.message || err));
    }
    btn.disabled = false;
    btn.textContent = 'Submit 5R';
}

/** Simpan kehadiran tanpa foto (dipanggil internal jika diperlukan) */
async function handleScan(id, areaName, staffName) {
    const { error } = await _supabase.from('piket_logs').insert([{ area_id: id, area_name: areaName, staff_name: staffName }]);
    if (!error) fetchData();
    else alert("Gagal Input! Pastikan SQL Editor sudah di-Run.");
}

/** Merender tampilan Dashboard */
function renderUI() {
    const grid = document.getElementById('picketGrid');
    grid.innerHTML = '';
    
    const shifts = ["BIRU", "HIJAU", "MERAH"];
    shifts.forEach(s => {
        // Baris Judul Shift
        const shiftTitle = document.createElement('div');
        shiftTitle.className = "col-span-full font-black text-slate-400 text-xs mt-6 mb-1 tracking-[0.2em] uppercase flex items-center gap-2";
        shiftTitle.innerHTML = `<span class="h-px bg-slate-200 grow"></span> ${s === "MERAH" ? "SHIFT MERAH / NON SHIFT" : `SHIFT ${s}`} <span class="h-px bg-slate-200 grow"></span>`;
        grid.appendChild(shiftTitle);

        // Card Member per Shift
        areas.filter(a => a.shift === s).forEach(area => {
            const time = dailyStatus[area.id];
            const card = document.createElement('div');
            card.className = `bg-white p-5 rounded-[2rem] shadow-sm border-2 transition-all duration-300 ${time ? 'card-active' : 'card-inactive'}`;
            const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const adminEdit = isCurrentUserAdmin()
                ? (time
                    ? `<div class="mt-2"><button type="button" onclick="setDailyStatusByAdmin(${area.id}, false)" class="text-[10px] text-slate-500 hover:text-red-600 underline">Tandai belum 5R (admin)</button></div>`
                    : `<div class="mt-2"><button type="button" onclick="setDailyStatusByAdmin(${area.id}, true)" class="text-[10px] text-slate-500 hover:text-green-600 underline">Tandai sudah 5R (admin)</button></div>`)
                : '';
            card.innerHTML = `
                <div class="flex justify-between items-center mb-1">
                    <span class="text-[10px] font-black text-slate-300">#${String(area.id).padStart(2, '0')}</span>
                    ${time ? '<span class="text-green-500 text-lg">●</span>' : '<span class="text-red-500 animate-pulse text-lg">●</span>'}
                </div>
                <h3 class="font-black text-slate-800 text-base leading-tight uppercase">${area.staff}</h3>
                <p class="text-[10px] font-bold text-slate-400 mb-4 italic uppercase">${area.name}</p>
                ${time 
                    ? `<div class="text-[10px] text-green-700 font-black bg-green-100 py-2 rounded-xl text-center italic tracking-wider">Sudah 5R</div>${adminEdit}`
                    : `<button onclick="openScanPhotoModal(${area.id}, '${esc(area.name)}', '${esc(area.staff)}')" class="w-full bg-slate-800 hover:bg-black text-white text-[9px] font-black py-2.5 rounded-xl shadow-md transition-all active:scale-95">Belum 5R</button>${adminEdit}`
                }
            `;
            grid.appendChild(card);
        });
    });

    // Card Leader 5R (3 Leader: BIRU, HIJAU, MERAH) — status pengecekan per area yang dipimpin
    const leaderShifts = [
        { key: 'BIRU', name: 'SHIFT BIRU', bg: 'bg-blue-50', border: 'border-blue-200', accent: 'text-blue-700', dot: 'bg-blue-500' },
        { key: 'HIJAU', name: 'SHIFT HIJAU', bg: 'bg-green-50', border: 'border-green-200', accent: 'text-green-700', dot: 'bg-green-500' },
        { key: 'MERAH', name: 'SHIFT MERAH', bg: 'bg-red-50', border: 'border-red-200', accent: 'text-red-700', dot: 'bg-red-500' }
    ];
    const leaderTitle = document.createElement('div');
    leaderTitle.className = "col-span-full font-black text-slate-400 text-xs mt-10 mb-1 tracking-[0.2em] uppercase flex items-center gap-2";
    leaderTitle.innerHTML = '<span class="h-px bg-slate-200 grow"></span> LEADER 5R — Pengecekan per area <span class="h-px bg-slate-200 grow"></span>';
    grid.appendChild(leaderTitle);

    leaderShifts.forEach(ls => {
        const membersInShift = areas.filter(a => a.shift === ls.key);
        const leaderTime = dailyLeaderStatus[ls.key];
        const doneCount = membersInShift.filter(a => dailyStatus[a.id]).length;
        const totalCount = membersInShift.length;
        const allDone = totalCount > 0 && doneCount === totalCount;
        const card = document.createElement('div');
        card.className = `bg-white p-5 rounded-[2rem] shadow-sm border-2 ${ls.border} ${ls.bg} transition-all duration-300`;
        const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const areaList = membersInShift.map(a => {
            const time = dailyStatus[a.id];
            return `<div class="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                <span class="text-[10px] font-bold text-slate-600">${escapeHtml(a.name)} — ${escapeHtml(a.staff)}</span>
                ${time ? '<span class="text-green-600 text-xs font-black">✓ Sudah 5R</span>' : '<span class="text-red-500 text-xs font-black">✕ Belum 5R</span>'}
            </div>`;
        }).join('');
        card.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="text-[10px] font-black ${ls.accent} uppercase tracking-widest">${ls.name}</span>
                ${
                    leaderTime && allDone
                        ? '<span class="text-green-600 text-[11px] font-black">● Sudah cek kinerja — ' + leaderTime + '</span>'
                        : leaderTime && !allDone
                            ? '<span class="text-amber-500 text-[11px] font-black">● Sudah scan, area belum lengkap</span>'
                            : '<span class="text-red-500 text-[11px] font-black animate-pulse">● Belum cek kinerja</span>'
                }
            </div>
            <h3 class="font-black text-slate-800 text-sm uppercase mb-3">${escapeHtml(getLeaderName(ls.key))}</h3>
            <p class="text-[10px] text-slate-500 font-bold mb-3">Pengecekan area: ${doneCount}/${totalCount}</p>
            <div class="space-y-0 text-[10px] mb-4">
                ${areaList}
            </div>
            <button onclick="openScanPhotoModal(0, 'Leader ${esc(ls.key)}', '${esc(getLeaderName(ls.key))}', 'leader', '${ls.key}')" class="w-full ${leaderTime ? 'bg-slate-200 text-slate-600' : 'bg-amber-500 hover:bg-amber-600 text-white'} text-[9px] font-black py-2 rounded-xl transition-all active:scale-95">
                ${leaderTime ? 'Cek ulang sebagai Leader' : 'Cek sebagai Leader'}
            </button>
        `;
        grid.appendChild(card);
    });

    // Update Header Info
    document.getElementById('currentDate').innerText = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('overallProgress').innerText = `${Object.keys(dailyStatus).length}/${areas.length}`;
    
    // Update Tabel Log
    const tableBody = document.getElementById('activityTable');
    tableBody.innerHTML = monthlyHistory.map(log => {
        const photoLink = log.photo_url ? `<a href="${escapeHtml(log.photo_url)}" target="_blank" rel="noopener" class="text-indigo-600 hover:underline text-[10px] font-black">📷 Foto</a>` : '';
        const isDone = !!log.photo_url;
        const statusLabel = isDone ? 'Sudah 5R' : 'Belum 5R';
        const statusClass = isDone ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
        return `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="p-4 font-mono text-[11px] text-slate-500">${new Date(log.created_at).toLocaleString('id-ID')}</td>
            <td class="p-4 font-black text-slate-800 text-sm italic">${escapeHtml(log.staff_name)}</td>
            <td class="p-4 text-xs font-bold text-slate-500">${escapeHtml(log.area_name)}</td>
            <td class="p-4"><span class="${statusClass} px-3 py-1 rounded-full text-[10px] font-black italic">${statusLabel}</span> ${photoLink}</td>
        </tr>
    `}).join('') || '<tr><td colspan="4" class="p-10 text-center text-slate-300 font-bold italic uppercase">Belum ada aktivitas hari ini</td></tr>';
}

/** Menu Generate Barcode / QR Code */
function openQRModal() {
    const modal = document.getElementById('qrModal');
    const printArea = document.getElementById('qrPrintArea');
    const printAreaLeader = document.getElementById('qrPrintAreaLeader');
    if (!modal) return;
    modal.classList.remove('hidden');
    if (printArea) printArea.innerHTML = '';
    if (printAreaLeader) printAreaLeader.innerHTML = '';

    const baseUrl = window.location.origin + window.location.pathname;

    areas.forEach(member => {
        const qrUrl = `${baseUrl}?scan=${member.id}`;

        const qrCard = document.createElement('div');
        qrCard.className = "qr-card-print border-2 border-slate-100 p-4 rounded-3xl flex flex-col items-center text-center bg-white shadow-sm";
        qrCard.innerHTML = `
            <div class="text-[9px] font-black text-slate-400 mb-2 uppercase tracking-widest">${member.shift}</div>
            <div class="qr-placeholder w-32 h-32 mb-3 flex items-center justify-center bg-slate-50 rounded-xl"></div>
            <div class="font-black text-slate-800 text-xs leading-tight mb-1 uppercase">${escapeHtml(member.name)}</div>
            <div class="text-[9px] text-slate-500 font-bold italic font-mono">PIC: ${escapeHtml(member.staff)}</div>
        `;
        printArea.appendChild(qrCard);

        const placeholder = qrCard.querySelector('.qr-placeholder');
        try {
            new QRCode(placeholder, {
                text: qrUrl,
                width: 128,
                height: 128
            });

            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'mt-2 text-[9px] font-black text-indigo-600 hover:text-indigo-800 underline';
            downloadBtn.textContent = 'Download QR';
            downloadBtn.addEventListener('click', function () {
                const imgOrCanvas = placeholder.querySelector('canvas') || placeholder.querySelector('img');
                if (!imgOrCanvas) {
                    alert('QR belum siap untuk diunduh.');
                    return;
                }
                let dataUrl;
                if (imgOrCanvas.tagName && imgOrCanvas.tagName.toLowerCase() === 'canvas') {
                    dataUrl = imgOrCanvas.toDataURL('image/png');
                } else {
                    dataUrl = imgOrCanvas.src;
                }
                const link = document.createElement('a');
                link.href = dataUrl;
                const safeArea = (member.name || 'AREA').replace(/\s+/g, '_');
                link.download = `QR_${safeArea}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
            qrCard.appendChild(downloadBtn);
        } catch (e) {
            placeholder.innerHTML = '<span class="text-slate-400 text-xs">Error</span>';
            console.error('QR error:', e);
        }
    });

    var leaderShifts = [
        { key: 'BIRU', name: 'Leader Shift BIRU', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800' },
        { key: 'HIJAU', name: 'Leader Shift HIJAU', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
        { key: 'MERAH', name: 'Leader Shift MERAH', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800' }
    ];
    leaderShifts.forEach(function(ls) {
        var qrUrlLeader = baseUrl + '?role=leader&shift=' + ls.key;
        var leaderDisplayName = getLeaderName(ls.key);
        var qrCardLeader = document.createElement('div');
        qrCardLeader.className = "qr-card-print border-2 " + ls.border + " p-4 rounded-3xl flex flex-col items-center text-center " + ls.bg + " shadow-sm";
        qrCardLeader.innerHTML = [
            '<div class="text-[9px] font-black ' + ls.text + ' mb-2 uppercase tracking-widest">Leader 5R</div>',
            '<div class="qr-placeholder-leader w-32 h-32 mb-3 flex items-center justify-center rounded-xl"></div>',
            '<div class="font-black ' + ls.text + ' text-xs leading-tight mb-1 uppercase">' + escapeHtml(leaderDisplayName) + '</div>',
            '<div class="text-[9px] ' + ls.text + ' font-bold">Shift ' + ls.key + '</div>'
        ].join('');
        printAreaLeader.appendChild(qrCardLeader);
        var placeholderLeader = qrCardLeader.querySelector('.qr-placeholder-leader');
        try {
            new QRCode(placeholderLeader, { text: qrUrlLeader, width: 128, height: 128 });

            var downloadBtnLeader = document.createElement('button');
            downloadBtnLeader.className = 'mt-2 text-[9px] font-black ' + ls.text + ' hover:underline';
            downloadBtnLeader.textContent = 'Download QR';
            downloadBtnLeader.addEventListener('click', function () {
                var imgOrCanvas = placeholderLeader.querySelector('canvas') || placeholderLeader.querySelector('img');
                if (!imgOrCanvas) {
                    alert('QR belum siap untuk diunduh.');
                    return;
                }
                var dataUrl;
                if (imgOrCanvas.tagName && imgOrCanvas.tagName.toLowerCase() === 'canvas') {
                    dataUrl = imgOrCanvas.toDataURL('image/png');
                } else {
                    dataUrl = imgOrCanvas.src;
                }
                var link = document.createElement('a');
                link.href = dataUrl;
                link.download = 'QR_Leader_' + ls.key + '.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
            qrCardLeader.appendChild(downloadBtnLeader);
        } catch (e) {
            if (placeholderLeader) placeholderLeader.innerHTML = '<span class="text-slate-500 text-xs">Error</span>';
        }
    });
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
}

function closeQRModal() { document.getElementById('qrModal').classList.add('hidden'); }

/** Menu Pengaturan Nama & Zona */
function openSettingsModal() {
    const tbody = document.getElementById('settingsTableBody');
    tbody.innerHTML = '';
    ensureSettingsDatalists();
    areas.forEach((a, i) => {
        tbody.appendChild(createSettingsRow(i + 1, a.staff, a.name, a.shift));
    });
    loadLeaderNames();
    var lb = document.getElementById('settingsLeaderBIRU');
    var lh = document.getElementById('settingsLeaderHIJAU');
    var lm = document.getElementById('settingsLeaderMERAH');
    if (lb) lb.value = leaderNames.BIRU || '';
    if (lh) lh.value = leaderNames.HIJAU || '';
    if (lm) lm.value = leaderNames.MERAH || '';
    document.getElementById('settingsModal').classList.remove('hidden');
}

function createSettingsRow(no, staff, name, shift) {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 hover:bg-slate-50';
    const picShiftMap = getPicShiftMap();
    const currentStaff = (staff || '').trim();
    const currentArea = (name || '').trim();
    const effectiveShift = picShiftMap[currentStaff] || shift || 'MERAH';

    const shiftOpts = ['BIRU', 'HIJAU', 'MERAH'].map(z => `<option value="${z}" ${effectiveShift === z ? 'selected' : ''}>${z}</option>`).join('');
    tr.innerHTML = `
        <td class="py-3 pr-2 text-sm font-bold text-slate-400">${no}</td>
        <td class="py-2 pr-2"><input type="text" list="picOptionsList" class="settings-staff w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold" value="${currentStaff.replace(/"/g, '&quot;')}" placeholder="Nama PIC" oninput="onSettingsPicInputChange(this)"></td>
        <td class="py-2 pr-2"><input type="text" list="areaOptionsList" class="settings-name w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold" value="${currentArea.replace(/"/g, '&quot;')}" placeholder="Nama Area / Zona"></td>
        <td class="py-2 pr-2"><select class="settings-shift w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold">${shiftOpts}</select></td>
        <td class="py-2"><button type="button" onclick="this.closest('tr').remove()" class="text-red-500 hover:text-red-700 text-lg font-black leading-none" title="Hapus baris">&times;</button></td>
    `;
    return tr;
}

function addSettingsRow() {
    const tbody = document.getElementById('settingsTableBody');
    const nextNo = tbody.querySelectorAll('tr').length + 1;
    tbody.appendChild(createSettingsRow(nextNo, '', '', 'MERAH'));
}

function saveSettings() {
    const tbody = document.getElementById('settingsTableBody');
    const rows = tbody.querySelectorAll('tr');
    const newAreas = [];
    rows.forEach((row, i) => {
        const staff = (row.querySelector('.settings-staff') || {}).value || '';
        const name = (row.querySelector('.settings-name') || {}).value || '';
        const shift = (row.querySelector('.settings-shift') || {}).value || 'MERAH';
        if (staff.trim() || name.trim()) {
            newAreas.push({ id: i + 1, name: name.trim() || '-', staff: staff.trim() || '-', shift });
        }
    });
    if (newAreas.length === 0) {
        alert('Minimal satu baris dengan Nama PIC atau Nama Area.');
        return;
    }
    areas = newAreas.map((a, i) => ({ ...a, id: i + 1 }));
    saveAreasToStorage();
    var lb = document.getElementById('settingsLeaderBIRU');
    var lh = document.getElementById('settingsLeaderHIJAU');
    var lm = document.getElementById('settingsLeaderMERAH');
    if (lb) leaderNames.BIRU = (lb.value || '').trim();
    if (lh) leaderNames.HIJAU = (lh.value || '').trim();
    if (lm) leaderNames.MERAH = (lm.value || '').trim();
    saveLeaderNames();
    closeSettingsModal();
    renderUI();
}

function resetSettingsToDefault() {
    if (!confirm('Kembalikan semua nama dan zona ke data default?')) return;
    areas = JSON.parse(JSON.stringify(DEFAULT_AREAS));
    saveAreasToStorage();
    leaderNames = { BIRU: '', HIJAU: '', MERAH: '' };
    saveLeaderNames();
    openSettingsModal(); // refresh table and leader inputs
    renderUI();
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

// --- Edit ceklist oleh admin (JADWAL 5R + Daily Monitoring) ---
var _editScheduleContext = null;

function openEditScheduleModalFromCell(el) {
    if (!el || !isCurrentUserAdmin()) return;
    var areaId = el.getAttribute('data-area-id');
    var areaName = el.getAttribute('data-area-name') || '';
    var staffName = el.getAttribute('data-staff-name') || '';
    var year = parseInt(el.getAttribute('data-year'), 10);
    var month = parseInt(el.getAttribute('data-month'), 10);
    var day = parseInt(el.getAttribute('data-day'), 10);
    var isLeader = el.getAttribute('data-is-leader') === '1';
    var leaderShift = el.getAttribute('data-leader-shift') || '';
    var currentDone = el.getAttribute('data-current-done') === '1';
    if (isLeader && !leaderShift) return;
    if (!isLeader && (!areaId || areaId === '0')) return;
    _editScheduleContext = {
        areaId: isLeader ? 0 : parseInt(areaId, 10),
        areaName: areaName,
        staffName: staffName,
        year: year,
        month: month,
        day: day,
        isLeader: isLeader,
        leaderShift: leaderShift,
        currentDone: currentDone
    };
    var label = document.getElementById('editScheduleLabel');
    var monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    if (label) {
        if (isLeader) {
            label.textContent = getLeaderName(leaderShift) + ' — Tanggal ' + day + ' ' + (monthNames[month] || '') + ' ' + year;
        } else {
            label.textContent = staffName + ' (' + areaName + ') — Tanggal ' + day + ' ' + (monthNames[month] || '') + ' ' + year;
        }
    }
    var btnDone = document.getElementById('editScheduleBtnDone');
    var btnNotDone = document.getElementById('editScheduleBtnNotDone');
    if (btnDone) btnDone.style.display = currentDone ? 'none' : '';
    if (btnNotDone) btnNotDone.style.display = currentDone ? '' : 'none';
    document.getElementById('editScheduleModal').classList.remove('hidden');
}

function closeEditScheduleModal() {
    _editScheduleContext = null;
    var m = document.getElementById('editScheduleModal');
    if (m) m.classList.add('hidden');
    var btnDone = document.getElementById('editScheduleBtnDone');
    var btnNotDone = document.getElementById('editScheduleBtnNotDone');
    if (btnDone) btnDone.style.display = '';
    if (btnNotDone) btnNotDone.style.display = '';
}

async function insertLogForDay(areaId, areaName, staffName, year, month, day, isLeader, leaderShift) {
    var created = new Date(year, month, day, 12, 0, 0).toISOString();
    var row = {
        area_id: areaId,
        area_name: areaName || ('Leader ' + leaderShift),
        staff_name: staffName || getLeaderName(leaderShift),
        created_at: created,
        scan_type: isLeader ? 'leader' : 'pic',
        photo_url: null
    };
    if (isLeader) row.leader_shift = leaderShift;
    var res = await _supabase.from('piket_logs').insert([row]);
    return !res.error;
}

async function deleteLogForDay(areaId, year, month, day, isLeader, leaderShift) {
    var start = new Date(year, month, day, 0, 0, 0).toISOString();
    var end = new Date(year, month, day, 23, 59, 59).toISOString();
    var q = _supabase.from('piket_logs').select('id').gte('created_at', start).lte('created_at', end);
    if (isLeader) {
        q = q.eq('scan_type', 'leader').eq('leader_shift', leaderShift);
    } else {
        q = q.eq('area_id', areaId);
    }
    var res = await q;
    if (res.error || !res.data || res.data.length === 0) return true;
    for (var i = 0; i < res.data.length; i++) {
        await _supabase.from('piket_logs').delete().eq('id', res.data[i].id);
    }
    return true;
}

function applyScheduleEdit(action) {
    if (!_editScheduleContext) return;
    var c = _editScheduleContext;
    var promise = action === 'done'
        ? insertLogForDay(c.areaId, c.areaName, c.staffName, c.year, c.month, c.day, c.isLeader, c.leaderShift)
        : deleteLogForDay(c.areaId, c.year, c.month, c.day, c.isLeader, c.leaderShift);
    promise.then(function(ok) {
        closeEditScheduleModal();
        fetchScheduleMonth().then(function() { renderScheduleDashboard(); });
        fetchData();
    });
}

function setDailyStatusByAdmin(areaId, setDone) {
    if (!isCurrentUserAdmin()) return;
    var area = areas.find(function(a) { return a.id === areaId || a.id == areaId; });
    if (!area) return;
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    var promise = setDone
        ? insertLogForDay(area.id, area.name, area.staff, y, m, d, false, null)
        : deleteLogForDay(area.id, y, m, d, false, null);
    promise.then(function() { fetchData(); });
}

/** Export ke CSV */
function exportCSV() {
    if (monthlyHistory.length === 0) return alert("Data kosong");
    let csv = "Waktu,Nama,Area,Status\n";
    monthlyHistory.forEach(log => {
        csv += `${new Date(log.created_at).toLocaleString('id-ID')},${log.staff_name},${log.area_name},ACTUAL\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rekap_5R_Maintenance_${new Date().getMonth()+1}.csv`;
    a.click();
}

/** Deteksi Scan Otomatis dari URL Parameter (?scan=13 untuk PIC, ?role=leader&shift=BIRU untuk Leader) — buka modal foto */
function checkAutoScan() {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('scan');
    const role = params.get('role');
    const shiftParam = params.get('shift');
    if (role === 'leader' && (shiftParam === 'BIRU' || shiftParam === 'HIJAU' || shiftParam === 'MERAH')) {
        window.history.replaceState({}, document.title, window.location.pathname);
        openScanPhotoModal(0, 'Leader ' + shiftParam, getLeaderName(shiftParam), 'leader', shiftParam);
        return;
    }
    if (idParam) {
        const area = areas.find(a => a.id == idParam);
        if (area) {
            window.history.replaceState({}, document.title, window.location.pathname);
            openScanPhotoModal(area.id, area.name, area.staff, 'pic');
        }
    }
}

// --- DASHBOARD JADWAL 5R (template schedule) ---
const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function showScheduleDashboard() {
    document.getElementById('viewMonitoring').classList.add('hidden');
    document.getElementById('viewDashboard').classList.remove('hidden');
    document.getElementById('btnShowMonitoring').classList.remove('hidden');
    const now = new Date();
    const monthSelect = document.getElementById('scheduleMonth');
    const yearSelect = document.getElementById('scheduleYear');
    if (!monthSelect.options.length) {
        MONTH_NAMES.forEach((name, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = name;
            if (i === now.getMonth()) opt.selected = true;
            monthSelect.appendChild(opt);
        });
        for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === now.getFullYear()) opt.selected = true;
            yearSelect.appendChild(opt);
        }
    }
    fetchScheduleMonth().then(() => renderScheduleDashboard());
}

function showMonitoring() {
    document.getElementById('viewDashboard').classList.add('hidden');
    document.getElementById('viewMonitoring').classList.remove('hidden');
    document.getElementById('btnShowMonitoring').classList.add('hidden');
}

/** Ambil log satu bulan untuk dashboard */
async function fetchScheduleMonth() {
    const year = parseInt(document.getElementById('scheduleYear')?.value || new Date().getFullYear(), 10);
    const month = parseInt(document.getElementById('scheduleMonth')?.value ?? new Date().getMonth(), 10);
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    try {
        const { data } = await _supabase.from('piket_logs').select('area_id, created_at, scan_type, leader_shift').gte('created_at', start).lte('created_at', end);
        scheduleMonthLogs = data || [];
        scheduleScanMap = {};
        scheduleLeaderScanMap = {};
        scheduleMonthLogs.forEach(log => {
            const d = new Date(log.created_at).getDate();
            if (log.scan_type === 'leader' && log.leader_shift) {
                scheduleLeaderScanMap[log.leader_shift + '_' + d] = true;
            } else {
                const key = `${log.area_id}_${d}`;
                scheduleScanMap[key] = true;
            }
        });
    } catch (e) {
        scheduleMonthLogs = [];
        scheduleScanMap = {};
        scheduleLeaderScanMap = {};
    }
}

function isOffDay(year, month, day) {
    const d = new Date(year, month, day);
    const dow = d.getDay();
    return dow === 0 || dow === 6;
}

/** Ambil huruf area dari "Area H" -> "H", "Area -" -> "-" */
function getAreaLetter(name) {
    if (!name) return '-';
    const m = String(name).match(/Area\s*([A-Z\-])/i) || String(name).match(/([A-Z])$/i);
    return m ? m[1].toUpperCase() : (name.charAt(0) || '-');
}

function renderScheduleDashboard() {
    const year = parseInt(document.getElementById('scheduleYear')?.value || new Date().getFullYear(), 10);
    const month = parseInt(document.getElementById('scheduleMonth')?.value ?? new Date().getMonth(), 10);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDay = now.getDate();
    const tbody = document.getElementById('scheduleTableBody');
    tbody.innerHTML = '';
    const shifts = [
        { name: 'SHIFT BIRU', key: 'BIRU', bg: 'bg-blue-100', border: 'border-blue-300' },
        { name: 'SHIFT HIJAU', key: 'HIJAU', bg: 'bg-green-100', border: 'border-green-300' },
        { name: 'SHIFT MERAH / NON SHIFT', key: 'MERAH', bg: 'bg-red-100', border: 'border-red-300' }
    ];
    const isAdmin = isCurrentUserAdmin();
    const monthVal = parseInt(document.getElementById('scheduleMonth')?.value ?? new Date().getMonth(), 10);
    const yearVal = parseInt(document.getElementById('scheduleYear')?.value || new Date().getFullYear(), 10);
    shifts.forEach(shift => {
        const members = areas.filter(a => a.shift === shift.key);
        if (!members.length) return;
        const headerRow = document.createElement('tr');
        headerRow.className = shift.bg + ' border-b-2 ' + shift.border;
        headerRow.innerHTML = `<td colspan="${1 + 31}" class="p-2 font-black text-slate-700 uppercase">${shift.name}</td>`;
        tbody.appendChild(headerRow);
        members.forEach(area => {
            const letter = getAreaLetter(area.name);
            const planRow = document.createElement('tr');
            planRow.className = 'border-b border-slate-100 bg-slate-50';
            let planCells = `<td class="p-1 border-r border-slate-200 sticky left-0 bg-slate-50 font-bold text-slate-500 text-xs">Plan</td>`;
            const actualRow = document.createElement('tr');
            actualRow.className = 'border-b border-slate-200';
            let actualCells = `<td class="p-1 border-r border-slate-200 sticky left-0 bg-white font-bold text-slate-600">${escapeHtml(area.staff)}</td>`;
            for (let day = 1; day <= 31; day++) {
                const off = day > daysInMonth || isOffDay(year, month, day);
                planCells += `<td class="p-0.5 text-center border-r border-slate-100 ${off ? 'bg-red-100 text-red-400' : ''}">${off ? '' : letter}</td>`;
                const key = `${area.id}_${day}`;
                const done = scheduleScanMap[key];
                const isPast = (year < todayYear) ||
                               (year === todayYear && month < todayMonth) ||
                               (year === todayYear && month === todayMonth && day < todayDay);
                if (off) {
                    actualCells += `<td class="p-0.5 text-center border-r border-slate-100 bg-red-100 text-red-500 font-bold">—</td>`;
                } else if (done) {
                    actualCells += isAdmin
                        ? `<td class="p-0.5 text-center border-r border-slate-100 text-green-600 font-bold cursor-pointer hover:bg-green-100" title="Admin: klik untuk edit" data-area-id="${area.id}" data-area-name="${escapeHtml(area.name).replace(/"/g, '&quot;')}" data-staff-name="${escapeHtml(area.staff).replace(/"/g, '&quot;')}" data-year="${yearVal}" data-month="${monthVal}" data-day="${day}" data-is-leader="0" data-leader-shift="" data-current-done="1" onclick="openEditScheduleModalFromCell(this)">✓</td>`
                        : `<td class="p-0.5 text-center border-r border-slate-100 text-green-600 font-bold" title="Sudah 5R">✓</td>`;
                } else if (isPast) {
                    actualCells += isAdmin
                        ? `<td class="p-0.5 text-center border-r border-slate-100 text-red-500 font-bold cursor-pointer hover:bg-red-50" title="Admin: klik untuk edit" data-area-id="${area.id}" data-area-name="${escapeHtml(area.name).replace(/"/g, '&quot;')}" data-staff-name="${escapeHtml(area.staff).replace(/"/g, '&quot;')}" data-year="${yearVal}" data-month="${monthVal}" data-day="${day}" data-is-leader="0" data-leader-shift="" data-current-done="0" onclick="openEditScheduleModalFromCell(this)">✕</td>`
                        : `<td class="p-0.5 text-center border-r border-slate-100 text-red-500 font-bold" title="Belum 5R">✕</td>`;
                } else {
                    actualCells += isAdmin
                        ? `<td class="p-0.5 text-center border-r border-slate-100 text-slate-300 cursor-pointer hover:bg-slate-100" title="Admin: klik untuk edit" data-area-id="${area.id}" data-area-name="${escapeHtml(area.name).replace(/"/g, '&quot;')}" data-staff-name="${escapeHtml(area.staff).replace(/"/g, '&quot;')}" data-year="${yearVal}" data-month="${monthVal}" data-day="${day}" data-is-leader="0" data-leader-shift="" data-current-done="0" onclick="openEditScheduleModalFromCell(this)">—</td>`
                        : `<td class="p-0.5 text-center border-r border-slate-100 text-slate-300">—</td>`;
                }
            }
            planRow.innerHTML = planCells;
            actualRow.innerHTML = actualCells;
            tbody.appendChild(planRow);
            tbody.appendChild(actualRow);
        });
        // Satu baris Leader 5R per shift (3 leader total)
        const leaderRow = document.createElement('tr');
        leaderRow.className = 'border-b border-slate-100 bg-amber-50/50';
        let leaderCells = `<td class="p-1 border-r border-slate-200 sticky left-0 bg-amber-50/70 font-bold text-amber-800 text-xs">${escapeHtml(getLeaderName(shift.key))}</td>`;
        for (let day = 1; day <= 31; day++) {
            const off = day > daysInMonth || isOffDay(year, month, day);
            const leaderKey = shift.key + '_' + day;
            const leaderDone = scheduleLeaderScanMap[leaderKey];
            const isPast = (year < todayYear) ||
                           (year === todayYear && month < todayMonth) ||
                           (year === todayYear && month === todayMonth && day < todayDay);
            if (off) {
                leaderCells += `<td class="p-0.5 text-center border-r border-slate-100 bg-red-100 text-red-500 font-bold">—</td>`;
            } else if (leaderDone) {
                leaderCells += isAdmin
                    ? `<td class="p-0.5 text-center border-r border-slate-100 text-green-600 font-bold cursor-pointer hover:bg-green-100" title="Admin: klik untuk edit" data-area-id="0" data-area-name="" data-staff-name="" data-year="${yearVal}" data-month="${monthVal}" data-day="${day}" data-is-leader="1" data-leader-shift="${shift.key}" data-current-done="1" onclick="openEditScheduleModalFromCell(this)">✓</td>`
                    : `<td class="p-0.5 text-center border-r border-slate-100 text-green-600 font-bold" title="Leader sudah scan">✓</td>`;
            } else if (isPast) {
                leaderCells += isAdmin
                    ? `<td class="p-0.5 text-center border-r border-slate-100 text-red-500 font-bold cursor-pointer hover:bg-red-50" title="Admin: klik untuk edit" data-area-id="0" data-area-name="" data-staff-name="" data-year="${yearVal}" data-month="${monthVal}" data-day="${day}" data-is-leader="1" data-leader-shift="${shift.key}" data-current-done="0" onclick="openEditScheduleModalFromCell(this)">✕</td>`
                    : `<td class="p-0.5 text-center border-r border-slate-100 text-red-500 font-bold" title="Leader belum scan">✕</td>`;
            } else {
                leaderCells += isAdmin
                    ? `<td class="p-0.5 text-center border-r border-slate-100 text-slate-300 cursor-pointer hover:bg-slate-100" title="Admin: klik untuk edit" data-area-id="0" data-area-name="" data-staff-name="" data-year="${yearVal}" data-month="${monthVal}" data-day="${day}" data-is-leader="1" data-leader-shift="${shift.key}" data-current-done="0" onclick="openEditScheduleModalFromCell(this)">—</td>`
                    : `<td class="p-0.5 text-center border-r border-slate-100 text-slate-300">—</td>`;
            }
        }
        leaderRow.innerHTML = leaderCells;
        tbody.appendChild(leaderRow);
    });
    var adminHint = document.getElementById('scheduleAdminHint');
    if (adminHint) adminHint.style.display = isCurrentUserAdmin() ? 'inline' : 'none';
}

// --- Kelola Akun (hanya admin) ---
function getStoredUsers() {
    try {
        const raw = localStorage.getItem(USERS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function saveStoredUsers(users) {
    try {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch (_) {}
}

function isCurrentUserAdmin() {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return (parsed && parsed.username) === ADMIN_USERNAME;
    } catch (_) {
        return false;
    }
}

function openAccountsModal() {
    const modal = document.getElementById('accountsModal');
    if (!modal) return;
    renderAccountsTable();
    const u = document.getElementById('newAccountUser');
    const p = document.getElementById('newAccountPass');
    if (u) u.value = '';
    if (p) p.value = '';
    modal.classList.remove('hidden');
}

function closeAccountsModal() {
    const modal = document.getElementById('accountsModal');
    if (modal) modal.classList.add('hidden');
}

function renderAccountsTable() {
    const tbody = document.getElementById('accountsTableBody');
    if (!tbody) return;
    const users = getStoredUsers();
    tbody.innerHTML = users.map((u, i) => {
        const safeUser = String(u.username || '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '&quot;');
        const displayUser = escapeHtml(u.username);
        return `<tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="py-3 pr-2 text-sm font-bold text-slate-400">${i + 1}</td>
            <td class="py-2 pr-2 font-bold text-slate-800">${displayUser}</td>
            <td class="py-2 pr-2 text-slate-500 text-sm">••••••••</td>
            <td class="py-2"><button type="button" onclick="removeAccount(this.getAttribute('data-username'))" data-username="${safeUser}" class="text-red-500 hover:text-red-700 text-lg font-black leading-none" title="Hapus akun">&times;</button></td>
        </tr>`;
    }).join('') || '<tr><td colspan="4" class="py-6 text-center text-slate-400 font-bold text-sm">Belum ada akun tambahan. Tambah melalui form di bawah.</td></tr>';
}

function addAccountFromForm() {
    const usernameEl = document.getElementById('newAccountUser');
    const passwordEl = document.getElementById('newAccountPass');
    const username = (usernameEl && usernameEl.value || '').trim();
    const password = (passwordEl && passwordEl.value) || '';

    if (!username) {
        alert('Username wajib diisi.');
        return;
    }
    if (username.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
        alert('Username "' + ADMIN_USERNAME + '" adalah akun admin dan tidak bisa diduplikasi.');
        return;
    }
    if (!password) {
        alert('Password wajib diisi.');
        return;
    }

    const users = getStoredUsers();
    if (users.some(function(u) { return (u.username || '').toLowerCase() === username.toLowerCase(); })) {
        alert('Username sudah dipakai. Gunakan username lain.');
        return;
    }

    users.push({ username: username, password: password });
    saveStoredUsers(users);
    if (usernameEl) usernameEl.value = '';
    if (passwordEl) passwordEl.value = '';
    renderAccountsTable();
}

function removeAccount(username) {
    if (!username) return;
    if ((username || '').toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
        alert('Akun admin tidak dapat dihapus.');
        return;
    }
    if (!confirm('Hapus akun "' + username + '"?')) return;
    const users = getStoredUsers().filter(function(u) { return (u.username || '').toLowerCase() !== username.toLowerCase(); });
    saveStoredUsers(users);
    renderAccountsTable();
}

// Jalankan sistem
document.addEventListener('DOMContentLoaded', () => {
    // Redirect ke halaman login bila belum login
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const loggedIn = !!parsed.loggedIn;
        if (!loggedIn) {
            window.location.href = 'login.html';
            return;
        }
        var loginEl = document.getElementById('loginAsIndicator');
        if (loginEl) {
            var u = parsed.username || '';
            loginEl.textContent = u === ADMIN_USERNAME ? 'Login sebagai: Admin' : ('Login sebagai: ' + (u || '—'));
        }
    } catch (_) {
        window.location.href = 'login.html';
        return;
    }

    const scanInput = document.getElementById('scanPhotoInput');
    if (scanInput) {
        scanInput.addEventListener('change', _onScanPhotoChange);
    }

    fetchData();
    checkAutoScan();
    setInterval(fetchData, 15000); // Auto-refresh setiap 15 detik

    var btnKelola = document.getElementById('btnKelolaAkun');
    if (btnKelola) {
        btnKelola.style.display = isCurrentUserAdmin() ? '' : 'none';
    }
});

function handleLogout() {
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (_) {}
    window.location.href = 'login.html';
}
