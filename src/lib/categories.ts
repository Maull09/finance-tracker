import type { TransactionType } from "./finance"

export const incomeCategoryTree: Record<string, readonly string[]> = {
  "Gaji Utama": ["Gaji bulanan", "Tunjangan", "Lembur"],
  Freelance: ["Proyek", "Konsultasi", "Royalti"],
  Investasi: ["Dividen", "Bunga", "Keuntungan penjualan"],
  Bonus: ["Bonus kerja", "THR"],
  Usaha: ["Penjualan", "Jasa"],
  "Dukungan keluarga": ["Dari orang tua", "Dari pasangan", "Dari saudara", "Dari kerabat"],
  "Uang saku": ["Uang saku harian", "Uang saku mingguan", "Uang saku bulanan"],
  Beasiswa: ["Beasiswa pendidikan", "Bantuan biaya hidup"],
  "Bantuan sosial": ["Bantuan pemerintah", "Bantuan organisasi"],
  "Pendapatan sewa": ["Sewa properti", "Sewa kendaraan", "Sewa barang"],
  "Penjualan barang pribadi": ["Barang bekas", "Penjualan aset pribadi"],
  Hadiah: ["Hadiah uang", "Bantuan keluarga"],
  "Pengembalian dana": ["Refund belanja", "Reimbursement"],
  Utang: ["Pinjaman diterima"],
  Piutang: ["Penerimaan piutang"],
  Lainnya: [],
}

export const expenseCategoryTree: Record<string, readonly string[]> = {
  Makanan: ["Makan utama", "Camilan", "Bahan makanan"],
  Minuman: ["Kopi", "Teh", "Air minum", "Jus"],
  Transportasi: ["Bahan bakar", "Transportasi umum", "Ojek dan taksi", "Parkir dan tol", "Servis kendaraan"],
  Hiburan: ["Film", "Game", "Acara dan rekreasi"],
  Belanja: ["Pakaian", "Elektronik", "Perlengkapan pribadi"],
  Tagihan: ["Listrik", "Air", "Internet", "Telepon"],
  "Rumah tangga": ["Sewa tempat tinggal", "Perabot", "Perawatan rumah", "Kebutuhan kebersihan"],
  Kesehatan: ["Dokter", "Obat", "Perawatan gigi"],
  Pendidikan: ["Biaya sekolah", "Kursus", "Buku"],
  Langganan: ["Streaming", "Aplikasi", "Keanggotaan"],
  "Perawatan diri": ["Potong rambut", "Perawatan kulit", "Kosmetik"],
  Olahraga: ["Pusat kebugaran", "Peralatan olahraga"],
  Keluarga: ["Kebutuhan anak", "Dukungan orang tua"],
  Sosial: ["Donasi", "Zakat", "Hadiah untuk orang lain"],
  Liburan: ["Penginapan", "Tiket perjalanan", "Wisata"],
  "Hewan peliharaan": ["Pakan", "Dokter hewan"],
  Asuransi: ["Premi kesehatan", "Premi kendaraan", "Premi jiwa"],
  "Pajak dan biaya": ["Pajak", "Biaya administrasi", "Denda"],
  Utang: ["Pembayaran utang", "Bunga pinjaman"],
  Piutang: ["Pinjaman diberikan"],
  Lainnya: [],
}

export const incomeCategories = Object.keys(incomeCategoryTree)
export const expenseCategories = Object.keys(expenseCategoryTree)

export function getCategories(type: TransactionType | "all") {
  if (type === "income") return incomeCategories
  if (type === "expense") return expenseCategories
  if (type === "transfer") return ["Transfer antar akun"]
  return [...new Set([...expenseCategories, ...incomeCategories, "Transfer antar akun"])]
}

export function getSubcategories(
  type: TransactionType | "all",
  category: string,
): readonly string[] {
  if (type === "transfer") return []
  if (type === "income")
    return Object.hasOwn(incomeCategoryTree, category) ? incomeCategoryTree[category] : []
  if (type === "expense")
    return Object.hasOwn(expenseCategoryTree, category) ? expenseCategoryTree[category] : []
  return [...new Set([...getSubcategories("expense", category), ...getSubcategories("income", category)])]
}

export function isValidSubcategory(
  type: TransactionType,
  category: string,
  subcategory: string | null | undefined,
) {
  return subcategory == null || getSubcategories(type, category).includes(subcategory)
}
