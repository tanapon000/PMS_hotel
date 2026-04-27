// --- ตั้งค่า Supabase (ใส่ข้อมูลของคุณ) ---
const SUPABASE_URL = 'http://192.168.2.200:8000';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ถ้าเปิดหน้าต่างนี้มาแล้วพบว่าเคย Login อยู่แล้ว ให้เด้งไป Dashboard เลย
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        window.location.href = 'dashboard_main.html';
    }
});

// ฟังก์ชันเข้าสู่ระบบ
async function handleLogin() {
    const emailStr = document.getElementById('email').value.trim();
    const passwordStr = document.getElementById('password').value.trim();
    const errorBox = document.getElementById('errorMessage');
    const btn = document.getElementById('btnLogin');

    if (!emailStr || !passwordStr) {
        showError("กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน");
        return;
    }

    // ปรับ UI ระหว่างโหลด
    btn.disabled = true;
    btn.textContent = "⏳ กำลังตรวจสอบ...";
    errorBox.style.display = "none";

    try {
        const { data, error } = await db.auth.signInWithPassword({
            email: emailStr,
            password: passwordStr,
        });

        if (error) throw error;

        // 🟢 เมื่อเข้าสู่ระบบสำเร็จ ให้บันทึกเวลา "ล่าสุด" ที่ใช้งานไว้
        localStorage.setItem('lastActivityTime', Date.now().toString());

        // ส่งไปหน้าหลัก
        window.location.href = 'dashboard_main.html';

    } catch (error) {
        let msg = error.message;
        if (msg.includes('Invalid login credentials')) {
            msg = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
        }
        showError("❌ " + msg);
        btn.disabled = false;
        btn.textContent = "เข้าสู่ระบบ";
    }
}

function showError(msg) {
    const errorBox = document.getElementById('errorMessage');
    errorBox.textContent = msg;
    errorBox.style.display = "block";
}

// แทรกลูกเล่น: กด Enter เพื่อ Login ได้เลย
document.getElementById('password').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') handleLogin();
});