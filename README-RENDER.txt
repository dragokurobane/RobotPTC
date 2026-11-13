วิธีเอาขึ้น GitHub + Render (ใช้ได้จากทุกเครื่อง ผ่านอินเทอร์เน็ต)
==================================================================

A) อัปโหลดขึ้น GitHub
  1) เข้า github.com แล้วล็อกอิน (ยังไม่มีบัญชีให้สมัครฟรี)
  2) มุมขวาบน กด "+" -> New repository -> ตั้งชื่อ เช่น robot-arena -> เลือก Public หรือ Private ก็ได้ -> Create repository
  3) กดลิงก์ "uploading an existing file"
  4) แตก zip แล้วเปิดโฟลเดอร์ robot5 ลากไฟล์ "ทั้งหมดที่อยู่ข้างใน" ไปวางในหน้าเว็บ
     (ต้องให้ server.js กับ package.json อยู่นอกสุดของ repository ห้ามอัปโหลดทั้งโฟลเดอร์ robot5 ซ้อนอีกชั้น)
  5) รอให้อัปโหลดเสร็จ แล้วกด Commit changes

B) สร้างเว็บบน Render
  1) เข้า render.com -> สมัคร/ล็อกอินด้วยบัญชี GitHub
  2) กด New + -> Web Service -> เลือก repository robot-arena
  3) ตั้งค่า
        Language / Runtime : Node
        Build Command      : npm install
        Start Command      : node server.js
        Instance Type      : Free
  4) แนะนำ: ตั้งรหัสผ่านกันคนอื่นเข้ามากดคะแนน
        เลื่อนลงไป Environment Variables -> Add Environment Variable
        Key   : ACCESS_KEY
        Value : รหัสที่คุณตั้งเอง (ภาษาอังกฤษ/ตัวเลข ไม่มีเว้นวรรค เช่น robot2569)
  5) กด Create Web Service รอ 2-4 นาที จะได้ที่อยู่ เช่น https://robot-arena.onrender.com

C) ใช้งานหน้างาน (ถ้าตั้ง ACCESS_KEY ต้องต่อท้ายที่อยู่ด้วย ?key=รหัส ทุกหน้า)
  เครื่องควบคุม : https://robot-arena.onrender.com/?key=robot2569
  เครื่องโปรเจกเตอร์ / OBS : https://robot-arena.onrender.com/display.html?key=robot2569
  - ดูแถบล่างของหน้าควบคุม ต้องขึ้น "LAN ONLINE • จอที่เชื่อมต่อ N"
    ถ้าขึ้น OFFLINE READY แปลว่ายังไม่เชื่อมต่อ ให้เช็กว่าต่อท้าย ?key= ถูกต้องหรือไม่
  - OBS: เพิ่ม Source ชนิด Browser ใส่ที่อยู่ display.html?key=... ขนาด 1920x1080

ข้อควรรู้
  - แพ็กเกจฟรีของ Render จะหลับเมื่อไม่มีคนใช้ประมาณ 15 นาที ตอนเปิดครั้งแรกหลังหลับอาจรอ 30-60 วินาที
    ควรเปิดหน้าควบคุมทิ้งไว้ก่อนเริ่มงานอย่างน้อย 10 นาที และเช็กว่าขึ้น LAN ONLINE แล้ว
  - เปิดหน้าควบคุมบนเครื่องเดียวเท่านั้น
  - แก้ไฟล์แล้วอัปโหลดทับบน GitHub Render จะอัปเดตให้เองอัตโนมัติ
  - ข้อมูลคะแนนในหน้าควบคุมเก็บในเบราว์เซอร์ของเครื่องควบคุม (ไม่ได้เก็บบนเซิร์ฟเวอร์)
    ถ้าเซิร์ฟเวอร์หลับหรือรีสตาร์ต หน้าควบคุมจะเชื่อมต่อใหม่เองและโปรเจกเตอร์ขอสถานะล่าสุดกลับมา
