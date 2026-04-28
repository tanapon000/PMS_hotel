// --- 1. ตั้งค่า Supabase ---
const SUPABASE_URL = 'http://192.168.2.200:8000'; // ⚠️ เปลี่ยนเป็นของคุณ
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'; 
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const urlParams = new URLSearchParams(window.location.search);
const targetBookingId = urlParams.get('booking_id');

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('issueDate').valueAsDate = new Date();
    await generateFolioNumber();

    if (targetBookingId) {
        await loadDataFromBooking(targetBookingId);
    } else {
        addTableRow(); // สร้างแถวว่าง 1 แถวถ้าเปิดบิลใหม่
    }
});

// 🟢 สร้างเลขที่เอกสารอัตโนมัติ (เช่น 2567-001)
async function generateFolioNumber() {
    const today = new Date();
    const yearThai = (today.getFullYear() + 543).toString(); 
    
    const { data } = await db.from('folios')
        .select('folio_number')
        .ilike('folio_number', `${yearThai}-%`)
        .order('folio_number', { ascending: false })
        .limit(1);

    let nextNum = 1;
    if (data && data.length > 0) {
        const lastNum = data[0].folio_number.split('-')[1];
        nextNum = parseInt(lastNum, 10) + 1;
    }
    
    document.getElementById('folioNumber').value = `${yearThai}-${nextNum.toString().padStart(3, '0')}`;
}

// 🟢 โหลดข้อมูลบิลและการจอง
async function loadDataFromBooking(bId) {
    const { data, error } = await db.from('bookings')
        .select(`
            total_price,
            customers (name, address, id_card_or_passport, phone, email),
            booking_rooms (
                room_id, check_in_date, check_out_date, price_per_night,
                rooms(room_types(type_name)),
                room_guests(guest_name)
            )
        `)
        .eq('booking_id', bId)
        .single();

    if (!data) return;

    // เติมข้อมูลลูกค้า
    const c = data.customers || {};
    document.getElementById('custName').value = c.name || '';
    document.getElementById('custAddress').value = c.address || '';
    document.getElementById('custTaxId').value = c.id_card_or_passport || '';
    document.getElementById('custTel').value = c.phone || '';

    // เติมข้อมูลห้องพัก
    const rooms = data.booking_rooms || [];
    const tbody = document.getElementById('folioTableBody');
    tbody.innerHTML = '';

    rooms.forEach((r, idx) => {
        // รวมชื่อแขกในห้องด้วยการขึ้นบรรทัดใหม่
        const guests = (r.room_guests || []).map(g => g.guest_name).join('\n');
        
        // คำนวณวัน
        const start = new Date(r.check_in_date);
        const end = new Date(r.check_out_date);
        const nights = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
        const totalRoomPrice = r.price_per_night * nights;

        // แปลงวันที่ให้อ่านง่าย
        const fd = (d) => d ? d.split('-').reverse().join('/') : '';

        addTableRow({
            roomNo: r.room_id,
            roomType: r.rooms?.room_types?.type_name || '',
            guests: guests,
            rate: r.price_per_night,
            arr: fd(r.check_in_date),
            dep: fd(r.check_out_date),
            total: totalRoomPrice
        });
    });

    calculateTotal();
}

// 🟢 ฟังก์ชันเพิ่มแถวตาราง
function addTableRow(d = {}) {
    const tbody = document.getElementById('folioTableBody');
    const rowCount = tbody.rows.length + 1;
    const tr = document.createElement('tr');
    
    tr.innerHTML = `
        <td>${rowCount}</td>
        <td><input type="text" class="t-room" value="${d.roomNo || ''}"></td>
        <td><input type="text" class="t-type" value="${d.roomType || ''}"></td>
        <td><textarea class="ta-left t-name" rows="2" style="width:100%; border:none; resize:none;">${d.guests || ''}</textarea></td>
        <td><input type="number" class="t-rate" value="${d.rate || 0}" oninput="updateRowTotal(this)"></td>
        <td><input type="text" class="t-arr" value="${d.arr || ''}" placeholder="DD/MM/YY"></td>
        <td><input type="text" class="t-dep" value="${d.dep || ''}" placeholder="DD/MM/YY"></td>
        <td><input type="number" class="t-total" value="${d.total || 0}" oninput="calculateTotal()"></td>
        <td class="no-print"><button class="btn btn-red" onclick="this.closest('tr').remove(); calculateTotal();">X</button></td>
    `;
    tbody.appendChild(tr);
    
    // ปรับความสูงของ Textarea อัตโนมัติ
    const ta = tr.querySelector('textarea');
    ta.style.height = (ta.scrollHeight) + 'px';
    ta.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
}

function updateRowTotal(el) {
    // สมมติพัก 1 คืน ถ้าจะให้คำนวณคืนด้วย ต้องแปลงวันที่ แต่เพื่อความยืดหยุ่นให้พนักงานแก้ราคารวมเอาเองดีกว่า
    const row = el.closest('tr');
    const rate = parseFloat(row.querySelector('.t-rate').value) || 0;
    row.querySelector('.t-total').value = rate; 
    calculateTotal();
}

// 🟢 คำนวณ VAT และยอดรวม
function calculateTotal() {
    let sum = 0;
    document.querySelectorAll('.t-total').forEach(input => {
        sum += parseFloat(input.value) || 0;
    });

    const vatType = document.getElementById('vatType').value;
    const discount = parseFloat(document.getElementById('valDiscount').value) || 0;
    
    let subtotal = sum;
    let vat = 0;
    let grandTotal = 0;

    if (vatType === 'exclude') {
        // เพิ่ม VAT เข้าไป (Vat Out)
        vat = sum * 0.07;
        grandTotal = sum + vat - discount;
    } else if (vatType === 'include') {
        // ถอด VAT ออกมา (Vat In)
        subtotal = sum * 100 / 107;
        vat = sum - subtotal;
        grandTotal = sum - discount;
    } else {
        // ไม่มี VAT
        grandTotal = sum - discount;
    }

    document.getElementById('valSubtotal').value = subtotal.toFixed(2);
    document.getElementById('valVat').value = vat.toFixed(2);
    document.getElementById('valGrandTotal').value = grandTotal.toFixed(2);

    // อัปเดตตัวหนังสือภาษาไทย
    document.getElementById('thaiBahtText').innerText = ArabicNumberToText(grandTotal.toFixed(2));
}

// 🟢 บันทึกและสั่ง Print
async function saveAndPrint() {
    const btn = document.querySelector('.btn-green');
    btn.textContent = "⏳ กำลังบันทึก...";
    btn.disabled = true;

    // รวบรวมข้อมูลในตาราง
    const items = [];
    document.querySelectorAll('#folioTableBody tr').forEach(row => {
        items.push({
            room_no: row.querySelector('.t-room').value,
            room_type: row.querySelector('.t-type').value,
            guest_names: row.querySelector('.t-name').value,
            room_rate: parseFloat(row.querySelector('.t-rate').value) || 0,
            arrival: row.querySelector('.t-arr').value,
            departure: row.querySelector('.t-dep').value,
            total_price: parseFloat(row.querySelector('.t-total').value) || 0
        });
    });

    const payload = {
        folio_number: document.getElementById('folioNumber').value,
        booking_id: targetBookingId || null,
        customer_name: document.getElementById('custName').value,
        customer_address: document.getElementById('custAddress').value,
        customer_tax_id: document.getElementById('custTaxId').value,
        customer_tel: document.getElementById('custTel').value,
        issue_date: document.getElementById('issueDate').value,
        items: items,
        subtotal: parseFloat(document.getElementById('valSubtotal').value) || 0,
        vat_amount: parseFloat(document.getElementById('valVat').value) || 0,
        discount: parseFloat(document.getElementById('valDiscount').value) || 0,
        grand_total: parseFloat(document.getElementById('valGrandTotal').value) || 0
    };

    try {
        // บันทึกแบบ Upsert (ถ้าย้อนกลับมาแก้บิลเดิม จะได้ทับของเดิม)
        const { error } = await db.from('folios').upsert(payload, { onConflict: 'folio_number' });
        if (error) throw error;
        
        // สั่ง Print
        window.print();
        
    } catch (err) {
        alert("❌ เกิดข้อผิดพลาดในการบันทึก: " + err.message);
    } finally {
        btn.textContent = "💾 บันทึก & พิมพ์ (Print)";
        btn.disabled = false;
    }
}

// 🟢 ตัวช่วยแปลงตัวเลขเป็นคำอ่านภาษาไทย
function ArabicNumberToText(Number) {
    var Number = Number.toString().replace(/,/g, "");
    if (isNaN(Number)) return "ข้อมูลไมถูกต้อง";
    if (Number == 0) return "ศูนย์บาทถ้วน";
    
    var parts = Number.split('.');
    var num = parts[0];
    var fraction = parts[1] || "";
    
    var t = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
    var n = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
    
    function readNum(str) {
        var res = "";
        for (var i = 0; i < str.length; i++) {
            var d = parseInt(str.charAt(i));
            var p = str.length - i - 1;
            if (d == 0) continue;
            if (p == 1 && d == 1) res += "สิบ";
            else if (p == 1 && d == 2) res += "ยี่สิบ";
            else if (p == 0 && d == 1 && str.length > 1 && parseInt(str.charAt(i-1)) != 0) res += "เอ็ด";
            else res += n[d] + t[p];
        }
        return res;
    }
    
    var bahtTxt = readNum(num);
    var result = bahtTxt + "บาท";
    
    if (parseInt(fraction) > 0) {
        fraction = fraction.padEnd(2, '0').substring(0, 2);
        result += readNum(fraction) + "สตางค์";
    } else {
        result += "ถ้วน";
    }
    return result;
}