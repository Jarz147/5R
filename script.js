// Konfigurasi Supabase
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
 * Mengambil data dari database
 */
async function fetchData() {
    try {
        const today = new Date().toISOString().split('T')[0];

        // 1. Ambil data scan hari ini (untuk status grid)
        const { data: logsToday, error: err1 } = await supabase
            .from('piket_logs')
            .select('*')
            .gte('created_at', `${today}T00:00:00`)
            .lte('created_at', `${today}T23:59:59`);

        // 2. Ambil 50 data terbaru (untuk tabel riwayat)
        const { data: allLogs, error: err2 } = await supabase
            .from('piket_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (err1 || err2) throw new Error("Gagal memuat data");

        // Proses data hari ini
        dailyStatus = {};
        logsToday.forEach(log => {
            dailyStatus[log.area_id] = new Date(log.created_at).toLocaleTimeString('id-ID');
        });

        monthlyHistory = allLogs;
        renderUI();
        document.getElementById('dbStatus').innerText = "ONLINE";
        document.getElementById('dbStatus').classList.replace('text-red-500', 'text-green-500');

    } catch (error) {
        console.error(error);
        document.getElementById('dbStatus').innerText = "OFFLINE";
        document.getElementById('dbStatus').classList.replace('text-green-500', 'text-red-500');
    }
}

/**
 * Aksi saat tombol SCAN diklik
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
        alert("Gagal koneksi ke database!");
    } else {
        fetchData(); // Refresh tampilan
    }
}

/**
 * Merender Dashboard dan Tabel
 */
function renderUI() {
    // Render Tanggal
    document.getElementById('currentDate').innerText = new Date().toLocaleDateString('id-ID', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });

    // Render Grid Area
    const grid = document.getElementById('picketGrid');
    grid.innerHTML = '';
    let completed = 0;

    areas.forEach(area => {
        const time = dailyStatus[area.id];
        if (time) completed++;

        const card = document.createElement('div');
        card.className = `bg-white p-5 rounded-xl shadow-sm border transition-all hover:shadow-md ${time ? 'card-active' : 'card-inactive'}`;
        card.innerHTML = `
            <h3 class="font-bold text-slate-800 leading-tight mb-1">${area.name}</h3>
            <p class="text-xs text-slate-400 mb-4 uppercase font-semibold">${area.staff}</p>
            ${time 
                ? `<p class="text-[10px] text-green-600 font-bold italic text-center py-2 bg-green-50 rounded">TERVERIFIKASI: ${time}</p>`
                : `<button onclick="handleScan(${area.id}, '${area.name}', '${area.staff}')" class="w-full bg-slate-800 hover:bg-black text-white text-[10px] font-bold py-2 rounded-lg transition">KONFIRMASI LOKASI</button>`
            }
        `;
        grid.appendChild(card);
    });

    document.getElementById('overallProgress').innerText = `${completed}/10`;

    // Render Tabel
    const tableBody = document.getElementById('activityTable');
    tableBody.innerHTML = monthlyHistory.map(log => `
        <tr>
            <td class="p-4 font-mono text-[11px]">${new Date(log.created_at).toLocaleString('id-ID')}</td>
            <td class="p-4 font-bold text-slate-700">${log.area_name}</td>
            <td class="p-4">${log.staff_name}</td>
            <td class="p-4"><span class="text-green-600 font-bold">✓ Terdaftar</span></td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="p-8 text-center text-slate-300">Belum ada aktivitas.</td></tr>';
}

/**
 * Ekspor data ke CSV
 */
function exportCSV() {
    if (monthlyHistory.length === 0) return alert("Data kosong");
    let csv = "Waktu,Area,Petugas\n";
    monthlyHistory.forEach(row => {
        csv += `${new Date(row.created_at).toLocaleString('id-ID')},${row.area_name},${row.staff_name}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `Laporan_Piket_Bulanan.csv`);
    a.click();
}

// Inisialisasi awal
fetchData();
// Sinkronisasi otomatis setiap 15 detik (untuk monitoring TV)
setInterval(fetchData, 15000);
