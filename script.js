// Konfigurasi Database Supabase Pak Pajar
const SUPABASE_URL = 'https://synhvvaolrjxdcbyozld.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bmh2dmFvbHJqeGRjYnlvemxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5Njg4NzEsImV4cCI6MjA4NTU0NDg3MX0.GSEfz8HVd49uEWXd70taR6FUv243VrFJKn6KlsZW-aQ';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Daftar 10 Area sesuai request
const areas = [
    { id: 1, name: "Area Produksi 1", staff: "Petugas A" },
    { id: 2, name: "Area Produksi 2", staff: "Petugas B" },
    { id: 3, name: "Gudang Material", staff: "Petugas C" },
    { id: 4, name: "Maintenance Room", staff: "Petugas D" },
    { id: 5, name: "QC Lab", staff: "Petugas E" },
    { id: 6, name: "Locker Room", staff: "Petugas F" },
    { id: 7, name: "Loading Dock", staff: "Petugas G" },
    { id: 8, name: "Utility Area", staff: "Petugas H" },
    { id: 9, name: "Waste Center", staff: "Petugas I" },
    { id: 10, name: "Office", staff: "Petugas J" }
];

let dailyStatus = {};
let monthlyHistory = [];

/**
 * Mengambil data log dari Supabase
 */
async function fetchData() {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Ambil data hari ini untuk update status grid (warna merah/hijau)
        const { data: logsToday, error: err1 } = await supabase
            .from('piket_logs')
            .select('*')
            .gte('created_at', `${today}T00:00:00`)
            .lte('created_at', `${today}T23:59:59`);

        // Ambil riwayat bulanan (limit 100 baris terbaru)
        const { data: allLogs, error: err2 } = await supabase
            .from('piket_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (err1 || err2) throw new Error("Gagal ambil data");

        // Mapping jam absen harian
        dailyStatus = {};
        logsToday.forEach(log => {
            dailyStatus[log.area_id] = new Date(log.created_at).toLocaleTimeString('id-ID');
        });

        monthlyHistory = allLogs;
        renderUI();

    } catch (error) {
        console.error("Database Error:", error.message);
    }
}

/**
 * Fungsi saat Barcode di-scan atau Tombol diklik
 */
async function handleScan(id, areaName, staffName) {
    const { error } = await supabase
        .from('piket_logs')
        .insert([{ 
            area_id: id, 
            area_name: areaName, 
            staff_name: staffName 
        }]);

    if (error) {
        alert("Gagal mencatat! Cek koneksi atau Policy SQL.");
    } else {
        fetchData(); // Update tampilan seketika
    }
}

/**
 * Fungsi Render Tampilan Dashboard
 */
function renderUI() {
    // Tampilkan tanggal hari ini
    document.getElementById('currentDate').innerText = new Date().toLocaleDateString('id-ID', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });

    // Render Grid 10 Area
    const grid = document.getElementById('picketGrid');
    grid.innerHTML = '';
    let completed = 0;

    areas.forEach(area => {
        const time = dailyStatus[area.id];
        if (time) completed++;

        const card = document.createElement('div');
        card.className = `bg-white p-5 rounded-xl shadow-sm border transition-all ${time ? 'card-active' : 'card-inactive'}`;
        card.innerHTML = `
            <h3 class="font-bold text-slate-800 leading-tight mb-1">${area.name}</h3>
            <p class="text-[10px] text-slate-400 mb-4 uppercase font-semibold">${area.staff}</p>
            ${time 
                ? `<p class="text-[10px] text-green-600 font-bold bg-green-50 py-2 rounded text-center italic">ABSEN: ${time}</p>`
                : `<button onclick="handleScan(${area.id}, '${area.name}', '${area.staff}')" class="w-full bg-slate-800 hover:bg-black text-white text-[10px] font-bold py-2 rounded-lg transition">SIMULASI SCAN</button>`
            }
        `;
        grid.appendChild(card);
    });

    document.getElementById('overallProgress').innerText = `${completed}/10`;

    // Render Tabel Riwayat
    const tableBody = document.getElementById('activityTable');
    tableBody.innerHTML = monthlyHistory.map(log => `
        <tr>
            <td class="p-4 font-mono text-[11px]">${new Date(log.created_at).toLocaleString('id-ID')}</td>
            <td class="p-4 font-bold text-slate-700">${log.area_name}</td>
            <td class="p-4 text-slate-600">${log.staff_name}</td>
            <td class="p-4"><span class="text-green-600 font-bold">✓ Verified</span></td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="p-8 text-center text-slate-300 italic">Belum ada riwayat tercatat.</td></tr>';
}

/**
 * Ekspor data untuk Review Bulanan
 */
function exportCSV() {
    if (monthlyHistory.length === 0) return alert("Belum ada data untuk diekspor");
    let csv = "Waktu,Area,Petugas\n";
    monthlyHistory.forEach(row => {
        csv += `${new Date(row.created_at).toLocaleString('id-ID')},${row.area_name},${row.staff_name}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_Piket_Bulanan_${new Date().getMonth()+1}.csv`;
    a.click();
}

// Jalankan saat load awal
fetchData();

// Auto-refresh setiap 10 detik (Cocok untuk TV Monitoring)
setInterval(fetchData, 10000);
