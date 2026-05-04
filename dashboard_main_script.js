// --- 1. ตั้งค่า Supabase ---
const SUPABASE_URL = 'http://192.168.2.200:8000';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'; 
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function changeDate(daysToAdd, inputId) {
    const dateInput = document.getElementById(inputId);
    if (!dateInput || !dateInput.value) return;

    // 1. ดึงวันที่ปัจจุบันจากกล่อง
    const currentDate = new Date(dateInput.value);
    
    // 2. บวก/ลบ จำนวนวัน
    currentDate.setDate(currentDate.getDate() + daysToAdd);

    // 3. แปลงกลับเป็นรูปแบบ YYYY-MM-DD (แก้ปัญหา Timezone เลื่อน)
    const tzOffset = currentDate.getTimezoneOffset() * 60000;
    const newDateStr = new Date(currentDate - tzOffset).toISOString().split('T')[0];

    // 4. อัปเดตค่ากลับลงไปในกล่อง
    dateInput.value = newDateStr;

    // 5. 💥 สำคัญมาก: ส่งสัญญาณ 'change' เพื่อให้ฟังก์ชันจำวันที่และโหลดตารางทำงานต่ออัตโนมัติ
    const event = new Event('change');
    dateInput.dispatchEvent(event);
}
function updateDateDisplay(dateStr) {
    if (!dateStr) return;
    const d = new Date(dateStr);
    const monthsTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const day = d.getDate();
    const month = monthsTH[d.getMonth()];
    const year = d.getFullYear() + 543;
    const displayEl = document.getElementById('displaySelectedDate');
    if (displayEl) {
        displayEl.textContent = `วันที่ ${day} ${month} ${year}`;
    }
}

// --- 2. ทำงานเมื่อเปิดหน้าเว็บ ---
document.addEventListener('DOMContentLoaded', () => {
    // สมมติว่า input วันที่ของคุณมี id="dashboardDate" (ปรับให้ตรงกับ HTML ของคุณนะครับ)
    const dateInput = document.getElementById('dashboardDate'); 
    
    if (dateInput) {
        // 1. เช็คว่ามี "วันที่" ที่เคยเลือกและจำไว้ในระบบหรือไม่?
        let savedDate = localStorage.getItem('pms_selected_date');
        
        if (!savedDate) {
            // ถ้าไม่เคยมี (เพิ่งเปิดเว็บครั้งแรก) ให้ใช้วันนี้
            const dateObj = new Date();
            dateObj.setMinutes(dateObj.getMinutes() - dateObj.getTimezoneOffset()); // ปรับเวลาให้ตรงกับไทย
            savedDate = dateObj.toISOString().split('T')[0];
            
            // เซฟค่า "วันนี้" ลงในความจำ
            localStorage.setItem('pms_selected_date', savedDate);
        }

        // 2. นำวันที่จำไว้มาใส่ในกล่องเลือกวันที่
        dateInput.value = savedDate;

        // 3. โหลดข้อมูลของวันนั้น
        loadDashboardData(savedDate);
        updateDateDisplay(savedDate);
        // 4. ดักจับเมื่อผู้ใช้ "เปลี่ยนวันที่" ให้ทำการบันทึกลงความจำทันที
        dateInput.addEventListener('change', (e) => {
            const newDate = e.target.value;
            localStorage.setItem('pms_selected_date', newDate); // จำค่าใหม่
            loadDashboardData(newDate); // โหลดข้อมูลใหม่
            updateDateDisplay(newDate); // อัปเดตการแสดงวันที่ใหม่
        });
    }
});

// --- 3. ฟังก์ชันดึงข้อมูลและสร้างตาราง (เวอร์ชันอัปเกรด: ไฮไลท์สีกลุ่ม + ยุบยอดเงิน) ---
// ==========================================
// ฟังก์ชันดึงข้อมูลและสร้างตาราง Dashboard หลัก
// ==========================================

// ==========================================
// ฟังก์ชันดึงข้อมูลและสร้างตาราง Dashboard หลัก
// ==========================================

async function loadDashboardData(selectedDate) {
    const tbody = document.getElementById('dashboardTableBody');
    // 🟢 เปลี่ยน colspan เป็น 18 ให้เท่ากับจำนวนช่อง <th> ทั้งหมดรวมห้อง
    tbody.innerHTML = '<tr><td colspan="18">⏳ กำลังดึงข้อมูล...</td></tr>';

    try {
        // 1. ดึงห้องทั้งหมด
        const { data: allRooms, error: roomsErr } = await db.from('rooms').select('room_id').order('room_id', { ascending: true });
        if (roomsErr) throw roomsErr;

        // 2. ดึงข้อมูลการจอง (🟢 เพิ่ม adult_count, child_count, extra_bed เข้ามา)
        const { data: bookingsToday, error: bookErr } = await db.from('booking_rooms')
            .select(`
                booking_room_id, room_id, check_in_date, check_out_date, note,
                adult_count, child_count, extra_bed,
                bookings ( 
                    booking_id, customer_id, total_price, deposit_amount, remaining_amount, booking_channel, ota_reference_number, notes,
                    customers ( customer_id, name, phone, id_card_or_passport )
                ),
                room_guests ( guest_name, passport_or_id, actual_check_in_time, actual_check_out_time, breakfast_code, is_primary )
            `)
            .lte('check_in_date', selectedDate).gt('check_out_date', selectedDate);
            
        if (bookErr) throw bookErr;

        // 3. ดึงข้อมูลห้องเสีย/ปิดซ่อม
        const { data: maintenanceToday, error: mtErr } = await db.from('maintenance_rooms')
            .select('*')
            .lte('start_date', selectedDate)  
            .gte('end_date', selectedDate);   

        if (mtErr) throw mtErr;

        // สร้าง Map เพื่อให้ค้นหาข้อมูลห้องได้เร็วขึ้น
        const bookingMap = {};
        (bookingsToday || []).forEach(b => { bookingMap[b.room_id] = b; });
        
        const maintenanceMap = {};
        (maintenanceToday || []).forEach(mt => { maintenanceMap[mt.room_id] = mt; });

        tbody.innerHTML = '';
        const bookingColors = {}; 
        const priceShown = new Set(); 

        let checkedInCount = 0;
        let notCheckedInCount = 0;
        let waitRoomsList = [];

        (allRooms || []).forEach(room => {
            const mt = maintenanceMap[room.room_id]; 
            const b = bookingMap[room.room_id];      

            // ==============================================
            // 🚨 ลำดับที่ 1: เช็คว่าห้องปิดซ่อมอยู่หรือไม่?
            // ==============================================
            if (mt) {
                // 🟢 เปลี่ยน colspan เป็น 17
                tbody.innerHTML += `
                    <tr style="background-color: #ffebee; cursor: not-allowed;" title="ห้องนี้กำลังปิดซ่อมบำรุง">
                        <td><b style="color: #c62828;">${room.room_id}</b></td>
                        <td colspan="17" style="color: #c62828; font-weight: bold; text-align: left; padding-left: 20px;">
                            🛠️ ปิดซ่อมบำรุง: ${mt.reason || '-'}
                        </td>
                    </tr>
                `;
            } 
            // ==============================================
            // 🟢 ลำดับที่ 2: เช็คว่ามีการจองและมีบิลหรือไม่?
            // ==============================================
            else if (b && b.bookings) {
                let rowStyle = ""; 
                let priceDisplay = "-";
                let depositDisplay = "-";
                let balanceDisplay = "-";
                let bookingNoteDisplay = "-"; 

                const bId = b.bookings.booking_id;

                if (!bookingColors[bId]) {
                    bookingColors[bId] = getBookingColor(bId);
                }
                
                const isMultiRoom = (bookingsToday || []).filter(item => item.bookings?.booking_id === bId).length > 1;
                if (isMultiRoom) {
                    rowStyle = `style="background-color: ${bookingColors[bId]};"`;
                }

                if (!priceShown.has(bId)) {
                    const total = parseFloat(b.bookings.total_price) || 0;
                    const deposit = parseFloat(b.bookings.deposit_amount) || 0;
                    const paidRemain = parseFloat(b.bookings.remaining_amount) || 0;
                    let netBalance = total - deposit - paidRemain;
                    if (netBalance < 0) netBalance = 0;

                    priceDisplay = `<b>${total.toLocaleString()}</b>`;
                    depositDisplay = deposit.toLocaleString();
                    balanceDisplay = netBalance > 0 
                        ? `<span style="color: red; font-weight: bold;">${netBalance.toLocaleString()}</span>`
                        : `<span style="color: green; font-weight: bold;">0</span>`;
                    
                    bookingNoteDisplay = `<div style="max-width:120px; overflow:hidden; text-overflow:ellipsis; font-style:italic; color:#666;" title="${b.bookings.notes || ''}">${b.bookings.notes || '-'}</div>`;
                    priceShown.add(bId); 
                } else {
                    priceDisplay = `<span style="color: #ccc; font-size: 10px;">(รวม #${bId})</span>`;
                    depositDisplay = "-";
                    balanceDisplay = "-";
                    bookingNoteDisplay = ""; 
                }

                const selDateObj = new Date(selectedDate);
                selDateObj.setDate(selDateObj.getDate() + 1);
                const tomorrowStr = selDateObj.toISOString().split('T')[0];

                const isCheckInToday = (b.check_in_date === selectedDate);
                const isCheckOutTomorrow = (b.check_out_date === tomorrowStr);

                const hasCheckedIn = (b.room_guests || []).some(g => g.actual_check_in_time !== null);
                if (hasCheckedIn) {
                    checkedInCount++; 
                } else if (isCheckInToday) {
                    notCheckedInCount++; 
                    waitRoomsList.push(room.room_id);
                }

                const primaryGuest = (b.room_guests || []).find(g => g.is_primary === true) || b.room_guests?.[0] || {};
                const firstGuestName = primaryGuest.guest_name || '-';
                const breakfastDisplay = primaryGuest.breakfast_code || '-';

                let checkInTime = isCheckInToday && primaryGuest.actual_check_in_time 
                    ? new Date(primaryGuest.actual_check_in_time).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit', hour12: false}) + ' น.'
                    : (!isCheckInToday ? '<span style="color: #2196F3; font-weight: bold;">พักต่อ</span>' : '-');

                let checkOutTime = isCheckOutTomorrow 
                    ? (primaryGuest.actual_check_out_time ? new Date(primaryGuest.actual_check_out_time).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit', hour12: false}) + ' น.' : '<span style="color: #f44336; font-weight: bold;">รอออก</span>')
                    : '<span style="color: #2196F3; font-weight: bold;">พักต่อ</span>';

                const customer = b.bookings.customers || {};
                const otaRef = b.bookings.ota_reference_number || '-';
                const panelData = encodeURIComponent(JSON.stringify(b));
                
                // 🟢 ดึงข้อมูลผู้เข้าพักและเตียงเสริม
                const adultDisp = b.adult_count || 0;
                const childDisp = b.child_count || 0;
                const extraBedDisp = b.extra_bed ? '✅' : '-';

                tbody.innerHTML += `
                    <tr ${rowStyle} onclick="openViewBookingModal('${panelData}')" style="cursor: pointer;">
                        <td><b>${room.room_id}</b></td>
                        <td style="text-align:left;">${customer.name || '-'}</td>
                        <td style="color: #2e7d32; font-weight: bold;">${firstGuestName}</td>
                        <td>${customer.phone || '-'}</td>
                        <td class="col-channel" title="${b.bookings.booking_channel || ''}">${b.bookings.booking_channel || '-'}</td>
                        <td class="col-ref" title="${otaRef}">${otaRef}</td>
                        <td>#${bId}</td>
                        <td>${bookingNoteDisplay}</td>
                        <td>${priceDisplay}</td>
                        <td style="color: green;">${depositDisplay}</td>
                        <td>${balanceDisplay}</td>
                        
                        <td onclick="event.stopPropagation(); openSidePanel('${panelData}', '${room.room_id}')">${checkInTime}</td>
                        <td onclick="event.stopPropagation(); openSidePanel('${panelData}', '${room.room_id}')">${checkOutTime}</td>
                        <td onclick="event.stopPropagation(); openSidePanel('${panelData}', '${room.room_id}')" class="col-breakfast">${breakfastDisplay}</td>
                        <td onclick="event.stopPropagation(); openSidePanel('${panelData}', '${room.room_id}')" style="max-width: 100px; overflow: hidden; text-overflow: ellipsis;" title="${b.note || ''}">${b.note || '-'}</td>
                        
                        <!-- 🟢 3 ช่องใหม่แทนที่ปุ่มจัดการ (แอบใส่ onclick ให้คลิกช่องนี้แล้วเปิด Side Panel ได้เลย) -->
                        <td onclick="event.stopPropagation(); openSidePanel('${panelData}', '${room.room_id}')" class="col-pax" style="color:#1565c0; font-weight:bold;">${adultDisp}</td>
                        <td onclick="event.stopPropagation(); openSidePanel('${panelData}', '${room.room_id}')" class="col-pax" style="color:#00b33f; font-weight:bold;">${childDisp}</td>
                        <td onclick="event.stopPropagation(); openSidePanel('${panelData}', '${room.room_id}')" class="col-pax">${extraBedDisp}</td>
                    </tr>
                `;
            } 
            // ==============================================
            // ⚪ ลำดับที่ 3: ถ้าไม่มีการจอง และ ไม่เสีย = ห้องว่าง
            // ==============================================
            else {
                // 🟢 เปลี่ยน colspan เป็น 17
                tbody.innerHTML += `
                    <tr onclick="openQuickBookModal('${room.room_id}')" style="cursor: pointer;">
                        <td><b>${room.room_id}</b></td>
                        <td colspan="17" style="color: #999;">-- ว่าง --</td>
                    </tr>
                `;
            }
        });

        if (document.getElementById('sumCheckedIn')) {
            document.getElementById('sumCheckedIn').textContent = checkedInCount;
            document.getElementById('sumNotCheckedIn').textContent = notCheckedInCount;
            document.getElementById('sumWaitRooms').textContent = waitRoomsList.length > 0 ? waitRoomsList.join(', ') : '-';
        }

    } catch (error) {
        console.error("Dashboard Load Error:", error);
        tbody.innerHTML = `<tr><td colspan="18" style="color:red; font-weight:bold;">❌ เกิดข้อผิดพลาดในการโหลดข้อมูล: ${error.message}</td></tr>`;
    }
}

// --- 4. ฟังก์ชันเปิด Side Panel ---
function openSidePanel(encodedData, roomId) {
    const data = JSON.parse(decodeURIComponent(encodedData));
    
    // 🟢 เพิ่มฟังก์ชันช่วยแปลงวันที่ให้เป็นแบบ วัน/เดือน/ปี (DD/MM/YYYY)
    const formatDateThai = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        // ใช้ 'en-GB' จะได้ปี ค.ศ. (เช่น 15/04/2024)
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    // ตั้งค่า Header
    document.getElementById('spRoomNo').textContent = roomId;
    document.getElementById('spBookingId').textContent = data.bookings.booking_id;
    
    // 🟢 เรียกใช้ฟังก์ชันแปลงวันที่ก่อนนำไปแสดงผล
    document.getElementById('spCheckInDate').textContent = formatDateThai(data.check_in_date);
    document.getElementById('spCheckOutDate').textContent = formatDateThai(data.check_out_date);
    
    // เก็บ ID ไว้ตอนเซฟ
    document.getElementById('spBookingRoomId').value = data.booking_room_id;
    document.getElementById('spCustomerId').value = data.bookings.customer_id;
    
    // เคลียร์ข้อมูลฟอร์มเก่า
    document.getElementById('g1Name').value = ''; document.getElementById('g1Passport').value = '';
    document.getElementById('g2Name').value = ''; document.getElementById('g2Passport').value = '';
    document.getElementById('g3Name').value = ''; document.getElementById('g3Passport').value = '';
    document.getElementById('spCheckInTime').value = '';
    document.getElementById('spCheckOutTime').value = '';
    document.getElementById('spNote').value = data.note || '';

    // 🟢 เคลียร์ช่องอาหารเช้า (ถ้ามี) เพื่อป้องกันข้อมูลของห้องก่อนหน้าค้าง
    if(document.getElementById('breakfastCode')) document.getElementById('breakfastCode').value = '';

    // นำข้อมูลผู้เข้าพักมาเติมในช่อง (ถ้ามี)
    const guests = data.room_guests || [];
    
    if (guests.length > 0) {
        
        // 🟢 แก้บัค Passport: บังคับเรียงให้คนที่ถูกติ๊กเป็น Primary (คนแรก) อยู่ลำดับที่ 0 เสมอ
        guests.sort((a, b) => (b.is_primary === true ? 1 : 0) - (a.is_primary === true ? 1 : 0));

        // 🟢 ฟังก์ชันช่วยดึงแค่เวลา HH:mm ตัดวันที่ทิ้งไป
        const getTimeOnly = (isoString) => {
            if (!isoString) return '';
            const d = new Date(isoString);
            return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
        };

        // เปลี่ยนจาก .slice เป็นการเรียกใช้ฟังก์ชัน getTimeOnly เพื่อให้ได้แค่เวลา
        if(guests[0].actual_check_in_time) document.getElementById('spCheckInTime').value = getTimeOnly(guests[0].actual_check_in_time);
        if(guests[0].actual_check_out_time) document.getElementById('spCheckOutTime').value = getTimeOnly(guests[0].actual_check_out_time);
        
        // 🟢 ดึงข้อมูลอาหารเช้าของคนแรกมาแสดง (ถ้ามี)
        if(document.getElementById('breakfastCode')) {
            document.getElementById('breakfastCode').value = guests[0].breakfast_code || '';
        }

        // เติมข้อมูลแต่ละคน (ใส่ || '' ดักไว้กัน Error ขึ้น undefined)
        guests.forEach((g, idx) => {
            if(idx === 0) { document.getElementById('g1Name').value = g.guest_name || ''; document.getElementById('g1Passport').value = g.passport_or_id || ''; }
            if(idx === 1) { document.getElementById('g2Name').value = g.guest_name || ''; document.getElementById('g2Passport').value = g.passport_or_id || ''; }
            if(idx === 2) { document.getElementById('g3Name').value = g.guest_name || ''; document.getElementById('g3Passport').value = g.passport_or_id || ''; }
        });
    } else {
        // ถ้ายังไม่มีแขกในตาราง room_guests ให้ดึงชื่อลูกค้าหลักมาใส่เป็นคนที่ 1 เบื้องต้น
        document.getElementById('g1Name').value = data.bookings.customers.name || '';
        document.getElementById('g1Passport').value = data.bookings.customers.id_card_or_passport || '';
    }

    // เปิด Panel
    document.getElementById('guestSidePanel').classList.add('open');
    document.getElementById('panelOverlay').style.display = 'block';
}
// --- 5. ปิด Side Panel ---
function closeSidePanel() {
    document.getElementById('guestSidePanel').classList.remove('open');
    document.getElementById('panelOverlay').style.display = 'none';
}

// --- 6. บันทึกข้อมูลกลับลงฐานข้อมูล ---
async function saveGuestData() {
    const btn = document.querySelector('.btn-save');
    btn.textContent = "⏳ กำลังบันทึก...";
    btn.disabled = true;

    try {
        const bookingRoomId = document.getElementById('spBookingRoomId').value;
        const customerId = document.getElementById('spCustomerId').value;
        const note = document.getElementById('spNote').value;
        
        // 1. ดึงวันที่หลัก จากข้อความ Header ที่เราโชว์เป็นแบบ วัน/เดือน/ปี (DD/MM/YYYY)
        const baseCheckInText = document.getElementById('spCheckInDate').textContent.trim();
        const baseCheckOutText = document.getElementById('spCheckOutDate').textContent.trim();

        const convertToYMD = (dmyStr) => {
            if (!dmyStr || dmyStr === '-') return null;
            const parts = dmyStr.split('/'); 
            if (parts.length === 3) {
                return `${parts[2]}-${parts[1]}-${parts[0]}`; 
            }
            return dmyStr;
        };

        const baseCheckInDate = convertToYMD(baseCheckInText);
        const baseCheckOutDate = convertToYMD(baseCheckOutText);

        const timeIn = document.getElementById('spCheckInTime').value;
        const timeOut = document.getElementById('spCheckOutTime').value;

        const finalCheckInTime = (timeIn && baseCheckInDate) ? `${baseCheckInDate}T${timeIn}:00+07:00` : null;
        const finalCheckOutTime = (timeOut && baseCheckOutDate) ? `${baseCheckOutDate}T${timeOut}:00+07:00` : null;

        // 🟢 ดึงข้อมูลรหัสอาหารเช้าจากหน้าจอ HTML
        const breakfastCodeVal = document.getElementById('breakfastCode') ? document.getElementById('breakfastCode').value.trim() : null;

        // ดึงข้อมูลรายชื่อทั้ง 3 แถว
        const guestDataList = [];
        const g1Name = document.getElementById('g1Name').value.trim();
        const g1Pass = document.getElementById('g1Passport').value.trim();
        // 🟢 แนบรหัสอาหารเช้า (breakfastCodeVal) ไปกับแขกคนที่ 1 เท่านั้น
        if (g1Name) guestDataList.push({ name: g1Name, pass: g1Pass, isPrimary: true, bCode: breakfastCodeVal });

        const g2Name = document.getElementById('g2Name').value.trim();
        const g2Pass = document.getElementById('g2Passport').value.trim();
        if (g2Name) guestDataList.push({ name: g2Name, pass: g2Pass, isPrimary: false });

        const g3Name = document.getElementById('g3Name').value.trim();
        const g3Pass = document.getElementById('g3Passport').value.trim();
        if (g3Name) guestDataList.push({ name: g3Name, pass: g3Pass, isPrimary: false });

        // 1. อัปเดต Note ในตาราง booking_rooms
        await db.from('booking_rooms')
            .update({ note: note })
            .eq('booking_room_id', bookingRoomId);

        // 2. จัดการตาราง room_guests
        await db.from('room_guests').delete().eq('booking_room_id', bookingRoomId);
        
        if (guestDataList.length > 0) {
            const guestsToInsert = guestDataList.map(g => ({
                booking_room_id: bookingRoomId,
                guest_name: g.name,
                passport_or_id: g.pass || null,
                breakfast_code: g.bCode || null, // 🟢 ส่งรหัสอาหารเช้าเข้าตาราง (ถ้าไม่ใช่คนแรกจะเป็น null)
                is_primary: g.isPrimary,
                actual_check_in_time: finalCheckInTime,
                actual_check_out_time: finalCheckOutTime
            }));
            await db.from('room_guests').insert(guestsToInsert);
        }

        // 3. ตรวจสอบอัปเดต Passport ให้ตาราง Customer (เฉพาะลูกค้าหลัก)
        if (g1Name && g1Pass) {
            const { data: custData } = await db.from('customers').select('name').eq('customer_id', customerId).single();
            if (custData && custData.name === g1Name) {
                await db.from('customers')
                    .update({ id_card_or_passport: g1Pass })
                    .eq('customer_id', customerId);
            }
        }

        closeSidePanel();
        
        // รีเฟรชข้อมูลในตารางใหม่
        loadDashboardData(document.getElementById('dashboardDate').value);

    } catch (error) {
        console.error("Save Error:", error);
        alert("❌ เกิดข้อผิดพลาดในการบันทึก: " + error.message);
    } finally {
        btn.textContent = "💾 บันทึกข้อมูล";
        btn.disabled = false;
    }
}
// ==========================================
// ส่วนของการเปิดบิลเก่า (ห้องที่มีคนพัก)
// ==========================================
let currentViewBookingId = null; // 🟢 เพิ่มตัวแปรสำหรับจำ Booking ID
let currentCustomerId = null;
function openViewBookingModal(encodedData) {
    const data = JSON.parse(decodeURIComponent(encodedData));
    const b = data.bookings;
    
    // 🟢 ฟังก์ชันช่วยแปลงวันที่ให้เป็นแบบไทย
    const formatDateThai = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    currentViewBookingId = b.booking_id; // เก็บ ID ไว้ใช้ตอนกดแก้ไข
    currentCustomerId = b.customers?.customer_id || null;
    document.getElementById('vbId').textContent = b.booking_id;
    
    // 🟢 1. เพิ่มการแสดงวันที่เช็คอิน - เช็คเอาท์ (ดึงมาจาก data)
    document.getElementById('vbCheckIn').textContent = formatDateThai(data.check_in_date);
    document.getElementById('vbCheckOut').textContent = formatDateThai(data.check_out_date);

    document.getElementById('vbName').textContent = b.customers.name;
    document.getElementById('vbPhone').textContent = b.customers.phone || '-';
    document.getElementById('vbChannel').textContent = b.booking_channel;
    document.getElementById('vbRef').textContent = b.ota_reference_number || '-';

    // ส่วนของการเงิน (คงเดิม)
    const total = parseFloat(b.total_price) || 0;
    const deposit = parseFloat(b.deposit_amount) || 0;
    const paidRemain = parseFloat(b.remaining_amount) || 0; 
    
    let netRemaining = total - deposit - paidRemain;
    if(netRemaining < 0) netRemaining = 0;

    document.getElementById('vbTotal').textContent = total.toLocaleString();
    document.getElementById('vbDeposit').textContent = deposit.toLocaleString();
    document.getElementById('vbPaidRemain').textContent = paidRemain.toLocaleString();
    
    const netEl = document.getElementById('vbNetRemaining');
    netEl.textContent = netRemaining.toLocaleString() + " บาท";
    
    if(netRemaining === 0) {
        netEl.style.color = "green";
        netEl.textContent = "0 บาท (ชำระครบแล้ว)";
    } else {
        netEl.style.color = "red";
    }

    document.getElementById('viewBookingModal').classList.add('open');
    document.getElementById('panelOverlay').style.display = 'block';
}
function goToEditBooking() {
    if (currentViewBookingId) {
        // ส่ง Booking ID ไปบน URL (เช่น booking.html?edit=5)
        window.location.href = `booking.html?edit=${currentViewBookingId}`;
    }
}
function closeViewBookingModal() {
    document.getElementById('viewBookingModal').classList.remove('open');
    document.getElementById('panelOverlay').style.display = 'none';
}


// ==========================================
// ส่วนของการจองด่วน (ห้องว่าง)
// ==========================================
// ==========================================
// ส่วนของการจองด่วน (ห้องว่าง) - อัปเกรดเรื่อง Timezone
// ==========================================
let quickBookRoomId = null;

function openQuickBookModal(roomId) {
    quickBookRoomId = roomId;
    document.getElementById('qbRoomNo').textContent = roomId;

    // เซ็ตวันที่เป็นวันนี้ กับพรุ่งนี้
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // ฟังก์ชันแปลงวันที่ให้เป็น YYYY-MM-DD แบบตรงเป๊ะตามเวลาไทย (ไม่โดน Timezone บิดเบือน)
    const toLocalISODate = (date) => {
        const tzOffset = date.getTimezoneOffset() * 60000;
        return new Date(date - tzOffset).toISOString().split('T')[0];
    };

    document.getElementById('qbCheckIn').value = toLocalISODate(today);
    document.getElementById('qbCheckOut').value = toLocalISODate(tomorrow);

    document.getElementById('quickBookModal').classList.add('open');
    document.getElementById('panelOverlay').style.display = 'block';
}

// ฟังก์ชันส่งลูกค้าไปหน้า Booking_system.html
function goToFullBooking() {
    const checkIn = document.getElementById('qbCheckIn').value;
    const checkOut = document.getElementById('qbCheckOut').value;
    
    // เปลี่ยนเป้าหมายไปที่ไฟล์ booking.html ตามที่คุณต้องการ
    window.location.href = `booking.html?room=${quickBookRoomId}&in=${checkIn}&out=${checkOut}`;
}

// ==========================================
// ฟังก์ชันปิดหน้าต่างแบบ Universal (ปิดได้ทุกอัน)
// ==========================================
function closeAllModals() {
    // ปิด Panel จัดการผู้เข้าพัก
    const guestPanel = document.getElementById('guestSidePanel');
    if (guestPanel) guestPanel.classList.remove('open');
    
    // ปิด Panel ดูบิลการจอง
    const viewPanel = document.getElementById('viewBookingModal');
    if (viewPanel) viewPanel.classList.remove('open');
    
    // ปิด Panel จองด่วน
    const quickPanel = document.getElementById('quickBookModal');
    if (quickPanel) quickPanel.classList.remove('open');
    
    // ซ่อนพื้นหลังสีดำ
    document.getElementById('panelOverlay').style.display = 'none';
}

// ระบบกด Enter เพื่อบันทึกข้อมูลใน Side Panel ทันที
// ==========================================
document.getElementById('guestSidePanel').addEventListener('keydown', function(e) {
    // เช็คว่ากดปุ่ม Enter ใช่หรือไม่
    if (e.key === 'Enter') {
        // ยกเว้นช่อง Note (Textarea) เพื่อให้พนักงานยังกด Enter ขึ้นบรรทัดใหม่ใน Note ได้
        if (e.target.tagName === 'TEXTAREA') {
            return; 
        }
        
        e.preventDefault(); // ป้องกันการกระทำพื้นฐานของบราวเซอร์
        saveGuestData();    // เรียกใช้งานฟังก์ชันบันทึกข้อมูล
    }
});

function getBookingColor(bookingId) {
    if (!bookingId) return "";
    // นำ ID มาคูณด้วยเลขจำนวนเฉพาะ (เช่น 137) เพื่อกระจายเฉดสี (Hue) ให้ออกมาตั้งแต่ 0-360
    const hue = (Number(bookingId) * 137) % 360; 
    // คืนค่าเป็นรหัสสี hsla พื้นหลังอ่อนๆ สบายตา
    return `hsla(${hue}, 70%, 92%, 0.8)`;
}
function goToEditCustomer() {
    if (currentCustomerId) {
        // วาร์ปไปหน้าต่างใหม่ พร้อมแนบรหัสลูกค้าไปที่ URL (เช่น edit_customer.html?id=123)
        window.location.href = `edit_customer.html?id=${currentCustomerId}`;
    } else {
        alert("ไม่พบข้อมูลลูกค้าระบบนี้ (อาจเป็นบิลเก่าที่ไม่ได้ผูกชื่อไว้)");
    }
}
function goToFolio() {
    if (currentViewBookingId) {
        window.open(`folio.html?booking_id=${currentViewBookingId}`, '_blank');
    } else {
        // กรณีเปิดหน้าใหม่แบบไม่ระบุบิล
        window.open(`folio.html`, '_blank');
    }
}