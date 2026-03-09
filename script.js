/**
 * SISTEM MONITORING PIKET REAL-TIME
 * Developer: Pajar Ardianto
 * Database: Supabase
 */

// 1. KONFIGURASI DATABASE
const SUPABASE_URL = 'https://synhvvaolrjxdcbyozld.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bmh2dmFvbHJqeGRjYnlvemxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5Njg4NzEsImV4cCI6MjA4NTU0NDg3MX0.GSEfz8HVd49uEWXd70taR6FUv243VrFJKn6KlsZW-aQ';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. DATA MASTER AREA
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
 * MENGAMBIL DATA DARI SUPABASE
 */
async function fetchData() {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.month(), now.getDate()).toISOString();
        const endOfDay = new Date(now.getFullYear(), now.month(), now.getDate(), 23, 59, 59).toISOString();

        // Ambil log untuk hari ini saja (Grid Status)
        const { data: logsToday, error: err1 } = await _supabase
            .from('piket_logs')
            .select('*')
            .gte('created_at', startOfDay)
            .lte('created_at', endOfDay);

        // Ambil 100 log terbaru (Riwayat Tabel)
        const { data: allLogs, error: err2 } = await _supabase
            .from('piket_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (err1 || err2) throw new Error("Koneksi gagal");

        // Olah data hari ini ke objek dailyStatus
        dailyStatus = {};
        logsToday.forEach(log => {
            dailyStatus[log.area_id] = new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        });

        monthlyHistory = allLogs || [];
        renderUI();

    } catch (error) {
        console.error("Error Fetching:", error);
    }
}

/**
 * FUNGSI INPUT DATA (DARI TOMBOL ATAU SCAN)
 */
async function handleScan(id, areaName, staffName) {
    try {
        const { error } = await _supabase
            .from('piket_logs')
            .insert([{ 
                area_id: id, 
                area_name: areaName, 
                staff_name: staffName 
            }]);

        if (error) throw error;
        
        // Refresh data setelah berhasil insert
        await fetchData();

    } catch (error) {
        alert("Gagal mencatat kehadiran. Pastikan SQL Policy sudah aktif.");
        console.error(error);
    }
}

/**
 * UPDATE TAMPILAN ANTARMUKA (UI)
 */
function renderUI() {
    // 1. Update Tanggal di Header
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        dateElement.innerText = new Date().toLocaleDateString('id-ID', { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });
    }

    // 2. Render Grid 10 Lokasi
    const grid = document.getElementById('picketGrid');
    if (grid) {
        grid.innerHTML = '';
        let completedCount = 0;

        areas.forEach(area => {
            const scanTime = dailyStatus[area.id];
            if (scanTime) completedCount++;

            const card = document.createElement('div');
            card.className = `bg-white p-5 rounded-xl shadow-sm border transition-all ${scanTime ? 'card-active' : 'card-inactive'}`;
            card.innerHTML = `
                <h3 class="font-bold text-slate-800 leading-tight mb-1">${area.name}</h3>
                <p class="text-[10px] text-slate-400 mb-4 uppercase font-bold tracking-wider">${area.staff}</p>
                ${scanTime 
                    ? `<div class="text-center py-2 bg-green-50 rounded text-green-600 font-bold text-[11px]">TERVERIFIKASI: ${scanTime}</div>`
                    : `<button onclick="handleScan(${area.id}, '${area.name}', '${area.staff}')" class="w-full bg-slate-800 hover:bg-black text-white text-[10px] font-bold py-2 rounded-lg transition-all shadow-sm">SIMULASI SCAN</button>`
                }
            `;
            grid.appendChild(card);
        });

        // Update Progress Bar/Text
        const progressElement = document.getElementById('overallProgress');
        if (progressElement) progressElement.innerText = `${completedCount}/10`;
    }

    // 3. Render Tabel Riwayat
    const tableBody = document.getElementById('activityTable');
    if (tableBody) {
        tableBody.innerHTML = monthlyHistory.map(log => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="p-4 font-mono text-[11px] text-slate-500">${new Date(log.created_at).toLocaleString('id-ID')}</td>
                <td class="p-4 font-bold text-slate-700">${log.area_name}</td>
                <td class="p-4 text-slate-600 font-medium">${log.staff_name}</td>
                <td class="p-4"><span class="bg-green-100 text-green-700 px-2 py-1 rounded-full text-[10px] font-black">✓ HADIR</span></td>
            </tr>
        `).join('') || '<tr><td colspan="4" class="p-10 text-center text-slate-400 italic font-medium">Belum ada aktivitas tercatat.</td></tr>';
    }
}

/**
 * EKSPOR DATA KE CSV (UNTUK REVIEW BULANAN)
 */
function exportCSV() {
    if (monthlyHistory.length === 0) return alert("Data kosong, tidak ada yang bisa diekspor.");
    
    let csvContent = "data:text/csv;charset=utf-8,Waktu,Area,Petugas,Status\n";
    monthlyHistory.forEach(log => {
        const row = [
            new Date(log.created_at).toLocaleString('id-ID'),
            log.area_name,
            log.staff_name,
            "HADIR"
        ].join(",");
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Rekap_Piket_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * DETEKSI OTOMATIS JIKA SCAN DARI QR CODE (URL PARAMS)
 * Contoh Link QR: index.html?scan=1
 */
function checkAutoScan() {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('scan');

    if (idParam) {
        const targetArea = areas.find(a => a.id == idParam);
        if (targetArea) {
            handleScan(targetArea.id, targetArea.name, targetArea.staff);
            // Bersihkan URL agar tidak double scan saat refresh
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
}

// INISIALISASI SAAT HALAMAN DIBUKA
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    checkAutoScan();
    
    // Interval refresh 15 detik agar TV Dashboard selalu update secara otomatis
    setInterval(fetchData, 15000);
});
