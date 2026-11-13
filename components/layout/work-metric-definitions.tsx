/** Native disclosure keeps metric definitions available to keyboard and touch users. */
export function WorkMetricDefinitions() {
  return (
    <details className="min-w-0 rounded-xl border border-border/60 px-4 py-3 text-sm">
      <summary className="cursor-pointer rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">วิธีคำนวณและขอบเขตข้อมูล</summary>
      <dl className="mt-3 grid gap-3 text-muted-foreground sm:grid-cols-2">
        <div><dt className="font-medium text-foreground">จำนวนงานและช่วงเวลา</dt><dd>นับ Work Items ตามตัวกรอง โดยใช้วันที่ทำงาน หากไม่มีใช้วันกำหนดส่ง แล้วจึงใช้วันที่สร้าง ตามลำดับ ช่วงวันรวมวันเริ่มต้นและวันสิ้นสุดตาม Asia/Bangkok</dd></div>
        <div><dt className="font-medium text-foreground">งานที่ยังเปิดและเกินกำหนด</dt><dd>งานที่ยังเปิด = ทั้งหมด − เสร็จแล้ว − ยกเลิก งานเกินกำหนดคือกำหนดส่งก่อนวันปัจจุบันตาม Asia/Bangkok และยังไม่เสร็จหรือยกเลิก</dd></div>
        <div><dt className="font-medium text-foreground">อัตราสำเร็จและความคืบหน้า Project</dt><dd>completed ÷ (total − cancelled) × 100 หรือ งานเสร็จ ÷ (งานทั้งหมด − งานยกเลิก) × 100 ถ้าไม่มีงานที่นำมาคำนวณ แสดง 0% อัตราสำเร็จของรายงานใช้ชุดงานที่กรอง ส่วนความคืบหน้า Project ใช้งานทั้งหมดของเจ้าของใน Project นั้น</dd></div>
        <div><dt className="font-medium text-foreground">ชั่วโมงที่บันทึก</dt><dd>รวมชั่วโมงจริงจาก Daily Work ตามวันที่บันทึกและตัวกรอง เก็บความละเอียดทศนิยมเดิมและไม่ปัดก่อนรวม แสดงชั่วโมงเป็นทศนิยม 2 ตำแหน่ง กราฟใช้ค่าประมาณเพื่อวาดภาพ ส่วนยอดรวม ตาราง และ tooltip ใช้ยอดจริงในการจัดรูปแบบ</dd></div>
        <div className="sm:col-span-2"><dt className="font-medium text-foreground">การอ่านกราฟ</dt><dd>สถานะเป็นสถานะปัจจุบันของงานในช่วงที่เลือก กราฟชั่วโมงแสดงชั่วโมงที่บันทึกในแต่ละช่วง ไม่ใช่จำนวนงานที่เสร็จย้อนหลัง</dd></div>
      </dl>
    </details>
  )
}
