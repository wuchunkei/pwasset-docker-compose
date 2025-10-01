import pymongo
from datetime import datetime, timedelta

# Database connection details (same as app.py)
MONGO_URI = "mongodb://094510.xyz:8827/"
DATABASE_NAME = "pwasset"

FIELDS_TO_UNSET = {
    'From': "",
    'To': "",
    'New Asset Code': "",
    'receiver': ""
}

def main():
    client = pymongo.MongoClient(MONGO_URI)
    db = client[DATABASE_NAME]
    col = db.asset_list
    try:
        # Remove legacy fields across all documents
        res_unset = col.update_many({}, {"$unset": FIELDS_TO_UNSET})
        print(f"Unset matched: {res_unset.matched_count}, modified: {res_unset.modified_count}")

        # Optional: ensure newly added items set 'When' (kept for safety if missing)
        now_gmt8 = datetime.utcnow() + timedelta(hours=8)
        res_set_when = col.update_many({"When": {"$exists": False}}, {"$set": {"When": now_gmt8}})
        print(f"Backfilled 'When' for docs missing it. modified: {res_set_when.modified_count}")
    except Exception as e:
        print(f"Error during cleanup: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    main()