"""Run a multi-statement SQL file against a named connections.toml entry.

usage: python3 scripts/run_sql.py <file.sql> [connection_name]
"""
import io
import pathlib
import sys
import tomllib

import snowflake.connector
from snowflake.connector.util_text import split_statements


def connect(name="dfreriksdemo"):
    cfg = tomllib.loads((pathlib.Path.home() / ".snowflake/connections.toml").read_text())[name]
    if "private_key_path" in cfg:
        cfg["private_key_file"] = cfg.pop("private_key_path")
    cfg.setdefault("warehouse", "LOAD_WH")
    return snowflake.connector.connect(**cfg, client_store_temporary_credential=False)


def run_file(path, conn_name="dfreriksdemo"):
    con = connect(conn_name)
    cur = con.cursor()
    text = pathlib.Path(path).read_text()
    for stmt, _ in split_statements(io.StringIO(text), remove_comments=True):
        head = " ".join(stmt.split())[:80]
        try:
            cur.execute(stmt)
            row = cur.fetchone()
            print(f"OK   {head}  ->  {str(row[0])[:60] if row else ''}")
        except Exception as e:  # noqa: BLE001
            print(f"FAIL {head}\n     {str(e).splitlines()[-1] if str(e) else e}")
            sys.exit(1)


if __name__ == "__main__":
    run_file(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "dfreriksdemo")
