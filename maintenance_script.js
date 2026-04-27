// --- 1. ตั้งค่า Supabase ---
const SUPABASE_URL = 'http://192.168.2.200:8000';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'; 
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
    // ล็อคไม่ให้เลือกวันที่ย้อนหลังใน Modal
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('mtStartDate').setAttribute('min', today);
    
    // ถ้าเปลี่ยนวันเริ่ม ให้บังคับวันสิ้นสุดต้องมากกว่าหรือเท่ากับวันเริ่ม
    document.getElementById('mtStartDate').addEventListener('change', function() {
        document.getElementById('mtEndDate').setAttribute('min', this.value);
    });

    loadRoomDropdown();
    loadMaintenanceData();
});

// โหลดรายชื่อห้องใส่ Dropdown
async function loadRoomDropdown() {
    const { data } = await db.from('rooms').select('room_id').order('room_id', { ascending: true });
    const select = document.getElementById('mtRoomId');
    select.innerHTML = '<option value="">-- เลือกห้องพัก --</option>';
    (data || []).forEach(r => {
        select.innerHTML += `<option value="${r.room_id}">${r.room_id}</option>`;
    });
}

function openMaintenanceModal() {
    document.getElementById('maintenanceModal').style.display = 'flex';
}

function closeMaintenanceModal() {
    document.getElementById('maintenanceModal').style.display = 'none';
    document.getElementById('mtRoomId').value = '';
    document.getElementById('mtStartDate').value = '';
    document.getElementById('mtEndDate').value = '';
    document.getElementById('mtReason').value = '';
}

// 🟢 ฟังก์ชันบันทึกข้อมูล
async function saveMaintenance() {
    const roomId = document.getElementById('mtRoomId').value;
    const startDate = document.getElementById('mtStartDate').value;
    const endDate = document.getElementById('mtEndDate').value;
    const reason = document.getElementById('mtReason').value.trim();

    if (!roomId || !startDate || !endDate || !reason) {
        alert("⚠️ กรุณากรอกข้อมูลให้ครบทุกช่องครับ");
        return;
    }

    if (startDate > endDate) {
        alert("⚠️ วันสิ้นสุด ต้องไม่น้อยกว่าวันเริ่มปิดห้องครับ");
        return;
    }

    try {
        const { error } = await db.from('maintenance_rooms').insert([{
            room_id: roomId,
            start_date: startDate,
            end_date: endDate,
            reason: reason
        }]);

        if (error) throw error;
        
        closeMaintenanceModal();
        loadMaintenanceData(); // โหลดตารางใหม่

    } catch (error) {
        alert("❌ เกิดข้อผิดพลาดในการบันทึก: " + error.message);
    }
}

// 🟢 ฟังก์ชันโหลดข้อมูลตาราง + ตรวจจับการชนกันของบิลลูกค้า
async function loadMaintenanceData() {
    const tbody = document.getElementById('maintenanceTableBody');
    tbody.innerHTML = '<tr><td colspan="6">⏳ กำลังโหลด...</td></tr>';

    try {
        // 1. ดึงข้อมูลห้องเสียทั้งหมดที่ยังไม่หมดอายุ (ปิดซ่อมในอนาคต หรือ ปัจจุบัน)
        const today = new Date().toISOString().split('T')[0];
        const { data: mtData, error: mtErr } = await db.from('maintenance_rooms')
            .select('*')
            .gte('end_date', today)
            .order('start_date', { ascending: true });

        if (mtErr) throw mtErr;

        if (!mtData || mtData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="color: green;">✅ ปัจจุบันไม่มีห้องที่แจ้งปิดซ่อมบำรุงครับ</td></tr>';
            return;
        }

        // 2. ดึงข้อมูลบิลลูกค้า (เฉพาะอันที่ยังไม่ยกเลิก) เพื่อเอามาเทียบหาการชนกัน (Overlap)
        const { data: bookings } = await db.from('booking_rooms')
            .select(`
                booking_room_id, room_id, check_in_date, check_out_date,
                bookings!inner(booking_id, booking_status)
            `)
            .neq('bookings.booking_status', 'Cancelled');

        let html = '';
        const formatDate = (dStr) => dStr ? dStr.split('-').reverse().join('/') : '-';

        mtData.forEach(mt => {
            // 3. ตรรกะตรวจจับบิลที่ชนกัน
            let conflictBadges = '';
            
            (bookings || []).forEach(b => {
                // เช็คว่าห้องตรงกันไหม และ วันที่ทับซ้อนกันหรือไม่?
                // ทับซ้อน = (CheckIn ลูกค้า < วันสิ้นสุดซ่อม) AND (CheckOut ลูกค้า > วันเริ่มซ่อม)
                if (b.room_id === mt.room_id) {
                    const isOverlap = (b.check_in_date < mt.end_date) && (b.check_out_date > mt.start_date);
                    
                    if (isOverlap) {
                        // ถ้าชนกัน ให้สร้างป้ายสีส้ม แปะลิงก์ให้กดไปแก้ไขบิลได้
                        conflictBadges += `
                            <a href="booking.html?edit=${b.bookings.booking_id}" target="_blank" class="badge-conflict" title="คลิกเพื่อไปย้ายห้อง">
                                🚨 #${b.bookings.booking_id}
                            </a>
                        `;
                    }
                }
            });

            if (conflictBadges === '') {
                conflictBadges = '<span style="color: green; font-size: 12px;">✅ ไม่มีลูกค้ารับผลกระทบ</span>';
            }

            // 4. วาดตาราง
            html += `
                <tr>
                    <td style="font-weight: bold; color: #d32f2f;">${mt.room_id}</td>
                    <td>${formatDate(mt.start_date)}</td>
                    <td>${formatDate(mt.end_date)}</td>
                    <td style="text-align: left;">${mt.reason}</td>
                    <td>${conflictBadges}</td>
                    <td>
                        <button onclick="deleteMaintenance('${mt.id}')" style="background: white; border: 1px solid #d32f2f; color: #d32f2f; cursor: pointer; padding: 4px 8px; border-radius: 4px;">🗑️ ลบ</button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="color: red;">❌ Error: ${error.message}</td></tr>`;
    }
}

// 🟢 ฟังก์ชันลบรายการปิดห้อง (เมื่อซ่อมเสร็จก่อนกำหนด)
async function deleteMaintenance(id) {
    if(!confirm("คุณต้องการลบรายการปิดห้องนี้ใช่หรือไม่? (ห้องจะกลับมาเปิดให้จองได้ปกติ)")) return;

    try {
        const { error } = await db.from('maintenance_rooms').delete().eq('id', id);
        if (error) throw error;
        loadMaintenanceData(); // รีเฟรชตาราง
    } catch (error) {
        alert("เกิดข้อผิดพลาด: " + error.message);
    }
}