// Konfigurasi Database Supabase
const SUPABASE_URL = 'https://synhvvaolrjxdcbyozld.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bmh2dmFvbHJqeGRjYnlvemxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5Njg4NzEsImV4cCI6MjA4NTU0NDg3MX0.GSEfz8HVd49uEWXd70taR6FUv243VrFJKn6KlsZW-aQ';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Data Member Maintenance & PE - Urutan Sesuai Checksheet Manual
const areas = [
    // --- SHIFT BIRU ---
    { id: 1, name: "Area H", staff: "BUDI IRAWAN", shift: "BIRU" },
    { id: 2, name: "Area K", staff: "AZKIA RASYA", shift: "BIRU" },
    { id: 3, name: "Area J", staff: "IRWAN BAGUSTIAN", shift: "BIRU" },

    // --- SHIFT HIJAU ---
    { id: 4, name: "Area A", staff: "WISNU ERNANDI", shift: "HIJAU" },
    { id: 5, name: "Area L", staff: "IWAN PRASETYO", shift: "HIJAU" },
    { id: 6, name: "Area M", staff: "RANDIKA SEPTIAN", shift: "HIJAU" },

    // --- MEMBER SHIFT MERAH (NON-SHIFT) ---
    { id: 7, name: "Area C", staff: "HANDAKA P", shift: "MERAH" },
    { id: 8, name: "Area I", staff: "M. YUSUF", shift: "MERAH" },
    { id: 9, name: "Area D", staff: "DIKDIK A", shift: "MERAH" },
    { id: 10, name: "Area E", staff: "AHMAD SOBIRIN", shift: "MERAH" },
    { id: 11, name: "Area -", staff: "ALYA A", shift: "MERAH" },
    { id: 12, name: "Area -", staff: "ASEP INDRA", shift: "MERAH" },
    { id: 13, name: "Area -", staff: "PAJAR ARDIANTO", shift: "MERAH" } // Urutan Terakhir
];

let dailyStatus = {};
let monthlyHistory = [];

async function fetchData() {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

        const { data: logsToday } = await _supabase.from('piket_logs').select('*').gte('created_at', startOfDay).lte('created_at', endOfDay);
        const { data: allLogs } = await _supabase.from('piket_logs').select('*').order('created_at', { ascending: false }).limit(100);

        dailyStatus = {};
        if (logsToday) {
            logsToday.forEach(log => { dailyStatus[log.area_id] = new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); });
        }
        monthlyHistory = allLogs || [];
        renderUI();
    } catch (e) { console.error(e); }
}

async function handleScan(id, areaName, staffName) {
    const { error } = await _supabase.from('piket_logs').insert([{ area_id: id, area_name: areaName, staff_name: staffName }]);
    if (!error) fetchData();
}

function renderUI() {
    const grid = document.getElementById('picketGrid');
    grid.innerHTML = '';
    
    const shifts = ["BIRU", "HIJAU", "MERAH"];
    shifts.forEach(s => {
        const shiftTitle = document.createElement('div');
        shiftTitle.className = "col-span-full font-black text-slate-400 text-xs mt-6 mb-2 tracking-widest uppercase border-b pb-1";
        shiftTitle.innerText = s === "MERAH" ? "SHIFT MERAH / NON SHIFT" : `SHIFT ${s}`;
        grid.appendChild(shiftTitle);

        areas.filter(a => a.shift === s).forEach(area => {
            const time = dailyStatus[area.id];
            const card = document.createElement('div');
            card.className = `bg-white p-4 rounded-xl shadow-sm border-l-4 transition-all ${time ? 'border-green-500' : 'border-red-500'}`;
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <span class="text-[9px] font-bold text-slate-300">#${area.id}</span>
                </div>
                <h3 class="font-bold text-slate-800 text-sm">${area.staff}</h3>
                <p class="text-[10px] text-slate-400 mb-3">${area.name}</p>
                ${time 
                    ? `<div class="text-[10px] text-green-600 font-bold bg-green-50 py-1 rounded text-center">ACTUAL: ${time}</div>`
                    : `<button onclick="handleScan(${area.id}, '${area.name}', '${area.staff}')" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-[9px] font-bold py-1.5 rounded-lg transition">CONFIRM 5R</button>`
                }
            `;
            grid.appendChild(card);
        });
    });

    document.getElementById('currentDate').innerText = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('overallProgress').innerText = `${Object.keys(dailyStatus).length}/${areas.length}`;
}

// Fitur Auto-Scan URL
const params = new URLSearchParams(window.location.search);
if (params.get('scan')) {
    const area = areas.find(a => a.id == params.get('scan'));
    if (area) handleScan(area.id, area.name, area.staff);
    window.history.replaceState({}, document.title, window.location.pathname);
}

fetchData();
setInterval(fetchData, 15000);
