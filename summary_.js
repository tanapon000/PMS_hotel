
// --- ตั้งค่า Supabase ---
const SUPABASE_URL = 'http://192.168.2.200:8000'; // ⚠️ เปลี่ยนเป็น URL ของคุณ
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ตัวแปรเก็บข้อมูลเพื่อใช้แสดงใน Modal
let channelCache = {};
const predefinedChannels = ['Walk-in', 'Direct Call', 'Line','Trip','Agoda', 'Booking.com', 'Expedia', 'Facebook'];

document.addEventListener('DOMContentLoaded', () => {
    // ตั้งค่าเริ่มต้นให้วันที่: เลือกตั้งแต่วันที่ 1 ของเดือนนี้ ถึง สิ้นเดือน
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    // หักล้าง Timezone ไทย เพื่อไม่ให้วันที่เพี้ยน
    const toLocalISODate = (d) => new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    document.getElementById('startDate').value = toLocalISODate(firstDay);
    document.getElementById('endDate').value = toLocalISODate(lastDay);
    
    // โหลดข้อมูลอัตโนมัติตอนเปิดหน้า
    loadManagerData();
});

// ฟังก์ชันคำนวณหาจำนวน "คืนที่ทับซ้อนกัน (Overlap Nights)"
function getOverlapNights(bIn, bOut, qIn, qOut) {
    const start = new Date(Math.max(new Date(bIn).getTime(), new Date(qIn).getTime()));
    const end = new Date(Math.min(new Date(bOut).getTime(), new Date(qOut).getTime()));
    const diffTime = end.getTime() - start.getTime();
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return nights > 0 ? nights : 0;
}

async function loadManagerData() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    if(!startDate || !endDate) return alert("กรุณาเลือกวันที่ให้ครบถ้วน");

    document.getElementById('managerTableBody').innerHTML = '<tr><td colspan="4">⏳ กำลังดึงและคำนวณข้อมูล...</td></tr>';

    try {
        // ==========================================
        // 1. คำนวณการเงิน (Financial Data)
        // ==========================================
        const startDateTime = `${startDate}T00:00:00+07:00`;
        const endDateTime = `${endDate}T23:59:59+07:00`;

        // ดึงบิลที่มีประวัติการจ่ายเงินในช่วงเวลาที่เลือก (ทั้งมัดจำและชำระปิด)
        const { data: moneyData } = await db.from('bookings')
            .select('deposit_amount, deposit_payment_method, deposit_payment_time, remaining_amount, final_payment_method, final_payment_time')
            .or(`deposit_payment_time.gte.${startDateTime},final_payment_time.gte.${startDateTime}`);

        let cash = 0, transfer = 0, credit = 0, qr = 0;
        
        const addMoney = (method, amount) => {
            if(!method || amount <= 0) return;
            let m = method.toLowerCase();
            if (m.includes('cash') || m.includes('สด')) cash += amount;
            else if (m.includes('transfer') || m.includes('โอน')) transfer += amount;
            else if (m.includes('credit') || m.includes('เครดิต')) credit += amount;
            else if (m.includes('qr') || m.includes('promptpay')) qr += amount;
        };

        const sTime = new Date(startDateTime).getTime();
        const eTime = new Date(endDateTime).getTime();

        (moneyData || []).forEach(b => {
            // เช็คมัดจำ
            if (b.deposit_payment_time) {
                let t = new Date(b.deposit_payment_time).getTime();
                if (t >= sTime && t <= eTime) addMoney(b.deposit_payment_method, parseFloat(b.deposit_amount));
            }
            // เช็คยอดชำระส่วนที่เหลือ
            if (b.final_payment_time) {
                let t = new Date(b.final_payment_time).getTime();
                if (t >= sTime && t <= eTime) addMoney(b.final_payment_method, parseFloat(b.remaining_amount));
            }
        });

        document.getElementById('mngCash').textContent = cash.toLocaleString();
        document.getElementById('mngTransfer').textContent = transfer.toLocaleString();
        document.getElementById('mngCredit').textContent = credit.toLocaleString();
        document.getElementById('mngQr').textContent = qr.toLocaleString();


        // ==========================================
        // 2. คำนวณ Room Nights แยกตาม Channel
        // ==========================================
        
        // บวกวันที่ค้นหาไปอีก 1 วัน (เพราะ Check-out คือตอนเช้าของวันถัดไป)
        const qOutObj = new Date(endDate);
        qOutObj.setDate(qOutObj.getDate() + 1);
        const queryEndDate = qOutObj.toISOString().split('T')[0];

        // ดึงเฉพาะห้องที่ "เข้าพักทับซ้อนกับช่วงเวลาที่ค้นหา" และ "บิลยังไม่ถูกยกเลิก"
        const { data: roomData, error: roomErr } = await db.from('booking_rooms')
            .select(`
                booking_room_id, room_id, check_in_date, check_out_date,
                room_guests (actual_check_in_time),
                bookings!inner (booking_id, booking_channel, ota_reference_number, total_price, deposit_amount, customers(name))
            `)
            .lt('check_in_date', queryEndDate) 
            .gt('check_out_date', startDate)
            .neq('bookings.booking_status', 'Cancelled');

        if (roomErr) throw roomErr;

        // ล้าง Cache เก่า และเตรียมโครงสร้างใหม่
        channelCache = {};
        predefinedChannels.forEach(ch => { channelCache[ch] = { checkedIn: 0, notCheckedIn: 0, bookingsMap: {} }; });
        channelCache['Other'] = { checkedIn: 0, notCheckedIn: 0, bookingsMap: {} };

        let totalRoomNights = 0;

        (roomData || []).forEach(br => {
            // 1. คำนวณจำนวนคืนที่ตกอยู่ในช่วงเวลาที่ค้นหา (เช่น เข้าพัก 10 วัน แต่ช่วงที่เราดูรีพอร์ตครอบคลุมแค่ 3 วัน ก็นับแค่ 3)
            const overlapNights = getOverlapNights(br.check_in_date, br.check_out_date, startDate, queryEndDate);
            totalRoomNights += overlapNights;

            // 2. จัดกลุ่ม Channel
            let rawChannel = br.bookings.booking_channel || 'Other';
            let mappedChannel = 'Other';

            if (predefinedChannels.includes(rawChannel)) {
                mappedChannel = rawChannel;
            } else {
                const lowerRaw = rawChannel.toLowerCase();
                if (lowerRaw.includes('agoda')) mappedChannel = 'Agoda';
                else if (lowerRaw.includes('booking')) mappedChannel = 'Booking.com';
                else if (lowerRaw.includes('expedia')) mappedChannel = 'Expedia';
                else if (lowerRaw.includes('facebook')) mappedChannel = 'Facebook';
            }

            // 3. แยกสถานะ Check-in (ดูว่ามีแขกคนไหนลงเวลาเข้าพักหรือยัง)
            const hasCheckIn = br.room_guests && br.room_guests.some(g => g.actual_check_in_time !== null);

            if (hasCheckIn) channelCache[mappedChannel].checkedIn += overlapNights;
            else channelCache[mappedChannel].notCheckedIn += overlapNights;

            // 4. บันทึกข้อมูลบิลลงใน Cache สำหรับเปิดดูรายละเอียด (รวบรวมวันที่เข้าพักที่ครอบคลุมที่สุดของบิลนั้นๆ)
            const bId = br.bookings.booking_id;
            const b = br.bookings;
            
            if (!channelCache[mappedChannel].bookingsMap[bId]) {
                channelCache[mappedChannel].bookingsMap[bId] = {
                    booking_id: bId,
                    customer_name: b.customers?.name || '-',
                    ota_ref: b.ota_reference_number || '-',
                    check_in: br.check_in_date,
                    check_out: br.check_out_date,
                    total_price: parseFloat(b.total_price) || 0,
                    deposit_amount: parseFloat(b.deposit_amount) || 0
                };
            } else {
                // ถ้าบิลนี้จองหลายห้อง ให้ขยายช่วงวันที่เช็คอิน/เอาท์ ให้ครอบคลุมทุกห้อง
                if (br.check_in_date < channelCache[mappedChannel].bookingsMap[bId].check_in) {
                    channelCache[mappedChannel].bookingsMap[bId].check_in = br.check_in_date;
                }
                if (br.check_out_date > channelCache[mappedChannel].bookingsMap[bId].check_out) {
                    channelCache[mappedChannel].bookingsMap[bId].check_out = br.check_out_date;
                }
            }
        });

        // อัปเดตตัวเลข Room Nights รวม
        document.getElementById('mngRoomNights').textContent = totalRoomNights.toLocaleString();

        // 3. แสดงผลลงตาราง
        const tbody = document.getElementById('managerTableBody');
        tbody.innerHTML = '';
        let sumCheckedIn = 0, sumNotCheckedIn = 0;

        Object.keys(channelCache).forEach(ch => {
            const stat = channelCache[ch];
            const total = stat.checkedIn + stat.notCheckedIn;
            
            if (total === 0 && ch === 'Other') return; // ซ่อนช่องทาง Other ถ้าไม่มีตัวเลข

            sumCheckedIn += stat.checkedIn;
            sumNotCheckedIn += stat.notCheckedIn;

            tbody.innerHTML += `
                <tr onclick="openChannelModal('${ch}')" style="cursor:pointer;">
                    <td style="text-align:left; font-weight:bold; color:#2196F3;">📌 ${ch}</td>
                    <td style="color:#2e7d32; font-weight:bold;">${stat.checkedIn.toLocaleString()}</td>
                    <td style="color:#c62828;">${stat.notCheckedIn.toLocaleString()}</td>
                    <td style="font-weight:bold;">${total.toLocaleString()}</td>
                </tr>
            `;
        });

        // แถวสรุปรวมด้านล่างสุด
        tbody.innerHTML += `
            <tr style="background-color:#e3f2fd; font-size:16px;">
                <td style="text-align:right; font-weight:bold;">รวมทั้งหมด:</td>
                <td style="color:#2e7d32; font-weight:bold;">${sumCheckedIn.toLocaleString()}</td>
                <td style="color:#c62828; font-weight:bold;">${sumNotCheckedIn.toLocaleString()}</td>
                <td style="font-weight:bold; color:#1565c0;">${(sumCheckedIn + sumNotCheckedIn).toLocaleString()}</td>
            </tr>
        `;
        await loadExpenseData(startDate, endDate);

    } catch (error) {
        console.error("Manager Dashboard Error:", error);
        document.getElementById('managerTableBody').innerHTML = `<tr><td colspan="4" style="color:red;">❌ เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
    }
}


// ==========================================
// ฟังก์ชันดึงข้อมูลรายจ่าย
// ==========================================
async function loadExpenseData(startDate, endDate) {
    const tbody = document.getElementById('expenseTableBody');
    tbody.innerHTML = '<tr><td colspan="4">⏳ กำลังดึงข้อมูลรายจ่าย...</td></tr>';

    try {
        // ดึงเฉพาะรายจ่ายที่วันที่เกิดรายการ (transaction_date) อยู่ในช่วงที่เลือก
        const { data, error } = await db.from('other_transactions')
            .select('*')
            .eq('transaction_type', 'Expense')
            .gte('transaction_date', startDate)
            .lte('transaction_date', endDate)
            .order('transaction_date', { ascending: true });

        if (error) throw error;

        let totalExp = 0, expCash = 0, expTransfer = 0, expCredit = 0, expQr = 0;
        let html = '';

        if (data && data.length > 0) {
            data.forEach(item => {
                const amt = parseFloat(item.amount) || 0;
                totalExp += amt;

                // แยกยอดตามวิธีการจ่ายเงิน
                const method = item.payment_method || '';
                const mLower = method.toLowerCase();
                
                if (mLower.includes('เงินสด') || mLower.includes('cash')) expCash += amt;
                else if (mLower.includes('โอน') || mLower.includes('transfer')) expTransfer += amt;
                else if (mLower.includes('เครดิต') || mLower.includes('credit')) expCredit += amt;
                else if (mLower.includes('qr') || mLower.includes('promptpay')) expQr += amt;

                // แปลงวันที่ YYYY-MM-DD เป็น DD/MM/YYYY
                const displayDate = item.transaction_date ? item.transaction_date.split('-').reverse().join('/') : '-';

                html += `
                    <tr>
                        <td>${displayDate}</td>
                        <td style="text-align: left;">${item.category}</td>
                        <td>${method}</td>
                        <td style="color: #c62828; font-weight: bold;">${amt.toLocaleString()}</td>
                    </tr>
                `;
            });
        } else {
            html = '<tr><td colspan="4" style="color: gray;">ไม่มีข้อมูลรายจ่ายในช่วงเวลานี้</td></tr>';
        }

        // โยนตัวเลขใส่กล่องสรุป
        document.getElementById('expTotal').textContent = totalExp.toLocaleString();
        document.getElementById('expCash').textContent = expCash.toLocaleString();
        document.getElementById('expTransfer').textContent = expTransfer.toLocaleString();
        document.getElementById('expCredit').textContent = expCredit.toLocaleString();
        document.getElementById('expQr').textContent = expQr.toLocaleString();
        
        // วาดตาราง
        tbody.innerHTML = html;

    } catch (error) {
        console.error("Expense Data Error:", error);
        tbody.innerHTML = `<tr><td colspan="4" style="color: red;">❌ เกิดข้อผิดพลาดในการโหลดรายจ่าย: ${error.message}</td></tr>`;
    }
}

// ==========================================
// ฟังก์ชันเปิด Modal แสดงรายละเอียดบิล
// ==========================================
function openChannelModal(channelName) {
    const stat = channelCache[channelName];
    if (!stat) return;

    document.getElementById('modalChannelName').textContent = channelName;
    const tbody = document.getElementById('modalTableBody');
    tbody.innerHTML = '';

    // ดึง Value ออกมาจาก Object
    const bookingsList = Object.values(stat.bookingsMap);

    if (bookingsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:gray;">ไม่มีรายการจองในช่วงเวลานี้</td></tr>';
    } else {
        // เรียงลำดับจาก Check-in ก่อนไปหลัง
        bookingsList.sort((a, b) => new Date(a.check_in) - new Date(b.check_in));

        bookingsList.forEach(b => {
            const remaining = b.total_price - b.deposit_amount;
            let balanceDisplay = remaining <= 0 
                ? '<span style="color:green; font-weight:bold;">0 (ชำระครบ)</span>'
                : `<span style="color:red; font-weight:bold;">${remaining.toLocaleString()}</span>`;

            tbody.innerHTML += `
                <tr>
                    <td style="font-weight:bold;">#${b.booking_id}</td>
                    <td style="text-align:left;">${b.customer_name}</td>
                    <td>${b.ota_ref}</td>
                    <td>${b.check_in}</td>
                    <td>${b.check_out}</td>
                    <td>${balanceDisplay}</td>
                </tr>
            `;
        });
    }

    document.getElementById('channelModal').style.display = 'block';
}

function closeChannelModal() {
    document.getElementById('channelModal').style.display = 'none';
}

// คลิกพื้นหลังสีดำเพื่อปิด Modal
window.onclick = function(event) {
    const modal = document.getElementById('channelModal');
    if (event.target === modal) {
        closeChannelModal();
    }
}