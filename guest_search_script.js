const SUPABASE_URL = 'http://192.168.2.200:8000';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'; 
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
    // 1. ทำให้ช่องค้นหาพิมพ์ได้ทีละช่อง
    setupExclusiveInputs();
    
    // 2. ผูกระบบ Autocomplete
    autocomplete(document.getElementById("searchName"), 'name');
    autocomplete(document.getElementById("searchBookingId"), 'booking_id');
    autocomplete(document.getElementById("searchOta"), 'ota');
});

// ==========================================
// 🟢 ระบบบังคับให้กรอกทีละช่อง
// ==========================================
function setupExclusiveInputs() {
    const inputs = ['searchName', 'searchBookingId', 'searchOta'];
    inputs.forEach(id => {
        document.getElementById(id).addEventListener('input', function() {
            if (this.value.trim() !== '') {
                inputs.forEach(otherId => {
                    if (otherId !== id) document.getElementById(otherId).value = '';
                });
            }
        });
    });
}

// ==========================================
// 🟢 ระบบ Autocomplete + ลูกศรขึ้นลง
// ==========================================
function autocomplete(inp, type) {
    let currentFocus;
    let timeoutId;

    inp.addEventListener("input", function(e) {
        let a, b, val = this.value;
        closeAllLists();
        if (!val) { return false; }
        currentFocus = -1;

        // หน่วงเวลาพิมพ์ (Debounce) เพื่อไม่ให้ยิง Database รัวๆ
        clearTimeout(timeoutId);
        timeoutId = setTimeout(async () => {
            a = document.createElement("DIV");
            a.setAttribute("id", this.id + "autocomplete-list");
            a.setAttribute("class", "autocomplete-items");
            this.parentNode.appendChild(a);

            // ดึงข้อมูลจากฐานข้อมูลตามประเภท
            let results = [];
            if (type === 'name') {
                const { data } = await db.from('customers').select('name').ilike('name', `%${val}%`).limit(10);
                results = (data || []).map(d => d.name);
            } else if (type === 'booking_id') {
                const { data } = await db.from('bookings').select('booking_id').textSearch('booking_id::text', `'${val}'`).limit(10);
                results = (data || []).map(d => d.booking_id.toString());
            } else if (type === 'ota') {
                const { data } = await db.from('bookings').select('ota_reference_number').ilike('ota_reference_number', `%${val}%`).limit(10);
                results = (data || []).map(d => d.ota_reference_number).filter(Boolean);
            }

            // ลบข้อมูลที่ซ้ำกัน
            results = [...new Set(results)];

            results.forEach(item => {
                b = document.createElement("DIV");
                b.innerHTML = `<strong>${item.substr(0, val.length)}</strong>${item.substr(val.length)}`;
                b.innerHTML += `<input type='hidden' value='${item}'>`;
                b.addEventListener("click", function(e) {
                    inp.value = this.getElementsByTagName("input")[0].value;
                    closeAllLists();
                    executeSearch(); // กดเลือกปุ๊บ ค้นหาให้เลย
                });
                a.appendChild(b);
            });
        }, 300);
    });

    inp.addEventListener("keydown", function(e) {
        let x = document.getElementById(this.id + "autocomplete-list");
        if (x) x = x.getElementsByTagName("div");
        if (e.keyCode == 40) { // ลูกศรลง
            currentFocus++;
            addActive(x);
        } else if (e.keyCode == 38) { // ลูกศรขึ้น
            currentFocus--;
            addActive(x);
        } else if (e.keyCode == 13) { // Enter
            e.preventDefault();
            if (currentFocus > -1) {
                if (x) x[currentFocus].click();
            } else {
                executeSearch(); // ถ้าพิมพ์เสร็จแล้วกด Enter ให้ค้นหาเลย
            }
        }
    });

    function addActive(x) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add("autocomplete-active");
    }
    function removeActive(x) {
        for (let i = 0; i < x.length; i++) {
            x[i].classList.remove("autocomplete-active");
        }
    }
    function closeAllLists(elmnt) {
        let x = document.getElementsByClassName("autocomplete-items");
        for (let i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != inp) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
    }
    document.addEventListener("click", function (e) { closeAllLists(e.target); });
}

// ==========================================
// 🟢 ฟังก์ชันค้นหาหลัก และวาดตาราง
// ==========================================
async function executeSearch() {
    const sName = document.getElementById("searchName").value.trim();
    const sId = document.getElementById("searchBookingId").value.trim();
    const sOta = document.getElementById("searchOta").value.trim();

    const tbody = document.getElementById('resultTableBody');

    if (!sName && !sId && !sOta) {
        tbody.innerHTML = '<tr><td colspan="7" style="color: red;">กรุณากรอกข้อมูลเพื่อค้นหาครับ</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="7">⏳ กำลังค้นหาข้อมูล...</td></tr>';

    try {
        let query = db.from('bookings').select(`
            booking_id, total_price, ota_reference_number,
            customers ( name ),
            booking_rooms (
                room_id, check_in_date, check_out_date,
                room_guests ( guest_name, is_primary )
            )
        `);

        // เลือกฟิลเตอร์ตามช่องที่มีข้อมูล
        if (sId) {
            query = query.eq('booking_id', sId);
        } else if (sOta) {
            query = query.ilike('ota_reference_number', `%${sOta}%`);
        } else if (sName) {
            // ถ้าหาด้วยชื่อ ต้องหาจากตารางลูกค้าหลัก
            const { data: custData } = await db.from('customers').select('customer_id').ilike('name', `%${sName}%`);
            const custIds = (custData || []).map(c => c.customer_id);
            if (custIds.length > 0) {
                query = query.in('customer_id', custIds);
            } else {
                tbody.innerHTML = '<tr><td colspan="7" style="color: gray;">ไม่พบประวัติลูกค้าชื่อนี้ครับ</td></tr>';
                return;
            }
        }

        const { data, error } = await query.order('booking_id', { ascending: false });
        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="color: gray;">ไม่พบข้อมูลการจองที่ตรงกับคำค้นหาครับ</td></tr>';
            return;
        }

        let html = '';
        const now = new Date().getTime();

        data.forEach(b => {
            const rooms = b.booking_rooms || [];
            if (rooms.length === 0) return;

            // 1. คำนวณหาเวลา Check-out ของบิลนี้ (ยึดตามห้องแรก สมมติว่า Check-out ตอน 12:00)
            const coDateStr = rooms[0].check_out_date;
            const coTime = new Date(`${coDateStr}T12:00:00`).getTime(); 
            
            // 2. เช็คว่า Check-out ผ่านมาเกิน 24 ชม. หรือยัง?
            const diffHours = (now - coTime) / (1000 * 60 * 60);
            const isLocked = diffHours > 24; 
            
            const rowClass = isLocked ? "locked-row" : "row-hover";
            const badge = isLocked ? `<span class="badge-locked">🔒 ดูได้อย่างเดียว</span>` : `<span class="badge-edit">✏️ แก้ไขได้</span>`;
            
            // 3. สร้างแถวของแต่ละห้อง
            rooms.forEach((room, index) => {
                // หาชื่อผู้เข้าพักในห้อง ถ้าไม่มีให้ใช้ชื่อคนจองหลัก
                const primaryGuest = (room.room_guests || []).find(g => g.is_primary) || room.room_guests?.[0] || {};
                const guestName = primaryGuest.guest_name || b.customers.name || '-';

                // โชว์ Booking ID และ ราคารวม "เฉพาะแถวแรก" ของบิลนั้น
                const bIdDisplay = index === 0 ? `<b>#${b.booking_id}</b>` : '';
                const priceDisplay = index === 0 ? `<b>${parseFloat(b.total_price).toLocaleString()}</b>` : `<span style="color:#ccc;">(รวมด้านบน)</span>`;
                const badgeDisplay = index === 0 ? badge : '';

                // แปลงวันที่ให้อ่านง่าย
                const formatD = (d) => d ? d.split('-').reverse().join('/') : '-';

                html += `
                    <tr class="${rowClass}" onclick="goToBooking('${b.booking_id}', ${isLocked})">
                        <td>${bIdDisplay}</td>
                        <td style="text-align: left; color: #2e7d32; font-weight: bold;">${guestName}</td>
                        <td><b>${room.room_id}</b></td>
                        <td>${formatD(room.check_in_date)}</td>
                        <td>${formatD(room.check_out_date)}</td>
                        <td style="color: #1565c0;">${priceDisplay}</td>
                        <td>${badgeDisplay}</td>
                    </tr>
                `;
            });
        });

        tbody.innerHTML = html;

    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="7" style="color:red;">❌ Error: ${e.message}</td></tr>`;
    }
}

// ==========================================
// 🟢 ฟังก์ชันคลิกที่แถวเพื่อไปหน้า Booking
// ==========================================
function goToBooking(bookingId, isLocked) {
    // 🟢 เปลี่ยนจาก id= เป็น edit= เพื่อให้ตรงกับระบบเดิมของคุณ
    const url = `booking.html?edit=${bookingId}${isLocked ? '&viewOnly=true' : ''}`;
    
    if (isLocked) {
        alert(`⚠️ บิล #${bookingId} นี้เช็คเอาท์ไปเกิน 24 ชั่วโมงแล้ว\nระบบจะเปิดให้ "ดูข้อมูลได้อย่างเดียว" ไม่สามารถบันทึกแก้ไขได้ครับ`);
    }
    
    window.location.href = url;
}