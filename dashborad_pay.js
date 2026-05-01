// --- 1. ตั้งค่า Supabase ---
const SUPABASE_URL = 'http://192.168.2.200:8000'; // ⚠️ เปลี่ยนเป็นของคุณ
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'; // ⚠️ เปลี่ยนเป็นของคุณ
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function changeDate(daysToAdd, inputId) {
    const dateInput = document.getElementById(inputId);
    if (!dateInput || !dateInput.value) return;
    const currentDate = new Date(dateInput.value);
    currentDate.setDate(currentDate.getDate() + daysToAdd);
    const tzOffset = currentDate.getTimezoneOffset() * 60000;
    const newDateStr = new Date(currentDate - tzOffset).toISOString().split('T')[0];
    dateInput.value = newDateStr;
    const event = new Event('change');
    dateInput.dispatchEvent(event);
}

let staffMapData = {};
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { data: staffs } = await db.from('staffs').select('staff_id, staff_name');
        if (staffs) {
            let options = '<option value="">-- เลือก --</option>';
            staffs.forEach(s => {
                options += `<option value="${s.staff_id}">${s.staff_name}</option>`;
                staffMapData[s.staff_id] = s.staff_name;
            });
            const otStaffEl = document.getElementById('otStaff');
            if (otStaffEl) otStaffEl.innerHTML = options;
        }
    } catch (err) {
        console.error("Error loading staffs:", err);
    }

    const datePicker = document.getElementById('revenueDate');
    if (datePicker) {
        let savedDate = localStorage.getItem('pms_selected_date');
        if (!savedDate) {
            const dateObj = new Date();
            dateObj.setMinutes(dateObj.getMinutes() - dateObj.getTimezoneOffset());
            savedDate = dateObj.toISOString().split('T')[0];
            localStorage.setItem('pms_selected_date', savedDate);
        }
        datePicker.value = savedDate;
        loadAllData(savedDate);
        datePicker.addEventListener('change', (e) => {
            const newDate = e.target.value;
            localStorage.setItem('pms_selected_date', newDate); 
            loadAllData(newDate); 
        });
    }
});

// ==========================================
// ส่วนที่ 1: ตารางรายรับหลักฝั่งซ้าย
// ==========================================
let bookingCache = {};
let bookingRoomCache = {}; 

async function loadRevenueData(selectedDate) {
    const tbody = document.getElementById('revenueTableBody');
    tbody.innerHTML = '<tr><td colspan="17">⏳ กำลังดึงข้อมูล...</td></tr>';
    bookingCache = {};
    bookingRoomCache = {}; 
    
    try {
        const { data: allRooms } = await db.from('rooms').select('room_id').order('room_id', { ascending: true });
        
        const { data: bookingsToday } = await db.from('booking_rooms')
            .select(`
                booking_room_id, room_id, check_in_date, check_out_date,
                bookings ( 
                    booking_id, total_price, deposit_amount, deposit_payment_time, deposit_staff, deposit_payment_method,
                    remaining_amount, final_payment_time, payment_received_by_staff, final_payment_method,
                    booking_channel, ota_reference_number, notes,
                    customers(customer_id, name, phone)
                ),
                invoices ( invoice_id, invoice_type, invoice_number )
            `)
            .lte('check_in_date', selectedDate).gt('check_out_date', selectedDate);

        const { data: maintenanceToday } = await db.from('maintenance_rooms')
            .select('*')
            .lte('start_date', selectedDate)
            .gte('end_date', selectedDate);

        const bookingMap = {};
        (bookingsToday || []).forEach(b => { if (b && b.room_id) bookingMap[b.room_id] = b; });
        
        const maintenanceMap = {};
        (maintenanceToday || []).forEach(mt => { maintenanceMap[mt.room_id] = mt; });

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
            tbody.innerHTML = '<tr><td colspan="17" style="text-align:center; color:gray;">ไม่พบข้อมูลห้องพักในระบบ</td></tr>';
            return;
        }

        safeRooms.forEach(room => {
            const b = bookingMap[room.room_id];
            const mt = maintenanceMap[room.room_id];

            if (mt) {
                tbody.innerHTML += `
                    <tr style="background-color: #ffebee; cursor: not-allowed;" title="ห้องกำลังปิดซ่อมบำรุง">
                        <td><b style="color: #c62828;">${room.room_id}</b></td>
                        <td colspan="16" style="color: #c62828; font-weight: bold; text-align: left; padding-left: 20px;">
                            🛠️ ปิดซ่อมบำรุง: ${mt.reason || '-'}
                        </td>
                    </tr>
                `;
            }
            else if (b && b.bookings) {
                const bk = b.bookings;
                const bId = bk.booking_id;
                bookingCache[bId] = b;
                bookingRoomCache[b.booking_room_id] = b; 
                
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

                let invStatus = '-';
                if (b.invoices && b.invoices.length > 0) {
                    const type = b.invoices[0].invoice_type;
                    invStatus = type === 'TAX' 
                        ? '<span style="background:#e3f2fd; color:#1565c0; padding:2px 4px; border-radius:3px; font-size:10px; font-weight:bold;">TAX</span>' 
                        : '<span style="background:#e8f5e9; color:#2e7d32; padding:2px 4px; border-radius:3px; font-size:10px; font-weight:bold;">CASH</span>';
                }

                tbody.innerHTML += `
                    <tr onclick="openViewBookingModal('${bId}', '${b.booking_room_id}')" ${trStyle}>
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
                        
                        <td style="text-align:center;">${invStatus}</td>
                    </tr>
                `;
            } 
            else {
                tbody.innerHTML += `
                    <tr onclick="openQuickBookModal('${room.room_id}')" style="cursor: pointer; background: #fafafa;">
                        <td><b>${room.room_id}</b></td>
                        <td colspan="16" style="color: #9e9e9e; text-align: center;">
                            -- ว่าง -- <span style="color: #2196F3; font-size: 11px;">(คลิกเพื่อจองด่วน)</span>
                        </td>
                    </tr>
                `;
            }
        });
    } catch (error) {
        console.error("Revenue Data Error:", error);
        tbody.innerHTML = `<tr><td colspan="17" style="color:red; text-align:center;">❌ Error: ${error.message} <br>ลองกด F12 แล้วดูช่อง Console ครับ</td></tr>`;
    }
}

// ==========================================
// ส่วนประมวลผลเวลา และ สรุปยอดฝั่งขวา
// ==========================================
let dailySummary = { 'เงินสด': 0, 'เงินโอน': 0, 'บัตรเครดิต': 0, 'Qr code': 0 };

function loadAllData(date) {
    loadRevenueData(date); 
    const startStr = `${date}T12:00:00+07:00`;
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const endStr = `${nextDay.toISOString().split('T')[0]}T11:59:59+07:00`;
    dailySummary = { 'เงินสด': 0, 'เงินโอน': 0, 'บัตรเครดิต': 0, 'Qr code': 0 };
    loadShiftRoomIncome(startStr, endStr);
    loadOtherTransactions(startStr, endStr);
}

function addSummaryAmount(method, amount, type = 'Income') {
    if (!method || amount <= 0) return; 
    let m = String(method).toLowerCase(); 
    let val = (type === 'Expense') ? -amount : amount;
    if (m.includes('สด') || m.includes('cash')) dailySummary['เงินสด'] += val;
    else if (m.includes('โอน') || m.includes('transfer')) dailySummary['เงินโอน'] += val;
    else if (m.includes('เครดิต') || m.includes('credit')) dailySummary['บัตรเครดิต'] += val;
    else if (m.includes('qr')) dailySummary['Qr code'] += val;
}

function renderSummaryBox() {
    document.getElementById('sumCash').textContent = dailySummary['เงินสด'].toLocaleString();
    document.getElementById('sumTransfer').textContent = dailySummary['เงินโอน'].toLocaleString();
    document.getElementById('sumCredit').textContent = dailySummary['บัตรเครดิต'].toLocaleString();
    document.getElementById('sumQR').textContent = dailySummary['Qr code'].toLocaleString(); 
}

function getBookingColor(bookingId) {
    if (!bookingId) return "";
    const hue = (Number(bookingId) * 137) % 360; 
    return `hsla(${hue}, 70%, 92%, 0.8)`; 
}

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
        bookingCache[b.booking_id] = { bookings: b }; 

        const roomsStr = (b.booking_rooms || []).map(r => r.room_id).join(', ');
        const checkInStr = (b.booking_rooms && b.booking_rooms.length > 0) ? b.booking_rooms[0].check_in_date : '-';
        const checkOutStr = (b.booking_rooms && b.booking_rooms.length > 0) ? b.booking_rooms[0].check_out_date : '-';
        const custName = b.customers?.name || 'ไม่ระบุ';
        const roomCount = b.booking_rooms ? b.booking_rooms.length : 0;
        const isMultiRoom = roomCount > 1;
        let multiRoomBadge = '';
        if (isMultiRoom) {
            multiRoomBadge = `<span style="background-color: #2196F3; color: white; border-radius: 3px; padding: 1px 4px; font-size: 9px; margin-left: 5px;">หลายห้อง (${roomCount})</span>`;
        }

        let isStaying = false;
        if (checkInStr !== '-' && checkOutStr !== '-') {
            if (selectedDate >= checkInStr && selectedDate <= checkOutStr) {
                isStaying = true;
            }
        }

        if (b.deposit_payment_time) {
            const depTime = new Date(b.deposit_payment_time).getTime();
            if (depTime >= startTime && depTime <= endTime && b.deposit_amount > 0) {
                addSummaryAmount(b.deposit_payment_method, b.deposit_amount);
                if (!isStaying) {
                    html += `<tr onclick="openViewBookingModal('${b.booking_id}')">
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

        if (b.final_payment_time) {
            const payTime = new Date(b.final_payment_time).getTime();
            if (payTime >= startTime && payTime <= endTime && b.remaining_amount > 0) {
                addSummaryAmount(b.final_payment_method, b.remaining_amount);
                if (!isStaying) {
                    html += `<tr onclick="openViewBookingModal('${b.booking_id}')" >
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

async function loadOtherTransactions(selectedDate) {
    const incBody = document.getElementById('otIncomeBody');
    const expBody = document.getElementById('otExpenseBody');
    const targetDate = selectedDate || document.getElementById('revenueDate').value;
    const { data, error } = await db.from('other_transactions')
        .select('*')
        .eq('transaction_date', targetDate) 
        .order('created_at', { ascending: true }); 

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
            addSummaryAmount(t.payment_method, parseFloat(t.amount), 'Income');
        } else {
            expHtml += trHtml;
            addSummaryAmount(t.payment_method, parseFloat(t.amount), 'Expense');
        }
    });

    incBody.innerHTML = incHtml || '<tr><td colspan="4" style="color:#999; text-align:center;">ไม่มีข้อมูลรายรับ</td></tr>';
    expBody.innerHTML = expHtml || '<tr><td colspan="4" style="color:#999; text-align:center;">ไม่มีข้อมูลรายจ่าย</td></tr>';
    renderSummaryBox(); 
}

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

async function saveOtherTransaction() {
    const type = document.getElementById('otType').value;
    const category = document.getElementById('otCategory').value.trim();
    const method = document.getElementById('otMethod').value;
    const amount = parseFloat(document.getElementById('otAmount').value) || 0;
    const staff = document.getElementById('otStaff').value;
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
            transaction_date: date, 
            transaction_type: type,
            category: category,
            payment_method: method,
            amount: amount,
            staff_id: staff
        }]);

        if (error) throw error;
        closeOtPanel();
        document.getElementById('otCategory').value = '';
        document.getElementById('otAmount').value = '';
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
// ส่วนที่ 3: ระบบ Modal ดูรายละเอียดบิล 
// ==========================================
let currentViewBookingId = null; 
let currentCustomerId = null;

function openViewBookingModal(bookingId, bookingRoomId) {
    try {
        let data, b, roomsStr, checkInStr, checkOutStr;

        if (bookingRoomId && bookingRoomCache[bookingRoomId]) {
            data = bookingRoomCache[bookingRoomId];
            b = data.bookings;
            roomsStr = data.room_id; 
            checkInStr = data.check_in_date;
            checkOutStr = data.check_out_date;
        } else if (bookingCache[bookingId]) {
            data = bookingCache[bookingId];
            b = data.bookings;
            roomsStr = (b.booking_rooms || []).map(r => r.room_id).join(', ');
            checkInStr = (b.booking_rooms && b.booking_rooms.length > 0) ? b.booking_rooms[0].check_in_date : '-';
            checkOutStr = (b.booking_rooms && b.booking_rooms.length > 0) ? b.booking_rooms[0].check_out_date : '-';
        } else {
            console.error("หาข้อมูลบิลใน Cache ไม่เจอ ID:", bookingId);
            return;
        }

        currentViewBookingId = b.booking_id;
        currentCustomerId = b.customers?.customer_id || null;

        document.getElementById('vbId').textContent = `${b.booking_id} (ห้อง: ${roomsStr})`;
        document.getElementById('vbName').textContent = b.customers?.name || '-';
        document.getElementById('vbPhone').textContent = b.customers?.phone || '-'; 
        document.getElementById('vbChannel').textContent = b.booking_channel || '-';
        document.getElementById('vbRef').textContent = b.ota_reference_number || '-';

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

        const isFullyPaid = (net === 0);
        const actionArea = document.getElementById('invoiceActionArea');
        if (actionArea) {
            if (bookingRoomId) {
                if (isFullyPaid) {
                    actionArea.innerHTML = `<button onclick="window.open('invoice.html?br_id=${bookingRoomId}', '_blank')" class="btn-invoice">🧾 ออกบิลเงินสด / ใบกำกับภาษี (ห้อง ${roomsStr})</button>`;
                } else {
                    actionArea.innerHTML = `<div style="color: red; text-align: center; font-weight: bold;">⚠️ ค้างชำระสุทธิ (ต้องชำระครบก่อนออกเอกสารบิล/ภาษีได้)</div>`;
                }
            } else {
                actionArea.innerHTML = `<div style="color: gray; text-align: center; font-size: 12px;">(ออกใบกำกับภาษีได้จากตารางห้องพักฝั่งซ้ายเท่านั้น)</div>`;
            }
        }

        document.getElementById('viewBookingModal').classList.add('open');
        document.getElementById('panelOverlay').style.display = 'block';

    } catch (error) {
        console.error("Error opening modal:", error);
        alert("❌ เกิดข้อผิดพลาดในการแสดงข้อมูล");
    }
}

// 🟢 ฟังก์ชันส่งไปหน้าออกใบ Folio 
function goToFolio() {
    if (currentViewBookingId) {
        window.open(`folio.html?booking_id=${currentViewBookingId}`, '_blank');
    } else {
        window.open(`folio.html`, '_blank');
    }
}

let quickBookRoomId = null;

function openQuickBookModal(roomId) {
    quickBookRoomId = roomId;
    document.getElementById('qbRoomNo').textContent = roomId;
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const toLocalISODate = (date) => {
        const tzOffset = date.getTimezoneOffset() * 60000;
        return new Date(date - tzOffset).toISOString().split('T')[0];
    };

    document.getElementById('qbCheckIn').value = toLocalISODate(today);
    document.getElementById('qbCheckOut').value = toLocalISODate(tomorrow);

    document.getElementById('quickBookModal').classList.add('open');
    document.getElementById('panelOverlay').style.display = 'block'; 
}

function closeQuickBookModal() {
    document.getElementById('quickBookModal').classList.remove('open');
    document.getElementById('panelOverlay').style.display = 'none';
}

function goToFullBooking() {
    const checkIn = document.getElementById('qbCheckIn').value;
    const checkOut = document.getElementById('qbCheckOut').value;
    window.location.href = `booking.html?room=${quickBookRoomId}&in=${checkIn}&out=${checkOut}`;
}

function closeViewBookingModal() {
    document.getElementById('viewBookingModal').classList.remove('open');
    document.getElementById('panelOverlay').style.display = 'none';
}

function goToEditBooking() {
    if (currentViewBookingId) {
        window.location.href = `booking.html?edit=${currentViewBookingId}`;
    }
}

function closeAllSidePanels() {
    const viewModal = document.getElementById('viewBookingModal');
    if (viewModal) viewModal.classList.remove('open');

    const qbModal = document.getElementById('quickBookModal');
    if (qbModal) qbModal.classList.remove('open');

    const overlay = document.getElementById('panelOverlay');
    if (overlay) overlay.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    const overlayEl = document.getElementById('panelOverlay');
    if (overlayEl) {
        overlayEl.addEventListener('click', closeAllSidePanels);
    }
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeAllSidePanels();
    }
});

async function deleteOtherTransaction(transactionId, createdAt) {
    const confirmDelete = confirm("⚠️ คุณต้องการลบรายการนี้ใช่หรือไม่?\n(เมื่อลบแล้ว ยอดเงินจะถูกหักออกจากสรุปยอดทันที)");
    if (!confirmDelete) return;

    try {
        const { error } = await db.from('other_transactions')
            .delete()
            .eq('transaction_id', transactionId); 

        if (error) throw error;
        const selectedDate = document.getElementById('revenueDate').value;
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
        window.location.href = `edit_customer.html?id=${currentCustomerId}`;
    } else {
        alert("ไม่พบข้อมูลลูกค้าระบบนี้ (อาจเป็นบิลเก่าที่ไม่ได้ผูกชื่อไว้)");
    }
}