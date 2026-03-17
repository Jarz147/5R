/**
 * Konfigurasi Area & PIC (Person In Charge)
 * Edit file ini untuk mengubah atau menambah nama area dan nama PIC.
 *
 * Format tiap item:
 *   - id      : nomor unik (urut sesuai checksheet manual)
 *   - name    : nama area/lokasi (misal: "Area H", "Area K")
 *   - staff   : nama PIC / petugas
 *   - shift   : "BIRU" | "HIJAU" | "MERAH"
 */

const CONFIG_AREAS = [
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
    { id: 11, name: "Area B", staff: "ALYA A", shift: "MERAH" },
    { id: 12, name: "Area F", staff: "ASEP INDRA", shift: "MERAH" },
    { id: 13, name: "Area G", staff: "PAJAR ARDIANTO", shift: "MERAH" }
];
