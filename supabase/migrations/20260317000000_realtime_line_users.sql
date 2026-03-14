-- เพิ่ม line_users ใน Realtime เพื่อให้ Sidebar อัปเดตเมื่อแก้ไข profile_name
ALTER PUBLICATION supabase_realtime ADD TABLE line_users;
