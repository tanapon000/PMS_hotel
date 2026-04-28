// --- 1. ตั้งค่า Supabase ---
const SUPABASE_URL = 'http://192.168.2.200:8000'; // ⚠️ เปลี่ยนเป็นของคุณ
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'; // ⚠️ เปลี่ยนเป็นของคุณ
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ตัวแปรเก็บ ID ลูกค้าปัจจุบัน
let currentCustomerId = null;

document.addEventListener('DOMContentLoaded', () => {
    // 2. ดึงค่า ?id=... ออกมาจาก URL
    const urlParams = new URLSearchParams(window.location.search);
    currentCustomerId = urlParams.get('id');

    if (!currentCustomerId) {
        alert("ไม่พบรหัสลูกค้า กรุณากลับไปหน้าต่างหลักครับ");
        goBack();
        return;
    }

    // 3. เอา ID ไปดึงข้อมูลลูกค้ามาแสดง
    loadCustomerData(currentCustomerId);
});

async function loadCustomerData(id) {
    document.getElementById('custId').value = "⏳ กำลังโหลดข้อมูล...";
    
    try {
        const { data, error } = await db.from('customers')
            .select('*')
            .eq('customer_id', id)
            .single();

        if (error) throw error;

        // 4. นำข้อมูลไปใส่ในช่อง Input (⚠️ เช็คชื่อคอลัมน์ให้ตรงกับฐานข้อมูลของคุณ)
        document.getElementById('custId').value = data.customer_id;
        document.getElementById('custName').value = data.name || '';
        document.getElementById('custPhone').value = data.phone || '';
        
        // ถ้าคอลัมน์ในฐานข้อมูลชื่ออื่น ให้แก้ตรง data.ชื่อคอลัมน์ นะครับ
        document.getElementById('custCardId').value = data.id_card_or_passport || ''; 
        document.getElementById('custEmail').value = data.email || '';
        document.getElementById('custAddress').value = data.address || '';

    } catch (error) {
        console.error("Error loading customer:", error);
        alert("❌ เกิดข้อผิดพลาดในการดึงข้อมูลลูกค้า");
        document.getElementById('custId').value = "ไม่พบข้อมูล";
    }
}

async function saveCustomerData() {
    if (!currentCustomerId) return;

    const btn = document.getElementById('btnSave');
    btn.textContent = "⏳ กำลังบันทึก...";
    btn.disabled = true;

    // 5. ดึงค่าจากช่อง Input
    const newName = document.getElementById('custName').value.trim();
    const newPhone = document.getElementById('custPhone').value.trim();
    const newCardId = document.getElementById('custCardId').value.trim();
    const newEmail = document.getElementById('custEmail').value.trim();
    const newAddress = document.getElementById('custAddress').value.trim();

    if (!newName) {
        alert("กรุณาระบุชื่อลูกค้าครับ");
        btn.textContent = "💾 บันทึกข้อมูล";
        btn.disabled = false;
        return;
    }

    try {
        // 6. ส่งข้อมูลกลับไปอัปเดตที่ฐานข้อมูล (⚠️ เช็คชื่อคอลัมน์อีกครั้ง)
        const { error } = await db.from('customers')
            .update({
                name: newName,
                phone: newPhone,
                id_card_or_passport: newCardId,
                email: newEmail,
                address: newAddress
            })
            .eq('customer_id', currentCustomerId);

        if (error) throw error;

        alert("✅ บันทึกข้อมูลลูกค้าสำเร็จ!");
        goBack(); // เซฟเสร็จแล้วเด้งกลับหน้าเดิมทันที

    } catch (error) {
        console.error("Error saving customer:", error);
        alert("❌ เกิดข้อผิดพลาดในการบันทึก: " + error.message);
    } finally {
        btn.textContent = "💾 บันทึกข้อมูล";
        btn.disabled = false;
    }
}

function goBack() {
    // ย้อนกลับไปหน้าประวัติ (History) ก่อนหน้า
    window.history.back();
}