    // --- 1. ตั้งค่า Supabase (อย่าลืมเปลี่ยน ANON_KEY) ---
    const SUPABASE_URL = 'http://192.168.2.200:8000';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'; 
    const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let selectedRoomsList = []; // เก็บอาร์เรย์ของห้องที่เลือกในตาราง
    let editBookingId = null; // เก็บ ID บิลถ้าอยู่ในโหมดแก้ไข
    let editCustomerId = null; // เก็บ ID ลูกค้าถ้าอยู่ในโหมดแก้ไข
    let deletedRoomIds = []; // เก็บ ID ห้องที่ถูกกดเครื่องหมายกากบาท (X) ลบออกตอนแก้ไข
    let returnUrl = "dashboard_main.html";

document.addEventListener('DOMContentLoaded', async () => {
    
    // 🟢 ตรวจสอบว่ามาจากหน้าไหน
    const referrer = document.referrer;
    if (referrer.includes("dashboard_pay.html")) {
        returnUrl = "dashboard_pay.html";
    } else if (referrer.includes("dashboard_main.html")) {
        returnUrl = "dashboard_main.html";
    }
    
    try {
        await loadStaffs();
        // 1. เปิดตัวรับสัญญาณ อ่านค่าตัวแปรที่แนบมาจาก URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoom = urlParams.get('room');
        const urlIn = urlParams.get('in');
        const urlOut = urlParams.get('out');
        const urlEdit = urlParams.get('edit');
        if (urlEdit) {
            console.log("🛠️ เข้าสู่โหมดแก้ไขบิล:", urlEdit);
            await loadEditData(urlEdit);
            return; // สั่งหยุดตรงนี้ ไม่ต้องไปดึงห้องว่างมาลงตารางแล้ว
        }
        const checkInEl = document.getElementById('checkInDate');
        const checkOutEl = document.getElementById('checkOutDate');

        // 2. จัดการเรื่อง "วันที่"
        if (urlIn && urlOut) {
            // กรณีที่มาจากปุ่ม "จองด่วน" ของ Dashboard
            checkInEl.value = urlIn;
            checkOutEl.value = urlOut;
        } else {
            // กรณีเปิดหน้าเว็บเข้ามาตรงๆ (Default: วันนี้ - พรุ่งนี้)
            if (checkInEl && checkOutEl) {
                checkInEl.valueAsDate = new Date();
                let tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                checkOutEl.valueAsDate = tomorrow;
            }
        }

        // 3. จัดการเรื่อง "ดึงห้องพักลงตารางอัตโนมัติ"
        if (urlRoom && urlIn && urlOut) {
            // ค้นหาข้อมูลประเภทห้อง (type_id, type_name) จากฐานข้อมูลก่อน
            // เพราะฟังก์ชัน addRoomToTableFromGrid ต้องการข้อมูลเหล่านี้ในการหาราคา
            const { data: roomInfo, error } = await db.from('rooms')
                .select('room_id, type_id, room_types(type_name)')
                .eq('room_id', urlRoom)
                .single();

            if (roomInfo) {
                // สั่งให้ฟังก์ชันเพิ่มห้องทำงานทันที เหมือนมีพนักงานมากดคลิกให้
                await addRoomToTableFromGrid(
                    roomInfo.room_id, 
                    roomInfo.room_types.type_name, 
                    roomInfo.type_id, 
                    urlIn, 
                    urlOut
                );
            } else if (error) {
                console.error("หาข้อมูลห้องไม่เจอ:", error);
            }
        }

        // 🟢👇 เพิ่มโค้ดชุดนี้เข้าไป: ดักจับการเปลี่ยนช่องทางการจอง 
        const channelSelect = document.getElementById('bookingChannel');
        if (channelSelect) {
            channelSelect.addEventListener('change', function() {
                const val = this.value.toLowerCase();
                const isOTA = ['agoda', 'booking.com', 'expedia', 'trip'].includes(val);
                
                // ถ้าเปลี่ยนเป็น OTA และมีห้องอยู่ในตารางแล้ว ให้รีเซ็ตราคาเป็น 0
                if (isOTA && selectedRoomsList.length > 0) {
                    selectedRoomsList.forEach(room => {
                        room.pricePerNight = 0;
                        room.totalRoomPrice = 0;
                    });
                    renderTable();
                    calculateTotalPrice();
                }
            });
        }
        //

    } catch (err) {
        console.error("เกิดข้อผิดพลาดตอนโหลดหน้าเว็บ:", err);
    }
});
    const urlParams = new URLSearchParams(window.location.search);
    const bIdFromUrl = urlParams.get('id');       // รับค่า ?id=xxx
    const isViewOnly = urlParams.get('viewOnly') === 'true'; // รับค่า ?viewOnly=true

    if (isViewOnly) {
        // ซ่อนปุ่มบันทึก หรือเปลี่ยนให้กดไม่ได้
        const btnSave = document.querySelector('.btn-save');
        if (btnSave) {
            btnSave.textContent = "🔒 บิลนี้ ห้ามแก้ไข";
            btnSave.style.background = "#9e9e9e";
            btnSave.disabled = true;
        }
        
        // ซ่อนปุ่มลบ (ถ้ามี)
        const btnDelete = document.getElementById('btnDeleteBooking');
        const btnCancle = document.getElementById('btnCancelBooking');
        if (btnDelete) btnDelete.style.display = 'none';
        if (btnCancle) btnCancle.style.display = 'none';
        // ปิดการพิมพ์ในฟอร์ม
        document.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
    }



    // --- 2. ฟังก์ชันโหลดพนักงาน ---
async function loadStaffs() {
    const { data } = await db.from('staffs').select('staff_id, staff_name').eq('is_active', true);
        if (data) {
            let options = '<option value="">-- เลือก --</option>';
            data.forEach(staff => options += `<option value="${staff.staff_id}">${staff.staff_name}</option>`);
            document.querySelectorAll('.staffSelect').forEach(select => select.innerHTML = options);
    }
}

    // --- 3. ฟังก์ชันค้นหาลูกค้า ---
const searchInput = document.getElementById('searchCustomer');
const autocompleteList = document.getElementById('autocomplete-list');
let searchTimeout;
let currentFocus = -1; // ตัวแปรเก็บตำแหน่งว่าตอนนี้ไฮไลท์อยู่ที่รายการไหน (-1 คือยังไม่ได้เลือก)

searchInput.addEventListener('input', function() {
    const searchVal = this.value.trim();
    autocompleteList.innerHTML = '';
    document.getElementById('searchResult').textContent = '';
    currentFocus = -1; // รีเซ็ตตำแหน่งไฮไลท์ทุกครั้งที่มีการพิมพ์ใหม่

    if (!searchVal) {
        document.getElementById('customerName').value = '';
        document.getElementById('customerPhone').value = '';
        return;
    }

    document.getElementById('customerName').value = searchVal;
    document.getElementById('customerPhone').value = '';

    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(async () => {
        const { data, error } = await db.from('customers')
            .select('name, phone')
            .ilike('name', `%${searchVal}%`)
            .limit(5);

        if (error) {
            console.error("ค้นหาผิดพลาด:", error);
            return;
        }

        if (data && data.length > 0) {
            data.forEach((item, index) => {
                const div = document.createElement('div');
                // ใส่ id ให้แต่ละแถว เพื่อให้เราจัดการไฮไลท์ได้ง่ายขึ้น
                div.id = `autocomplete-item-${index}`; 
                div.innerHTML = `<strong>${item.name}</strong> <small style="color:gray;">(${item.phone || 'ไม่มีเบอร์'})</small>`;
                
                // --- กรณีใช้เมาส์คลิก ---
                div.addEventListener('click', function() {
                    selectCustomer(item.name, item.phone);
                });
                
                autocompleteList.appendChild(div);
            });
        } else {
            const div = document.createElement('div');
            div.innerHTML = "<em>ไม่พบข้อมูล (ระบบจะบันทึกเป็นลูกค้าใหม่)</em>";
            div.style.color = "#999";
            div.style.cursor = "default";
            autocompleteList.appendChild(div);
        }
    }, 300);
});

// --- เพิ่มระบบรับคำสั่งจากคีย์บอร์ด ---
searchInput.addEventListener('keydown', function(e) {
    const items = autocompleteList.getElementsByTagName('div');
    if (!items || items.length === 0) return; // ถ้าไม่มีรายการโชว์อยู่ ก็ไม่ต้องทำอะไร

    // ถ้ารายการแรกเป็นคำว่า "ไม่พบข้อมูล" ก็ไม่ต้องให้เลื่อน
    if(items[0].innerHTML.includes("ไม่พบข้อมูล")) return; 

    if (e.key === 'ArrowDown') {
        // กดลูกศรลง
        currentFocus++;
        addActive(items);
    } else if (e.key === 'ArrowUp') {
        // กดลูกศรขึ้น
        currentFocus--;
        addActive(items);
    } else if (e.key === 'Enter') {
        // กด Enter
        e.preventDefault(); // ป้องกันไม่ให้ฟอร์มถูก Submit (หน้าเว็บรีเฟรช)
        if (currentFocus > -1) {
            // จำลองการคลิกที่รายการที่กำลังไฮไลท์อยู่
            items[currentFocus].click();
        }
    }
});

// ฟังก์ชันสำหรับใส่สีไฮไลท์
function addActive(items) {
    if (!items) return;
    removeActive(items); // ล้างสีอันเก่าก่อน
    
    // วนลูปให้ไฮไลท์ไม่หลุดกรอบ (ถ้าเลื่อนลงสุด ให้กลับไปบนสุด)
    if (currentFocus >= items.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = (items.length - 1);
    
    // ใส่พื้นหลังสีเทาให้แถวที่เลือก
    items[currentFocus].style.backgroundColor = '#e9e9e9'; 
}

// ฟังก์ชันล้างสีไฮไลท์
function removeActive(items) {
    for (let i = 0; i < items.length; i++) {
        items[i].style.backgroundColor = '';
    }
}

// ฟังก์ชันกลางสำหรับตอนเลือกลูกค้าเสร็จแล้ว (ใช้ร่วมกันทั้งเมาส์และคีย์บอร์ด)
function selectCustomer(name, phone) {
    document.getElementById('customerName').value = name;
    document.getElementById('customerPhone').value = phone || '';
    document.getElementById('searchResult').textContent = "✅ เลือกข้อมูลลูกค้าเรียบร้อย";
    document.getElementById('searchResult').style.color = "green";ด
    
    searchInput.value = '';
    autocompleteList.innerHTML = '';
}

// คลิกที่ว่างๆ ปิดกล่อง
document.addEventListener("click", function (e) {
    if (e.target !== searchInput) {
        autocompleteList.innerHTML = '';
    }
});
    // --- 4. ฟังก์ชันจัดการตารางห้องพัก ---



    // --- ฟังก์ชัน หาจำนวนคืน ---
function calculateNights(checkInStr, checkOutStr) {
    // 1. แปลง String ให้เป็น Date Object โดยบังคับเวลาให้เป็นเที่ยงคืนตรง
    const start = new Date(checkInStr + 'T00:00:00');
    const end = new Date(checkOutStr + 'T00:00:00');

    // 2. ล้างค่าเวลาออกอีกครั้งเพื่อความชัวร์ (เหลือแค่วัน/เดือน/ปี)
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    // 3. ตรวจสอบว่าวันที่เช็คเอาท์ น้อยกว่า หรือ เท่ากับ วันเช็คอิน หรือไม่
    if (end <= start) {
        return 0; // ถ้าเช็คเอาท์ก่อน หรือวันเดียวกัน ให้ส่งค่ากลับเป็น 0 คืน (แปลว่า Error)
    }

    // 4. คำนวณความต่างของเวลาเป็นมิลลิวินาที แล้วแปลงเป็น "วัน"
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}
// --- ฟังก์ชันเปิด Modal และตรวจสอบห้องว่าง ---
async function openRoomModal() {
    const checkIn = document.getElementById('checkInDate').value;
    const checkOut = document.getElementById('checkOutDate').value;

    if (!checkIn || !checkOut) {
        alert('กรุณาเลือกวันที่เช็คอินและเช็คเอาท์ก่อนครับ');
        return;
    }

    document.getElementById('selectedDateRange').innerText = `วันที่เลือก: ${checkIn} ถึง ${checkOut}`;
    const gridContainer = document.getElementById('roomGridContainer');
    gridContainer.innerHTML = 'กำลังตรวจสอบสถานะห้องพัก...';
    document.getElementById('roomModal').style.display = "block";

    try {
        // 1. ดึงข้อมูลห้องพักทั้งหมด
        const { data: allRooms } = await db.from('rooms')
            .select('room_id, type_id, room_types(type_name)')
            .order('room_id', { ascending: true });

        // 2. ดึงข้อมูลห้องที่ "ไม่ว่าง" (มีการจองที่คาบเกี่ยวกัน)
        const { data: occupiedRooms } = await db.from('booking_rooms')
            .select('room_id,bookings!inner(booking_status)')
            .lt('check_in_date', checkOut)
            .gt('check_out_date', checkIn)
            // 🟢 เพิ่มเงื่อนไขไม่นับบิลที่ยกเลิกแล้ว (สำคัญมาก)
            .neq('bookings.booking_status', 'Cancelled'); 

        // 🟢 3. ดึงข้อมูลห้องที่ "ปิดซ่อม" ในช่วงเวลาเดียวกัน
        const { data: maintenanceRooms } = await db.from('maintenance_rooms')
            .select('room_id')
            .lt('start_date', checkOut) // วันเริ่มซ่อม < วันเช็คเอาท์ลูกค้า
            .gt('end_date', checkIn);   // วันซ่อมเสร็จ > วันเช็คอินลูกค้า

        // สร้างเป็น Set ของ room_id ที่ไม่ว่างเพื่อให้ค้นหาเร็ว
        const occupiedRoomIds = new Set((occupiedRooms || []).map(r => r.room_id));
        const maintenanceRoomIds = new Set((maintenanceRooms || []).map(r => r.room_id));

        // 4. แสดงผล Grid
        gridContainer.innerHTML = '';
        allRooms.forEach(room => {
            const isBooked = occupiedRoomIds.has(room.room_id);
            const isMaintenance = maintenanceRoomIds.has(room.room_id);
            const isUnavailable = isBooked || isMaintenance; // ไม่ว่างถ้าจองแล้ว หรือ ซ่อมอยู่

            const card = document.createElement('div');
            
            // 🟢 กำหนดข้อความและคลาสสีตามสถานะ
            let statusText = 'ว่าง';
            let cardClass = 'available';
            if (isMaintenance) {
                statusText = '🛠️ ปิดซ่อม';
                cardClass = 'booked'; // ใช้คลาส booked ไปก่อนเพื่อให้กดไม่ได้ หรือจะสร้างคลาส css ใหม่เป็น maintenance ก็ได้
                card.style.backgroundColor = '#cfd8dc'; // ทำสีเทาให้ห้องซ่อม
                card.style.color = '#37474f';
            } else if (isBooked) {
                statusText = 'จองแล้ว';
                cardClass = 'booked';
            }

            card.className = `room-card ${cardClass}`;
            card.innerHTML = `
                <span class="room-no">${room.room_id}</span>
                <span class="room-status">${statusText}</span>
                <span style="font-size:9px;">${room.room_types.type_name}</span>
            `;

            // อนุญาตให้คลิกได้เฉพาะห้องที่ Available เท่านั้น
            if (!isUnavailable) {
                card.onclick = () => {
                    addRoomToTableFromGrid(room.room_id, room.room_types.type_name, room.type_id, checkIn, checkOut);
                    closeRoomModal();
                };
            }

            gridContainer.appendChild(card);
        });

    } catch (err) {
        console.error("Error loading rooms:", err);
        gridContainer.innerHTML = 'เกิดข้อผิดพลาดในการโหลดข้อมูล';
    }
}


// ฟังก์ชันเพิ่มห้องลงตารางเมื่อคลิกจาก Grid หรือมาจากปุ่มจองด่วน (URL)
async function addRoomToTableFromGrid(roomId, roomType, roomTypeId, checkIn, checkOut) {
    // 1. คำนวณจำนวนคืน
    const nights = calculateNights(checkIn, checkOut);
    if (nights <= 0) {
        alert("วันที่เช็คเอาท์ต้องอยู่หลังวันที่เช็คอิน");
        return;
    }

    // 2. ตรวจสอบการจองห้องซ้ำ (ทับซ้อนกันในตารางที่พนักงานกำลังกดเลือกอยู่)
    const newIn = new Date(checkIn + 'T00:00:00');
    const newOut = new Date(checkOut + 'T00:00:00');

    const isConflict = selectedRoomsList.some(room => {
        if (room.roomId === roomId) {
            const oldIn = new Date(room.checkIn + 'T00:00:00');
            const oldOut = new Date(room.checkOut + 'T00:00:00');
            if (newIn < oldOut && newOut > oldIn) {
                return true; 
            }
        }
        return false;
    });

    if (isConflict) {
        alert(`⚠️ ไม่สามารถเลือกห้อง ${roomId} ได้ครับ\nเนื่องจากคุณได้เลือกห้องนี้ในช่วงวันที่ทับซ้อนกันไปแล้ว!`);
        return; 
    }

    // 3. ตรวจสอบกับฐานข้อมูลโดยตรง ป้องกันการจองด่วนที่ห้องไม่ว่าง!
    const { data: dbConflict, error: conflictError } = await db.from('booking_rooms')
        .select('booking_room_id, bookings!inner(booking_status)')
        .eq('room_id', roomId)
        .lt('check_in_date', checkOut)  
        .gt('check_out_date', checkIn)
        .neq('bookings.booking_status', 'Cancelled'); // 🟢 ไม่นับบิลยกเลิก

    if (dbConflict && dbConflict.length > 0) {
        alert(`⚠️ จองด่วนไม่สำเร็จ!\nห้อง ${roomId} มีลูกค้าจองหรือเข้าพักอยู่แล้วในช่วงวันที่ ${checkIn} ถึง ${checkOut} ครับ`);
        return; 
    }

    // 🟢 3.1 (เพิ่มใหม่) ตรวจสอบกับฐานข้อมูลห้องเสีย
    const { data: mtConflict, error: mtError } = await db.from('maintenance_rooms')
        .select('id')
        .eq('room_id', roomId)
        .lt('start_date', checkOut)
        .gt('end_date', checkIn);

    if (mtConflict && mtConflict.length > 0) {
        alert(`⚠️ ไม่สามารถเลือกห้องได้!\nห้อง ${roomId} ถูกตั้งสถานะ "ปิดซ่อมบำรุง" ในช่วงวันที่ ${checkIn} ถึง ${checkOut} ครับ`);
        return; // สั่งหยุดเด็ดขาด!
    }

    // 4. ดึงราคาจากตาราง room_rates ที่ตรงกับประเภทห้องและช่วงเวลา
    const { data: rates, error } = await db.from('room_rates')
        .select('price')
        .eq('type_id', roomTypeId)
        .lte('start_date', checkIn)
        .gte('end_date', checkIn)
        .order('priority', { ascending: false })
        .limit(1);

    let pricePerNight = 650; 
    if (rates && rates.length > 0) {
        pricePerNight = rates[0].price;
    }
    
    // ตรวจสอบช่องทางการจอง ถ้าเป็น OTA ให้ราคาเริ่มต้นเป็น 0
    const channel = document.getElementById('bookingChannel').value.toLowerCase();
    const isOTA = ['agoda', 'booking.com', 'expedia', 'trip','ascend'].includes(channel);
    if (isOTA) {
        pricePerNight = 0;
    }

    // 5. เพิ่มข้อมูลลงในรายการที่เลือก
    selectedRoomsList.push({
        id: Date.now(),
        roomId: roomId,
        type: roomType,
        checkIn: checkIn,
        checkOut: checkOut,
        nights: nights,
        pricePerNight: pricePerNight,
        totalRoomPrice: pricePerNight * nights, 
        adult: 2,
        child: 0,
        extraBed: false
    });

    renderTable();
    calculateTotalPrice();
}


function renderTable() {
    const tbody = document.getElementById('roomTableBody');
    tbody.innerHTML = '';
    selectedRoomsList.forEach((room, index) => {
        tbody.innerHTML += `
            <tr>
                <td><b>${room.roomId}</b></td>
                <td>${room.checkIn}</td>
                <td>${room.checkOut}</td>
                <td>${room.nights}</td>
                <td>${room.type}</td>
                
                <td>
                    <input type="number" class="table-input" value="${room.totalRoomPrice}" 
                    style="width: 80px; font-weight: bold; color: #2e7d32;" 
                    onchange="updateRoomTotal(${index}, this.value)">
                </td>

                <td><input type="number" class="table-input" value="${room.adult}" min="1" onchange="updateRoom(${index}, 'adult', this.value)"></td>
                <td><input type="number" class="table-input" value="${room.child}" min="0" onchange="updateRoom(${index}, 'child', this.value)"></td>
                <td><input type="checkbox" ${room.extraBed ? 'checked' : ''} onchange="updateRoom(${index}, 'extraBed', this.checked)"></td>
                <td><button type="button" class="btn btn-danger" onclick="removeRoom(${index})">X</button></td>
            </tr>
        `;
    });
}

// ฟังก์ชันพิเศษสำหรับอัปเดตราคาต่อคืน และคำนวณราคารวมห้องใหม่
function updateRoomPrice(index, newPrice) {
    const p = parseFloat(newPrice) || 0;
    selectedRoomsList[index].pricePerNight = p;
    selectedRoomsList[index].totalRoomPrice = p * selectedRoomsList[index].nights;
    renderTable();
    calculateTotalPrice();
}

function updateRoomTotal(index, newTotal) {
    const newPrice = parseFloat(newTotal) || 0;
    selectedRoomsList[index].totalRoomPrice = newPrice;
    
    // คำนวณราคาสุทธิใหม่
    calculateTotalPrice();
    // ไม่ต้องสั่ง renderTable() ใหม่ตรงนี้ เพื่อไม่ให้เสีย Focus ตอนพนักงานกำลังพิมพ์ตัวเลข
}

// ปรับปรุงฟังก์ชันคำนวณราคารวมสุทธิ
function calculateTotalPrice() {
    let sum = selectedRoomsList.reduce((acc, curr) => acc + curr.totalRoomPrice, 0);
    document.getElementById('totalPrice').value = sum;
    calculateRemaining();
}

const EXTRA_BED_PRICE_PER_NIGHT = 200; // เปลี่ยนตัวเลข 200 เป็นราคาอื่นได้ตามต้องการ

function updateRoom(index, field, value) {
    const room = selectedRoomsList[index];

    if (field === 'extraBed') {
        const wasChecked = room.extraBed;
        room.extraBed = value; // อัปเดตสถานะเป็น true หรือ false

        // ถ้าติ๊กเลือกเตียงเสริม (บวกราคาเพิ่ม: ราคาเตียงเสริม x จำนวนคืน)
        if (value === true && !wasChecked) {
            room.totalRoomPrice += (EXTRA_BED_PRICE_PER_NIGHT * room.nights);
        } 
        // ถ้าเอาติ๊กออก (ลบราคาที่บวกไปกลับคืน)
        else if (value === false && wasChecked) {
            room.totalRoomPrice -= (EXTRA_BED_PRICE_PER_NIGHT * room.nights);
        }
        
        // สั่งอัปเดตตารางให้ช่อง "ราคารวม" แสดงตัวเลขใหม่ทันที
        renderTable(); 
    } else {
        room[field] = parseFloat(value) || 0;
    }

    // คำนวณราคาสุทธิใหม่ทุกครั้ง
    calculateTotalPrice();
}

function removeRoom(index) {
    const room = selectedRoomsList[index];
    // ถ้าห้องนี้เป็นห้องที่เคยถูกบันทึกในฐานข้อมูลแล้ว ให้จำ ID เอาไว้ไปลบทิ้งตอนกดบันทึก
    if (room.isExisting) {
        deletedRoomIds.push(room.booking_room_id);
    }
    selectedRoomsList.splice(index, 1);
    renderTable();
    calculateTotalPrice();
}

    // --- 5. ฟังก์ชันคำนวณการเงิน ---

function calculateRemaining() {
        let total = parseFloat(document.getElementById('totalPrice').value) || 0;
        let deposit = parseFloat(document.getElementById('depositAmount').value) || 0;
        let remaining = total - deposit;
        document.getElementById('remainingAmount').value = remaining < 0 ? 0 : remaining; // ห้ามติดลบ
}

// --- ฟังก์ชันสำหรับปิด Modal ---
function closeRoomModal() {
    const modal = document.getElementById('roomModal');
    if (modal) {
        modal.style.display = "none";
    }
}

// --- ทำให้คลิกพื้นที่สีดำ (นอกกรอบ) เพื่อปิด Modal ได้ ---
window.addEventListener('click', function(event) {
    const modal = document.getElementById('roomModal');
    // ถ้าจุดที่คลิกคือตัวพื้นหลังสีดำของ Modal ให้สั่งปิดทันที
    if (event.target === modal) {
        closeRoomModal();
    }
});

// --- (ของแถม) กดปุ่ม ESC บนคีย์บอร์ดเพื่อปิด Modal ---
window.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
        closeRoomModal();
    }
});


// ==========================================
// ส่วนที่ 1: ฟังก์ชันดึงข้อมูลบิลเก่ามาใส่ในฟอร์ม (Edit Mode)
// ==========================================

//แก้เวลาเป็น +7
function formatToLocalDatetime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    // ปรับค่า Offset ของ Timezone (เช่น +7 ชม.) เพื่อให้ได้เวลาท้องถิ่น
    const tzOffset = d.getTimezoneOffset() * 60000; 
    const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
    return localISOTime;
}

async function loadEditData(bId) {
    editBookingId = bId;

    // 1. เปลี่ยนหน้าตาปุ่ม
    const btnSave = document.getElementById('btnSaveBooking');
    btnSave.innerHTML = "📝 บันทึกการแก้ไข (Update)";
    btnSave.classList.replace('btn-primary', 'btn-info');
    document.getElementById('btnCancelBooking').style.display = 'block';

    // 2. ดึงข้อมูลจากฐานข้อมูล
    const { data, error } = await db.from('bookings')
        .select(`
            *,
            customers (customer_id, name, phone),
            booking_rooms (booking_room_id, room_id, check_in_date, check_out_date, price_per_night, adult_count, child_count, extra_bed, rooms(room_types(type_name)))
        `)
        .eq('booking_id', bId)
        .single();

    if (error || !data) {
        alert("❌ ไม่พบข้อมูลการจองนี้");
        return;
    }
    const bk = data;
    // 3. หยอดข้อมูลลงฟอร์ม
    document.getElementById('customerName').value = data.customers.name;
    document.getElementById('customerPhone').value = data.customers.phone || '';
    editCustomerId = data.customers.customer_id;
    if (editCustomerId) {
        document.getElementById('btnEditCustomer').style.display = 'inline-block';
    }
    document.getElementById('bookingChannel').value = data.booking_channel;
    document.getElementById('otaRef').value = data.ota_reference_number || '';
    document.getElementById('bookingNote').value = data.notes || '';

    // การเงิน
    document.getElementById('totalPrice').value = data.total_price;
    document.getElementById('depositAmount').value = data.deposit_amount;
    if(data.deposit_payment_time) document.getElementById('depositDate').value = formatToLocalDatetime(bk.deposit_payment_time);
    document.getElementById('depositMethod').value = data.deposit_payment_method || '';
    
    // โหลดรายชื่อพนักงานเสร็จแล้วค่อยยัดค่า
    await loadStaffs();
    document.getElementById('depositStaff').value = data.deposit_staff || '';

    document.getElementById('paymentAmount').value = data.remaining_amount;
    if(data.final_payment_time) document.getElementById('paymentDate').value = formatToLocalDatetime(bk.final_payment_time);
    document.getElementById('paymentMethod').value = data.final_payment_method || '';
    document.getElementById('paymentStaff').value = data.payment_received_by_staff || '';

    // 4. หยอดข้อมูลห้องพักลงตาราง
    selectedRoomsList = [];
    data.booking_rooms.forEach(br => {
        const nights = calculateNights(br.check_in_date, br.check_out_date);
        selectedRoomsList.push({
            id: Date.now() + Math.random(), 
            booking_room_id: br.booking_room_id, // 🟢 มาร์คไว้ว่ามี ID ในฐานข้อมูลแล้ว
            roomId: br.room_id,
            type: br.rooms ? br.rooms.room_types.type_name : '-',
            checkIn: br.check_in_date,
            checkOut: br.check_out_date,
            nights: nights,
            pricePerNight: br.price_per_night,
            totalRoomPrice: br.price_per_night * nights,
            adult: br.adult_count,
            child: br.child_count,
            extraBed: br.extra_bed,
            isExisting: true // 🟢 ธงบอกว่าเป็นของเก่าที่ดึงมา
        });
    });

    renderTable();
    calculateTotalPrice();

    // ==========================================
    // ตรรกะล็อคยอดเงิน (อัปเกรด: อนุญาตให้แก้ได้ใน 24 ชม.)
    // ==========================================
    const depAmt = parseFloat(bk.deposit_amount) || 0;
    const payAmt = parseFloat(bk.remaining_amount) || 0;

    // 🟢 1. คำนวณอายุของบิล (ห่างจากตอนที่สร้างกี่ชั่วโมง)
    const createdAt = new Date(bk.created_at).getTime();
    const now = new Date().getTime();
    const ageInHours = (now - createdAt) / (1000 * 60 * 60);
    const isWithin24Hours = ageInHours <= 24;

    // 🟢 เช็คเวลา 6 ชั่วโมง สำหรับปุ่ม "ลบ"
    const btnDelete = document.getElementById('btnDeleteBooking');
    if (btnDelete) {
        if (ageInHours <= 6) {
            btnDelete.style.display = 'inline-block'; // โชว์ปุ่มถ้ายังไม่เกิน 6 ชั่วโมง
        } else {
            btnDelete.style.display = 'none'; // ซ่อนปุ่มถ้าเกินแล้ว
        }
    }

    // 🟢 2. ถ้า "เกิน 24 ชั่วโมง" ค่อยทำการล็อคการเงิน!
    if (!isWithin24Hours) {
        // ล็อคช่องมัดจำ
        if (depAmt > 0) {
            const depFields = ['depositAmount', 'depositDate', 'depositMethod', 'depositStaff'];
            depFields.forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.disabled = true; el.style.backgroundColor = '#e9ecef'; el.style.cursor = 'not-allowed'; }
            });
        }
        // ล็อคช่องชำระเงิน
        if (payAmt > 0) {
            const payFields = ['paymentAmount', 'paymentDate', 'paymentMethod', 'paymentStaff'];
            payFields.forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.disabled = true; el.style.backgroundColor = '#e9ecef'; el.style.cursor = 'not-allowed'; }
            });
        }
    }

    // 🟢 3. อัปเดตข้อความแจ้งเตือนให้พนักงานทราบ
    if (!document.getElementById('editNotice')) {
        const notice = document.createElement('div');
        notice.id = 'editNotice';
        
        let msg = "";
        let bgColor = "#fff3e0";
        let borderColor = "#ff9800";
        let textColor = "#e65100";

        // เปลี่ยนสีข้อความตามเงื่อนไข
        if (isWithin24Hours) {
            msg = "🕒 บิลนี้สามารถแก้ไขยอดเงินและช่องทางการชำระได้ตามปกติ";
            bgColor = "#e8f5e9"; borderColor = "#4caf50"; textColor = "#2e7d32"; // สีเขียว
        } else if (depAmt > 0 && payAmt > 0) {
            msg = "⚠️ บิลนี้ชำระครบแล้ว ระบบล็อคข้อมูลการเงินทั้งหมด ";
        } else if (depAmt > 0) {
            msg = "⚠️ มัดจำแล้ว: ระบบล็อคช่องมัดจำ แต่สามารถลงยอดชำระส่วนที่เหลือได้";
        } else {
            msg = "⚠️ โหมดแก้ไขข้อมูลบิล";
        }
            
        notice.innerHTML = `
            <div style="background: ${bgColor}; color: ${textColor}; padding: 12px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid ${borderColor}; font-size: 14px;">
                ${msg}
            </div>
        `;
        document.getElementById('bookingForm').prepend(notice);
    }

    // ==========================================
    // 🟢 4. ตรรกะล็อคบิล หาก Check-out ผ่านไปเกิน 24 ชั่วโมง (1 วัน)
    // ==========================================
    if (bk.booking_rooms && bk.booking_rooms.length > 0) {
        // ยึดเวลา Check-out ของห้องแรก (สมมติเวลาเที่ยงวัน 12:00 น.)
        const coDateStr = bk.booking_rooms[0].check_out_date;
        const coTime = new Date(`${coDateStr}T12:00:00`).getTime();
        const diffHoursCO = (now - coTime) / (1000 * 60 * 60);
        const urlParams = new URLSearchParams(window.location.search);
        const isResolveDebt = urlParams.get('resolveDebt') === 'true';

        if (diffHoursCO > 24 && bk.booking_status !== 'Cancelled' && !isResolveDebt) {
            const checkoutNotice = document.createElement('div');
            checkoutNotice.innerHTML = `
                <div style="background: #eceff1; color: #455a64; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 5px solid #607d8b; font-size: 16px; text-align: center; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    🔒 บิลนี้ถูกล็อคเนื่องจากเช็คเอาท์ไปเกิน 24 ชั่วโมงแล้ว
                    <div style="font-size: 14px; font-weight: normal; margin-top: 5px;">
                        (สามารถดูข้อมูลได้อย่างเดียว)
                    </div>
                </div>
            `;
            document.getElementById('bookingForm').prepend(checkoutNotice);

            // ล็อคช่องกรอกข้อมูลทั้งหมด
            document.querySelectorAll('input, select, textarea, button').forEach(el => {
                // ยกเว้นปุ่มกดยกเลิกกลับหน้าแรก
                if (!el.classList.contains('close-btn') && el.id !== 'btnCancelBooking') {
                    el.disabled = true;
                    el.style.cursor = 'not-allowed';
                    if (el.tagName !== 'BUTTON') el.style.backgroundColor = '#eeeeee';
                }
            });

            // ซ่อนปุ่มบันทึกและปุ่มลบ
            const btnSaveObj = document.getElementById('btnSaveBooking');
            if (btnSaveObj) btnSaveObj.style.display = 'none';
            const btnDelObj = document.getElementById('btnDeleteBooking');
            if (btnDelObj) btnDelObj.style.display = 'none';

            // ซ่อนปุ่มกากบาทลบห้องในตาราง (ถ้ามี)
            document.querySelectorAll('.btn-remove-room').forEach(btn => btn.style.display = 'none');

            // ซ่อนแถบแจ้งเตือนสีส้ม/เขียวด้านบน จะได้ไม่ซ้ำซ้อน
            const editNoticeObj = document.getElementById('editNotice');
            if (editNoticeObj) editNoticeObj.style.display = 'none';


        }   else if (isResolveDebt && bk.booking_status !== 'Cancelled') {
           const debtNotice = document.createElement('div');
            debtNotice.innerHTML = `
                <div style="background: #ffebee; color: #c62828; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 5px solid #d32f2f; font-size: 14px; font-weight: bold;">
                    เคลียร์ยอดหนี้ค้างชำระ: 
                </div>
            `;
            document.getElementById('bookingForm').prepend(debtNotice);

            // 🟢 2. ซ่อนปุ่ม "ลบบิล" แบบเด็ดขาด
            const btnDelObj = document.getElementById('btnDeleteBooking');
            if (btnDelObj) btnDelObj.style.display = 'none';

            // 🟢 3. ซ่อนหรือล็อคปุ่ม/สถานะ "ยกเลิกการจอง (Cancel)"
            // (ถ้าคุณมี Dropdown เลือกสถานะ ให้ใส่ ID ของ Dropdown ตรงนี้)
            const statusDropdown = document.getElementById('bookingStatus'); 
            if (statusDropdown) {
                statusDropdown.disabled = true;
                statusDropdown.style.backgroundColor = '#e9ecef';
            }
            // (ถ้าคุณมีปุ่มยกเลิกแยกต่างหาก ให้ใส่ ID ของปุ่มตรงนี้)
            const btnCancelStatus = document.getElementById('btnCancelStatus'); 
            if (btnCancelStatus) btnCancelStatus.style.display = 'none';

            // 🟢 4. ล็อคข้อมูลอื่นๆ ที่ไม่ใช่การเงินทั้งหมด (ชื่อ, เบอร์, ช่องทางจอง, Note)
            const nonFinancialInputs = ['customerName', 'customerPhone', 'bookingChannel', 'otaRef', 'bookingNote'];
            nonFinancialInputs.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.disabled = true;
                    el.style.backgroundColor = '#e9ecef';
                    el.style.cursor = 'not-allowed';
                }
            });

            // 🟢 5. ซ่อนปุ่ม "ลบห้อง (X)" ในตารางห้องพัก เพื่อไม่ให้แก้ไขจำนวนห้องได้
            document.querySelectorAll('.btn-remove-room').forEach(btn => btn.style.display = 'none');
        }
    }

    // ==========================================
    // 🟢 5. กรณีบิลถูกยกเลิก (Cancelled)
    // ==========================================
    if (bk.booking_status === 'Cancelled') {
        const cancelNotice = document.createElement('div');
        cancelNotice.innerHTML = `
            <div style="background: #ffebee; color: #c62828; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 5px solid #d32f2f; font-size: 16px; text-align: center; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                ❌ บิลนี้ถูกยกเลิกการจองแล้ว
                <div style="font-size: 14px; font-weight: normal; margin-top: 5px; color: #b71c1c;">
                    (ยอดคืนเงิน: ${bk.refund_amount ? parseFloat(bk.refund_amount).toLocaleString() : 0} บาท | ช่องทาง: ${bk.refund_method || 'ไม่ระบุ'})
                </div>
            </div>
        `;
        document.getElementById('bookingForm').prepend(cancelNotice);

        // ล็อคหน้าจอทั้งหมด 100% ไม่ให้แก้ไขอะไรได้อีก
        document.querySelectorAll('input, select, textarea, button').forEach(el => {
            el.disabled = true;
            el.style.cursor = 'not-allowed';
            if (el.tagName !== 'BUTTON') el.style.backgroundColor = '#eeeeee';
        });

        // ซ่อนปุ่มบันทึกและปุ่มยกเลิกด้านล่างสุดทิ้งไปเลย
        document.getElementById('btnSaveBooking').style.display = 'none';
        document.getElementById('btnCancelBooking').style.display = 'none';
        
        // แถบสีส้มและสีเทาเตือน (ถ้ามี) ให้ซ่อนไปเลย จะได้ไม่ซ้ำซ้อนกับสีแดง
        const editNotice = document.getElementById('editNotice');
        if (editNotice) editNotice.style.display = 'none';
    }
}

// ==========================================
// ส่วนที่ 2: ฟังก์ชันยกเลิกบิล
// ==========================================
// ==========================================
// ระบบยกเลิกการจองและคืนเงิน
// ==========================================
function cancelBooking() {
    if (!editBookingId) return;

    const dep = parseFloat(document.getElementById('depositAmount').value) || 0;
    const paid = parseFloat(document.getElementById('paymentAmount').value) || 0;
    const totalPaid = dep + paid;

    document.getElementById('cancelBookingIdTxt').textContent = editBookingId;
    document.getElementById('cancelTotalPaid').textContent = totalPaid.toLocaleString();
    
    // 🟢 แก้ไขตรงนี้: ให้ค่าเริ่มต้นตรงกับฐานข้อมูลคือคำว่า "no"
    document.getElementById('refundAmount').value = 0; 
    document.getElementById('refundMethod').value = "no"; 

    document.getElementById('cancelModal').style.display = 'block';
}

function closeCancelModal() {
    document.getElementById('cancelModal').style.display = 'none';
}

async function confirmCancelBooking() {
    const refundAmt = parseFloat(document.getElementById('refundAmount').value) || 0;
    const refundMeth = document.getElementById('refundMethod').value;

    if (confirm(`ยืนยันการยกเลิกบิล #${editBookingId} และคืนเงินจำนวน ${refundAmt} บาท ใช่หรือไม่?`)) {
        try {
            // 1. อัปเดตสถานะบิลและข้อมูลการคืนเงิน
            const { error: updateErr } = await db.from('bookings').update({
                booking_status: 'Cancelled',
                refund_amount: refundAmt,
                refund_method: refundMeth
            }).eq('booking_id', editBookingId);

            if (updateErr) throw updateErr;

            // 2. เคลียร์ห้องพักออกจากตาราง booking_rooms (เพื่อให้ห้องกลับมาว่างใน Dashboard)
            const { error: roomErr } = await db.from('booking_rooms')
                .delete()
                .eq('booking_id', editBookingId);
                
            if (roomErr) throw roomErr;

            alert("✅ ยกเลิกการจองและคืนห้องพักเรียบร้อยแล้ว");
            window.location.href = returnUrl; // กลับไปหน้า Dashboard

        } catch (error) {
            console.error(error);
            alert("❌ เกิดข้อผิดพลาดในการยกเลิก: " + error.message);
        }
    }
}

// ==========================================
// ส่วนที่ 3: อัปเกรดระบบ Submit (ให้บันทึกทับได้ + บังคับกรอกข้อมูลการเงิน)
// ==========================================
document.getElementById('bookingForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    // 1. ตรวจสอบว่าเลือกห้องหรือยัง
    if(selectedRoomsList.length === 0) {
        alert('กรุณาเลือกห้องพักอย่างน้อย 1 ห้องครับ');
        return;
    }

    // 🟢 2. ตรวจสอบเงื่อนไขการกรอก "เงินมัดจำ"
    const depositAmt = parseFloat(document.getElementById('depositAmount').value) || 0;
    if (depositAmt > 0) {
        if (!document.getElementById('depositDate').value || 
            !document.getElementById('depositMethod').value || 
            !document.getElementById('depositStaff').value) {
            alert('⚠️ คุณใส่ยอดมัดจำไว้!\nกรุณากรอก "วันที่มัดจำ", "ช่องทาง" และ "พนักงานผู้รับมัดจำ" ให้ครบถ้วนครับ');
            return; // สั่งหยุด ไม่ให้บันทึก
        }
    }

    // 🟢 3. ตรวจสอบเงื่อนไขการกรอก "เงินชำระส่วนที่เหลือ"
    // (ดึงจาก remainingAmount หรือ paymentAmount ตามที่คุณตั้ง ID ไว้)
    const paymentAmt = parseFloat(document.getElementById('paymentAmount').value) || 0;
    if (paymentAmt > 0) {
        if (!document.getElementById('paymentDate').value || 
            !document.getElementById('paymentMethod').value || 
            !document.getElementById('paymentStaff').value) {
            alert('⚠️ คุณใส่ยอดชำระเงินไว้!\nกรุณากรอก "วันที่จ่าย", "ช่องทาง" และ "พนักงานผู้รับเงิน" ให้ครบถ้วนครับ');
            return; // สั่งหยุด ไม่ให้บันทึก
        }
    }
    //4. ตรวจว่าต้องใส่ผู้รับมัดจำ/จอง 
        if(!document.getElementById('depositStaff').value) {
        alert('กรุณาเลือกผู้รับมัดจำ/ผู้รับจอง');
        return;
    }

    // ผ่านด่านตรวจแล้ว เปลี่ยนสถานะปุ่มเป็นกำลังโหลด
    const submitBtn = document.getElementById('btnSaveBooking');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = "⏳ กำลังบันทึกข้อมูล...";
    submitBtn.disabled = true;

    try {
        const custName = document.getElementById('customerName').value;
        const custPhone = document.getElementById('customerPhone').value;
        let customerId = null;

        // --- 1. จัดการลูกค้า ---
        const { data: existingCust } = await db.from('customers').select('customer_id').eq('name', custName).eq('phone', custPhone).single();
        if (existingCust) {
            customerId = existingCust.customer_id;
        } else {
            const { data: newCust } = await db.from('customers').insert([{ name: custName, phone: custPhone }]).select('customer_id').single();
            customerId = newCust.customer_id;
        }

        // --- 2. จัดการบิล ---
        const rawDepositDate = document.getElementById('depositDate').value;
        const rawPaymentDate = document.getElementById('paymentDate').value;

        // ถ้ามีการกรอกเวลา ให้เอาเวลามาต่อด้วยวินาที (:00) และ Timezone (+07:00)
        // เช่น "2024-04-15T21:00" จะกลายเป็น "2024-04-15T21:00:00+07:00"
        const finalDepositDate = rawDepositDate ? `${rawDepositDate}:00+07:00` : null;
        const finalPaymentDate = rawPaymentDate ? `${rawPaymentDate}:00+07:00` : null;

        // --- 2. จัดการบิล ---
        const bookingData = {
            customer_id: customerId,
            booking_channel: document.getElementById('bookingChannel').value,
            ota_reference_number: document.getElementById('otaRef').value || null,
            total_price: parseFloat(document.getElementById('totalPrice').value) || 0,
            
            deposit_amount: parseFloat(document.getElementById('depositAmount').value) || 0,
            deposit_payment_time: finalDepositDate, // 🟢 ใช้ตัวแปรที่เติม Timezone แล้ว
            deposit_payment_method: document.getElementById('depositMethod').value || null,
            deposit_staff: document.getElementById('depositStaff').value || null,
            
            remaining_amount: parseFloat(document.getElementById('paymentAmount').value) || 0,
            final_payment_time: finalPaymentDate, // 🟢 ใช้ตัวแปรที่เติม Timezone แล้ว
            final_payment_method: document.getElementById('paymentMethod').value || null,
            payment_received_by_staff: document.getElementById('paymentStaff').value || null,
            
            notes: document.getElementById('bookingNote').value || null
        };

        let currentBookingId = editBookingId;

        if (editBookingId) {
            // โหมดแก้ไข: Update ข้อมูลบิล
            await db.from('bookings').update(bookingData).eq('booking_id', editBookingId);
        } else {
            // โหมดสร้างใหม่: Insert บิลใหม่
            bookingData.booking_status = 'Confirmed';
            const { data: newBooking } = await db.from('bookings').insert([bookingData]).select('booking_id').single();
            currentBookingId = newBooking.booking_id;
        }

        // --- 3. จัดการห้องพัก (ฉลาดขึ้น: อัปเดต/เพิ่ม/ลบ) ---
        // 3.1 ลบห้องที่พนักงานกดกากบาททิ้ง
        if (deletedRoomIds.length > 0) {
            await db.from('booking_rooms').delete().in('booking_room_id', deletedRoomIds);
        }

        // 3.2 แยกห้องเก่า (ต้อง Update) กับห้องใหม่ (ต้อง Insert)
        for (const room of selectedRoomsList) {
            const roomPayload = {
                booking_id: currentBookingId,
                room_id: room.roomId,
                check_in_date: room.checkIn,
                check_out_date: room.checkOut,
                price_per_night: room.pricePerNight,
                adult_count: room.adult,
                child_count: room.child,
                extra_bed: room.extraBed
            };

            if (room.isExisting) {
                // ของเก่า: อัปเดต
                await db.from('booking_rooms').update(roomPayload).eq('booking_room_id', room.booking_room_id);
            } else {
                // ของใหม่ (เพิ่งกดเพิ่มเข้ามาตอนแก้ไข): Insert ใหม่
                await db.from('booking_rooms').insert([roomPayload]);
            }
        }
        backupBookingToSheet(currentBookingId);
        alert(`✅ บันทึกการจองสำเร็จ! (บิล #${currentBookingId})`);
        window.location.href = returnUrl; // บันทึกเสร็จให้เด้งกลับหน้า Dashboard เลย

    } catch (error) {
        console.error("Save Error:", error);
        alert("❌ เกิดข้อผิดพลาด:\n" + error.message);
    } finally {
        // หากมี Error หรือทำเสร็จแล้ว คืนสถานะปุ่มกลับมาเผื่อพนักงานต้องแก้ไข
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});


function getCurrentLocalDatetime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16); 
}
// ==========================================
// ฟังก์ชันลบบิล (Delete Booking)
// ==========================================
async function deleteBooking() {
    if (!editBookingId) return;

    // 1. ถามยืนยันเพื่อความปลอดภัย (กันพนักงานมือลั่น)
    const confirmDelete = confirm(`⚠️ คำเตือนขั้นเด็ดขาด: \n\nคุณต้องการ "ลบ" บิลหมายเลข #${editBookingId} ทิ้งอย่างถาวรใช่หรือไม่?\n\n(การลบนี้จะไม่สามารถกู้คืนได้ และข้อมูลห้อง+รายชื่อแขกในบิลนี้จะหายไปทั้งหมด)`);
    
    if (!confirmDelete) return;

    const btn = document.getElementById('btnDeleteBooking');
    btn.textContent = "⏳ กำลังลบข้อมูล...";
    btn.disabled = true;

    try {
        // 2. ดึง ID ของห้องทั้งหมดที่อยู่ในบิลนี้ เพื่อนำไปลบรายชื่อแขกก่อน
        const { data: bRooms } = await db.from('booking_rooms')
            .select('booking_room_id')
            .eq('booking_id', editBookingId);
        
        if (bRooms && bRooms.length > 0) {
            const roomIds = bRooms.map(r => r.booking_room_id);
            // 3. ลบรายชื่อแขกในห้อง (ถ้ามี)
            await db.from('room_guests').delete().in('booking_room_id', roomIds);
        }

        // 4. ลบข้อมูลห้องที่ผูกกับบิลนี้
        await db.from('booking_rooms').delete().eq('booking_id', editBookingId);

        // 5. ลบตัวบิลหลัก (ลบใบจอง)
        const { error } = await db.from('bookings').delete().eq('booking_id', editBookingId);
        
        if (error) throw error;

        alert(`🗑️ ลบบิล #${editBookingId} ออกจากฐานข้อมูลเรียบร้อยแล้ว!`);
        
        // 6. วาร์ปกลับหน้า Dashboard ทันที
        window.location.href = returnUrl; 

    } catch (error) {
        console.error("Delete Error:", error);
        alert("❌ เกิดข้อผิดพลาดในการลบ:\n" + error.message);
        btn.textContent = "🗑️ ลบบิลนี้ทิ้ง";
        btn.disabled = false;
    }
}

// ==========================================
// 🟢 ฟังก์ชันส่งไปหน้าแก้ไขข้อมูลลูกค้า (เปิดแท็บใหม่)
// ==========================================
function goToEditCustomerFromBooking() {
    if (editCustomerId) {
        // ใช้ _blank เพื่อเปิดหน้าต่างใหม่ ข้อมูลบิลหน้าเดิมจะได้ไม่หาย
        window.open(`edit_customer.html?id=${editCustomerId}`, '_blank');
    } else {
        alert("ไม่พบข้อมูลลูกค้าในระบบครับ");
    }
}

// 🟢 เมื่อมีการพิมพ์ตัวเลขในช่อง "ยอดมัดจำ"
document.getElementById('depositAmount').addEventListener('input', function() {
    const dateInput = document.getElementById('depositDate');
    const amount = parseFloat(this.value) || 0;
    
    // ถ้าใส่เงินมากกว่า 0 และช่องเวลายังว่างอยู่ -> ให้เติมเวลาปัจจุบันให้ทันที!
    if (amount > 0 && !dateInput.value) {
        dateInput.value = getCurrentLocalDatetime();
    } else if (amount === 0) {
        // ถ้าลบยอดเงินออก ให้ล้างเวลาทิ้งด้วย
        dateInput.value = '';
    }
});

// 🟢 เมื่อมีการพิมพ์ตัวเลขในช่อง "ยอดรับชำระ (ส่วนที่เหลือ)"
document.getElementById('paymentAmount').addEventListener('input', function() {
    const dateInput = document.getElementById('paymentDate');
    const amount = parseFloat(this.value) || 0;
    
    if (amount > 0 && !dateInput.value) {
        dateInput.value = getCurrentLocalDatetime();
    } else if (amount === 0) {
        dateInput.value = '';
    }
});


// 🟢 ฟังก์ชันคำนวณและดักจับเวลา
function validatePaymentTime(inputElement) {
    const selectedTimeStr = inputElement.value;
    if (!selectedTimeStr) return; // ถ้าปล่อยว่างไว้ ไม่ต้องตรวจ

    const selectedTime = new Date(selectedTimeStr).getTime();
    const now = new Date().getTime();
    
    // คำนวณความห่างของเวลาเป็น "ชั่วโมง"
    const diffHours = (now - selectedTime) / (1000 * 60 * 60);

    if (diffHours > 26) {
        // ถ้าย้อนหลังเกิน 26 ชั่วโมง
        alert("⚠️ ไม่อนุญาตให้ลงเวลาย้อนหลัง \n(ระบบได้ปรับค่ากลับเป็นเวลาปัจจุบันแล้ว)");
        inputElement.value = getCurrentLocalDatetime(); // รีเซ็ตกลับเป็นเวลาปัจจุบัน
        
    } else if (diffHours < -6) { 
        // ถ้าเป็นเวลาในอนาคต (เผื่อเวลาเน็ตหน่วงให้ 12 นาที ป้องกัน Error)
        alert("⚠️ ไม่อนุญาตให้ลงเวลาล่วงหน้า เกิน 6 ชั่วโมง ");
        inputElement.value = getCurrentLocalDatetime(); // รีเซ็ตกลับเป็นเวลาปัจจุบัน
    }
}

// 🟢 จับตาดูเมื่อพนักงาน "เปลี่ยนวันที่/เวลา" ในช่องมัดจำ
document.getElementById('depositDate').addEventListener('change', function() {
    validatePaymentTime(this);
});

// 🟢 จับตาดูเมื่อพนักงาน "เปลี่ยนวันที่/เวลา" ในช่องรับชำระส่วนที่เหลือ
document.getElementById('paymentDate').addEventListener('change', function() {
    validatePaymentTime(this);
});

// ==========================================
// 🟢 ฟังก์ชันสำรองข้อมูลลง Google Sheet (อัปเกรด: ส่งไวทะลุเพดาน ไม่ต้องรอ!)
// ==========================================
function backupBookingToSheet(bookingId) {

    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxZgZHgR_3Rb7NDtGXRWtgTrmBEEobZUiY9JKtcscjNzypYYiZp7BswlcNKmbOTdvbF/exec';
    
    if (!bookingId) return;

    try {
        // --- ฟังก์ชันดึงชื่อพนักงานจาก Dropdown หน้าเว็บตรงๆ (ไม่ต้องโหลด DB) ---
        const getSelectText = (id) => {
            const el = document.getElementById(id);
            return (el && el.selectedIndex > 0) ? el.options[el.selectedIndex].text : '-';
        };

        // --- ฟังก์ชันจัดรูปแบบเวลา ---
        const formatTime = (dateString) => {
            if (!dateString) return '-';
            const d = new Date(dateString);
            return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
        };

        const formatDateOnly = (dateStr) => {
            if (!dateStr) return '-';
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };

        // --- รวมรายการห้องจากตัวแปร selectedRoomsList ในหน้าเว็บตรงๆ ---
        const roomList = selectedRoomsList.map(r => {
            return `${r.roomId} (${formatDateOnly(r.checkIn)} ถึง ${formatDateOnly(r.checkOut)})`;
        }).join(', \n');

        // --- รวบรวมข้อมูลจากช่องกรอกในหน้าเว็บ ---
        const payload = {
            booking_id: bookingId,
            customer_name: document.getElementById('customerName').value || '-',
            customer_phone: document.getElementById('customerPhone').value || '-',
            rooms: roomList || '-',
            booking_channel: document.getElementById('bookingChannel').value || '-',
            ota_reference: document.getElementById('otaRef').value || '-',
            total_price: parseFloat(document.getElementById('totalPrice').value) || 0,
            deposit_amount: parseFloat(document.getElementById('depositAmount').value) || 0,
            deposit_date: formatTime(document.getElementById('depositDate').value),
            deposit_staff_name: getSelectText('depositStaff'),
            remaining_amount: parseFloat(document.getElementById('paymentAmount').value) || 0,
            pay_date: formatTime(document.getElementById('paymentDate').value),
            pay_staff_name: getSelectText('paymentStaff'),
            note: document.getElementById('bookingNote').value || '-'
        };

        // --- ยิงข้อมูลไปแบบ Fire & Forget + keepalive ---
        fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            keepalive: true, // 🟢 คำสั่งเวทมนตร์: สั่งบราวเซอร์ให้ส่งต่อให้จบ แม้หน้าเว็บจะถูกปิดหรือเด้งไปหน้าอื่นแล้ว!
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => console.log("Backup Error (Background):", err));
        
    } catch (err) {
        console.error("❌ Form Data Extraction failed:", err);
    }
}
//back up ๗ากฐานข้อมูล  
//async function backupBookingToSheet(bookingId) {
//     // ⚠️ นำ Web App URL ของคุณมาใส่ตรงนี้
//     const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxZgZHgR_3Rb7NDtGXRWtgTrmBEEobZUiY9JKtcscjNzypYYiZp7BswlcNKmbOTdvbF/exec';
    
//     if (!bookingId) return;

//     try {
//         // 1. ดึงชื่อพนักงานทั้งหมดมาเตรียมไว้แปลงจาก ID -> ชื่อ
//         const { data: staffs } = await db.from('staffs').select('staff_id, staff_name');
//         const staffMap = {};
//         if (staffs) staffs.forEach(s => staffMap[s.staff_id] = s.staff_name);

//         // 2. ดึงข้อมูล Booking พร้อม Customer และ Booking_rooms (เพิ่ม check_in_date, check_out_date)
//         const { data: bData, error } = await db.from('bookings')
//             .select(`
//                 booking_id, booking_channel, ota_reference_number, total_price,
//                 deposit_amount, deposit_payment_time, deposit_staff,
//                 remaining_amount, final_payment_time, payment_received_by_staff, notes,
//                 customers ( name, phone ),
//                 booking_rooms ( room_id, check_in_date, check_out_date )
//             `)
//             .eq('booking_id', bookingId)
//             .single();

//         if (error || !bData) throw new Error("ไม่พบข้อมูล Booking ที่จะนำไป Backup");

//         // --- ฟังก์ชันแปลงวันที่แบบย่อ สำหรับเช็คอิน/เช็คเอาท์ ---
//         const formatDateOnly = (dateStr) => {
//             if (!dateStr) return '-';
//             const d = new Date(dateStr);
//             // แสดงผลเป็น วว/ดด/ปปปป (เช่น 15/04/2024)
//             return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
//         };

//         // 3. รวมหมายเลขห้องและวันที่เข้าด้วยกัน (เช่น "101 (15/04/2024 - 16/04/2024)")
//         const roomList = (bData.booking_rooms || []).map(r => {
//             return `${r.room_id} (${formatDateOnly(r.check_in_date)} ถึง ${formatDateOnly(r.check_out_date)})`;
//         }).join(', \n'); // เคาะบรรทัดให้แต่ละห้องอ่านง่ายขึ้นใน Sheet

//         // 4. แปลงวันที่และเวลาสำหรับบันทึกการจ่ายเงิน
//         const formatTime = (isoString) => {
//             if (!isoString) return '-';
//             const d = new Date(isoString);
//             return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
//         };

//         // 5. จัดเรียงข้อมูลเพื่อส่งไป Google Sheet
//         const payload = {
//             booking_id: bData.booking_id,
//             customer_name: bData.customers?.name || '-',
//             customer_phone: bData.customers?.phone || '-',
//             rooms: roomList || '-',
//             booking_channel: bData.booking_channel || '-',
//             ota_reference: bData.ota_reference_number || '-',
//             total_price: bData.total_price || 0,
//             deposit_amount: bData.deposit_amount || 0,
//             deposit_date: formatTime(bData.deposit_payment_time),
//             deposit_staff_name: staffMap[bData.deposit_staff] || '-',
//             remaining_amount: bData.remaining_amount || 0,
//             pay_date: formatTime(bData.final_payment_time),
//             pay_staff_name: staffMap[bData.payment_received_by_staff] || '-',
//             note: bData.notes || '-'
//         };

//         // 6. ยิงข้อมูลไป Google Apps Script
//         await fetch(GOOGLE_SCRIPT_URL, {
//             method: 'POST',
//             mode: 'no-cors',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify(payload)
//         });
        
//         console.log("✅ Backup to Google Sheets สำเร็จ!");
//     } catch (err) {
//         console.error("❌ Backup failed:", err);
//     }
// }