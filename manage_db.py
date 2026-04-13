import sqlite3
import argparse
import os
import sys
import csv


DB_FILE = "menu.db"


def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # 基础表结构
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS dishes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            canteen TEXT NOT NULL,
            rating REAL
        )
    """
    )

    # 检查并添加新列 (Schema Migration)
    cursor.execute("PRAGMA table_info(dishes)")
    columns = [row[1] for row in cursor.fetchall()]

    if "meal_type" not in columns:
        print("Migrating: Adding 'meal_type' column...")
        cursor.execute(
            "ALTER TABLE dishes ADD COLUMN meal_type TEXT DEFAULT '午餐;晚餐'"
        )

    if "official_link" not in columns:
        print("Migrating: Adding 'official_link' column...")
        cursor.execute("ALTER TABLE dishes ADD COLUMN official_link TEXT DEFAULT ''")

    if "is_active" not in columns:
        print("Migrating: Adding 'is_active' column...")
        cursor.execute("ALTER TABLE dishes ADD COLUMN is_active INTEGER DEFAULT 1")

    conn.commit()
    conn.close()


def db_add_dish(name, canteen, rating, meal_type, official_link, is_active):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO dishes (name, canteen, rating, meal_type, official_link, is_active) VALUES (?, ?, ?, ?, ?, ?)",
        (name, canteen, rating, meal_type, official_link, 1 if is_active else 0),
    )
    conn.commit()
    conn.close()


def db_add_dishes_batch(records):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.executemany(
        "INSERT INTO dishes (name, canteen, rating, meal_type, official_link, is_active) VALUES (?, ?, ?, ?, ?, ?)",
        records,
    )
    conn.commit()
    count = cursor.rowcount
    conn.close()
    return count


def _parse_bool(v, default=True):
    if v is None:
        return default
    s = str(v).strip().lower()
    if s == "":
        return default
    if s in {"1", "true", "yes", "y", "on", "营业"}:
        return True
    if s in {"0", "false", "no", "n", "off", "停业"}:
        return False
    raise ValueError(f"无法识别布尔值: {v}")


def batch_add_from_csv(
    csv_file,
    default_meal="午餐;晚餐",
    default_link="",
    default_active=True,
    strict=False,
):
    if not os.path.exists(csv_file):
        print(f"文件不存在: {csv_file}")
        return

    imported_records = []
    failed_rows = []

    with open(csv_file, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            print("CSV 为空或缺少表头")
            return

        required = {"name", "canteen", "rating"}
        if not required.issubset(set(reader.fieldnames)):
            print("CSV 缺少必填列：name,canteen,rating")
            print(f"当前表头: {','.join(reader.fieldnames)}")
            return

        for line_no, row in enumerate(reader, start=2):
            try:
                name = str(row.get("name", "")).strip()
                canteen = str(row.get("canteen", "")).strip()
                rating_raw = row.get("rating", "")

                if not name or not canteen:
                    raise ValueError("name/canteen 不能为空")

                rating = float(rating_raw)
                if rating < 0 or rating > 5:
                    raise ValueError("rating 必须在 0-5 之间")

                meal = str(row.get("meal_type") or row.get("meal") or default_meal).strip()
                link = str(
                    row.get("official_link") or row.get("link") or default_link
                ).strip()
                active = _parse_bool(
                    row.get("is_active") if "is_active" in row else row.get("active"),
                    default=default_active,
                )

                imported_records.append(
                    (name, canteen, rating, meal, link, 1 if active else 0)
                )
            except Exception as e:
                failed_rows.append((line_no, str(e)))
                if strict:
                    break

    if not imported_records:
        print("没有可导入的数据。")
        if failed_rows:
            print("失败明细:")
            for line_no, err in failed_rows:
                print(f"  行 {line_no}: {err}")
        return

    inserted_count = db_add_dishes_batch(imported_records)
    print(f"批量导入完成：成功 {inserted_count} 条")

    if failed_rows:
        print(f"失败 {len(failed_rows)} 条")
        for line_no, err in failed_rows:
            print(f"  行 {line_no}: {err}")

    print("CSV 字段说明: name,canteen,rating,meal_type,official_link,is_active")


def db_update_dish(dish_id, name, canteen, rating, meal_type, official_link, is_active):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE dishes
        SET name=?, canteen=?, rating=?, meal_type=?, official_link=?, is_active=?
        WHERE id=?
        """,
        (
            name,
            canteen,
            rating,
            meal_type,
            official_link,
            1 if is_active else 0,
            dish_id,
        ),
    )
    conn.commit()
    count = cursor.rowcount
    conn.close()
    return count > 0


def add_dish(name, canteen, rating, meal_type, official_link, is_active):
    db_add_dish(name, canteen, rating, meal_type, official_link, is_active)
    print(
        f"成功添加: {name} ({canteen}) - {rating}分 [状态: {'营业' if is_active else '停业'}]"
    )


def get_dish_by_id(dish_id):
    if not os.path.exists(DB_FILE):
        return None
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM dishes WHERE id = ?", (dish_id,))
    row = cursor.fetchone()
    conn.close()
    return row


def get_all_dishes():
    if not os.path.exists(DB_FILE):
        return []

    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM dishes ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return rows


def list_dishes():
    rows = get_all_dishes()
    if not rows:
        print("数据库为空或不存在。")
        return

    print(
        f"{'ID':<5} {'菜名':<15} {'食堂':<10} {'评分':<5} {'时段':<10} {'状态':<5} {'链接'}"
    )
    print("-" * 80)
    for row in rows:
        try:
            meal = row["meal_type"] if "meal_type" in row.keys() else "N/A"
            link = row["official_link"] if "official_link" in row.keys() else ""
            active = row["is_active"] if "is_active" in row.keys() else 1
        except:
            meal = "午餐;晚餐"
            link = ""
            active = 1

        status = "营业" if active else "停业"
        print(
            f"{row['id']:<5} {row['name']:<15} {row['canteen']:<10} {row['rating']:<5} {meal:<10} {status:<5} {link}"
        )


def db_delete_dish(dish_id):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM dishes WHERE id = ?", (dish_id,))
    count = cursor.rowcount
    conn.commit()
    conn.close()
    return count > 0


def delete_dish(dish_id):
    if db_delete_dish(dish_id):
        print(f"成功删除 ID 为 {dish_id} 的菜品")
    else:
        print(f"未找到 ID 为 {dish_id} 的菜品")


def run_gui():
    try:
        import tkinter as tk
        from tkinter import ttk, messagebox
    except ImportError:
        print("错误: 您的 Python 环境没有安装 tkinter，无法运行 GUI。")
        return

    if not os.path.exists(DB_FILE):
        init_db()

    root = tk.Tk()
    root.title("食堂菜品管理系统")
    root.geometry("1000x600")

    # Frame for Input
    input_frame = ttk.LabelFrame(root, text="添加新菜品", padding="10")
    input_frame.pack(fill="x", padx=10, pady=5)

    # Variables
    name_var = tk.StringVar()
    canteen_var = tk.StringVar()
    rating_var = tk.DoubleVar(value=4.0)
    meal_var = tk.StringVar(value="午餐;晚餐")
    link_var = tk.StringVar()
    is_active_var = tk.BooleanVar(value=True)
    current_edit_id = None

    # Input Fields
    grid_opts = {"padx": 5, "pady": 5, "sticky": "w"}

    ttk.Label(input_frame, text="菜品名称:").grid(row=0, column=0, **grid_opts)
    ttk.Entry(input_frame, textvariable=name_var).grid(row=0, column=1, **grid_opts)

    ttk.Label(input_frame, text="食堂:").grid(row=0, column=2, **grid_opts)
    ttk.Combobox(
        input_frame,
        textvariable=canteen_var,
        values=["一食堂", "二食堂", "小西门"],
    ).grid(row=0, column=3, **grid_opts)

    ttk.Label(input_frame, text="评分 (0-5):").grid(row=0, column=4, **grid_opts)
    ttk.Spinbox(
        input_frame, from_=0, to=5, increment=0.1, textvariable=rating_var, width=5
    ).grid(row=0, column=5, **grid_opts)

    ttk.Label(input_frame, text="供应时段:").grid(row=1, column=0, **grid_opts)
    ttk.Entry(input_frame, textvariable=meal_var).grid(row=1, column=1, **grid_opts)

    ttk.Label(input_frame, text="公众号链接:").grid(row=1, column=2, **grid_opts)
    ttk.Entry(input_frame, textvariable=link_var, width=30).grid(
        row=1, column=3, columnspan=3, **grid_opts
    )

    ttk.Checkbutton(input_frame, text="营业中", variable=is_active_var).grid(
        row=0, column=6, **grid_opts
    )

    # Functions for GUI
    def refresh_list():
        for item in tree.get_children():
            tree.delete(item)

        for row in get_all_dishes():
            status = "营业" if row["is_active"] else "停业"
            tree.insert(
                "",
                "end",
                values=(
                    row["id"],
                    row["name"],
                    row["canteen"],
                    row["rating"],
                    row["meal_type"],
                    status,
                    row["official_link"],
                ),
            )

    def gui_save_or_update():
        name = name_var.get().strip()
        canteen = canteen_var.get().strip()
        if not name or not canteen:
            messagebox.showwarning("提示", "菜名和食堂不能为空")
            return

        try:
            if current_edit_id:
                # Update existing
                if db_update_dish(
                    current_edit_id,
                    name,
                    canteen,
                    rating_var.get(),
                    meal_var.get(),
                    link_var.get(),
                    is_active_var.get(),
                ):
                    messagebox.showinfo("成功", "更新成功")
                    # Clear edit mode
                    gui_clear()
                else:
                    messagebox.showerror("错误", "更新失败，ID可能不存在")
            else:
                # Add new
                db_add_dish(
                    name,
                    canteen,
                    rating_var.get(),
                    meal_var.get(),
                    link_var.get(),
                    is_active_var.get(),
                )
                messagebox.showinfo("成功", "添加成功")
                # Clear inputs
                name_var.set("")
                link_var.set("")

            refresh_list()
        except Exception as e:
            messagebox.showerror("错误", str(e))

    def gui_edit_selected():
        nonlocal current_edit_id
        selected = tree.selection()
        if not selected:
            messagebox.showwarning("提示", "请先选择一行进行编辑")
            return

        item = tree.item(selected[0])
        values = item["values"]
        # values: [id, name, canteen, rating, meal, status, link]

        current_edit_id = values[0]
        name_var.set(values[1])
        canteen_var.set(values[2])
        rating_var.set(float(values[3]))
        meal_var.set(values[4])
        is_active_var.set(True if values[5] == "营业" else False)
        link_var.set(values[6] if values[6] != "" else "")

        input_frame.config(text=f"修改菜品 (ID: {current_edit_id})")
        btn_action.config(text="保存修改")
        btn_cancel.grid(row=1, column=7, padx=5)

    def gui_clear():
        nonlocal current_edit_id
        current_edit_id = None
        name_var.set("")
        canteen_var.set("")
        rating_var.set(4.0)
        meal_var.set("午餐;晚餐")
        link_var.set("")
        is_active_var.set(True)

        input_frame.config(text="添加新菜品")
        btn_action.config(text="添加")
        btn_cancel.grid_remove()

    def gui_delete():
        selected = tree.selection()
        if not selected:
            messagebox.showwarning("提示", "请先选择一行")
            return

        item = tree.item(selected[0])
        dish_id = item["values"][0]  # Correctly get ID from selection

        if messagebox.askyesno("确认", f"确定删除菜品 ID {dish_id} 吗？"):
            if db_delete_dish(dish_id):
                tree.delete(selected[0])
                if current_edit_id == dish_id:  # If deleting currently edited item
                    gui_clear()
            else:
                messagebox.showerror("错误", "删除失败")

    btn_action = ttk.Button(input_frame, text="添加", command=gui_save_or_update)
    btn_action.grid(row=1, column=6, padx=5)

    btn_cancel = ttk.Button(input_frame, text="取消", command=gui_clear)
    # Initially hidden, will be shown when editing
    # btn_cancel.grid(row=1, column=7, padx=5) is dynamic

    # Frame for List
    list_frame = ttk.Frame(root, padding="10")
    list_frame.pack(fill="both", expand=True)

    columns = ("id", "name", "canteen", "rating", "meal", "status", "link")
    tree = ttk.Treeview(list_frame, columns=columns, show="headings")

    # Binding double click to edit
    tree.bind("<Double-1>", lambda event: gui_edit_selected())

    tree.heading("id", text="ID")
    tree.column("id", width=50)
    tree.heading("name", text="菜名")
    tree.column("name", width=150)
    tree.heading("canteen", text="食堂")
    tree.column("canteen", width=100)
    tree.heading("rating", text="评分")
    tree.column("rating", width=60)
    tree.heading("meal", text="时段")
    tree.column("meal", width=100)
    tree.heading("status", text="状态")
    tree.column("status", width=60)
    tree.heading("link", text="链接")
    tree.column("link", width=200)

    # Scrollbar
    scrollbar = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=tree.yview)
    tree.configure(yscrollcommand=scrollbar.set)

    tree.pack(side="left", fill="both", expand=True)
    scrollbar.pack(side="right", fill="y")

    # Toolbar
    toolbar = ttk.Frame(root, padding="5")
    toolbar.pack(fill="x")
    ttk.Button(toolbar, text="修改选中", command=gui_edit_selected).pack(
        side="right", padx=10
    )
    ttk.Button(toolbar, text="删除选中", command=gui_delete).pack(side="right", padx=10)
    ttk.Button(toolbar, text="刷新列表", command=refresh_list).pack(
        side="right", padx=10
    )

    refresh_list()
    root.mainloop()


def main():
    parser = argparse.ArgumentParser(description="管理食堂菜品数据库")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # init 命令
    subparsers.add_parser("init", help="初始化数据库并跟新表结构")

    # list 命令
    subparsers.add_parser("list", help="列出所有菜品")

    # gui 命令
    subparsers.add_parser("gui", help="启动图形化管理界面")

    # add 命令
    add_parser = subparsers.add_parser("add", help="添加新菜品")
    add_parser.add_argument("name", help="菜品名称")
    add_parser.add_argument("canteen", help="食堂名称")
    add_parser.add_argument("rating", type=float, help="评分 (0-5)")
    add_parser.add_argument(
        "--meal", default="午餐;晚餐", help="供应时段 (默认: 午餐;晚餐)"
    )
    add_parser.add_argument("--link", default="", help="公众号链接")
    add_parser.add_argument(
        "--closed", action="store_true", help="标记为停业 (默认: 营业)"
    )

    # batch-add 命令
    batch_parser = subparsers.add_parser("batch-add", help="从 CSV 批量添加菜品")
    batch_parser.add_argument("file", help="CSV 文件路径")
    batch_parser.add_argument(
        "--meal", default="午餐;晚餐", help="缺省供应时段 (默认: 午餐;晚餐)"
    )
    batch_parser.add_argument("--link", default="", help="缺省公众号链接")
    batch_parser.add_argument(
        "--closed", action="store_true", help="缺省标记为停业 (默认: 营业)"
    )
    batch_parser.add_argument(
        "--strict", action="store_true", help="遇到首条错误即停止导入"
    )

    # delete 命令
    del_parser = subparsers.add_parser("delete", help="删除菜品")
    del_parser.add_argument("id", type=int, help="要删除的菜品ID")

    # update 命令
    upd_parser = subparsers.add_parser("update", help="更新菜品信息")
    upd_parser.add_argument("id", type=int, help="菜品ID")
    upd_parser.add_argument("--name", help="菜品名称")
    upd_parser.add_argument("--canteen", help="食堂名称")
    upd_parser.add_argument("--rating", type=float, help="评分 (0-5)")
    upd_parser.add_argument("--meal", help="供应时段")
    upd_parser.add_argument("--link", help="公众号链接")
    upd_parser.add_argument(
        "--active", type=int, choices=[0, 1], help="状态 (1:营业, 0:停业)"
    )

    if len(sys.argv) == 1:
        # 默认无参数时启动 GUI
        run_gui()
        return

    args = parser.parse_args()

    if args.command == "init":
        init_db()
        print("数据库初始化/更新完成。")
    elif args.command == "add":
        add_dish(
            args.name, args.canteen, args.rating, args.meal, args.link, not args.closed
        )
    elif args.command == "batch-add":
        batch_add_from_csv(
            args.file,
            default_meal=args.meal,
            default_link=args.link,
            default_active=not args.closed,
            strict=args.strict,
        )
    elif args.command == "list":
        list_dishes()
    elif args.command == "delete":
        delete_dish(args.id)
    elif args.command == "update":
        row = get_dish_by_id(args.id)
        if not row:
            print(f"未找到 ID 为 {args.id} 的菜品")
        else:
            name = args.name if args.name is not None else row["name"]
            canteen = args.canteen if args.canteen is not None else row["canteen"]
            rating = args.rating if args.rating is not None else row["rating"]
            meal = args.meal if args.meal is not None else row["meal_type"]
            link = args.link if args.link is not None else row["official_link"]
            is_active = args.active if args.active is not None else row["is_active"]

            db_update_dish(args.id, name, canteen, rating, meal, link, is_active)
            print(f"成功更新 ID {args.id}")
    elif args.command == "gui":
        run_gui()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
