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

const PIKET_STORAGE_BUCKET = 'piket-photos';

/** Modal Konfirmasi 5R + Foto (wajib foto) */
let _pendingScan = null; // { id, areaName, staffName }

function openScanPhotoModal(id, areaName, staffName) {
    _pendingScan = { id, areaName, staffName };
    document.getElementById('scanPhotoAreaName').textContent = areaName || '-';
    document.getElementById('scanPhotoStaffName').textContent = staffName || '-';
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
            alert('Gagal upload foto. Buat bucket "' + PIKET_STORAGE_BUCKET + '" di Supabase Storage dan aktifkan public upload.');
            btn.disabled = false;
            btn.textContent = 'Submit 5R';
            return;
        }
        const { data: urlData } = _supabase.storage.from(PIKET_STORAGE_BUCKET).getPublicUrl(path);
        const photoUrl = urlData.publicUrl;

        const { error: insertError } = await _supabase.from('piket_logs').insert([
            { area_id: id, area_name: areaName, staff_name: staffName, photo_url: photoUrl }
        ]);
        if (insertError) {
            alert('Gagal menyimpan log. Tambah kolom photo_url (text) di tabel piket_logs jika belum ada.');
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
        return `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="p-4 font-mono text-[11px] text-slate-500">${new Date(log.created_at).toLocaleString('id-ID')}</td>
            <td class="p-4 font-black text-slate-800 text-sm italic">${escapeHtml(log.staff_name)}</td>
            <td class="p-4 text-xs font-bold text-slate-500">${escapeHtml(log.area_name)}</td>
            <td class="p-4"><span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-black italic">✓ ACTUAL</span> ${photoLink}</td>
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

/** Deteksi Scan Otomatis dari URL Parameter (?scan=13) — buka modal foto */
function checkAutoScan() {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('scan');
    if (idParam) {
        const area = areas.find(a => a.id == idParam);
        if (area) {
            window.history.replaceState({}, document.title, window.location.pathname);
            openScanPhotoModal(area.id, area.name, area.staff);
        }
    }
}

// Jalankan sistem
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('scanPhotoInput').addEventListener('change', _onScanPhotoChange);
    fetchData();
    checkAutoScan();
    setInterval(fetchData, 15000); // Auto-refresh setiap 15 detik
});
