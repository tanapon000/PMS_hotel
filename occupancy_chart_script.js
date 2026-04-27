// --- 1. ตั้งค่า Supabase ---
const SUPABASE_URL = 'http://192.168.2.200:8000';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ตัวแปรเก็บกราฟ (เอาไว้ทำลายกราฟเก่าก่อนวาดใหม่)
let myChart = null;

// ลงทะเบียน Plugin โชว์ตัวเลขบนกราฟ
Chart.register(ChartDataLabels);

document.addEventListener('DOMContentLoaded', () => {
    // เซ็ตค่าเริ่มต้นเป็น "วันแรก" ถึง "วันสุดท้าย" ของเดือนปัจจุบัน
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    // ปรับ Timezone ให้เป็น local เพื่อไม่ให้วันที่เพี้ยน
    const formatYMD = (d) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d - offset).toISOString().split('T')[0];
    };

    document.getElementById('startDate').value = formatYMD(firstDay);
    document.getElementById('endDate').value = formatYMD(lastDay);

    // โหลดกราฟอัตโนมัติ
    loadChartData();
});

async function loadChartData() {
    const startStr = document.getElementById('startDate').value;
    const endStr = document.getElementById('endDate').value;

    if (!startStr || !endStr || startStr > endStr) {
        alert("กรุณาเลือกช่วงวันที่ให้ถูกต้องครับ");
        return;
    }

    document.getElementById('chartSummary').innerHTML = '⏳ กำลังคำนวณข้อมูล...';

    try {
        // 1. ดึงข้อมูลการจองห้องพัก
        const queryEnd = new Date(endStr);
        queryEnd.setDate(queryEnd.getDate() + 1);
        const queryEndStr = queryEnd.toISOString().split('T')[0];

        const { data: bookings, error } = await db.from('booking_rooms')
            .select(`
                room_id, check_in_date, check_out_date,
                bookings!inner(booking_status)
            `)
            .lt('check_in_date', queryEndStr)
            .gt('check_out_date', startStr)
            .neq('bookings.booking_status', 'Cancelled');

        if (error) throw error;

        // 2. เตรียมตัวแปร
        const labels = []; 
        const dataPoints = []; 
        const backgroundColors = []; 

        const dayColors = {
            0: '#fc1504', // อาทิตย์
            1: '#fbc02d', // จันทร์
            2: '#ff5df2', // อังคาร
            3: '#4caf50', // พุธ
            4: '#ff9800', // พฤหัส
            5: '#2196f3', // ศุกร์
            6: '#9c27b0'  // เสาร์
        };
        const dayNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

        // 🟢 ตัวแปรใหม่: สำหรับเก็บผลรวมห้อง และจำนวนวัน เพื่อหาค่าเฉลี่ย
        // (0=อาทิตย์, 1=จันทร์, ..., 6=เสาร์)
        const daySums = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
        const dayCounts = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };

        // 3. วนลูปทีละวัน
        let currentDate = new Date(startStr);
        const endDateObj = new Date(endStr);
        let totalRoomsInRange = 0;

        while (currentDate <= endDateObj) {
            const currentStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay(); // 0-6

            let dailyCount = 0;
            (bookings || []).forEach(b => {
                if (b.check_in_date <= currentStr && b.check_out_date > currentStr) {
                    dailyCount++;
                }
            });

            // ใส่ข้อมูลกราฟ
            const displayDate = currentStr.split('-').reverse().join('/') + ` (${dayNames[dayOfWeek]})`;
            labels.push(displayDate);
            dataPoints.push(dailyCount);
            backgroundColors.push(dayColors[dayOfWeek]);
            
            totalRoomsInRange += dailyCount;

            // 🟢 เก็บยอดสะสมสำหรับคำนวณค่าเฉลี่ย
            daySums[dayOfWeek] += dailyCount;
            dayCounts[dayOfWeek]++;

            // เลื่อนไปวันถัดไป
            currentDate.setDate(currentDate.getDate() + 1);
        }

        document.getElementById('chartSummary').innerHTML = `📅 รวมจำนวนห้องที่ขายได้ (Room Nights) ในช่วงนี้: <b>${totalRoomsInRange.toLocaleString()} คืน</b>`;

        // 4. วาดกราฟ
        renderChart(labels, dataPoints, backgroundColors);

        // 🟢 5. คำนวณและวาดตารางค่าเฉลี่ย (เรียง จันทร์ -> อาทิตย์)
        const tbodyAvg = document.getElementById('averageTableBody');
        
        // ฟังก์ชันช่วยคำนวณ (ถ้าไม่มีวันนั้นในเรนจ์เลย ให้เป็น 0)
        const getAvg = (dayIndex) => {
            if (dayCounts[dayIndex] === 0) return "-";
            const avg = daySums[dayIndex] / dayCounts[dayIndex];
            // โชว์ทศนิยม 1 ตำแหน่งเพื่อให้เห็นความละเอียด
            return avg.toFixed(1); 
        };

        tbodyAvg.innerHTML = `
            <tr style="font-size: 20px; font-weight: bold; background-color: #fafafa;">
                <td style="border: 1px solid #ddd; padding: 15px; color: #f9a825;">${getAvg(1)}</td> <td style="border: 1px solid #ddd; padding: 15px; color: #c2185b;">${getAvg(2)}</td> <td style="border: 1px solid #ddd; padding: 15px; color: #388e3c;">${getAvg(3)}</td> <td style="border: 1px solid #ddd; padding: 15px; color: #f57c00;">${getAvg(4)}</td> <td style="border: 1px solid #ddd; padding: 15px; color: #1976d2;">${getAvg(5)}</td> <td style="border: 1px solid #ddd; padding: 15px; color: #7b1fa2;">${getAvg(6)}</td> <td style="border: 1px solid #ddd; padding: 15px; color: #d32f2f;">${getAvg(0)}</td> </tr>
            <tr style="font-size: 12px; color: #888;">
                <td style="border: 1px solid #ddd; padding: 5px;">(เฉลี่ยจาก ${dayCounts[1]} วัน)</td>
                <td style="border: 1px solid #ddd; padding: 5px;">(เฉลี่ยจาก ${dayCounts[2]} วัน)</td>
                <td style="border: 1px solid #ddd; padding: 5px;">(เฉลี่ยจาก ${dayCounts[3]} วัน)</td>
                <td style="border: 1px solid #ddd; padding: 5px;">(เฉลี่ยจาก ${dayCounts[4]} วัน)</td>
                <td style="border: 1px solid #ddd; padding: 5px;">(เฉลี่ยจาก ${dayCounts[5]} วัน)</td>
                <td style="border: 1px solid #ddd; padding: 5px;">(เฉลี่ยจาก ${dayCounts[6]} วัน)</td>
                <td style="border: 1px solid #ddd; padding: 5px;">(เฉลี่ยจาก ${dayCounts[0]} วัน)</td>
            </tr>
        `;

    } catch (error) {
        console.error("Chart Error:", error);
        document.getElementById('chartSummary').innerHTML = `<span style="color:red;">❌ เกิดข้อผิดพลาด: ${error.message}</span>`;
    }
}

function renderChart(labels, dataPoints, backgroundColors) {
    const ctx = document.getElementById('occupancyChart').getContext('2d');

    // ถ้ามีกราฟเก่าอยู่ ต้องทำลายทิ้งก่อนวาดใหม่ (ป้องกันบั๊กตอนเอาเมาส์ชี้)
    if (myChart) {
        myChart.destroy();
    }

    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'จำนวนห้องที่เข้าพัก',
                data: dataPoints,
                backgroundColor: backgroundColors,
                borderWidth: 1,
                borderRadius: 4 // ทำขอบแท่งกราฟให้โค้งมนนิดๆ
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // ซ่อนกล่องอธิบายสีของ Chart.js เพราะเราทำแบบ Custom ไว้ด้านล่างแล้ว
                },
                // ตั้งค่าปลั๊กอิน DataLabels (ตัวเลขบนกราฟ)
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    color: '#333',
                    font: {
                        weight: 'bold',
                        size: 14
                    },
                    formatter: function(value) {
                        return value > 0 ? value : ''; // ถ้าเป็น 0 ไม่ต้องโชว์เลขให้รก
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1 // บังคับให้แกน Y โชว์ทีละ 1 ห้อง (ไม่โชว์ทศนิยม)
                    },
                    // เผื่อพื้นที่ด้านบนสุดของกราฟไว้ 10% ให้ตัวเลขไม่ล้นทะลุกรอบ
                    grace: '10%' 
                },
                x: {
                    ticks: {
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}