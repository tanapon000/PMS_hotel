// --- ตั้งค่า Supabase ---
const SUPABASE_URL = 'http://192.168.2.200:8000'; // ⚠️ เปลี่ยนเป็นของคุณ
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'; // ⚠️ เปลี่ยนเป็นของคุณ
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const urlParams = new URLSearchParams(window.location.search);
const bId = urlParams.get('b_id'); 
let currentInvoiceId = null;
let currentIssueDate = new Date(); // เก็บวันที่เอกสารไว้เพื่อใช้ตอนเปลี่ยนภาษา

document.addEventListener('DOMContentLoaded', async () => {
    if (!bId) return alert("ไม่พบข้อมูลอ้างอิง Booking");

    // เช็คว่า Booking นี้เคยออกบิลไปแล้วหรือยัง
    const { data: existingInv } = await db.from('invoices').select('*').eq('booking_id', bId).single();

    if (existingInv) {
        currentInvoiceId = existingInv.invoice_id;
        document.getElementById('docType').value = existingInv.invoice_type;
        document.getElementById('invNumber').value = existingInv.invoice_number;
        document.getElementById('custName').value = existingInv.customer_name || '';
        document.getElementById('custAddress').value = existingInv.customer_address || '';
        document.getElementById('custTaxId').value = existingInv.customer_tax_id || '';
        document.getElementById('custTel').value = existingInv.customer_tel || '';
        document.getElementById('remark').value = existingInv.note || '';
        
        currentIssueDate = new Date(existingInv.created_at);
        fillDateInputs(currentIssueDate);
        
        // โหลดข้อมูลตาราง
        if (existingInv.items && existingInv.items.length > 0) {
            existingInv.items.forEach(item => addTableRow(item));
        } else {
            addTableRow(); // แถวว่าง
        }

        calcTotal();

        // 🔒 เช็คล็อก 24 ชั่วโมง
        const hoursPassed = (new Date() - new Date(existingInv.created_at)) / (1000 * 60 * 60);
        if (hoursPassed > 24) {
            document.getElementById('lockWarning').style.display = 'block';
            document.getElementById('btnSave').style.display = 'none';
            document.querySelectorAll('input, select, textarea, button').forEach(el => {
                if(el.id !== 'btnSave' && el.innerText !== '🖨️ พิมพ์ (Print)' && el.id !== 'langSelect') el.disabled = true;
            });
        }

    } else {
        // ดึงข้อมูลใหม่จาก Booking และจัดกลุ่ม
        const { data: bData } = await db.from('bookings')
            .select(`
                booking_id, customers(name, address, id_card_or_passport, phone),
                booking_rooms( room_id, check_in_date, check_out_date, price_per_night, rooms(room_types(type_name)) )
            `)
            .eq('booking_id', bId).single();

        if (bData) {
            const cust = bData.customers || {};
            document.getElementById('custName').value = cust.name || '';
            document.getElementById('custAddress').value = cust.address || '';
            document.getElementById('custTaxId').value = cust.id_card_or_passport || '';
            document.getElementById('custTel').value = cust.phone || '';
            
            // 🟢 ระบบยุบรวมห้อง (Grouping)
            let itemsMap = {};
            (bData.booking_rooms || []).forEach(r => {
                let typeName = r.rooms?.room_types?.type_name || 'ห้องพัก';
                let key = `${typeName}_${r.check_in_date}_${r.check_out_date}_${r.price_per_night}`;
                
                if(!itemsMap[key]) {
                    const start = new Date(r.check_in_date);
                    const end = new Date(r.check_out_date);
                    const nights = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) || 1;
                    
                    itemsMap[key] = {
                        desc: `ค่าห้องพัก (${typeName})`,
                        in: formatDate(r.check_in_date),
                        out: formatDate(r.check_out_date),
                        nights: nights,
                        qty: 0,
                        price: parseFloat(r.price_per_night)
                    };
                }
                itemsMap[key].qty += 1;
            });

            // สร้างแถวตามกลุ่มข้อมูล
            Object.values(itemsMap).forEach(item => {
                item.total = item.qty * item.nights * item.price;
                addTableRow(item);
            });

            currentIssueDate = new Date();
            fillDateInputs(currentIssueDate);
            generateInvoiceNumber();
            calcTotal();
        }
    }
    toggleLanguage(); // ตรวจสอบและตั้งค่าภาษาเริ่มต้น
});

// 🟢 ฟังก์ชันเปลี่ยนภาษา (อัปเดตแปลชนิดห้องอัตโนมัติ)
function toggleLanguage() {
    const lang = document.getElementById('langSelect').value;
    
    if (lang === 'EN') {
        document.getElementById('compName').innerText = "Smile Place 2016 LTD. (Head Office)";
        document.getElementById('compAddr').innerText = "209/38-39 Moo 2, T. Doi Kaeo, A. Chom Thong, Chiang Mai 50160";
        document.getElementById('compTel').innerText = "Tel. 053-341155, 065-7538313, 064-3322345";
        document.getElementById('compTax').innerText = "Tax ID: 0503559002660";

        document.getElementById('lblDate').innerText = "Date";
        document.getElementById('lblMonth').innerText = "Month";
        document.getElementById('lblYear').innerText = "Year";

        document.getElementById('thNo').innerText = "No.";
        document.getElementById('thItem').innerText = "Description";
        document.getElementById('thCheckIn').innerText = "Check-in";
        document.getElementById('thCheckOut').innerText = "Check-out";
        document.getElementById('thNights').innerText = "Nights";
        document.getElementById('thRooms').innerText = "Qty";
        document.getElementById('thAmount').innerText = "Amount";
        document.getElementById('thDelete').innerText = "Del";
        
        document.getElementById('lblRemark').innerText = "Remark:";
        document.getElementById('lblTextAmt').innerText = "(In words)";
        
        document.querySelectorAll('.lblSign').forEach(el => el.innerText = "Sign");
        document.querySelectorAll('.lblCollector').forEach(el => el.innerText = "Collector");
        
    } else {
        document.getElementById('compName').innerText = "ห้างหุ้นส่วนจำกัด สมายเพลส 2016 (สำนักงานใหญ่)";
        document.getElementById('compAddr').innerText = "เลขที่ 209/38-39 หมู่ 2 ต.ดอยแก้ว อ.จอมทอง จ.เชียงใหม่ 50160";
        document.getElementById('compTel').innerText = "โทร. 053-341155, 065-7538313, 064-3322345";
        document.getElementById('compTax').innerText = "เลขประจำตัวผู้เสียภาษีอากร 0503559002660";

        document.getElementById('lblDate').innerText = "วันที่";
        document.getElementById('lblMonth').innerText = "เดือน";
        document.getElementById('lblYear').innerText = "พ.ศ.";

        document.getElementById('thNo').innerText = "ลำดับ";
        document.getElementById('thItem').innerText = "รายการ";
        document.getElementById('thCheckIn').innerText = "เช็คอิน";
        document.getElementById('thCheckOut').innerText = "เช็คเอาท์";
        document.getElementById('thNights').innerText = "คืน";
        document.getElementById('thRooms').innerText = "ห้อง";
        document.getElementById('thAmount').innerText = "จำนวนเงิน";
        document.getElementById('thDelete').innerText = "ลบ";
        
        document.getElementById('lblRemark').innerText = "หมายเหตุ / Remark:";
        document.getElementById('lblTextAmt').innerText = "(ตัวอักษร / In words)";
        
        document.querySelectorAll('.lblSign').forEach(el => el.innerText = "ลงชื่อ");
        document.querySelectorAll('.lblCollector').forEach(el => el.innerText = "ผู้รับเงิน");
    }
    
    // 🟢 ระบบแปลภาษาชนิดห้องในตาราง
    document.querySelectorAll('.i-desc').forEach(input => {
        let text = input.value;
        if (lang === 'EN') {
            text = text.replace(/ค่าห้องพัก/g, 'Room Charge');
            text = text.replace(/เตียงเดี่ยว/g, 'Single beds room');
            text = text.replace(/เตียงคู่/g, 'Double bed room');
            text = text.replace(/ห้องแอร์/g, 'Air-con room');
            text = text.replace(/ห้องพัดลม/g, 'Fan room');
            text = text.replace(/ห้องครอบครัว/g, 'Family room');
            text = text.replace(/ห้องพัก/g, 'Room');
        } else {
            text = text.replace(/Room Charge/ig, 'ค่าห้องพัก');
            text = text.replace(/Single beds room/ig, 'เตียงเดี่ยว');
            text = text.replace(/Double bed room/ig, 'เตียงคู่');
            text = text.replace(/Air-con room/ig, 'ห้องแอร์');
            text = text.replace(/Fan room/ig, 'ห้องพัดลม');
            text = text.replace(/Family room/ig, 'ห้องครอบครัว');
            text = text.replace(/Room/ig, 'ห้องพัก');
        }
        input.value = text;
    });
    
    updateDocTitle();
    fillDateInputs(currentIssueDate); 
}

function addTableRow(data = {}) {
    const tbody = document.getElementById('invoiceItemsBody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="row-num" style="text-align:center;"></td>
        <td><input type="text" class="i-desc ta-left" value="${data.desc || ''}" placeholder="..."></td>
        <td><input type="text" class="i-in" value="${data.in || ''}" placeholder="DD/MM/YY"></td>
        <td><input type="text" class="i-out" value="${data.out || ''}" placeholder="DD/MM/YY"></td>
        <td><input type="number" class="i-nights" value="${data.nights || ''}" oninput="calcRow(this)"></td>
        <td><input type="number" class="i-qty" value="${data.qty || ''}" oninput="calcRow(this)"></td>
        <td><input type="number" class="i-total" value="${data.total || ''}" style="text-align:right;" oninput="calcTotal()"></td>
        <td class="no-print"><button class="btn-red" onclick="this.closest('tr').remove(); updateRowNumbers(); calcTotal();">X</button></td>
    `;
    tbody.appendChild(tr);
    updateRowNumbers();
}

function updateRowNumbers() {
    document.querySelectorAll('.row-num').forEach((td, index) => {
        td.textContent = index + 1;
    });
}

function calcRow(element) {
    calcTotal();
}

document.getElementById('docType').addEventListener('change', function() {
    updateDocTitle();
    generateInvoiceNumber();
    calcTotal();
});

function updateDocTitle() {
    const type = document.getElementById('docType').value;
    const lang = document.getElementById('langSelect').value;
    const title = document.getElementById('displayDocTitle');
    
    if(type === 'CASH') {
        title.textContent = lang === 'EN' ? "CASH RECEIPT" : "บิลเงินสด (CASH RECEIPT)";
    } else {
        title.textContent = lang === 'EN' ? "RECEIPT / TAX INVOICE" : "ใบเสร็จรับเงิน / ใบกำกับภาษี (RECEIPT / TAX INVOICE)";
    }
}

async function generateInvoiceNumber() {
    if(currentInvoiceId) return; 
    const type = document.getElementById('docType').value;
    const prefix = type === 'TAX' ? 'INV' : 'CSH';
    const d = new Date();
    const yearThai = (d.getFullYear() + 543).toString().slice(-2);
    const monthStr = (d.getMonth() + 1).toString().padStart(2, '0');
    const yearMonth = `${yearThai}${monthStr}`;

    const { data } = await db.from('invoices')
        .select('invoice_number')
        .ilike('invoice_number', `${prefix}${yearMonth}%`)
        .order('invoice_number', { ascending: false }).limit(1);

    let nextNum = 1;
    if (data && data.length > 0) nextNum = parseInt(data[0].invoice_number.slice(-4)) + 1;
    document.getElementById('invNumber').value = `${prefix}${yearMonth}${nextNum.toString().padStart(4, '0')}`;
}

function calcTotal() {
    let grandTotal = 0;
    document.querySelectorAll('.i-total').forEach(input => {
        grandTotal += parseFloat(input.value) || 0;
    });
    
    let subtotal = grandTotal;
    let vat = 0;

    if (document.getElementById('docType').value === 'TAX') {
        subtotal = grandTotal * 100 / 107;
        vat = grandTotal - subtotal;
    }

    document.getElementById('valSubtotal').textContent = subtotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('valVat').textContent = vat.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('valGrandTotal').textContent = grandTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    document.getElementById('thaiBahtText').textContent = ArabicNumberToText(grandTotal.toFixed(2));
}

async function saveInvoice() {
    const btn = document.getElementById('btnSave');
    btn.textContent = "⏳ กำลังบันทึก...";
    btn.disabled = true;
    
    calcTotal();
    const grandTotal = parseFloat(document.getElementById('valGrandTotal').textContent.replace(/,/g, '')) || 0;
    let subtotal = grandTotal;
    let vat = 0;
    if (document.getElementById('docType').value === 'TAX') {
        subtotal = grandTotal * 100 / 107;
        vat = grandTotal - subtotal;
    }

    const items = [];
    document.querySelectorAll('#invoiceItemsBody tr').forEach(tr => {
        const desc = tr.querySelector('.i-desc').value.trim();
        if(desc) {
            items.push({
                desc: desc,
                in: tr.querySelector('.i-in').value,
                out: tr.querySelector('.i-out').value,
                nights: parseFloat(tr.querySelector('.i-nights').value) || null,
                qty: parseFloat(tr.querySelector('.i-qty').value) || null,
                total: parseFloat(tr.querySelector('.i-total').value) || 0
            });
        }
    });

    const payload = {
        booking_id: bId,
        invoice_type: document.getElementById('docType').value,
        invoice_number: document.getElementById('invNumber').value,
        customer_name: document.getElementById('custName').value,
        customer_address: document.getElementById('custAddress').value,
        customer_tax_id: document.getElementById('custTaxId').value,
        customer_tel: document.getElementById('custTel').value,
        subtotal: subtotal,
        vat_amount: vat,
        grand_total: grandTotal,
        note: document.getElementById('remark').value,
        items: items
    };

    try {
        if (currentInvoiceId) {
            await db.from('invoices').update(payload).eq('invoice_id', currentInvoiceId);
        } else {
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

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()+543}`;
}

function fillDateInputs(d) {
    const lang = document.getElementById('langSelect').value;
    const monthsTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const monthsEN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    document.getElementById('invDay').value = d.getDate();
    document.getElementById('invMonth').value = lang === 'EN' ? monthsEN[d.getMonth()] : monthsTH[d.getMonth()];
    document.getElementById('invYear').value = lang === 'EN' ? d.getFullYear() : d.getFullYear() + 543;
    
    const yearForSign = lang === 'EN' ? d.getFullYear() : d.getFullYear() + 543;
    const fd = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${yearForSign}`;
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