// --- ตั้งค่า Supabase ---
const SUPABASE_URL = 'http://192.168.2.200:8000'; // เปลี่ยนเป็นของคุณ
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'; // เปลี่ยนเป็นของคุณ
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const urlParams = new URLSearchParams(window.location.search);
const bRoomId = urlParams.get('br_id');
let currentInvoiceId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!bRoomId) return alert("ไม่พบข้อมูลอ้างอิงห้องพัก");

    // 1. เช็คว่าห้องนี้เคยออกบิลไปแล้วหรือยัง
    const { data: existingInv } = await db.from('invoices').select('*').eq('booking_room_id', bRoomId).single();

    if (existingInv) {
        // 🟢 มีบิลเก่า โหลดข้อมูลมาแสดง
        currentInvoiceId = existingInv.invoice_id;
        document.getElementById('docType').value = existingInv.invoice_type;
        document.getElementById('invNumber').value = existingInv.invoice_number;
        document.getElementById('custName').value = existingInv.customer_name || '';
        document.getElementById('custAddress').value = existingInv.customer_address || '';
        document.getElementById('custTaxId').value = existingInv.customer_tax_id || '';
        document.getElementById('custTel').value = existingInv.customer_tel || '';
        document.getElementById('roomNo').value = existingInv.room_number || '';
        document.getElementById('remark').value = existingInv.note || '';
        
        fillDateInputs(new Date(existingInv.created_at));
        
        document.getElementById('checkIn').value = formatDate(existingInv.check_in_date);
        document.getElementById('checkOut').value = formatDate(existingInv.check_out_date);
        document.getElementById('nights').value = existingInv.nights || 0;
        document.getElementById('pricePerNight').value = existingInv.price_per_night || 0;
        document.getElementById('otherCharges').value = existingInv.other_charges || 0;

        calcTotal();

        // 🔒 เช็คล็อก 24 ชั่วโมง
        const hoursPassed = (new Date() - new Date(existingInv.created_at)) / (1000 * 60 * 60);
        if (hoursPassed > 24) {
            document.getElementById('lockWarning').style.display = 'block';
            document.getElementById('btnSave').style.display = 'none';
            document.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
        }

    } else {
        // 🟢 ยังไม่เคยมีบิล ให้ดึงข้อมูลจากการจองมาเตรียมไว้
        const { data: bData } = await db.from('booking_rooms')
            .select('room_id, check_in_date, check_out_date, price_per_night, bookings(booking_id, customers(name, address, id_card_or_passport, phone))')
            .eq('booking_room_id', bRoomId).single();

        if (bData) {
            const cust = bData.bookings?.customers || {};
            document.getElementById('custName').value = cust.name || '';
            document.getElementById('custAddress').value = cust.address || '';
            document.getElementById('custTaxId').value = cust.id_card_or_passport || '';
            document.getElementById('custTel').value = cust.phone || '';
            document.getElementById('roomNo').value = bData.room_id || '';
            document.getElementById('checkIn').value = formatDate(bData.check_in_date);
            document.getElementById('checkOut').value = formatDate(bData.check_out_date);
            
            const start = new Date(bData.check_in_date);
            const end = new Date(bData.check_out_date);
            const nights = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
            
            document.getElementById('nights').value = nights;
            document.getElementById('pricePerNight').value = bData.price_per_night;
            
            fillDateInputs(new Date());
            generateInvoiceNumber();
            calcTotal();
        }
    }
    
    // อัปเดตหัวเอกสารตามประเภท
    updateDocTitle();
});

// จัดการเปลี่ยนหัวเอกสาร
document.getElementById('docType').addEventListener('change', function() {
    updateDocTitle();
    generateInvoiceNumber();
    calcTotal();
});

function updateDocTitle() {
    const type = document.getElementById('docType').value;
    const title = document.getElementById('displayDocTitle');
    if(type === 'CASH') title.textContent = "บิลเงินสด (CASH RECEIPT)";
    else title.textContent = "ใบเสร็จรับเงิน / ใบกำกับภาษี (RECEIPT / TAX INVOICE)";
}

async function generateInvoiceNumber() {
    if(currentInvoiceId) return; // ถ้าเป็นบิลเก่า ไม่รันเลขใหม่
    
    const type = document.getElementById('docType').value;
    const prefix = type === 'TAX' ? 'INV' : 'CSH';
    
    // แปลง ค.ศ. เป็น พ.ศ. (ปี 2024 -> 2567 -> ใช้ 67)
    const d = new Date();
    const yearThai = (d.getFullYear() + 543).toString().slice(-2);
    const monthStr = (d.getMonth() + 1).toString().padStart(2, '0');
    const yearMonth = `${yearThai}${monthStr}`; // ex. 6705

    const { data } = await db.from('invoices')
        .select('invoice_number')
        .ilike('invoice_number', `${prefix}${yearMonth}%`)
        .order('invoice_number', { ascending: false }).limit(1);

    let nextNum = 1;
    if (data && data.length > 0) {
        nextNum = parseInt(data[0].invoice_number.slice(-4)) + 1;
    }
    document.getElementById('invNumber').value = `${prefix}${yearMonth}${nextNum.toString().padStart(4, '0')}`;
}

function calcTotal() {
    const nights = parseFloat(document.getElementById('nights').value) || 0;
    const price = parseFloat(document.getElementById('pricePerNight').value) || 0;
    const others = parseFloat(document.getElementById('otherCharges').value) || 0;
    
    const grandTotal = (nights * price) + others;
    document.getElementById('grandTotalText').value = grandTotal.toLocaleString('en-US', {minimumFractionDigits: 2});
    
    let subtotal = grandTotal;
    let vat = 0;

    // ถ้าเป็นใบกำกับภาษี ให้ถอด VAT 7% ออกจากยอดรวม (Vat In)
    if (document.getElementById('docType').value === 'TAX') {
        subtotal = grandTotal * 100 / 107;
        vat = grandTotal - subtotal;
    }

    document.getElementById('valSubtotal').textContent = subtotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('valVat').textContent = vat.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('valGrandTotal').textContent = grandTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    document.getElementById('thaiBahtText').textContent = ArabicNumberToText(grandTotal.toFixed(2));
}

// 🟢 ฟังก์ชันบันทึกข้อมูลกลับลงฐานข้อมูล (รวม subtotal, vat_amount ด้วย)
async function saveInvoice() {
    const btn = document.getElementById('btnSave');
    btn.textContent = "⏳ กำลังบันทึก...";
    btn.disabled = true;
    
    // คำนวณใหม่ก่อนเซฟเพื่อความชัวร์
    calcTotal();
    const grandTotal = parseFloat(document.getElementById('grandTotalText').value.replace(/,/g, '')) || 0;
    let subtotal = grandTotal;
    let vat = 0;
    if (document.getElementById('docType').value === 'TAX') {
        subtotal = grandTotal * 100 / 107;
        vat = grandTotal - subtotal;
    }

    // วันที่ที่เก็บเข้า DB จะต้องแปลงจาก string (dd/mm/yyyy) เป็น Date format
    const strToDate = (str) => {
        if(!str) return null;
        const [d, m, y] = str.split('/');
        return `${parseInt(y)-543}-${m}-${d}`;
    };

    const payload = {
        booking_room_id: bRoomId,
        invoice_type: document.getElementById('docType').value,
        invoice_number: document.getElementById('invNumber').value,
        customer_name: document.getElementById('custName').value,
        customer_address: document.getElementById('custAddress').value,
        customer_tax_id: document.getElementById('custTaxId').value,
        customer_tel: document.getElementById('custTel').value,
        room_number: document.getElementById('roomNo').value,
        check_in_date: strToDate(document.getElementById('checkIn').value),
        check_out_date: strToDate(document.getElementById('checkOut').value),
        
        // 🟢 แก้ไขตรงนี้: บังคับให้แปลงเป็นตัวเลข ถ้าเป็นช่องว่างให้ใส่ 0 แทน
        nights: parseInt(document.getElementById('nights').value) || 0,
        price_per_night: parseFloat(document.getElementById('pricePerNight').value) || 0,
        other_charges: parseFloat(document.getElementById('otherCharges').value) || 0,
        
        subtotal: subtotal,
        vat_amount: vat,
        grand_total: grandTotal,
        note: document.getElementById('remark').value
    };

    try {
        if (currentInvoiceId) {
            // Update ของเดิม
            await db.from('invoices').update(payload).eq('invoice_id', currentInvoiceId);
        } else {
            // Insert ใหม่ (จะไปดึง booking_id ฝั่งเซิฟเวอร์มาใส่ด้วย)
            const { data: br } = await db.from('booking_rooms').select('booking_id').eq('booking_room_id', bRoomId).single();
            payload.booking_id = br.booking_id;
            const { data, error } = await db.from('invoices').insert([payload]).select('invoice_id').single();
            if(error) throw error;
            currentInvoiceId = data.invoice_id;
        }
        alert("✅ บันทึกเอกสารสำเร็จ");
    } catch (err) {
        alert("❌ ผิดพลาด: " + err.message);
    } finally {
        btn.textContent = "💾 บันทึกเอกสาร";
        btn.disabled = false;
    }
}

// --- Utilities ---
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()+543}`;
}
function fillDateInputs(d) {
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    document.getElementById('invDay').value = d.getDate();
    document.getElementById('invMonth').value = months[d.getMonth()];
    document.getElementById('invYear').value = d.getFullYear() + 543;
    
    const fd = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()+543}`;
    document.getElementById('staffSignDate').value = fd;
    document.getElementById('custSignDate').value = fd;
}
function ArabicNumberToText(Number) {
    var Number = Number.toString().replace(/,/g, "");
    if (isNaN(Number)) return "ข้อมูลไม่ถูกต้อง";
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
    var result = readNum(num) + "บาท";
    if (parseInt(fraction) > 0) result += readNum(fraction.padEnd(2, '0').substring(0, 2)) + "สตางค์";
    else result += "ถ้วน";
    return result;
}