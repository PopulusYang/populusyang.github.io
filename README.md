# 食堂菜品评分榜后端 (GitHub.io)

这是一个基于 GitHub Pages 和 SQLite (通过 sql.js) 的简单"后端"方案。

由于 GitHub Pages 是静态托管服务，无法运行传统的后端数据库（如 MySQL 或动态 SQLite）。本项目的原理是：

1. 在本地使用 Python 脚本生成 SQLite 数据库文件 (`menu.db`)。
2. 将 `menu.db` 上传到 GitHub 仓库。
3. 网页端通过 `sql.js` (WebAssembly) 下载并读取数据库文件，在浏览器中进行查询和展示。

## 如何使用

### 1. 初始化数据库

### 1. 启动图形管理界面 (GUI)

最推荐的使用方式，无需记忆命令。直接运行脚本即可：

```bash
python manage_db.py
# 或显式启动
python manage_db.py gui
```

### 2. 命令行操作

如果在不支持 GUI 的服务器环境，请使用以下命令。

#### 初始化/升级数据库

首次使用或架构变更（如添加新列）时运行：

```bash
python manage_db.py init
```

#### 添加菜品

支持添加供应时段、公众号链接和运营状态：

```bash
# 完整参数示例
python manage_db.py add "广东肠粉" "三食堂" 4.2 --meal "早餐" --link "http://example.com"

# 标记为已停业
python manage_db.py add "旧窗口面条" "二食堂" 3.5 --closed
```

参数说明：

* `--meal`: 供应时段，默认为"午餐,晚餐"。可以填"早餐"、"夜宵"等。
* `--link`: 档口或菜品的公众号/详情链接。
* `--closed`: 如果加上这个参数，该菜品会显示为"停业"。

### 3. 查看当前数据

在本地查看数据库内容：

```bash
python manage_db.py list
```

### 4. 删除菜品

如果不小心加错了，可以通过 ID 删除菜品：

```bash
# 首先用 list 命令查看 ID
python manage_db.py list

# 然后删除指定 ID 的菜品
# 格式: python manage_db.py delete <ID>
python manage_db.py delete 1
```

### 5. 发布到网站

每次修改数据（添加、删除菜品）后，你需要将 `menu.db` 提交并推送到 GitHub：

```bash
git add menu.db
git commit -m "更新菜单数据"
git push
```

## 文件说明

* `index.html`: 顶层入口页（猎人小屋），提供模块跳转。
* `reviewed.html`: 已评测页面，负责加载和显示菜品评分数据（含搜索/排序）。
* `dice.html`: 今天吃什么页面，按当前时段随机抽取数据库菜品。
* `manage_db.py`: 管理脚本，用于本地生成和修改 `menu.db`。
* `menu.db`: SQLite 数据库文件（由脚本生成）。
