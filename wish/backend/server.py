import os
import sqlite3
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
DB_PATH = os.environ.get(
    "DB_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "wishes.db"),
)


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS wishes (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                name          TEXT NOT NULL,
                canteen       TEXT NOT NULL,
                location      TEXT DEFAULT '',
                price         TEXT DEFAULT '',
                submitter     TEXT NOT NULL,
                status        TEXT DEFAULT '待评测',
                official_link TEXT DEFAULT '',
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)


def wish_to_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "canteen": row["canteen"],
        "location": row["location"],
        "price": row["price"],
        "submitter": row["submitter"],
        "status": row["status"],
        "official_link": row["official_link"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def check_admin(data):
    return data and data.get("password") == ADMIN_PASSWORD


@app.route("/api/wishes", methods=["POST"])
def create_wish():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"success": False, "message": "请求数据不能为空"}), 400

    name = (data.get("name") or "").strip()
    canteen = (data.get("canteen") or "").strip()
    submitter = (data.get("submitter") or "").strip()

    if not name:
        return jsonify({"success": False, "message": "菜品名不能为空"}), 400
    if not canteen:
        return jsonify({"success": False, "message": "食堂不能为空"}), 400
    if not submitter:
        return jsonify({"success": False, "message": "昵称不能为空"}), 400

    location = (data.get("location") or "").strip()
    price = (data.get("price") or "").strip()

    with get_db() as conn:
        conn.execute(
            "INSERT INTO wishes (name, canteen, location, price, submitter) VALUES (?, ?, ?, ?, ?)",
            (name, canteen, location, price, submitter),
        )
        wish_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    return jsonify({"success": True, "id": wish_id, "message": "许愿成功！等待管理员审核"}), 201


@app.route("/api/auth", methods=["POST"])
def verify_password():
    data = request.get_json(silent=True)
    if check_admin(data):
        return jsonify({"success": True, "message": "验证通过"})
    return jsonify({"success": False, "message": "密码错误"}), 403


@app.route("/api/wishes", methods=["GET"])
def list_wishes():
    submitter = request.args.get("submitter", "").strip()

    with get_db() as conn:
        if submitter:
            rows = conn.execute(
                "SELECT * FROM wishes WHERE submitter = ? ORDER BY created_at DESC",
                (submitter,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM wishes ORDER BY created_at DESC"
            ).fetchall()

    return jsonify({"success": True, "wishes": [wish_to_dict(r) for r in rows]})


@app.route("/api/wishes/<int:wish_id>", methods=["PUT"])
def update_wish(wish_id):
    data = request.get_json(silent=True)
    if not check_admin(data):
        return jsonify({"success": False, "message": "密码错误"}), 403

    new_status = (data.get("status") or "").strip()
    valid_statuses = {"待评测", "正在评测", "已评测", "已有重复"}
    if new_status and new_status not in valid_statuses:
        return jsonify({"success": False, "message": f"无效状态，可选: {', '.join(valid_statuses)}"}), 400

    official_link = (data.get("official_link") or "").strip()

    if new_status in ("已评测", "已有重复") and not official_link:
        return jsonify({"success": False, "message": "转为「已评测」或「已有重复」状态时必须提供公众号链接"}), 400

    with get_db() as conn:
        existing = conn.execute("SELECT * FROM wishes WHERE id = ?", (wish_id,)).fetchone()
        if not existing:
            return jsonify({"success": False, "message": "许愿不存在"}), 404

        updates = []
        params = []
        if new_status:
            updates.append("status = ?")
            params.append(new_status)
        if official_link:
            updates.append("official_link = ?")
            params.append(official_link)

        if updates:
            updates.append("updated_at = ?")
            params.append(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            params.append(wish_id)
            conn.execute(
                f"UPDATE wishes SET {', '.join(updates)} WHERE id = ?", params
            )

    return jsonify({"success": True, "message": "更新成功"})


@app.route("/api/wishes/<int:wish_id>", methods=["DELETE"])
def delete_wish(wish_id):
    data = request.get_json(silent=True)
    if not check_admin(data):
        return jsonify({"success": False, "message": "密码错误"}), 403

    with get_db() as conn:
        existing = conn.execute("SELECT * FROM wishes WHERE id = ?", (wish_id,)).fetchone()
        if not existing:
            return jsonify({"success": False, "message": "许愿不存在"}), 404
        conn.execute("DELETE FROM wishes WHERE id = ?", (wish_id,))

    return jsonify({"success": True, "message": "删除成功"})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=False)
