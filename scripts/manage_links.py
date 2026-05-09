import argparse
import json
import os
import sys
from copy import deepcopy

LINKS_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "links.json")


def load_links(file_path=LINKS_FILE):
    if not os.path.exists(file_path):
        return []

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("links.json 须为数组格式")

    normalized = []
    for item in data:
        if not isinstance(item, dict):
            continue

        name = str(item.get("name", "")).strip()
        link = str(item.get("link", item.get("url", ""))).strip()
        icon_path = str(item.get("icon_path", "")).strip()

        normalized.append(
            {
                "name": name,
                "link": link,
                "icon_path": icon_path,
            }
        )

    return normalized


def save_links(links, file_path=LINKS_FILE):
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(links, f, ensure_ascii=False, indent=2)
        f.write("\n")


def require_index(raw_index, links):
    index = int(raw_index)
    if index < 1 or index > len(links):
        raise IndexError(f"序号超出范围: {index}")
    return index - 1


def print_links(links):
    if not links:
        print("友情链接为空。")
        return

    for idx, item in enumerate(links, start=1):
        icon_path = item.get("icon_path", "") or "-"
        print(f"{idx}. {item.get('name', '')} | {item.get('link', '')} | {icon_path}")


def add_link(links, name, link, icon_path=""):
    name = str(name).strip()
    link = str(link).strip()
    icon_path = str(icon_path).strip()

    if not name:
        raise ValueError("name 不能为空")
    if not link:
        raise ValueError("link 不能为空")

    links.append({"name": name, "link": link, "icon_path": icon_path})


def update_link(links, index, name=None, link=None, icon_path=None):
    item = links[index]

    if name is not None:
        name = str(name).strip()
        if not name:
            raise ValueError("name 不能为空")
        item["name"] = name

    if link is not None:
        link = str(link).strip()
        if not link:
            raise ValueError("link 不能为空")
        item["link"] = link

    if icon_path is not None:
        item["icon_path"] = str(icon_path).strip()


def delete_link(links, index):
    del links[index]


def move_link(links, source_index, target_index):
    item = links.pop(source_index)
    links.insert(target_index, item)


def build_parser():
    parser = argparse.ArgumentParser(description="管理友情链接 JSON")
    parser.add_argument("--file", default=LINKS_FILE, help="友情链接 JSON 文件路径")

    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    subparsers.add_parser("list", help="列出所有友情链接")

    add_parser = subparsers.add_parser("add", help="添加友情链接")
    add_parser.add_argument("name", help="网站名称")
    add_parser.add_argument("link", help="网站链接")
    add_parser.add_argument("--icon-path", default="", help="站点图标路径")

    upd_parser = subparsers.add_parser("update", help="更新友情链接")
    upd_parser.add_argument("index", type=int, help="要更新的序号（从 1 开始）")
    upd_parser.add_argument("--name", help="网站名称")
    upd_parser.add_argument("--link", help="网站链接")
    upd_parser.add_argument("--icon-path", help="站点图标路径")

    del_parser = subparsers.add_parser("delete", help="删除友情链接")
    del_parser.add_argument("index", type=int, help="要删除的序号（从 1 开始）")

    move_parser = subparsers.add_parser("move", help="调整友情链接顺序")
    move_parser.add_argument("source", type=int, help="源序号（从 1 开始）")
    move_parser.add_argument("target", type=int, help="目标序号（从 1 开始）")

    subparsers.add_parser("init", help="初始化空的友情链接文件")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    file_path = args.file

    if args.command == "init":
        if os.path.exists(file_path):
            print(f"文件已存在: {file_path}")
            return
        save_links([], file_path)
        print(f"已创建空友情链接文件: {file_path}")
        return

    links = load_links(file_path)

    try:
        if args.command == "list":
            print_links(links)
        elif args.command == "add":
            add_link(links, args.name, args.link, args.icon_path)
            save_links(links, file_path)
            print(f"已添加友情链接: {args.name}")
        elif args.command == "update":
            index = require_index(args.index, links)
            update_link(links, index, args.name, args.link, args.icon_path)
            save_links(links, file_path)
            print(f"已更新友情链接 #{args.index}")
        elif args.command == "delete":
            index = require_index(args.index, links)
            deleted = deepcopy(links[index])
            delete_link(links, index)
            save_links(links, file_path)
            print(f"已删除友情链接: {deleted.get('name', '')}")
        elif args.command == "move":
            source_index = require_index(args.source, links)
            target_index = require_index(args.target, links)
            move_link(links, source_index, target_index)
            save_links(links, file_path)
            print(f"已调整顺序: {args.source} -> {args.target}")
        else:
            parser.print_help()
    except FileNotFoundError:
        print(f"文件不存在: {file_path}")
        sys.exit(1)
    except (ValueError, IndexError, json.JSONDecodeError) as exc:
        print(f"操作失败: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
