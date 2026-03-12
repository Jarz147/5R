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
const AUTH_STORAGE_KEY = 'piket_auth';
const USERS_STORAGE_KEY = 'piket_users';
const ADMIN_USERNAME = 'admin5r';
const ADMIN_PASSWORD = '5r@2024';
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

let dailyStatus = {};
let monthlyHistory = [];
/** Log bulanan untuk dashboard jadwal (area_id -> set of day 1-31) */
let scheduleMonthLogs = []; // { area_id, created_at }[]
let scheduleScanMap = {};   // key: "areaId_day" -> true (scan PIC)
let scheduleLeaderScanMap = {}; // key: "areaId_day" -> true (scan Leader 5R)

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
        if (logsToday) {
            logsToday.forEach(log => {
                dailyStatus[log.area_id] = new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            });
        }
        monthlyHistory = allLogs || [];
        renderUI();
    } catch (e) { console.error("Koneksi Error:", e); }
}

const PIKET_STORAGE_BUCKET = 'Piket_photos';

/** Modal Konfirmasi 5R + Foto (wajib foto) */
let _pendingScan = null; // { id, areaName, staffName, scanType: 'pic'|'leader' }

function openScanPhotoModal(id, areaName, staffName, scanType) {
    scanType = scanType === 'leader' ? 'leader' : 'pic';
    _pendingScan = { id, areaName, staffName, scanType };
    document.getElementById('scanPhotoAreaName').textContent = areaName || '-';
    document.getElementById('scanPhotoStaffName').textContent = staffName || '-';
    var roleLabel = document.getElementById('scanPhotoRoleLabel');
    if (roleLabel) {
        roleLabel.textContent = scanType === 'leader' ? 'Leader 5R' : '';
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

/** Submit scan dengan foto: upload ke Storage lalu insert log */
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
    btn.textContent = 'Mengunggah...';

    const { id, areaName, staffName } = _pendingScan;
    // Path harus folder "public" dan ekstensi "jpg" sesuai policy Storage Supabase
    const path = `public/${id}_${Date.now()}.jpg`;

    try {
        const { error: uploadError } = await _supabase.storage.from(PIKET_STORAGE_BUCKET).upload(path, file, { upsert: true });
        if (uploadError) {
            const detail = uploadError.message ? '\n' + uploadError.message : '';
            alert('Gagal upload foto.\n\nBucket: "' + PIKET_STORAGE_BUCKET + '"\nPath: ' + path + '\n\nPastikan bucket ada di Supabase Storage dan policy INSERT untuk anon mengizinkan folder public/*.jpg.' + detail);
            btn.disabled = false;
            btn.textContent = 'Submit 5R';
            return;
        }
        const { data: urlData } = _supabase.storage.from(PIKET_STORAGE_BUCKET).getPublicUrl(path);
        const photoUrl = urlData.publicUrl;

        const { error: insertError } = await _supabase.from('piket_logs').insert([
            { area_id: id, area_name: areaName, staff_name: staffName, photo_url: photoUrl, scan_type: (_pendingScan.scanType === 'leader' ? 'leader' : 'pic') }
        ]);
        if (insertError) {
            alert('Gagal menyimpan log. Pastikan tabel piket_logs punya kolom photo_url (text) dan scan_type (text, default \'pic\').');
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
            card.innerHTML = `
                <div class="flex justify-between items-center mb-1">
                    <span class="text-[10px] font-black text-slate-300">#${String(area.id).padStart(2, '0')}</span>
                    ${time ? '<span class="text-green-500 text-lg">●</span>' : '<span class="text-red-500 animate-pulse text-lg">●</span>'}
                </div>
                <h3 class="font-black text-slate-800 text-base leading-tight uppercase">${area.staff}</h3>
                <p class="text-[10px] font-bold text-slate-400 mb-4 italic uppercase">${area.name}</p>
                ${time 
                    ? `<div class="text-[10px] text-green-700 font-black bg-green-100 py-2 rounded-xl text-center italic tracking-wider">Sudah 5R</div>`
                    : `<button onclick="openScanPhotoModal(${area.id}, '${esc(area.name)}', '${esc(area.staff)}')" class="w-full bg-slate-800 hover:bg-black text-white text-[9px] font-black py-2.5 rounded-xl shadow-md transition-all active:scale-95">Belum 5R</button>`
                }
            `;
            grid.appendChild(card);
        });
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
    modal.classList.remove('hidden');
    printArea.innerHTML = '';

    const baseUrl = window.location.origin + window.location.pathname;

    areas.forEach(member => {
        const qrUrl = `${baseUrl}?scan=${member.id}`;

        const qrCard = document.createElement('div');
        qrCard.className = "qr-card-print border-2 border-slate-100 p-4 rounded-3xl flex flex-col items-center text-center bg-white shadow-sm";
        qrCard.innerHTML = `
            <div class="text-[9px] font-black text-slate-400 mb-2 uppercase tracking-widest">${member.shift}</div>
            <div class="qr-placeholder w-32 h-32 mb-3 flex items-center justify-center bg-slate-50 rounded-xl"></div>
            <div class="font-black text-slate-800 text-xs leading-tight mb-1 uppercase">${escapeHtml(member.staff)}</div>
            <div class="text-[9px] text-slate-500 font-bold italic font-mono">ID: ${String(member.id).padStart(2,'0')} | ${escapeHtml(member.name)}</div>
        `;
        printArea.appendChild(qrCard);

        const placeholder = qrCard.querySelector('.qr-placeholder');
        try {
            new QRCode(placeholder, {
                text: qrUrl,
                width: 128,
                height: 128
            });
        } catch (e) {
            placeholder.innerHTML = '<span class="text-slate-400 text-xs">Error</span>';
            console.error('QR error:', e);
        }

        const qrUrlLeader = `${baseUrl}?scan=${member.id}&role=leader`;
        const qrCardLeader = document.createElement('div');
        qrCardLeader.className = "qr-card-print border-2 border-amber-200 p-4 rounded-3xl flex flex-col items-center text-center bg-amber-50 shadow-sm";
        qrCardLeader.innerHTML = `
            <div class="text-[9px] font-black text-amber-600 mb-2 uppercase tracking-widest">Leader 5R · ${member.shift}</div>
            <div class="qr-placeholder-leader w-32 h-32 mb-3 flex items-center justify-center bg-amber-100/50 rounded-xl"></div>
            <div class="font-black text-amber-900 text-xs leading-tight mb-1 uppercase">Leader ${escapeHtml(member.name)}</div>
            <div class="text-[9px] text-amber-700 font-bold italic font-mono">ID: ${String(member.id).padStart(2,'0')} | ${escapeHtml(member.staff)}</div>
        `;
        printArea.appendChild(qrCardLeader);

        const placeholderLeader = qrCardLeader.querySelector('.qr-placeholder-leader');
        try {
            new QRCode(placeholderLeader, {
                text: qrUrlLeader,
                width: 128,
                height: 128
            });
        } catch (e) {
            if (placeholderLeader) placeholderLeader.innerHTML = '<span class="text-amber-600 text-xs">Error</span>';
            console.error('QR Leader error:', e);
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
    areas.forEach((a, i) => {
        tbody.appendChild(createSettingsRow(i + 1, a.staff, a.name, a.shift));
    });
    document.getElementById('settingsModal').classList.remove('hidden');
}

function createSettingsRow(no, staff, name, shift) {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 hover:bg-slate-50';
    const shiftOpts = ['BIRU', 'HIJAU', 'MERAH'].map(z => `<option value="${z}" ${shift === z ? 'selected' : ''}>${z}</option>`).join('');
    tr.innerHTML = `
        <td class="py-3 pr-2 text-sm font-bold text-slate-400">${no}</td>
        <td class="py-2 pr-2"><input type="text" class="settings-staff w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold" value="${(staff || '').replace(/"/g, '&quot;')}" placeholder="Nama PIC"></td>
        <td class="py-2 pr-2"><input type="text" class="settings-name w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold" value="${(name || '').replace(/"/g, '&quot;')}" placeholder="Nama Area / Zona"></td>
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
    closeSettingsModal();
    renderUI();
}

function resetSettingsToDefault() {
    if (!confirm('Kembalikan semua nama dan zona ke data default?')) return;
    areas = JSON.parse(JSON.stringify(DEFAULT_AREAS));
    saveAreasToStorage();
    openSettingsModal(); // refresh table
    renderUI();
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
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

/** Deteksi Scan Otomatis dari URL Parameter (?scan=13 atau ?scan=13&role=leader) — buka modal foto */
function checkAutoScan() {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('scan');
    const role = params.get('role');
    const scanType = (role === 'leader') ? 'leader' : 'pic';
    if (idParam) {
        const area = areas.find(a => a.id == idParam);
        if (area) {
            window.history.replaceState({}, document.title, window.location.pathname);
            openScanPhotoModal(area.id, area.name, area.staff, scanType);
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
        const { data } = await _supabase.from('piket_logs').select('area_id, created_at, scan_type').gte('created_at', start).lte('created_at', end);
        scheduleMonthLogs = data || [];
        scheduleScanMap = {};
        scheduleLeaderScanMap = {};
        scheduleMonthLogs.forEach(log => {
            const d = new Date(log.created_at).getDate();
            const key = `${log.area_id}_${d}`;
            if (log.scan_type === 'leader') {
                scheduleLeaderScanMap[key] = true;
            } else {
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
            const leaderRow = document.createElement('tr');
            leaderRow.className = 'border-b border-slate-100 bg-amber-50/50';
            let leaderCells = `<td class="p-1 border-r border-slate-200 sticky left-0 bg-amber-50/70 font-bold text-amber-800 text-xs">Leader 5R</td>`;
            for (let day = 1; day <= 31; day++) {
                const off = day > daysInMonth || isOffDay(year, month, day);
                planCells += `<td class="p-0.5 text-center border-r border-slate-100 ${off ? 'bg-red-100 text-red-400' : ''}">${off ? '' : letter}</td>`;
                const key = `${area.id}_${day}`;
                const done = scheduleScanMap[key];
                const leaderDone = scheduleLeaderScanMap[key];
                const isPast = (year < todayYear) ||
                               (year === todayYear && month < todayMonth) ||
                               (year === todayYear && month === todayMonth && day < todayDay);
                if (off) {
                    actualCells += `<td class="p-0.5 text-center border-r border-slate-100 bg-red-100 text-red-500 font-bold">—</td>`;
                    leaderCells += `<td class="p-0.5 text-center border-r border-slate-100 bg-red-100 text-red-500 font-bold">—</td>`;
                } else if (done) {
                    actualCells += `<td class="p-0.5 text-center border-r border-slate-100 text-green-600 font-bold" title="Sudah 5R">✓</td>`;
                } else if (isPast) {
                    actualCells += `<td class="p-0.5 text-center border-r border-slate-100 text-red-500 font-bold" title="Belum 5R">✕</td>`;
                } else {
                    actualCells += `<td class="p-0.5 text-center border-r border-slate-100 text-slate-300">—</td>`;
                }
                if (!off) {
                    if (leaderDone) {
                        leaderCells += `<td class="p-0.5 text-center border-r border-slate-100 text-green-600 font-bold" title="Leader sudah scan">✓</td>`;
                    } else if (isPast) {
                        leaderCells += `<td class="p-0.5 text-center border-r border-slate-100 text-red-500 font-bold" title="Leader belum scan">✕</td>`;
                    } else {
                        leaderCells += `<td class="p-0.5 text-center border-r border-slate-100 text-slate-300">—</td>`;
                    }
                }
            }
            planRow.innerHTML = planCells;
            actualRow.innerHTML = actualCells;
            leaderRow.innerHTML = leaderCells;
            tbody.appendChild(planRow);
            tbody.appendChild(actualRow);
            tbody.appendChild(leaderRow);
        });
    });
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
        const loggedIn = raw ? !!(JSON.parse(raw) || {}).loggedIn : false;
        if (!loggedIn) {
            window.location.href = 'login.html';
            return;
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
