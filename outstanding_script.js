// --- 1. ตั้งค่า Supabase ---
const SUPABASE_URL = 'http://192.168.2.200:8000';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
    loadOutstandingBalances();
});

async function loadOutstandingBalances() {
    const tbody = document.getElementById('outstandingTableBody');
    const todayStr = new Date().toISOString().split('T')[0]; // วันที่ปัจจุบัน YYYY-MM-DD

    try {
        // 1. ดึงข้อมูลห้องพักที่เลยวัน Check-out มาแล้ว และบิลไม่ได้ถูกยกเลิก
        const { data, error } = await db.from('booking_rooms')
            .select(`
                room_id, check_in_date, check_out_date,
                bookings!inner (booking_id, total_price, deposit_amount, remaining_amount, booking_status, customers(name))
            `)
            .lt('check_out_date', todayStr) // เลยวันเช็คเอาท์มาแล้ว
            .neq('bookings.booking_status', 'Cancelled')
            .order('check_out_date', { ascending: false });

        if (error) throw error;

        // 2. คัดกรองและจัดกลุ่มข้อมูลเฉพาะบิลที่ "มียอดค้าง" (Group by Booking ID)
        const debtMap = {};
        let grandTotalDebt = 0;

        (data || []).forEach(row => {
            const b = row.bookings;
            const total = parseFloat(b.total_price) || 0;
            const dep = parseFloat(b.deposit_amount) || 0;
            const paid = parseFloat(b.remaining_amount) || 0;
            const pending = total - dep - paid;

            if (pending > 0) { // ถ้ายังจ่ายไม่ครบ
                if (!debtMap[b.booking_id]) {
                    debtMap[b.booking_id] = {
                        booking_id: b.booking_id,
                        customer_name: b.customers?.name || 'ไม่ระบุ',
                        total_price: total,
                        paid_amount: dep + paid,
                        pending_amount: pending,
                        rooms: []
                    };
                    grandTotalDebt += pending; // สะสมยอดหนี้รวม
                }
                
                // เก็บรายชื่อห้องเข้าไปในบิลนี้
                debtMap[b.booking_id].rooms.push({
                    room_id: row.room_id,
                    check_in: row.check_in_date,
                    check_out: row.check_out_date
                });
            }
        });

        // 3. วาดตาราง
        const bookingIds = Object.keys(debtMap);
        
        if (bookingIds.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="color: green; padding: 30px;">✅ ยอดเยี่ยม! ไม่มีบิลเลยกำหนดที่ค้างชำระครับ</td></tr>';
            document.getElementById('sumTotalDebt').textContent = "0";
            return;
        }

        let html = '';
        const formatDate = (dStr) => dStr ? dStr.split('-').reverse().join('/') : '-';

        // วนลูปวาดทีละบิล
        bookingIds.forEach(bId => {
            const bk = debtMap[bId];
            
            // วนลูปวาดทีละห้องในบิลนั้นๆ
            bk.rooms.forEach((room, index) => {
                // แสดงรายละเอียดการเงินเฉพาะ "บรรทัดแรก" ของบิล เพื่อไม่ให้รก
                const isFirstRow = index === 0;
                
                const bIdDisplay = isFirstRow ? `<b>#${bk.booking_id}</b>` : '';
                const nameDisplay = isFirstRow ? `<b>${bk.customer_name}</b>` : '';
                const totalDisplay = isFirstRow ? bk.total_price.toLocaleString() : '-';
                const paidDisplay = isFirstRow ? `<span style="color: #2e7d32;">${bk.paid_amount.toLocaleString()}</span>` : '-';
                const pendingDisplay = isFirstRow ? `<b style="color: #c62828;">${bk.pending_amount.toLocaleString()}</b>` : '-';

                // คลิกที่แถวให้ส่งไปหน้าจอง พร้อมแนบพารามิเตอร์ ?resolveDebt=true เพื่อขอปลดล็อคหน้าจอ
                html += `
                    <tr class="row-hover" onclick="window.location.href='booking.html?edit=${bk.booking_id}&resolveDebt=true'">
                        <td>${bIdDisplay}</td>
                        <td style="text-align: left; color: #1565c0;">${nameDisplay}</td>
                        <td style="font-weight: bold;">${room.room_id}</td>
                        <td>${formatDate(room.check_in)}</td>
                        <td style="color: #e65100;">${formatDate(room.check_out)}</td>
                        <td>${totalDisplay}</td>
                        <td>${paidDisplay}</td>
                        <td style="background-color: ${isFirstRow ? '#ffebee' : 'transparent'};">${pendingDisplay}</td>
                    </tr>
                `;
            });
        });

        tbody.innerHTML = html;
        document.getElementById('sumTotalDebt').textContent = grandTotalDebt.toLocaleString();

    } catch (error) {
        console.error("Load Debt Error:", error);
        tbody.innerHTML = `<tr><td colspan="8" style="color: red;">❌ เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
    }
}