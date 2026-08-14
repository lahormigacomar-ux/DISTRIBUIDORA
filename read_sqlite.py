import os
import sqlite3
import json

db_file = 'C:\\Users\\Martin\\.gemini\\antigravity\\conversations\\182bbeda-046b-48bd-b7b3-552a48fbeb3f.db'

def check():
    if not os.path.exists(db_file):
        print("Database file not found")
        return

    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [t[0] for t in cursor.fetchall()]
        print("Tables:", tables)
        
        for table in tables:
            print(f"\nTable {table} sample (first 2 rows):")
            cursor.execute(f"SELECT * FROM {table} LIMIT 2")
            rows = cursor.fetchall()
            for r in rows:
                print(r)
    except Exception as e:
        print("Error:", e)
    finally:
        conn.close()

check()
