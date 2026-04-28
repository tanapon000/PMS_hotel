// --- 1. ตั้งค่า Supabase ---
const SUPABASE_URL = 'http://192.168.2.200:8000'; // ⚠️ เปลี่ยนเป็นของคุณ
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'; // ⚠️ เปลี่ยนเป็นของคุณ
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



// 🟢 ตัวแปรสำหรับเก็บรายชื่อพนักงาน
let staffMapData = {};
document.addEventListener('DOMContentLoaded', async () => {
    // ====================================================
    // 1. โหลดรายชื่อพนักงานใส่ Dropdown (ของเดิมที่ห้ามหาย)
    // ====================================================
    try {
        const { data: staffs } = await db.from('staffs').select('staff_id, staff_name');
        if (staffs) {
            let options = '<option value="">-- เลือก --</option>';
            staffs.forEach(s => {
                options += `<option value="${s.staff_id}">${s.staff_name}</option>`;
                staffMapData[s.staff_id] = s.staff_name; // เก็บไว้แปลชื่อในตาราง
            });
            const otStaffEl = document.getElementById('otStaff');
            if (otStaffEl) otStaffEl.innerHTML = options;
        }
    } catch (err) {
        console.error("Error loading staffs:", err);
    }

    // ====================================================
    // 2. ระบบจำวันที่ข้ามหน้า (LocalStorage)
    // ====================================================
    const datePicker = document.getElementById('revenueDate');
    
    if (datePicker) {
        // เช็คว่ามีวันที่จำไว้ในระบบหรือไม่?
        let savedDate = localStorage.getItem('pms_selected_date');
        
        if (!savedDate) {
            // ถ้าไม่เคยมี (เปิดเว็บครั้งแรกของวัน) ให้ใช้วันนี้
            const dateObj = new Date();
            dateObj.setMinutes(dateObj.getMinutes() - dateObj.getTimezoneOffset());
            savedDate = dateObj.toISOString().split('T')[0];
            
            // เซฟค่า "วันนี้" ลงในความจำ
            localStorage.setItem('pms_selected_date', savedDate);
        }

        // นำวันที่จำไว้มาใส่ในกล่อง Date Picker
        datePicker.value = savedDate;

        // สั่งโหลดข้อมูลตารางซ้ายและขวาตามวันที่นั้น
        loadAllData(savedDate);

        // ดักจับเมื่อผู้ใช้ "เปลี่ยนวันที่" ให้ทำการบันทึกลงความจำทันที
        datePicker.addEventListener('change', (e) => {
            const newDate = e.target.value;
            localStorage.setItem('pms_selected_date', newDate); // จำค่าใหม่
            loadAllData(newDate); // โหลดข้อมูลใหม่
        });
    }
});


// ==========================================
// ส่วนที่ 1: ตารางรายรับหลักฝั่งซ้าย (อัปเดตสมบูรณ์ล่าสุด)
// ==========================================
let bookingCache = {};

async function loadRevenueData(selectedDate) {
    const tbody = document.getElementById('revenueTableBody');
    tbody.innerHTML = '<tr><td colspan="16">⏳ กำลังดึงข้อมูล...</td></tr>';
    bookingCache = {};
    
    try {
        // 1. ดึงข้อมูลห้องทั้งหมด
        const { data: allRooms } = await db.from('rooms').select('room_id').order('room_id', { ascending: true });
        
        // 2. ดึงข้อมูลการจอง
        const { data: bookingsToday } = await db.from('booking_rooms')
            .select(`
                booking_room_id, room_id, check_in_date, check_out_date,
                bookings ( 
                    booking_id, total_price, deposit_amount, deposit_payment_time, deposit_staff, deposit_payment_method,
                    remaining_amount, final_payment_time, payment_received_by_staff, final_payment_method,
                    booking_channel, ota_reference_number, notes,
                    customers(customer_id, name, phone)
                )
            `)
            .lte('check_in_date', selectedDate).gt('check_out_date', selectedDate);

        // 🟢 3. ดึงข้อมูลห้องเสีย/ปิดซ่อม
        const { data: maintenanceToday } = await db.from('maintenance_rooms')
            .select('*')
            .lte('start_date', selectedDate)
            .gte('end_date', selectedDate);

        // สร้าง Map ไว้ค้นหาเร็วๆ
        const bookingMap = {};
        (bookingsToday || []).forEach(b => { if (b && b.room_id) bookingMap[b.room_id] = b; });
        
        const maintenanceMap = {};
        (maintenanceToday || []).forEach(mt => { maintenanceMap[mt.room_id] = mt; });

        // คำนวณช่วงเวลาตัดรอบกะ
        const sParts = selectedDate.split('-');
        const shiftStart = new Date(sParts[0], sParts[1] - 1, sParts[2], 12, 0, 0).getTime();
        const nextDay = new Date(shiftStart);
        nextDay.setDate(nextDay.getDate() + 1);
        const shiftEnd = nextDay.getTime() - 1000;

        tbody.innerHTML = '';
        const priceShown = new Set(); 
        const safeStaffMap = typeof staffMapData !== 'undefined' ? staffMapData : {};

        const formatDateTime = (iso) => {
            if (!iso) return '-';
            const d = new Date(iso);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + 
                   ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        };

        const safeRooms = allRooms || [];
        if (safeRooms.length === 0) {
            tbody.innerHTML = '<tr><td colspan="16" style="text-align:center; color:gray;">ไม่พบข้อมูลห้องพักในระบบ</td></tr>';
            return;
        }

        // 4. วนลูปสร้างตาราง
        safeRooms.forEach(room => {
            const b = bookingMap[room.room_id];
            const mt = maintenanceMap[room.room_id]; // ข้อมูลห้องซ่อม

            // ==============================================
            // 🚨 ลำดับที่ 1: เช็คห้องปิดซ่อม
            // ==============================================
            if (mt) {
                tbody.innerHTML += `
                    <tr style="background-color: #ffebee; cursor: not-allowed;" title="ห้องกำลังปิดซ่อมบำรุง">
                        <td><b style="color: #c62828;">${room.room_id}</b></td>
                        <td colspan="15" style="color: #c62828; font-weight: bold; text-align: left; padding-left: 20px;">
                            🛠️ ปิดซ่อมบำรุง: ${mt.reason || '-'}
                        </td>
                    </tr>
                `;
            }
            // ==============================================
            // 🟢 ลำดับที่ 2: เช็คการจอง
            // ==============================================
            else if (b && b.bookings) {
                const bk = b.bookings;
                const bId = bk.booking_id;
                bookingCache[bId] = b;
                const panelData = encodeURIComponent(JSON.stringify(b));
                
                let totalDisp = "-", depDisp = "-", depDateTxt = "-", depStaff = "-", depMethodDisp = "-";
                let payDisp = "-", payDateTxt = "-", payStaff = "-", payMethodDisp = "-", balDisp = "-", noteDisp = "-";
                let depDateStyle = "", payDateStyle = ""; 

                const relatedRooms = (bookingsToday || []).filter(item => item.bookings?.booking_id === bId);
                const roomCount = relatedRooms.length;
                const isMultiRoom = roomCount > 1;

                let trStyle = 'style="cursor: pointer;"';
                let multiRoomBadge = '';
                
                if (isMultiRoom) {
                    const rowColor = getBookingColor(bId); 
                    trStyle = `style="cursor: pointer; background-color: ${rowColor} !important;"`;
                }

                if (!priceShown.has(bId)) {
                    const total = parseFloat(bk.total_price) || 0;
                    const deposit = parseFloat(bk.deposit_amount) || 0;
                    const paid = parseFloat(bk.remaining_amount) || 0;
                    let pending = total - deposit - paid;
                    if (pending < 0) pending = 0;

                    const ch = (bk.booking_channel || '').toLowerCase();
                    if ((ch.includes('agoda') || ch.includes('booking') || ch.includes('expedia')) && bk.ota_reference_number && total === 0) {
                        balDisp = `<span style="color: #2196F3; font-weight: bold; background: #e3f2fd; padding: 2px 4px; border-radius: 4px; font-size:10px;">ชำระล่วงหน้า</span>`;
                        totalDisp = "0"; depDisp = "-"; payDisp = "-";
                    } else {
                        totalDisp = total.toLocaleString();
                        depDisp = deposit > 0 ? deposit.toLocaleString() : '-';
                        payDisp = paid > 0 ? paid.toLocaleString() : '-';
                        balDisp = pending > 0 ? `<span style="color: red; font-weight: bold;">${pending.toLocaleString()}</span>` : `<span style="color: green; font-weight: bold;">0</span>`;
                    }

                    depMethodDisp = bk.deposit_payment_method || '-';
                    if (bk.deposit_payment_time && deposit > 0) {
                        depDateTxt = formatDateTime(bk.deposit_payment_time);
                        const dTime = new Date(bk.deposit_payment_time).getTime();
                        if (dTime >= shiftStart && dTime <= shiftEnd) {
                            depDateStyle = "background: #c8e6c9; color: #2e7d32; font-weight: bold;";
                        } else if (dTime < shiftStart) {
                            depDateStyle = "background: #eeeeee; color: #757575;";
                        } else {
                            depDateStyle = "background: #fff9c4; color: #f57f17; font-weight: bold;";
                        }
                    }

                    payMethodDisp = bk.final_payment_method || '-';
                    if (pending > 0) {
                        payDateStyle = "background: #ffcdd2; color: #c62828; font-weight: bold;";
                        payDateTxt = "ค้างชำระ";
                    } else if (bk.final_payment_time) {
                        payDateTxt = formatDateTime(bk.final_payment_time);
                        const pTime = new Date(bk.final_payment_time).getTime();
                        if (pTime >= shiftStart && pTime <= shiftEnd) {
                            payDateStyle = "background: #c8e6c9; color: #2e7d32; font-weight: bold;";
                        } else if (pTime < shiftStart) {
                            payDateStyle = "background: #eeeeee; color: #757575;";
                        } else {
                            payDateStyle = "background: #fff9c4; color: #f57f17; font-weight: bold;";
                        }
                    }

                    depStaff = safeStaffMap[bk.deposit_staff] || '-';
                    payStaff = safeStaffMap[bk.payment_received_by_staff] || '-';
                    noteDisp = bk.notes || '-';
                    priceShown.add(bId);
                } else {
                    totalDisp = `<span style="color:#ccc; font-size:10px;">(รวมใน #${bId})</span>`;
                }

                tbody.innerHTML += `
                    <tr onclick="openViewBookingModal('${bId}')" ${trStyle}>
                        <td><b>${room.room_id}</b></td>
                        <td style="color:#2e7d32; font-weight:bold; font-size:11px;">${bk.customers?.name || '-'}</td>
                        <td class="col-booking">
                            #${bId} 
                            ${multiRoomBadge} 
                        </td>
                        <td class="col-channel">${bk.booking_channel || '-'}</td>
                        <td class="col-ref">${bk.ota_reference_number || '-'}</td>
                        <td>${totalDisp}</td>
                        
                        <td style="color: #2e7d32; font-weight:bold;">${depDisp}</td>
                        <td style="font-size:10px;">${depMethodDisp}</td>
                        <td style="font-size:10px; ${depDateStyle}">${depDateTxt}</td>
                        <td style="font-size:10px;">${depStaff}</td>
                        
                        <td class="col-pending">${balDisp}</td>
                        
                        <td style="color: #1565c0; font-weight:bold;">${payDisp}</td>
                        <td style="font-size:10px;">${payMethodDisp}</td>
                        <td style="font-size:10px; ${payDateStyle}">${payDateTxt}</td>
                        <td style="font-size:10px;">${payStaff}</td>
                        
                        <td style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; font-size:10px;">${noteDisp}</td>
                    </tr>
                `;
            } 
            // ==============================================
            // ⚪ ลำดับที่ 3: ห้องว่างปกติ
            // ==============================================
            else {
                tbody.innerHTML += `
                    <tr onclick="openQuickBookModal('${room.room_id}')" style="cursor: pointer; background: #fafafa;">
                        <td><b>${room.room_id}</b></td>
                        <td colspan="15" style="color: #9e9e9e; text-align: center;">
                            -- ว่าง -- <span style="color: #2196F3; font-size: 11px;">(คลิกเพื่อจองด่วน)</span>
                        </td>
                    </tr>
                `;
            }
        });
    } catch (error) {
        console.error("Revenue Data Error:", error);
        tbody.innerHTML = `<tr><td colspan="16" style="color:red; text-align:center;">❌ Error: ${error.message} <br>ลองกด F12 แล้วดูช่อง Console ครับ</td></tr>`;
    }
}
// ==========================================
// ส่วนประมวลผลเวลา และ สรุปยอดฝั่งขวา
// ==========================================
let dailySummary = { 'เงินสด': 0, 'เงินโอน': 0, 'บัตรเครดิต': 0, 'Qr code': 0 };


function loadAllData(date) {
    // 1. โหลดตารางซ้าย
    loadRevenueData(date); 
    
    // 2. ตั้งค่าช่วงเวลากะ (12:00 - 11:59)
    const startStr = `${date}T12:00:00+07:00`;
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const endStr = `${nextDay.toISOString().split('T')[0]}T11:59:59+07:00`;

    // 🔴 สำคัญ: รีเซ็ตยอดสรุปเป็น 0 ก่อนเริ่มนับใหม่
    dailySummary = { 'เงินสด': 0, 'เงินโอน': 0, 'บัตรเครดิต': 0, 'Qr code': 0 };

    // 3. โหลดตารางขวาและคำนวณเงินทั้งหมด
    loadShiftRoomIncome(startStr, endStr);
    loadOtherTransactions(startStr, endStr);
}

// ==========================================
// ฟังก์ชันตัวช่วยบวก-ลบเงินเข้าหมวดหมู่ (อัปเกรดให้รู้จักทั้ง ไทย/อังกฤษ)
// ==========================================
function addSummaryAmount(method, amount, type = 'Income') {
    if (!method || amount <= 0) return; 
    
    // แปลงให้เป็นตัวพิมพ์เล็กทั้งหมดเพื่อเช็คง่ายๆ
    let m = String(method).toLowerCase(); 
    
    // ถ้ารายรับให้ค่าเป็นบวก (+) ถ้ารายจ่ายให้ค่าเป็นลบ (-)
    let val = (type === 'Expense') ? -amount : amount;
    
    // 🟢 ดักจับทั้งคำว่า "สด" และ "cash"
    if (m.includes('สด') || m.includes('cash')) {
        dailySummary['เงินสด'] += val;
    }
    // 🟢 ดักจับทั้งคำว่า "โอน" และ "transfer" (ครอบคลุม bank transfer)
    else if (m.includes('โอน') || m.includes('transfer')) {
        dailySummary['เงินโอน'] += val;
    }
    // ดักจับ เครดิต / credit
    else if (m.includes('เครดิต') || m.includes('credit')) {
        dailySummary['บัตรเครดิต'] += val;
    }
    // ดักจับ qr
    else if (m.includes('qr')) {
        dailySummary['Qr code'] += val;
    }
}

function renderSummaryBox() {
    document.getElementById('sumCash').textContent = dailySummary['เงินสด'].toLocaleString();
    document.getElementById('sumTransfer').textContent = dailySummary['เงินโอน'].toLocaleString();
    document.getElementById('sumCredit').textContent = dailySummary['บัตรเครดิต'].toLocaleString();
    document.getElementById('sumQR').textContent = dailySummary['Qr code'].toLocaleString(); // 🟢 ดึงค่าจาก 'Qr code' มาแสดง
}

// 🟢 ฟังก์ชันเสกสีประจำ Booking (วางไว้บนสุดของไฟล์ dashborad_pay.js)
// 🟢 ฟังก์ชันเสกสีประจำ Booking (ให้เฉดสีตรงกับหน้า Dashboard Main เป๊ะ)
function getBookingColor(bookingId) {
    if (!bookingId) return "";
    const hue = (Number(bookingId) * 137) % 360; 
    return `hsla(${hue}, 70%, 92%, 0.8)`; 
}

// 🟢 โหลดตาราง "รายรับมัดจำและชำระค่าห้อง"
async function loadShiftRoomIncome(startStr, endStr) {
    const tbody = document.getElementById('shiftRoomIncomeBody');
    const selectedDate = document.getElementById('revenueDate').value; 
    const startTime = new Date(startStr).getTime();
    const endTime = new Date(endStr).getTime();

    const { data, error } = await db.from('bookings')
        .select(`*, customers(name, phone), booking_rooms(room_id, check_in_date, check_out_date)`)
        .or(`deposit_payment_time.gte.${startStr},final_payment_time.gte.${startStr}`);

    if (error) return;

    let html = '';

    (data || []).forEach(b => {
        bookingCache[b.booking_id] = b; 

        const roomsStr = (b.booking_rooms || []).map(r => r.room_id).join(', ');
        const checkInStr = (b.booking_rooms && b.booking_rooms.length > 0) ? b.booking_rooms[0].check_in_date : '-';
        const checkOutStr = (b.booking_rooms && b.booking_rooms.length > 0) ? b.booking_rooms[0].check_out_date : '-';
        const custName = b.customers?.name || 'ไม่ระบุ';

        // 🟢 นับจำนวนห้องในบิลนี้
        const roomCount = b.booking_rooms ? b.booking_rooms.length : 0;
        const isMultiRoom = roomCount > 1;

        // ถ้ามีหลายห้อง ค่อยแปะป้ายกำกับ
        let multiRoomBadge = '';
        if (isMultiRoom) {
            multiRoomBadge = `<span style="background-color: #2196F3; color: white; border-radius: 3px; padding: 1px 4px; font-size: 9px; margin-left: 5px;">หลายห้อง (${roomCount})</span>`;
        }

        // 🟢 สร้างเงื่อนไขตรวจสอบว่า "วันที่เลือกใน Dashboard" อยู่ในช่วงวันเข้าพักของลูกค้าหรือไม่
        // ถ้าระหว่าง check-in ถึง check-out บิลนี้จะไปโผล่ตารางหลักซ้ายมือแล้ว เราจะไม่ให้แสดงซ้ำ
        let isStaying = false;
        if (checkInStr !== '-' && checkOutStr !== '-') {
            // สามารถใช้เครื่องหมาย >= และ <= เทียบ String รูปแบบ YYYY-MM-DD ได้เลย
            if (selectedDate >= checkInStr && selectedDate <= checkOutStr) {
                isStaying = true;
            }
        }

        // --- ส่วนมัดจำ ---
        if (b.deposit_payment_time) {
            const depTime = new Date(b.deposit_payment_time).getTime();
            if (depTime >= startTime && depTime <= endTime && b.deposit_amount > 0) {
                addSummaryAmount(b.deposit_payment_method, b.deposit_amount);

                // 🟢 เปลี่ยนเงื่อนไข: แสดงก็ต่อเมื่อ "ไม่ได้อยู่ในช่วงเข้าพัก"
                if (!isStaying) {
                    html += `
                        <tr onclick="openViewBookingModal('${b.booking_id}')">
                            <td style="text-align:left; font-size:11px; background-color: transparent !important;">
                                <span style="color:#2e7d32; font-weight:bold;">มัดจำ #${b.booking_id}</span> ${multiRoomBadge}<br>
                                ${custName} (ห้อง: ${roomsStr})<br>
                                <span style="color:#757575;">เข้า: ${checkInStr} | ออก: ${checkOutStr}</span>
                            </td>
                            <td style="font-size:11px; background-color: transparent !important;">${b.deposit_payment_method}</td>
                            <td style="font-weight:bold; color:green; background-color: transparent !important;">${b.deposit_amount.toLocaleString()}</td>
                        </tr>`;
                }
            }
        }

        // --- ส่วนชำระจบ ---
        if (b.final_payment_time) {
            const payTime = new Date(b.final_payment_time).getTime();
            if (payTime >= startTime && payTime <= endTime && b.remaining_amount > 0) {
                addSummaryAmount(b.final_payment_method, b.remaining_amount);

                // 🟢 เปลี่ยนเงื่อนไข: แสดงก็ต่อเมื่อ "ไม่ได้อยู่ในช่วงเข้าพัก"
                if (!isStaying) {
                    html += `
                        <tr onclick="openViewBookingModal('${b.booking_id}')" >
                            <td style="text-align:left; font-size:11px; background-color: transparent !important;">
                                <span style="color:#1565c0; font-weight:bold;">ชำระจบ #${b.booking_id}</span> ${multiRoomBadge}<br>
                                ${custName} (ห้อง: ${roomsStr})<br>
                                <span style="color:#757575;">เข้า: ${checkInStr} | ออก: ${checkOutStr}</span>
                            </td>
                            <td style="font-size:11px; background-color: transparent !important;">${b.final_payment_method}</td>
                            <td style="font-weight:bold; color:green; background-color: transparent !important;">${b.remaining_amount.toLocaleString()}</td>
                        </tr>`;
                }
            }
        }
    });

    tbody.innerHTML = html || '<tr><td colspan="3" style="color:gray; font-size:11px; text-align:center;">ไม่มีรายการรับเงินอื่น</td></tr>';
    renderSummaryBox();
}

// ==========================================
// ส่วนที่ 2: ระบบจัดการรายรับ-รายจ่ายอื่นๆ ฝั่งขวา
// ==========================================

// โหลดตารางขวา
// โหลดตารางอื่นๆ (ปรับให้ใช้เวลาตัดรอบ)

// 🟢 รับพารามิเตอร์เป็น selectedDate (เช่น '2024-04-20') แทน startStr, endStr
async function loadOtherTransactions(selectedDate) {
    const incBody = document.getElementById('otIncomeBody');
    const expBody = document.getElementById('otExpenseBody');

    // เผื่อกรณีที่ฟังก์ชันหลักไม่ได้ส่งค่ามา ให้ดึงจากหน้าจอโดยตรง
    const targetDate = selectedDate || document.getElementById('revenueDate').value;

    const { data, error } = await db.from('other_transactions')
        .select('*')
        .eq('transaction_date', targetDate) // 🟢 ดึงข้อมูลให้ตรงกับวันที่เลือกเป๊ะๆ
        .order('created_at', { ascending: true }); // เรียงลำดับตามเวลาที่คีย์ข้อมูลจริง

    let incHtml = '', expHtml = '';

    (data || []).forEach(t => {
        const trHtml = `
            <tr>
                <td style="font-size:11px;">${t.category}</td>
                <td style="font-size:11px;">${t.payment_method || '-'}</td>
                <td style="font-weight:bold; color:${t.transaction_type==='Income' ? 'green' : 'red'};">${parseFloat(t.amount).toLocaleString()}</td>
                <td><button onclick="deleteOtherTransaction('${t.transaction_id}', '${t.created_at}')" style="background:#f44336; color:white; border:none; border-radius:3px; font-size:10px; padding:3px 6px;">ลบ</button></td>
            </tr>
        `;
        if (t.transaction_type === 'Income') {
            incHtml += trHtml;
            // บวกเข้ารวมยอด (เฉพาะรายรับ)
            addSummaryAmount(t.payment_method, parseFloat(t.amount), 'Income');
        } else {
            expHtml += trHtml;
            // ลบออกจากรวมยอด (เฉพาะรายจ่าย)
            addSummaryAmount(t.payment_method, parseFloat(t.amount), 'Expense');
        }
    });

    incBody.innerHTML = incHtml || '<tr><td colspan="4" style="color:#999; text-align:center;">ไม่มีข้อมูลรายรับ</td></tr>';
    expBody.innerHTML = expHtml || '<tr><td colspan="4" style="color:#999; text-align:center;">ไม่มีข้อมูลรายจ่าย</td></tr>';
    
    renderSummaryBox(); // อัปเดตกล่องสรุปอีกครั้ง
}
// เปิด Side Panel
function openOtPanel(type) {
    document.getElementById('otType').value = type;
    document.getElementById('otPanelTitle').textContent = type === 'Income' ? '🟢 เพิ่มรายรับอื่นๆ' : '🔴 เพิ่มรายจ่ายอื่นๆ';
    document.getElementById('otCategory').value = '';
    document.getElementById('otAmount').value = '';
    
    document.getElementById('otPanel').classList.add('open');
    document.getElementById('otOverlay').style.display = 'block';
}

function closeOtPanel() {
    document.getElementById('otPanel').classList.remove('open');
    document.getElementById('otOverlay').style.display = 'none';
}

// บันทึกข้อมูล
// 🟢 แก้ไขฟังก์ชันบันทึกรายรับ-รายจ่ายอื่นๆ
async function saveOtherTransaction() {
    const type = document.getElementById('otType').value;
    const category = document.getElementById('otCategory').value.trim();
    const method = document.getElementById('otMethod').value;
    const amount = parseFloat(document.getElementById('otAmount').value) || 0;
    const staff = document.getElementById('otStaff').value;
    
    // 🟢 ดึงวันที่จาก Dashboard เพื่อบันทึกลงฐานข้อมูล
    const date = document.getElementById('revenueDate').value;

    if (!category || amount <= 0 || !staff) {
        alert("กรุณากรอก รายการ, ยอดเงิน และเลือกพนักงานให้ครบถ้วนครับ");
        return;
    }

    const btn = document.querySelector('#otPanel .btn-save');
    btn.textContent = "⏳ กำลังบันทึก...";
    btn.disabled = true;

    try {
        const { error } = await db.from('other_transactions').insert([{
            transaction_date: date, // 🟢 บันทึกเป็นวันที่ที่เราเลือกย้อนหลัง
            transaction_type: type,
            category: category,
            payment_method: method,
            amount: amount,
            staff_id: staff
            // หมายเหตุ: เอา created_at ออกได้เลย เพราะ Supabase จะประทับเวลาให้อัตโนมัติตอน Data เข้า DB ครับ
        }]);

        if (error) throw error;

        closeOtPanel();
        
        // เคลียร์ฟอร์ม
        document.getElementById('otCategory').value = '';
        document.getElementById('otAmount').value = '';

        // 🟢 โหลดข้อมูลใหม่โดยใช้วันที่เดิมที่เลือกไว้
        if (typeof loadAllData === 'function') {
            loadAllData(date); 
        } else {
            loadOtherTransactions(date);
        }

    } catch (error) {
        console.error("Save OT Error:", error);
        alert("❌ เกิดข้อผิดพลาดในการบันทึก: " + error.message);
    } finally {
        btn.textContent = "💾 บันทึกรายการ";
        btn.disabled = false;
    }
}

// ==========================================
// ส่วนที่ 3: ระบบ Modal ดูรายละเอียดบิล (คลิกจากตารางซ้าย)
// ==========================================
let currentViewBookingId = null; 
let currentCustomerId = null;
// ฟังก์ชันแปลงข้อมูลในตารางฝั่งซ้าย ให้พร้อมโยนเข้า Modal 
// (เช็คแล้วว่าบรรทัด tbody.innerHTML ในโค้ดก่อนหน้าได้ใส่ onclick="openViewBookingModal('${panelData}')" ไว้แล้ว)
function openViewBookingModal(bookingId) {
    try {
        const data = bookingCache[bookingId];
        if (!data) {
            console.error("หาข้อมูลบิลใน Cache ไม่เจอ ID:", bookingId);
            return;
        }

        let b, roomsStr, checkInStr, checkOutStr;

        // 🟢 ตรวจสอบว่าคลิกมาจากตารางซ้าย หรือ ตารางขวา
        if (data.bookings) {
            // กรณีมาจากตารางซ้าย (Today's check-in)
            b = data.bookings;
            roomsStr = data.room_id; // เลขห้อง
            checkInStr = data.check_in_date;
            checkOutStr = data.check_out_date;
        } else {
            // กรณีมาจากตารางขวา (รายรับเข้ากะ)
            b = data;
            roomsStr = (b.booking_rooms || []).map(r => r.room_id).join(', ');
            checkInStr = (b.booking_rooms && b.booking_rooms.length > 0) ? b.booking_rooms[0].check_in_date : '-';
            checkOutStr = (b.booking_rooms && b.booking_rooms.length > 0) ? b.booking_rooms[0].check_out_date : '-';
        }

        currentViewBookingId = b.booking_id;
        currentCustomerId = b.customers?.customer_id || null;

        // 🟢 นำเลขห้องไปต่อท้าย Booking ID เลย เพื่อให้พนักงานเห็นชัดๆ
        document.getElementById('vbId').textContent = `${b.booking_id} (ห้อง: ${roomsStr})`;
        document.getElementById('vbName').textContent = b.customers?.name || '-';
        document.getElementById('vbPhone').textContent = b.customers?.phone || '-'; 
        document.getElementById('vbChannel').textContent = b.booking_channel || '-';
        document.getElementById('vbRef').textContent = b.ota_reference_number || '-';

        // 🟢 ส่งวันที่ เช็คอิน-เช็คเอาท์ ลงไปแสดงใน HTML (อิงจาก id ใน HTML ของคุณ)
        if (document.getElementById('vbCheckIn')) document.getElementById('vbCheckIn').textContent = checkInStr;
        if (document.getElementById('vbCheckOut')) document.getElementById('vbCheckOut').textContent = checkOutStr;

        const total = parseFloat(b.total_price) || 0;
        const deposit = parseFloat(b.deposit_amount) || 0;
        const paid = parseFloat(b.remaining_amount) || 0; 
        let net = total - deposit - paid;
        if (net < 0) net = 0;

        document.getElementById('vbTotal').textContent = total.toLocaleString();
        document.getElementById('vbDeposit').textContent = deposit.toLocaleString();
        document.getElementById('vbPaid').textContent = paid.toLocaleString();
        // ตรงนี้ใช้ vbNet ตามโค้ดเดิมของคุณ (แต่ถ้าใน HTML เป็น vbNetRemaining ให้แก้ให้ตรงกันนะครับ)
        const netEl = document.getElementById('vbNet') || document.getElementById('vbNetRemaining');
        if (netEl) {
            if (net === 0 && total > 0) {
                netEl.textContent = "0 บาท (ชำระครบแล้ว)";
                netEl.style.color = "green";
            } else {
                netEl.textContent = net.toLocaleString() + " บาท";
                netEl.style.color = "red";
            }
        }

        document.getElementById('viewBookingModal').classList.add('open');
        document.getElementById('panelOverlay').style.display = 'block';

    } catch (error) {
        console.error("Error opening modal:", error);
        alert("❌ เกิดข้อผิดพลาดในการแสดงข้อมูล");
    }
}
// ==========================================
// ระบบ Side Panel จองด่วน (Quick Booking)
// ==========================================
let currentQbRoomId = null;

// 1. ฟังก์ชันกดเพื่อเปิดหน้าต่าง Side Panel ด้านขวา
function goToQuickBooking(roomId) {
    currentQbRoomId = roomId;
    
    // ดึงวันที่จาก Dashboard ปัจจุบัน
    const checkInDate = document.getElementById('revenueDate').value;
    
    // ตั้งค่าวันเช็คเอาท์เริ่มต้น (พัก 1 คืน)
    const checkOutObj = new Date(checkInDate);
    checkOutObj.setDate(checkOutObj.getDate() + 1);
    const checkOutDate = checkOutObj.toISOString().split('T')[0];

    // ใส่ข้อมูลลงในฟอร์มของ Side Panel
    document.getElementById('qbRoomId').textContent = roomId;
    document.getElementById('qbCheckIn').value = checkInDate;
    document.getElementById('qbCheckOut').value = checkOutDate;
    document.getElementById('qbCustName').value = '';
    document.getElementById('qbCustPhone').value = '';

    // เลื่อนหน้าต่าง Side Panel ออกมา
    document.getElementById('qbPanel').classList.add('open');
    document.getElementById('qbOverlay').style.display = 'block';
}

// 2. ฟังก์ชันปิดหน้าต่าง
function closeQuickBookingPanel() {
    document.getElementById('qbPanel').classList.remove('open');
    document.getElementById('qbOverlay').style.display = 'none';
}

// 3. ฟังก์ชันวาร์ปไปหน้า Booking.html แบบเต็ม (เผื่อต้องใส่เงินมัดจำ)
function goToFullBooking() {
    const checkInDate = document.getElementById('qbCheckIn').value;
    const checkOutDate = document.getElementById('qbCheckOut').value;
    window.location.href = `booking.html?quickbook=true&room=${currentQbRoomId}&checkin=${checkInDate}&checkout=${checkOutDate}`;
}

// 🟢 4. ฟังก์ชันบันทึกการจองด่วน
let quickBookRoomId = null;

function openQuickBookModal(roomId) {
    quickBookRoomId = roomId;
    document.getElementById('qbRoomNo').textContent = roomId;

    // เซ็ตวันที่เป็นวันนี้ กับพรุ่งนี้
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // ฟังก์ชันแปลงวันที่ให้เป็น YYYY-MM-DD แบบตรงเป๊ะตามเวลาไทย
    const toLocalISODate = (date) => {
        const tzOffset = date.getTimezoneOffset() * 60000;
        return new Date(date - tzOffset).toISOString().split('T')[0];
    };

    document.getElementById('qbCheckIn').value = toLocalISODate(today);
    document.getElementById('qbCheckOut').value = toLocalISODate(tomorrow);

    document.getElementById('quickBookModal').classList.add('open');
    // ใช้ panelOverlay ร่วมกับหน้าต่างสรุปบิลได้เลย
    document.getElementById('panelOverlay').style.display = 'block'; 
}

// 🟢 ฟังก์ชันปิดหน้าต่าง (ผมเพิ่มให้ครับ)
function closeQuickBookModal() {
    document.getElementById('quickBookModal').classList.remove('open');
    document.getElementById('panelOverlay').style.display = 'none';
}

// ฟังก์ชันส่งลูกค้าไปหน้า Booking_system.html
function goToFullBooking() {
    const checkIn = document.getElementById('qbCheckIn').value;
    const checkOut = document.getElementById('qbCheckOut').value;
    
    // เปลี่ยนเป้าหมายไปที่ไฟล์ booking.html 
    window.location.href = `booking.html?room=${quickBookRoomId}&in=${checkIn}&out=${checkOut}`;
}

function closeViewBookingModal() {
    document.getElementById('viewBookingModal').classList.remove('open');
    document.getElementById('panelOverlay').style.display = 'none';
}

function goToEditBooking() {
    if (currentViewBookingId) {
        // วาร์ปไปหน้า booking.html พร้อมแนบ ID บิลไปใน URL
        window.location.href = `booking.html?edit=${currentViewBookingId}`;
    }
}

function closeAllSidePanels() {
    // ปิดหน้าต่างสรุปบิล
    const viewModal = document.getElementById('viewBookingModal');
    if (viewModal) viewModal.classList.remove('open');

    // ปิดหน้าต่างจองด่วน
    const qbModal = document.getElementById('quickBookModal');
    if (qbModal) qbModal.classList.remove('open');

    // ซ่อนพื้นหลังสีดำ
    const overlay = document.getElementById('panelOverlay');
    if (overlay) overlay.style.display = 'none';
}

// ผูกคำสั่ง: เมื่อคลิกที่พื้นหลังสีดำ ให้ปิดหน้าต่าง
document.addEventListener('DOMContentLoaded', () => {
    const overlayEl = document.getElementById('panelOverlay');
    if (overlayEl) {
        overlayEl.addEventListener('click', closeAllSidePanels);
    }
});

// ผูกคำสั่ง: เมื่อกดปุ่ม ESC บนคีย์บอร์ด ให้ปิดหน้าต่าง
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeAllSidePanels();
    }
});
async function deleteOtherTransaction(transactionId, createdAt) {
    // 1. ถามยืนยันก่อนลบ เพื่อป้องกันพนักงานมือลั่น
    const confirmDelete = confirm("⚠️ คุณต้องการลบรายการนี้ใช่หรือไม่?\n(เมื่อลบแล้ว ยอดเงินจะถูกหักออกจากสรุปยอดทันที)");
    if (!confirmDelete) return;

    try {
        // 2. สั่งลบข้อมูลจาก Supabase 
        // ⚠️ หมายเหตุ: ถ้าในฐานข้อมูลคุณใช้ชื่อคอลัมน์ว่า 'id' เฉยๆ ให้เปลี่ยนคำว่า 'transaction_id' เป็น 'id' นะครับ
        const { error } = await db.from('other_transactions')
            .delete()
            .eq('transaction_id', transactionId); 

        if (error) throw error;

        // 3. ดึงวันที่ปัจจุบันที่กำลังเลือกอยู่ เพื่อโหลดตารางใหม่
        const selectedDate = document.getElementById('revenueDate').value;

        // 4. โหลดข้อมูลใหม่เพื่ออัปเดตตารางและกล่องสรุปยอด
        if (typeof loadAllData === 'function') {
            loadAllData(selectedDate);
        } else {
            loadOtherTransactions(selectedDate);
        }

    } catch (error) {
        console.error("Delete OT Error:", error);
        alert("❌ เกิดข้อผิดพลาดในการลบ: " + error.message);
    }
}

function goToEditCustomer() {
    if (currentCustomerId) {
        // วาร์ปไปหน้าต่างใหม่ พร้อมแนบรหัสลูกค้าไปที่ URL (เช่น edit_customer.html?id=123)
        window.location.href = `edit_customer.html?id=${currentCustomerId}`;
    } else {
        alert("ไม่พบข้อมูลลูกค้าระบบนี้ (อาจเป็นบิลเก่าที่ไม่ได้ผูกชื่อไว้)");
    }
}
