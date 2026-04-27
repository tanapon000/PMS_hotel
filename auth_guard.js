// ========================================================
// ไฟล์นี้ต้องนำไปใส่ในทุกหน้าจอ (เช่น dashboard_main, booking, summary)
// ========================================================

// กำหนดเวลา Timeout (24 ชั่วโมง = 24 * 60 * 60 * 1000 มิลลิวินาที)
const INACTIVITY_LIMIT_MS = 24 * 60 * 60 * 1000; 

// ฟังก์ชันหลักสำหรับตรวจสอบสิทธิ์
async function verifySession() {
    // สมมติว่าทุกหน้ามีตัวแปร db (Supabase client) อยู่แล้ว
    const { data: { session }, error } = await db.auth.getSession();

    if (error || !session) {
        forceLogout("เซสชั่นของคุณหมดอายุ กรุณาเข้าสู่ระบบใหม่");
        return;
    }

    // 🟢 ตรวจสอบการปล่อยทิ้งไว้นานเกิน 24 ชม. (Inactivity Check)
    const lastActivity = localStorage.getItem('lastActivityTime');
    if (lastActivity) {
        const timePassed = Date.now() - parseInt(lastActivity);
        
        if (timePassed > INACTIVITY_LIMIT_MS) {
            forceLogout("คุณไม่ได้ใช้งานระบบนานเกิน 24 ชั่วโมง ระบบได้ทำการออกจากระบบอัตโนมัติเพื่อความปลอดภัย");
            return;
        }
    } else {
        // ถ้าไม่มีค่าเลย (อาจจะเผลอลบทิ้ง) ให้เซ็ตใหม่
        updateActivityTime();
    }
}

// ฟังก์ชันอัปเดตเวลาล่าสุด (ลดการทำงานซ้ำซ้อนด้วย Throttle)
let activityTimeout = null;
function updateActivityTime() {
    if (!activityTimeout) {
        localStorage.setItem('lastActivityTime', Date.now().toString());
        // อัปเดตลงเครื่องแค่ทุกๆ 10 วินาที เพื่อไม่ให้เบราว์เซอร์ทำงานหนักเกินไป
        activityTimeout = setTimeout(() => { activityTimeout = null; }, 10000);
    }
}

// ฟังก์ชันเตะออกจากระบบ
async function forceLogout(message) {
    await db.auth.signOut();
    localStorage.removeItem('lastActivityTime');
    alert(message);
    window.location.href = 'login.html';
}

// 🟢 ดักจับพฤติกรรมผู้ใช้ เพื่อต่อเวลา 24 ชม. ออกไปเรื่อยๆ ถ้ายังนั่งทำงานอยู่
['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    document.addEventListener(evt, updateActivityTime, { passive: true });
});

// รันการตรวจสอบทันทีที่โหลดหน้าเสร็จ
verifySession();