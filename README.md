# QLXM - Web quản lý xưởng may

Giao diện web (HTML + JavaScript module, không cần build) dùng database `qlxm_schema_v1_1.sql` trên Supabase.

## Cấu trúc

    qlxm-web/
      index.html            Trang duy nhất, nạp CSS và js/main.js
      css/
        base.css            Biến màu, reset, kiểu chữ
        layout.css          Bố cục thanh bên + nội dung
        components.css      Form, nút, bảng, thông báo
      js/
        main.js             Điểm vào: kiểm tra đăng nhập, nạp dữ liệu, dựng giao diện
        config.js           URL và anon key của Supabase (sửa file này)
        constants.js        Vai trò, menu theo vai trò, nhãn trạng thái
        state.js            Trạng thái dùng chung
        lib/
          supabase.js       Khởi tạo client, hàm run()
          format.js         esc, number, today, docCode
          ui.js             toast, form, bảng dùng chung
        services/
          auth.js           Đăng nhập, đăng xuất, hồ sơ người dùng
          lookups.js        Nạp danh sách chọn (mã hàng, công nhân, khu, vải...)
        views/
          login.js          Màn hình đăng nhập
          shell.js          Khung ứng dụng và chuyển tab
        modules/
          index.js          Danh sách module
          orders.js         Lệnh sản xuất
          logs.js           Sản lượng
          attendance.js     Chấm công
          stock.js          Kho vải (nhập, xuất, tồn)
          fabrics.js        Danh mục vải, nhà cung cấp
          payroll.js        Kỳ lương, tính lương, thưởng/phạt, chốt kỳ
          employees.js      Nhân viên
          products.js       Mã hàng
          rates.js          Đơn giá theo sản phẩm và theo giờ

## Chạy

1. Chạy `qlxm_schema_v1_1.sql` trong Supabase SQL Editor.
2. Sửa `js/config.js` (Project URL và anon key).
3. Tạo user trong Authentication, rồi thêm dòng tương ứng vào bảng `profiles` (role phù hợp).
4. Nhập dữ liệu nền qua Table Editor: `products`, `piece_rates`, `hourly_rates`, `employees`, `suppliers`, `fabrics`.
5. Mở bằng một web server tĩnh (ES module không chạy qua file://):
   `npx serve .` hoặc `python3 -m http.server`. Có thể đưa lên Netlify, Vercel, GitHub Pages.

Thêm module mới: tạo file trong `js/modules/` theo mẫu `{ title, writeRoles, load, forms }` rồi khai báo trong `modules/index.js` và `constants.js` (NAV).
